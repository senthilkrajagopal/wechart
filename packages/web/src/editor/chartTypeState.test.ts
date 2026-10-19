import { readChartDocument, toChartSpec, type ChartSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { recommendedTypeOf } from '../query/signature';
import {
  FOLLOWING_RECOMMENDATION,
  afterFieldChange,
  backToRecommended,
  chooseType,
  effectiveType,
  isManual,
  rulesAfterEdit,
} from './chartTypeState';

/**
 * T970 / AC-562: WHEN a chart saved in Auto before R81's recommender rules
 * opens, THE SYSTEM SHALL draw the type it drew when saved, and apply R81's
 * rules only from the next change to its fields, so that no tile on a
 * published dashboard changes type without an edit.
 * `Fails when: a dashboard tile saved in Auto … drawn as a bar before R81,
 * draws as anything but that bar before its fields change; or, after a field
 * change that keeps [its signature], it isn't recommended [R81's pick].`
 * With the bubble parked, R81's pick for such a chart is parallel
 * coordinates: four measures by 14 Products.
 */
describe('a chart saved in Auto before R81 (T970, AC-562)', () => {
  const MEASURES = ['orders.revenue', 'orders.margin', 'orders.count', 'orders.units'];
  const stored = (more: Record<string, unknown> = {}) =>
    readChartDocument({
      schemaVersion: 2,
      title: 'Products',
      chart: {
        source: { cube: 'orders' },
        wells: { measures: MEASURES, dimensions: ['products.name'], timeDimensions: [] },
        ...more,
      },
    });
  const rows = Array.from({ length: 14 }, (_, at) => ({
    'products.name': `Product ${String(at + 1)}`,
    ...Object.fromEntries(MEASURES.map((measure) => [measure, at + 1])),
  }));
  const pick = (spec: ChartSpec) => recommendedTypeOf(spec, rows);

  it('draws the bar it drew when saved, on opening', () => {
    expect(pick(toChartSpec(stored()))).toBe('bar');
  });

  it('is recommended parallel coordinates after a filter field is added and removed', () => {
    const opened = toChartSpec(stored());
    const filtered = rulesAfterEdit(opened, {
      ...opened,
      filters: [{ member: 'orders.status', operator: 'equals', values: [] }],
    });
    const unfiltered = rulesAfterEdit(filtered, { ...filtered, filters: [] });
    expect(pick(unfiltered)).toBe('parallel');
  });

  it('keeps its rules through an edit that changes no field', () => {
    const opened = toChartSpec(stored());
    const retitled = rulesAfterEdit(opened, { ...opened });
    expect(pick(retitled)).toBe('bar');
  });

  it('follows R81’s rules at once where it was saved under them', () => {
    expect(pick(toChartSpec(stored({ rules: 81 })))).toBe('parallel');
  });
});

/**
 * AC-032: WHEN the user picks a chart type manually, THE SYSTEM SHALL keep that
 * type through later field changes until the user chooses "Back to
 * recommended".
 * Fails when: the type reverts to the recommendation after a field change.
 *
 * The failing condition is about what happens *after* a field change, so that
 * is what most of these exercise — including several changes in a row, since
 * an implementation that survives one might not survive the next.
 */
describe('following the recommendation', () => {
  it('starts out following it', () => {
    expect(isManual(FOLLOWING_RECOMMENDATION)).toBe(false);
    expect(effectiveType(FOLLOWING_RECOMMENDATION, 'bar')).toBe('bar');
  });

  it('follows a changed recommendation while no choice has been made', () => {
    const state = afterFieldChange(FOLLOWING_RECOMMENDATION);
    expect(effectiveType(state, 'line')).toBe('line');
  });

  it('has no type when nothing is recommended yet', () => {
    expect(effectiveType(FOLLOWING_RECOMMENDATION, null)).toBeNull();
  });
});

describe('a manual choice (AC-032)', () => {
  it('takes effect immediately', () => {
    const state = chooseType('pie');
    expect(effectiveType(state, 'bar')).toBe('pie');
    expect(isManual(state)).toBe(true);
  });

  it('survives a field change', () => {
    const state = afterFieldChange(chooseType('pie'));
    // The recommendation has moved on; the chart has not.
    expect(effectiveType(state, 'line')).toBe('pie');
  });

  it('survives several field changes in a row', () => {
    let state = chooseType('treemap');
    for (const recommended of ['bar', 'line', 'scatter', 'kpi'] as const) {
      state = afterFieldChange(state);
      expect(effectiveType(state, recommended)).toBe('treemap');
    }
  });

  it('is replaced by another manual choice', () => {
    const state = chooseType('scatter');
    expect(effectiveType(chooseType('heatmap'), 'bar')).toBe('heatmap');
    expect(effectiveType(state, 'bar')).toBe('scatter');
  });

  it('ends only when the user asks for the recommendation back', () => {
    const state = backToRecommended();

    expect(isManual(state)).toBe(false);
    expect(effectiveType(state, 'line')).toBe('line');
  });

  it('follows the recommendation again once it has been given back', () => {
    let state = backToRecommended();
    state = afterFieldChange(state);

    expect(effectiveType(state, 'scatter')).toBe('scatter');
  });
});
