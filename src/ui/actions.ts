/** Clipboard, saving and sharing, with the fallbacks each browser needs. */

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

/**
 * Copies an image so it pastes into any app. Browsers only accept PNG on the clipboard, so other
 * formats are redrawn as PNG first. The PNG is handed over as a promise, which keeps Safari's
 * rule that the copy must start inside the tap.
 */
export async function copyImage(file: Blob): Promise<boolean> {
  if (!('ClipboardItem' in window) || !navigator.clipboard?.write) return false;
  try {
    const png = file.type === 'image/png' ? Promise.resolve(file) : toPng(file);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  } catch {
    return false;
  }
}

async function toPng(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'));
}

export function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Opens the system share sheet (on iPhone: Save Image, Save to Files, AirDrop and apps). */
export async function shareFile(file: File): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (!canShareFile(file)) return 'unsupported';
  try {
    await navigator.share({ files: [file] });
    return 'shared';
  } catch {
    return 'cancelled';
  }
}

export function downloadFile(file: File, url?: string): void {
  const href = url ?? URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = href;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (!url) setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 10) return 'A few seconds left';
  if (seconds < 60) return `About ${Math.round(seconds / 5) * 5} seconds left`;
  const m = Math.round(seconds / 60);
  return m === 1 ? 'About a minute left' : `About ${m} minutes left`;
}

/** Splits text into plain parts and links, so links can be tapped without injecting HTML. */
export function linkify(text: string): { text: string; href?: string }[] {
  const parts: { text: string; href?: string }[] = [];
  const re = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at) });
    parts.push({ text: m[0], href: m[0] });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export type FileKind = 'image' | 'video' | 'audio' | 'pdf' | 'archive' | 'file';

export function fileKind(type: string, name: string): FileKind {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (/zip|rar|7z|tar|gzip/.test(type) || /\.(zip|rar|7z|tar|gz)$/i.test(name)) return 'archive';
  return 'file';
}
