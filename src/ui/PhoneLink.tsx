import QRCode from 'qrcode';
import { useEffect, useState } from 'preact/hooks';
import { desktop } from '../lib/desktop';
import { copyText } from './actions';
import { useApp } from './context';
import { Copy } from './icons';

/** Hook for the QR code of a link, as SVG markup. */
export function useQr(link: string | null | undefined): string {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    if (!link) return setSvg('');
    let live = true;
    QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#101828', light: '#ffffff' } })
      .then((s) => live && setSvg(s))
      .catch(() => setSvg(''));
    return () => {
      live = false;
    };
  }, [link]);
  return svg;
}

/**
 * Desktop app only: how a phone on the same Wi-Fi opens CocoaAir. The PC serves the app itself,
 * so scanning the code with the phone's camera is all it takes.
 */
export function PhoneLink({ compact = false }: { compact?: boolean }) {
  const { air } = useApp();
  const url = desktop?.info.phoneUrl ?? null;
  const qr = useQr(url);
  if (!url) {
    return <span class="muted small">Connect this PC to Wi‑Fi to add a phone.</span>;
  }
  return (
    <div class={`phone-link ${compact ? '' : 'card'}`}>
      {qr ? <div class="qr" role="img" aria-label={`QR code for ${url}`} dangerouslySetInnerHTML={{ __html: qr }} /> : <div class="qr placeholder" />}
      <div class="stack-6 min0">
        <span class="strong">Add your phone</span>
        <span class="muted small lh">Scan with the phone's camera, or open this address in its browser. The phone must be on the same Wi‑Fi.</span>
        <div class="row-6">
          <span class="phone-url">{url}</span>
          <button
            type="button"
            class="icon-btn"
            aria-label="Copy address"
            title="Copy"
            onClick={async () => {
              if (await copyText(url)) air.toast('Address copied', 'ok');
            }}
          >
            <Copy size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
