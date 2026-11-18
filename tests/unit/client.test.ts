import { describe, expect, it } from 'vitest';
import { detectDevice } from '../../src/lib/device';
import { isAutoAcceptable, parseWire, safeFileName } from '../../src/lib/wire';
import { formatBytes, linkify } from '../../src/ui/actions';

describe('data channel messages', () => {
  it('accepts well-formed messages and cleans file names', () => {
    const offer = parseWire(JSON.stringify({ t: 'offer', id: 'x', files: [{ name: '../../etc/passwd', size: 5, type: 'text/plain' }], auto: false }));
    expect(offer).toEqual({ t: 'offer', id: 'x', files: [{ name: 'passwd', size: 5, type: 'text/plain' }], auto: false });
    expect(parseWire(JSON.stringify({ t: 'text', id: 'a', text: 'hi' }))).toEqual({ t: 'text', id: 'a', text: 'hi' });
  });

  it('rejects malformed messages', () => {
    expect(parseWire('not json')).toBeNull();
    expect(parseWire(JSON.stringify({ t: 'offer', id: 'x', files: [] }))).toBeNull();
    expect(parseWire(JSON.stringify({ t: 'offer', id: 'x', files: [{ name: 'a', size: -1 }] }))).toBeNull();
    expect(parseWire(JSON.stringify({ t: 'file', id: 'x', index: 1.5 }))).toBeNull();
    expect(parseWire(JSON.stringify({ t: 'nope', id: 'x' }))).toBeNull();
  });

  it('only skips the question for one small pasted image', () => {
    const img = { name: 'a.png', size: 1000, type: 'image/png' };
    expect(isAutoAcceptable([img], true)).toBe(true);
    expect(isAutoAcceptable([img], false)).toBe(false);
    expect(isAutoAcceptable([img, img], true)).toBe(false);
    expect(isAutoAcceptable([{ ...img, type: 'application/pdf' }], true)).toBe(false);
    expect(isAutoAcceptable([{ ...img, size: 30 * 1024 * 1024 }], true)).toBe(false);
  });

  it('makes safe file names', () => {
    expect(safeFileName('C:\\Users\\me\\photo.jpg')).toBe('photo.jpg');
    expect(safeFileName('..')).toBe('file');
    expect(safeFileName('a<b>:c?.txt')).toBe('abc.txt');
  });
});

describe('helpers', () => {
  it('finds links in text', () => {
    expect(linkify('see https://example.com/a?b=1. ok')).toEqual([
      { text: 'see ' },
      { text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
      { text: '. ok' },
    ]);
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(4.2 * 1024 * 1024)).toBe('4.2 MB');
    expect(formatBytes(236 * 1024 * 1024)).toBe('236 MB');
  });

  it('recognises iPhone and Windows', () => {
    expect(
      detectDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1', maxTouchPoints: 5 }),
    ).toEqual({ kind: 'phone', os: 'iPhone', browser: 'Safari' });
    expect(
      detectDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0 Safari/537.36 Edg/142.0', maxTouchPoints: 0 }),
    ).toEqual({ kind: 'desktop', os: 'Windows', browser: 'Edge' });
    expect(
      detectDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15', maxTouchPoints: 5 }).os,
    ).toBe('iPad');
  });
});
