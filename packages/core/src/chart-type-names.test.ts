import { describe, expect, it } from 'vitest';

import { CHART_TYPE_NAMES, chartTypeName } from './chart-type-names';
import { CHART_TYPES } from './render-spec';

/**
 * T230 / AC-217: THE SYSTEM SHALL show the chart's type by its name …
 * `Fails when: a type is shown by an internal id such as "groupedBar" …`
 */
describe('a chart type’s name (AC-217)', () => {
  it('names every type, and none by its id', () => {
    for (const type of CHART_TYPES) {
      expect(CHART_TYPE_NAMES[type]).not.toBe(type);
      expect(CHART_TYPE_NAMES[type]).toMatch(/^[A-Z]/);
    }
  });

  it('names each as the prototype does', () => {
    expect(chartTypeName('groupedBar')).toBe('Grouped bar');
    expect(chartTypeName('hbar')).toBe('Bar, horizontal');
    expect(chartTypeName('trellis')).toBe('Small multiples');
    expect(chartTypeName('combo')).toBe('Combo (bar + line)');
  });

  it('gives no two types one name', () => {
    expect(new Set(Object.values(CHART_TYPE_NAMES)).size).toBe(CHART_TYPES.length);
  });
});
