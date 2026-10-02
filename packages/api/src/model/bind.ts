import { textRenamed, tokenMembersOf, type ChartDefinition } from '@wechart/core';

import type { XcubeAdmin } from '../xcube/client';

/**
 * A chart's and a dashboard's cubes bound at publish (T429, AC-272; research
 * `xcube-slice-3a.md`, "POST …/resolve" and "GET …/items").
 *
 * The cube a chart starts from is asked of xcube's resolver, nearest first
 * from the folder the chart is published into up to the root: a descendant's
 * or a sibling's is never on that path. Every other cube the chart uses is
 * bound as the source cube's own bindings have it, followed along theirs, so
 * the chart joins as its cube does; one they don't reach is asked of the
 * resolver too. A name found nowhere on the path is refused, by name.
 *
 * What is stored is each cube's full published name: the root's is its short
 * name, another folder's `<folderId>__<shortName>` (AC-328). A name stored
 * already full is bound by its short name, as a chart brought into another
 * folder must bind that folder's.
 */

/** An xcube folder id's prefix on a full name (research 3a, "Names"). */
const FOLDER_PREFIX = /^f[a-z0-9]{1,40}__/;

/** A cube's short name: its full name without its folder's id. */
export const shortOf = (name: string): string => name.replace(FOLDER_PREFIX, '');

/** The xcube folder a full name is in, by its prefix: none for the root's, which has none. */
export const xcubeFolderOf = (name: string): string | null =>
  FOLDER_PREFIX.exec(name)?.[0].slice(0, -'__'.length) ?? null;

export type Binding =
  /** Each name as stored, where it binds to another full name, to that name. */
  | { readonly kind: 'bound'; readonly renames: ReadonlyMap<string, string> }
  /** The short names no folder on the path holds. */
  | { readonly kind: 'refused'; readonly names: readonly string[] };

/** The cube a member is of: what comes before its first dot. */
const cubeOf = (member: string): string | undefined => {
  const dot = member.indexOf('.');
  return dot > 0 ? member.slice(0, dot) : undefined;
};

/**
 * The cubes a chart names: the one it starts from, and every other its
 * members are of, in its wells, encoding, grains and filters, in that order.
 */
export function cubesOfChart(chart: ChartDefinition): { source: string; others: string[] } {
  // A stored chart may lack a well, as `readChartDocument` reads it (T429's review).
  const wells: Partial<ChartDefinition['wells']> = chart.wells ?? {};
  const members = [
    ...(wells.measures ?? []),
    ...(wells.dimensions ?? []),
    ...(wells.timeDimensions ?? []),
    ...(wells.eachPointIs === undefined ? [] : [wells.eachPointIs]),
    ...Object.values(chart.encoding ?? {}).flat(),
    ...Object.keys(chart.granularities ?? {}),
    ...(chart.filters ?? []).map((filter) => filter.member),
  ];
  const others: string[] = [];
  for (const member of members) {
    const cube = cubeOf(member);
    if (cube !== undefined && cube !== chart.source.cube && !others.includes(cube))
      others.push(cube);
  }
  return { source: chart.source.cube, others };
}

/**
 * A chart's cubes bound in a folder, by its xcube id: the source by the
 * resolver, the rest by the source's bindings, then the resolver.
 */
export async function bindChart(
  xcube: Pick<XcubeAdmin, 'resolve' | 'items'>,
  folderId: string,
  chart: ChartDefinition,
): Promise<Binding> {
  const { source, others } = cubesOfChart(chart);
  const bound = (await xcube.resolve(folderId, [shortOf(source)])).get(shortOf(source));
  if (bound === null || bound === undefined) return { kind: 'refused', names: [shortOf(source)] };

  // What the source item bound at its publish, and what those bound, and so on.
  const byFullName = new Map((await xcube.items()).map((item) => [item.fullName, item]));
  const reached = new Map<string, string>();
  const queue = [bound];
  for (let at = 0; at < queue.length; at += 1) {
    for (const [name, full] of Object.entries(byFullName.get(queue[at]!)?.bindings ?? {})) {
      if (!reached.has(name)) reached.set(name, full);
      if (!queue.includes(full)) queue.push(full);
    }
  }
  const unreached = others.map(shortOf).filter((name) => !reached.has(name));
  if (unreached.length > 0)
    for (const [name, full] of await xcube.resolve(folderId, unreached))
      if (full !== null) reached.set(name, full);
  const missing = others.map(shortOf).filter((name) => !reached.has(name));
  if (missing.length > 0) return { kind: 'refused', names: missing };

  const renames = new Map<string, string>();
  if (bound !== source) renames.set(source, bound);
  for (const other of others) {
    const full = reached.get(shortOf(other))!;
    if (full !== other) renames.set(other, full);
  }
  return { kind: 'bound', renames };
}

/**
 * A dashboard's own cubes bound in a folder (T429, AC-272): each its filters'
 * members are of, by the resolver, having no source cube to follow.
 */
export async function bindNames(
  xcube: Pick<XcubeAdmin, 'resolve'>,
  folderId: string,
  names: readonly string[],
): Promise<Binding> {
  if (names.length === 0) return { kind: 'bound', renames: new Map() };
  const found = await xcube.resolve(folderId, [...new Set(names.map(shortOf))]);
  const missing = [...found].filter(([, full]) => full === null).map(([name]) => name);
  if (missing.length > 0) return { kind: 'refused', names: missing };
  const renames = new Map<string, string>();
  for (const name of names) {
    const full = found.get(shortOf(name))!;
    if (full !== name) renames.set(name, full);
  }
  return { kind: 'bound', renames };
}

/** A member of a renamed cube, renamed (`sales.count` → `fab__sales.count`); anything else as it is. */
const memberRenamed =
  (renames: ReadonlyMap<string, string>) =>
  (member: string): string => {
    const cube = cubeOf(member);
    const to = cube === undefined ? undefined : renames.get(cube);
    return to === undefined ? member : `${to}${member.slice(cube!.length)}`;
  };

/**
 * A chart with each reference to a renamed cube renamed, where a chart
 * keeps them (T429's review): its source, its wells, its encoding, its
 * grains' keys, its filters' members, and the series named by a member.
 * Nothing else: a filter's values and a series named by data are data,
 * never references, and a title is the author's words.
 */
export function chartRenamed(
  chart: ChartDefinition,
  renames: ReadonlyMap<string, string>,
): ChartDefinition {
  if (renames.size === 0) return chart;
  const member = memberRenamed(renames);
  const { encoding, granularities, filters, options } = chart;
  const wells = chart.wells as Partial<ChartDefinition['wells']> | undefined;
  const series = options?.['series'];
  const seriesOrder = options?.['seriesOrder'];
  return {
    ...chart,
    source: { ...chart.source, cube: renames.get(chart.source.cube) ?? chart.source.cube },
    ...(wells === undefined
      ? {}
      : {
          wells: {
            ...wells,
            measures: (wells.measures ?? []).map(member),
            dimensions: (wells.dimensions ?? []).map(member),
            timeDimensions: (wells.timeDimensions ?? []).map(member),
            ...(wells.eachPointIs === undefined ? {} : { eachPointIs: member(wells.eachPointIs) }),
          },
        }),
    ...(encoding === undefined
      ? {}
      : {
          encoding: Object.fromEntries(
            Object.entries(encoding).map(([channel, members]) => [
              channel,
              (members ?? []).map(member),
            ]),
          ),
        }),
    ...(granularities === undefined
      ? {}
      : {
          granularities: Object.fromEntries(
            Object.entries(granularities).map(([key, grain]) => [member(key), grain]),
          ),
        }),
    ...(filters === undefined
      ? {}
      : { filters: filters.map((filter) => ({ ...filter, member: member(filter.member) })) }),
    ...(options === undefined
      ? {}
      : {
          options: {
            ...options,
            ...(series !== null && typeof series === 'object' && !Array.isArray(series)
              ? {
                  series: Object.fromEntries(
                    Object.entries(series).map(([name, settings]) => [member(name), settings]),
                  ),
                }
              : {}),
            ...(Array.isArray(seriesOrder)
              ? {
                  seriesOrder: seriesOrder.map((name: unknown) =>
                    typeof name === 'string' ? member(name) : name,
                  ),
                }
              : {}),
          },
        }),
  };
}

/** A dashboard with its filters' members of a renamed cube renamed (T429). */
export function dashboardRenamed(
  body: Record<string, unknown>,
  renames: ReadonlyMap<string, string>,
): Record<string, unknown> {
  if (renames.size === 0) return body;
  const member = memberRenamed(renames);
  const withTexts = withTextTiles(body, (text) => textRenamed(text, member));
  if (!Array.isArray(body['filters'])) return withTexts;
  return {
    ...withTexts,
    filters: (body['filters'] as Record<string, unknown>[]).map((filter) =>
      typeof filter['member'] === 'string'
        ? { ...filter, member: member(filter['member']) }
        : filter,
    ),
  };
}

/** Whether a value is a text tile: a dashboard element of kind `markdown` with its text. */
const isTextTile = (value: unknown): value is Record<string, unknown> & { text: string } =>
  value !== null &&
  typeof value === 'object' &&
  (value as { kind?: unknown }).kind === 'markdown' &&
  typeof (value as { text?: unknown }).text === 'string';

/**
 * A dashboard with each text tile's text changed, wherever the tile is — on
 * a page, in a section, in a tab — and everything else as it was.
 */
function withTextTiles(body: Record<string, unknown>, change: (text: string) => string) {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value === null || typeof value !== 'object') return value;
    if (isTextTile(value)) return { ...value, text: change(value.text) };
    return Object.fromEntries(Object.entries(value).map(([key, each]) => [key, walk(each)]));
  };
  return body['pages'] === undefined ? body : { ...body, pages: walk(body['pages']) };
}

/** Every text tile's text in a dashboard, wherever the tile is. */
export function textTilesOf(body: unknown): string[] {
  const texts: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) for (const each of value) walk(each);
    else if (isTextTile(value)) texts.push(value.text);
    else if (value !== null && typeof value === 'object')
      for (const each of Object.values(value)) walk(each);
  };
  walk((body as { pages?: unknown } | null)?.pages);
  return texts;
}

/**
 * The cubes a dashboard names of its own (T429, AC-272): its filters', and
 * its text tiles' measure tokens' (T389's review). Its charts bind apart.
 */
export function cubesOfDashboard(body: unknown): string[] {
  const filters = (body as { filters?: unknown } | null)?.filters;
  const members = [
    ...(Array.isArray(filters) ? (filters as { member?: unknown }[]) : []).map(
      (filter) => filter.member,
    ),
    ...textTilesOf(body).flatMap(tokenMembersOf),
  ];
  return [
    ...new Set(
      members.flatMap((member) =>
        typeof member === 'string' && member.includes('.')
          ? [member.slice(0, member.indexOf('.'))]
          : [],
      ),
    ),
  ];
}
