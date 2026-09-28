import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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

/**
 * The keys a member's own form offers — not a nested object's — in its order:
 * its groups', those under Advanced (T480), and its legacy keys.
 */
const ownKeys = (item: HTMLElement) =>
  [
    ...item.querySelectorAll(
      [
        ':scope > .model-member > .model-form__fields > [data-key]',
        ':scope > .model-member > .model-form__fields > .model-form__group > .model-form__fields > [data-key]',
        ':scope > .model-member > .model-form__fields > .model-form__advanced > .model-form__group > .model-form__fields > [data-key]',
        // Advanced holding one group alone draws its rows untitled (T481).
        ':scope > .model-member > .model-form__fields > .model-form__advanced > .model-form__fields > [data-key]',
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
    // Made public, it says so, as design 03 badges `id` (T480).
    expect(badges('shown')).toEqual(['PK', 'public']);
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

  describe('as design 03 notes 5–7 draw it (T480, AC-344)', () => {
    it('keeps Remove off the row: it is at the foot of the open member, named for it', async () => {
      const onChange = vi.fn();
      render(<MemberList schema={SCHEMA['Y.6']} items={DIMENSIONS} onChange={onChange} />);
      const status = row('status');
      const summary = status.querySelector('summary');
      expect(summary?.querySelector('button')).toBeNull();
      // Not beside the member either: inside it, at its foot, only seen open.
      expect(status.querySelectorAll(':scope > button')).toHaveLength(0);
      await userEvent.click(
        within(status).getByText('status', { selector: '.model-member__name' }),
      );
      const remove = within(status).getByRole('button', { name: 'Remove dimension status' });
      expect(remove.textContent).toBe('Remove dimension');
      // At the foot, after every field.
      const fields = status.querySelector('.model-member > .model-form__fields');
      expect(
        (fields?.compareDocumentPosition(remove) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      await userEvent.click(remove);
      expect(onChange).toHaveBeenCalledWith(DIMENSIONS.filter((each) => each.name !== 'status'));
    });

    it('puts a join’s relationship where a member’s type goes, in words', () => {
      render(
        <MemberList
          schema={SCHEMA['Y.5']}
          items={[
            {
              name: 'customers',
              sql: '{CUBE}.customer_id = {customers}.id',
              relationship: 'many_to_one',
            },
          ]}
          onChange={vi.fn()}
        />,
      );
      const join = screen.getByRole('listitem');
      expect(join.querySelector('.model-member__type')?.textContent).toBe('many to one');
      expect(join.querySelector('.model-member__sql')?.textContent).toBe(
        '{CUBE}.customer_id = {customers}.id',
      );
    });

    it('ends the list with “+ dimension” and how many there are', () => {
      list();
      const add = screen.getByRole('button', { name: 'Add dimension' });
      expect(add.textContent).toBe('+ dimension');
      expect(add.parentElement?.querySelector('.model-members__total')?.textContent).toBe(
        '5 total',
      );
    });

    it('opens a new member at once, its name focused to type over', async () => {
      function Held() {
        const [items, setItems] = useState<Record<string, unknown>[]>(DIMENSIONS);
        return (
          <MemberList
            schema={SCHEMA['Y.6']}
            items={items}
            onChange={(next) => {
              setItems(next ?? []);
            }}
          />
        );
      }
      render(<Held />);
      await userEvent.click(screen.getByRole('button', { name: 'Add dimension' }));
      const added = row('dimension_1');
      expect(added.querySelector('details')?.open).toBe(true);
      const name = within(added).getByLabelText('Name', { exact: true });
      expect(document.activeElement).toBe(name);
    });

    it('opens on Basics, the member’s own shape beside it, and the rest under Advanced', async () => {
      list();
      const status = row('status');
      await userEvent.click(
        within(status).getByText('status', { selector: '.model-member__name' }),
      );
      const basics = within(status).getByRole('group', { name: 'Basics' });
      expect(
        [...basics.querySelectorAll(':scope > .model-form__fields > [data-key]')].map((each) =>
          each.getAttribute('data-key'),
        ),
      ).toEqual(['name', 'type', 'sql', 'title', 'format', 'description', 'public', 'primary_key']);
      // The rest, folded: named by the keys it holds — the country code among them.
      const advanced = status.querySelector<HTMLDetailsElement>(
        '.model-member > .model-form__fields > .model-form__advanced',
      );
      expect(advanced?.open).toBe(false);
      expect(advanced?.querySelector('summary')?.textContent).toBe(
        'Advanced mask, sub_query, links, multi_stage, order, meta, suggest_filter_values, key, country code',
      );
      // A string's country-code marking is there, not in the open body.
      expect(advanced?.querySelector('[data-setting="country-code"]')?.isConnected).toBe(true);
      // A geographic point is how `place` is defined: in view, not folded.
      await userEvent.click(
        within(row('place')).getByText('place', { selector: '.model-member__name' }),
      );
      const point = within(row('place')).getByRole('group', { name: 'Geography' });
      expect(point.closest('.model-form__advanced')).toBeNull();
    });

    it('opens Advanced by itself when the file writes one of its keys', () => {
      render(
        <MemberList
          schema={SCHEMA['Y.6']}
          items={[{ name: 'ordered', sql: 'x', type: 'string', order: 'desc' }]}
          onChange={vi.fn()}
        />,
      );
      const advanced = row('ordered').querySelector<HTMLDetailsElement>('.model-form__advanced');
      expect(advanced?.open).toBe(true);
    });

    it('leaves Advanced open when the last key the user set there is cleared (T480’s review)', async () => {
      function Held() {
        const [items, setItems] = useState<Record<string, unknown>[]>([
          { name: 'ordered', sql: 'x', type: 'string', order: 'desc' },
        ]);
        return (
          <MemberList
            schema={SCHEMA['Y.6']}
            items={items}
            onChange={(next) => {
              setItems(next ?? []);
            }}
          />
        );
      }
      render(<Held />);
      const advanced = row('ordered').querySelector<HTMLDetailsElement>('.model-form__advanced');
      expect(advanced?.open).toBe(true);
      await userEvent.selectOptions(within(row('ordered')).getByLabelText('Order'), '');
      expect(within(row('ordered')).getByLabelText<HTMLSelectElement>('Order').value).toBe('');
      expect(advanced?.open).toBe(true);
    });

    it('keeps a CASE under Advanced until it defines the dimension', () => {
      render(
        <MemberList
          schema={SCHEMA['Y.6']}
          items={[
            { name: 'late', type: 'boolean' },
            { name: 'band', type: 'string', case: { when: [{ sql: 'x', label: 'a' }] } },
          ]}
          onChange={vi.fn()}
        />,
      );
      const offered = within(row('late')).getByRole('group', { name: 'CASE / WHEN' });
      expect(offered.closest('.model-form__advanced')?.isConnected).toBe(true);
      const defining = within(row('band')).getByRole('group', { name: 'CASE / WHEN' });
      expect(defining.closest('.model-form__advanced')).toBeNull();
    });

    it('opens nothing and moves no focus when the owner holds an add (T480’s review)', async () => {
      const { rerender } = render(
        <MemberList schema={SCHEMA['Y.6']} items={DIMENSIONS} onChange={vi.fn()} />,
      );
      const add = screen.getByRole('button', { name: 'Add dimension' });
      await userEvent.click(add);
      expect(document.activeElement).toBe(add);
      // A member arrives later, from the YAML: it takes no focus and stays closed.
      rerender(
        <MemberList
          schema={SCHEMA['Y.6']}
          items={[...DIMENSIONS, { name: 'typed', sql: 'x', type: 'string' }]}
          onChange={vi.fn()}
        />,
      );
      expect(row('typed').querySelector('details')?.open).toBe(false);
      expect(document.activeElement).toBe(add);
    });

    it('after a remove, closes the member now in its place and focuses its row (T480’s review)', async () => {
      function Held() {
        const [items, setItems] = useState<Record<string, unknown>[]>(DIMENSIONS);
        return (
          <MemberList
            schema={SCHEMA['Y.6']}
            items={items}
            onChange={(next) => {
              setItems(next ?? []);
            }}
          />
        );
      }
      render(<Held />);
      await userEvent.click(
        within(row('status')).getByText('status', { selector: '.model-member__name' }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Remove dimension status' }));
      expect(screen.queryByText('status', { selector: '.model-member__name' })).toBeNull();
      const next = row('at').querySelector('details');
      expect(next?.open).toBe(false);
      expect(document.activeElement).toBe(next?.querySelector('summary'));
    });

    it('draws Public and Primary key as switches that show Cube’s default', async () => {
      const onChange = vi.fn();
      render(
        <MemberList
          schema={SCHEMA['Y.6']}
          items={[
            { name: 'status', sql: 'status', type: 'string' },
            { name: 'id', sql: 'id', type: 'number', primary_key: true },
          ]}
          onChange={onChange}
        />,
      );
      const status = row('status');
      const statusPublic = within(status).getByRole('switch', { name: 'Public' });
      // Unset: Cube's default, and said to be one.
      expect((statusPublic as HTMLInputElement).checked).toBe(true);
      expect(
        document.getElementById(statusPublic.getAttribute('aria-describedby') ?? '')?.textContent,
      ).toBe('· default on');
      // A primary key is hidden by default.
      const idPublic = within(row('id')).getByRole('switch', { name: 'Public' });
      expect((idPublic as HTMLInputElement).checked).toBe(false);
      expect(
        document.getElementById(idPublic.getAttribute('aria-describedby') ?? '')?.textContent,
      ).toBe('· default off');
      expect(
        (within(row('id')).getByRole('switch', { name: 'Primary key' }) as HTMLInputElement)
          .checked,
      ).toBe(true);

      // Off from the default writes it; back on to the default takes the key away.
      await userEvent.click(statusPublic);
      expect(onChange).toHaveBeenLastCalledWith([
        { name: 'status', sql: 'status', type: 'string', public: false },
        { name: 'id', sql: 'id', type: 'number', primary_key: true },
      ]);
    });

    it('writes nothing when a switch is put back to Cube’s default', async () => {
      const onChange = vi.fn();
      render(
        <MemberList
          schema={SCHEMA['Y.6']}
          items={[{ name: 'status', sql: 'status', type: 'string', public: false }]}
          onChange={onChange}
        />,
      );
      await userEvent.click(within(row('status')).getByRole('switch', { name: 'Public' }));
      expect(onChange).toHaveBeenLastCalledWith([
        { name: 'status', sql: 'status', type: 'string' },
      ]);
    });

    it('keeps an expression an expression, and offers one from the switch', async () => {
      const onChange = vi.fn();
      render(
        <MemberList
          schema={SCHEMA['Y.6']}
          items={[
            { name: 'secret', sql: 'x', type: 'string', public: '{ securityContext.is_admin }' },
            { name: 'plain', sql: 'x', type: 'string' },
          ]}
          onChange={onChange}
        />,
      );
      expect(
        (within(row('secret')).getByLabelText('Public expression') as HTMLInputElement).value,
      ).toBe('{ securityContext.is_admin }');
      expect(within(row('secret')).queryByRole('switch', { name: 'Public' })).toBeNull();
      await userEvent.click(
        within(row('plain')).getByRole('button', { name: 'ƒx: Public as an expression' }),
      );
      expect(onChange).toHaveBeenLastCalledWith([
        { name: 'secret', sql: 'x', type: 'string', public: '{ securityContext.is_admin }' },
        { name: 'plain', sql: 'x', type: 'string', public: '' },
      ]);
    });

    it('moves focus to the expression’s field when a switch becomes one (T480’s review)', async () => {
      function Held() {
        const [items, setItems] = useState<Record<string, unknown>[]>([
          { name: 'plain', sql: 'x', type: 'string' },
        ]);
        return (
          <MemberList
            schema={SCHEMA['Y.6']}
            items={items}
            onChange={(next) => {
              setItems(next ?? []);
            }}
          />
        );
      }
      render(<Held />);
      await userEvent.click(
        within(row('plain')).getByRole('button', { name: 'ƒx: Public as an expression' }),
      );
      const expression = await within(row('plain')).findByLabelText('Public expression');
      await vi.waitFor(() => {
        expect(document.activeElement).toBe(expression);
      });
    });
  });

  it('says which member is open, for the YAML to tint its lines (T482, design 03 note 9)', async () => {
    const onOpenMember = vi.fn();
    render(
      <MemberList
        schema={SCHEMA['Y.6']}
        items={DIMENSIONS}
        onChange={vi.fn()}
        onOpenMember={onOpenMember}
      />,
    );
    await userEvent.click(
      within(row('status')).getByText('status', { selector: '.model-member__name' }),
    );
    await vi.waitFor(() => {
      expect(onOpenMember).toHaveBeenLastCalledWith(2);
    });
    await userEvent.click(within(row('at')).getByText('at', { selector: '.model-member__name' }));
    await vi.waitFor(() => {
      expect(onOpenMember).toHaveBeenLastCalledWith(3);
    });
    // Closed, the one still open is said; then none.
    await userEvent.click(within(row('at')).getByText('at', { selector: '.model-member__name' }));
    await vi.waitFor(() => {
      expect(onOpenMember).toHaveBeenLastCalledWith(2);
    });
    await userEvent.click(
      within(row('status')).getByText('status', { selector: '.model-member__name' }),
    );
    await vi.waitFor(() => {
      expect(onOpenMember).toHaveBeenLastCalledWith(null);
    });
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
