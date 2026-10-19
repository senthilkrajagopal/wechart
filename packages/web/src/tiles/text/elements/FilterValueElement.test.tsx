import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FilterValueText, filterValueWords } from './FilterValueElement';

/**
 * T886 / AC-522: … a Filter value show what a dashboard filter is set to,
 * and, while it's unset, that all its values are in ("all countries"),
 * never nothing.
 */
describe('a Filter value (T886, AC-522)', () => {
  it('reads what the filter is set to: "Germany, France"', () => {
    expect(filterValueWords({ kind: 'values', values: ['Germany', 'France'] }, 'Country')).toBe(
      'Germany, France',
    );
  });

  it('reads "all countries" while the filter is unset, never nothing', () => {
    expect(filterValueWords(undefined, 'Country')).toBe('all countries');
    expect(filterValueWords({ kind: 'values', values: [] }, 'Category')).toBe('all categories');
    expect(filterValueWords(undefined, 'Status')).toBe('all statuses');
    expect(filterValueWords(undefined, 'Order date')).toBe('all order dates');
  });

  it('reads a range and a date filter in words', () => {
    expect(filterValueWords({ kind: 'range', min: 10, max: 20 }, 'Amount')).toBe('10 to 20');
    expect(filterValueWords({ kind: 'range', min: 10 }, 'Amount')).toBe('at least 10');
    expect(filterValueWords({ kind: 'preset', preset: 'last 30 days' }, 'Ordered at')).toBe(
      'last 30 days',
    );
    expect(
      filterValueWords({ kind: 'dates', from: '2026-01-01', to: '2026-03-31' }, 'Ordered at'),
    ).toBe('2026-01-01 to 2026-03-31');
  });

  it('is drawn as text in the sentence', () => {
    const { container } = render(<FilterValueText words="Germany, France" />);
    expect(container.textContent).toBe('Germany, France');
  });
});
