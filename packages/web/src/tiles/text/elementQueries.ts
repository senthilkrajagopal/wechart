import {
  isEmptyPredicate,
  limitFilterFor,
  type MarkingPredicate,
  type TextNode,
} from '@wechart/core';

import { membersOf } from '../../editor/fields';

/**
 * What a Text tile's live elements ask Cube (T884, AC-520, AC-116; design 21
 * pin 8, states C1 and C5). The tile's filters are added by the dashboard
 * (`withFilters`), as for any tile; these are each element's own part.
 */

type Query = Record<string, unknown>;

/** An element, by what these read of it: its settings. */
type Element = Pick<TextNode, 'attrs'> & { readonly type?: string };

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** An element's own filter, added to its tile's (AC-520), as Cube takes a filter. */
function ownFilters(node: Element): Query[] {
  const filters = node.attrs?.['filters'];
  if (!Array.isArray(filters)) return [];
  return filters.flatMap((filter: unknown) => {
    if (typeof filter !== 'object' || filter === null) return [];
    const { member, operator, values } = filter as Record<string, unknown>;
    return typeof member === 'string' &&
      (operator === 'equals' || operator === 'notEquals') &&
      Array.isArray(values)
      ? [{ member, operator, values: values.filter((one) => typeof one === 'string') }]
      : [];
  });
}

/**
 * A Value's query: its measure, over its marking's rows where it names one —
 * over all data while nothing is marked (AC-116), or nothing at all when the
 * author chose "—" for that case — and under its own filter.
 */
export function valueQueryOf(
  node: Element,
  marking: MarkingPredicate | undefined,
): { readonly query: Query } | { readonly none: true } {
  const measure = text(node.attrs?.['measure']) ?? '';
  const named = text(node.attrs?.['marking']) !== undefined;
  if (named && marking !== undefined && isEmptyPredicate(marking)) {
    if (node.attrs?.['whenUnmarked'] === 'none') return { none: true };
  }
  const limit = named && marking !== undefined ? limitFilterFor([marking], 'all') : undefined;
  const filters = [...(limit === undefined ? [] : [limit]), ...ownFilters(node)];
  return { query: { measures: [measure], ...(filters.length === 0 ? {} : { filters }) } };
}

/** An element's marking limit (AC-116): its marking's rows, none while nothing is marked. */
function limitOf(node: Element, marking: MarkingPredicate | undefined): Query[] {
  if (text(node.attrs?.['marking']) === undefined || marking === undefined) return [];
  const limit = limitFilterFor([marking], 'all');
  return limit === undefined ? [] : [limit];
}

/**
 * A Sparkline's query (T885, AC-521): its measure in the last ‹n› periods
 * of its time dimension at its granularity — 12 months where it names
 * neither (decision T885-1) — newest first, over its marking and under its
 * own filter.
 */
export function sparklineQueryOf(
  node: Element,
  time: string,
  marking: MarkingPredicate | undefined,
): Query {
  const measure = text(node.attrs?.['measure']) ?? '';
  const granularity = text(node.attrs?.['granularity']) ?? 'month';
  const last = node.attrs?.['last'];
  const filters = [...limitOf(node, marking), ...ownFilters(node)];
  return {
    measures: [measure],
    timeDimensions: [{ dimension: time, granularity }],
    order: { [time]: 'desc' },
    limit: typeof last === 'number' && Number.isInteger(last) && last >= 1 ? last : 12,
    ...(filters.length === 0 ? {} : { filters }),
  };
}

/** A Bullet graph's query (T885): its measure, and its target where that's a measure. */
export function bulletQueryOf(node: Element, marking: MarkingPredicate | undefined): Query {
  const measure = text(node.attrs?.['measure']) ?? '';
  const target = node.attrs?.['target'] as { kind?: unknown; measure?: unknown } | undefined;
  const targetMeasure =
    target?.kind === 'measure' && typeof target.measure === 'string' ? target.measure : undefined;
  const filters = [...limitOf(node, marking), ...ownFilters(node)];
  return {
    measures: [measure, ...(targetMeasure === undefined ? [] : [targetMeasure])],
    ...(filters.length === 0 ? {} : { filters }),
  };
}

/**
 * An Icon's query (T886, AC-522): its measure, and the one it's a share of
 * where it names one, over its marking and under its own filter.
 */
export function iconQueryOf(node: Element, marking: MarkingPredicate | undefined): Query {
  const measure = text(node.attrs?.['measure']) ?? '';
  const of = text(node.attrs?.['of']);
  const filters = [...limitOf(node, marking), ...ownFilters(node)];
  return {
    measures: [measure, ...(of === undefined ? [] : [of])],
    ...(filters.length === 0 ? {} : { filters }),
  };
}

/** The cube a member is of: its name's first part. */
const cubeOf = (member: unknown) => (typeof member === 'string' ? member.split('.')[0] : undefined);

/** A query with its keys in order, so two that ask the same read the same. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
  );
}

/**
 * The query each of a tile's elements is asked by (T887, AC-523): elements
 * whose queries ask only measures of one cube, under the same filters, are
 * asked as one query of all their measures — one Cube request — each
 * reading its own measure from its one row. A query over time (a Change, a
 * Sparkline) is left as it is, rather than its periods being decided by
 * another measure's rows; two such that ask the same are one request
 * anyway, keyed by what they ask (decision T887-1).
 */
export function batchedQueries(queries: readonly Query[]): Map<Query, Query> {
  const groups = new Map<string, { measures: string[]; members: Query[]; rest: Query }>();
  const sent = new Map<Query, Query>();
  for (const query of queries) {
    const { measures, ...rest } = query;
    const cubes = new Set(Array.isArray(measures) ? measures.map(cubeOf) : []);
    const flat = Object.keys(rest).every((key) => key === 'filters');
    const [cube] = cubes;
    if (!Array.isArray(measures) || cubes.size !== 1 || cube === undefined || !flat) {
      sent.set(query, query);
      continue;
    }
    const key = JSON.stringify([cube, canonical(rest)]);
    const group = groups.get(key) ?? { measures: [], members: [], rest };
    for (const measure of measures as string[])
      if (!group.measures.includes(measure)) group.measures.push(measure);
    group.members.push(query);
    groups.set(key, group);
  }
  for (const { measures, members, rest } of groups.values()) {
    const one = members.length === 1 ? members[0] : { ...rest, measures };
    for (const member of members) sent.set(member, one ?? member);
  }
  return sent;
}

/** The periods a Change compares, when it names none: a month (decision T884-1). */
const PERIOD = 'month';

/**
 * A Change's query: its measure in the last two periods of its time
 * dimension, at its period, newest first, under its own filter; the tile's
 * filters, a date filter among them, are added as for any tile.
 */
export function changeQueryOf(
  node: Element,
  time: string,
  marking?: MarkingPredicate | undefined,
): Query {
  const measure = text(node.attrs?.['measure']) ?? '';
  const period = text(node.attrs?.['period']) ?? PERIOD;
  const filters = [...limitOf(node, marking), ...ownFilters(node)];
  return {
    measures: [measure],
    timeDimensions: [{ dimension: time, granularity: period }],
    order: { [time]: 'desc' },
    limit: 2,
    ...(filters.length === 0 ? {} : { filters }),
  };
}

export interface Change {
  readonly current: number;
  readonly previous: number;
  readonly delta: number;
  /** Against the previous period, or undefined where that was nothing. */
  readonly ratio: number | undefined;
}

/** The newest period against the one before it, from a Change's rows. */
export function changeOf(
  rows: readonly Record<string, unknown>[],
  measure: string,
): Change | undefined {
  if (rows.length < 2) return undefined;
  const current = Number(rows[0]?.[measure]);
  const previous = Number(rows[1]?.[measure]);
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return undefined;
  const delta = current - previous;
  return { current, previous, delta, ratio: previous === 0 ? undefined : delta / previous };
}

/**
 * The time dimension a Change is over: its own, else the first its
 * measure's cube or view has (decision T884-1), else none.
 */
export function timeOf(node: Element, model: unknown): string | undefined {
  const own = text(node.attrs?.['time']);
  if (own !== undefined) return own;
  const measure = text(node.attrs?.['measure']);
  const cube = measure?.split('.')[0];
  if (cube === undefined) return undefined;
  return membersOf(model, cube).find((member) => member.kind === 'timeDimension')?.name;
}
