import type { ParamType } from './parameterNames';
import type { SqlTab, TabsState } from './tabs';

/**
 * The SQL runner's open tabs, kept in this browser only, for the signed-in
 * user (T801, AC-451; design 17, D5): each one's name, data source, SQL and
 * parameters, and which is open, under a key holding who is signed in, so
 * another user of the same browser sees none of them. A run's result isn't
 * kept, only that one is going (T804), and nothing of a tab is ever sent to
 * wechart's server.
 */
export const tabsKeyOf = (user: string): string => `wechart.sql.tabs.${user}`;

const isText = (value: unknown): value is string => typeof value === 'string';
const isTextOrNull = (value: unknown): value is string | null => value === null || isText(value);

const TYPES: ReadonlySet<unknown> = new Set<ParamType>(['text', 'number', 'date', 'boolean']);
/** Its parameters' kept types (T809), those of the four types only; none kept, none. */
function typesOf(value: unknown): { paramTypes?: Record<string, ParamType> } {
  if (typeof value !== 'object' || value === null) return {};
  const types = Object.entries(value).filter((entry): entry is [string, ParamType] => TYPES.has(entry[1]));
  return types.length === 0 ? {} : { paramTypes: Object.fromEntries(types) };
}

/** One kept tab, when it has a tab's shape; its result, none. */
function tabOf(value: unknown): SqlTab | null {
  if (typeof value !== 'object' || value === null) return null;
  const kept = value as Record<string, unknown>;
  const params = kept.params;
  if (
    !isText(kept.id) ||
    kept.id === '' ||
    !isText(kept.name) ||
    !isText(kept.sourceId) ||
    !isText(kept.sql) ||
    !isTextOrNull(kept.savedSql) ||
    !isTextOrNull(kept.lastRunSql) ||
    typeof params !== 'object' ||
    params === null ||
    !Object.values(params).every(isText)
  )
    return null;
  return {
    id: kept.id,
    name: kept.name,
    sourceId: kept.sourceId,
    sql: kept.sql,
    params: params as Record<string, string>,
    ...typesOf(kept.paramTypes),
    savedSql: kept.savedSql,
    lastRunSql: kept.lastRunSql,
    run: runOf(kept.run),
  };
}

/**
 * A kept run going, as one this page didn't start (T804, AC-452): leaving
 * the workspace loads another page, and the run goes on. A result isn't kept.
 */
function runOf(value: unknown): SqlTab['run'] {
  if (typeof value !== 'object' || value === null) return null;
  const { kind, at } = value as Record<string, unknown>;
  return kind === 'running' && typeof at === 'number' && Number.isFinite(at)
    ? { kind: 'running', at, kept: Date.now() }
    : null;
}

/** The user's kept tabs, or none: none kept, none readable, or no storage at all. */
export function keptTabs(storage: Storage | undefined, user: string): TabsState | null {
  let text: string | null;
  try {
    text = storage?.getItem(tabsKeyOf(user)) ?? null;
  } catch {
    return null;
  }
  if (text === null) return null;
  let kept: unknown;
  try {
    kept = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof kept !== 'object' || kept === null) return null;
  const { tabs, active } = kept as { tabs?: unknown; active?: unknown };
  if (!Array.isArray(tabs)) return null;
  const read = tabs.map(tabOf);
  const whole = read.filter((each): each is SqlTab => each !== null);
  if (whole.length === 0 || whole.length !== read.length) return null;
  const open = whole.find((each) => each.id === active) ?? whole[0];
  return open === undefined ? null : { tabs: whole, active: open.id };
}

/** Keeps the user's tabs; a browser that keeps nothing keeps them for this page only. */
export function keepTabs(storage: Storage | undefined, user: string, state: TabsState): void {
  const tabs = state.tabs.map((tab) => ({
    id: tab.id,
    name: tab.name,
    sourceId: tab.sourceId,
    sql: tab.sql,
    params: tab.params,
    ...(tab.paramTypes === undefined ? {} : { paramTypes: tab.paramTypes }),
    savedSql: tab.savedSql,
    lastRunSql: tab.lastRunSql,
    ...(tab.run?.kind === 'running' ? { run: { kind: 'running', at: tab.run.at } } : {}),
  }));
  try {
    storage?.setItem(tabsKeyOf(user), JSON.stringify({ tabs, active: state.active }));
  } catch {
    // Private browsing, or full: kept for this page only.
  }
}
