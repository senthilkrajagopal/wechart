import { describe, expect, it } from 'vitest';

import {
  CHART_DOCUMENT_VERSION,
  chartDocumentOf,
  readChartDocument,
  toChartSpec,
  type ChartDocument,
} from './chart-document';
import { addToWell, emptySpec } from './chart-spec';

/**
 * AC-014: WHEN a dashboard, chart, folder, bookmark or setting is saved, THE
 * SYSTEM SHALL store it so that it is present and unchanged after the wechart
 * service restarts.
 * Fails when: any saved object is missing or altered after a restart.
 *
 * "Unchanged" is the whole of it. A chart that comes back with a different
 * chart type, a dropped member or a silently defaulted encoding has been
 * altered, even though nothing errored.
 */
const full: ChartDocument = {
  schemaVersion: CHART_DOCUMENT_VERSION,
  title: 'Orders by status',
  owner: 'admin',
  folderId: 'folder-1',
  chart: {
    source: { cube: 'orders' },
    wells: {
      measures: ['orders.count'],
      dimensions: ['orders.status'],
      timeDimensions: ['orders.ordered_at'],
    },
    chartType: 'stackedBar',
    encoding: { x: ['orders.status'], color: ['orders.status'] },
    options: { legend: { position: 'right' } },
  },
};

const roundTrip = (document: ChartDocument) =>
  readChartDocument(JSON.parse(JSON.stringify(document)) as unknown);

describe('a saved chart survives the trip through storage', () => {
  it('comes back exactly as it went in', () => {
    expect(roundTrip(full)).toEqual(full);
  });

  it('keeps a chart that has no pinned type, encoding or options', () => {
    const minimal: ChartDocument = {
      schemaVersion: CHART_DOCUMENT_VERSION,
      title: 'Untitled',
      chart: {
        source: { cube: 'orders' },
        wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
      },
    };

    // Absent is not the same as empty: absent means "follow the
    // recommendation", and writing `{}` back would silently pin the chart.
    const read = roundTrip(minimal);
    expect(read).toEqual(minimal);
    expect(read.chart.chartType).toBeUndefined();
    expect(read.chart.encoding).toBeUndefined();
  });

  it('keeps the catalog fields at the top level', () => {
    // The documents table generates its title, folder and owner columns from
    // these keys, so nesting them would empty the folder tree and search.
    const body = JSON.parse(JSON.stringify(full)) as Record<string, unknown>;

    expect(body['title']).toBe('Orders by status');
    expect(body['folderId']).toBe('folder-1');
    expect(body['owner']).toBe('admin');
  });
});

describe('a body the reader does not understand', () => {
  it('is refused when it carries no version at all', () => {
    const unversioned: Record<string, unknown> = { ...full };
    delete unversioned['schemaVersion'];

    // Guessing would be worse than failing: the shape that has no version is
    // the pre-chart-definition body, and reading it as a current one would
    // invent an empty chart where a real one is expected.
    expect(() => readChartDocument(unversioned)).toThrow(/version/i);
  });

  it('is refused when it was written by a newer wechart, and says so', () => {
    const newer = { ...full, schemaVersion: CHART_DOCUMENT_VERSION + 1 };

    expect(() => readChartDocument(newer)).toThrow(new RegExp(String(CHART_DOCUMENT_VERSION + 1)));
  });

  it('is refused when the chart names no cube', () => {
    const noCube = { ...full, chart: { ...full.chart, source: {} } };

    expect(() => readChartDocument(noCube)).toThrow(/cube/i);
  });

  it('is refused when a well holds something that is not a member name', () => {
    const bad = {
      ...full,
      chart: { ...full.chart, wells: { ...full.chart.wells, measures: [42] } },
    };

    expect(() => readChartDocument(bad)).toThrow(/measures/i);
  });
});

describe('the document and the authoring shape agree', () => {
  it('carries the same members in both directions', () => {
    let spec = addToWell(emptySpec('orders'), 'measures', 'orders.count');
    spec = addToWell(spec, 'dimensions', 'orders.status');
    spec = addToWell(spec, 'timeDimensions', 'orders.ordered_at');

    const document = chartDocumentOf({ title: 'Orders by status', spec });

    expect(document.schemaVersion).toBe(CHART_DOCUMENT_VERSION);
    expect(toChartSpec(document)).toEqual(spec);
  });

  it('round-trips a pinned chart type', () => {
    const spec = { ...emptySpec('orders'), chartType: 'hbar' as const };

    expect(toChartSpec(chartDocumentOf({ title: 'x', spec })).chartType).toBe('hbar');
  });

  /** T229 / AC-216: a chosen grain and the chart's own filters are saved with it. */
  it('round-trips a chosen grain and the chart’s filters, through storage too', () => {
    const spec = {
      ...addToWell(emptySpec('orders'), 'timeDimensions', 'orders.ordered_at'),
      granularities: { 'orders.ordered_at': 'quarter' as const },
      filters: [{ member: 'orders.status', operator: 'notEquals' as const, values: ['refunded'] }],
    };
    const document = chartDocumentOf({ title: 'x', spec });

    expect(toChartSpec(document)).toEqual(spec);
    expect(roundTrip(document)).toEqual(document);
  });

  /** T400 / AC-314: a box plot's "Each point is" is saved with its wells. */
  it('round-trips a box plot’s "Each point is", through storage too', () => {
    const spec = {
      ...addToWell(
        addToWell(emptySpec('orders'), 'measures', 'orders.total_amount'),
        'dimensions',
        'orders.status',
      ),
      chartType: 'boxplot' as const,
      eachPointIs: 'customers.name',
    };
    const document = chartDocumentOf({ title: 'x', spec });

    expect(document.chart.wells.eachPointIs).toBe('customers.name');
    expect(toChartSpec(document)).toEqual(spec);
    expect(roundTrip(document)).toEqual(document);
    const odd = {
      ...full,
      chart: { ...full.chart, wells: { ...full.chart.wells, eachPointIs: 7 } },
    };
    expect(() => readChartDocument(odd)).toThrow(/Each point is/);
  });

  it('refuses a grain Cube does not have, and a filter that is not one', () => {
    const grain = {
      ...full,
      chart: { ...full.chart, granularities: { 'orders.ordered_at': 'fortnight' } },
    };
    expect(() => readChartDocument(grain)).toThrow(/fortnight/);

    const filter = {
      ...full,
      chart: {
        ...full.chart,
        filters: [{ member: 'orders.status', operator: 'like', values: [] }],
      },
    };
    expect(() => readChartDocument(filter)).toThrow(/filter/i);
  });
});
