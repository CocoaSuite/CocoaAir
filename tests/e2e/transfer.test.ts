import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, devices, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../server/app';
import { loadConfig } from '../../server/config';

let browser: Browser;
let base = '';
let close: () => Promise<void>;

beforeAll(async () => {
  const { app } = await buildApp(loadConfig({ STATIC_DIR: resolve('dist'), STUN_URLS: '' }), { logger: false });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  close = () => app.close();
  browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
});

afterAll(async () => {
  await browser?.close();
  await close?.();
});

async function open(name: string, opts: Parameters<Browser['newContext']>[0] = {}): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...opts, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript((n) => localStorage.setItem('ca-name', n), name);
  const page = await ctx.newPage();
  await page.goto(base);
  return { ctx, page };
}

describe('CocoaAir in two browsers', () => {
  it('finds nearby devices, sends text, a pasted image and files, and joins rooms', async () => {
    const a = await open('Amber Falcon');
    const b = await open('Quiet Heron', { ...devices['iPhone 13'] });

    // Both appear to each other.
    await expect.poll(() => a.page.getByText('Quiet Heron').count()).toBeGreaterThan(0);
    await expect.poll(() => b.page.getByText('Amber Falcon').count()).toBeGreaterThan(0);

    // Text from the desktop to the phone.
    await a.page.getByRole('button', { name: 'Send text to Quiet Heron' }).click();
    await a.page.getByLabel('Send text to Quiet Heron').fill('Hello from the PC https://example.com');
    await a.page.keyboard.press('Enter');
    await expect.poll(() => b.page.getByText('Amber Falcon sent you text').count(), { timeout: 20_000 }).toBe(1);
    await b.page.getByRole('button', { name: 'Open' }).click();
    await expect.poll(() => b.page.getByText('Hello from the PC').count()).toBe(1);
    expect(await b.page.getByRole('link', { name: 'https://example.com' }).count()).toBe(1);

    // A pasted image arrives without asking and can be copied.
    await a.page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 40;
      canvas.height = 30;
      const g = canvas.getContext('2d')!;
      g.fillStyle = '#2563eb';
      g.fillRect(0, 0, 40, 30);
      const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), 'image/png'));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'pasted.png', { type: 'image/png' }));
      document.querySelector('textarea')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect.poll(() => b.page.getByAltText('pasted.png').count(), { timeout: 20_000 }).toBe(1);
    await b.page.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect.poll(() => b.page.getByText('Image copied').count()).toBe(1);

    // Files from the phone to the desktop: the desktop asks first.
    await b.page.getByRole('button', { name: 'Send files' }).click();
    const payload = Buffer.alloc(3 * 1024 * 1024 + 123, 7);
    payload.write('CocoaAir', 0);
    await b.page.locator('input[type=file]:not([accept])').setInputFiles([
      { name: 'big.bin', mimeType: 'application/octet-stream', buffer: payload },
      { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('second file') },
    ]);
    await expect.poll(() => a.page.getByText('Quiet Heron wants to send you 2 files').count(), { timeout: 20_000 }).toBe(1);
    await a.page.getByRole('button', { name: 'Accept' }).click();
    await expect.poll(() => a.page.getByText('Received from Quiet Heron').count(), { timeout: 30_000 }).toBe(1);
    await expect.poll(() => b.page.getByText('Sent to Amber Falcon').count(), { timeout: 30_000 }).toBe(1);

    await a.page.getByRole('button', { name: 'View files' }).click();
    const download = a.page.waitForEvent('download');
    await a.page.getByRole('button', { name: 'Save big.bin' }).click();
    const file = await (await download).path();
    const got = await readFile(file!);
    expect(got.length).toBe(payload.length);
    expect(got.equals(payload)).toBe(true);

    // Room codes.
    await a.page.getByRole('button', { name: 'Back to devices' }).click();
    await a.page.getByRole('tab', { name: /Room code/ }).click();
    await a.page.getByRole('button', { name: 'Create a room code' }).click();
    const code = (await a.page.locator('.room-code').textContent())!;
    expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);

    await b.page.getByRole('button', { name: 'Back to devices' }).click();
    await b.page.getByRole('tab', { name: /Room code/ }).click();
    await b.page.locator('#room-code').fill(code.toLowerCase());
    await b.page.getByRole('button', { name: 'Join room' }).click();
    await expect.poll(() => a.page.getByText('1 device in this room').count(), { timeout: 10_000 }).toBe(1);

    // Theme switch flips and remembers.
    const before = await a.page.evaluate(() => document.documentElement.classList.contains('light'));
    await a.page.getByRole('button', { name: /Switch to (light|dark) theme/ }).first().click();
    expect(await a.page.evaluate(() => document.documentElement.classList.contains('light'))).toBe(!before);
    expect(await a.page.evaluate(() => localStorage.getItem('ca-theme'))).toBe(before ? 'dark' : 'light');

    await a.ctx.close();
    await b.ctx.close();
  });
});
