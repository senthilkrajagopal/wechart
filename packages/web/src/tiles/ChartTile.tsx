import { isDrawable } from '@wechart/charts';
import type { ChartType, RenderSpec } from '@wechart/core';
import { useState, type ReactNode } from 'react';

import type { ClickedItem } from '../dashboard/crossfilter/clicked';
import type { AnswerMeta } from '../query/answerMeta';
import { StateLine, StatusIcon } from '../shell/StatusIcon';
import { AccelerationBadge } from './AccelerationBadge';
import { ChartCanvas } from './ChartCanvas';
import { DataAsOf } from './DataAsOf';
import { DataTable, type DataTableProps } from './DataTable';
import { Kpi } from './Kpi';
import { PivotTable } from './PivotTable';
import { TileEmpty } from './TileEmpty';

/**
 * One chart, whatever kind it is (AC-037), and the table behind it (AC-178).
 *
 * Not every type is drawn the same way. Most go to ECharts; a few are DOM,
 * because a number or a table drawn on a canvas would be unselectable,
 * unsearchable and invisible to a screen reader for no gain — the conclusion
 * `docs/research/echarts.md` reaches as well. This is the one place that knows
 * which is which, so nothing upstream has to.
 *
 * It is also the one place the table view can live. AC-178 asks for it on
 * *every* chart's data, and direction.md rule 5 asks for it one click away;
 * putting it here means a type cannot be added without getting one.
 */
export interface ChartTileProps {
  readonly spec: RenderSpec;
  readonly height?: number;
  /**
   * A click on one of the chart's items: it cross-filters (AC-117) or marks
   * (AC-087), by the dashboard's mode. Absent while editing, where a click
   * picks the tile up.
   */
  readonly onItemClick?: ((item: ClickedItem, toggle: boolean) => void) | undefined;
  /** Marking this tile's rows, where it draws a table (AC-092). */
  readonly rowMarking?: DataTableProps['marking'];
  /**
   * Whether the table view is showing, when the owner wants to keep that
   * across a re-render.
   *
   * A tile that keeps this itself loses it whenever it unmounts — and the
   * editor unmounts the tile every time the query re-runs, so changing a field
   * would silently flip a reader back from the table to the chart. The results
   * drawer had exactly this bug at T034 and it is the same fix: the state
   * belongs to whatever outlives the tile.
   */
  readonly tableView?: boolean;
  readonly onTableViewChange?: (showing: boolean) => void;
  /**
   * A new answer is on its way — a filter changed (AC-078). What is drawn
   * stays, marked busy, rather than giving way to a skeleton: that would
   * unmount the tile and drop a reader's table view with it.
   */
  readonly busy?: boolean;
  /**
   * The filters in effect on this chart, in words — named by the empty state
   * when the query comes back with no rows (AC-043).
   */
  readonly inEffect?: readonly string[] | undefined;
  /**
   * The chart's title, heading the tile as the prototype's `.tile-head` does
   * (AC-187). Absent where the chart is not on a tile — the editor's preview.
   */
  readonly title?: string | undefined;
  /**
   * When the data is from — Cube's `lastRefreshTime` — shown in the head
   * (T154, AC-148). Absent where Cube gave none.
   */
  readonly asOf?: string | undefined;
  /**
   * What Cube said of the answer — whether a pre-aggregation served it — for
   * the accelerated or live badge in the head (T014, AC-013). Absent where
   * the answer is not Cube's own, as a draft's in the editor is not.
   */
  readonly served?: AnswerMeta | undefined;
  /**
   * The marked-items badge, in the header row beside the title (AC-201): the
   * prototype's `.mbadge`, rather than a line above that pushed the title down.
   */
  readonly badge?: ReactNode;
}

interface ChartBodyProps {
  readonly spec: RenderSpec;
  readonly height?: number;
  /** A click on one of its items, while the dashboard cross-filters (AC-117). */
  readonly onItemClick?: ((item: ClickedItem, toggle: boolean) => void) | undefined;
  /**
   * Marking this tile's rows, where it draws a table and the cube has a
   * primary key to identify them by (AC-092).
   */
  readonly rowMarking?: DataTableProps['marking'];
}

/** Types wechart draws as DOM rather than handing to ECharts. */
const DOM_TYPES: Partial<Record<ChartType, (props: ChartBodyProps) => React.ReactElement>> = {
  kpi: Kpi,
  table: DataTable,
  pivot: PivotTable,
};

function ChartBody({ spec, height, onItemClick, rowMarking }: ChartBodyProps) {
  const DomChart = DOM_TYPES[spec.chartType];
  if (DomChart !== undefined) {
    return (
      <DomChart
        spec={spec}
        {...(height === undefined ? {} : { height })}
        // Only a table has rows to mark; the others take no marking prop.
        {...(rowMarking === undefined || spec.chartType !== 'table' ? {} : { marking: rowMarking })}
      />
    );
  }

  if (!isDrawable(spec.chartType)) {
    // Saying so beats drawing something the spec never asked for.
    return (
      <StateLine kind="warn" testId="chart-not-drawable">
        {spec.chartType} charts are not drawn yet.
      </StateLine>
    );
  }

  return (
    <ChartCanvas
      spec={spec}
      {...(height === undefined ? {} : { height })}
      {...(onItemClick === undefined ? {} : { onItemClick })}
    />
  );
}

export function ChartTile({
  spec,
  height,
  tableView,
  onTableViewChange,
  busy,
  inEffect,
  title,
  asOf,
  served,
  onItemClick,
  rowMarking,
  badge,
}: ChartTileProps) {
  // Uncontrolled unless the owner says otherwise, so a tile that outlives its
  // data needs no ceremony.
  const [ownState, setOwnState] = useState(false);
  const asTable = tableView ?? ownState;
  const setAsTable = (showing: boolean) => {
    if (onTableViewChange === undefined) setOwnState(showing);
    else onTableViewChange(showing);
  };

  // A table showing itself as a table is a no-op, and offering the switch
  // there would be a control that does nothing.
  const canSwitch = spec.chartType !== 'table';
  const showingTable = asTable && canSwitch;

  const heading =
    title === undefined || title.trim() === '' ? null : (
      <h3 className="tile-head__title">{title}</h3>
    );
  // Where the answer came from, then when its data is from — and, while it is
  // being asked again, that it is: in words with its icon, not only by the
  // fade (T183, AC-177). No live region: every tile a filter reaches is asked
  // at once, and `aria-busy` already says it of each.
  const dataAsOf = (
    <>
      {busy === true ? (
        <span className="tile-busy" data-testid="tile-busy">
          <StatusIcon kind="run" />
          Updating…
        </span>
      ) : null}
      {served === undefined ? null : <AccelerationBadge result={served} />}
      {asOf === undefined ? null : <DataAsOf at={asOf} />}
    </>
  );
  const saysOfData = busy === true || served !== undefined || asOf !== undefined;

  // No rows: said in words, whatever the chart type (AC-043) — not blank
  // axes, and no table switch, since there is no data behind either view.
  if (spec.rows.length === 0) {
    return (
      <div
        className={busy === true ? 'chart-tile chart-tile--busy' : 'chart-tile'}
        data-testid="chart-tile"
        aria-busy={busy === true ? true : undefined}
      >
        {heading === null && !saysOfData && badge == null ? null : (
          <div className="tile-head">
            {heading}
            {badge}
            {dataAsOf}
          </div>
        )}
        <TileEmpty inEffect={inEffect} />
      </div>
    );
  }

  return (
    <div
      className={busy === true ? 'chart-tile chart-tile--busy' : 'chart-tile'}
      data-testid="chart-tile"
      aria-busy={busy === true ? true : undefined}
    >
      {/* The prototype's .tile-head: the chart's title, and the tile's own
          controls — here the table view, a small ghost button (AC-187). */}
      <div className="tile-head">
        {heading}
        {badge}
        {dataAsOf}
        {canSwitch ? (
          <button
            type="button"
            className="btn-ghost btn-sm tile-head__action"
            data-testid="toggle-table-view"
            aria-pressed={showingTable}
            onClick={() => {
              setAsTable(!showingTable);
            }}
          >
            {showingTable ? 'Chart view' : 'Table view'}
          </button>
        ) : null}
      </div>

      {showingTable ? (
        // The same rows the chart drew, not a second query — the drawer at
        // AC-036 is built on the same rule, and for the same reason.
        <DataTable spec={spec} label={title} {...(height === undefined ? {} : { height })} />
      ) : (
        <ChartBody
          spec={spec}
          {...(height === undefined ? {} : { height })}
          {...(onItemClick === undefined ? {} : { onItemClick })}
          {...(rowMarking === undefined ? {} : { rowMarking })}
        />
      )}
    </div>
  );
}
