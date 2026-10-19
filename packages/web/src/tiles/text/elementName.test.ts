import { describe, expect, it } from 'vitest';

import { elementName, elementParts, namesFrom } from './elementName';

/**
 * T882 / AC-519: each element is named by its kind and its source ("Change,
 * Revenue against previous quarter"), in the text and in the Elements list.
 * `Fails when: … its accessible name lacks its kind or source …`
 */
const names = namesFrom({
  cubes: [
    {
      name: 'orders',
      title: 'Orders',
      measures: [
        { name: 'orders.revenue', title: 'Revenue' },
        { name: 'orders.margin', title: 'Margin %' },
      ],
    },
  ],
  markings: [{ name: 'Picks' }],
  filters: [{ id: 'f-country', name: 'Country' }],
});

describe('an element’s name (T882, AC-519)', () => {
  it('names a Change by its measure and the period it compares against', () => {
    expect(
      elementName(
        { type: 'change', attrs: { measure: 'orders.revenue', period: 'quarter' } },
        names,
      ),
    ).toBe('Change, Revenue against previous quarter');
    expect(elementName({ type: 'change', attrs: { measure: 'orders.revenue' } }, names)).toBe(
      'Change, Revenue against previous period',
    );
  });

  it('names every other kind by its source, the measure’s title where it has one', () => {
    expect(elementName({ type: 'value', attrs: { measure: 'orders.margin' } }, names)).toBe(
      'Value, Margin %',
    );
    // A member the model doesn't hold is named as it's written.
    expect(elementName({ type: 'sparkline', attrs: { measure: 'returns.count' } }, names)).toBe(
      'Sparkline, returns.count',
    );
    expect(elementName({ type: 'bulletGraph', attrs: { measure: 'orders.margin' } }, names)).toBe(
      'Bullet graph, Margin %',
    );
    expect(elementName({ type: 'marking', attrs: { marking: 'Picks' } }, names)).toBe(
      'Marking, Picks',
    );
    expect(elementName({ type: 'filterValue', attrs: { filter: 'f-country' } }, names)).toBe(
      'Filter value, Country',
    );
    expect(elementName({ type: 'filterControl', attrs: { filter: 'f-gone' } }, names)).toBe(
      'Filter control, a filter no longer on this dashboard',
    );
    expect(elementName({ type: 'actionButton', attrs: { label: 'Go to Detail' } }, names)).toBe(
      'Action button, Go to Detail',
    );
  });

  it('gives its kind and its source apart, for the Elements list', () => {
    expect(
      elementParts(
        { type: 'icon', attrs: { measure: 'orders.revenue', of: 'orders.margin' } },
        names,
      ),
    ).toEqual({ kind: 'Icon', source: 'Revenue as % of Margin %' });
  });
});
