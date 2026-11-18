import type { ComponentChildren } from 'preact';
import type { Route } from '../lib/link';
import logoOnDark from '../logo-on-dark.svg';
import logoOnLight from '../logo-on-light.svg';
import { useTheme } from './hooks';
import { Globe, Moon, Relay, Sun, Wifi } from './icons';

export function ThemeButton({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const [theme, toggle] = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      class={`icon-btn ghost ${size === 'lg' ? 'lg' : ''}`}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
      onClick={toggle}
    >
      {dark ? <Sun size={size === 'lg' ? 20 : 16} /> : <Moon size={size === 'lg' ? 20 : 16} />}
    </button>
  );
}

export function Logo() {
  const [theme] = useTheme();
  return <img class="logo" src={theme === 'dark' ? logoOnDark : logoOnLight} alt="CocoaAir" width={91} height={32} />;
}

export function Badge({ tone = 'accent', icon, children }: { tone?: 'accent' | 'ok' | 'bad' | 'plain'; icon?: ComponentChildren; children: ComponentChildren }) {
  return (
    <span class={`badge ${tone}`}>
      {icon}
      {children}
    </span>
  );
}

export function RouteBadge({ route }: { route: Route | undefined }) {
  if (route === 'lan') return <Badge tone="ok" icon={<Wifi size={14} />}>Direct over Wi‑Fi</Badge>;
  if (route === 'direct') return <Badge icon={<Globe size={14} />}>Direct over the internet</Badge>;
  if (route === 'relay') return <Badge tone="plain" icon={<Relay size={14} />}>Relayed</Badge>;
  return null;
}

export function Dot({ tone }: { tone: 'ok' | 'warn' | 'bad' }) {
  return <span class={`dot ${tone}`} aria-hidden="true" />;
}
