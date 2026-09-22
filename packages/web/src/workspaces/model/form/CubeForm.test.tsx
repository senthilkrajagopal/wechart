import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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
        // Under the panel's lock (T141), which holds everything the panel shows.
        `:scope > .model-form__lock > .model-form__fields > [data-key="${field.key}"], :scope > .model-form__lock > .model-form__fields > details > [data-key="${field.key}"]`,
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
    const type = measure.querySelector(
      '.model-member > .model-form__fields > [data-key="type"] select',
    );
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
    await userEvent.click(screen.getByText('customers'));

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
    const type = measure.querySelector(
      '.model-member > .model-form__fields > [data-key="type"] select',
    ) as HTMLSelectElement;
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
      .querySelector('.model-member > .model-form__fields > [data-key="format"] textarea');
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
  it('takes several references typed with commas', async () => {
    const onChange = vi.fn();
    render(<Held initial={ORDERS} onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: /^Measures/ }));
    await userEvent.click(screen.getByText('count', { selector: '.model-member__name' }));

    const drill = screen.getByLabelText('Drill members', { exact: true }) as HTMLInputElement;
    await userEvent.type(drill, 'status, id');

    expect(drill.value).toBe('status, id');
    expect(onChange).toHaveBeenLastCalledWith({
      ...ORDERS,
      measures: [{ name: 'count', type: 'count', drill_members: ['status', 'id'] }],
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
    await userEvent.click(screen.getByRole('tab', { name: /^Access policy/ }));

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
