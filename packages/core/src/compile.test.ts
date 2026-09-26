import { describe, expect, it } from 'vitest';

import { chartDocumentOf, toChartSpec, type ChartDocument } from './chart-document';
import { addToWell, emptySpec, toCubeQuery } from './chart-spec';
import { compile, defaultEncoding } from './compile';

/**
 * AC-037: THE SYSTEM SHALL render … from a chart spec.
 *
 * This is the step that makes "from a chart spec" true: a saved document plus
 * the rows its query returned becomes the `RenderSpec` the renderers already
 * consume. Without it the renderers can only be handed a spec built by hand,
 * and the criterion cannot be demonstrated end to end however many chart types
 * exist.
 */
const ROWS = [
  { 'orders.status': 'paid', 'orders.count': 10 },
  { 'orders.status': 'refunded', 'orders.count': 30 },
];

function documentFor(
  build: (spec: ReturnType<typeof emptySpec>) => ReturnType<typeof emptySpec>,
): ChartDocument {
  return chartDocumentOf({ title: 'A chart', spec: build(emptySpec('orders')) });
}

const withStatusAndCount = documentFor((spec) =>
  addToWell(addToWell(spec, 'measures', 'orders.count'), 'dimensions', 'orders.status'),
);

describe('the default encoding follows from the wells', () => {
  it('puts the dimension on x and the measures on y', () => {
    const encoding = defaultEncoding(withStatusAndCount.chart);

    expect(encoding.x).toEqual(['orders.status']);
    expect(encoding.y).toEqual(['orders.count']);
  });

  it('prefers a time dimension on x, and moves the plain dimension to colour', () => {
    const document = documentFor((spec) => {
      let next = addToWell(spec, 'measures', 'orders.count');
      next = addToWell(next, 'dimensions', 'orders.status');
      return addToWell(next, 'timeDimensions', 'orders.ordered_at');
    });

    // Time is the axis a reader expects to run left to right; a second
    // categorical member becomes the series rather than fighting it for x.
    const encoding = defaultEncoding(document.chart);
    expect(encoding.x).toEqual(['orders.ordered_at']);
    expect(encoding.color).toEqual(['orders.status']);
  });

  it('makes a second dimension the series when there is no time dimension', () => {
    const document = documentFor((spec) => {
      let next = addToWell(spec, 'measures', 'orders.count');
      next = addToWell(next, 'dimensions', 'orders.status');
      return addToWell(next, 'dimensions', 'orders.region');
    });

    const encoding = defaultEncoding(document.chart);
    expect(encoding.x).toEqual(['orders.status']);
    expect(encoding.color).toEqual(['orders.region']);
  });

  it('leaves a channel out entirely when nothing fills it', () => {
    const encoding = defaultEncoding(withStatusAndCount.chart);

    // Absent, not empty: an empty list would read as "the user cleared this".
    expect(encoding.color).toBeUndefined();
    expect(encoding.facet).toBeUndefined();
  });
});

/**
 * T242 / AC-037: … scatter, heatmap … trellis (small multiples) … from a
 * chart spec. Each draws from the channels it reads: a scatter from two
 * measures on its axes, a heatmap from two groupings across and down with the
 * measure as its colour, small multiples from a panel per split. Encoded as a
 * bar is, each drew nothing from the editor's wells.
 */
describe('the default encoding of the types that read their channels differently', () => {
  const twoMeasuresTwoDimensions = documentFor((spec) => {
    let next = addToWell(spec, 'measures', 'orders.count');
    next = addToWell(next, 'measures', 'orders.total');
    next = addToWell(next, 'dimensions', 'orders.status');
    return addToWell(next, 'dimensions', 'orders.region');
  });
  const overTime = documentFor((spec) => {
    let next = addToWell(spec, 'measures', 'orders.count');
    next = addToWell(next, 'dimensions', 'orders.status');
    return addToWell(next, 'timeDimensions', 'orders.ordered_at');
  });

  it('puts a scatter’s two measures on its axes, coloured by the first dimension', () => {
    expect(defaultEncoding(twoMeasuresTwoDimensions.chart, 'scatter')).toEqual({
      x: ['orders.count'],
      y: ['orders.total'],
      color: ['orders.status'],
    });
  });

  it('puts a heatmap’s groupings across and down, its measure as the colour', () => {
    expect(defaultEncoding(twoMeasuresTwoDimensions.chart, 'heatmap')).toEqual({
      x: ['orders.status'],
      y: ['orders.region'],
      color: ['orders.count'],
    });
    expect(defaultEncoding(overTime.chart, 'heatmap')).toEqual({
      x: ['orders.ordered_at'],
      y: ['orders.status'],
      color: ['orders.count'],
    });
  });

  it('draws small multiples a panel per split, of the one measure each panel draws', () => {
    expect(defaultEncoding(overTime.chart, 'trellis')).toEqual({
      x: ['orders.ordered_at'],
      y: ['orders.count'],
      facet: ['orders.status'],
    });
    // Its renderer draws the first measure; a second would take the first's
    // place in the tooltip's formats (T242's review).
    expect(defaultEncoding(twoMeasuresTwoDimensions.chart, 'trellis').y).toEqual(['orders.count']);
  });

  // T242's review: a pivot reads rows and columns, which nothing filled.
  it('lays a pivot’s groupings down its rows and across its columns', () => {
    expect(defaultEncoding(twoMeasuresTwoDimensions.chart, 'pivot')).toEqual({
      row: ['orders.status'],
      column: ['orders.region'],
      y: ['orders.count', 'orders.total'],
    });
  });

  it('boxes a box plot’s first measure by its first plain dimension, even beside a time dimension (T399)', () => {
    expect(defaultEncoding(overTime.chart, 'boxplot')).toEqual({
      x: ['orders.status'],
      y: ['orders.count'],
    });
    expect(defaultEncoding(twoMeasuresTwoDimensions.chart, 'boxplot')).toEqual({
      x: ['orders.status'],
      y: ['orders.count'],
    });
  });

  it('encodes every other type as before, and a compile uses the type it draws', () => {
    expect(defaultEncoding(twoMeasuresTwoDimensions.chart, 'groupedBar')).toEqual(
      defaultEncoding(twoMeasuresTwoDimensions.chart),
    );
    const spec = compile(twoMeasuresTwoDimensions, { rows: [], chartType: 'heatmap' });
    expect(spec.encoding.color).toEqual(['orders.count']);
  });
});

describe('compiling a saved document', () => {
  it('produces a RenderSpec the renderers consume', () => {
    const spec = compile(withStatusAndCount, { rows: ROWS, chartType: 'bar' });

    expect(spec.chartType).toBe('bar');
    expect(spec.rows).toEqual(ROWS);
    expect(spec.encoding.x).toEqual(['orders.status']);
    expect(spec.encoding.y).toEqual(['orders.count']);
  });

  it('takes the chart type the document pinned over the one offered', () => {
    const pinned: ChartDocument = {
      ...withStatusAndCount,
      chart: { ...withStatusAndCount.chart, chartType: 'hbar' },
    };

    // AC-032: a manual choice survives, and compiling must not quietly
    // re-apply the recommendation over it.
    expect(compile(pinned, { rows: ROWS, chartType: 'bar' }).chartType).toBe('hbar');
  });

  it('folds the long tail into Other before the renderer sees it', () => {
    const many: ChartDocument = {
      ...withStatusAndCount,
      chart: { ...withStatusAndCount.chart, options: { topN: 2 } },
    };
    const rows = [
      { 'orders.status': 'a', 'orders.count': 50 },
      { 'orders.status': 'b', 'orders.count': 40 },
      { 'orders.status': 'c', 'orders.count': 30 },
      { 'orders.status': 'd', 'orders.count': 20 },
    ];

    // Doing it here rather than per renderer means no chart type can be
    // quietly exempt from the cap (AC-041).
    const compiled = compile(many, { rows, chartType: 'bar' });
    expect(compiled.rows.map((row) => row['orders.status'])).toEqual(['a', 'b', 'Other (2)']);
  });

  // T390, AC-041: a row limit drops the rows past it, as they are drawn:
  // after the sort, so it keeps what the reader sees first.
  it('drops the rows past a row limit, after sorting', () => {
    const limited: ChartDocument = {
      ...withStatusAndCount,
      chart: {
        ...withStatusAndCount.chart,
        options: { rowLimit: 2, sort: { by: 'value', direction: 'asc' } },
      },
    };
    const rows = [
      { 'orders.status': 'a', 'orders.count': 50 },
      { 'orders.status': 'b', 'orders.count': 40 },
      { 'orders.status': 'c', 'orders.count': 30 },
      { 'orders.status': 'd', 'orders.count': 20 },
    ];

    const compiled = compile(limited, { rows, chartType: 'bar' });
    expect(compiled.rows.map((row) => row['orders.status'])).toEqual(['d', 'c']);
  });

  it('carries the chart type options through untouched', () => {
    const withOptions: ChartDocument = {
      ...withStatusAndCount,
      chart: { ...withStatusAndCount.chart, options: { sharedScale: false, legend: 'right' } },
    };

    // Compile decides the encoding; what a chart type does with its own
    // options is the renderer's business, so they pass through unread.
    expect(compile(withOptions, { rows: ROWS, chartType: 'trellis' }).options).toEqual({
      sharedScale: false,
      legend: 'right',
    });
  });

  it('carries the palette and surface it is given rather than looking them up', () => {
    const spec = compile(withStatusAndCount, {
      rows: ROWS,
      chartType: 'bar',
      palette: ['#123456'],
      surface: '#fedcba',
    });

    // AC-039 rests on this: a member keeps one colour across a dashboard, so
    // the palette is a decision about the dashboard, not about one chart.
    expect(spec.palette).toEqual(['#123456']);
    expect(spec.surface).toBe('#fedcba');
  });

  it('names each time dimension’s granularity, the one its query asked for (AC-188)', () => {
    const document = documentFor((spec) =>
      addToWell(addToWell(spec, 'measures', 'orders.count'), 'timeDimensions', 'orders.ordered_at'),
    );
    const asked = toCubeQuery(toChartSpec(document)) as {
      timeDimensions: { dimension: string; granularity: string }[];
    };

    const compiled = compile(document, { rows: [], chartType: 'line' });

    // Written by the same granularity the rows were bucketed at, so a month
    // is never labelled as a day.
    expect(compiled.granularities).toEqual({
      'orders.ordered_at': asked.timeDimensions[0]?.granularity,
    });
    expect(compile(withStatusAndCount, { rows: ROWS, chartType: 'bar' }).granularities).toEqual({});
  });

  it('names a grain chosen from the pill, the one its query asks for (AC-216)', () => {
    const document = documentFor((spec) => ({
      ...addToWell(spec, 'timeDimensions', 'orders.ordered_at'),
      granularities: { 'orders.ordered_at': 'month' as const },
    }));
    const asked = toCubeQuery(toChartSpec(document)) as {
      timeDimensions: { dimension: string; granularity: string }[];
    };

    expect(asked.timeDimensions[0]?.granularity).toBe('month');
    expect(compile(document, { rows: [], chartType: 'line' }).granularities).toEqual({
      'orders.ordered_at': 'month',
    });
  });

  /**
   * T179 / AC-173: an export writes each measure's raw number as well as its
   * formatted value, so the spec says which of its members are measures —
   * whichever channel draws them.
   */
  it('names its measures, as the wells hold them (AC-173)', () => {
    expect(compile(withStatusAndCount, { rows: ROWS, chartType: 'bar' }).measures).toEqual([
      'orders.count',
    ]);
  });
});

describe('an encoding the user overrode', () => {
  it('wins over the default for the channel it names', () => {
    const overridden: ChartDocument = {
      ...withStatusAndCount,
      chart: { ...withStatusAndCount.chart, encoding: { color: ['orders.status'] } },
    };

    const { encoding } = compile(overridden, { rows: ROWS, chartType: 'bar' });
    expect(encoding.color).toEqual(['orders.status']);
  });

  it('leaves every channel it does not name at the default', () => {
    const overridden: ChartDocument = {
      ...withStatusAndCount,
      chart: { ...withStatusAndCount.chart, encoding: { color: ['orders.status'] } },
    };

    // A sparse override layer: naming one channel must not blank the rest,
    // which is what a wholesale replacement would do.
    const { encoding } = compile(overridden, { rows: ROWS, chartType: 'bar' });
    expect(encoding.x).toEqual(['orders.status']);
    expect(encoding.y).toEqual(['orders.count']);
  });

  it('can clear a channel the default would have filled', () => {
    const cleared: ChartDocument = {
      ...withStatusAndCount,
      chart: { ...withStatusAndCount.chart, encoding: { x: [] } },
    };

    // An empty list is the user saying "nothing here", which is different from
    // not mentioning the channel at all.
    expect(compile(cleared, { rows: ROWS, chartType: 'bar' }).encoding.x).toEqual([]);
  });
});
