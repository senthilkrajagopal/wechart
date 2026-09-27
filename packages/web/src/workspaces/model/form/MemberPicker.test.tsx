import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CubeForm } from './CubeForm';
import { memberIndexOf, PickerScopeContext } from './scopes';

/**
 * T235 / AC-224: THE SYSTEM SHALL edit every field that refers to model
 * members — pre-aggregation measures, dimensions, segments, rollups and time
 * dimension, drill members, hierarchy levels, a view's includes and excludes
 * — with a picker of the members it may refer to, and a join's target with a
 * list of cubes (direction.md §7b).
 * `Fails when: any of those fields accepts free text.`
 */
type Value = Record<string, unknown>;

const index = memberIndexOf([
  {
    path: 'cubes/orders.yml',
    content: `cubes:
  - name: orders
    sql_table: public.orders
    dimensions:
      - {name: status, sql: status, type: string}
      - {name: ordered_at, sql: ordered_at, type: time}
    measures:
      - {name: count, type: count}
      - {name: total, sql: amount, type: sum}
    segments:
      - {name: shipped, sql: "{CUBE}.status = 'shipped'"}
`,
  },
  {
    path: 'cubes/customers.yml',
    content: `cubes:
  - name: customers
    sql_table: public.customers
    dimensions:
      - {name: city, sql: city, type: string}
    measures:
      - {name: count, type: count}
`,
  },
]);

const ORDERS: Value = {
  name: 'orders',
  sql_table: 'public.orders',
  joins: [{ name: 'customers', relationship: 'many_to_one', sql: '{CUBE}.c = {customers}.id' }],
  hierarchies: [{ name: 'by_place', levels: ['customers.city'] }],
  pre_aggregations: [{ name: 'main', measures: ['count'], time_dimension: 'ordered_at' }],
};

/** A form over the model, holding its value as the editor does. */
function Held({
  initial,
  kind = 'cube',
  onChange,
}: {
  initial: Value;
  kind?: 'cube' | 'view';
  onChange: (next: Value) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <PickerScopeContext.Provider value={{ index, cube: undefined }}>
      <CubeForm
        kind={kind}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    </PickerScopeContext.Provider>
  );
}

const open = async (tab: RegExp, member: string) => {
  await userEvent.click(screen.getByRole('tab', { name: tab }));
  await userEvent.click(screen.getByText(member, { selector: '.model-member__name' }));
};

const pressed = (group: HTMLElement) =>
  within(group)
    .getAllByRole('button', { pressed: true })
    .map((button) => button.textContent);

describe('member pickers (AC-224)', () => {
  it('picks a rollup’s measures from the model’s, and types none', async () => {
    const onChange = vi.fn();
    render(<Held initial={ORDERS} onChange={onChange} />);
    await open(/^Pre-aggs/, 'main');

    const measures = screen.getByRole('group', { name: 'Measures' });
    expect(within(measures).queryByRole('textbox')).toBeNull();
    expect(
      within(measures)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['count', 'total', 'customers.count']);
    expect(pressed(measures)).toEqual(['count']);

    await userEvent.click(within(measures).getByRole('button', { name: 'customers.count' }));
    expect(pressed(measures)).toEqual(['count', 'customers.count']);
    await userEvent.click(within(measures).getByRole('button', { name: 'count' }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...ORDERS,
      pre_aggregations: [
        { name: 'main', measures: ['customers.count'], time_dimension: 'ordered_at' },
      ],
    });
  });

  it('picks a rollup’s time dimension from the time dimensions, its segments from the cube’s', async () => {
    render(<Held initial={ORDERS} onChange={vi.fn()} />);
    await open(/^Pre-aggs/, 'main');
    const time = screen.getByRole('combobox', { name: 'Time dimension' });
    expect(
      within(time)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['(not set)', 'ordered_at']);
    expect((time as HTMLSelectElement).value).toBe('ordered_at');
    const segments = screen.getByRole('group', { name: 'Segments' });
    expect(
      within(segments)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['shipped']);
    const rollups = screen.getByRole('group', { name: 'Rollups' });
    expect(within(rollups).queryAllByRole('button')).toHaveLength(0);
    expect(rollups.textContent).toContain('Nothing to pick');
  });

  it('keeps a name the model no longer has, picked, until it is taken away', async () => {
    const onChange = vi.fn();
    const stale = { ...ORDERS, pre_aggregations: [{ name: 'main', measures: ['gone'] }] };
    render(<Held initial={stale} onChange={onChange} />);
    await open(/^Pre-aggs/, 'main');
    const measures = screen.getByRole('group', { name: 'Measures' });
    expect(pressed(measures)).toEqual(['gone']);
    await userEvent.click(within(measures).getByRole('button', { name: 'gone' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...stale, pre_aggregations: [{ name: 'main' }] });
  });

  it('shows a member written CUBE.x as that member, picked once, and takes it away', async () => {
    const onChange = vi.fn();
    const spelled = { ...ORDERS, pre_aggregations: [{ name: 'main', measures: ['CUBE.count'] }] };
    render(<Held initial={spelled} onChange={onChange} />);
    await open(/^Pre-aggs/, 'main');
    const measures = screen.getByRole('group', { name: 'Measures' });
    expect(
      within(measures)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['CUBE.count', 'total', 'customers.count']);
    expect(pressed(measures)).toEqual(['CUBE.count']);
    await userEvent.click(within(measures).getByRole('button', { name: 'CUBE.count' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...spelled, pre_aggregations: [{ name: 'main' }] });
  });

  it('picks a join’s target from the other cubes', async () => {
    render(<Held initial={ORDERS} onChange={vi.fn()} />);
    await open(/^Joins/, 'customers');
    const target = screen.getByRole('combobox', { name: 'Target cube' });
    expect(
      within(target)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['(not set)', 'customers']);
    expect((target as HTMLSelectElement).value).toBe('customers');
  });

  it('numbers a hierarchy’s levels in the order they are picked', async () => {
    const onChange = vi.fn();
    render(<Held initial={ORDERS} onChange={onChange} />);
    await open(/^Hierarchies/, 'by_place');
    const levels = screen.getByRole('group', { name: 'Levels' });
    await userEvent.click(within(levels).getByRole('button', { name: 'status' }));
    // The picked first, numbered, in their order — the order a screen reader
    // hears them in — then the rest.
    expect(pressed(levels)).toEqual(['1customers.city', '2status']);
    expect(within(levels).getAllByRole('button')[2]?.getAttribute('aria-pressed')).toBe('false');
    expect(onChange).toHaveBeenLastCalledWith({
      ...ORDERS,
      hierarchies: [{ name: 'by_place', levels: ['customers.city', 'status'] }],
    });
  });

  it('picks a drill member from the dimensions and measures', async () => {
    const onChange = vi.fn();
    const counted = { ...ORDERS, measures: [{ name: 'count', type: 'count' }] };
    render(<Held initial={counted} onChange={onChange} />);
    await open(/^Measures/, 'count');
    const drill = screen.getByRole('group', { name: 'Drill members' });
    expect(within(drill).queryByRole('textbox')).toBeNull();
    await userEvent.click(within(drill).getByRole('button', { name: 'status' }));
    await userEvent.click(within(drill).getByRole('button', { name: 'customers.city' }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...counted,
      measures: [{ name: 'count', type: 'count', drill_members: ['status', 'customers.city'] }],
    });
  });

  it('picks a view’s includes from its path’s cube, or all of them', async () => {
    const onChange = vi.fn();
    const view = {
      name: 'summary',
      cubes: [{ join_path: 'orders.customers', includes: ['city'] }],
    };
    render(<Held initial={view} kind="view" onChange={onChange} />);
    await open(/^Cubes/, 'Cube in the view 1');
    const includes = screen.getByRole('group', { name: 'Includes' });
    expect(
      within(includes)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['All (*)', 'city', 'count']);
    await userEvent.click(within(includes).getByRole('button', { name: 'All (*)' }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...view,
      cubes: [{ join_path: 'orders.customers', includes: '*' }],
    });
    expect(pressed(includes)).toEqual(['All (*)']);
    // Then some, not all: the one picked.
    await userEvent.click(within(includes).getByRole('button', { name: 'count' }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...view,
      cubes: [{ join_path: 'orders.customers', includes: ['count'] }],
    });
    const excludes = screen.getByRole('group', { name: 'Excludes' });
    expect(
      within(excludes)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['city', 'count']);
  });
});
