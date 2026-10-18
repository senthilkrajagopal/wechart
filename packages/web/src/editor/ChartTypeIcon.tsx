import type { ReactNode } from 'react';

import type { CardId } from './chartTypeCatalog';

/**
 * Each chart type's icon, as the prototype's recommender draws them
 * (`docs/design/prototype/reco.js`, `TYPES[…].icon`): 16 × 16, a 1.5 px
 * stroke in the current colour (T688, EDI-24). The prototype draws no pie
 * (its "pie" is the donut), box plot or map: those three are drawn here in
 * its manner. Decorative: the type is always named beside it.
 */
const PATHS: Readonly<Record<CardId, ReactNode>> = {
  kpi: <path d="M3 11h10M5 8l2-3 2 2 2-3" />,
  bar: <path d="M3 13V8M8 13V4M13 13V9" />,
  hbar: <path d="M3 4h7M3 8h10M3 12h5" />,
  groupedBar: <path d="M3 13V7M5 13V5M10 13V8M12 13V4" />,
  stackedBar: <path d="M4 13V7M4 7V4M9 13V9M9 9V6M14 13V10" />,
  line: <path d="M2 12l4-4 3 2 5-6" />,
  multiLine: <path d="M2 12l4-4 3 2 5-6M2 13l4-2 3 1 5-3" />,
  area: <path d="M2 13l4-5 3 2 5-6v9z" fill="currentColor" fillOpacity=".2" />,
  stackedArea: <path d="M2 13l4-3 4 1 4-4v6zM2 10l4-4 4 1 4-4" />,
  scatter: (
    <>
      <circle cx="4" cy="11" r="1" />
      <circle cx="7" cy="7" r="1" />
      <circle cx="11" cy="9" r="1" />
      <circle cx="12" cy="4" r="1" />
    </>
  ),
  pie: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 2v6h6" />
    </>
  ),
  donut: (
    <>
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 2v3.5" />
    </>
  ),
  treemap: (
    <>
      <rect x="2" y="2" width="12" height="12" />
      <path d="M8 2v12M8 8h6" />
    </>
  ),
  heatmap: (
    <>
      <rect x="2" y="2" width="12" height="12" />
      <path d="M6 2v12M10 2v12M2 6h12M2 10h12" />
    </>
  ),
  table: (
    <>
      <rect x="2" y="3" width="12" height="10" />
      <path d="M2 6h12M6 3v10" />
    </>
  ),
  pivot: (
    <>
      <rect x="2" y="3" width="12" height="10" />
      <path d="M2 6h12M6 3v10M10 3v10M2 9.5h12" />
    </>
  ),
  trellis: (
    <>
      <rect x="2" y="2" width="5" height="5" />
      <rect x="9" y="2" width="5" height="5" />
      <rect x="2" y="9" width="5" height="5" />
      <rect x="9" y="9" width="5" height="5" />
    </>
  ),
  combo: (
    <>
      <path d="M3 13V9M7 13V7M11 13V10" />
      <path d="M2 6l4-2 4 3 4-4" />
    </>
  ),
  boxplot: (
    <>
      <rect x="5" y="5" width="6" height="6" />
      <path d="M8 2v3M8 11v3M6 2h4M6 14h4M5 8h6" />
    </>
  ),
  map: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c-2.2 2-2.2 10 0 12M8 2c2.2 2 2.2 10 0 12" />
    </>
  ),
  // R81's cards (T934): design 23's symbols redrawn in the prototype's
  // manner, 16 × 16 at a 1.5 px stroke.
  waterfall: <path d="M3 13V5M6.5 5V3M10 3v5M13 13V8M2 13.5h12" />,
  histogram: <path d="M2 13V10h3V6h3V4h3v5h3v4M2 13h12" />,
  bubble: (
    <>
      <circle cx="5" cy="10" r="2.5" />
      <circle cx="10.5" cy="6" r="3.5" />
      <circle cx="12.5" cy="12.5" r="1" />
    </>
  ),
  parallel: <path d="M3 3v10M8 3v10M13 3v10M3 5l5 6 5-7M3 11l5-5 5 6" />,
  bullet: (
    <>
      <rect x="2" y="5" width="12" height="6" />
      <path d="M2 8h8M11.5 3.5v9" />
    </>
  ),
  sankey: <path d="M2 3v4M2 9v4M14 3v3M14 8v5M2 5c6 0 6-.5 12-.5M2 11c6 0 6-1 12-1" />,
  funnel: <path d="M2 3h12M2 6.5h9M2 10h6M2 13.5h3" />,
  timeline: <path d="M2 2v12M4 4h5M6 8h6M5 12h3M10 12h3" />,
  calendar: (
    <>
      <rect x="2" y="3" width="12" height="11" />
      <path d="M2 6h12M4.5 8.5h1M7.5 8.5h1M10.5 8.5h1M4.5 11.5h1M7.5 11.5h1" />
    </>
  ),
  icicle: (
    <>
      <rect x="2" y="2" width="12" height="12" />
      <path d="M2 6h12M2 10h12M9 6v4M6 10v4M11 10v4" />
    </>
  ),
  graphicalTable: (
    <>
      <rect x="2" y="3" width="12" height="10" />
      <path d="M2 6h12M6 3v10M7.5 11l2-2 1.5 1 2-2.5" />
    </>
  ),
  stackedBar100: <path d="M2 3h12M4 13V8.5M4 7V3M9 13V10M9 8.5V3M14 13V6M14 4.5V3" />,
  stackedArea100: (
    <>
      <rect x="2" y="3" width="12" height="10" />
      <path d="M2 9l4-2 4 1 4-3" />
    </>
  ),
};

export function ChartTypeIcon({ type, size = 16 }: { type: CardId; size?: number }) {
  return (
    <svg
      className="chart-type-icon"
      data-chart-icon={type}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[type]}
    </svg>
  );
}
