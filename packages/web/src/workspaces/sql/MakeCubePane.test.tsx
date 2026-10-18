import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';

import { MakeCubePane } from './MakeCubePane';
import type { SqlSourceRow } from './sources';

/**
 * T820 (AC-462): WHEN the user chooses Make a cube…, THE SYSTEM SHALL open a
 * docked pane headed "Make a cube from this query · in My workspace",
 * holding a suggested cube name in the grammar, checked as AC-422 checks;
 * the folder, among the read-write folders, starting at the data source's
 * own folder where the user may write there and empty otherwise; the run's
 * data source, fixed; the SQL that ran, read-only; and one row per column
 * with include, member name, Dimension or Measure, a Cube type, and one
 * primary key. Add to My workspace SHALL add an unpublished draft cube, with
 * a `count` measure, to the workspace model.
 * Fails when: the draft's SQL differs from what ran; a taken or
 * ungrammatical name is accepted; a numeric column other than the key
 * doesn't start as a `sum` measure, or another column doesn't start as a
 * dimension of the type its database type gives; the folder starts
 * elsewhere than the data source's own writable folder; the draft has no
 * `count` measure; or the cube lands anywhere but My workspace.
 */
const SOURCE: SqlSourceRow = {
  id: 'emea',
  name: 'emea_replica',
  driver: 'postgres',
  cubeStore: false,
  folderId: 'f-sales',
  folderPath: [{ id: 'f-sales', title: 'Sales' }],
  inWorkspace: false,
  runner: 'on',
};
const COLUMNS = [
  { name: 'id', type: 'int4' },
  { name: 'customer', type: 'text' },
  { name: 'total', type: 'numeric' },
  { name: 'ordered_at', type: 'timestamptz' },
];
const SQL = 'SELECT id, customer, total, ordered_at\nFROM orders\nWHERE total > 10';
const TARGETS = [
  { id: 'root', path: [] },
  { id: 'f-sales', path: ['Sales'] },
  { id: 'f-ops', path: ['Ops'] },
];

let posts: { url: string; body: unknown }[] = [];
let answer: { status: number; body: unknown } = { status: 200, body: { version: 'v2' } };
let workspaceFiles: { path: string; content: string }[] = [];
beforeEach(() => {
  posts = [];
  answer = { status: 200, body: { version: 'v2' } };
  workspaceFiles = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const json = (status: number, body: unknown) =>
        Promise.resolve(new Response(JSON.stringify(body), { status }));
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)) as unknown });
        return json(answer.status, answer.body);
      }
      if (url === '/api/folders/targets') return json(200, TARGETS);
      if (url === '/api/model/files?folder=mine') return json(200, { files: workspaceFiles });
      return json(404, {});
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function open(over: Partial<Parameters<typeof MakeCubePane>[0]> = {}) {
  const onAdded = vi.fn();
  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MakeCubePane
        kind="cube"
        source={SOURCE}
        sql={SQL}
        columns={COLUMNS}
        suggested="Top EMEA orders"
        onClose={onClose}
        onAdded={onAdded}
        {...over}
      />
    </QueryClientProvider>,
  );
  return { onAdded, onClose };
}
const pane = () => screen.getByRole('dialog', { name: 'Make a cube from this query · in My workspace' });
const nameField = () => within(pane()).getByRole('textbox', { name: 'Cube name' });
const add = () => within(pane()).getByRole('button', { name: 'Add to My workspace' });
const chosenFolder = () =>
  within(pane()).queryByRole('treeitem', { selected: true })?.textContent ?? null;

describe('the Make a cube pane (T820, AC-462)', () => {
  it('is headed "Make a cube from this query · in My workspace"', async () => {
    open();
    expect(pane()).toBeTruthy();
    expect(within(pane()).getByRole('heading', { level: 2 }).textContent).toBe(
      'Make a cube from this query',
    );
    expect(pane().querySelector('.source-pane__where')?.textContent).toBe('in My workspace');
    await within(pane()).findByRole('tree');
  });

  it('suggests a name in the grammar, from the query’s name', async () => {
    open();
    expect(nameField()).toHaveProperty('value', 'top_emea_orders');
    await within(pane()).findByRole('tree');
  });

  it('refuses a name outside the grammar, and adds nothing', async () => {
    open();
    await within(pane()).findByRole('tree');
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'top orders');

    expect(within(pane()).getByTestId('make-cube-name-error').textContent).toMatch(
      /^“top orders” isn’t a name: start with a letter/,
    );
    expect(add().getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(add());
    expect(posts).toEqual([]);
  });

  it('refuses a name a reserved word takes', async () => {
    open();
    await within(pane()).findByRole('tree');
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'from');
    expect(within(pane()).getByTestId('make-cube-name-error').textContent).toBe(
      '“from” is a reserved word, so a cube or view can’t take it.',
    );
  });

  it('refuses a name My workspace’s model already holds, in any case, before asking', async () => {
    workspaceFiles = [
      { path: 'cubes/orders_draft.yml', content: 'cubes:\n  - name: Top_EMEA_Orders\n    sql_table: public.orders\n' },
    ];
    open();
    await within(pane()).findByRole('tree');
    await vi.waitFor(() => {
      expect(within(pane()).getByTestId('make-cube-name-error').textContent).toBe(
        'The name “top_emea_orders” is already in use.',
      );
    });
    await userEvent.click(add());
    expect(posts).toEqual([]);
  });

  it('shows the API’s refusal of a name landed elsewhere, as AC-422 checks it, and stays open', async () => {
    answer = {
      status: 422,
      body: { errors: [{ path: 'cubes/top_emea_orders.yml', message: 'The name “top_emea_orders” is already in use.' }] },
    };
    const { onAdded } = open();
    await within(pane()).findByRole('tree');
    await userEvent.click(add());

    expect(await within(pane()).findByRole('alert')).toHaveProperty(
      'textContent',
      'The name “top_emea_orders” is already in use, so nothing was saved.',
    );
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('starts the folder at the data source’s own, where the user may write there', async () => {
    open();
    await within(pane()).findByRole('tree');
    expect(chosenFolder()).toBe('Sales');
  });

  it('starts the folder empty where the user may not write the data source’s folder', async () => {
    open({ source: { ...SOURCE, folderId: 'f-ro', folderPath: [{ id: 'f-ro', title: 'Finance' }] } });
    await within(pane()).findByRole('tree');
    expect(chosenFolder()).toBeNull();
    expect(add().getAttribute('aria-disabled')).toBe('true');
  });

  it('starts the folder empty for a data source in My workspace', async () => {
    open({ source: { ...SOURCE, folderId: 'mine', folderPath: [], inWorkspace: true, runner: 'no-switch' } });
    await within(pane()).findByRole('tree');
    expect(chosenFolder()).toBeNull();
  });

  it('shows the data source, fixed, and the SQL that ran, read-only', async () => {
    open();
    await within(pane()).findByRole('tree');
    expect(within(pane()).getByTestId('make-cube-source').textContent).toBe('emea_replica · Shared / Sales');
    expect(within(pane()).queryByRole('combobox', { name: /data source/i })).toBeNull();
    const sql = within(pane()).getByTestId('make-cube-sql');
    expect(sql.textContent).toBe(SQL);
    expect(sql.tagName).toBe('PRE');
  });

  it('starts each column as its type gives it, with one key', async () => {
    open();
    await within(pane()).findByRole('tree');
    const rows = within(pane()).getAllByRole('row').slice(1);
    const read = rows.map((row) => ({
      include: (within(row).getByRole('checkbox') as HTMLInputElement).checked,
      member: (within(row).getByRole('textbox') as HTMLInputElement).value,
      kind: (within(row).getByRole('combobox', { name: /Dimension or measure/ }) as HTMLSelectElement).value,
      type: (within(row).getByRole('combobox', { name: /Cube type/ }) as HTMLSelectElement).value,
      key: (within(row).getByRole('radio') as HTMLInputElement).checked,
    }));
    expect(read).toEqual([
      { include: true, member: 'id', kind: 'dimension', type: 'number', key: true },
      { include: true, member: 'customer', kind: 'dimension', type: 'string', key: false },
      { include: true, member: 'total', kind: 'measure', type: 'sum', key: false },
      { include: true, member: 'ordered_at', kind: 'dimension', type: 'time', key: false },
    ]);
  });

  it('offers Cube’s measure types for a measure, and its dimension types for a dimension', async () => {
    open();
    await within(pane()).findByRole('tree');
    const [, customer, total] = within(pane()).getAllByRole('row').slice(1);
    const options = (row: HTMLElement) =>
      [...(within(row).getByRole('combobox', { name: /Cube type/ }) as HTMLSelectElement).options].map(
        (option) => option.value,
      );
    expect(options(total!)).toEqual(['sum', 'avg', 'min', 'max', 'count_distinct', 'count_distinct_approx']);
    expect(options(customer!)).toEqual(['string', 'number', 'time', 'boolean']);
    // A measure made a dimension takes its database type's.
    await userEvent.selectOptions(within(total!).getByRole('combobox', { name: /Dimension or measure/ }), 'dimension');
    expect((within(total!).getByRole('combobox', { name: /Cube type/ }) as HTMLSelectElement).value).toBe('number');
  });

  it('adds the draft cube to My workspace: the SQL that ran, its source, the columns and count, to the folder chosen', async () => {
    const { onAdded } = open();
    await within(pane()).findByRole('tree');
    await userEvent.click(add());

    expect(posts).toHaveLength(1);
    const { url, body } = posts[0]!;
    expect(url).toBe('/api/model/publish');
    const sent = body as {
      folderId: string;
      files: { path: string; content: string }[];
      create: string[];
      targetFolderId: string;
    };
    expect(sent.folderId).toBe('mine');
    expect(sent.targetFolderId).toBe('f-sales');
    expect(sent.files.map((file) => file.path)).toEqual(['cubes/top_emea_orders.yml']);
    expect(sent.create).toEqual(['cubes/top_emea_orders.yml']);
    expect(parse(sent.files[0]!.content)).toEqual({
      cubes: [
        {
          name: 'top_emea_orders',
          sql: SQL,
          data_source: 'emea_replica',
          dimensions: [
            { name: 'id', sql: '{CUBE}.id', type: 'number', primary_key: true },
            { name: 'customer', sql: '{CUBE}.customer', type: 'string' },
            { name: 'ordered_at', sql: '{CUBE}.ordered_at', type: 'time' },
          ],
          measures: [
            { name: 'count', type: 'count' },
            { name: 'total', sql: '{CUBE}.total', type: 'sum' },
          ],
        },
      ],
    });
    expect(onAdded).toHaveBeenCalledWith({
      kind: 'cube',
      name: 'top_emea_orders',
      path: 'cubes/top_emea_orders.yml',
      targetFolderId: 'f-sales',
    });
  });

  it('leaves out a column not included, and quotes a column the grammar doesn’t take as its database does', async () => {
    open({
      columns: [
        { name: 'id', type: 'int4' },
        { name: 'Total Amount', type: 'numeric' },
        { name: 'note', type: 'text' },
      ],
    });
    await within(pane()).findByRole('tree');
    const note = within(pane()).getAllByRole('row').at(-1)!;
    await userEvent.click(within(note).getByRole('checkbox'));
    await userEvent.click(add());

    const cube = (parse((posts[0]!.body as { files: { content: string }[] }).files[0]!.content) as {
      cubes: { dimensions: { name: string }[]; measures: { name: string; sql?: string }[] }[];
    }).cubes[0]!;
    expect(cube.dimensions.map((each) => each.name)).toEqual(['id']);
    expect(cube.measures).toEqual([
      { name: 'count', type: 'count' },
      { name: 'total_amount', sql: '{CUBE}."Total Amount"', type: 'sum' },
    ]);
  });

  it('makes the chosen key a dimension', async () => {
    open();
    await within(pane()).findByRole('tree');
    const total = within(pane()).getAllByRole('row')[3]!;
    await userEvent.click(within(total).getByRole('radio'));
    expect((within(total).getByRole('combobox', { name: /Dimension or measure/ }) as HTMLSelectElement).value).toBe(
      'dimension',
    );
    expect((within(total).getByRole('combobox', { name: /Cube type/ }) as HTMLSelectElement).value).toBe('number');
  });

  it('refuses two members of one name', async () => {
    open();
    await within(pane()).findByRole('tree');
    const customer = within(pane()).getAllByRole('row')[2]!;
    const member = within(customer).getByRole('textbox');
    await userEvent.clear(member);
    await userEvent.type(member, 'total');
    expect(within(pane()).getByTestId('make-cube-columns-error').textContent).toBe(
      'Two members are named “total”: give each its own name.',
    );
    expect(add().getAttribute('aria-disabled')).toBe('true');
  });

  it('says whoever queries the cube reads it through Cube, and Cancel closes it', async () => {
    const { onClose } = open();
    await within(pane()).findByRole('tree');
    expect(pane().textContent).toContain(
      'Whoever queries this cube reads it through Cube, as the data source’s serving login, with folder permissions and access policies applying. The SQL runner’s caps don’t apply.',
    );
    await userEvent.click(within(pane()).getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});
