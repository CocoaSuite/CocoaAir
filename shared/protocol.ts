/**
 * Messages between the app and the signalling server.
 * The server only introduces devices and relays WebRTC set-up; files and text never pass through it.
 */

export type DeviceKind = 'phone' | 'tablet' | 'desktop';

export interface DeviceInfo {
  kind: DeviceKind;
  /** e.g. "iPhone", "Windows", "Mac", "Android", "Linux". */
  os: string;
  /** e.g. "Safari", "Edge", "Chrome", "Firefox". */
  browser: string;
}

export interface PeerInfo extends DeviceInfo {
  id: string;
  name: string;
}

export interface RoomInfo {
  code: string;
  /** Epoch ms after which the code can no longer be joined. Null once someone has joined. */
  joinUntil: number | null;
  /** True for the device that created the room. */
  owner: boolean;
}

/** From the app to the server. */
export type ClientMessage =
  | { t: 'hello'; name?: string; device: DeviceInfo }
  | { t: 'room-create' }
  | { t: 'room-join'; code: string }
  | { t: 'room-leave' }
  | { t: 'signal'; to: string; data: unknown }
  | { t: 'ping' };

export type RoomError = 'not-found' | 'expired' | 'full' | 'rate-limited' | 'invalid';

/** From the server to the app. */
export type ServerMessage =
  | { t: 'welcome'; id: string; name: string; iceServers: RTCIceServerLike[] }
  | { t: 'peers'; nearby: PeerInfo[]; room: PeerInfo[] }
  | { t: 'room'; room: RoomInfo | null }
  | { t: 'room-error'; reason: RoomError }
  | { t: 'signal'; from: string; data: unknown }
  | { t: 'pong' };

/** Same shape as the browser's RTCIceServer, declared here so the server need not load DOM types. */
export interface RTCIceServerLike {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Room codes avoid letters and digits that are easy to confuse: no 0/O, 1/I/L, 5/S, 2/Z, 8/B. */
export const ROOM_ALPHABET = 'ACDEFGHJKMNPQRTUVWXY34679';
export const ROOM_CODE_LENGTH = 6;

/** Upper-cases a typed code and drops spaces, dashes and anything else that is not part of a code. */
export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .split('')
    .filter((c) => ROOM_ALPHABET.includes(c))
    .join('')
    .slice(0, ROOM_CODE_LENGTH);
}

/** "KQ74XM" → "KQ7-4XM". */
export function formatRoomCode(code: string): string {
  return code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

export const MAX_NAME_LENGTH = 24;
export const MAX_SIGNAL_BYTES = 64 * 1024;
