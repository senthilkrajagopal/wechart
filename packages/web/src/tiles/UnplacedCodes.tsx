import { countryMap, loadCountryMap, unplacedCodes, type CountryMap } from '@wechart/charts';
import type { RenderSpec } from '@wechart/core';
import { useEffect, useState } from 'react';

/**
 * The codes a country map can't place (T398, AC-305; direction.md rule 87):
 * named in a note under the map, in the page's own text, not the chart's —
 * "Not on the map: XKX, …". A code the boundaries don't have (Kosovo's), a
 * territory drawn within its sovereign's shape (French Guiana's), and a row
 * with no code are each named; nothing is said when every code is placed.
 */
export function UnplacedCodes({ spec }: { readonly spec: RenderSpec }) {
  const [map, setMap] = useState<CountryMap | undefined>(() => countryMap());
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

  const unplaced = unplacedCodes(spec, map);
  if (unplaced.length === 0) return null;
  return (
    <p className="tile-notes" data-testid="unplaced-codes">
      Not on the map: {unplaced.join(', ')}
    </p>
  );
}
