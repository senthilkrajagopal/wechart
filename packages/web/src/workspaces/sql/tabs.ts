import type { StateKind } from '../../shell/StatusIcon';
import type { SqlOutcome } from '../data-sources/SqlResult';
import type { ParamType } from './parameterNames';
import { runState } from './runState';

/**
 * The SQL runner workspace's editor tabs (T800, AC-450; design 17, pin 7 and
 * state D): each bound to exactly one data source, its SQL kept when that
 * source changes and its result cleared (Q5), its state an icon on the tab
 * with its label in the tooltip and accessible name (Q6). Kept in this
 * browser only (T801, AC-451); nothing here is sent to wechart's server.
 */

/** A run on a tab: going, or how it ended, in the result's own words. */
export type TabRun =
  | {
      readonly kind: 'running';
      /** When it started, in ms since the epoch: which run a result is of. */
      readonly at: number;
      /**
       * Kept from a page since left (a reload's, or this one's before Back
       * brought it again), so no answer comes to it: since when, in ms since
       * the epoch, it is followed through wechart's server (T804, AC-452).
       */
      readonly kept?: number;
    }
  | {
      readonly kind: 'done';
      readonly outcome: SqlOutcome;
      /** The SQL it sent, for a refusal's words. */
      readonly sql: string;
      /** When it started, in ms since the epoch. */
      readonly at: number;
      /** When its answer came: what is heard of it after is news (T548, T804). */
      readonly answeredAt?: number;
      /** Ended while the user was away: how, from History, its rows not kept (T804). */
      readonly away?: true;
    };

/** A saved query, as a tab holds it: its id, and the name and description Save keeps (T812). */
export interface SavedAs {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface SqlTab {
  readonly id: string;
  readonly name: string;
  /** The one data source it runs on; '' until one is chosen. */
  readonly sourceId: string;
  readonly sql: string;
  /** Its parameters' values, by name (AC-451). */
  readonly params: Readonly<Record<string, string>>;
  /** Their types, by name, where not Text (T809, AC-453). */
  readonly paramTypes?: Readonly<Record<string, ParamType>>;
  /** The text of its saved query, when it is one (T806 on). */
  readonly savedSql: string | null;
  /** The saved query it is, once saved or opened (T812, AC-457). */
  readonly saved?: SavedAs;
  /** The SQL its last run sent. */
  readonly lastRunSql: string | null;
  readonly run: TabRun | null;
}

export interface TabsState {
  readonly tabs: readonly SqlTab[];
  /** The open tab's id. */
  readonly active: string;
}

export type TabsAction =
  | { readonly kind: 'add' }
  /** A new tab, last, on a source and holding SQL: Preview 100 rows' (T807). */
  | {
      readonly kind: 'open';
      readonly sourceId: string;
      readonly sql: string;
      readonly name: string;
      /** Its id, where the opener must know it: to run it as it opens. */
      readonly id?: string;
    }
  | { readonly kind: 'select'; readonly id: string }
  | { readonly kind: 'rename'; readonly id: string; readonly name: string }
  | { readonly kind: 'duplicate'; readonly id: string }
  | { readonly kind: 'close'; readonly id: string }
  | { readonly kind: 'close-others'; readonly id: string }
  | { readonly kind: 'source'; readonly id: string; readonly sourceId: string }
  | { readonly kind: 'sql'; readonly id: string; readonly sql: string }
  /** A parameter's value, or its type, set in the strip (T809). */
  | { readonly kind: 'param-value'; readonly id: string; readonly name: string; readonly value: string }
  | { readonly kind: 'param-type'; readonly id: string; readonly name: string; readonly type: ParamType }
  /** Saved as this query, holding this SQL (T812). */
  | { readonly kind: 'saved'; readonly id: string; readonly saved: SavedAs; readonly sql: string }
  | { readonly kind: 'run-start'; readonly id: string; readonly sql: string; readonly at: number }
  /** The page came back from the browser's cache: runs going lost their answer (T804). */
  | { readonly kind: 'runs-kept'; readonly at: number }
  | {
      readonly kind: 'run-done';
      readonly id: string;
      /** The source it ran on: dropped if the tab has moved since (Q5). */
      readonly sourceId: string;
      readonly sql: string;
      readonly at: number;
      readonly outcome: SqlOutcome;
      readonly answeredAt?: number;
      readonly away?: true;
    };

/** A tab's id: short, for the address (`/sql?tab=7f3a9c01`, T801). */
export const newTabId = (): string => {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const blank = (id: string, name: string, sourceId: string): SqlTab => ({
  id,
  name,
  sourceId,
  sql: '',
  params: {},
  savedSql: null,
  lastRunSql: null,
  run: null,
});

/** A first visit: one tab, "Query 1", on no data source (AC-466). */
export const firstTabs = (makeId: () => string = newTabId): TabsState => {
  const id = makeId();
  return { tabs: [blank(id, 'Query 1', '')], active: id };
};

/** "Query n", one past the highest such name open. */
const nextName = (tabs: readonly SqlTab[]): string => {
  const highest = tabs.reduce((most, tab) => {
    const numbered = /^Query (\d+)$/.exec(tab.name);
    return numbered === null ? most : Math.max(most, Number(numbered[1]));
  }, 0);
  return `Query ${String(highest + 1)}`;
};

const openTab = (state: TabsState): SqlTab | undefined =>
  state.tabs.find((tab) => tab.id === state.active) ?? state.tabs[0];

export function tabsReducer(
  state: TabsState,
  action: TabsAction,
  makeId: () => string = newTabId,
): TabsState {
  const at = 'id' in action ? state.tabs.findIndex((tab) => tab.id === action.id) : -1;
  const target = state.tabs[at];
  switch (action.kind) {
    case 'add': {
      // On the current tab's data source (AC-450).
      const id = makeId();
      return {
        tabs: [...state.tabs, blank(id, nextName(state.tabs), openTab(state)?.sourceId ?? '')],
        active: id,
      };
    }
    case 'open': {
      const id = action.id ?? makeId();
      return {
        tabs: [...state.tabs, { ...blank(id, action.name, action.sourceId), sql: action.sql }],
        active: id,
      };
    }
    case 'select':
      return target === undefined ? state : { ...state, active: target.id };
    case 'rename': {
      const name = action.name.trim();
      if (target === undefined || name === '') return state;
      return { ...state, tabs: state.tabs.map((tab) => (tab === target ? { ...tab, name } : tab)) };
    }
    case 'duplicate': {
      if (target === undefined) return state;
      // A copy is a new query: Save on it never updates the saved one (T812).
      const { saved: _saved, ...unsaved } = target;
      const copy: SqlTab = {
        ...unsaved,
        id: makeId(),
        name: `${target.name} (copy)`,
        savedSql: null,
        lastRunSql: null,
        run: null,
      };
      return { tabs: [...state.tabs.slice(0, at + 1), copy, ...state.tabs.slice(at + 1)], active: copy.id };
    }
    case 'close': {
      if (target === undefined) return state;
      const rest = state.tabs.filter((tab) => tab !== target);
      // Never no tab: a fresh "Query 1" on the closed one's source (lane SQL's call).
      if (rest.length === 0) {
        const id = makeId();
        return { tabs: [blank(id, 'Query 1', target.sourceId)], active: id };
      }
      if (target.id !== state.active) return { ...state, tabs: rest };
      return { tabs: rest, active: (rest[at] ?? rest[at - 1] ?? rest[0])?.id ?? '' };
    }
    case 'close-others':
      return target === undefined ? state : { tabs: [target], active: target.id };
    case 'source':
      // The SQL kept, the result cleared, at once (design 17's Q5); the
      // same source chosen again changes nothing (T800's review).
      return target === undefined || target.sourceId === action.sourceId
        ? state
        : {
            ...state,
            tabs: state.tabs.map((tab) =>
              tab === target ? { ...tab, sourceId: action.sourceId, run: null } : tab,
            ),
          };
    case 'sql':
      return change(state, target, { sql: action.sql });
    case 'param-value':
      return target === undefined
        ? state
        : change(state, target, { params: { ...target.params, [action.name]: action.value } });
    case 'saved':
      return change(state, target, { saved: action.saved, savedSql: action.sql });
    case 'param-type':
      return target === undefined
        ? state
        : change(state, target, { paramTypes: { ...target.paramTypes, [action.name]: action.type } });
    case 'run-start':
      return change(state, target, { run: { kind: 'running', at: action.at }, lastRunSql: action.sql });
    case 'runs-kept': {
      const going = state.tabs.filter((tab) => tab.run?.kind === 'running' && tab.run.kept === undefined);
      if (going.length === 0) return state;
      return {
        ...state,
        tabs: state.tabs.map((tab) =>
          going.includes(tab) && tab.run?.kind === 'running'
            ? { ...tab, run: { ...tab.run, kept: action.at } }
            : tab,
        ),
      };
    }
    case 'run-done':
      // Only the run going now ends: never one of before the tab moved,
      // nor an earlier run's late answer (T802's review).
      return target?.sourceId !== action.sourceId ||
        target.run?.kind !== 'running' ||
        target.run.at !== action.at
        ? state
        : change(state, target, {
            run: {
              kind: 'done',
              outcome: action.outcome,
              sql: action.sql,
              at: action.at,
              ...(action.answeredAt === undefined ? {} : { answeredAt: action.answeredAt }),
              ...(action.away === true ? { away: true as const } : {}),
            },
          });
  }
}

/** One tab changed, the rest kept. */
const change = (state: TabsState, target: SqlTab | undefined, to: Partial<SqlTab>): TabsState =>
  target === undefined
    ? state
    : { ...state, tabs: state.tabs.map((tab) => (tab === target ? { ...tab, ...to } : tab)) };

/** Whether closing it loses text: neither saved nor what it last ran (AC-450). */
export const asksBeforeClosing = (tab: SqlTab): boolean =>
  tab.sql.trim() !== '' && tab.sql !== tab.savedSql && tab.sql !== tab.lastRunSql;

/**
 * A tab's state as its icon and label (design 17, "Every state as an icon
 * and a label"): its run's, as the result head and History say it (T804,
 * AC-452), with a finished run's rows ("Finished, 1,284 rows", AC-450).
 */
export function tabState(
  tab: SqlTab,
  now: number = Date.now(),
  stillFinishing = false,
): { readonly kind: StateKind; readonly label: string } {
  const { kind, label, rows } = runState(tab.run, now, stillFinishing);
  return { kind, label: rows === null ? label : `${label}, ${rows}` };
}
