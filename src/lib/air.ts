import type { PeerInfo, RoomError, RoomInfo, ServerMessage } from '../../shared/protocol';
import { desktop } from './desktop';
import { detectDevice } from './device';
import { PeerLink, type Route } from './link';
import { Signaling, signalingUrl } from './signaling';
import { Store } from './store';
import { isAutoAcceptable, parseWire, type FileMeta, type WireMessage } from './wire';

export type TransferStatus = 'connecting' | 'waiting' | 'asking' | 'active' | 'done' | 'declined' | 'cancelled' | 'failed';

export interface Transfer {
  id: string;
  peerId: string;
  peerName: string;
  dir: 'out' | 'in';
  files: FileMeta[];
  total: number;
  /** Bytes confirmed so far. */
  bytes: number;
  /** Bytes finished per file. */
  fileBytes: number[];
  status: TransferStatus;
  error?: string;
  auto: boolean;
  startedAt: number;
  /** Bytes per second, smoothed. */
  speed: number;
}

export interface Item {
  id: string;
  peerId: string;
  dir: 'in' | 'out';
  at: number;
  kind: 'text' | 'file';
  text?: string;
  file?: File;
  url?: string;
}

export interface Toast {
  id: number;
  text: string;
  tone?: 'ok' | 'bad';
  action?: { label: string; run: () => void };
}

export interface AirState {
  online: boolean;
  me: { id: string; name: string } | null;
  nearby: PeerInfo[];
  roomPeers: PeerInfo[];
  room: RoomInfo | null;
  roomError: RoomError | null;
  routes: Record<string, Route>;
  transfers: Transfer[];
  items: Item[];
  unread: Record<string, number>;
  toasts: Toast[];
  /** The peer whose conversation is on screen, so its messages do not count as unread. */
  viewing: string | null;
}

interface OutState {
  files: File[];
  cancelled: boolean;
  answer?: (accept: boolean) => void;
  acked: number;
  complete?: () => void;
}

interface InState {
  index: number;
  chunks: ArrayBuffer[];
  received: number;
  lastAck: number;
}

const NAME_KEY = 'ca-name';
const ANSWER_TIMEOUT_MS = 5 * 60_000;

let toastSeq = 0;

function uid(): string {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/[+/=]/g, (c) => (c === '+' ? '-' : c === '/' ? '_' : ''));
}

function readName(): string | undefined {
  try {
    return localStorage.getItem(NAME_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* private mode */
  }
}

/** Everything the app does: presence, rooms, connections and transfers. The UI only reads the store and calls these methods. */
export class Air {
  readonly store = new Store<AirState>({
    online: false,
    me: null,
    nearby: [],
    roomPeers: [],
    room: null,
    roomError: null,
    routes: {},
    transfers: [],
    items: [],
    unread: {},
    toasts: [],
    viewing: null,
  });

  private signaling: Signaling;
  private iceServers: RTCIceServer[] = [];
  private links = new Map<string, PeerLink>();
  private queues = new Map<string, Promise<void>>();
  private outgoing = new Map<string, OutState>();
  private incoming = new Map<string, InState>();
  private names = new Map<string, string>();
  private wakeLock: { release: () => Promise<void> } | null = null;
  private pendingJoin: string | null = null;

  constructor(url = signalingUrl()) {
    this.signaling = new Signaling(url, () => ({ t: 'hello', name: readName(), device: detectDevice() }));
    this.signaling.on((msg) => this.onServer(msg));
    this.signaling.onStatus((online) => {
      this.store.set({ online });
      if (!online) this.store.set({ nearby: [], roomPeers: [] });
    });
  }

  start(): void {
    this.signaling.start();
  }

  stop(): void {
    this.signaling.stop();
    this.links.forEach((l) => l.close());
  }

  // ——— Identity and rooms ———

  rename(name: string): void {
    const clean = name.trim().slice(0, 24);
    if (!clean) return;
    saveName(clean);
    this.signaling.send({ t: 'hello', name: clean, device: detectDevice() });
    const me = this.store.get().me;
    if (me) this.store.set({ me: { ...me, name: clean } });
  }

  createRoom(): void {
    this.store.set({ roomError: null });
    this.signaling.send({ t: 'room-create' });
  }

  joinRoom(code: string): void {
    this.store.set({ roomError: null });
    if (!this.store.get().me) {
      this.pendingJoin = code;
      return;
    }
    this.signaling.send({ t: 'room-join', code });
  }

  leaveRoom(): void {
    this.signaling.send({ t: 'room-leave' });
  }

  clearRoomError(): void {
    this.store.set({ roomError: null });
  }

  peerName(id: string): string {
    return this.names.get(id) ?? 'Device';
  }

  // ——— Sending ———

  sendText(peerId: string, text: string): void {
    const body = text.trim() ? text : '';
    if (!body) return;
    const id = uid();
    this.addItem({ id, peerId, dir: 'out', at: Date.now(), kind: 'text', text: body });
    this.enqueue(peerId, async (link) => {
      link.sendText(JSON.stringify({ t: 'text', id, text: body } satisfies WireMessage));
    }).catch((err: Error) => this.toast(`Couldn't send the text: ${err.message}`, 'bad'));
  }

  /**
   * Sends files. With `auto`, a single image (a paste) arrives without the other side having to
   * accept it; anything else asks first.
   */
  sendFiles(peerId: string, list: File[] | FileList, opts: { auto?: boolean } = {}): string | null {
    const files = Array.from(list);
    if (!files.length) return null;
    const id = uid();
    const metas: FileMeta[] = files.map((f) => ({ name: f.name || 'file', size: f.size, type: f.type }));
    const auto = isAutoAcceptable(metas, opts.auto ?? false);
    const transfer: Transfer = {
      id,
      peerId,
      peerName: this.peerName(peerId),
      dir: 'out',
      files: metas,
      total: metas.reduce((s, f) => s + f.size, 0),
      bytes: 0,
      fileBytes: metas.map(() => 0),
      status: 'connecting',
      auto,
      startedAt: Date.now(),
      speed: 0,
    };
    const state: OutState = { files, cancelled: false, acked: 0 };
    this.outgoing.set(id, state);
    this.upsertTransfer(transfer);

    this.enqueue(peerId, (link) => this.runSend(link, transfer, state)).catch((err: Error) => {
      if (state.cancelled) return;
      this.patchTransfer(id, { status: 'failed', error: err.message });
    });
    return id;
  }

  cancel(transferId: string): void {
    const t = this.store.get().transfers.find((x) => x.id === transferId);
    if (!t || ['done', 'declined', 'cancelled', 'failed'].includes(t.status)) return;
    const out = this.outgoing.get(transferId);
    if (out) {
      out.cancelled = true;
      out.answer?.(false);
    }
    this.incoming.delete(transferId);
    const link = this.links.get(t.peerId);
    if (link && link.channel.readyState === 'open') link.sendText(JSON.stringify({ t: 'cancel', id: transferId } satisfies WireMessage));
    this.patchTransfer(transferId, { status: 'cancelled' });
  }

  accept(transferId: string): void {
    const t = this.store.get().transfers.find((x) => x.id === transferId);
    const link = t && this.links.get(t.peerId);
    if (!t || !link || t.status !== 'asking') return;
    this.incoming.set(transferId, { index: -1, chunks: [], received: 0, lastAck: 0 });
    this.patchTransfer(transferId, { status: 'active', startedAt: Date.now() });
    link.sendText(JSON.stringify({ t: 'answer', id: transferId, accept: true } satisfies WireMessage));
  }

  decline(transferId: string): void {
    const t = this.store.get().transfers.find((x) => x.id === transferId);
    const link = t && this.links.get(t.peerId);
    if (!t || t.status !== 'asking') return;
    link?.sendText(JSON.stringify({ t: 'answer', id: transferId, accept: false } satisfies WireMessage));
    this.patchTransfer(transferId, { status: 'declined' });
  }

  dismissTransfer(transferId: string): void {
    this.store.set((s) => ({ transfers: s.transfers.filter((t) => t.id !== transferId) }));
    this.outgoing.delete(transferId);
  }

  setViewing(peerId: string | null): void {
    this.store.set((s) => ({ viewing: peerId, unread: peerId ? { ...s.unread, [peerId]: 0 } : s.unread }));
  }

  toast(text: string, tone?: Toast['tone'], action?: Toast['action']): void {
    const toast: Toast = { id: ++toastSeq, text, tone, action };
    this.store.set((s) => ({ toasts: [...s.toasts.slice(-2), toast] }));
    setTimeout(() => this.dismissToast(toast.id), action ? 6000 : 3000);
  }

  dismissToast(id: number): void {
    this.store.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  }

  // ——— Internals ———

  private onServer(msg: ServerMessage): void {
    switch (msg.t) {
      case 'welcome':
        this.iceServers = msg.iceServers as RTCIceServer[];
        saveName(msg.name);
        this.store.set({ me: { id: msg.id, name: msg.name } });
        if (this.pendingJoin) {
          this.signaling.send({ t: 'room-join', code: this.pendingJoin });
          this.pendingJoin = null;
        }
        return;
      case 'peers': {
        for (const p of [...msg.nearby, ...msg.room]) this.names.set(p.id, p.name);
        this.store.set({ nearby: msg.nearby, roomPeers: msg.room });
        return;
      }
      case 'room':
        this.store.set({ room: msg.room, roomError: null });
        return;
      case 'room-error':
        this.store.set({ roomError: msg.reason });
        return;
      case 'signal':
        this.linkFor(msg.from)?.handleSignal(msg.data as Parameters<PeerLink['handleSignal']>[0]);
        return;
      case 'pong':
        return;
    }
  }

  private linkFor(peerId: string): PeerLink | null {
    const existing = this.links.get(peerId);
    if (existing && !existing.closed) return existing;
    const me = this.store.get().me;
    if (!me) return null;
    const link = new PeerLink(
      peerId,
      me.id < peerId,
      this.iceServers,
      (data) => this.signaling.send({ t: 'signal', to: peerId, data }),
      {
        onMessage: (data) => this.onWire(link, data),
        onClose: () => this.onLinkClosed(link),
        onRoute: (route) => this.store.set((s) => ({ routes: { ...s.routes, [peerId]: route } })),
      },
    );
    this.links.set(peerId, link);
    return link;
  }

  /** Runs jobs for one device in order, on a connected link. */
  private enqueue(peerId: string, job: (link: PeerLink) => Promise<void>): Promise<void> {
    const prev = this.queues.get(peerId) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        const link = this.linkFor(peerId);
        if (!link) throw new Error('Not connected to the server');
        await link.ready();
        await job(link);
      });
    this.queues.set(peerId, next);
    return next;
  }

  private async runSend(link: PeerLink, transfer: Transfer, state: OutState): Promise<void> {
    if (state.cancelled) return;
    const { id } = transfer;
    this.patchTransfer(id, { status: 'waiting' });

    const accepted = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), ANSWER_TIMEOUT_MS);
      state.answer = (ok) => {
        clearTimeout(timer);
        resolve(ok);
      };
      link.sendText(JSON.stringify({ t: 'offer', id, files: transfer.files, auto: transfer.auto } satisfies WireMessage));
    });
    state.answer = undefined;
    if (state.cancelled) return;
    if (!accepted) {
      this.patchTransfer(id, { status: 'declined' });
      return;
    }

    const started = Date.now();
    this.patchTransfer(id, { status: 'active', startedAt: started });
    this.updateWakeLock();
    const completed = new Promise<void>((resolve) => (state.complete = resolve));

    const chunk = link.chunkSize;
    const BLOCK = 1024 * 1024;
    let sent = 0;
    let lastPaint = 0;
    for (let index = 0; index < state.files.length; index++) {
      const file = state.files[index]!;
      link.sendText(JSON.stringify({ t: 'file', id, index } satisfies WireMessage));
      for (let offset = 0; offset < file.size; offset += BLOCK) {
        if (state.cancelled || link.closed) return;
        const block = await file.slice(offset, offset + BLOCK).arrayBuffer();
        for (let at = 0; at < block.byteLength; at += chunk) {
          if (state.cancelled) return;
          await link.sendBinary(block.slice(at, at + chunk));
        }
        sent += block.byteLength;
        const now = Date.now();
        if (now - lastPaint > 150) {
          lastPaint = now;
          this.progress(id, Math.max(state.acked, sent - link.buffered), started);
        }
      }
      link.sendText(JSON.stringify({ t: 'done', id, index } satisfies WireMessage));
    }

    await Promise.race([
      completed,
      new Promise<void>((_, reject) => {
        const check = setInterval(() => {
          if (state.cancelled || link.closed) {
            clearInterval(check);
            reject(new Error('The connection closed before the files arrived'));
          }
        }, 500);
        void completed.then(() => clearInterval(check));
      }),
    ]);
    const t = this.store.get().transfers.find((x) => x.id === id);
    this.patchTransfer(id, { status: 'done', bytes: transfer.total, fileBytes: transfer.files.map((f) => f.size), speed: t?.speed ?? 0 });
    state.files.forEach((file) =>
      this.addItem({
        id: uid(),
        peerId: transfer.peerId,
        dir: 'out',
        at: Date.now(),
        kind: 'file',
        file,
        url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      }),
    );
    this.outgoing.delete(id);
    this.updateWakeLock();
  }

  private onWire(link: PeerLink, data: string | ArrayBuffer): void {
    if (typeof data !== 'string') return this.onChunk(link, data);
    const msg = parseWire(data);
    if (!msg) return;
    const peerId = link.peerId;
    switch (msg.t) {
      case 'text':
        this.addItem({ id: msg.id, peerId, dir: 'in', at: Date.now(), kind: 'text', text: msg.text });
        this.notify(peerId, 'sent you text');
        return;
      case 'offer': {
        if (this.store.get().transfers.some((t) => t.id === msg.id)) return;
        const auto = isAutoAcceptable(msg.files, msg.auto);
        const transfer: Transfer = {
          id: msg.id,
          peerId,
          peerName: this.peerName(peerId),
          dir: 'in',
          files: msg.files,
          total: msg.files.reduce((s, f) => s + f.size, 0),
          bytes: 0,
          fileBytes: msg.files.map(() => 0),
          status: 'asking',
          auto,
          startedAt: Date.now(),
          speed: 0,
        };
        this.upsertTransfer(transfer);
        if (auto) this.accept(msg.id);
        return;
      }
      case 'answer':
        this.outgoing.get(msg.id)?.answer?.(msg.accept);
        return;
      case 'file': {
        const st = this.incoming.get(msg.id);
        if (!st) return;
        st.index = msg.index;
        st.chunks = [];
        this.updateWakeLock();
        return;
      }
      case 'done':
        return this.finishFile(link, msg.id, msg.index);
      case 'ack': {
        const out = this.outgoing.get(msg.id);
        if (!out) return;
        out.acked = msg.bytes;
        const t = this.store.get().transfers.find((x) => x.id === msg.id);
        if (t) this.progress(msg.id, msg.bytes, t.startedAt);
        if (msg.complete) out.complete?.();
        return;
      }
      case 'cancel': {
        const t = this.store.get().transfers.find((x) => x.id === msg.id);
        if (!t || ['done', 'declined', 'failed'].includes(t.status)) return;
        const out = this.outgoing.get(msg.id);
        if (out) {
          out.cancelled = true;
          out.answer?.(false);
        }
        this.incoming.delete(msg.id);
        this.patchTransfer(msg.id, { status: 'cancelled' });
        this.toast(`${t.peerName} cancelled the transfer`);
        this.updateWakeLock();
        return;
      }
    }
  }

  /** The transfer currently receiving data on this link (one at a time per device). */
  private activeIncoming(peerId: string): [string, InState] | null {
    for (const t of this.store.get().transfers) {
      if (t.dir === 'in' && t.peerId === peerId && t.status === 'active') {
        const st = this.incoming.get(t.id);
        if (st && st.index >= 0) return [t.id, st];
      }
    }
    return null;
  }

  private onChunk(link: PeerLink, data: ArrayBuffer): void {
    const found = this.activeIncoming(link.peerId);
    if (!found) return;
    const [id, st] = found;
    st.chunks.push(data);
    st.received += data.byteLength;
    const now = Date.now();
    if (now - st.lastAck > 200) {
      st.lastAck = now;
      link.sendText(JSON.stringify({ t: 'ack', id, bytes: st.received } satisfies WireMessage));
      const t = this.store.get().transfers.find((x) => x.id === id);
      if (t) this.progress(id, st.received, t.startedAt);
    }
  }

  private finishFile(link: PeerLink, id: string, index: number): void {
    const st = this.incoming.get(id);
    const t = this.store.get().transfers.find((x) => x.id === id);
    if (!st || !t || st.index !== index) return;
    const meta = t.files[index]!;
    const file = new File(st.chunks, meta.name, { type: meta.type || 'application/octet-stream' });
    st.chunks = [];
    st.index = -1;
    const fileBytes = t.fileBytes.slice();
    fileBytes[index] = file.size;
    this.patchTransfer(id, { fileBytes, bytes: st.received });
    this.addItem({
      id: uid(),
      peerId: link.peerId,
      dir: 'in',
      at: Date.now(),
      kind: 'file',
      file,
      url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    });

    if (index === t.files.length - 1) {
      link.sendText(JSON.stringify({ t: 'ack', id, bytes: st.received, complete: true } satisfies WireMessage));
      this.incoming.delete(id);
      this.patchTransfer(id, { status: 'done', bytes: t.total });
      this.updateWakeLock();
      if (t.auto) this.notify(link.peerId, 'sent you an image');
      else this.notify(link.peerId, t.files.length === 1 ? 'sent you a file' : `sent you ${t.files.length} files`);
    }
  }

  private progress(id: string, bytes: number, startedAt: number): void {
    this.store.set(
      (s) => ({
        transfers: s.transfers.map((t) => {
          if (t.id !== id) return t;
          const elapsed = Math.max(0.25, (Date.now() - startedAt) / 1000);
          const speed = bytes / elapsed;
          let left = bytes;
          const fileBytes = t.files.map((f) => {
            const b = Math.min(f.size, left);
            left -= b;
            return b;
          });
          return { ...t, bytes: Math.max(t.bytes, bytes), fileBytes, speed };
        }),
      }),
      false,
    );
  }

  private onLinkClosed(link: PeerLink): void {
    if (this.links.get(link.peerId) === link) this.links.delete(link.peerId);
    this.queues.delete(link.peerId);
    const live = ['connecting', 'waiting', 'asking', 'active'];
    for (const t of this.store.get().transfers) {
      if (t.peerId === link.peerId && live.includes(t.status)) {
        const out = this.outgoing.get(t.id);
        if (out) out.answer?.(false);
        this.incoming.delete(t.id);
        this.patchTransfer(t.id, { status: 'failed', error: 'The connection was lost' });
      }
    }
    this.updateWakeLock();
  }

  private notify(peerId: string, what: string): void {
    if (document.hidden || !document.hasFocus()) desktop?.attention();
    const s = this.store.get();
    if (s.viewing === peerId) return;
    this.store.set({ unread: { ...s.unread, [peerId]: (s.unread[peerId] ?? 0) + 1 } });
    this.toast(`${this.peerName(peerId)} ${what}`, undefined, {
      label: 'Open',
      run: () => window.dispatchEvent(new CustomEvent('air:open', { detail: peerId })),
    });
  }

  private addItem(item: Item): void {
    this.store.set((s) => ({ items: [...s.items, item] }));
  }

  private upsertTransfer(t: Transfer): void {
    this.store.set((s) => ({ transfers: [...s.transfers.filter((x) => x.id !== t.id), t] }));
  }

  private patchTransfer(id: string, patch: Partial<Transfer>): void {
    this.store.set((s) => ({ transfers: s.transfers.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  }

  /** Keeps the screen on while files move, so a phone does not sleep mid-transfer. */
  private async updateWakeLock(): Promise<void> {
    const busy = this.store.get().transfers.some((t) => t.status === 'active');
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (!wl) return;
    try {
      if (busy && !this.wakeLock) this.wakeLock = await wl.request('screen');
      else if (!busy && this.wakeLock) {
        await this.wakeLock.release();
        this.wakeLock = null;
      }
    } catch {
      this.wakeLock = null;
    }
  }
}
