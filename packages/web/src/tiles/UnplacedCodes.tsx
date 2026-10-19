import {
  countryMap,
  loadCountryMap,
  onRegionSets,
  unplacedNote,
  type CountryMap,
} from '@wechart/charts';
import type { RenderSpec } from '@wechart/core';
import { useEffect, useReducer, useState } from 'react';

/**
 * What a map can't place (T398, AC-305; T974, AC-623; direction.md rule 87):
 * named in a note under the map, in the page's own text, not the chart's.
 * On Countries, the codes — "Not on the map: XKX, …": a code the boundaries
 * don't have (Kosovo's), a territory drawn within its sovereign's shape
 * (French Guiana's), and a row with no code. On any other boundary set, each
 * value quoted with why — "Not on the map: "Online" (no territory)", or
 * "(matches more than one region)". Nothing is said when every value is
 * placed, nor before the set's boundaries are in.
 */
export function UnplacedCodes({ spec }: { readonly spec: RenderSpec }) {
  const [map, setMap] = useState<CountryMap | undefined>(() => countryMap());
  // A set other than Countries is read again whenever one is registered.
  const [, registered] = useReducer((count: number) => count + 1, 0);
  useEffect(() => onRegionSets(registered), []);
  useEffect(() => {
    if (map !== undefined) return undefined;
    let current = true;
    // Its failure is the canvas's to say, where the map would be.
    loadCountryMap().then(
      (loaded) => {
        if (current) setMap(loaded);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [map]);

  const note = unplacedNote(spec, map);
  if (note === undefined) return null;
  return (
    <p className="tile-notes" data-testid="unplaced-codes">
      {note}
    </p>
  );
}
