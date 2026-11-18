import { useEffect, useRef, useState } from 'preact/hooks';

/**
 * A tiny observable store. Updates are coalesced so a fast transfer does not re-render the
 * page for every chunk.
 */
export class Store<S> {
  private listeners = new Set<() => void>();
  private pending: ReturnType<typeof setTimeout> | null = null;

  constructor(private state: S) {}

  get(): S {
    return this.state;
  }

  set(patch: Partial<S> | ((s: S) => Partial<S>), urgent = true): void {
    const next = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...next };
    if (urgent) {
      if (this.pending) clearTimeout(this.pending);
      this.pending = null;
      this.emit();
    } else if (!this.pending) {
      this.pending = setTimeout(() => {
        this.pending = null;
        this.emit();
      }, 80);
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

/** Re-renders when the store changes; the selector may close over props. */
export function useStore<S, T>(store: Store<S>, select: (s: S) => T): T {
  const [, force] = useState(0);
  const selectRef = useRef(select);
  selectRef.current = select;
  useEffect(() => store.subscribe(() => force((n) => n + 1)), [store]);
  return selectRef.current(store.get());
}
