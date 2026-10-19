import { describe, expect, it } from 'vitest';

import {
  CHART_DOCUMENT_VERSION,
  chartDocumentOf,
  readChartDocument,
  toChartSpec,
} from './chart-document';
import { LEGACY_FIXTURES, migrateChartDocument, recommenderRulesOf } from './chart-migrations';
import { emptySpec, RECOMMENDER_RULES, RULES_BEFORE_R81 } from './chart-spec';
import { mapLayersOf, mapSettingsOf } from './chart-types/map';

/**
 * AC-181: WHEN a saved chart written in an earlier document format is opened,
 * THE SYSTEM SHALL upgrade it to the current format on read and render the
 * same chart, and SHALL refuse to open one whose format is newer than it
 * understands, saying so.
 * Fails when: a chart stored in an earlier format opens with a different chart
 * type, different members or an empty query, or a chart from a newer format is
 * opened and silently renders something other than what it describes.
 *
 * The fixtures are the point of this file. One stored body per past version,
 * frozen, each asserting what the chart *was* — so a later migration step that
 * quietly drops a member or resets a chart type fails here rather than in
 * someone's dashboard.
 */
const read = (body: unknown) => readChartDocument(migrateChartDocument(body));

describe('every past format still opens', () => {
  it('has a frozen fixture for every version below the current one', () => {
    // A version with no fixture is a version nothing proves is still readable.
    const covered = LEGACY_FIXTURES.map((fixture) => fixture.version).sort((a, b) => a - b);
    // Versions 0 … CURRENT-1 are the past ones, so there are CURRENT of them.
    const expected = Array.from({ length: CHART_DOCUMENT_VERSION }, (_, index) => index);

    expect(covered).toEqual(expected);
  });

  for (const fixture of LEGACY_FIXTURES) {
    it(`upgrades version ${String(fixture.version)} to the current format`, () => {
      const document = read(fixture.body);

      expect(document.schemaVersion).toBe(CHART_DOCUMENT_VERSION);
      expect(document.title).toBe(fixture.expects.title);
      expect(document.chart.source.cube).toBe(fixture.expects.cube);
      expect(document.chart.wells.measures).toEqual(fixture.expects.measures);
      expect(document.chart.wells.dimensions).toEqual(fixture.expects.dimensions);
      expect(document.chart.wells.timeDimensions).toEqual(fixture.expects.timeDimensions);
      expect(document.chart.chartType).toBe(fixture.expects.chartType);
    });
  }
});

describe('a format from the future', () => {
  it('is refused, naming the version, rather than half-read', () => {
    const newer = {
      schemaVersion: CHART_DOCUMENT_VERSION + 1,
      title: 'From a newer wechart',
      chart: { source: { cube: 'orders' }, wells: {} },
    };

    // Migration is forward-only: there is nothing to downgrade with, and
    // guessing would render something other than what the chart describes.
    expect(() => read(newer)).toThrow(new RegExp(String(CHART_DOCUMENT_VERSION + 1)));
  });
});

describe('migration is safe to run more than once', () => {
  it('leaves a current document exactly as it is', () => {
    const current = {
      schemaVersion: CHART_DOCUMENT_VERSION,
      title: 'Already current',
      chart: {
        source: { cube: 'orders' },
        wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
      },
    };

    expect(migrateChartDocument(current)).toEqual(current);
    expect(migrateChartDocument(migrateChartDocument(current))).toEqual(current);
  });

  it('upgrades an old body to the same result however many times it is run', () => {
    const [first] = LEGACY_FIXTURES;
    if (first === undefined) return;

    const once = migrateChartDocument(first.body);
    expect(migrateChartDocument(once)).toEqual(once);
  });
});

describe('the pre-definition catalog body', () => {
  it('becomes a chart with no members rather than being dropped', () => {
    // Version 0 is the body that existed before charts carried a definition:
    // catalog metadata only. Those rows are real and must still open.
    const legacy = { title: 'Seeded local chart', localToDashboardId: 'dash-1', owner: 'admin' };

    const document = read(legacy);

    expect(document.title).toBe('Seeded local chart');
    expect(document.localToDashboardId).toBe('dash-1');
    expect(document.owner).toBe('admin');
    expect(document.chart.wells.measures).toEqual([]);
    // No chart type is pinned, so the recommender still gets to choose.
    expect(document.chart.chartType).toBeUndefined();
  });
});

/**
 * T973 / AC-622, AC-305: a country map saved before R81 SHALL open as the
 * Map, with a Regions layer on the Countries boundary set, drawing as it did.
 * `Fails when: … a country map saved before R81 opens as another type, another
 * boundary set, or draws a country another colour.`
 *
 * No step is needed: a Map with no settings of its own reads as Regions on
 * Countries, its region key the chart's dimension and its colour the measure.
 */
describe('a country map saved before R81', () => {
  // As T398 stored one, in each format a country map was saved in.
  const countryMap = (schemaVersion: number) => ({
    schemaVersion,
    title: 'Revenue by country',
    owner: 'admin',
    folderId: 'seed-folder-0',
    chart: {
      source: { cube: 'orders' },
      wells: {
        measures: ['orders.total_amount'],
        dimensions: ['customers.country'],
        timeDimensions: [],
      },
      chartType: 'map',
    },
  });

  for (const version of [1, 2]) {
    it(`opens, from version ${String(version)}, as a Map with Regions on Countries and the same fields`, () => {
      const document = read(countryMap(version));
      expect(document.chart.chartType).toBe('map');
      expect(document.chart.wells.measures).toEqual(['orders.total_amount']);
      expect(document.chart.wells.dimensions).toEqual(['customers.country']);
      expect(mapSettingsOf(document.chart.options)).toEqual({ boundarySet: 'countries' });
      expect(mapLayersOf(document.chart)).toEqual({
        regions: { key: 'customers.country', measure: 'orders.total_amount' },
      });
    });
  }
});

/**
 * T970 / AC-562: WHEN a chart saved in Auto before R81's recommender rules
 * opens, THE SYSTEM SHALL draw the type it drew when saved, and apply R81's
 * rules only from the next change to its fields, so that no tile on a
 * published dashboard changes type without an edit.
 * `Fails when: a dashboard tile saved in Auto … drawn as a bar before R81,
 * draws as anything but that bar before its fields change; …`
 *
 * A chart says which rules it was saved under; one saved in Auto with none
 * was saved before them, and reads as such — no rewrite, nothing saved.
 */
describe('the recommender rules a chart was saved under (T970, AC-562)', () => {
  // Four measures by Product, as R81 makes parallel coordinates of.
  const auto = {
    schemaVersion: CHART_DOCUMENT_VERSION,
    title: 'Products',
    chart: {
      source: { cube: 'orders' },
      wells: {
        measures: ['orders.revenue', 'orders.margin', 'orders.count', 'orders.units'],
        dimensions: ['products.name'],
        timeDimensions: [],
      },
    },
  };

  it('reads an Auto chart saved without a rules version as saved before R81', () => {
    const document = read(auto);
    expect(recommenderRulesOf(document.chart)).toBe(RULES_BEFORE_R81);
    expect(toChartSpec(document).rules).toBe(RULES_BEFORE_R81);
    expect(RECOMMENDER_RULES).toBeGreaterThan(RULES_BEFORE_R81);
  });

  it('keeps the rules a chart was saved under, and asks none of a chart of a chosen type', () => {
    const saved = read({ ...auto, chart: { ...auto.chart, rules: RECOMMENDER_RULES } });
    expect(saved.chart.rules).toBe(RECOMMENDER_RULES);
    expect(recommenderRulesOf(saved.chart)).toBe(RECOMMENDER_RULES);
    // The current rules are the spec's without saying so.
    expect(toChartSpec(saved).rules).toBeUndefined();
    const chosen = read({ ...auto, chart: { ...auto.chart, chartType: 'bar' } });
    expect(toChartSpec(chosen).rules).toBeUndefined();
  });

  it('writes a new chart in Auto under the current rules', () => {
    const made = chartDocumentOf({ title: 'New', spec: emptySpec('orders') });
    expect(made.chart.rules).toBe(RECOMMENDER_RULES);
    const kept = chartDocumentOf({
      title: 'Kept',
      spec: { ...emptySpec('orders'), rules: RULES_BEFORE_R81 },
    });
    expect(kept.chart.rules).toBe(RULES_BEFORE_R81);
    const chosen = chartDocumentOf({
      title: 'Bar',
      spec: { ...emptySpec('orders'), chartType: 'bar' },
    });
    expect(chosen.chart.rules).toBeUndefined();
  });
});
