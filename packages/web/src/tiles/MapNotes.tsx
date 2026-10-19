import { mapPointsOf } from '@wechart/charts';
import type { RenderSpec } from '@wechart/core';

import { StateLine } from '../shell/StatusIcon';

/**
 * What a Map's Points layer says under the map, in the page's text (T976,
 * AC-625; design 23 sheet 6; rule 158): the rows it couldn't place for want
 * of a location ("312 stores have no location."), a Colour it refused, and,
 * where Cube's row limit cut its rows, "Showing ‹n› of ‹N› ‹members› (Cube's
 * row limit)." with Draw as density, which puts the location in the Density
 * layer instead, and Filter — each where the tile can do it.
 */
export function MapNotes({
  spec,
  onDrawAsDensity,
  onFilter,
}: {
  readonly spec: RenderSpec;
  readonly onDrawAsDensity?: (() => void) | undefined;
  readonly onFilter?: (() => void) | undefined;
}) {
  const drawn = mapPointsOf(spec);
  if (drawn === undefined) return null;
  const { unlocated, shown, total, noun, refusal } = drawn;
  const cut = total !== undefined && total > shown;
  if (!cut && unlocated === 0 && refusal === undefined) return null;
  return (
    <>
      {refusal === undefined ? null : (
        <p className="tile-notes" data-testid="map-points-refusal">
          {refusal}
        </p>
      )}
      {cut ? (
        <div className="tile-notes parallel-cut" data-testid="map-points-cut">
          <StateLine kind="warn">
            Showing {shown.toLocaleString('en-US')} of {total.toLocaleString('en-US')} {noun}{' '}
            (Cube&apos;s row limit).
          </StateLine>
          {onDrawAsDensity === undefined ? null : (
            <button type="button" className="btn-ghost btn-sm" onClick={onDrawAsDensity}>
              Draw as density
            </button>
          )}
          {onFilter === undefined ? null : (
            <button type="button" className="btn-ghost btn-sm" onClick={onFilter}>
              Filter
            </button>
          )}
        </div>
      ) : null}
      {unlocated > 0 ? (
        <p className="tile-notes" data-testid="map-unlocated">
          {unlocated.toLocaleString('en-US')} {unlocated === 1 ? `of the ${noun} has` : `${noun} have`}{' '}
          no location.
        </p>
      ) : null}
    </>
  );
}
