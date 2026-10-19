/**
 * T862 (AC-507; design 20 state F): the reference form. Horizontal reads one
 * value axis, at a fixed value or a drawn series' average, median, minimum
 * or maximum; vertical reads the category axis, a month on a month axis; a
 * band's From must be below its To; and a label is required.
 */
import type { ComboReference } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ReferenceForm, type ReferenceFormProps } from './ReferenceForm';

const REVENUE = 'orders.revenue';
const MARGIN = 'orders.margin_pct';
const axes: ReferenceFormProps['axes'] = [
  { axis: 'left', measures: [{ measure: REVENUE, title: 'Revenue' }] },
  { axis: 'right', measures: [{ measure: MARGIN, title: 'Margin %' }] },
];

const form = (props: Partial<ReferenceFormProps> = {}) => {
  const onSubmit = vi.fn<(reference: ComboReference) => void>();
  render(
    <ReferenceForm
      kind="line"
      axes={axes}
      category={{ kind: 'time', granularity: 'month' }}
      newId={() => 'new-1'}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      {...props}
    />,
  );
  return onSubmit;
};
const options = (name: string) =>
  [...(screen.getByRole('combobox', { name }) as HTMLSelectElement).options].map(
    (option) => option.textContent,
  );

describe('the reference form (T862)', () => {
  it('offers Fixed, or the average, median, minimum or maximum of a drawn series on the right axis', async () => {
    const onSubmit = form();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Axis' }), 'right');
    expect(options('Axis')).toEqual(['Left · Revenue', 'Right · Margin %']);
    expect(options('Value')).toEqual([
      'Fixed',
      'Average of a series',
      'Median of a series',
      'Minimum of a series',
      'Maximum of a series',
    ]);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Value' }), 'average');
    expect(options('Series')).toEqual(['Margin %']);
    await userEvent.type(screen.getByRole('textbox', { name: 'Label' }), 'Average Margin %');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Show value' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add line' }));

    expect(onSubmit).toHaveBeenCalledWith({
      id: 'new-1',
      kind: 'line',
      direction: 'horizontal',
      axis: 'right',
      stat: 'average',
      series: MARGIN,
      label: 'Average Margin %',
      showValue: true,
      labelAt: 'end',
    });
  });

  it('takes a fixed value on the left axis', async () => {
    const onSubmit = form();

    await userEvent.type(screen.getByRole('spinbutton', { name: 'Value' }), '100000');
    await userEvent.type(screen.getByRole('textbox', { name: 'Label' }), 'Monthly plan');
    await userEvent.click(screen.getByRole('radio', { name: 'Start' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add line' }));

    expect(onSubmit).toHaveBeenCalledWith({
      id: 'new-1',
      kind: 'line',
      direction: 'horizontal',
      axis: 'left',
      value: 100000,
      label: 'Monthly plan',
      labelAt: 'start',
    });
  });

  it('takes a month for a vertical line on a month axis', async () => {
    const onSubmit = form();

    await userEvent.click(screen.getByRole('radio', { name: 'Vertical' }));
    const at = screen.getByLabelText('At') as HTMLInputElement;
    expect(at.type).toBe('month');
    expect(screen.queryByRole('combobox', { name: 'Axis' })).toBeNull();
    await userEvent.type(at, '2026-09');
    await userEvent.type(screen.getByRole('textbox', { name: 'Label' }), 'Price change');
    await userEvent.click(screen.getByRole('button', { name: 'Add line' }));

    expect(onSubmit).toHaveBeenCalledWith({
      id: 'new-1',
      kind: 'line',
      direction: 'vertical',
      value: '2026-09',
      label: 'Price change',
      labelAt: 'end',
    });
  });

  it('offers a category axis’s members for a vertical line', async () => {
    form({ category: { kind: 'members', members: ['Books', 'Games'] } });

    await userEvent.click(screen.getByRole('radio', { name: 'Vertical' }));
    expect(options('At')).toEqual(['Books', 'Games']);
  });

  it('keeps Add disabled while a band’s From isn’t below its To, saying so', async () => {
    form({ kind: 'band' });

    await userEvent.type(screen.getByRole('spinbutton', { name: 'From' }), '120000');
    await userEvent.type(screen.getByRole('spinbutton', { name: 'To' }), '90000');
    await userEvent.type(screen.getByRole('textbox', { name: 'Label' }), 'Target range');
    const add = screen.getByRole('button', { name: 'Add band' }) as HTMLButtonElement;

    expect(add.disabled).toBe(true);
    expect(screen.getByTestId('reference-form-why').textContent).toBe(
      "A band's From must be below its To",
    );
    await userEvent.clear(screen.getByRole('spinbutton', { name: 'To' }));
    await userEvent.type(screen.getByRole('spinbutton', { name: 'To' }), '150000');
    expect(add.disabled).toBe(false);
  });

  it('keeps Add disabled while the label is empty', async () => {
    form();

    await userEvent.type(screen.getByRole('spinbutton', { name: 'Value' }), '5');
    expect((screen.getByRole('button', { name: 'Add line' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByTestId('reference-form-why').textContent).toBe('A reference needs a label');
  });

  it('opens on a reference being edited, saving it under its own id', async () => {
    const onSubmit = form({
      initial: {
        id: 'r1',
        kind: 'line',
        direction: 'horizontal',
        axis: 'left',
        value: 100000,
        label: 'Monthly plan',
      },
    });

    await userEvent.clear(screen.getByRole('textbox', { name: 'Label' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Label' }), 'Plan');
    await userEvent.click(screen.getByRole('button', { name: 'Save line' }));

    expect(onSubmit).toHaveBeenCalledWith({
      id: 'r1',
      kind: 'line',
      direction: 'horizontal',
      axis: 'left',
      value: 100000,
      label: 'Plan',
      labelAt: 'end',
    });
  });
});
