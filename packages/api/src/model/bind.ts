import {
  textDocumentMembers,
  textDocumentRenamed,
  textRenamed,
  tokenMembersOf,
  type ChartDefinition,
  type TextDocument,
} from '@wechart/core';

import type { XcubeAdmin } from '../xcube/client';

/**
 * A chart's and a dashboard's cubes bound at publish (T429, T711; AC-272;
 * research `xcube-256d632371.md`, 3.3).
 *
 * Each cube or view an item names is the one item of that name (R71), asked
 * of xcube's resolver, which answers it in any case and in any folder. It
 * binds only where that item is kept in the item's folder or one above it
 * (R72): a descendant's or a sibling's is refused, by name, as is a name no
 * item holds. That rule is wechart's; xcube's resolver holds no path.
 *
 * What is stored is each cube's published name, its own in every folder
 * (T709, AC-328), as the item holds it.
 */

export type Binding =
  /** Each name as stored, where it binds to another stored name, to that name. */
  | { readonly kind: 'bound'; readonly renames: ReadonlyMap<string, string> }
  /** The names no folder on the path holds. */
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
 * A chart's cubes bound on a folder path: the one it starts from, then each
 * other it names, each by its one name, held to the path (T711).
 */
export function bindChart(
  xcube: Pick<XcubeAdmin, 'resolve' | 'items'>,
  /** xcube ids of the folder it is published into and each one above it, nearest first. */
  path: readonly string[],
  chart: ChartDefinition,
): Promise<Binding> {
  const { source, others } = cubesOfChart(chart);
  return bindNames(xcube, path, [source, ...others]);
}

/**
 * Names bound on a folder path (T429, T711; AC-272): each to the one item of
 * that name where the path keeps it; refused, by the names asked, where no
 * item holds one or it is kept off the path.
 */
export async function bindNames(
  xcube: Pick<XcubeAdmin, 'resolve' | 'items'>,
  /** xcube ids of the folder asked from and each one above it, nearest first. */
  path: readonly string[],
  names: readonly string[],
): Promise<Binding> {
  const asked = [...new Set(names)];
  if (asked.length === 0) return { kind: 'bound', renames: new Map() };
  // No folder to hold any of them: none binds.
  if (path.length === 0) return { kind: 'refused', names: asked };
  const found = await xcube.resolve(path[0]!, asked);
  const held = await xcube.items();
  const onPath = new Set(path);
  const kept = (stored: string | null | undefined) =>
    stored != null && held.some((item) => item.fullName === stored && onPath.has(item.folderId));
  const missing = asked.filter((name) => !kept(found.get(name)));
  if (missing.length > 0) return { kind: 'refused', names: missing };
  const renames = new Map<string, string>();
  for (const name of asked) {
    const stored = found.get(name)!;
    if (stored !== name) renames.set(name, stored);
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
  const withTexts = withTextTiles(
    body,
    (text) => textRenamed(text, member),
    (document) => textDocumentRenamed(document, member),
  );
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
 * Whether a value is a Text tile (F45): a dashboard element of kind `text`
 * with a document. Its document is checked by the repo on save (T871); here
 * it is only read for the members its elements name (T872).
 */
const isTextDocumentTile = (
  value: unknown,
): value is Record<string, unknown> & { document: TextDocument } =>
  value !== null &&
  typeof value === 'object' &&
  (value as { kind?: unknown }).kind === 'text' &&
  typeof (value as { document?: unknown }).document === 'object' &&
  (value as { document?: unknown }).document !== null;

/**
 * A dashboard with each markdown tile's text, and each Text tile's document,
 * changed, wherever the tile is — on a page, in a section, in a tab — and
 * everything else as it was.
 */
function withTextTiles(
  body: Record<string, unknown>,
  change: (text: string) => string,
  changeDocument: (document: TextDocument) => TextDocument,
) {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value === null || typeof value !== 'object') return value;
    if (isTextTile(value)) return { ...value, text: change(value.text) };
    if (isTextDocumentTile(value)) {
      const document = changeDocument(value.document);
      return document === value.document ? value : { ...value, document };
    }
    return Object.fromEntries(Object.entries(value).map(([key, each]) => [key, walk(each)]));
  };
  return body['pages'] === undefined ? body : { ...body, pages: walk(body['pages']) };
}

/** Every markdown tile's text, and every Text tile's document, in a dashboard, wherever the tile is. */
function textsOf(body: unknown): { texts: string[]; documents: TextDocument[] } {
  const texts: string[] = [];
  const documents: TextDocument[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) for (const each of value) walk(each);
    else if (isTextTile(value)) texts.push(value.text);
    else if (isTextDocumentTile(value)) documents.push(value.document);
    else if (value !== null && typeof value === 'object')
      for (const each of Object.values(value)) walk(each);
  };
  walk((body as { pages?: unknown } | null)?.pages);
  return { texts, documents };
}

/**
 * The members a dashboard's text names: a markdown tile's measure tokens
 * (T389's review) and a Text tile's elements (T872, AC-512), wherever the
 * tile is.
 */
export function textTileMembersOf(body: unknown): string[] {
  const { texts, documents } = textsOf(body);
  return [...texts.flatMap(tokenMembersOf), ...documents.flatMap(textDocumentMembers)];
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
    ...textTileMembersOf(body),
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
