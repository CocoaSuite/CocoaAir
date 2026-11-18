/** How the data travels once two devices are connected. */
export type Route = 'lan' | 'direct' | 'relay' | 'unknown';

export interface LinkEvents {
  onMessage: (data: string | ArrayBuffer) => void;
  onClose: () => void;
  onRoute: (route: Route) => void;
}

const OPEN_TIMEOUT_MS = 20_000;
/** If the channel hasn't opened by now, try again once, through the TURN relay when there is one. */
const RETRY_AFTER_MS = 7_000;
const HIGH_WATER = 4 * 1024 * 1024;
const LOW_WATER = 1024 * 1024;

/**
 * A direct WebRTC connection to one other device, with a single reliable, ordered data channel.
 *
 * Both sides create the channel up front as a pre-negotiated channel (id 0), so whichever side
 * starts first, there is exactly one channel. Offers that cross in flight are resolved with the
 * "perfect negotiation" pattern: the device with the smaller id is polite and gives way.
 */
export class PeerLink {
  readonly pc: RTCPeerConnection;
  readonly channel: RTCDataChannel;
  route: Route = 'unknown';
  closed = false;

  private makingOffer = false;
  private ignoreOffer = false;
  private opened: Promise<void>;
  private retried = false;
  private hasTurn: boolean;

  constructor(
    readonly peerId: string,
    private polite: boolean,
    iceServers: RTCIceServer[],
    private signal: (data: unknown) => void,
    private events: LinkEvents,
  ) {
    this.pc = new RTCPeerConnection({ iceServers });
    this.hasTurn = iceServers.some((s) => [s.urls].flat().some((u) => /^turns?:/.test(u)));
    this.channel = this.pc.createDataChannel('air', { negotiated: true, id: 0, ordered: true });
    this.channel.binaryType = 'arraybuffer';
    this.channel.bufferedAmountLowThreshold = LOW_WATER;

    this.opened = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Could not connect to the device')), OPEN_TIMEOUT_MS);
      const stall = setTimeout(() => this.retry(), RETRY_AFTER_MS);
      this.channel.addEventListener('open', () => {
        clearTimeout(timer);
        clearTimeout(stall);
        resolve();
      });
      this.channel.addEventListener('close', () => {
        clearTimeout(timer);
        clearTimeout(stall);
        reject(new Error('The connection closed'));
      });
    });
    this.opened.catch(() => this.close());

    this.channel.onmessage = (ev) => this.events.onMessage(ev.data as string | ArrayBuffer);
    this.channel.onclose = () => this.close();
    this.channel.onopen = () => void this.detectRoute();

    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        this.signal({ description: this.pc.localDescription?.toJSON() });
      } catch {
        // A crossing offer from the other side will finish the negotiation.
      } finally {
        this.makingOffer = false;
      }
    };
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.signal({ candidate: candidate.toJSON() });
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'failed' && this.retry()) return;
      if (s === 'failed' || s === 'closed') this.close();
      if (s === 'connected') void this.detectRoute();
    };
  }

  /**
   * One second attempt when the direct path fails or stalls: restart ICE, and with TURN available
   * use only the relay, which gets through strict routers and mobile networks.
   * Returns false once the retry has been used up.
   */
  private retry(): boolean {
    if (this.retried || this.closed || this.channel.readyState === 'open') return false;
    this.retried = true;
    try {
      if (this.hasTurn) this.pc.setConfiguration({ ...this.pc.getConfiguration(), iceTransportPolicy: 'relay' });
      this.pc.restartIce();
    } catch {
      return false;
    }
    return true;
  }

  /** Resolves once the data channel can carry data. */
  ready(): Promise<void> {
    return this.opened;
  }

  async handleSignal(data: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }): Promise<void> {
    if (this.closed) return;
    try {
      if (data.description) {
        const description = data.description;
        const collision = description.type === 'offer' && (this.makingOffer || this.pc.signalingState !== 'stable');
        this.ignoreOffer = !this.polite && collision;
        if (this.ignoreOffer) return;
        await this.pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          await this.pc.setLocalDescription();
          this.signal({ description: this.pc.localDescription?.toJSON() });
        }
      } else if (data.candidate) {
        try {
          await this.pc.addIceCandidate(data.candidate);
        } catch (err) {
          if (!this.ignoreOffer) throw err;
        }
      }
    } catch {
      // A broken negotiation surfaces as a failed connection; the transfer reports it.
    }
  }

  /** Largest message both sides accept, capped at 64 KB for Safari. */
  get chunkSize(): number {
    const max = this.pc.sctp?.maxMessageSize ?? 0;
    return max >= 64 * 1024 || max === 0 ? 64 * 1024 : Math.max(16 * 1024, Math.floor(max / 1024) * 1024);
  }

  sendText(text: string): void {
    this.channel.send(text);
  }

  /** Sends binary data, waiting while too much is still queued so memory stays flat. */
  async sendBinary(data: ArrayBuffer): Promise<void> {
    if (this.channel.bufferedAmount > HIGH_WATER) {
      await new Promise<void>((resolve, reject) => {
        const done = () => {
          this.channel.removeEventListener('bufferedamountlow', done);
          this.channel.removeEventListener('close', fail);
          resolve();
        };
        const fail = () => {
          this.channel.removeEventListener('bufferedamountlow', done);
          reject(new Error('The connection closed'));
        };
        this.channel.addEventListener('bufferedamountlow', done);
        this.channel.addEventListener('close', fail);
      });
    }
    if (this.channel.readyState !== 'open') throw new Error('The connection closed');
    this.channel.send(data);
  }

  get buffered(): number {
    return this.channel.bufferedAmount;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.channel.close();
    } catch {
      /* already closed */
    }
    this.pc.close();
    this.events.onClose();
  }

  /** Reads the selected candidate pair to tell same-network, direct internet and relayed paths apart. */
  private async detectRoute(): Promise<void> {
    try {
      const stats = await this.pc.getStats();
      let pairId: string | undefined;
      stats.forEach((s) => {
        if (s.type === 'transport' && s.selectedCandidatePairId) pairId = s.selectedCandidatePairId;
      });
      let pair: RTCIceCandidatePairStats | undefined;
      stats.forEach((s) => {
        if (s.type !== 'candidate-pair') return;
        const p = s as RTCIceCandidatePairStats & { selected?: boolean };
        if ((pairId && p.id === pairId) || (!pairId && (p.selected || (p.nominated && p.state === 'succeeded')))) pair = p;
      });
      if (!pair) return;
      const local = stats.get(pair.localCandidateId) as { candidateType?: string } | undefined;
      const remote = stats.get(pair.remoteCandidateId) as { candidateType?: string } | undefined;
      const types = [local?.candidateType, remote?.candidateType];
      const route: Route = types.includes('relay') ? 'relay' : types.every((t) => t === 'host') ? 'lan' : 'direct';
      if (route !== this.route) {
        this.route = route;
        this.events.onRoute(route);
      }
    } catch {
      /* stats are a nicety */
    }
  }
}
