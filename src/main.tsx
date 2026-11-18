import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import './styles/tokens.css';
import './styles/app.css';
import { render } from 'preact';
import { Air } from './lib/air';
import { desktop } from './lib/desktop';
import { App } from './ui/App';

// Installed on a desktop, the window's own minimise, maximise and close buttons sit inside
// CocoaAir's header (Window Controls Overlay) instead of a separate title bar.
// The desktop app always draws its buttons over the header.
const wco = window.matchMedia('(display-mode: window-controls-overlay)');
const overlay = (navigator as Navigator & { windowControlsOverlay?: WindowControlsOverlayLike }).windowControlsOverlay;
const syncWco = () => {
  const on = wco.matches || Boolean(desktop && desktop.platform !== 'darwin') || Boolean(overlay?.visible);
  document.documentElement.classList.toggle('wco', on);
  document.documentElement.classList.toggle('mac-app', desktop?.platform === 'darwin');
  // Where env(titlebar-area-*) is missing, the measured strip stands in for it.
  const rect = overlay?.getTitlebarAreaRect?.();
  if (rect && rect.width > 0) {
    const root = document.documentElement.style;
    root.setProperty('--wco-x', `${rect.x}px`);
    root.setProperty('--wco-w', `${rect.width}px`);
    root.setProperty('--wco-h', `${rect.height}px`);
  }
};
syncWco();
wco.addEventListener('change', syncWco);
overlay?.addEventListener?.('geometrychange', syncWco);
desktop?.setTheme(document.documentElement.classList.contains('light') ? 'light' : 'dark');

interface WindowControlsOverlayLike extends EventTarget {
  visible: boolean;
  getTitlebarAreaRect(): DOMRect;
}

const air = new Air();
air.start();
render(<App air={air} />, document.getElementById('app')!);

// Lets the browser offer "Install app" and keeps the shell available offline.
if ('serviceWorker' in navigator && import.meta.env.PROD && !desktop) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
