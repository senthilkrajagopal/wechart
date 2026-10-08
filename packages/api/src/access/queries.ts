import { objectsOf, type ChartDefinition } from '@wechart/core';

import { cubesOfChart, cubesOfDashboard } from '../model/bind';
import { ROOT_FOLDER_ID } from '../repos/catalog';

/**
 * What a query to Cube serves, and what it may name (T340, AC-268): every
 * query names its item, `for: { kind, id }`, and wechart checks it before
 * Cube is asked. The item must be one the user may open, and every member the
 * query names must be of a cube or view the item is bound to.
 */
export interface QueryItem {
  /** A proposal is its review view's: what it holds, which its reviewer can't open (T356). */
  readonly kind: 'dashboard' | 'chart' | 'proposal';
  readonly id: string;
}

const KINDS = new Set(['dashboard', 'chart', 'proposal']);

/**
 * The item a query names: undefined when it names none, null when what it
 * names can't be read as one.
 */
export function queryItemOf(value: unknown): QueryItem | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const { kind, id } = value as Record<string, unknown>;
  if (typeof kind !== 'string' || !KINDS.has(kind) || typeof id !== 'string' || id === '')
    return null;
  return { kind: kind as QueryItem['kind'], id };
}

/** The item a field list is asked for, as `?for=<kind>:<id>`. */
export function queryItemOfParam(value: unknown): QueryItem | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null;
  const colon = value.indexOf(':');
  return colon < 0
    ? null
    : queryItemOf({ kind: value.slice(0, colon), id: value.slice(colon + 1) });
}

/** The cube or view a member is of: what comes before its first dot. */
const cubeOf = (member: string): string =>
  member.indexOf('.') > 0 ? member.slice(0, member.indexOf('.')) : member;

const isPlain = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Every cube or view a Cube query names: its measures, dimensions, segments,
 * time dimensions, filters (nested `and` and `or` included), order, in either
 * of Cube's shapes, and join hints. Undefined for a query it can't read so,
 * which is refused rather than passed on (T340's review): not one object, or
 * a member that isn't a name.
 */
export function cubesQueried(query: unknown): string[] | undefined {
  if (!isPlain(query)) return undefined;
  const members: string[] = [];
  let readable = true;
  const name = (value: unknown) => {
    if (typeof value === 'string') members.push(value);
    else readable = false;
  };
  const list = (value: unknown, each: (item: unknown) => void) => {
    if (value === undefined) return;
    if (Array.isArray(value)) value.forEach(each);
    else readable = false;
  };
  for (const key of ['measures', 'dimensions', 'segments']) list(query[key], name);
  list(query['timeDimensions'], (each) => {
    if (isPlain(each)) name(each['dimension']);
    else readable = false;
  });
  const filters = (value: unknown): void => {
    if (!isPlain(value)) {
      readable = false;
      return;
    }
    if ('member' in value) name(value['member']);
    if ('dimension' in value) name(value['dimension']);
    list(value['and'], filters);
    list(value['or'], filters);
  };
  list(query['filters'], filters);
  const order = query['order'];
  if (Array.isArray(order))
    for (const each of order) {
      if (Array.isArray(each)) name(each[0]);
      else readable = false;
    }
  else if (isPlain(order)) members.push(...Object.keys(order));
  else if (order !== undefined) readable = false;
  // Cubes by name, joined in the order given (research/cube/data-apis.md).
  list(query['joinHints'], (hint) => list(hint, name));
  return readable ? [...new Set(members.map(cubeOf))] : undefined;
}

/** The cubes a stored chart's body is bound to: its source's and every other its members name. */
export function cubesOfChartBody(body: Record<string, unknown>): string[] {
  const chart = body['chart'] as ChartDefinition | undefined;
  if (typeof chart?.source?.cube !== 'string' || chart.source.cube === '') return [];
  const { source, others } = cubesOfChart(chart);
  return [source, ...others];
}

/** The cubes a dashboard's own body names: its filters and its text tiles' tokens. */
export const cubesOfDashboardBody = (body: Record<string, unknown>): string[] =>
  cubesOfDashboard(body);

/**
 * The cubes and views on a folder's path, by their published names: those
 * declared in each folder from it up to the root, each under its own name in
 * every folder (T709, AC-328), as the editor's picker
 * offers them (AC-329). A folder off the published tree (a workspace's)
 * reaches the shared root's alone, as its picker does.
 */
export async function cubesOnPath(
  folderId: string | null,
  published: {
    readonly ids: ReadonlyMap<string, string>;
    readonly parents: ReadonlyMap<string, string | null>;
  },
  filesOf: (folderId: string) => Promise<readonly { path: string; content: string }[]>,
): Promise<Set<string>> {
  const chain: string[] = [];
  for (
    let at: string | null | undefined = folderId;
    at !== null && at !== undefined && !chain.includes(at);
    at = published.parents.get(at)
  )
    chain.push(at);
  const path = chain.includes(ROOT_FOLDER_ID)
    ? chain.filter((each) => published.ids.has(each))
    : [ROOT_FOLDER_ID];
  const names = new Set<string>();
  for (const each of path)
    for (const file of await filesOf(each))
      for (const object of objectsOf(file.path, file.content).objects) names.add(object.name);
  return names;
}
