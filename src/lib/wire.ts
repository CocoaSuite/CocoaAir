/** Messages on the data channel between two devices. Binary messages are file chunks. */

export interface FileMeta {
  name: string;
  size: number;
  type: string;
}

export type WireMessage =
  | { t: 'text'; id: string; text: string }
  | { t: 'offer'; id: string; files: FileMeta[]; auto: boolean }
  | { t: 'answer'; id: string; accept: boolean }
  | { t: 'file'; id: string; index: number }
  | { t: 'done'; id: string; index: number }
  | { t: 'ack'; id: string; bytes: number; complete?: boolean }
  | { t: 'cancel'; id: string };

export const MAX_TEXT_LENGTH = 100_000;
/** A single pasted or shared image up to this size arrives without asking. */
export const AUTO_ACCEPT_IMAGE_BYTES = 25 * 1024 * 1024;

export function parseWire(raw: string): WireMessage | null {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!msg || typeof msg !== 'object') return null;
  const m = msg as Record<string, unknown>;
  if (typeof m.id !== 'string' || m.id.length > 64) return null;
  switch (m.t) {
    case 'text':
      return typeof m.text === 'string' && m.text.length <= MAX_TEXT_LENGTH ? (m as WireMessage) : null;
    case 'offer': {
      if (!Array.isArray(m.files) || m.files.length === 0 || m.files.length > 1000) return null;
      const files: FileMeta[] = [];
      for (const f of m.files as Record<string, unknown>[]) {
        if (!f || typeof f.name !== 'string' || typeof f.size !== 'number' || f.size < 0 || !Number.isFinite(f.size)) return null;
        files.push({ name: safeFileName(f.name), size: f.size, type: typeof f.type === 'string' ? f.type.slice(0, 100) : '' });
      }
      return { t: 'offer', id: m.id, files, auto: m.auto === true };
    }
    case 'answer':
      return { t: 'answer', id: m.id, accept: m.accept === true };
    case 'file':
    case 'done':
      return Number.isInteger(m.index) && (m.index as number) >= 0 ? ({ t: m.t, id: m.id, index: m.index as number } as WireMessage) : null;
    case 'ack':
      return typeof m.bytes === 'number' ? { t: 'ack', id: m.id, bytes: m.bytes, complete: m.complete === true } : null;
    case 'cancel':
      return { t: 'cancel', id: m.id };
    default:
      return null;
  }
}

/** Keeps the last path segment and drops characters that file systems reject. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f<>:"|?*]/g, '').trim().slice(0, 200);
  return clean && clean !== '.' && clean !== '..' ? clean : 'file';
}

export function isAutoAcceptable(files: FileMeta[], auto: boolean): boolean {
  return auto && files.length === 1 && files[0]!.type.startsWith('image/') && files[0]!.size <= AUTO_ACCEPT_IMAGE_BYTES;
}
