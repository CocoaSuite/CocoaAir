import { desktop } from './desktop';
import type { ClientMessage, ServerMessage } from '../../shared/protocol';

type Listener = (msg: ServerMessage) => void;
type StatusListener = (online: boolean) => void;

/**
 * The connection to the signalling server. Reconnects on its own with a growing delay,
 * and says hello again each time so the device reappears for the others.
 */
export class Signaling {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pinger: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(
    private url: string,
    private hello: () => ClientMessage,
  ) {}

  start(): void {
    this.stopped = false;
    this.open();
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('online', this.onVisible);
  }

  stop(): void {
    this.stopped = true;
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('online', this.onVisible);
    if (this.timer) clearTimeout(this.timer);
    if (this.pinger) clearInterval(this.pinger);
    this.ws?.close();
  }

  get online(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Phones drop sockets in the background; reconnect straight away when the page comes back. */
  private onVisible = () => {
    if (document.visibilityState === 'visible' && !this.online && !this.stopped) {
      if (this.timer) clearTimeout(this.timer);
      this.retry = 0;
      this.open();
    }
  };

  private open(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify(this.hello()));
      this.statusListeners.forEach((l) => l(true));
      if (this.pinger) clearInterval(this.pinger);
      this.pinger = setInterval(() => this.send({ t: 'ping' }), 25_000);
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      this.listeners.forEach((l) => l(msg));
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      if (this.pinger) clearInterval(this.pinger);
      this.statusListeners.forEach((l) => l(false));
      if (this.stopped) return;
      const delay = Math.min(10_000, 500 * 2 ** this.retry++);
      this.timer = setTimeout(() => this.open(), delay);
    };
  }
}

export function signalingUrl(loc: Location = location): string {
  if (desktop?.info.signalingUrl) return desktop.info.signalingUrl;
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${loc.host}/api/ws`;
}
