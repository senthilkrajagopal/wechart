import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { CubeForm } from '../form/CubeForm';

/**
 * T152 / AC-146: WHEN the user defines an index on a rollup, THE SYSTEM SHALL
 * let the columns be ordered and mark aggregate indexes as such.
 * Fails when: the column order cannot be changed, or an aggregate index is
 * written as a regular one.
 *
 * An index's column order is its sort order in Cube Store, so it is edited as
 * rows that move — not retyped — and written in that order.
 */
type Value = Record<string, unknown>;

const CUBE: Value = {
  name: 'monthly_orders',
  sql_table: 'public.orders',
  pre_aggregations: [
    {
      name: 'by_status_month',
      measures: ['count'],
      dimensions: ['status', 'region'],
      indexes: [{ name: 'by_status', columns: ['status', 'region'] }],
    },
  ],
};

/** The form over a cube held here, so each edit is what the form wrote. */
function Held({ onValue }: { onValue: (value: Value) => void }) {
  const [value, setValue] = useState(CUBE);
  return (
    <CubeForm
      kind="cube"
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

const indexOf = (value: Value | undefined) =>
  (
    (value?.['pre_aggregations'] as Value[] | undefined)?.[0]?.['indexes'] as Value[] | undefined
  )?.[0];

async function openIndex() {
  let last: Value | undefined;
  render(<Held onValue={(value) => (last = value)} />);
  await userEvent.click(screen.getByRole('tab', { name: /^Pre-aggregations/ }));
  await userEvent.click(screen.getByText('by_status_month', { selector: '.model-member__name' }));
  await userEvent.click(screen.getByText('by_status', { selector: '.model-member__name' }));
  const columns = screen.getByRole('list', { name: 'Columns' });
  return { columns, value: () => last };
}

describe('an index on a rollup', () => {
  it('lists its columns in order, and moves one, writing the new order', async () => {
    const { columns, value } = await openIndex();
    const names = () =>
      within(columns)
        .getAllByRole('listitem')
        .map((row) => row.querySelector('.ordered-references__name')?.textContent);
    expect(names()).toEqual(['status', 'region']);

    await userEvent.click(within(columns).getByRole('button', { name: 'Move region up' }));

    expect(names()).toEqual(['region', 'status']);
    expect(indexOf(value())?.['columns']).toEqual(['region', 'status']);
    // The first can go no higher, the last no lower.
    expect(
      (within(columns).getByRole('button', { name: 'Move region up' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (within(columns).getByRole('button', { name: 'Move status down' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('adds and removes a column', async () => {
    const { columns, value } = await openIndex();

    await userEvent.type(screen.getByLabelText('Add a column'), 'count');
    await userEvent.click(screen.getByRole('button', { name: 'Add column' }));
    expect(indexOf(value())?.['columns']).toEqual(['status', 'region', 'count']);

    await userEvent.click(within(columns).getByRole('button', { name: 'Remove status' }));
    expect(indexOf(value())?.['columns']).toEqual(['region', 'count']);
  });

  it('keeps focus on the column moved, so a keyboard can move it again, and says where it went', async () => {
    const { columns, value } = await openIndex();
    await userEvent.type(screen.getByLabelText('Add a column'), 'count');
    await userEvent.click(screen.getByRole('button', { name: 'Add column' }));

    within(columns).getByRole('button', { name: 'Move count up' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Move count up');
    await userEvent.keyboard('{Enter}');

    expect(indexOf(value())?.['columns']).toEqual(['count', 'status', 'region']);
    // At the top it can go no higher: focus moves to the way it can still go.
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Move count down');
    expect(screen.getByRole('status').textContent).toBe('count moved to position 1 of 3.');
  });

  it('adds a column only once', async () => {
    await openIndex();
    await userEvent.type(screen.getByLabelText('Add a column'), 'status');

    expect((screen.getByRole('button', { name: 'Add column' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('writes an aggregate index as `type: aggregate`', async () => {
    const { value } = await openIndex();

    const index = screen
      .getByRole('list', { name: 'Columns' })
      .closest('.model-member') as HTMLElement;
    await userEvent.selectOptions(within(index).getByLabelText('Type'), 'aggregate');

    expect(indexOf(value())).toEqual({
      name: 'by_status',
      columns: ['status', 'region'],
      type: 'aggregate',
    });
  });
});
