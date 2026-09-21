import { isDrawable } from '@wechart/charts';
import type { ChartType, RenderSpec } from '@wechart/core';
import { useState } from 'react';

import { ChartCanvas } from './ChartCanvas';
import { DataTable } from './DataTable';
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
}

interface ChartBodyProps {
  readonly spec: RenderSpec;
  readonly height?: number;
}

/** Types wechart draws as DOM rather than handing to ECharts. */
const DOM_TYPES: Partial<Record<ChartType, (props: ChartBodyProps) => React.ReactElement>> = {
  kpi: Kpi,
  table: DataTable,
  pivot: PivotTable,
};

function ChartBody({ spec, height }: ChartBodyProps) {
  const DomChart = DOM_TYPES[spec.chartType];
  if (DomChart !== undefined) {
    return <DomChart spec={spec} {...(height === undefined ? {} : { height })} />;
  }

  if (!isDrawable(spec.chartType)) {
    // Saying so beats drawing something the spec never asked for.
    return (
      <p data-testid="chart-not-drawable" role="status">
        {spec.chartType} charts are not drawn yet.
      </p>
    );
  }

  return <ChartCanvas spec={spec} {...(height === undefined ? {} : { height })} />;
}

export function ChartTile({
  spec,
  height,
  tableView,
  onTableViewChange,
  busy,
  inEffect,
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

  // No rows: said in words, whatever the chart type (AC-043) — not blank
  // axes, and no table switch, since there is no data behind either view.
  if (spec.rows.length === 0) {
    return (
      <div
        className={busy === true ? 'chart-tile chart-tile--busy' : 'chart-tile'}
        data-testid="chart-tile"
        aria-busy={busy === true ? true : undefined}
      >
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
      {canSwitch ? (
        <button
          type="button"
          data-testid="toggle-table-view"
          aria-pressed={showingTable}
          onClick={() => {
            setAsTable(!showingTable);
          }}
        >
          {showingTable ? 'Chart view' : 'Table view'}
        </button>
      ) : null}

      {showingTable ? (
        // The same rows the chart drew, not a second query — the drawer at
        // AC-036 is built on the same rule, and for the same reason.
        <DataTable spec={spec} {...(height === undefined ? {} : { height })} />
      ) : (
        <ChartBody spec={spec} {...(height === undefined ? {} : { height })} />
      )}
    </div>
  );
}
