import { tabsReducer, type TabsAction, type TabsState } from './tabs';

/**
 * The workspace's tabs while this page lives (T804, AC-452): held outside
 * React, so a run started before the user leaves for another workspace
 * still lands in its tab, and their return shows it going, or how it ended.
 * localStorage keeps the rest of a tab (T801); a run is kept only here.
 *
 * A user's store stays after the workspace closes only while one of its
 * tabs has a run going, or one ended unseen; the next opening takes it.
 */
export interface TabsStore {
  readonly get: () => TabsState;
  readonly dispatch: (action: TabsAction) => void;
  readonly subscribe: (listener: () => void) => () => void;
  /** Whether closing the workspace would lose a run: one going, or one ended unseen. */
  readonly holdsARun: () => boolean;
}

const live = new Map<string, TabsStore>();

// Back to a page the browser kept whole: leaving dropped its runs' requests,
// so each run going is followed through wechart's server from now (T804).
if (typeof window !== 'undefined')
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    for (const store of live.values()) store.dispatch({ kind: 'runs-kept', at: Date.now() });
  });

function storeOf(start: TabsState): TabsStore {
  let state = start;
  /** A run that ended with no workspace open to show it. */
  let endedUnseen = false;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    dispatch: (action) => {
      const next = tabsReducer(state, action);
      if (next === state) return;
      state = next;
      if (action.kind === 'run-done' && listeners.size === 0) endedUnseen = true;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      endedUnseen = false;
      return () => {
        listeners.delete(listener);
      };
    },
    holdsARun: () => endedUnseen || state.tabs.some((tab) => tab.run?.kind === 'running'),
  };
}

/** The user's store: the one kept from their last visit, or a new one from `opening`. */
export function tabsStoreFor(user: string, opening: () => TabsState): TabsStore {
  const kept = live.get(user);
  if (kept !== undefined) return kept;
  const made = storeOf(opening());
  live.set(user, made);
  return made;
}

/** The workspace (re)opened on this store: kept until it closes again. */
export function holdTabs(user: string, store: TabsStore): void {
  live.set(user, store);
}

/** Every store let go, as a new page has none: for tests, whose runs may never end. */
export function forgetLiveTabs(): void {
  live.clear();
}

/** The workspace closed: its store kept only while it holds a run. */
export function releaseTabs(user: string, store: TabsStore): void {
  if (live.get(user) === store && !store.holdsARun()) live.delete(user);
}
