import { predicateFrom } from '@wechart/core';

import type { FilterValues } from '../../filters/model';
import { valueFrom } from '../../filters/url';
import { markFilterFrom, type MarkFilter } from '../markings/filterToMarked';
import { summariseMarking } from '../markings/MarkChip';
import type { MarkingState } from '../markings/store';

/**
 * What a reader has made of a dashboard, apart from the dashboard itself: the
 * page tab shown, the filters' values, what is marked — with the filters
 * "Filter to marked" made, and the tile each marking was marked from, which
 * its chip names. A bookmark keeps it (AC-121) and a link with marks carries
 * it (AC-123); neither is ever the dashboard's saved definition (AC-122,
 * direction.md rule 54).
 */
export interface ViewState {
  readonly page: string;
  readonly filters: FilterValues;
  readonly marks: MarkingState;
  readonly markFilters: readonly MarkFilter[];
  readonly from: Readonly<Record<string, string>>;
}

const isRecord = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw);

/** The entries of a record whose values read as `T`, the rest dropped. */
function kept<T>(raw: unknown, read: (value: unknown, key: string) => T | undefined) {
  const out: Record<string, T> = {};
  if (!isRecord(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    const got = read(value, key);
    if (got !== undefined) out[key] = got;
  }
  return out;
}

/**
 * A filter "Filter to marked" made, made again from its marking's predicate —
 * checked as a mark is (`predicateFrom`) — as the dashboard made it. The
 * filter, members and words the JSON carries are not taken: they could say
 * one thing and filter by another, or be no filter at all (T128's review).
 * The dashboard words it again by its members' titles as it applies it.
 */
function restoredMarkFilter(raw: unknown): MarkFilter | undefined {
  if (!isRecord(raw)) return undefined;
  const { id, negate, markingName } = raw;
  if (typeof id !== 'string' || id === '' || typeof negate !== 'boolean') return undefined;
  if (typeof markingName !== 'string') return undefined;
  const predicate = predicateFrom(raw['predicate']);
  if (predicate === undefined) return undefined;
  const made = markFilterFrom(predicate, negate, {
    id,
    markingName,
    summary: summariseMarking(predicate, undefined, 3),
  });
  return 'refused' in made ? undefined : made;
}

/**
 * What a bookmark or a link says a dashboard showed, read back (T128, T129).
 * JSON anyone can have written — a link is pasted and edited by hand — so
 * each part is taken only if it is one, as the URL's filters are (AC-081):
 * a filter's value, a marking's predicate that holds (`predicateFrom`), a
 * "Filter to marked" filter made again from its predicate. Anything else is
 * dropped, never trusted.
 */
export function viewStateFrom(raw: unknown): ViewState | undefined {
  if (!isRecord(raw)) return undefined;
  return {
    page: typeof raw['page'] === 'string' ? raw['page'] : '',
    // Keyed as `valueKeyOf` keys them: the filter, a space, its field.
    filters: kept(raw['filters'], (value, key) =>
      key.indexOf(' ') > 0 ? valueFrom(value) : undefined,
    ),
    marks: kept(raw['marks'], predicateFrom),
    markFilters: Array.isArray(raw['markFilters'])
      ? raw['markFilters'].flatMap((each) => restoredMarkFilter(each) ?? [])
      : [],
    from: kept(raw['from'], (value) => (typeof value === 'string' ? value : undefined)),
  };
}
