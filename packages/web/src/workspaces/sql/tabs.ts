import type { StateKind } from '../../shell/StatusIcon';
import type { SqlOutcome } from '../data-sources/SqlResult';

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
    }
  | {
      readonly kind: 'done';
      readonly outcome: SqlOutcome;
      /** The SQL it sent, for a refusal's words. */
      readonly sql: string;
      /** When it started, in ms since the epoch. */
      readonly at: number;
    };

export interface SqlTab {
  readonly id: string;
  readonly name: string;
  /** The one data source it runs on; '' until one is chosen. */
  readonly sourceId: string;
  readonly sql: string;
  /** Its parameters' values, by name (AC-451; their types come with T809). */
  readonly params: Readonly<Record<string, string>>;
  /** The text of its saved query, when it is one (T806 on). */
  readonly savedSql: string | null;
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
  | { readonly kind: 'select'; readonly id: string }
  | { readonly kind: 'rename'; readonly id: string; readonly name: string }
  | { readonly kind: 'duplicate'; readonly id: string }
  | { readonly kind: 'close'; readonly id: string }
  | { readonly kind: 'close-others'; readonly id: string }
  | { readonly kind: 'source'; readonly id: string; readonly sourceId: string }
  | { readonly kind: 'sql'; readonly id: string; readonly sql: string }
  | { readonly kind: 'run-start'; readonly id: string; readonly sql: string; readonly at: number }
  | {
      readonly kind: 'run-done';
      readonly id: string;
      /** The source it ran on: dropped if the tab has moved since (Q5). */
      readonly sourceId: string;
      readonly sql: string;
      readonly at: number;
      readonly outcome: SqlOutcome;
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
    case 'select':
      return target === undefined ? state : { ...state, active: target.id };
    case 'rename': {
      const name = action.name.trim();
      if (target === undefined || name === '') return state;
      return { ...state, tabs: state.tabs.map((tab) => (tab === target ? { ...tab, name } : tab)) };
    }
    case 'duplicate': {
      if (target === undefined) return state;
      const copy: SqlTab = {
        ...target,
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
    case 'run-start':
      return change(state, target, { run: { kind: 'running', at: action.at }, lastRunSql: action.sql });
    case 'run-done':
      // Only the run going now ends: never one of before the tab moved,
      // nor an earlier run's late answer (T802's review).
      return target?.sourceId !== action.sourceId ||
        target.run?.kind !== 'running' ||
        target.run.at !== action.at
        ? state
        : change(state, target, {
            run: { kind: 'done', outcome: action.outcome, sql: action.sql, at: action.at },
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

const count = (n: number) => n.toLocaleString('en');

/**
 * A tab's state as its icon and label (design 17, "Every state as an icon
 * and a label"), in the result head's words. T804 adds the seconds of a run
 * going and Cube Store still finishing.
 */
export function tabState(tab: SqlTab): { readonly kind: StateKind; readonly label: string } {
  const run = tab.run;
  if (run === null) return { kind: 'idle', label: 'Not run yet' };
  if (run.kind === 'running') return { kind: 'run', label: 'Running' };
  const done = run.outcome;
  switch (done.outcome) {
    case 'finished':
      return done.truncated === 'rows'
        ? { kind: 'warn', label: 'Limited to 10,000 rows' }
        : done.truncated === 'bytes'
          ? { kind: 'warn', label: 'Limited to 10 MB' }
          : {
              kind: 'ok',
              label: `Finished, ${count(done.rowCount)} ${done.rowCount === 1 ? 'row' : 'rows'}`,
            };
    case 'timeout':
      return { kind: 'err', label: 'Stopped at 30 seconds' };
    case 'cancelled':
      return { kind: 'cancel', label: 'Cancelled' };
    case 'failed':
      return { kind: 'err', label: 'Database error' };
    case 'busy':
      return { kind: 'warn', label: 'Busy' };
    default:
      return { kind: 'err', label: 'Not run' };
  }
}
