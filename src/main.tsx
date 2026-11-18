import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import './styles/tokens.css';
import './styles/app.css';
import { render } from 'preact';
import { Air } from './lib/air';
import { App } from './ui/App';

const air = new Air();
air.start();
render(<App air={air} />, document.getElementById('app')!);

// Lets the browser offer "Install app" and keeps the shell available offline.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
