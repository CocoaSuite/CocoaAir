import type { Transfer } from '../lib/air';
import type { Route } from '../lib/link';
import { fileKind, formatBytes, formatEta } from './actions';
import { RouteBadge, ThemeButton } from './Common';
import { useAir, useApp } from './context';
import { Back, Check, KindIcon } from './icons';

const LIVE = ['connecting', 'waiting', 'asking', 'active'];

export function TransferView({ id }: { id: string }) {
  const { air, go, touch, pickFiles } = useApp();
  const t = useAir((s) => s.transfers.find((x) => x.id === id));
  const route = useAir((s) => (t ? s.routes[t.peerId] : undefined));

  if (!t) {
    return (
      <main class="screen">
        <SubHeader title="Transfer" onBack={() => go({ name: 'home' })} />
        <p class="muted">This transfer is no longer available.</p>
      </main>
    );
  }

  const pct = t.total ? Math.min(100, Math.floor((t.bytes / t.total) * 100)) : t.status === 'done' ? 100 : 0;
  const live = LIVE.includes(t.status);
  const sending = t.dir === 'out';

  return (
    <main class="screen transfer">
      <SubHeader
        eyebrow={sending ? 'Sending to' : 'Receiving from'}
        title={t.peerName}
        onBack={() => go({ name: 'home' })}
        route={route}
      />

      <div class="card stack-12 pad-18">
        <div class="row-between baseline">
          <span class="big-number">{t.status === 'done' ? 'Done' : `${pct}%`}</span>
          <span class="muted small num">
            {formatBytes(t.bytes)} of {formatBytes(t.total)}
          </span>
        </div>
        <div
          class={`bar ${t.status === 'done' ? 'ok' : ''} ${!live && t.status !== 'done' ? 'stopped' : ''}`}
          role="progressbar"
          aria-label="Overall progress"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
        <div class="row-between small fg2">
          <span>{statusLine(t)}</span>
          <span class="num">{t.status === 'active' && t.speed > 0 ? `${formatBytes(t.speed)}/s` : ''}</span>
        </div>
        {t.status === 'active' && t.speed > 0 && <span class="muted small">{formatEta((t.total - t.bytes) / t.speed)}</span>}
      </div>

      <div class="card file-list shrink-scroll">
        {t.files.map((f, i) => {
          const got = t.fileBytes[i] ?? 0;
          const done = got >= f.size && (f.size > 0 || t.status === 'done');
          const partial = !done && got > 0;
          return (
            <div class="file-row" key={i}>
              <span class={`file-tile ${partial ? 'accent' : ''}`}>
                <KindIcon kind={fileKind(f.type, f.name)} size={18} />
              </span>
              <div class="stack-4 grow min0">
                <div class="row-between">
                  <span class="file-name truncate">{f.name}</span>
                  {partial && (
                    <span class="muted small num nowrap">
                      {formatBytes(t.fileBytes[i] ?? 0)} of {formatBytes(f.size)}
                    </span>
                  )}
                </div>
                {partial ? (
                  <div class="bar thin">
                    <span style={{ width: `${Math.floor(((t.fileBytes[i] ?? 0) / Math.max(1, f.size)) * 100)}%` }} />
                  </div>
                ) : (
                  !done && <span class="muted small">{formatBytes(f.size)}</span>
                )}
                {done && <span class="muted small">{formatBytes(f.size)}</span>}
              </div>
              {done ? (
                <span class="ok-text small row-4">
                  <Check size={14} />
                  {sending ? 'Sent' : 'Received'}
                </span>
              ) : (
                !partial && <span class="muted small">{live ? 'Queued' : ''}</span>
              )}
            </div>
          );
        })}
      </div>

      <div class="spacer" />
      {touch && live && <p class="muted small center">Keep this page open until the transfer finishes.</p>}
      <div class="row-8 actions">
        {live ? (
          <>
            {sending && !touch && (
              <button type="button" class="btn grow" onClick={() => pickFiles(t.peerId, 'files')}>
                Add more files
              </button>
            )}
            <button type="button" class="btn danger grow" onClick={() => air.cancel(t.id)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            {t.status === 'done' && (
              <button type="button" class="btn grow" onClick={() => go({ name: 'chat', peerId: t.peerId })}>
                {sending ? 'Open conversation' : 'View files'}
              </button>
            )}
            <button
              type="button"
              class="btn primary grow"
              onClick={() => {
                air.dismissTransfer(t.id);
                go({ name: 'home' });
              }}
            >
              Done
            </button>
          </>
        )}
      </div>
    </main>
  );
}

function statusLine(t: Transfer): string {
  switch (t.status) {
    case 'connecting':
      return 'Connecting…';
    case 'waiting':
      return `Waiting for ${t.peerName} to accept…`;
    case 'asking':
      return 'Waiting for you to accept…';
    case 'active':
      return t.dir === 'out' ? 'Sending…' : 'Receiving…';
    case 'done':
      return t.dir === 'out' ? `Sent to ${t.peerName}` : `Received from ${t.peerName}`;
    case 'declined':
      return t.dir === 'out' ? `${t.peerName} declined` : 'You declined';
    case 'cancelled':
      return 'Cancelled';
    case 'failed':
      return t.error ?? 'Something went wrong';
  }
}

/** Back button, title and theme switch. Phones show the connection type as text, so the name has room. */
export function SubHeader({ eyebrow, title, onBack, route }: { eyebrow?: string; title: string; onBack: () => void; route?: Route }) {
  const { touch } = useApp();
  const routeText = route && route !== 'unknown' ? ROUTE_TEXT[route] : '';
  return (
    <header class="subheader">
      <button type="button" class={`icon-btn ${touch ? 'lg' : ''}`} aria-label="Back to devices" onClick={onBack}>
        <Back size={touch ? 18 : 16} />
      </button>
      <div class="stack-2 grow min0">
        {(eyebrow || (touch && routeText)) && (
          <span class="eyebrow truncate">{touch && routeText ? [eyebrow, routeText].filter(Boolean).join(', ') : eyebrow}</span>
        )}
        <span class="sub-title truncate">{title}</span>
      </div>
      {!touch && <RouteBadge route={route} />}
      <ThemeButton size={touch ? 'lg' : 'sm'} />
    </header>
  );
}

const ROUTE_TEXT: Record<Exclude<Route, 'unknown'>, string> = {
  lan: 'direct over Wi‑Fi',
  direct: 'direct over the internet',
  relay: 'relayed',
};
