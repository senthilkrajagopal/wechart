import { emptySpec } from '@wechart/core';
import { recommend } from '@wechart/recommender';
import { describe, expect, it } from 'vitest';

import { countryMarkingsOf, recommendedTypeOf, signatureOf, topTypeOf } from './signature';

/**
 * `signatureOf` is what the editor and the dashboard both recommend from
 * (T193). It was extracted from the editor unchanged; these pin its behaviour
 * directly, because two callers now depend on it and neither caller's tests
 * would say which of them a change had broken.
 */
const spec = {
  ...emptySpec('orders'),
  measures: ['orders.count'],
  dimensions: ['orders.status'],
  timeDimensions: ['orders.ordered_at'],
};

const rows = [
  { 'orders.status': 'paid', 'orders.ordered_at': '2026-01-01', 'orders.count': 3 },
  { 'orders.status': 'paid', 'orders.ordered_at': '2026-01-02', 'orders.count': 4 },
  { 'orders.status': 'shipped', 'orders.ordered_at': '2026-01-02', 'orders.count': 5 },
];

describe('the signature of a chart', () => {
  it('lists every field with its kind, measures first', () => {
    expect(signatureOf(spec, rows).fields.map(({ name, kind }) => [name, kind])).toEqual([
      ['orders.count', 'measure'],
      ['orders.status', 'dimension'],
      ['orders.ordered_at', 'timeDimension'],
    ]);
  });

  it('counts distinct values of each grouping in the rows returned', () => {
    /**
     * Cardinality from this result, not from a separate count (AC-028): two
     * statuses and two dates here, although three rows.
     */
    const { fields } = signatureOf(spec, rows);

    expect(fields.find((field) => field.name === 'orders.status')?.cardinality).toBe(2);
    expect(fields.find((field) => field.name === 'orders.ordered_at')?.cardinality).toBe(2);
  });

  it('gives a measure no cardinality', () => {
    const measure = signatureOf(spec, rows).fields.find((field) => field.name === 'orders.count');

    expect(measure).toEqual({ name: 'orders.count', kind: 'measure' });
  });

  it('leaves cardinality unknown, not zero, when there are no rows', () => {
    /**
     * Zero would say "no categories", which reads as a small, drawable chart.
     * Unknown is what an empty result actually tells you — and the recommender
     * treats it differently, which is why recommending before the query has
     * run can pick differently from recommending after.
     */
    const { fields } = signatureOf(spec, []);

    expect(fields.every((field) => !('cardinality' in field))).toBe(true);
  });

  /**
   * T510 (R67, the user): a measure's scale from its format, so the editor
   * and a dashboard's tile pick small multiples alike for measures on
   * different scales (T193). None without the model's formats.
   */
  it('gives each measure the scale its format puts it on, given the formats', () => {
    const twoScales = { ...spec, measures: ['orders.count', 'orders.amount'] };
    const formats = { 'orders.amount': { name: 'currency', specifier: '$,.2~f' } };
    const measures = signatureOf(twoScales, rows, undefined, formats).fields.filter(
      (field) => field.kind === 'measure',
    );
    expect(measures.map((field) => field.scale)).toEqual(['number', 'currency USD']);
    expect(recommendedTypeOf({ ...twoScales, timeDimensions: [] }, rows, formats)).toBe('trellis');
  });

  it('carries the row count', () => {
    expect(signatureOf(spec, rows).rowCount).toBe(3);
    expect(signatureOf(spec, []).rowCount).toBe(0);
  });

  /**
   * T398, AC-313: THE SYSTEM SHALL treat a dimension as holding ISO-3 country
   * codes when every non-empty value is an ISO 3166-1 alpha-3 code, unless
   * the model marks it otherwise.
   */
  it('marks a dimension holding country codes, by its values unless the model says', () => {
    const byCountry = {
      ...emptySpec('orders'),
      measures: ['orders.count'],
      dimensions: ['orders.iso3'],
    };
    const countries = [
      { 'orders.iso3': 'FRA', 'orders.count': 3 },
      { 'orders.iso3': 'SGP', 'orders.count': 4 },
      { 'orders.iso3': null, 'orders.count': 1 },
    ];
    const iso3 = (marking?: boolean) =>
      signatureOf(byCountry, countries, () => marking).fields.find(
        (field) => field.name === 'orders.iso3',
      )?.countryCodes;

    expect(iso3()).toBe(true);
    expect(iso3(false)).toBe(undefined);
    // Status names aren't codes, unless the model says they are.
    expect(signatureOf(spec, rows).fields.some((field) => field.countryCodes === true)).toBe(false);
    expect(
      signatureOf(spec, rows, () => true).fields.find((field) => field.name === 'orders.status')
        ?.countryCodes,
    ).toBe(true);
  });
});

describe('the model’s country-code markings', () => {
  it('reads each dimension’s `meta.wechart.countryCode`', () => {
    const marking = countryMarkingsOf({
      cubes: [
        {
          name: 'orders',
          dimensions: [
            { name: 'orders.iso3', meta: { wechart: { countryCode: true } } },
            { name: 'orders.code', meta: { wechart: { countryCode: false } } },
            { name: 'orders.status' },
          ],
        },
      ],
    });

    expect(['orders.iso3', 'orders.code', 'orders.status'].map(marking)).toEqual([
      true,
      false,
      undefined,
    ]);
    expect(countryMarkingsOf(undefined)('orders.iso3')).toBe(undefined);
  });
});

describe('the pick', () => {
  it('is the recommendation’s top candidate', () => {
    const recommendation = recommend(signatureOf(spec, rows));

    expect(topTypeOf(recommendation)).toBe(recommendation.top?.candidate.chartType);
  });

  it('is null when nothing can be recommended', () => {
    // A chart with no fields at all, the recommender's documented case.
    expect(topTypeOf(recommend(signatureOf(emptySpec('orders'), [])))).toBeNull();
  });

  it('is the same whether read from a recommendation or from the chart', () => {
    // The two routes the editor and the dashboard take must agree.
    expect(recommendedTypeOf(spec, rows)).toBe(topTypeOf(recommend(signatureOf(spec, rows))));
  });
});

/**
 * T968 / AC-560: a Target and one dimension make a Bullet chart the pick; a
 * Target and none, a KPI against it. The chart's Target is its options' —
 * a bullet chart's or a KPI's — whatever type it is drawn as, so Auto sees it.
 */
describe('a chart’s Target in its signature (T968, AC-560)', () => {
  const byStatus = {
    ...emptySpec('orders'),
    measures: ['orders.count'],
    dimensions: ['orders.status'],
  };
  const bulletTarget = { bullet: { target: { kind: 'value', value: 10 } } };
  const kpiTarget = { kpi: { target: { kind: 'measure', member: 'orders.goal' } } };

  it('says a bullet’s or a KPI’s Target is there, and nothing without one', () => {
    expect(signatureOf(byStatus, rows, undefined, undefined, bulletTarget).target).toBe(true);
    expect(signatureOf(byStatus, rows, undefined, undefined, kpiTarget).target).toBe(true);
    expect(signatureOf(byStatus, rows, undefined, undefined, {}).target).toBeUndefined();
    expect(signatureOf(byStatus, rows).target).toBeUndefined();
  });

  it('gives each measure its aggregation, where the model says it (T969)', () => {
    const { fields } = signatureOf(byStatus, rows, undefined, undefined, undefined, {
      'orders.count': 'count',
    });
    expect(fields.find((field) => field.name === 'orders.count')?.aggType).toBe('count');
    expect(signatureOf(byStatus, rows).fields[0]?.aggType).toBeUndefined();
  });

  it('picks a Bullet chart for a Target by one dimension, as the dashboard picks it', () => {
    expect(recommendedTypeOf(byStatus, rows, undefined, bulletTarget)).toBe('bullet');
    expect(recommendedTypeOf(byStatus, rows)).toBe('bar');
  });
});

/**
 * T1012 / AC-560: a geo dimension and one measure pick the Map with Points;
 * a region key (AC-623) and one measure, the Map with Regions — told by the
 * dimension's values, or the model's marking — in the editor and on a
 * dashboard alike.
 */
describe('places in the signature (AC-560)', () => {
  const byPlace = (dimension: string) => ({
    ...emptySpec('stores'),
    measures: ['orders.revenue'],
    dimensions: [dimension],
  });

  it('says a dimension of Cube’s "lat,lng" values is a place, and picks the Map', () => {
    const places = [
      { 'stores.location': '48.8566,2.3522', 'orders.revenue': 3 },
      { 'stores.location': '51.5074,-0.1278', 'orders.revenue': 4 },
    ];
    const [, location] = signatureOf(byPlace('stores.location'), places).fields;
    expect(location?.geo).toBe(true);
    expect(recommendedTypeOf(byPlace('stores.location'), places)).toBe('map');
  });

  it('says a dimension the model marks as an Admin-1 key is one, and picks the Map', () => {
    const states = [
      { 'stores.state': 'Online', 'orders.revenue': 3 },
      { 'stores.state': 'Retail', 'orders.revenue': 4 },
    ];
    const marked = signatureOf(byPlace('stores.state'), states, undefined, undefined, undefined, undefined, {
      regionMarking: (member) => (member === 'stores.state' ? 'admin1' : undefined),
    });
    expect(marked.fields[1]?.regionSet).toBe('admin1');
    expect(topTypeOf(recommend(marked))).toBe('map');
    // Unmarked, these values are no region key: no Map.
    expect(signatureOf(byPlace('stores.state'), states).fields[1]?.regionSet).toBeUndefined();
  });
});
