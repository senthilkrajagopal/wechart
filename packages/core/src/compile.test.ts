import { describe, expect, it } from 'vitest';

import { chartDocumentOf, type ChartDocument } from './chart-document';
import { addToWell, emptySpec } from './chart-spec';
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
