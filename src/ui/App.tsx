import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Air } from '../lib/air';
import { Chat } from './Chat';
import { AppContext, type Ctx, type View } from './context';
import { AddPhone, ChooseDevice, Incoming, Settings } from './Dialogs';
import { Home, type Tab } from './Home';
import { useTouch } from './hooks';
import { Toasts } from './Toasts';
import { TransferView } from './TransferView';

export function App({ air }: { air: Air }) {
  const touch = useTouch();
  const [view, setView] = useState<View>({ name: 'home' });
  const [tab, setTab] = useState<Tab>(() => (location.hash.startsWith('#join=') ? 'room' : 'nearby'));
  const [settings, setSettings] = useState(false);
  const [phone, setPhone] = useState(false);
  const [chooser, setChooser] = useState<null | { title: string; run: (peerId: string) => void }>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const target = useRef<string | null>(null);

  const go = (next: View) => {
    setView(next);
    air.setViewing(next.name === 'chat' ? next.peerId : null);
  };

  const ctx = useMemo<Ctx>(
    () => ({
      air,
      view,
      go,
      touch,
      pickFiles(peerId, mode) {
        target.current = peerId;
        const input = mode === 'media' ? mediaInput.current : filesInput.current;
        if (input) {
          input.value = '';
          input.click();
        }
      },
    }),
    // go only closes over setters and air
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [air, view, touch],
  );

  const onPicked = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const peerId = target.current;
    if (!peerId || !input.files?.length) return;
    const id = air.sendFiles(peerId, input.files);
    if (id) go({ name: 'transfer', id });
  };

  // "Open" on a notification jumps to that device's conversation.
  useEffect(() => {
    const open = (e: Event) => go({ name: 'chat', peerId: (e as CustomEvent<string>).detail });
    window.addEventListener('air:open', open);
    return () => window.removeEventListener('air:open', open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A QR code or shared link carries the room code in the address: #join=KQ74XM.
  useEffect(() => {
    const m = location.hash.match(/^#join=([A-Za-z0-9-]+)/);
    if (m) {
      air.joinRoom(m[1]!);
      history.replaceState(null, '', location.pathname + location.search);
    }
  }, [air]);

  /** Sends to the only device on screen, or asks which one. */
  const withDevice = (title: string, run: (peerId: string) => void) => {
    const s = air.store.get();
    const list = tab === 'room' ? s.roomPeers : s.nearby;
    const all = list.length ? list : [...s.nearby, ...s.roomPeers];
    const unique = all.filter((p, i) => all.findIndex((q) => q.id === p.id) === i);
    if (unique.length === 0) air.toast('No device to send to yet. Open CocoaAir on the other device first.', 'bad');
    else if (unique.length === 1) run(unique[0]!.id);
    else setChooser({ title, run });
  };

  // Paste anywhere on the home screen: copied text or an image goes straight out.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (view.name !== 'home') return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!files.length && !text.trim()) return;
      e.preventDefault();
      withDevice(files.length ? 'Send the pasted files to' : 'Send the pasted text to', (peerId) => {
        if (files.length) {
          const single = files.length === 1 && files[0]!.type.startsWith('image/');
          const id = air.sendFiles(peerId, files, { auto: single });
          go(single || !id ? { name: 'chat', peerId } : { name: 'transfer', id });
        } else {
          air.sendText(peerId, text);
          go({ name: 'chat', peerId });
        }
      });
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  // Dropping files outside a device card or the drop area should never open them in the browser.
  useEffect(() => {
    const stop = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

  return (
    <AppContext.Provider value={ctx}>
      <div class={`app ${touch ? 'is-touch' : 'is-desktop'}`}>
        {view.name === 'home' && (
          <Home tab={tab} setTab={setTab} openSettings={() => setSettings(true)} openPhone={() => setPhone(true)} withDevice={withDevice} />
        )}
        {view.name === 'chat' && <Chat peerId={view.peerId} />}
        {view.name === 'transfer' && <TransferView id={view.id} />}
        <Incoming />
        {settings && <Settings onClose={() => setSettings(false)} />}
        {phone && <AddPhone onClose={() => setPhone(false)} />}
        {chooser && (
          <ChooseDevice
            title={chooser.title}
            onPick={(id) => {
              setChooser(null);
              chooser.run(id);
            }}
            onClose={() => setChooser(null)}
          />
        )}
        <Toasts />
        <input ref={filesInput} type="file" multiple hidden onChange={onPicked} />
        <input ref={mediaInput} type="file" multiple accept="image/*,video/*" hidden onChange={onPicked} />
      </div>
    </AppContext.Provider>
  );
}
