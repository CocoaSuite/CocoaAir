import { Fragment } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { ROOM_CODE_LENGTH, formatRoomCode, normalizeRoomCode, type RoomError } from '../../shared/protocol';
import { desktop } from '../lib/desktop';
import { deviceLabel } from '../lib/device';
import { copyText } from './actions';
import { Dot } from './Common';
import { useAir, useApp } from './context';
import { useNow } from './hooks';
import { Copy, DeviceIcon, Leave, Message } from './icons';
import { DeviceRow } from './Home';
import { useQr } from './PhoneLink';

const ERRORS: Record<RoomError, string> = {
  'not-found': 'No room with that code. Check it and try again.',
  expired: 'That code has expired. Ask for a new one.',
  full: 'That room is full.',
  'rate-limited': 'Too many tries. Wait a minute and try again.',
  invalid: 'Room codes have 6 letters and numbers.',
};

export function RoomPanel() {
  const { touch } = useApp();
  const room = useAir((s) => s.room);
  return (
    <section class="room stack-16 shrink-scroll">
      {room ? <YourRoom /> : touch ? <JoinIntro /> : <CreatePrompt />}
      {room && <RoomDevices />}
      {(room || !touch) && (
        <div class="divider">
          <span>{room ? 'or join a different room' : "or join someone else's room"}</span>
        </div>
      )}
      <JoinForm />
      {!room && touch && <CreatePrompt />}
    </section>
  );
}

function JoinIntro() {
  return (
    <div class="stack-6">
      <h1 class="title">Join a room</h1>
      <p class="muted lead">Enter the code shown on the other device. You'll connect even if you're not on the same Wi‑Fi.</p>
    </div>
  );
}

function CreatePrompt() {
  const { air, touch } = useApp();
  const online = useAir((s) => s.online);
  return touch ? (
    <div class="card center stack-4 pad-14">
      <span class="muted small">Want the other device to join you?</span>
      <button type="button" class="link strong" disabled={!online} onClick={() => air.createRoom()}>
        Create a room code
      </button>
    </div>
  ) : (
    <div class="card row-16 pad-18">
      <div class="stack-4 grow">
        <span class="strong">Send to a device on another network</span>
        <span class="muted small">Create a code, then type it on the other device or scan its QR code.</span>
      </div>
      <button type="button" class="btn primary" disabled={!online} onClick={() => air.createRoom()}>
        Create a room code
      </button>
    </div>
  );
}

function YourRoom() {
  const { air, touch } = useApp();
  const room = useAir((s) => s.room)!;
  const others = useAir((s) => s.roomPeers.length);
  const now = useNow(15_000);
  // In the desktop app the page lives on this PC, so the link uses the address phones can reach.
  const origin = desktop?.info.phoneUrl?.replace(/\/$/, '') ?? `${location.origin}${location.pathname.replace(/\/$/, '')}`;
  const qr = useQr(`${origin}/#join=${room.code}`);

  const minutes = room.joinUntil ? Math.max(0, Math.ceil((room.joinUntil - now) / 60_000)) : 0;
  const copy = async () => {
    if (await copyText(formatRoomCode(room.code))) air.toast('Room code copied', 'ok');
  };

  return (
    <div class={`card room-card ${touch ? 'stack-12' : 'row-16'} pad-18`}>
      <div class="stack-10 grow">
        <span class="section-label">Your room</span>
        <div class="row-10">
          <span class="room-code">{formatRoomCode(room.code)}</span>
          <button type="button" class="icon-btn" aria-label="Copy room code" title="Copy" onClick={copy}>
            <Copy size={16} />
          </button>
        </div>
        <span class="muted small lh">
          Type this code on the other device, or scan the QR code with its camera.
          {others === 0 && minutes > 0 && ` The code expires in ${minutes} minute${minutes === 1 ? '' : 's'}.`}
        </span>
        <div class="row-8 small fg2">
          {others > 0 ? <Dot tone="ok" /> : <Dot tone="warn" />}
          {others > 0 ? `${others} device${others === 1 ? '' : 's'} in this room` : 'Waiting for a device to join…'}
          <button type="button" class="link small push" onClick={() => air.leaveRoom()}>
            <Leave size={13} /> Leave
          </button>
        </div>
      </div>
      {qr ? (
        <div class="qr" role="img" aria-label={`QR code for room ${formatRoomCode(room.code)}`} dangerouslySetInnerHTML={{ __html: qr }} />
      ) : (
        <div class="qr placeholder" aria-hidden="true" />
      )}
    </div>
  );
}

function RoomDevices() {
  const { touch, pickFiles, go, air } = useApp();
  const peers = useAir((s) => s.roomPeers);
  if (!peers.length) return null;
  return (
    <div class="stack-8">
      <span class="section-label">In this room</span>
      <div class="device-list">
        {peers.map((p) =>
          touch ? (
            <div class="device-row" key={p.id}>
              <button type="button" class="device-main" onClick={() => go({ name: 'chat', peerId: p.id })}>
                <span class="device-tile accent">
                  <DeviceIcon kind={p.kind} size={20} />
                </span>
                <span class="stack-2 min0">
                  <span class="device-name truncate">{p.name}</span>
                  <span class="muted small truncate">{deviceLabel(p)}</span>
                </span>
              </button>
              <div class="row-6">
                <button type="button" class="icon-btn" aria-label={`Send text to ${p.name}`} onClick={() => go({ name: 'chat', peerId: p.id })}>
                  <Message size={18} />
                </button>
                <button type="button" class="btn primary sm" onClick={() => pickFiles(p.id, 'files')}>
                  Send
                </button>
              </div>
            </div>
          ) : (
            <DeviceRow
              key={p.id}
              peer={p}
              pick={() => pickFiles(p.id, 'files')}
              onFiles={(files) => {
                const id = air.sendFiles(p.id, files);
                if (id) go({ name: 'transfer', id });
              }}
            />
          ),
        )}
      </div>
    </div>
  );
}

function JoinForm() {
  const { air, touch } = useApp();
  const error = useAir((s) => s.roomError);
  const online = useAir((s) => s.online);
  const [code, setCode] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const ready = code.length === ROOM_CODE_LENGTH;

  const submit = (e?: Event) => {
    e?.preventDefault();
    if (!ready) {
      input.current?.focus();
      return;
    }
    air.joinRoom(code);
    setCode('');
  };
  const onInput = (e: Event) => {
    if (error) air.clearRoomError();
    setCode(normalizeRoomCode((e.currentTarget as HTMLInputElement).value));
  };

  if (touch) {
    const boxes = Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => code[i] ?? '');
    return (
      <form class="stack-12" onSubmit={submit}>
        <label class="field-label" for="room-code">
          Room code
        </label>
        <div class="code-boxes" onClick={() => input.current?.focus()}>
          {boxes.map((ch, i) => (
            <Fragment key={i}>
              {i === 3 && <span class="code-dash" aria-hidden="true" />}
              <span class={`code-box ${i === Math.min(code.length, ROOM_CODE_LENGTH - 1) ? 'active' : ''}`} aria-hidden="true">
                {ch}
              </span>
            </Fragment>
          ))}
          <input
            id="room-code"
            ref={input}
            class="code-input"
            value={code}
            onInput={onInput}
            autocomplete="off"
            autocapitalize="characters"
            spellcheck={false}
            inputMode="text"
            maxLength={8}
            aria-describedby={error ? 'room-error' : undefined}
          />
        </div>
        {error && (
          <span id="room-error" class="error small" role="alert">
            {ERRORS[error]}
          </span>
        )}
        <span class="muted small">Scanning the QR code with the Camera app opens the room straight away.</span>
        <button type="submit" class="btn primary lg" disabled={!online || !ready}>
          Join room
        </button>
      </form>
    );
  }

  return (
    <form class="stack-6" onSubmit={submit}>
      <label class="field-label" for="room-code">
        Room code
      </label>
      <div class="row-8">
        <input
          id="room-code"
          ref={input}
          class="input code"
          placeholder="e.g. KQ7‑4XM"
          value={code.length > 3 ? formatRoomCode(code) : code}
          onInput={onInput}
          autocomplete="off"
          spellcheck={false}
          aria-describedby={error ? 'room-error' : undefined}
        />
        <button type="submit" class="btn primary" disabled={!online}>
          Join
        </button>
      </div>
      {error && (
        <span id="room-error" class="error small" role="alert">
          {ERRORS[error]}
        </span>
      )}
    </form>
  );
}
