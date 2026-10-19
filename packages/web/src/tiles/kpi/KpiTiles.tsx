import { DEFAULT_PALETTE, labelOf } from '@wechart/charts';
import { formatValue, kpiOptionsOf, type KpiOptions, type RenderSpec } from '@wechart/core';
import { useState } from 'react';

import { changeWordsOf, KpiChange, type KpiCompared } from './KpiChange';
import { comparedOf, ordered, targetOf, tilesOf, type KpiTileRows as Tile } from './kpiFigures';
import { kpiShort } from './kpiNumbers';
import { KpiTarget } from './KpiTarget';
import { KpiTrend } from './KpiTrend';
import { useBox } from './useBox';

/** The most tiles on one page, as trellis panels page past 20 (§5; AC-567). */
export const KPI_TILES_PER_PAGE = 20;

/** "EMEA: $412K, up 4.2% vs Sep 2026, 92% of $450K" (AC-567). */
function nameOf(
  tile: Tile,
  compared: KpiCompared | undefined,
  goal: number | undefined,
  spec: RenderSpec,
  measure: string,
): string {
  if (tile.value === undefined) return `${tile.member}: no value`;
  const parts = [`${tile.member}: ${kpiShort(tile.value, measure, spec.formats)}`];
  if (compared !== undefined)
    parts.push(changeWordsOf(tile.value, compared, measure, spec.formats));
  if (goal !== undefined && goal !== 0)
    parts.push(
      `${String(Math.round((tile.value / goal) * 100))}% of ${kpiShort(goal, measure, spec.formats)}`,
    );
  return parts.join(', ');
}

/** One member's tile: its name, value in `text-kpi`, change, trend and target. */
function KpiTile({
  tile,
  spec,
  kpi,
  measure,
  trend,
}: {
  readonly tile: Tile;
  readonly spec: RenderSpec;
  readonly kpi: KpiOptions;
  readonly measure: string;
  readonly trend: readonly (number | null)[] | undefined;
}) {
  const [measured, box] = useBox();
  const compared = comparedOf(spec, kpi, measure, tile.current, tile.compared);
  const goal = targetOf(kpi, tile.current);
  return (
    <li
      className="kpi-tile"
      aria-label={nameOf(tile, compared, goal, spec, measure)}
      ref={measured}
    >
      <p className="kpi__label">{tile.member}</p>
      <p className="kpi-tile__value" data-testid="kpi-tile-value">
        {tile.value === undefined ? '—' : formatValue(tile.value, measure, spec.formats ?? {})}
      </p>
      {compared === undefined || tile.value === undefined ? null : (
        <KpiChange
          current={tile.value}
          compared={compared}
          member={measure}
          formats={spec.formats}
          direction={kpi.direction}
        />
      )}
      {trend === undefined || kpi.time === undefined ? null : (
        <KpiTrend
          values={trend}
          title={`${labelOf(spec, measure)}, ${tile.member}`}
          member={measure}
          formats={spec.formats}
          granularity={kpi.time.granularity}
          colour={spec.colours?.[measure] ?? spec.palette?.[0] ?? DEFAULT_PALETTE[0]}
          width={box.width}
        />
      )}
      {goal === undefined || tile.value === undefined ? null : (
        <KpiTarget
          value={tile.value}
          target={goal}
          title={`${labelOf(spec, measure)}, ${tile.member}`}
          member={measure}
          formats={spec.formats}
          width={box.width}
        />
      )}
    </li>
  );
}

/**
 * A KPI tiled by a dimension (T940, AC-567; design 23 sheet 1 and screen 2
 * pin 1): one tile per member, 8 px apart, as a list whose items are named
 * for what they show; ordered by value, highest first, unless the author
 * chose another order in Customize; paged past 20 with "Tiles 1–20 of ‹n›"
 * and ‹ ›, as trellis panels are.
 */
export function KpiTiles({
  spec,
  measure,
  trends,
}: {
  readonly spec: RenderSpec;
  readonly measure: string;
  /** Each member's trend, oldest first, where Time is set and it is answered. */
  readonly trends?: ReadonlyMap<string, readonly (number | null)[]> | undefined;
}) {
  const kpi = kpiOptionsOf(spec.options);
  const [page, setPage] = useState(0);
  const tileBy = kpi.tileBy ?? '';
  const tiles = ordered(tilesOf(spec, tileBy, measure), kpi.tileOrder);
  const pages = Math.max(1, Math.ceil(tiles.length / KPI_TILES_PER_PAGE));
  const at = Math.min(page, pages - 1);
  const first = at * KPI_TILES_PER_PAGE;
  const shown = tiles.slice(first, first + KPI_TILES_PER_PAGE);
  return (
    <div className="kpi-tiles" data-testid="kpi-tiles">
      <ul
        className="kpi-tiles__list"
        aria-label={`${labelOf(spec, measure)} by ${labelOf(spec, tileBy)}`}
      >
        {shown.map((tile) => (
          <KpiTile
            key={tile.member}
            tile={tile}
            spec={spec}
            kpi={kpi}
            measure={measure}
            trend={trends?.get(tile.member)}
          />
        ))}
      </ul>
      {tiles.length <= KPI_TILES_PER_PAGE ? null : (
        <p className="kpi-tiles__pager">
          <button
            type="button"
            className="btn btn-sm"
            aria-label="Previous tiles"
            disabled={at === 0}
            onClick={() => {
              setPage(at - 1);
            }}
          >
            ‹
          </button>
          <span data-testid="kpi-tiles-page">
            {`Tiles ${String(first + 1)}–${String(first + shown.length)} of ${String(tiles.length)}`}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            aria-label="Next tiles"
            disabled={at === pages - 1}
            onClick={() => {
              setPage(at + 1);
            }}
          >
            ›
          </button>
        </p>
      )}
    </div>
  );
}
