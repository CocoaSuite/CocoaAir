import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Item } from '../lib/air';
import { deviceLabel } from '../lib/device';
import { canShareFile, copyImage, copyText, downloadFile, fileKind, formatBytes, linkify, shareFile } from './actions';
import { useAir, useApp } from './context';
import { Copy, Download, Folder, Image, KindIcon, SendUp, Share } from './icons';
import { SubHeader } from './TransferView';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function Chat({ peerId }: { peerId: string }) {
  const { air, go, touch, pickFiles } = useApp();
  const items = useAir((s) => s.items.filter((i) => i.peerId === peerId));
  const peer = useAir((s) => s.nearby.find((p) => p.id === peerId) ?? s.roomPeers.find((p) => p.id === peerId));
  const route = useAir((s) => s.routes[peerId]);
  const name = peer?.name ?? air.peerName(peerId);
  const list = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [over, setOver] = useState(false);

  useLayoutEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  // Ctrl+C / Cmd+C with nothing selected copies the newest image you received.
  useEffect(() => {
    if (touch) return;
    const onKey = async (e: KeyboardEvent) => {
      if (!(e.key === 'c' || e.key === 'C') || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (window.getSelection()?.toString()) return;
      const latest = [...air.store.get().items].reverse().find((i) => i.peerId === peerId && i.dir === 'in' && i.url && i.file);
      if (!latest?.file) return;
      e.preventDefault();
      const ok = await copyImage(latest.file);
      air.toast(ok ? 'Image copied' : "This browser can't copy images; use Save instead", ok ? 'ok' : 'bad');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [air, peerId, touch]);

  const send = (e?: Event) => {
    e?.preventDefault();
    if (!text.trim()) return;
    air.sendText(peerId, text);
    setText('');
  };

  const sendFiles = (files: File[]) => {
    if (!files.length) return;
    const single = files.length === 1 && files[0]!.type.startsWith('image/');
    const id = air.sendFiles(peerId, files, { auto: single });
    if (!single && id) go({ name: 'transfer', id });
  };

  const onPaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (!files.length) return;
    e.preventDefault();
    sendFiles(files);
  };

  return (
    <main
      class={`screen chat ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer?.types.includes('Files')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        sendFiles(Array.from(e.dataTransfer?.files ?? []));
      }}
    >
      <SubHeader
        eyebrow={peer ? deviceLabel(peer) : 'Not connected'}
        title={name}
        onBack={() => go({ name: 'home' })}
        route={route}
      />

      <div
        class="items"
        ref={list}
        onLoadCapture={() => {
          const el = list.current;
          if (el) el.scrollTop = el.scrollHeight;
        }}
      >
        {items.length === 0 ? (
          <div class="empty">
            <span class="empty-title">Nothing here yet</span>
            <span class="muted small">
              Send text, a photo or files to {name}. {touch ? '' : 'You can also paste or drop them here.'}
            </span>
          </div>
        ) : (
          items.map((item) => <ItemCard key={item.id} item={item} />)
        )}
      </div>

      <form class="composer" onSubmit={send}>
        <label class="field-label" for="message">
          Send text to {name}
        </label>
        <div class="row-8 end">
          <div class="row-2 attach">
            {touch && (
              <button type="button" class="icon-btn lg" aria-label="Send photos" onClick={() => pickFiles(peerId, 'media')}>
                <Image size={20} />
              </button>
            )}
            <button type="button" class={`icon-btn ${touch ? 'lg' : ''}`} aria-label="Send files" title="Send files" onClick={() => pickFiles(peerId, 'files')}>
              <Folder size={touch ? 20 : 16} />
            </button>
          </div>
          <textarea
            id="message"
            class="input grow"
            rows={touch ? 2 : 1}
            placeholder={touch ? 'Type or paste text or a link' : 'Type or paste text, a link, or an image'}
            value={text}
            onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (!touch && e.key === 'Enter' && !e.shiftKey && !e.isComposing) send(e);
            }}
            disabled={!peer}
          />
          {touch ? (
            <button type="submit" class="send-btn" aria-label="Send text" disabled={!peer || !text.trim()}>
              <SendUp size={20} />
            </button>
          ) : (
            <button type="submit" class="btn primary" disabled={!peer || !text.trim()}>
              Send
            </button>
          )}
        </div>
        {!touch && <span class="muted small">Received text and images copy with one click. Enter sends, Shift + Enter adds a line.</span>}
      </form>
      {over && <div class="drop-overlay">Drop to send to {name}</div>}
    </main>
  );
}

function ItemCard({ item }: { item: Item }) {
  const { air, touch } = useApp();
  const mine = item.dir === 'out';
  const when = new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (item.kind === 'text') {
    const copy = async () => {
      const ok = await copyText(item.text ?? '');
      air.toast(ok ? 'Text copied' : "Couldn't copy", ok ? 'ok' : 'bad');
    };
    return (
      <div class={`item text ${mine ? 'mine' : ''}`}>
        <span class="muted small">{mine ? `You sent, ${when}` : `Text, ${when}`}</span>
        <p class="message">
          {linkify(item.text ?? '').map((part, i) =>
            part.href ? (
              <a key={i} href={part.href} target="_blank" rel="noopener noreferrer">
                {part.text}
              </a>
            ) : (
              part.text
            ),
          )}
        </p>
        {!mine && (
          <button type="button" class="btn sm self-start" onClick={copy}>
            <Copy size={15} />
            Copy text
          </button>
        )}
      </div>
    );
  }

  const file = item.file!;
  const image = Boolean(item.url);
  const kind = fileKind(file.type, file.name);

  const copy = async () => {
    const ok = await copyImage(file);
    air.toast(ok ? 'Image copied' : "This browser can't copy images; use Save instead", ok ? 'ok' : 'bad');
  };
  const save = () => downloadFile(file, item.url);
  const share = async () => {
    if ((await shareFile(file)) === 'unsupported') downloadFile(file, item.url);
  };

  return (
    <div class={`item file ${mine ? 'mine' : ''} ${image ? 'has-image' : ''}`}>
      {image && (
        <img
          class="preview"
          src={item.url}
          alt={file.name}
          title={touch ? undefined : 'Drag into any app'}
          draggable={!touch}
          onDragStart={(e) => {
            // Lets Chrome and Edge drop the picture as a real file into Explorer and other apps.
            e.dataTransfer?.setData('DownloadURL', `${file.type}:${file.name}:${item.url}`);
          }}
        />
      )}
      <div class={`file-meta ${touch ? 'stack-10' : 'row-10'}`}>
        <div class="row-10 grow min0">
          {!image && (
            <span class="file-tile">
              <KindIcon kind={kind} size={18} />
            </span>
          )}
          <div class="stack-2 min0 grow">
            <span class="file-name truncate">{file.name}</span>
            <span class="muted small">
              {mine ? `You sent, ${formatBytes(file.size)}` : formatBytes(file.size)}
            </span>
          </div>
        </div>
        {!mine &&
          (touch ? (
            <div class={image ? 'grid-3' : 'grid-2'}>
              {image && (
                <button type="button" class="btn primary" onClick={copy}>
                  <Copy size={16} />
                  Copy
                </button>
              )}
              <button type="button" class={`btn ${image ? '' : 'primary'}`} onClick={save}>
                <Download size={16} />
                Save
              </button>
              {canShareFile(file) && (
                <button type="button" class="btn" onClick={share}>
                  <Share size={16} />
                  Share
                </button>
              )}
            </div>
          ) : (
            <div class="row-6">
              {image && (
                <button type="button" class="btn primary sm" onClick={copy}>
                  <Copy size={15} />
                  Copy image
                  <kbd class="on-primary">{isMac ? '⌘C' : 'Ctrl+C'}</kbd>
                </button>
              )}
              <button
                type="button"
                class={image ? 'icon-btn' : 'btn primary sm'}
                aria-label={`Save ${file.name}`}
                title="Save as"
                onClick={save}
              >
                <Download size={16} />
                {!image && 'Save'}
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
