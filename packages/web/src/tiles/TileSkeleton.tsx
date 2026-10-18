import type { ChartType } from '@wechart/core';

/**
 * A tile that is still loading (AC-042, direction.md rule 18).
 *
 * "A skeleton in the shape of the chart", and the criterion's failing state is
 * "loading shows an empty tile". So the shape actually varies by chart type: a
 * reader watching a dashboard fill in should be able to tell a bar chart from
 * a pie before either has data, and a tile that reserves the right shape does
 * not jump when the data lands.
 *
 * Not a spinner. A spinner says "something is happening"; a skeleton says
 * "something is happening *here*, and it will look like this".
 */
export interface TileSkeletonProps {
  readonly chartType: ChartType;
  readonly height?: number;
}

const DEFAULT_HEIGHT = 320;

/** Which skeleton a type gets. Several types share a shape, as they should. */
type Shape = 'bars' | 'hbars' | 'line' | 'circle' | 'blocks' | 'grid' | 'dots' | 'number' | 'rows';

const SHAPES: Record<ChartType, Shape> = {
  bar: 'bars',
  groupedBar: 'bars',
  stackedBar: 'bars',
  combo: 'bars',
  boxplot: 'bars',
  hbar: 'hbars',
  line: 'line',
  multiLine: 'line',
  area: 'line',
  stackedArea: 'line',
  scatter: 'dots',
  pie: 'circle',
  donut: 'circle',
  treemap: 'blocks',
  heatmap: 'grid',
  trellis: 'blocks',
  // Regions, as a patchwork of blocks is (T398).
  map: 'blocks',
  kpi: 'number',
  table: 'rows',
  pivot: 'rows',
  // R81's types (T934), each in the nearest shape it draws.
  waterfall: 'bars',
  histogram: 'bars',
  bullet: 'hbars',
  funnel: 'hbars',
  timeline: 'hbars',
  bubble: 'dots',
  parallel: 'line',
  sankey: 'blocks',
  icicle: 'blocks',
  calendar: 'grid',
  graphicalTable: 'rows',
};

const FILL = 'var(--wc-bg-subtle)';

function ShapeFor({ shape }: { shape: Shape }) {
  switch (shape) {
    case 'bars':
      return (
        <>
          {[40, 70, 55, 85].map((height, index) => (
            <rect key={index} x={10 + index * 25} y={100 - height} width={16} height={height} />
          ))}
        </>
      );
    case 'hbars':
      return (
        <>
          {[40, 70, 55, 85].map((width, index) => (
            <rect key={index} x={0} y={10 + index * 25} width={width} height={16} />
          ))}
        </>
      );
    case 'line':
      return <polyline points="0,80 25,40 50,60 75,20 100,45" fill="none" strokeWidth={4} />;
    case 'circle':
      return <circle cx={50} cy={50} r={40} />;
    case 'dots':
      return (
        <>
          {[
            [20, 70],
            [40, 40],
            [60, 55],
            [80, 25],
          ].map(([x, y], index) => (
            <circle key={index} cx={x} cy={y} r={6} />
          ))}
        </>
      );
    case 'blocks':
      return (
        <>
          <rect x={0} y={0} width={55} height={100} />
          <rect x={60} y={0} width={40} height={45} />
          <rect x={60} y={50} width={40} height={50} />
        </>
      );
    case 'grid':
      return (
        <>
          {[0, 1, 2].flatMap((row) =>
            [0, 1, 2].map((column) => (
              <rect
                key={`${String(row)}-${String(column)}`}
                x={column * 34}
                y={row * 34}
                width={30}
                height={30}
              />
            )),
          )}
        </>
      );
    case 'number':
      return <rect x={10} y={35} width={80} height={30} />;
    case 'rows':
      return (
        <>
          {[0, 1, 2, 3].map((row) => (
            <rect key={row} x={0} y={row * 25} width={100} height={16} />
          ))}
        </>
      );
  }
}

export function TileSkeleton({ chartType, height = DEFAULT_HEIGHT }: TileSkeletonProps) {
  const shape = SHAPES[chartType];

  return (
    <div
      className="tile-skeleton"
      data-testid="tile-skeleton"
      data-shape={shape}
      style={{ height: `${String(height)}px` }}
    >
      {/* Announced once rather than on every frame, and named, so a screen
          reader user knows which tile is still working. */}
      <p className="visually-hidden" role="status">
        Loading chart
      </p>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        aria-hidden="true"
        fill={FILL}
        stroke={FILL}
      >
        <ShapeFor shape={shape} />
      </svg>
    </div>
  );
}
