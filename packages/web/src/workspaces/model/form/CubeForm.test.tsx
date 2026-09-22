import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CubeForm } from './CubeForm';
import { MEASURE_TYPES, SCHEMA } from './schema';

/**
 * T138 / AC-132: THE SYSTEM SHALL offer a form for every key Cube's validator
 * accepts on a cube or a view, with enumerations offering exactly the
 * validator's allowed values.
 *
 * `schema.test.ts` holds the schema to the research; this holds the rendered
 * form to the schema — every key has a labelled control, on its tab.
 */
const ORDERS = {
  name: 'orders',
  sql_table: 'public.orders',
  joins: [
    { name: 'customers', relationship: 'many_to_one', sql: '{CUBE}.customer_id = {customers}.id' },
  ],
  measures: [{ name: 'count', type: 'count' }],
  dimensions: [{ name: 'status', sql: 'status', type: 'string' }],
};

const optionsOf = (select: HTMLElement) =>
  [...select.querySelectorAll('option')].map((option) => option.value).filter((v) => v !== '');

describe('a cube’s form', () => {
  it('has a labelled control for every key on a cube, lists on their own tabs', async () => {
    render(<CubeForm kind="cube" value={ORDERS} onChange={vi.fn()} />);
    const form = screen.getByRole('region', { name: 'Cube orders' });

    // General: every key that is not a list of members, the legacy ones in their group.
    const tabs = within(form)
      .getAllByRole('tab')
      .map((tab) => tab.textContent?.replace(/\s*\d+$/, ''));
    expect(tabs).toEqual([
      'General',
      'Dimensions',
      'Measures',
      'Joins',
      'Segments',
      'Hierarchies',
      'Pre-aggregations',
      'Access policy',
    ]);
    const lists = [
      'dimensions',
      'measures',
      'joins',
      'segments',
      'hierarchies',
      'pre_aggregations',
      'access_policy',
    ];
    // Each key's own row: a nested object (refresh_key) has its own `sql`.
    const general = within(form).getByRole('tabpanel');
    for (const field of SCHEMA['Y.3'].fields.filter((each) => !lists.includes(each.key))) {
      const row = general.querySelector(
        `:scope > .model-form__fields > [data-key="${field.key}"], :scope > .model-form__fields > details > [data-key="${field.key}"]`,
      );
      const found =
        field.kind === 'object'
          ? within(form).getByRole('group', { name: field.label })
          : within(row as HTMLElement).getByLabelText(field.label, { exact: true });
      expect(found).toBeTruthy();
    }
  });

  it('opens a member into every field it has, its type offering exactly the validator’s', async () => {
    render(<CubeForm kind="cube" value={ORDERS} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('tab', { name: /^Measures/ }));

    const members = screen.getByRole('list', { name: 'Measures' });
    await userEvent.click(within(members).getByText('count', { selector: '.model-member__name' }));
    const measure = within(members).getByRole('listitem');
    // Each key's own row: nested objects (rolling_window, filter) have their own `type`.
    const own = (key: string) =>
      measure.querySelector(
        `.model-member > .model-form__fields > [data-key="${key}"], .model-member > .model-form__fields > details > [data-key="${key}"]`,
      ) as HTMLElement;
    for (const field of SCHEMA['Y.7'].fields.filter(
      (each) => each.kind !== 'object' && each.kind !== 'list',
    )) {
      expect(within(own(field.key)).getByLabelText(field.label, { exact: true })).toBeTruthy();
    }
    expect(optionsOf(within(own('type')).getByLabelText('Type', { exact: true }))).toEqual([
      ...MEASURE_TYPES,
    ]);
  });

  it('offers a join the relationships the docs use, and says which one it has', async () => {
    render(<CubeForm kind="cube" value={ORDERS} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('tab', { name: /^Joins/ }));
    await userEvent.click(screen.getByText('customers'));

    const relationship = screen.getByLabelText('Relationship', {
      exact: true,
    }) as HTMLSelectElement;
    expect(optionsOf(relationship)).toEqual(['many_to_one', 'one_to_many', 'one_to_one']);
    expect(relationship.value).toBe('many_to_one');
  });

  it('hands back the cube with the one key changed', async () => {
    const onChange = vi.fn();
    render(<CubeForm kind="cube" value={ORDERS} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Title', { exact: true }), 'O');

    expect(onChange).toHaveBeenLastCalledWith({ ...ORDERS, title: 'O' });
  });
});

describe('a view’s form', () => {
  it('has a labelled control for every key on a view', () => {
    render(<CubeForm kind="view" value={{ name: 'summary' }} onChange={vi.fn()} />);
    const form = screen.getByRole('region', { name: 'View summary' });
    const lists = [
      'cubes',
      'dimensions',
      'measures',
      'folders',
      'default_filters',
      'access_policy',
    ];
    for (const field of SCHEMA['Y.10'].fields.filter((each) => !lists.includes(each.key))) {
      const found =
        field.kind === 'object' || field.kind === 'list'
          ? within(form).getByRole('group', { name: field.label })
          : within(form).getByLabelText(field.label, { exact: true });
      expect(found).toBeTruthy();
    }
  });
});
