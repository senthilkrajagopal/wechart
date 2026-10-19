import { DEFAULT_PALETTE, isAdditive, labelOf } from '@wechart/charts';
import {
  formatValue,
  kpiOptionsOf,
  matchesPredicate,
  memberOn,
  type KpiOptions,
  type RenderSpec,
} from '@wechart/core';
import { useState, type CSSProperties } from 'react';

import type { ClickedItem } from '../../dashboard/crossfilter/clicked';
import { changeWordsOf, KpiChange, type KpiCompared } from './KpiChange';
import { comparedOf, ordered, targetOf, tilesOf, type KpiTileRows as Tile } from './kpiFigures';
import { kpiShort } from './kpiNumbers';
import { KpiTarget } from './KpiTarget';
import { KpiTrend } from './KpiTrend';
import { useBox } from './useBox';

/** The most tiles on one page, as trellis panels page past 20 (§5; AC-567). */
export const KPI_TILES_PER_PAGE = 20;

/**
 * A tiled KPI's members as its tiles read (T971, AC-563): the order the keys
 * move through, by value or as Customize orders them, every page's. None for
 * a KPI not tiled, or without a measure.
 */
export function kpiKeyItemsOf(spec: RenderSpec): string[] {
  const { tileBy, tileOrder } = kpiOptionsOf(spec.options);
  const measure = memberOn(spec.encoding, 'y');
  if (tileBy === undefined || measure === undefined) return [];
  return ordered(tilesOf(spec, tileBy, measure), tileOrder).map((tile) => tile.member);
}

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

/**
 * As a Highlight target (AC-568): "Selected: $X · p%", the selection's part
 * of this member's value, as the marked badge says it — a summed measure's
 * none of it a 0, and its share; any other's only where it has a value, and
 * no share, a part of an average being no part of it.
 */
function selectedOf(
  spec: RenderSpec,
  kpi: KpiOptions,
  measure: string,
  tile: Tile,
): string | undefined {
  const highlight = spec.highlight;
  if (highlight?.kind !== 'share' || highlight.rows === undefined) return undefined;
  const tileBy = kpi.tileBy ?? '';
  const additive = isAdditive(spec.measureTypes?.[measure]);
  // The current period's row, where Cube answered several (T937).
  const rows = tilesOf({ ...spec, rows: highlight.rows }, tileBy, measure);
  const part = rows.find((one) => one.member === tile.member)?.value ?? (additive ? 0 : undefined);
  if (part === undefined) return undefined;
  const share =
    additive && tile.value !== undefined && tile.value !== 0
      ? ` · ${String(Math.round((part / tile.value) * 100))}%`
      : '';
  return `Selected: ${formatValue(part, measure, spec.formats ?? {})}${share}`;
}

/** One member's tile: its name, value in `text-kpi`, change, trend and target. */
function KpiTile({
  tile,
  spec,
  kpi,
  measure,
  trend,
  marked,
  dimmed,
  focused,
  onItemClick,
}: {
  readonly tile: Tile;
  readonly spec: RenderSpec;
  readonly kpi: KpiOptions;
  readonly measure: string;
  readonly trend: readonly (number | null)[] | undefined;
  /** Its member is in the tile's marking (AC-568). */
  readonly marked: boolean;
  /** Another tile's member is, and this one's isn't. */
  readonly dimmed: boolean;
  /** The keyboard is on it (T971, AC-563). */
  readonly focused: boolean;
  readonly onItemClick?: ((item: ClickedItem, toggle: boolean) => void) | undefined;
}) {
  const [measured, box] = useBox();
  const compared = comparedOf(spec, kpi, measure, tile.current, tile.compared);
  const goal = targetOf(kpi, tile.current);
  const selected = selectedOf(spec, kpi, measure, tile);
  // The member as Cube answered it, so the marking matches its rows (AC-568).
  const raw = tile.current[kpi.tileBy ?? ''];
  const value = typeof raw === 'number' || typeof raw === 'string' ? raw : tile.member;
  return (
    // A tile is its member: a click marks it, Ctrl/⌘ toggles it (AC-087, AC-568).
    // Keyboard marking on KPI tiles is T971's, with §7a's keys (R75).
    <li
      className={`kpi-tile${marked ? ' kpi-tile--marked' : ''}${dimmed ? ' kpi-tile--dimmed' : ''}`}
      aria-label={nameOf(tile, compared, goal, spec, measure)}
      // The tile the keyboard is on: the dashed accent ring (T971, AC-176).
      {...(focused ? { 'data-keyboard-focus': 'true' } : {})}
      ref={measured}
      style={
        marked && spec.marking !== undefined
          ? ({ '--kpi-mark': spec.marking.colour } as CSSProperties)
          : undefined
      }
      {...(onItemClick === undefined
        ? {}
        : {
            onClick: (event: React.MouseEvent) => {
              onItemClick(
                { name: tile.member, marks: [{ member: kpi.tileBy ?? '', value }] },
                event.ctrlKey || event.metaKey,
              );
            },
          })}
    >
      <p className="kpi__label">{tile.member}</p>
      {marked ? (
        <p className="kpi-tile__marked" data-testid="kpi-tile-marked">
          <span aria-hidden="true" style={{ color: spec.marking?.colour }}>
            ●
          </span>{' '}
          Marked
        </p>
      ) : null}
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
      {selected === undefined ? null : (
        <p className="kpi__marked">
          <span className="mark-badge" data-testid="kpi-tile-selected">
            {selected}
          </span>
        </p>
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
  onItemClick,
}: {
  readonly spec: RenderSpec;
  readonly measure: string;
  /** Each member's trend, oldest first, where Time is set and it is answered. */
  readonly trends?: ReadonlyMap<string, readonly (number | null)[]> | undefined;
  /** A click on a tile: marking or cross-filtering its member (T941, AC-568). */
  readonly onItemClick?: ((item: ClickedItem, toggle: boolean) => void) | undefined;
}) {
  const kpi = kpiOptionsOf(spec.options);
  // Which tiles the marking holds; the rest dim while any is (AC-568).
  const predicate = spec.marking?.predicate;
  const markedOf = (tile: Tile) =>
    predicate !== undefined && matchesPredicate(predicate, tile.current);
  const tileBy = kpi.tileBy ?? '';
  const tiles = ordered(tilesOf(spec, tileBy, measure), kpi.tileOrder);
  const pages = Math.max(1, Math.ceil(tiles.length / KPI_TILES_PER_PAGE));
  // The keyboard's tile (T971, AC-563), and its page shown as the keys reach it.
  const focus = spec.keyboardFocus;
  const focusAt = focus === undefined ? -1 : tiles.findIndex((tile) => tile.member === focus);
  const pageOf = (index: number) => Math.floor(index / KPI_TILES_PER_PAGE);
  const [page, setPage] = useState(() => (focusAt >= 0 ? pageOf(focusAt) : 0));
  const [seenFocus, setSeenFocus] = useState(focusAt);
  if (focusAt !== seenFocus) {
    setSeenFocus(focusAt);
    if (focusAt >= 0) setPage(pageOf(focusAt));
  }
  const at = Math.min(page, pages - 1);
  const first = at * KPI_TILES_PER_PAGE;
  const shown = tiles.slice(first, first + KPI_TILES_PER_PAGE);
  const anyMarked = tiles.some(markedOf);
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
            marked={markedOf(tile)}
            dimmed={anyMarked && !markedOf(tile)}
            focused={tile.member === focus}
            onItemClick={onItemClick}
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
