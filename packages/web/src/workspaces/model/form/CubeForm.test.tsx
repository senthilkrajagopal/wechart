import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CubeForm } from './CubeForm';
import { DataSourcesContext } from './dataSources';
import { MEASURE_TYPES, SCHEMA } from './schema';
import { memberIndexOf, PickerScopeContext } from './scopes';

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

/**
 * A key's own row in a General tab: the first `[data-key]` naming it that is
 * not inside another key's row. Reads from (T481) holds `sql_table` and `sql`.
 */
function ownRowOf(panel: HTMLElement, key: string): HTMLElement | undefined {
  return [...panel.querySelectorAll<HTMLElement>('[data-key]')].find(
    (row) =>
      row.getAttribute('data-key')?.split(' ').includes(key) === true &&
      row.parentElement?.closest('[data-key]') === null,
  );
}

const optionsOf = (select: HTMLElement) =>
  [...select.querySelectorAll('option')].map((option) => option.value).filter((v) => v !== '');

/**
 * A member's own field, not a nested object's: in its named group (T236,
 * AC-225), that group under Advanced (T480), or ungrouped.
 */
const ownRow = (key: string, inside = '') =>
  [
    `.model-member > .model-form__fields > [data-key="${key}"]${inside}`,
    `.model-member > .model-form__fields > .model-form__group > .model-form__fields > [data-key="${key}"]${inside}`,
    `.model-member > .model-form__fields > .model-form__advanced > .model-form__group > .model-form__fields > [data-key="${key}"]${inside}`,
    // Advanced holding one group alone draws its rows untitled (T481).
    `.model-member > .model-form__fields > .model-form__advanced > .model-form__fields > [data-key="${key}"]${inside}`,
  ].join(', ');

describe('a cube’s form', () => {
  it('has a labelled control for every key on a cube, lists on their own tabs', async () => {
    // Held: a key reached through Reads from takes its choice (T481).
    render(<Held initial={ORDERS} onChange={vi.fn()} />);
    const form = screen.getByRole('region', { name: 'Cube orders' });

    // General: every key that is not a list of members, the legacy ones in their group.
    const tabs = within(form)
      .getAllByRole('tab')
      .map((tab) => tab.textContent?.replace(/\s*\d+$/, ''));
    // Design 03's short labels (T470, UX-074), each keeping its whole name as its tooltip.
    expect(tabs).toEqual([
      'General',
      'Dimensions',
      'Measures',
      'Joins',
      'Segments',
      'Hierarchies',
      'Pre-aggs',
      'Access',
    ]);
    expect(within(form).getByRole('tab', { name: /^Pre-aggs/ }).title).toBe('Pre-aggregations');
    expect(within(form).getByRole('tab', { name: /^Access/ }).title).toBe('Access policy');
    const lists = [
      'dimensions',
      'measures',
      'joins',
      'segments',
      'hierarchies',
      'pre_aggregations',
      'access_policy',
    ];
    // Each key's own row, in its group or a fold; a nested object's rows
    // (refresh_key has its own `sql`) sit inside its own `data-key`.
    const general = within(form).getByRole('tabpanel');
    for (const field of SCHEMA['Y.3'].fields.filter((each) => !lists.includes(each.key))) {
      const row = ownRowOf(general, field.key);
      expect(row?.isConnected).toBe(true);
      // `sql` is Reads from's other choice (T481): pressed, its own field.
      if (field.key === 'sql') {
        await userEvent.click(
          within(row as HTMLElement).getByRole('button', { name: 'SQL query' }),
        );
        expect(
          within(row as HTMLElement).getByLabelText('SQL query', { exact: true }).tagName,
        ).toBe('TEXTAREA');
        continue;
      }
      if (field.kind === 'object') expect(row?.getAttribute('data-key')).toBe(field.key);
      else
        expect(
          within(row as HTMLElement).getByLabelText(field.label, { exact: true }).isConnected,
        ).toBe(true);
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
        `${ownRow(key)}, .model-member > .model-form__fields > details > [data-key="${key}"]`,
      ) as HTMLElement;
    // Every key but the multi-stage ones, which a count is not (§Y.17, AC-225)
    // — each reached on a multi-stage measure (memberRows.test.tsx).
    const staged = ['group_by', 'reduce_by', 'add_group_by'];
    for (const field of SCHEMA['Y.7'].fields.filter(
      (each) => each.kind !== 'object' && each.kind !== 'list' && !staged.includes(each.key),
    )) {
      expect(within(own(field.key)).getByLabelText(field.label, { exact: true })).toBeTruthy();
    }
    // `count` is not multi-stage, and Joi takes `number_agg` and `rank` only
    // on a multi-stage measure (research §Y.17): so they are not offered.
    expect(optionsOf(within(own('type')).getByLabelText('Type', { exact: true }))).toEqual(
      MEASURE_TYPES.filter((type) => type !== 'number_agg' && type !== 'rank'),
    );
  });

  it('offers the multi-stage measure types on a multi-stage measure', async () => {
    const ranked = {
      ...ORDERS,
      measures: [
        { name: 'ranked', type: 'rank', multi_stage: true, order_by: [{ sql: 'x', dir: 'desc' }] },
      ],
    };
    render(<CubeForm kind="cube" value={ranked} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('tab', { name: /^Measures/ }));
    await userEvent.click(screen.getByText('ranked', { selector: '.model-member__name' }));

    const measure = screen.getByRole('list', { name: 'Measures' });
    const type = measure.querySelector(ownRow('type', ' select'));
    expect(optionsOf(type as HTMLElement)).toEqual([...MEASURE_TYPES]);
    expect((type as HTMLSelectElement).value).toBe('rank');
    // Its order_by, a list written inside the key's type, has fields of its own.
    const orderBy = within(measure).getByRole('group', { name: 'Order by' });
    expect(
      (within(orderBy).getByLabelText('Dir', { exact: true }) as HTMLSelectElement).value,
    ).toBe('desc');
    expect(optionsOf(within(orderBy).getByLabelText('Dir', { exact: true }))).toEqual([
      'asc',
      'desc',
    ]);
  });

  it('offers a join every relationship the validator takes, and shows the one it has', async () => {
    const legacy = {
      ...ORDERS,
      joins: [{ name: 'customers', relationship: 'has_many', sql: '{CUBE}.id = {customers}.id' }],
    };
    render(<CubeForm kind="cube" value={legacy} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('tab', { name: /^Joins/ }));
    await userEvent.click(screen.getByText('customers', { selector: '.model-member__name' }));

    const relationship = screen.getByLabelText('Relationship', {
      exact: true,
    }) as HTMLSelectElement;
    // The docs' three first, then those Joi also takes, apart (research Y.5).
    expect(optionsOf(relationship)).toEqual([
      'many_to_one',
      'one_to_many',
      'one_to_one',
      'belongs_to',
      'has_many',
      'has_one',
      'manyToOne',
      'oneToMany',
      'oneToOne',
      'belongsTo',
      'hasMany',
      'hasOne',
    ]);
    expect(
      within(relationship).getByRole('group', { name: 'Also accepted' }).querySelectorAll('option'),
    ).toHaveLength(9);
    expect(relationship.value).toBe('has_many');
  });

  it('shows a value it does not offer as written, rather than as not set', async () => {
    const odd = { ...ORDERS, measures: [{ name: 'count', type: 'countDistinct' }] };
    render(<CubeForm kind="cube" value={odd} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('tab', { name: /^Measures/ }));
    await userEvent.click(screen.getByText('count', { selector: '.model-member__name' }));

    const measure = screen.getByRole('list', { name: 'Measures' });
    const type = measure.querySelector(ownRow('type', ' select')) as HTMLSelectElement;
    expect(type.value).toBe('countDistinct');
    expect(type.selectedOptions[0]?.textContent).toBe('countDistinct (as written)');
  });

  it('edits a value of another shape than its field’s as YAML, rather than showing it empty', async () => {
    const linked = {
      ...ORDERS,
      dimensions: [
        { name: 'status', sql: 'status', type: 'string', format: { type: 'link', label: 'Open' } },
      ],
    };
    render(<CubeForm kind="cube" value={linked} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('tab', { name: /^Dimensions/ }));
    await userEvent.click(screen.getByText('status', { selector: '.model-member__name' }));

    const format = screen
      .getByRole('list', { name: 'Dimensions' })
      .querySelector(ownRow('format', ' textarea'));
    expect((format as HTMLTextAreaElement).value).toBe('type: link\nlabel: Open');
  });

  it('hands back the cube with the one key changed', async () => {
    const onChange = vi.fn();
    render(<CubeForm kind="cube" value={ORDERS} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Title', { exact: true }), 'O');

    expect(onChange).toHaveBeenLastCalledWith({ ...ORDERS, title: 'O' });
  });
});

/**
 * T141 / AC-135: IF the YAML fails to parse, THEN THE SYSTEM SHALL … keep the
 * form read-only until it parses.
 * Fails when: the form stays editable on unparseable YAML.
 */
/**
 * T481 / AC-132, design 03 state B (MW-08): General grouped as Basics,
 * ▾ Refresh and ▸ Advanced, each field with its one-line help from
 * research/cube/data-modeling.md, "Reads from" as Cube's either/or, and the
 * data source picked from the ones Cube has. Every key stays reachable.
 */
describe('a cube’s General tab, grouped', () => {
  /** A group's rows, by their keys: its own, not a nested object's. */
  const rowsIn = (group: HTMLElement) =>
    [...group.querySelectorAll<HTMLElement>(':scope > .model-form__fields > [data-key]')].map(
      (row) => row.getAttribute('data-key'),
    );
  const groupNamed = (panel: HTMLElement, name: string) =>
    within(panel).getByRole('group', { name }) as HTMLElement;

  it('reads Basics, then Refresh, then Advanced folded with the legacy keys under it', () => {
    render(<CubeForm kind="cube" value={ORDERS} onChange={vi.fn()} />);
    const panel = screen.getByRole('tabpanel');
    expect(
      [...panel.querySelectorAll('.model-form__group-title, summary')].map((each) =>
        each.textContent?.trim(),
      ),
    ).toEqual([
      'Basics',
      'Refresh refresh_key',
      'Advanced extends, sql_alias, calendar, meta, shown, rewrite_queries',
      'Legacy and undocumented',
    ]);
    // Under the same caret (MW-08): no fold of their own.
    expect(panel.querySelector('.model-form__legacy')).toBeNull();
    expect(
      panel
        .querySelector('.model-form__advanced')
        ?.contains(within(panel).getByRole('group', { name: 'Legacy and undocumented' })),
    ).toBe(true);
    expect(rowsIn(groupNamed(panel, 'Basics'))).toEqual([
      'name',
      'data_source',
      'sql_table sql',
      'title',
      'public',
      'description',
    ]);
    // Refresh: the refresh key's own fields, in view, not a box within a box.
    const refresh = groupNamed(panel, 'Refresh');
    expect(refresh.querySelector('fieldset')).toBeNull();
    expect(
      [...refresh.querySelectorAll('[data-key="refresh_key"] [data-key]')].map((row) =>
        row.getAttribute('data-key'),
      ),
    ).toEqual(['every', 'timezone', 'sql', 'immutable']);
    expect((panel.querySelector('.model-form__advanced') as HTMLDetailsElement).open).toBe(false);
  });

  it('gives each field its help from the research, and marks the name required', () => {
    render(<CubeForm kind="cube" value={ORDERS} onChange={vi.fn()} />);
    const panel = screen.getByRole('tabpanel');
    const name = within(panel).getByLabelText('Name', { exact: true });
    expect(name.getAttribute('aria-required')).toBe('true');
    expect(helpOf(name)).toBe('Unique across cubes and views');
    expect(helpOf(within(panel).getByLabelText('SQL table', { exact: true }))).toBe(
      'Cube accepts exactly one of sql_table or sql',
    );
    expect(helpOf(within(panel).getByLabelText('Data source', { exact: true }))).toBe(
      'The connection Cube reads this cube from; default when not set',
    );
    expect(
      (within(panel).getByLabelText('Title', { exact: true }) as HTMLInputElement).placeholder,
    ).toBe('from the name');
    expect(
      (within(panel).getByLabelText('Every', { exact: true }) as HTMLInputElement).placeholder,
    ).toBe('not set · Cube’s default applies');
    // Picked from the zones there are, not typed; unset, Y.4's default.
    const zone = within(panel).getByLabelText('Time zone', { exact: true }) as HTMLSelectElement;
    expect([zone.tagName, zone.options[0]?.textContent, zone.options[1]?.value]).toEqual([
      'SELECT',
      'not set · the query’s time zone',
      'UTC',
    ]);
    // Public as design 03's switch, with Cube's default.
    expect(panel.querySelector('[data-key="public"] .model-field__default')?.textContent).toBe(
      '· default on',
    );
  });

  it('reads from a SQL table or a SQL query, and moves what is written between them', async () => {
    const onChange = vi.fn();
    render(<Held initial={ORDERS} onChange={onChange} />);
    const reads = screen.getByRole('group', { name: 'Reads from' });
    const table = within(reads).getByRole('button', { name: 'SQL table' });
    const query = within(reads).getByRole('button', { name: 'SQL query' });
    expect([table.getAttribute('aria-pressed'), query.getAttribute('aria-pressed')]).toEqual([
      'true',
      'false',
    ]);
    expect((within(reads).getByLabelText('SQL table') as HTMLInputElement).value).toBe(
      'public.orders',
    );

    await userEvent.click(query);
    const written = onChange.mock.lastCall?.[0] as Record<string, unknown>;
    expect([written['sql_table'], written['sql']]).toEqual([undefined, 'public.orders']);
    expect(
      (within(reads).getByLabelText('SQL query', { exact: true }) as HTMLTextAreaElement).value,
    ).toBe('public.orders');
    expect(query.getAttribute('aria-pressed')).toBe('true');
  });

  it('opens on SQL query when the file writes one, and back to a table takes it along', async () => {
    const onChange = vi.fn();
    render(
      <Held initial={{ ...without('sql_table'), sql: 'orders_archive' }} onChange={onChange} />,
    );
    const reads = screen.getByRole('group', { name: 'Reads from' });
    expect(
      within(reads).getByRole('button', { name: 'SQL query' }).getAttribute('aria-pressed'),
    ).toBe('true');
    await userEvent.click(within(reads).getByRole('button', { name: 'SQL table' }));
    const written = onChange.mock.lastCall?.[0] as Record<string, unknown>;
    expect([written['sql_table'], written['sql']]).toEqual(['orders_archive', undefined]);
  });

  it('writes what is typed to the choice made, with nothing written yet', async () => {
    const onChange = vi.fn();
    render(<Held initial={without('sql_table')} onChange={onChange} />);
    const reads = screen.getByRole('group', { name: 'Reads from' });
    await userEvent.click(within(reads).getByRole('button', { name: 'SQL query' }));
    await userEvent.type(within(reads).getByLabelText('SQL query', { exact: true }), 'SELECT 1');
    const written = onChange.mock.lastCall?.[0] as Record<string, unknown>;
    expect([written['sql_table'], written['sql']]).toEqual([undefined, 'SELECT 1']);
  });

  it('keeps SQL that runs over lines on its lines, and a value of another shape as YAML', () => {
    const { rerender } = render(
      <CubeForm
        kind="cube"
        value={{ ...ORDERS, sql_table: 'public.\norders' }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('SQL table', { exact: true }).tagName).toBe('TEXTAREA');
    rerender(<CubeForm kind="cube" value={{ ...ORDERS, sql_table: ['a'] }} onChange={vi.fn()} />);
    // Not text: each key its own row, as any value of another shape is (T481's review).
    expect(screen.queryByRole('group', { name: 'Reads from' })).toBeNull();
    expect(
      (screen.getByLabelText('SQL table', { exact: true }) as HTMLTextAreaElement).className,
    ).toBe('model-field__yaml');
  });

  it('says calendar’s rule under its switch, and marks a measure’s and a view’s names', async () => {
    render(<CubeForm kind="cube" value={ORDERS} onChange={vi.fn()} />);
    const calendar = screen.getByRole('switch', { name: 'Calendar' });
    expect(helpOf(calendar)).toBe('Needs exactly one primary key dimension of type time');
    await userEvent.click(screen.getByRole('tab', { name: /^Measures/ }));
    await userEvent.click(screen.getByText('count', { selector: '.model-member__name' }));
    const name = screen.getByLabelText('Name', { exact: true });
    expect([name.getAttribute('aria-required'), helpOf(name)]).toEqual([
      'true',
      'Unique within the cube',
    ]);
    expect(helpOf(screen.getByLabelText('SQL', { exact: true }))).toBe(
      'Required, except for count and multi-stage measures',
    );
  });

  it('shows both when the file writes both, for Problems to name', () => {
    render(
      <CubeForm
        kind="cube"
        value={{ ...ORDERS, sql: 'SELECT * FROM orders' }}
        onChange={vi.fn()}
      />,
    );
    const reads = screen.getByRole('group', { name: 'Reads from' });
    expect((within(reads).getByLabelText('SQL table') as HTMLInputElement).value).toBe(
      'public.orders',
    );
    expect((within(reads).getByLabelText('SQL query') as HTMLTextAreaElement).value).toBe(
      'SELECT * FROM orders',
    );
  });

  it('picks the data source from the ones Cube has, and keeps one it doesn’t', () => {
    const { rerender } = render(
      <DataSourcesContext.Provider value={['default', 'warehouse']}>
        <CubeForm kind="cube" value={ORDERS} onChange={vi.fn()} />
      </DataSourcesContext.Provider>,
    );
    const picker = () => screen.getByLabelText('Data source', { exact: true });
    expect(picker().tagName).toBe('SELECT');
    expect([...picker().querySelectorAll('option')].map((option) => option.textContent)).toEqual([
      '(not set · default)',
      'default',
      'warehouse',
    ]);
    rerender(
      <DataSourcesContext.Provider value={['default']}>
        <CubeForm kind="cube" value={{ ...ORDERS, data_source: 'legacy' }} onChange={vi.fn()} />
      </DataSourcesContext.Provider>,
    );
    expect((picker() as HTMLSelectElement).value).toBe('legacy');
    expect(picker().querySelector('option[value="legacy"]')?.textContent).toBe(
      'legacy (not a data source Cube has)',
    );
    // Not known here: typed, as before.
    rerender(<CubeForm kind="cube" value={ORDERS} onChange={vi.fn()} />);
    expect(picker().tagName).toBe('INPUT');
  });
});

/**
 * T493 / AC-351 (MW-19): a view made by New view opens on its Cubes with a
 * new entry ready — its join path picked, focused — written only once one is
 * picked; an empty Cubes says what that means.
 */
describe('a new view’s Cubes', () => {
  it('opens with an entry ready, written only once its join path is picked', async () => {
    const onChange = vi.fn();
    render(
      <PickerScopeContext.Provider
        value={{
          index: memberIndexOf([
            {
              path: 'cubes/orders.yml',
              content:
                'cubes:\n  - name: orders\n    joins:\n      - name: customers\n        sql: x\n        relationship: many_to_one\n',
            },
            { path: 'cubes/customers.yml', content: 'cubes:\n  - name: customers\n' },
          ]),
          cube: undefined,
        }}
      >
        <CubeForm kind="view" value={{ name: 'fresh' }} onChange={onChange} addingOn="cubes" />
      </PickerScopeContext.Provider>,
    );
    expect(screen.getByRole('tab', { name: /^Cubes/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('A view shows nothing until it includes a cube.').isConnected).toBe(
      true,
    );
    const entry = screen.getByRole('group', { name: 'New cube in the view' });
    const joinPath = within(entry).getByLabelText('Join path', { exact: true });
    expect(document.activeElement).toBe(joinPath);
    expect([...joinPath.querySelectorAll('option')].map((option) => option.value)).toEqual([
      '',
      'orders',
      'orders.customers',
      'customers',
    ]);
    // Nothing written yet: no cubes chosen for the user.
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.selectOptions(joinPath, 'orders.customers');
    expect(onChange).toHaveBeenLastCalledWith({
      name: 'fresh',
      cubes: [{ join_path: 'orders.customers' }],
    });
  });

  it('lets the ready entry go, writing nothing, and offers it once only', async () => {
    const onChange = vi.fn();
    render(<CubeForm kind="view" value={{ name: 'fresh' }} onChange={onChange} addingOn="cubes" />);
    await userEvent.click(
      within(screen.getByRole('group', { name: 'New cube in the view' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(screen.queryByRole('group', { name: 'New cube in the view' })).toBeNull();
    // Away and back: the list as it is.
    await userEvent.click(screen.getByRole('tab', { name: /^General/ }));
    await userEvent.click(screen.getByRole('tab', { name: /^Cubes/ }));
    expect(screen.queryByRole('group', { name: 'New cube in the view' })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the focus on the field first set, when that is a chip', async () => {
    function Fresh() {
      const [value, setValue] = useState<Record<string, unknown>>({ name: 'fresh' });
      return <CubeForm kind="view" value={value} onChange={setValue} addingOn="cubes" />;
    }
    render(<Fresh />);
    await userEvent.click(
      within(screen.getByRole('group', { name: 'New cube in the view' })).getByRole('button', {
        name: 'All (*)',
      }),
    );
    expect(screen.queryByRole('group', { name: 'New cube in the view' })).toBeNull();
    // The written entry, open, its All (*) chip pressed and focused.
    const focused = document.activeElement;
    expect(focused?.textContent).toBe('All (*)');
    expect(focused?.getAttribute('aria-pressed')).toBe('true');
    expect(focused?.closest('details.model-member')?.hasAttribute('open')).toBe(true);
  });
});

describe('a view’s General tab, grouped', () => {
  it('reads Basics — name, title, public, description — with the rest folded', () => {
    render(<CubeForm kind="view" value={{ name: 'summary' }} onChange={vi.fn()} />);
    const panel = screen.getByRole('tabpanel');
    const basics = within(panel).getByRole('group', { name: 'Basics' });
    expect(
      [...basics.querySelectorAll(':scope > .model-form__fields > [data-key]')].map((row) =>
        row.getAttribute('data-key'),
      ),
    ).toEqual(['name', 'title', 'public', 'description']);
    expect(
      within(basics).getByLabelText('Name', { exact: true }).getAttribute('aria-required'),
    ).toBe('true');
    expect(panel.querySelector('.model-form__advanced > summary')?.textContent).toBe(
      'Advanced extends, meta, view_group, view_groups, joins, segments, hierarchies, pre_aggregations, refresh_key, data_source, sql_alias, rewrite_queries, shown',
    );
    // A view's groups by name, with MW-08's placeholder.
    expect(
      (within(panel).getByLabelText('View groups', { exact: true }) as HTMLInputElement)
        .placeholder,
    ).toBe('view group, view group');
  });
});

/** The help line a control is described by. */
function helpOf(control: HTMLElement): string | undefined {
  const ids = control.getAttribute('aria-describedby')?.split(' ') ?? [];
  return ids
    .map((id) => document.getElementById(id))
    .find((element) => element?.classList.contains('model-field__help'))
    ?.textContent?.trim();
}

/**
 * T482's review: a list tab opens with its members closed, whichever member
 * the tab before had open, as the YAML's tint says (design 03 note 9).
 */
describe('switching list tabs', () => {
  it('opens the next tab with none of its members open, and says so', async () => {
    const onOpenMember = vi.fn();
    render(<CubeForm kind="cube" value={ORDERS} onChange={vi.fn()} onOpenMember={onOpenMember} />);
    await userEvent.click(screen.getByRole('tab', { name: /^Dimensions/ }));
    await userEvent.click(screen.getByText('status', { selector: '.model-member__name' }));
    await vi.waitFor(() => {
      expect(onOpenMember).toHaveBeenLastCalledWith('dimensions', 0);
    });

    await userEvent.click(screen.getByRole('tab', { name: /^Measures/ }));
    const count = screen
      .getByText('count', { selector: '.model-member__name' })
      .closest('details') as HTMLDetailsElement;
    expect(count.open).toBe(false);
    expect(onOpenMember).toHaveBeenLastCalledWith('measures', null);
  });
});

describe('a form held read-only', () => {
  const controlsOf = (panel: HTMLElement) => [
    ...panel.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, select, textarea',
    ),
  ];

  it('has every control disabled, on General and on a member, and takes no edit', async () => {
    const onChange = vi.fn();
    render(<CubeForm kind="cube" value={ORDERS} onChange={onChange} readOnly />);

    const general = screen.getByRole('tabpanel');
    expect(controlsOf(general).length).toBeGreaterThan(0);
    expect(controlsOf(general).filter((control) => !control.matches(':disabled'))).toEqual([]);
    await userEvent.type(screen.getByLabelText('Title', { exact: true }), 'O');
    expect(onChange).not.toHaveBeenCalled();

    // The tabs and the members still open, to be read.
    await userEvent.click(screen.getByRole('tab', { name: /^Measures/ }));
    await userEvent.click(screen.getByText('count', { selector: '.model-member__name' }));
    const measures = screen.getByRole('tabpanel');
    expect(controlsOf(measures).length).toBeGreaterThan(0);
    expect(controlsOf(measures).filter((control) => !control.matches(':disabled'))).toEqual([]);
  });

  it('is editable again once it is not read-only', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CubeForm kind="cube" value={ORDERS} onChange={onChange} readOnly />,
    );
    rerender(<CubeForm kind="cube" value={ORDERS} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Title', { exact: true }), 'O');

    expect(onChange).toHaveBeenLastCalledWith({ ...ORDERS, title: 'O' });
  });
});

/** The form with its value held, as the page holds it: each edit shows. */
/** ORDERS without a key. */
const without = (key: string) =>
  Object.fromEntries(Object.entries(ORDERS).filter(([each]) => each !== key));

function Held({
  initial,
  onChange,
}: {
  initial: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <CubeForm
      kind="cube"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('editing a cube’s members', () => {
  it('takes several references typed with commas, where no picker scopes them', async () => {
    // Drill members are picked (AC-224, MemberPicker.test.tsx); a multi-stage
    // measure's `add_group_by` is still typed.
    const staged = { ...ORDERS, measures: [{ name: 'count', type: 'count', multi_stage: true }] };
    const onChange = vi.fn();
    render(<Held initial={staged} onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: /^Measures/ }));
    await userEvent.click(screen.getByText('count', { selector: '.model-member__name' }));

    const added = screen.getByLabelText('Add group by', { exact: true }) as HTMLInputElement;
    await userEvent.type(added, 'status, id');

    expect(added.value).toBe('status, id');
    expect(onChange).toHaveBeenLastCalledWith({
      ...ORDERS,
      measures: [
        { name: 'count', type: 'count', multi_stage: true, add_group_by: ['status', 'id'] },
      ],
    });
  });

  it('adds a member, named so it can be told apart, and removes one', async () => {
    const onChange = vi.fn();
    render(<Held initial={ORDERS} onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: /^Segments/ }));

    await userEvent.click(screen.getByRole('button', { name: 'Add segment' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...ORDERS, segments: [{ name: 'segment_1' }] });
    expect(
      [
        ...screen.getByRole('list', { name: 'Segments' }).querySelectorAll('.model-member__name'),
      ].map((name) => name.textContent),
    ).toEqual(['segment_1']);

    await userEvent.click(screen.getByRole('button', { name: 'Remove segment segment_1' }));
    expect(onChange).toHaveBeenLastCalledWith(ORDERS);
  });

  it('names each list in the plural', async () => {
    render(<CubeForm kind="cube" value={ORDERS} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('tab', { name: /^Access/ }));

    expect(screen.getByRole('list', { name: 'Access policies' }).getAttribute('aria-label')).toBe(
      'Access policies',
    );
  });

  it('says a YAML field does not parse, and keeps what was typed and the value as it was', async () => {
    const onChange = vi.fn();
    render(<Held initial={ORDERS} onChange={onChange} />);

    const meta = screen.getByLabelText('Meta', { exact: true });
    // `[[` types one `[` (user-event reads `[` as a key's name).
    await userEvent.type(meta, 'owner: [[finance');
    await userEvent.tab();

    expect((meta as HTMLTextAreaElement).value).toBe('owner: [finance');
    expect(meta.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toMatch(/^Not YAML yet: /);
    expect(onChange).not.toHaveBeenCalled();
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
