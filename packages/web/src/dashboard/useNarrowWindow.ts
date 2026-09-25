import { useSyncExternalStore } from 'react';

/**
 * direction.md §2, Breakpoints: "<1024: view mode only. Dashboards stack to
 * one column" (T250). The same width the stylesheet stacks the grid at.
 */
export const NARROW_QUERY = '(max-width: 1023.98px)';

function subscribe(onChange: () => void): () => void {
  const query = globalThis.matchMedia?.(NARROW_QUERY);
  if (query === undefined) return () => undefined;
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}

const isNarrow = () => globalThis.matchMedia?.(NARROW_QUERY).matches ?? false;

/**
 * Whether the window is narrower than 1,024 px, followed as it is resized: a
 * dashboard there is for reading, with no way into edit mode.
 */
export function useNarrowWindow(): boolean {
  return useSyncExternalStore(subscribe, isNarrow, () => false);
}
