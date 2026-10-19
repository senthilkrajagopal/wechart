import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { TextNode } from '@wechart/core';

import { namesFrom } from './elementName';
import { ElementsList } from './ElementsList';

/**
 * T882 / AC-519: … WHEN one is selected, by a click or an arrow key, open
 * its settings in Properties under an Elements list of every element in text
 * order with its kind, its source and "‹n› of 10", each row selecting its
 * element.
 * `Fails when: … selecting an element doesn't open its settings; or the
 * Elements list's order or count differs from the text's.`
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
  markings: [],
  filters: [{ id: 'f-country', name: 'Country' }],
});

const ELEMENTS: TextNode[] = [
  { type: 'value', attrs: { measure: 'orders.revenue' } },
  { type: 'change', attrs: { measure: 'orders.revenue', period: 'quarter' } },
  { type: 'filterControl', attrs: { filter: 'f-country' } },
];

describe('the Elements list (T882, AC-519)', () => {
  it('lists every element in text order, with its kind and source, and "3 of 10"', () => {
    render(<ElementsList elements={ELEMENTS} selected={null} names={names} onSelect={vi.fn()} />);
    const list = screen.getByRole('list', { name: 'Elements' });
    expect(screen.getByText('3 of 10')).toBeTruthy();
    expect(
      within(list)
        .getAllByRole('button')
        .map((row) => row.textContent),
    ).toEqual(['ValueRevenue', 'ChangeRevenue against previous quarter', 'Filter controlCountry']);
  });

  it('selects an element by its row, and shows the chosen one’s settings below', async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <ElementsList elements={ELEMENTS} selected={null} names={names} onSelect={onSelect} />,
    );
    expect(screen.queryByRole('region', { name: /settings/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Change/ }));
    expect(onSelect).toHaveBeenCalledWith(1);

    rerender(<ElementsList elements={ELEMENTS} selected={1} names={names} onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /Change/ }).getAttribute('aria-current')).toBe(
      'true',
    );
    const settings = screen.getByRole('region', {
      name: 'Change, Revenue against previous quarter: settings',
    });
    expect(within(settings).getByText('Orders › Revenue')).toBeTruthy();
  });
});
