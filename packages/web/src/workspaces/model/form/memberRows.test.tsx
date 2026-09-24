import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MemberList } from './ObjectForm';
import { SCHEMA } from './schema';

/**
 * T236 / AC-225: THE SYSTEM SHALL show each member in a row with its name,
 * its type, a preview of its SQL and badges for primary key, public and
 * format, and when expanded, only the fields that apply to its type and to
 * how it is defined, in named groups.
 * `Fails when: a collapsed row omits its type or SQL, a primary key carries no
 * badge, or an expanded number dimension offers fields for a CASE, a switch or
 * a geographic point.`
 */
const DIMENSIONS = [
  { name: 'id', sql: 'id', type: 'number', primary_key: true, public: false },
  { name: 'amount', sql: '{CUBE}.amount', type: 'number', format: 'currency' },
  { name: 'status', sql: 'status', type: 'string' },
  { name: 'at', sql: 'ordered_at', type: 'time' },
  { name: 'place', type: 'geo', latitude: { sql: 'lat' }, longitude: { sql: 'lng' } },
];

const list = () =>
  render(<MemberList schema={SCHEMA['Y.6']} items={DIMENSIONS} onChange={vi.fn()} />);

const row = (name: string) => {
  const rows = screen.getAllByRole('listitem');
  const found = rows.find(
    (each) => each.querySelector('.model-member__name')?.textContent === name,
  );
  if (found === undefined) throw new Error(`no row ${name}`);
  return found;
};

/** The keys a member's own form offers — not a nested object's — in its order. */
const ownKeys = (item: HTMLElement) =>
  [
    ...item.querySelectorAll(
      [
        ':scope > .model-member > .model-form__fields > [data-key]',
        ':scope > .model-member > .model-form__fields > .model-form__group > .model-form__fields > [data-key]',
        ':scope > .model-member > .model-form__fields > details > [data-key]',
      ].join(', '),
    ),
  ].map((each) => each.getAttribute('data-key'));

describe('a member’s row (AC-225)', () => {
  it('shows its name, type and SQL collapsed, with badges for primary key, public and format', () => {
    list();
    const id = row('id');
    expect(id.querySelector('.model-member__type')?.textContent).toBe('number');
    expect(id.querySelector('.model-member__sql')?.textContent).toBe('id');
    const badges = (each: HTMLElement) =>
      [...each.querySelectorAll('.model-member__badge')].map((badge) => badge.textContent);
    expect(badges(id)).toEqual(['PK', 'hidden']);
    expect(badges(row('amount'))).toEqual(['currency']);
    expect(row('amount').querySelector('.model-member__sql')?.textContent).toBe('{CUBE}.amount');
    // A member defined some other way says how, in place of SQL.
    expect(row('place').querySelector('.model-member__sql')?.textContent).toBe('lat, lng');
  });

  it('opens a number dimension on its groups, with no CASE, switch or geographic fields', async () => {
    list();
    const id = row('id');
    await userEvent.click(within(id).getByText('id', { selector: '.model-member__name' }));
    // Groups by their names, as a screen reader hears them.
    expect(within(id).getByRole('group', { name: 'Basics' })).toBeTruthy();
    expect(within(id).getByRole('group', { name: 'Formatting' })).toBeTruthy();
    for (const absent of ['CASE / WHEN', 'Case', 'Geography', 'Switch', 'Time'])
      expect(within(id).queryByRole('group', { name: absent })).toBeNull();
    expect(within(id).queryByLabelText('Latitude')).toBeNull();
    expect(within(id).queryByLabelText('Values')).toBeNull();
    // A number has a currency; a string does not.
    expect(within(id).getByLabelText('Currency')).toBeTruthy();
  });

  it('says a primary key is hidden unless it is made public', () => {
    render(
      <MemberList
        schema={SCHEMA['Y.6']}
        items={[
          { name: 'id', sql: 'id', type: 'number', primary_key: true },
          { name: 'shown', sql: 'id', type: 'number', primary_key: true, public: true },
        ]}
        onChange={vi.fn()}
      />,
    );
    const badges = (name: string) =>
      [...row(name).querySelectorAll('.model-member__badge')].map((badge) => badge.textContent);
    expect(badges('id')).toEqual(['PK', 'hidden']);
    expect(badges('shown')).toEqual(['PK']);
  });

  it('offers a CASE by how a dimension is defined, not by its type', () => {
    render(
      <MemberList
        schema={SCHEMA['Y.6']}
        items={[
          { name: 'status', sql: 'status', type: 'string' },
          { name: 'late', type: 'boolean' },
        ]}
        onChange={vi.fn()}
      />,
    );
    // Defined by SQL, which a CASE may not be written beside (Y.6 shape B).
    expect(within(row('status')).queryByRole('group', { name: 'Case' })).toBeNull();
    // Not yet defined: a CASE may define it, a boolean as much as a string.
    expect(within(row('late')).getByRole('group', { name: 'Case' })).toBeTruthy();
    expect(within(row('late')).getByLabelText('SQL', { exact: true })).toBeTruthy();
  });

  it('offers a switch dimension its name, its type and its values, and nothing else', () => {
    render(
      <MemberList
        schema={SCHEMA['Y.6']}
        items={[{ name: 'mode', type: 'switch', values: ['a', 'b'] }]}
        onChange={vi.fn()}
      />,
    );
    expect(ownKeys(row('mode'))).toEqual(['name', 'type', 'values']);
  });

  it('reaches every key the validator takes on some dimension, and on some measure', () => {
    // AC-132 with AC-225: offered where it applies, so offered somewhere.
    const reached = (schema: 'Y.6' | 'Y.7', items: Record<string, unknown>[]) => {
      const { unmount } = render(
        <MemberList schema={SCHEMA[schema]} items={items} onChange={vi.fn()} />,
      );
      const keys = new Set(screen.getAllByRole('listitem').flatMap((each) => ownKeys(each)));
      unmount();
      return [...keys].sort();
    };
    const every = (schema: 'Y.6' | 'Y.7') => SCHEMA[schema].fields.map((field) => field.key).sort();
    expect(
      reached('Y.6', [
        { name: 's', type: 'string', sql: 'x', sub_query: true },
        { name: 'b', type: 'boolean' },
        { name: 't', type: 'time', sql: 'x' },
        { name: 'n', type: 'number', sql: 'x', multi_stage: true },
        { name: 'g', type: 'geo' },
        { name: 'w', type: 'switch' },
      ]),
    ).toEqual(every('Y.6'));
    expect(
      reached('Y.7', [
        { name: 'c', type: 'count' },
        { name: 'm', type: 'number', sql: 'x', multi_stage: true },
      ]),
    ).toEqual(every('Y.7'));
  });

  it('gives a time dimension its granularities, and a geo one its point', async () => {
    list();
    await userEvent.click(within(row('at')).getByText('at', { selector: '.model-member__name' }));
    expect(within(row('at')).getByRole('group', { name: 'Time' })).toBeTruthy();
    expect(within(row('at')).queryByLabelText('Currency')).toBeNull();
    await userEvent.click(
      within(row('place')).getByText('place', { selector: '.model-member__name' }),
    );
    const place = within(row('place'));
    expect(place.getByRole('group', { name: 'Geography' })).toBeTruthy();
    // Defined by its point, it has no SQL of its own to offer.
    expect(place.queryByLabelText('SQL')).toBeNull();
  });

  it('never hides a key the file writes, whatever its type', async () => {
    render(
      <MemberList
        schema={SCHEMA['Y.6']}
        items={[{ name: 'odd', type: 'number', sql: 'x', values: ['a'] }]}
        onChange={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('odd', { selector: '.model-member__name' }));
    expect(screen.getByLabelText('Values')).toBeTruthy();
  });
});
