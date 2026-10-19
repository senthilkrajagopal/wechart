import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DashboardParameter } from '@wechart/core';

import { ParameterControl } from './ParameterControl';

/**
 * T899 / AC-534: … a Parameter control in a Text tile, a radio group of
 * segments for up to 5 choices and a listbox for more …
 * `Fails when: … a control of 5 choices or fewer isn't a radio group, or one
 * of 6 or more isn't a listbox …`
 */
const ALL = [
  { member: 'orders.revenue', label: 'Revenue' },
  { member: 'orders.count', label: 'Orders' },
  { member: 'orders.margin', label: 'Margin %' },
  { member: 'orders.units', label: 'Units' },
  { member: 'orders.returns', label: 'Returns' },
  { member: 'orders.discount', label: 'Discount' },
];
const choices = (n: number) => ALL.slice(0, n);
const parameter = (n: number): DashboardParameter => ({
  id: 'p-metric',
  name: 'Metric to show',
  kind: 'fieldSwitch',
  role: 'measure',
  choices: choices(n),
  default: 'orders.revenue',
});

describe('a Parameter control (T899, AC-534)', () => {
  it('is a radio group of segments for 3 choices, its value checked, a choice applied', async () => {
    const onChoose = vi.fn();
    render(
      <ParameterControl parameter={parameter(3)} value="orders.revenue" onChoose={onChoose} />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Metric to show' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((radio) => radio.textContent)).toEqual(['Revenue', 'Orders', 'Margin %']);
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    await userEvent.click(within(group).getByRole('radio', { name: 'Orders' }));
    expect(onChoose).toHaveBeenCalledWith('orders.count');
  });

  it('moves and chooses with the arrows, one tab stop', async () => {
    const onChoose = vi.fn();
    render(
      <ParameterControl parameter={parameter(3)} value="orders.revenue" onChoose={onChoose} />,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.tabIndex)).toEqual([0, -1, -1]);
    radios[0]?.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChoose).toHaveBeenLastCalledWith('orders.count');
    expect(document.activeElement?.textContent).toBe('Orders');
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    // From the first, round to the last.
    expect(onChoose).toHaveBeenLastCalledWith('orders.margin');
    expect(document.activeElement?.textContent).toBe('Margin %');
  });

  it('is a listbox for 6 choices', async () => {
    const onChoose = vi.fn();
    render(
      <ParameterControl parameter={parameter(6)} value="orders.revenue" onChoose={onChoose} />,
    );
    expect(screen.queryByRole('radiogroup')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Metric to show: Revenue' }));
    const list = screen.getByRole('listbox', { name: 'Metric to show' });
    expect(within(list).getAllByRole('option')).toHaveLength(6);
    await userEvent.click(within(list).getByRole('option', { name: 'Discount' }));
    expect(onChoose).toHaveBeenCalledWith('orders.discount');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
