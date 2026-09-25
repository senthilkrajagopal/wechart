import type { ChartType } from '@wechart/core';

import { StateLine } from '../shell/StatusIcon';
import { TileSkeleton } from '../tiles/TileSkeleton';

/**
 * The dashboard's frame while the dashboard itself is on its way (T251;
 * recheck-dashboard F15; direction.md §6: "Loading: a skeleton of the chart
 * form, not a spinner"): the header's row, the page-tab strip, the filter
 * band and tile frames with a chart's shape in them, where there had been a
 * lone "Loading…". Built from the dashboard's own classes, so nothing moves
 * when the dashboard arrives in their place.
 *
 * Its layout is not the dashboard's, which is not known yet: two half-width
 * tiles over a full-width one, the seeded and the prototype's commonest start.
 */
const FRAMES: readonly { readonly span: number; readonly shape: ChartType }[] = [
  { span: 6, shape: 'bar' },
  { span: 6, shape: 'line' },
  { span: 12, shape: 'bar' },
];

export function DashboardLoading() {
  return (
    <div className="dashboard dashboard--loading" data-testid="dashboard-loading" aria-busy="true">
      <header className="dashboard__header">
        <span className="dashboard-loading__crumbs" aria-hidden="true">
          <span className="skeleton-bar" />
        </span>
        <span className="dashboard-loading__title" aria-hidden="true">
          <span className="skeleton-bar" />
        </span>
        {/* Said, as well as drawn (rule 3): a status with its icon. */}
        <StateLine kind="run" className="dashboard-loading__status">
          Loading the dashboard…
        </StateLine>
      </header>
      <div className="dashboard__fixed" aria-hidden="true">
        <div className="page-tabs__row">
          <div className="page-tabs">
            <span className="dashboard-loading__tab">
              <span className="skeleton-bar" />
            </span>
          </div>
          {/* The rest of the strip's rule, the whole width, as the
              dashboard's own row draws it (T251's review). */}
          <div className="page-tabs__rest" />
        </div>
        <div className="filter-bar" />
      </div>
      <div className="dashboard__body">
        <div className="dashboard__canvas">
          <div className="dashboard-page" data-width="fixed">
            <div className="grid-canvas dashboard-loading__grid" aria-hidden="true">
              {FRAMES.map((frame, at) => (
                <div
                  key={at}
                  className="grid-tile"
                  style={{ gridColumn: `span ${String(frame.span)}` }}
                >
                  <div className="tile-head">
                    <span className="skeleton-bar" />
                  </div>
                  <TileSkeleton chartType={frame.shape} height={240} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
