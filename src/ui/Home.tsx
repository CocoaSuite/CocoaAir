import { useState } from 'preact/hooks';
import type { PeerInfo } from '../../shared/protocol';
import type { Transfer } from '../lib/air';
import { desktop } from '../lib/desktop';
import { deviceLabel } from '../lib/device';
import { Badge, Logo, ThemeButton } from './Common';
import { useAir, useApp } from './context';
import { DeviceIcon, Folder, Globe, Image, Lock, Message, Pencil, Phone, Upload, Wifi } from './icons';
import { PhoneLink } from './PhoneLink';
import { RoomPanel } from './Room';

export type Tab = 'nearby' | 'room';

interface Props {
  tab: Tab;
  setTab: (t: Tab) => void;
  openSettings: () => void;
  openPhone: () => void;
  withDevice: (title: string, run: (peerId: string) => void) => void;
}

export function Home(props: Props) {
  const { touch } = useApp();
  return touch ? <HomeTouch {...props} /> : <HomeDesktop {...props} />;
}

function NetBadge({ tab }: { tab: Tab }) {
  const online = useAir((s) => s.online);
  if (!online) return <Badge tone="bad">Reconnecting…</Badge>;
  return tab === 'nearby' ? (
    <Badge tone="ok" icon={<Wifi size={14} />}>
      This network
    </Badge>
  ) : (
    <Badge icon={<Globe size={14} />}>Any network</Badge>
  );
}

function Tabs({ tab, setTab }: Pick<Props, 'tab' | 'setTab'>) {
  const roomCount = useAir((s) => s.roomPeers.length);
  return (
    <div class="tabs" role="tablist" aria-label="Find devices">
      <button type="button" role="tab" aria-selected={tab === 'nearby'} onClick={() => setTab('nearby')}>
        Nearby
      </button>
      <button type="button" role="tab" aria-selected={tab === 'room'} onClick={() => setTab('room')}>
        Room code{roomCount > 0 && <span class="count">{roomCount}</span>}
      </button>
    </div>
  );
}

/** "Sending 42%" on a device row while a transfer runs in the background. */
function activeFor(transfers: Transfer[], peerId: string): Transfer | undefined {
  return transfers.find((t) => t.peerId === peerId && ['connecting', 'waiting', 'active'].includes(t.status));
}

// ——— Desktop ———

function HomeDesktop({ tab, setTab, openSettings, openPhone, withDevice }: Props) {
  const { air, pickFiles } = useApp();
  const me = useAir((s) => s.me);
  const peers = useAir((s) => (tab === 'room' ? s.roomPeers : s.nearby));
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length) return;
    withDevice('Send the dropped files to', (peerId) => sendAndOpen(peerId, files));
  };
  const { go } = useApp();
  const sendAndOpen = (peerId: string, files: File[]) => {
    const id = air.sendFiles(peerId, files);
    if (id) go({ name: 'transfer', id });
  };

  return (
    <main class="screen home">
      <header class="identity">
        <div class="stack-2">
          <span class="eyebrow">This device is visible as</span>
          <button type="button" class="name-btn" onClick={openSettings} title="Rename this device">
            <span class="display-name">{me?.name ?? 'Connecting…'}</span>
            <Pencil size={14} />
          </button>
        </div>
        <div class="row-6 titlebar-tools">
          <NetBadge tab={tab} />
          {desktop?.info.phoneUrl && (
            <button type="button" class="icon-btn ghost" aria-label="Add a phone" title="Add a phone" onClick={openPhone}>
              <Phone size={16} />
            </button>
          )}
          <ThemeButton />
        </div>
      </header>

      <Tabs tab={tab} setTab={setTab} />

      {tab === 'nearby' ? (
        <>
          <section class="stack-8 shrink-scroll">
            <span class="section-label">On this network</span>
            {peers.length === 0 ? (
              <EmptyNearby />
            ) : (
              <div class="device-list">
                {peers.map((p) => (
                  <DeviceRow key={p.id} peer={p} onFiles={(files) => sendAndOpen(p.id, files)} pick={() => pickFiles(p.id, 'files')} />
                ))}
              </div>
            )}
          </section>
          <div
            class={`dropzone ${over ? 'over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <span class="drop-icon">
              <Upload size={22} />
            </span>
            <span class="drop-title">
              Drop files on a device, or paste with <kbd>Ctrl</kbd> + <kbd>V</kbd>
            </span>
            <span class="muted small">
              Copied text and images work too, or{' '}
              <button type="button" class="link" onClick={() => withDevice('Send files to', (id) => pickFiles(id, 'files'))}>
                choose files
              </button>
            </span>
          </div>
        </>
      ) : (
        <RoomPanel />
      )}

      <footer class="footnote">
        <Lock size={13} />
        {tab === 'room' ? 'Works across any networks, still end‑to‑end encrypted' : 'Sent directly device to device, end‑to‑end encrypted'}
      </footer>
    </main>
  );
}

export function DeviceRow({ peer, onFiles, pick }: { peer: PeerInfo; onFiles: (files: File[]) => void; pick: () => void }) {
  const { go } = useApp();
  const unread = useAir((s) => s.unread[peer.id] ?? 0);
  const busy = useAir((s) => activeFor(s.transfers, peer.id));
  const [over, setOver] = useState(false);
  return (
    <div
      class={`device-row ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length) onFiles(files);
      }}
    >
      <button type="button" class="device-main" onClick={() => go({ name: 'chat', peerId: peer.id })} title="Open conversation">
        <span class={`device-tile ${peer.kind === 'desktop' ? '' : 'accent'}`}>
          <DeviceIcon kind={peer.kind} size={20} />
        </span>
        <span class="stack-2 min0">
          <span class="device-name truncate">
            {peer.name}
            {unread > 0 && <span class="count">{unread}</span>}
          </span>
          <span class="muted small truncate">
            {busy ? (busy.status === 'active' ? `${busy.dir === 'out' ? 'Sending' : 'Receiving'} ${pct(busy)}%` : 'Connecting…') : deviceLabel(peer)}
          </span>
        </span>
      </button>
      <div class="row-6">
        <button type="button" class="icon-btn" aria-label={`Send text to ${peer.name}`} title="Send text" onClick={() => go({ name: 'chat', peerId: peer.id })}>
          <Message size={16} />
        </button>
        <button type="button" class="btn primary sm" onClick={pick}>
          Send files
        </button>
      </div>
    </div>
  );
}

function pct(t: Transfer): number {
  return t.total ? Math.floor((t.bytes / t.total) * 100) : 0;
}

function EmptyNearby() {
  const { touch } = useApp();
  if (desktop?.info.phoneUrl && !touch) return <PhoneLink />;
  return (
    <div class="empty">
      <span class="pulse" aria-hidden="true" />
      <span class="empty-title">Looking for devices…</span>
      <span class="muted small">
        Open CocoaAir on another device on the same Wi‑Fi{touch ? '' : ' and it shows up here'}. On a different network? Use a room code.
      </span>
    </div>
  );
}

// ——— Phone and tablet ———

function HomeTouch({ tab, setTab, openSettings }: Props) {
  const { air, pickFiles, go } = useApp();
  const me = useAir((s) => s.me);
  const peers = useAir((s) => (tab === 'room' ? s.roomPeers : s.nearby));
  const [picked, setPicked] = useState<string | null>(null);
  const selected = peers.find((p) => p.id === picked)?.id ?? (peers.length === 1 ? peers[0]!.id : null);
  const online = useAir((s) => s.online);

  const need = () => air.toast(peers.length ? 'Tap a device first' : 'No device yet. Open CocoaAir on the other device.', 'bad');

  return (
    <main class="screen home touch">
      <header class="topbar">
        <Logo />
        <div class="row-2">
          <ThemeButton size="lg" />
          <button type="button" class="icon-btn ghost lg" aria-label="Rename this device" title="Rename" onClick={openSettings}>
            <Pencil size={20} />
          </button>
        </div>
      </header>

      <Tabs tab={tab} setTab={setTab} />

      {tab === 'nearby' ? (
        <>
          <div class="radar-wrap">
            <Radar peers={peers} selected={selected} onPick={setPicked} />
            <div class="stack-2 center">
              <span class="muted small">You are visible as</span>
              <button type="button" class="name-btn big" onClick={openSettings}>
                <span class="display-name">{me?.name ?? 'Connecting…'}</span>
              </button>
            </div>
          </div>
          <div class="stack-10">
            <span class="muted small center">
              {peers.length === 0 ? 'Open CocoaAir on another device on the same Wi‑Fi' : selected ? `Send to ${air.peerName(selected)}` : 'Tap a device, then pick what to send'}
            </span>
            <div class="grid-3">
              <button type="button" class="btn primary lg" onClick={() => (selected ? pickFiles(selected, 'media') : need())}>
                <Image size={18} />
                Photos
              </button>
              <button type="button" class="btn lg" onClick={() => (selected ? pickFiles(selected, 'files') : need())}>
                <Folder size={18} />
                Files
              </button>
              <button type="button" class="btn lg" onClick={() => (selected ? go({ name: 'chat', peerId: selected }) : need())}>
                <Message size={18} />
                Text
              </button>
            </div>
            <span class="footnote">
              {online ? <Wifi size={13} /> : null}
              {online ? 'Keep this page open while sending.' : 'Reconnecting…'}
            </span>
          </div>
        </>
      ) : (
        <RoomPanel />
      )}
    </main>
  );
}

/** Places devices around you on two rings, like AirDrop. */
function Radar({ peers, selected, onPick }: { peers: PeerInfo[]; selected: string | null; onPick: (id: string) => void }) {
  const unread = useAir((s) => s.unread);
  const transfers = useAir((s) => s.transfers);
  const angles = [-55, 145, 35, -145, 90, -90, 0, 180];
  return (
    <div class="radar">
      <span class="ring r1" aria-hidden="true" />
      <span class="ring r2" aria-hidden="true" />
      <span class="ring r3" aria-hidden="true" />
      <span class="me" aria-hidden="true">
        <DeviceIcon kind="phone" size={26} />
      </span>
      {peers.slice(0, 8).map((p, i) => {
        const angle = ((angles[i] ?? 0) * Math.PI) / 180;
        const radius = i < 4 ? 41 : 30;
        const x = 50 + radius * Math.cos(angle - Math.PI / 2);
        const y = 50 + radius * Math.sin(angle - Math.PI / 2);
        const busy = activeFor(transfers, p.id);
        return (
          <button
            key={p.id}
            type="button"
            class={`radar-peer ${selected === p.id ? 'selected' : ''}`}
            style={{ left: `${x}%`, top: `${y}%` }}
            aria-pressed={selected === p.id}
            aria-label={`${p.name}, ${deviceLabel(p)}`}
            onClick={() => onPick(p.id)}
          >
            <span class="bubble">
              <DeviceIcon kind={p.kind} size={24} />
              {(unread[p.id] ?? 0) > 0 && <span class="count abs">{unread[p.id]}</span>}
            </span>
            <span class="peer-name">{p.name}</span>
            <span class="peer-sub">{busy?.status === 'active' ? `${pct(busy)}%` : p.os === 'Unknown' ? p.browser : p.os}</span>
          </button>
        );
      })}
    </div>
  );
}
