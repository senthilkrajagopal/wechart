/**
 * The boundary sets other than Countries, as their values name their regions
 * (T974, AC-623): each registered here once its boundaries are in — Admin-1
 * by country from T975, a custom set from T979 — so the map and the note
 * under it read one index.
 *
 * A set is registered under the id its regions are drawn as: `admin1:‹ISO-3›`
 * for one country's Admin-1 file, `custom:‹id›` for a custom set.
 */
import type { RegionIndex } from '@wechart/core';

export interface RegionSet {
  /** The ECharts map its regions are registered as. */
  readonly map: string;
  /** The feature property its regions are keyed by. */
  readonly nameProperty: string;
  /** Its regions by their keys and names. */
  readonly index: RegionIndex;
  /** What one region is called in the note under the map: "region", "territory". */
  readonly noun: string;
  /** Each placed region's name, by its key, for the tooltip and the text alternative. */
  readonly names: ReadonlyMap<string, string>;
}

const sets = new Map<string, RegionSet>();
const listeners = new Set<() => void>();

export function registerRegionSet(id: string, set: RegionSet): RegionSet {
  sets.set(id, set);
  for (const listener of listeners) listener();
  return set;
}

/** The set as registered, or none before it is. */
export function regionSetOf(id: string): RegionSet | undefined {
  return sets.get(id);
}

/** Told whenever a set is registered; returns its own unsubscribe. */
export function onRegionSets(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
