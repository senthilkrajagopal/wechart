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

  it('says what a chart following the recommendation was drawn as, as its page does (T243)', () => {
    expect(chartTypeText({ chartType: null, drawnAs: 'kpi', hasFields: true })).toBe('KPI · auto');
    // A saved type is the name, whatever was drawn.
    expect(chartTypeText({ chartType: 'hbar', drawnAs: 'kpi', hasFields: true })).toBe(
      'Bar, horizontal',
    );
  });

  it('shows a type this build does not know as stored, rather than hiding it', () => {
    // A Sankey is a type from R81 (T934); a gauge never is ("No gauge").
    expect(chartTypeText({ chartType: 'gauge', hasFields: true })).toBe('gauge');
  });
});
