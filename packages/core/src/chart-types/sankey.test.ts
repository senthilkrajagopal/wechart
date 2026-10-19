import { describe, expect, it } from 'vitest';

import { toCubeQuery } from '../chart-spec';
import { CHART_TYPE_MODULES } from './index';
import {
  MAX_SANKEY_STEPS,
  ONE_STEP,
  SANKEY_COLOUR_BY,
  sankeyLinksOf,
  sankeyModule,
  sankeyOf,
} from './sankey';

/**
 * T986 / AC-610, AC-037: WHEN a Sankey is edited, THE SYSTEM SHALL take
 * Steps, 2–4 dimensions in order, one summed measure, and Customize › Colour
 * links by, Source or Target; query every step's dimension in one grouped
 * Cube request, drawing a link for each pair of adjacent steps; and with one
 * step SHALL say "A Sankey shows flows between steps. Add a second dimension
 * to Steps." with + Step.
 * `Fails when: a fifth step or an unsummed measure is accepted; more than one
 * Cube request is made; a link joins steps that aren't adjacent; or one step
 * draws without the sentence.`
 */
const STEPS = ['orders.channel', 'orders.region', 'products.category'];
const chart = (
  dimensions: readonly string[] = STEPS,
  measures: readonly string[] = ['orders.revenue'],
  options?: Record<string, unknown>,
) => ({ wells: { measures, dimensions }, ...(options === undefined ? {} : { options }) });
const SUM = { 'orders.revenue': 'sum', 'orders.count': 'count', 'orders.average': 'avg' };

describe('the Sankey’s spec (AC-610, AC-037)', () => {
  it('is registered as the sankey module, Colour links by Source by default, stored sparse', () => {
    expect(CHART_TYPE_MODULES.sankey).toBe(sankeyModule);
    expect(SANKEY_COLOUR_BY).toEqual(['source', 'target']);
    expect(sankeyModule.parse(undefined)).toEqual({ colourLinksBy: 'source' });
    expect(sankeyModule.parse({ colourLinksBy: 'target' })).toEqual({ colourLinksBy: 'target' });
    expect(sankeyModule.parse({ colourLinksBy: 'sideways' })).toEqual({ colourLinksBy: 'source' });
    expect(sankeyModule.save({ colourLinksBy: 'source' })).toBeUndefined();
    expect(sankeyModule.save({ colourLinksBy: 'target' })).toEqual({ colourLinksBy: 'target' });
  });

  it('reads Channel → Region → Category with Revenue as three steps in order and one summed measure', () => {
    expect(sankeyOf(chart(), SUM)).toEqual({
      steps: STEPS,
      measure: 'orders.revenue',
      colourLinksBy: 'source',
    });
    expect(
      sankeyOf(chart(STEPS, ['orders.revenue'], { sankey: { colourLinksBy: 'target' } }), SUM)
        .colourLinksBy,
    ).toBe('target');
    // A count sums too.
    expect(sankeyOf(chart(STEPS, ['orders.count']), SUM).refusal).toBeUndefined();
  });

  it('asks Cube once, grouped by every step’s dimension', () => {
    const query = toCubeQuery({
      cube: 'orders',
      chartType: 'sankey',
      measures: ['orders.revenue'],
      dimensions: STEPS,
      timeDimensions: [],
    });
    expect(query).toEqual({
      measures: ['orders.revenue'],
      dimensions: [...STEPS].sort(),
    });
  });

  it('refuses a fifth step, naming the limit', () => {
    expect(MAX_SANKEY_STEPS).toBe(4);
    const five = sankeyOf(chart([...STEPS, 'customers.country', 'customers.segment']), SUM);
    expect(five.refusal).toBe(
      'A Sankey takes at most 4 steps; there are 5. Remove a dimension from Steps.',
    );
    expect(sankeyOf(chart([...STEPS, 'customers.country']), SUM).refusal).toBeUndefined();
  });

  it('refuses a measure that isn’t summed, and a second measure', () => {
    expect(
      sankeyOf(chart(STEPS, ['orders.average']), SUM, { 'orders.average': 'Average order' })
        .refusal,
    ).toBe(
      'A Sankey’s flows add up, so its measure must be a sum or a count; Average order is an average.',
    );
    expect(sankeyOf(chart(STEPS, ['orders.revenue', 'orders.count']), SUM).refusal).toBe(
      'A Sankey draws one measure; there are 2. Remove one from Metrics.',
    );
  });

  it('with one step, says what it needs', () => {
    expect(ONE_STEP).toBe('A Sankey shows flows between steps. Add a second dimension to Steps.');
    expect(sankeyOf(chart(['orders.channel']), SUM).refusal).toBe(ONE_STEP);
  });
});

describe('the Sankey’s links (AC-610)', () => {
  const rows = [
    {
      'orders.channel': 'Web',
      'orders.region': 'EMEA',
      'products.category': 'Tea',
      'orders.revenue': '100',
    },
    {
      'orders.channel': 'Web',
      'orders.region': 'EMEA',
      'products.category': 'Coffee',
      'orders.revenue': '50',
    },
    {
      'orders.channel': 'Web',
      'orders.region': 'APAC',
      'products.category': 'Tea',
      'orders.revenue': '30',
    },
    {
      'orders.channel': 'Retail',
      'orders.region': 'EMEA',
      'products.category': 'Tea',
      'orders.revenue': '20',
    },
  ];

  it('links only adjacent steps, each link the sum of its rows', () => {
    const links = sankeyLinksOf(rows, STEPS, 'orders.revenue');
    expect(links).toEqual([
      { from: 0, source: 'Web', target: 'EMEA', value: 150 },
      { from: 0, source: 'Web', target: 'APAC', value: 30 },
      { from: 0, source: 'Retail', target: 'EMEA', value: 20 },
      { from: 1, source: 'EMEA', target: 'Tea', value: 120 },
      { from: 1, source: 'EMEA', target: 'Coffee', value: 50 },
      { from: 1, source: 'APAC', target: 'Tea', value: 30 },
    ]);
    // Never Channel straight to Category.
    expect(links.some((link) => link.source === 'Web' && link.target === 'Tea')).toBe(false);
  });

  it('links nothing with one step', () => {
    expect(sankeyLinksOf(rows, ['orders.channel'], 'orders.revenue')).toEqual([]);
  });
});
