import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Air, AirState } from '../lib/air';
import { useStore } from '../lib/store';

export type View = { name: 'home' } | { name: 'chat'; peerId: string } | { name: 'transfer'; id: string };

export interface Ctx {
  air: Air;
  view: View;
  go: (view: View) => void;
  touch: boolean;
  /** Opens the file picker and sends the chosen files to a device. */
  pickFiles: (peerId: string, mode: 'files' | 'media') => void;
}

export const AppContext = createContext<Ctx>(null as unknown as Ctx);

export function useApp(): Ctx {
  return useContext(AppContext);
}

export function useAir<T>(select: (s: AirState) => T): T {
  const { air } = useApp();
  return useStore(air.store, select);
}
