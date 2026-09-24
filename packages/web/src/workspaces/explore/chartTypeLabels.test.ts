import { CHART_TYPES } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { CHART_TYPE_LABEL, chartTypeText } from './chartTypeLabels';

/**
 * AC-193: a listed chart's Type column says its chart type.
 * `Fails when: … a chart's type reads only "Chart" …`
 */
describe("a listed chart's type (AC-193)", () => {
  it('names every chart type, and no two alike', () => {
    const labels = CHART_TYPES.map((type) => CHART_TYPE_LABEL[type]);
    expect(labels.every((label) => label !== '' && label !== 'Chart')).toBe(true);
    expect(new Set(labels).size).toBe(CHART_TYPES.length);
  });

  it('says a saved type by name, the recommender’s as Automatic, and none as Incomplete', () => {
    expect(chartTypeText({ chartType: 'hbar', hasFields: true })).toBe('Bar, horizontal');
    expect(chartTypeText({ chartType: null, hasFields: true })).toBe('Automatic');
    expect(chartTypeText({ chartType: null, hasFields: false })).toBe('Incomplete');
  });

  it('shows a type this build does not know as stored, rather than hiding it', () => {
    expect(chartTypeText({ chartType: 'sankey', hasFields: true })).toBe('sankey');
  });
});
