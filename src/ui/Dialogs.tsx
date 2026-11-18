import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { MAX_NAME_LENGTH } from '../../shared/protocol';
import { deviceLabel } from '../lib/device';
import { fileKind, formatBytes } from './actions';
import { useAir, useApp } from './context';
import { DeviceIcon, KindIcon } from './icons';

function Modal({ label, onClose, children }: { label: string; onClose?: () => void; children: ComponentChildren }) {
  const { touch } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('[data-autofocus], button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div class="overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} class={touch ? 'sheet' : 'dialog'} role="dialog" aria-modal="true" aria-label={label}>
        {touch && <span class="grabber" aria-hidden="true" />}
        {children}
      </div>
    </div>
  );
}

/** Asks before files arrive. Pasted single images skip this. */
export function Incoming() {
  const { air, go } = useApp();
  const t = useAir((s) => s.transfers.find((x) => x.dir === 'in' && x.status === 'asking' && !x.auto));
  const peer = useAir((s) => (t ? s.nearby.find((p) => p.id === t.peerId) ?? s.roomPeers.find((p) => p.id === t.peerId) : undefined));
  const route = useAir((s) => (t ? s.routes[t.peerId] : undefined));
  if (!t) return null;
  const count = t.files.length;
  const how = route === 'lan' ? 'direct over Wi‑Fi' : route === 'relay' ? 'relayed' : route === 'direct' ? 'direct over the internet' : 'end‑to‑end encrypted';
  return (
    <Modal label="Incoming files" onClose={() => air.decline(t.id)}>
      <div class="stack-10 center">
        <span class="hero-tile">
          <DeviceIcon kind={peer?.kind ?? 'desktop'} size={28} />
        </span>
        <h2 class="title">
          {t.peerName} wants to send you {count === 1 ? 'a file' : `${count} files`}
        </h2>
        <span class="muted">
          {formatBytes(t.total)}
          {count > 1 ? ' in total' : ''}, {how}
        </span>
      </div>
      <div class="incoming-files">
        {t.files.slice(0, 50).map((f, i) => (
          <div class="file-row" key={i}>
            <span class="file-tile light">
              <KindIcon kind={fileKind(f.type, f.name)} size={18} />
            </span>
            <span class="file-name grow truncate">{f.name}</span>
            <span class="muted small nowrap">{formatBytes(f.size)}</span>
          </div>
        ))}
        {count > 50 && <div class="muted small center pad-8">and {count - 50} more</div>}
      </div>
      <div class="grid-2">
        <button type="button" class="btn lg" onClick={() => air.decline(t.id)}>
          Decline
        </button>
        <button
          type="button"
          class="btn primary lg"
          data-autofocus
          onClick={() => {
            air.accept(t.id);
            go({ name: 'transfer', id: t.id });
          }}
        >
          Accept
        </button>
      </div>
    </Modal>
  );
}

export function Settings({ onClose }: { onClose: () => void }) {
  const { air } = useApp();
  const me = useAir((s) => s.me);
  const [name, setName] = useState(me?.name ?? '');
  return (
    <Modal label="Rename this device" onClose={onClose}>
      <form
        class="stack-12"
        onSubmit={(e) => {
          e.preventDefault();
          air.rename(name);
          onClose();
        }}
      >
        <h2 class="title">Device name</h2>
        <label class="field-label" for="device-name">
          Other devices see this name
        </label>
        <input
          id="device-name"
          class="input"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          data-autofocus
          onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
        />
        <div class="grid-2">
          <button type="button" class="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" class="btn primary" disabled={!name.trim()}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ChooseDevice({ title, onPick, onClose }: { title: string; onPick: (id: string) => void; onClose: () => void }) {
  const peers = useAir((s) => {
    const all = [...s.nearby, ...s.roomPeers];
    return all.filter((p, i) => all.findIndex((q) => q.id === p.id) === i);
  });
  return (
    <Modal label={title} onClose={onClose}>
      <h2 class="title">{title}</h2>
      <div class="device-list">
        {peers.map((p) => (
          <button type="button" class="device-row pick" key={p.id} onClick={() => onPick(p.id)}>
            <span class={`device-tile ${p.kind === 'desktop' ? '' : 'accent'}`}>
              <DeviceIcon kind={p.kind} size={20} />
            </span>
            <span class="stack-2 min0 grow">
              <span class="device-name truncate">{p.name}</span>
              <span class="muted small truncate">{deviceLabel(p)}</span>
            </span>
          </button>
        ))}
      </div>
      <button type="button" class="btn" onClick={onClose}>
        Cancel
      </button>
    </Modal>
  );
}
