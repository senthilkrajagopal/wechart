import { describe, expect, it } from 'vitest';

import { CHART_TYPE_MODULES } from './index';
import {
  parallelModule,
  parallelOf,
  sharedScaleRefusal,
  tooFewMeasures,
  PARALLEL_SCALES,
} from './parallel';

/**
 * T981 / AC-597, AC-037: WHEN parallel coordinates are edited, THE SYSTEM
 * SHALL take Line by (one dimension), Metrics (3 or more, one axis each, in
 * order), Colour (an optional dimension) and Scale, "Each axis, min to max" by
 * default or "Shared", Shared enabled only while every measure has one format
 * and otherwise disabled with the reason; and with fewer than 3 measures SHALL
 * say "Parallel coordinates need at least 3 measures; there are ‹n›. Add a
 * measure, or use Scatter." …
 * `Fails when: a well or option is missing; Shared can be chosen for measures
 * of different formats; or fewer than 3 measures draw lines.`
 */
const MEASURES = [
  'products.revenue',
  'products.margin',
  'products.discount',
  'products.units',
  'products.return_rate',
];

describe('parallel coordinates’ spec (AC-597, AC-037)', () => {
  it('is registered as the parallel module', () => {
    expect(CHART_TYPE_MODULES.parallel).toBe(parallelModule);
    expect(parallelModule.type).toBe('parallel');
  });

  it('reads Product and 5 measures as one line per Product across 5 axes, in order', () => {
    const chart = {
      wells: { measures: MEASURES, dimensions: ['products.name'] },
    };
    expect(parallelOf(chart)).toEqual({
      lineBy: 'products.name',
      axes: MEASURES,
      scale: 'each',
    });
  });

  it('takes a second dimension as its Colour, and Scale as stored', () => {
    const chart = {
      wells: { measures: MEASURES, dimensions: ['products.name', 'orders.channel'] },
      options: { parallel: { scale: 'shared' } },
    };
    expect(parallelOf(chart)).toEqual({
      lineBy: 'products.name',
      colour: 'orders.channel',
      axes: MEASURES,
      scale: 'shared',
    });
  });

  it('offers Scale as Each axis, then Shared; anything else stored reads as Each axis', () => {
    expect(PARALLEL_SCALES).toEqual(['each', 'shared']);
    expect(parallelModule.parse(undefined)).toEqual({ scale: 'each' });
    expect(parallelModule.parse({ scale: 'log' })).toEqual({ scale: 'each' });
    expect(parallelModule.save({ scale: 'each' })).toBeUndefined();
    expect(parallelModule.save({ scale: 'shared' })).toEqual({ scale: 'shared' });
  });

  it('says what fewer than 3 measures need, and nothing from 3', () => {
    expect(tooFewMeasures(2)).toBe(
      'Parallel coordinates need at least 3 measures; there are 2. Add a measure, or use Scatter.',
    );
    expect(tooFewMeasures(0)).toBe(
      'Parallel coordinates need at least 3 measures; there are 0. Add a measure, or use Scatter.',
    );
    expect(tooFewMeasures(3)).toBeUndefined();
  });

  it('refuses Shared for measures in more than one format, naming them', () => {
    expect(sharedScaleRefusal(['currency', 'percent', 'currency'])).toBe(
      'Shared needs every measure in one format; these are in currency and percent.',
    );
    expect(sharedScaleRefusal(['percent', undefined])).toBe(
      'Shared needs every measure in one format; these are in percent and plain numbers.',
    );
    // A model's format by its description reads by its name (T195).
    expect(sharedScaleRefusal([{ name: 'currency_0' }, { name: 'currency_0' }])).toBeUndefined();
    expect(sharedScaleRefusal(['percent', 'percent', 'percent'])).toBeUndefined();
    expect(sharedScaleRefusal([undefined, undefined, undefined])).toBeUndefined();
  });

  it('draws a stored Shared as Each axis while the formats differ', () => {
    const chart = {
      wells: { measures: MEASURES.slice(0, 3), dimensions: ['products.name'] },
      options: { parallel: { scale: 'shared' } },
    };
    expect(parallelOf(chart, ['currency', 'percent', 'number']).scale).toBe('each');
    expect(parallelOf(chart, ['percent', 'percent', 'percent']).scale).toBe('shared');
  });
});
