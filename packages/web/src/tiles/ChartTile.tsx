import { isDrawable } from '@wechart/charts';
import type { ChartType, RenderSpec } from '@wechart/core';
import { useState } from 'react';

import { ChartCanvas } from './ChartCanvas';
import { DataTable } from './DataTable';
import { Kpi } from './Kpi';
import { PivotTable } from './PivotTable';

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

export function ChartTile({ spec, height }: ChartTileProps) {
  const [asTable, setAsTable] = useState(false);

  // A table showing itself as a table is a no-op, and offering the switch
  // there would be a control that does nothing.
  const canSwitch = spec.chartType !== 'table';
  const showingTable = asTable && canSwitch;

  return (
    <div className="chart-tile" data-testid="chart-tile">
      {canSwitch ? (
        <button
          type="button"
          data-testid="toggle-table-view"
          aria-pressed={showingTable}
          onClick={() => setAsTable((shown) => !shown)}
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
