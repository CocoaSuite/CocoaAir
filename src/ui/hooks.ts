import { desktop } from '../lib/desktop';
import { useEffect, useState } from 'preact/hooks';

const THEME_KEY = 'ca-theme';

export type Theme = 'dark' | 'light';

export function currentTheme(): Theme {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

/** The theme switch. The choice is remembered; until then the device's own setting decides (see public/theme.js). */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  useEffect(() => {
    const onChange = () => setTheme(currentTheme());
    window.addEventListener('air:theme', onChange);
    return () => window.removeEventListener('air:theme', onChange);
  }, []);
  const toggle = () => {
    const next: Theme = currentTheme() === 'light' ? 'dark' : 'light';
    document.documentElement.classList.toggle('light', next === 'light');
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private mode */
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', next === 'light' ? '#f3f5f9' : '#121212');
    desktop?.setTheme(next);
    window.dispatchEvent(new Event('air:theme'));
  };
  return [theme, toggle];
}

export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatch(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return match;
}

/** Phones and tablets get the touch layout (radar, big buttons); mouse-driven windows get the compact list. */
export function useTouch(): boolean {
  return useMedia('(pointer: coarse)');
}

export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
