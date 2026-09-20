import { isDrawable } from '@wechart/charts';
import type { ChartType, RenderSpec } from '@wechart/core';

import { ChartCanvas } from './ChartCanvas';
import { Kpi } from './Kpi';

/**
 * One chart, whatever kind it is (AC-037).
 *
 * Not every type is drawn the same way. Most go to ECharts; a few are DOM,
 * because a number or a table drawn on a canvas would be unselectable,
 * unsearchable and invisible to a screen reader for no gain — the conclusion
 * `docs/research/echarts.md` reaches as well. This is the one place that
 * knows which is which, so nothing upstream has to.
 */
export interface ChartTileProps {
  readonly spec: RenderSpec;
  readonly height?: number;
}

/** Types wechart draws as DOM rather than handing to ECharts. */
const DOM_TYPES: Partial<Record<ChartType, (props: ChartTileProps) => React.ReactElement>> = {
  kpi: Kpi,
};

export function ChartTile({ spec, height }: ChartTileProps) {
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
