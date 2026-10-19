/**
 * Region keys for every boundary set (T974, AC-623; R83; design 23 sheet 6;
 * direction.md rules 86, 87), extending AC-313's ISO-3 rule for Countries.
 *
 * A dimension is a region key of a set when every non-empty value is one of
 * the set's keys, unless the model marks it otherwise in the member's `meta`,
 * which Cube passes through `/v1/meta` verbatim: `meta.wechart.regionKey`
 * names the set (`'admin1'`, `'custom:‹id›'`) or is `false`, and AC-313's
 * `meta.wechart.countryCode` stands for Countries.
 *
 * A region is placed by any of its keys: an Admin-1 region by its ISO 3166-2
 * code and by its English name (R83, "ISO + names"). A value naming more than
 * one region is never placed, and is named as matching more than one (R83,
 * "Not placed, named"). A key starting `~` is drawn and never placed, as the
 * Countries set's `~KOS` is.
 */
import type { BoundarySet } from '../chart-types/map';
import { countryCodeMarkingOf, holdsCountryCodes } from './iso3';

/** How the model marks a dimension: a set's key, not a key at all, or unmarked. */
export type RegionKeyMarking = BoundarySet | false | undefined;

const isSet = (value: unknown): value is BoundarySet =>
  value === 'countries' ||
  value === 'admin1' ||
  (typeof value === 'string' && /^custom:.+/.test(value));

/** The model's marking, from a member's `meta`. */
export function regionKeyMarkingOf(meta: unknown): RegionKeyMarking {
  const wechart = (meta as { wechart?: unknown } | null | undefined)?.wechart;
  const marking = (wechart as { regionKey?: unknown } | null | undefined)?.regionKey;
  if (marking === false || isSet(marking)) return marking;
  const country = countryCodeMarkingOf(meta);
  return country === undefined ? undefined : country ? 'countries' : false;
}

/** A set's regions as its values name them. */
export interface RegionIndex {
  /** The keys of the regions a value names: none, one, or more than one. */
  regionsOf(value: string): readonly string[];
}

/** A region and the values that name it besides its key. */
export interface IndexedRegion {
  readonly key: string;
  readonly names: readonly string[];
}

/** An index of regions by their keys and names; `~` keys are never named. */
export function regionIndexOf(regions: readonly IndexedRegion[]): RegionIndex {
  const named = new Map<string, Set<string>>();
  const add = (value: string, key: string) => {
    if (value === '') return;
    const keys = named.get(value) ?? new Set<string>();
    keys.add(key);
    named.set(value, keys);
  };
  for (const { key, names } of regions) {
    if (key.startsWith('~')) continue;
    add(key, key);
    for (const name of names) add(name, key);
  }
  return { regionsOf: (value) => [...(named.get(value) ?? [])] };
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === '';

/**
 * Whether a dimension is a region key of `set` (AC-623): as the model marks
 * it, else when every non-empty value names exactly one region, and there is
 * at least one. Countries keeps AC-313's rule: the full ISO-3 list, not the
 * map's boundaries.
 */
export function isRegionKey(
  set: BoundarySet,
  index: RegionIndex,
  values: readonly unknown[],
  marking: RegionKeyMarking,
): boolean {
  if (set === 'countries')
    return holdsCountryCodes(
      values,
      marking === undefined ? undefined : marking === 'countries',
    );
  if (marking !== undefined) return marking === set;
  const present = values.filter((value) => !isEmpty(value));
  return (
    present.length > 0 &&
    present.every((value) => typeof value === 'string' && index.regionsOf(value).length === 1)
  );
}

/** A value the map can't place, and why. */
export interface Unplaced {
  readonly value: unknown;
  /** `none`: no region has it; `ambiguous`: more than one does; `empty`: no value. */
  readonly reason: 'none' | 'ambiguous' | 'empty';
}

/**
 * The values placed, each on its region's key, and those not, each once and
 * in the order given.
 */
export function placeValues(
  values: readonly unknown[],
  index: RegionIndex,
): { placed: ReadonlyMap<string, string>; unplaced: readonly Unplaced[] } {
  const placed = new Map<string, string>();
  const unplaced: Unplaced[] = [];
  const seen = new Set<unknown>();
  for (const value of values) {
    const empty = isEmpty(value);
    const id = empty ? '' : String(value);
    if (seen.has(empty ? undefined : id)) continue;
    seen.add(empty ? undefined : id);
    if (empty) {
      unplaced.push({ value, reason: 'empty' });
      continue;
    }
    const keys = index.regionsOf(id);
    if (keys.length === 1) placed.set(id, keys[0]!);
    else unplaced.push({ value: id, reason: keys.length === 0 ? 'none' : 'ambiguous' });
  }
  return { placed, unplaced };
}

/**
 * The note under the map (rule 87): `Not on the map: "Online" (no territory),
 * "Georgia" (matches more than one region), (empty)`; none when every value
 * is placed. `noun` is what one of the set's regions is called.
 */
export function unplacedSentence(unplaced: readonly Unplaced[], noun: string): string | undefined {
  if (unplaced.length === 0) return undefined;
  const said = unplaced.map(({ value, reason }) =>
    reason === 'empty'
      ? '(empty)'
      : `"${String(value)}" (${reason === 'none' ? `no ${noun}` : 'matches more than one region'})`,
  );
  return `Not on the map: ${said.join(', ')}`;
}
