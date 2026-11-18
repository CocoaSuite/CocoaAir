import { randomBytes, randomInt } from 'node:crypto';
import {
  MAX_NAME_LENGTH,
  ROOM_ALPHABET,
  ROOM_CODE_LENGTH,
  normalizeRoomCode,
  type ClientMessage,
  type DeviceInfo,
  type PeerInfo,
  type RTCIceServerLike,
  type ServerMessage,
} from '../shared/protocol';
import { randomName } from './names';

export interface HubOptions {
  roomTtlMs: number;
  roomMaxPeers: number;
  iceServersFor: (peerId: string) => RTCIceServerLike[];
  now?: () => number;
}

interface Peer {
  id: string;
  name: string;
  device: DeviceInfo;
  net: string;
  room: string | null;
  ready: boolean;
  joinAttempts: number[];
  send: (msg: ServerMessage) => void;
}

interface Room {
  code: string;
  owner: string;
  members: Set<string>;
  joinUntil: number;
}

const JOIN_ATTEMPTS_PER_MINUTE = 10;

/**
 * Keeps track of connected devices, which ones are nearby each other, and the rooms they share.
 * Transport-free, so the rules can be tested without sockets.
 */
export class Hub {
  private peers = new Map<string, Peer>();
  private rooms = new Map<string, Room>();
  private now: () => number;

  constructor(private opts: HubOptions) {
    this.now = opts.now ?? Date.now;
  }

  get size(): number {
    return this.peers.size;
  }

  /** Registers a connection. The device appears to others after its hello message. */
  connect(net: string, send: (msg: ServerMessage) => void): string {
    const id = randomBytes(9).toString('base64url');
    this.peers.set(id, {
      id,
      name: randomName(),
      device: { kind: 'desktop', os: 'Unknown', browser: 'Browser' },
      net,
      room: null,
      ready: false,
      joinAttempts: [],
      send,
    });
    return id;
  }

  disconnect(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.leaveRoom(peer);
    this.peers.delete(id);
    if (peer.ready) this.broadcastNet(peer.net);
  }

  handle(id: string, msg: ClientMessage): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    switch (msg.t) {
      case 'hello':
        return this.hello(peer, msg.name, msg.device);
      case 'room-create':
        return this.createRoom(peer);
      case 'room-join':
        return this.joinRoom(peer, msg.code);
      case 'room-leave':
        this.leaveRoom(peer);
        peer.send({ t: 'room', room: null });
        this.sendPeers(peer);
        return;
      case 'signal':
        return this.relay(peer, msg.to, msg.data);
      case 'ping':
        return peer.send({ t: 'pong' });
    }
  }

  /** Drops room codes that expired with only their creator inside, so the code cannot be reused. */
  sweep(): void {
    const now = this.now();
    for (const room of this.rooms.values()) {
      if (room.members.size <= 1 && room.joinUntil < now) {
        for (const id of room.members) {
          const peer = this.peers.get(id);
          if (!peer) continue;
          peer.room = null;
          peer.send({ t: 'room', room: null });
          peer.send({ t: 'room-error', reason: 'expired' });
          this.sendPeers(peer);
        }
        this.rooms.delete(room.code);
      }
    }
  }

  private hello(peer: Peer, name: string | undefined, device: DeviceInfo | undefined): void {
    const clean = cleanName(name);
    if (clean) peer.name = clean;
    peer.device = cleanDevice(device);
    const first = !peer.ready;
    peer.ready = true;
    if (first) {
      peer.send({ t: 'welcome', id: peer.id, name: peer.name, iceServers: this.opts.iceServersFor(peer.id) });
    }
    this.broadcastNet(peer.net);
    if (peer.room) this.broadcastRoom(peer.room);
  }

  private createRoom(peer: Peer): void {
    if (!peer.ready) return;
    this.leaveRoom(peer);
    let code = '';
    do {
      code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    const room: Room = { code, owner: peer.id, members: new Set([peer.id]), joinUntil: this.now() + this.opts.roomTtlMs };
    this.rooms.set(code, room);
    peer.room = code;
    this.sendRoom(peer, room);
    this.sendPeers(peer);
  }

  private joinRoom(peer: Peer, rawCode: string): void {
    if (!peer.ready) return;
    const now = this.now();
    peer.joinAttempts = peer.joinAttempts.filter((t) => now - t < 60_000);
    if (peer.joinAttempts.length >= JOIN_ATTEMPTS_PER_MINUTE) {
      return peer.send({ t: 'room-error', reason: 'rate-limited' });
    }
    peer.joinAttempts.push(now);

    const code = normalizeRoomCode(typeof rawCode === 'string' ? rawCode : '');
    if (code.length !== ROOM_CODE_LENGTH) return peer.send({ t: 'room-error', reason: 'invalid' });
    const room = this.rooms.get(code);
    if (!room) return peer.send({ t: 'room-error', reason: 'not-found' });
    if (room.members.has(peer.id)) return this.sendRoom(peer, room);
    if (room.joinUntil < now) return peer.send({ t: 'room-error', reason: 'expired' });
    if (room.members.size >= this.opts.roomMaxPeers) return peer.send({ t: 'room-error', reason: 'full' });

    this.leaveRoom(peer);
    room.members.add(peer.id);
    room.joinUntil = now + this.opts.roomTtlMs;
    peer.room = code;
    for (const id of room.members) {
      const member = this.peers.get(id);
      if (member) this.sendRoom(member, room);
    }
    this.broadcastRoom(code);
  }

  private leaveRoom(peer: Peer): void {
    const code = peer.room;
    if (!code) return;
    peer.room = null;
    const room = this.rooms.get(code);
    if (!room) return;
    room.members.delete(peer.id);
    if (room.members.size === 0) {
      this.rooms.delete(code);
      return;
    }
    if (room.owner === peer.id) room.owner = room.members.values().next().value!;
    for (const id of room.members) {
      const member = this.peers.get(id);
      if (member) this.sendRoom(member, room);
    }
    this.broadcastRoom(code);
  }

  /** Passes WebRTC set-up between two devices, only when they can already see each other. */
  private relay(from: Peer, to: string, data: unknown): void {
    const target = typeof to === 'string' ? this.peers.get(to) : undefined;
    if (!target || target === from || !target.ready || !from.ready) return;
    const sameNet = target.net === from.net;
    const sameRoom = from.room !== null && target.room === from.room;
    if (!sameNet && !sameRoom) return;
    target.send({ t: 'signal', from: from.id, data });
  }

  private sendRoom(peer: Peer, room: Room): void {
    peer.send({ t: 'room', room: { code: room.code, joinUntil: room.joinUntil, owner: room.owner === peer.id } });
  }

  private info(peer: Peer): PeerInfo {
    return { id: peer.id, name: peer.name, ...peer.device };
  }

  private sendPeers(peer: Peer): void {
    if (!peer.ready) return;
    const nearby: PeerInfo[] = [];
    const room: PeerInfo[] = [];
    for (const other of this.peers.values()) {
      if (other === peer || !other.ready) continue;
      if (other.net === peer.net) nearby.push(this.info(other));
      if (peer.room && other.room === peer.room) room.push(this.info(other));
    }
    peer.send({ t: 'peers', nearby, room });
  }

  private broadcastNet(net: string): void {
    for (const peer of this.peers.values()) if (peer.net === net) this.sendPeers(peer);
  }

  private broadcastRoom(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    for (const id of room.members) {
      const peer = this.peers.get(id);
      if (peer) this.sendPeers(peer);
    }
  }
}

function cleanName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const clean = name.replace(/[\p{C}<>]/gu, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  return clean || null;
}

function cleanDevice(device: unknown): DeviceInfo {
  const d = (device ?? {}) as Partial<Record<keyof DeviceInfo, unknown>>;
  const kind = d.kind === 'phone' || d.kind === 'tablet' || d.kind === 'desktop' ? d.kind : 'desktop';
  const text = (v: unknown, fallback: string) =>
    typeof v === 'string' && /^[\p{L}\p{N} .-]{1,20}$/u.test(v) ? v : fallback;
  return { kind, os: text(d.os, 'Unknown'), browser: text(d.browser, 'Browser') };
}
