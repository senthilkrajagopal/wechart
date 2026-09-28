import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GenerateCubes } from './GenerateCubes';

/**
 * T145 / AC-139: WHEN the user generates cubes from a data source, THE SYSTEM
 * SHALL browse that connection's schemas and tables and create a cube per
 * selected table with its columns mapped to dimensions and a count measure.
 * `Fails when: a selected table produces no cube, or a column is dropped
 * without saying so.`
 *
 * Drawn as design 11 (T485, AC-344): a pane in three steps — Source, Tables,
 * Review — its foot Back · Cancel · one primary. The flow alone, against a
 * stub of the API's proxy (T145), whose answers are the fork's, as observed
 * (research/cube/introspection-api.md); the e2e asks the real one.
 */
const STORES = `cubes:\n  - name: chrome_stores\n    sql_table: generate.chrome_stores\n    dimensions:\n      - name: id\n        sql: id\n        type: number\n        primary_key: true\n    measures:\n      - name: count\n        type: count\n`;
const VISITS = `cubes:\n  - name: chrome_visits\n    sql_table: generate.chrome_visits\n    joins:\n      - name: chrome_stores\n        sql: "{CUBE}.store_id = {chrome_stores.id}"\n        relationship: many_to_one\n    measures:\n      - name: count\n        type: count\n`;

function api(scaffolded?: unknown) {
  const asked: { url: string; body?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
      asked.push({ url, ...(body === undefined ? {} : { body }) });
      const json = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), { status });
      if (url === '/api/introspection/sources')
        return json({ dataSources: [{ dataSource: 'default', dbType: 'postgres' }] });
      if (url.startsWith('/api/introspection/sources/default/schemas'))
        return json({ schemas: [{ name: 'generate' }, { name: 'public' }] });
      if (url.startsWith('/api/introspection/sources/default/tables'))
        return json({
          tables: [
            { schema: 'generate', name: 'chrome_stores', type: 'table', rawType: 'BASE TABLE' },
            { schema: 'generate', name: 'chrome_visits', type: 'table', rawType: 'BASE TABLE' },
          ],
          total: 2,
        });
      if (url.endsWith('/columns'))
        return json({
          tables: [
            {
              schema: 'generate',
              name: 'chrome_visits',
              columns: [
                {
                  name: 'id',
                  rawType: 'integer',
                  type: 'number',
                  primaryKey: true,
                  foreignKeys: [],
                },
                {
                  name: 'store_id',
                  rawType: 'integer',
                  type: 'number',
                  primaryKey: false,
                  foreignKeys: [{ schema: 'generate', table: 'chrome_stores', column: 'id' }],
                },
              ],
            },
          ],
        });
      if (url.endsWith('/scaffold') && scaffolded !== undefined) return json(scaffolded);
      if (url.endsWith('/scaffold'))
        // Its two cubes, whichever tables are asked for: the pane shows what comes.
        return json({
          cubes: [
            {
              cube: 'chrome_stores',
              fileName: 'chrome_stores.yml',
              content: STORES,
              table: { schema: 'generate', table: 'chrome_stores' },
              unmappedColumns: [
                { name: 'floor_area', rawType: 'numeric', reason: 'numeric_not_measure' },
              ],
            },
            {
              cube: 'chrome_visits',
              fileName: 'chrome_visits.yml',
              content: VISITS,
              table: { schema: 'generate', table: 'chrome_visits' },
              unmappedColumns: [
                { name: 'store_id', rawType: 'integer', reason: 'numeric_not_measure' },
                {
                  name: '_loaded_at',
                  rawType: 'timestamp with time zone',
                  reason: 'underscore_prefix',
                },
              ],
            },
          ],
        });
      if (url === '/api/model/publish') return json({ version: 'v8' });
      return json({ error: 'unexpected' }, 500);
    }),
  );
  return asked;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The pane with a query cache of its own, which keeps what it holds (T485). */
function withCache(client = new QueryClient()) {
  return {
    client,
    wrap: (children: ReactNode) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

type Props = Partial<Parameters<typeof GenerateCubes>[0]>;
function pane(props: Props = {}, cache = withCache()) {
  const handlers = {
    onClose: vi.fn(),
    onPublished: vi.fn(),
    onOpen: vi.fn(),
    onShow: vi.fn(),
  };
  const all = { existing: [], ...handlers, ...props };
  const view = render(cache.wrap(<GenerateCubes {...all} />));
  return {
    ...handlers,
    ...all,
    cache,
    rerender: (next: Props) => {
      view.rerender(cache.wrap(<GenerateCubes {...all} {...next} />));
    },
    unmount: view.unmount,
    dialog: screen.getByRole('dialog', { name: 'Generate cubes' }),
  };
}

/** The foot's buttons, and which one is the primary (T466, UX-106; design 11 pin 8). */
const foot = (dialog: HTMLElement) =>
  [...dialog.querySelectorAll(':scope > footer button')].map(
    (button) =>
      `${button.textContent ?? ''}${button.classList.contains('btn-primary') ? ' *' : ''}`,
  );

/** Source, then a schema, then Next: the Tables step. */
async function toTables(dialog: HTMLElement, schema = 'generate') {
  await userEvent.click(await within(dialog).findByRole('radio', { name: schema }));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Next: Tables' }));
  return within(dialog).findByRole('table', { name: `Tables in ${schema}` });
}

describe('generating cubes from a data source (AC-139)', () => {
  it('browses to tables, generates a cube for each chosen, says what it left out, and publishes them', async () => {
    const asked = api();
    const { dialog, onPublished } = pane();

    // Step 1: the source, its one data source chosen already, by its driver's name; then the schema.
    const source = await within(dialog).findByRole('radio', { name: 'default PostgreSQL' });
    expect((source as HTMLInputElement).checked).toBe(true);
    expect(foot(dialog)).toEqual(['Cancel', 'Next: Tables › *']);
    expect(dialog.querySelector('.source-pane__foot-note')?.textContent).toBe('Choose a schema');
    const tables = await toTables(dialog);
    expect(within(dialog).getByText('2 tables · none chosen').isConnected).toBe(true);
    // Where the tables come from, with Change back to the source.
    expect(
      dialog.querySelector('.generate-pane__where .source-pane__chosen-text')?.textContent,
    ).toBe('default · PostgreSQL › generate');
    expect(
      within(dialog.querySelector('.generate-pane__where') as HTMLElement).getByRole('button', {
        name: 'Change',
      }).isConnected,
    ).toBe(true);

    // A look at one table's columns, opened in place under its row, captioned.
    const peek = within(tables).getByRole('button', { name: 'Columns of chrome_visits' });
    await userEvent.click(peek);
    expect(peek.getAttribute('aria-expanded')).toBe('true');
    const columns = await within(tables).findByRole('table', { name: 'Columns of chrome_visits' });
    expect(within(columns).getByText('store_id').isConnected).toBe(true);
    expect(within(columns).getByText('→ chrome_stores.id').isConnected).toBe(true);
    expect(tables.querySelector('.generate-pane__caption')?.textContent).toBe(
      'chrome_visits · 2 columns',
    );

    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_stores' }));
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_visits' }));
    expect(within(dialog).getByText('2 tables · 2 chosen').isConnected).toBe(true);
    expect(foot(dialog)).toEqual(['‹ Back', 'Cancel', 'Generate 2 cubes *']);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate 2 cubes' }));

    // Step 3: a cube per table, its YAML, and every column left out with why.
    const stores = await within(dialog).findByRole('region', { name: 'cubes/chrome_stores.yml' });
    // Its YAML drawn once opened (T485's review): as the API gave it, line for line.
    expect(within(stores).queryByRole('textbox')).toBeNull();
    await userEvent.click(within(stores).getByText('YAML', { selector: 'summary' }));
    const yaml = within(stores).getByRole('textbox', {
      name: 'cubes/chrome_stores.yml, as generated',
    });
    expect([...yaml.querySelectorAll('.cm-line')].map((line) => line.textContent).join('\n')).toBe(
      STORES,
    );
    expect(stores.querySelector('.generate-pane__status')?.textContent).toBe('Ready');
    expect(stores.querySelector('.generate-pane__counts')?.textContent).toBe(
      '1 dimension · 1 measure · 1 column left out',
    );
    const leftOut = (region: HTMLElement) =>
      [
        ...within(region).getByRole('list', { name: 'Columns left out' }).querySelectorAll('li'),
      ].map((item) => [
        item.querySelector('.generate-pane__left-name')?.textContent,
        item.querySelector('.generate-pane__raw')?.textContent,
        item.querySelector('.generate-pane__why')?.textContent,
      ]);
    expect(leftOut(stores)).toEqual([
      ['floor_area', 'numeric', 'a number, neither a key nor named like a measure'],
    ]);
    const visits = within(dialog).getByRole('region', { name: 'cubes/chrome_visits.yml' });
    expect(leftOut(visits)).toEqual([
      ['store_id', 'integer', 'a number, neither a key nor named like a measure'],
      ['_loaded_at', 'timestamp with time zone', 'its name starts with an underscore'],
    ]);
    expect(
      within(dialog).getByText('2 cubes ready to publish. Nothing is in the model until you do.')
        .isConnected,
    ).toBe(true);

    // Generated: Publish is the one primary.
    expect(foot(dialog)).toEqual(['‹ Back', 'Cancel', 'Publish 2 cubes *']);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish 2 cubes' }));
    expect((await within(dialog).findByText('Published 2 cubes.')).isConnected).toBe(true);
    // Published: nothing to cancel, and Close the one primary.
    expect(foot(dialog)).toEqual(['‹ Back', 'Close *']);
    expect(onPublished).toHaveBeenCalledWith([
      'cubes/chrome_stores.yml',
      'cubes/chrome_visits.yml',
    ]);
    // One publish of both, so their join compiles with them (AC-136, AC-137);
    // as new files, which the API refuses over any it has (T276, AC-249).
    expect(asked.find((each) => each.url === '/api/model/publish')?.body).toEqual({
      files: [
        { path: 'cubes/chrome_stores.yml', content: STORES },
        { path: 'cubes/chrome_visits.yml', content: VISITS },
      ],
      create: true,
    });
    // Asked of the chosen schema, and of the tables chosen, as YAML by the API.
    expect(asked.map((each) => each.url)).toContain(
      '/api/introspection/sources/default/tables?schema=generate&limit=50&offset=0',
    );
    expect(asked.find((each) => each.url.endsWith('/scaffold'))?.body).toEqual({
      tables: [
        { schema: 'generate', table: 'chrome_stores' },
        { schema: 'generate', table: 'chrome_visits' },
      ],
    });
  });

  /** What Cube's scaffold lost unsaid, as the API finds it (scaffoldCheck.ts), said here. */
  it('says which columns lost their member to another’s, and when a cube has no count', async () => {
    api({
      cubes: [
        {
          cube: 'chrome_visits',
          fileName: 'chrome_visits.yml',
          content: VISITS,
          table: { schema: 'generate', table: 'chrome_visits' },
          unmappedColumns: [{ name: 'Amount', rawType: 'numeric', reason: 'member_name_taken' }],
          countMeasure: false,
        },
      ],
    });
    const { dialog } = pane();
    const tables = await toTables(dialog);
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_visits' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate 1 cube' }));

    const visits = await within(dialog).findByRole('region', { name: 'cubes/chrome_visits.yml' });
    expect(within(visits).getByRole('list', { name: 'Columns left out' }).textContent).toBe(
      'Amount numericits member’s name is another column’s, and Cube kept only one',
    );
    expect(
      within(visits).getByText('No count measure: a column’s measure took its name, count.')
        .isConnected,
    ).toBe(true);
    // A warning to look at: Check, and the block opens by itself.
    expect(visits.querySelector('.generate-pane__status')?.textContent).toBe('Check');
    expect(visits.querySelector('details')?.open).toBe(true);
    expect(
      within(dialog).getByText('1 cube ready to publish; 1 needs a look first.').isConnected,
    ).toBe(true);
  });

  /** T145's review: a key Cube wrote as a time alone, and a file the API could not check. */
  it('says when a key column is no longer the cube’s key, and when a file could not be checked', async () => {
    api({
      cubes: [
        {
          cube: 'chrome_stores',
          fileName: 'chrome_stores.yml',
          content: STORES,
          unmappedColumns: [],
          countMeasure: true,
          unmarkedKeys: ['opened_at'],
        },
        {
          cube: 'chrome_visits',
          fileName: 'chrome_visits.yml',
          content: VISITS,
          unmappedColumns: [],
          unchecked: true,
        },
      ],
    });
    const { dialog } = pane();
    const tables = await toTables(dialog);
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_stores' }));
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_visits' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate 2 cubes' }));

    const stores = await within(dialog).findByRole('region', { name: 'cubes/chrome_stores.yml' });
    expect(
      within(stores).getByText(
        'Not marked as the cube’s primary key: opened_at. A join to this cube needs one.',
      ).isConnected,
    ).toBe(true);
    const visits = within(dialog).getByRole('region', { name: 'cubes/chrome_visits.yml' });
    expect(within(visits).queryByText('Every column is in the cube.')).toBeNull();
    expect(
      within(visits).getByText(
        'wechart could not read this file to check it against its table: only Cube’s list of what it left out is shown.',
      ).isConnected,
    ).toBe(true);
  });

  /** T145's review: the next page, and a type, are asked of the API as chosen. */
  it('asks for the next page, and for a type from the first page', async () => {
    const asked = api();
    const fetchStub = vi.mocked(fetch);
    const answer = fetchStub.getMockImplementation();
    fetchStub.mockImplementation(async (input, init) => {
      if (!String(input).includes('/tables?'))
        return (await answer?.(input, init)) ?? new Response('{}');
      asked.push({ url: String(input) });
      return new Response(JSON.stringify({ tables: [], total: 120 }), { status: 200 });
    });
    const { dialog } = pane();
    await userEvent.click(await within(dialog).findByRole('radio', { name: 'generate' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next: Tables' }));
    expect(
      (await within(dialog).findByText('120 tables · none chosen · 1–50 of 120')).isConnected,
    ).toBe(true);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Next page' }));
    expect(
      (await within(dialog).findByText('120 tables · none chosen · 51–100 of 120')).isConnected,
    ).toBe(true);
    // The Type pill's menu: Views, from the first page again.
    const pill = within(dialog).getByRole('button', { name: /^Type · All/ });
    await userEvent.click(pill);
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Views' }));
    expect(
      (await within(dialog).findByText('120 tables · none chosen · 1–50 of 120')).isConnected,
    ).toBe(true);
    expect(pill.textContent).toBe('Type · Views ▾');

    expect(asked.map((each) => each.url).filter((url) => url.includes('/tables?'))).toEqual([
      '/api/introspection/sources/default/tables?schema=generate&limit=50&offset=0',
      '/api/introspection/sources/default/tables?schema=generate&limit=50&offset=50',
      '/api/introspection/sources/default/tables?schema=generate&type=view&limit=50&offset=0',
    ]);
  });

  /** T145's review: an answer for a table looked at before shows under no other's name. */
  it('shows the columns of the table last looked at, whichever answer comes last', async () => {
    api();
    const fetchStub = vi.mocked(fetch);
    const answer = fetchStub.getMockImplementation();
    const pending = new Map<string, (response: Response) => void>();
    fetchStub.mockImplementation(async (input, init) => {
      if (!String(input).endsWith('/columns'))
        return (await answer?.(input, init)) ?? new Response('{}');
      const table = (JSON.parse(String(init?.body)) as { tables: { table: string }[] }).tables[0]
        ?.table;
      return new Promise<Response>((resolve) => pending.set(table ?? '', resolve));
    });
    const columnsOf = (table: string, column: string) =>
      new Response(
        JSON.stringify({
          tables: [
            {
              schema: 'generate',
              name: table,
              columns: [
                {
                  name: column,
                  rawType: 'text',
                  type: 'string',
                  primaryKey: false,
                  foreignKeys: [],
                },
              ],
            },
          ],
        }),
      );
    const { dialog } = pane();
    const tables = await toTables(dialog);
    await userEvent.click(within(tables).getByRole('button', { name: 'Columns of chrome_stores' }));
    await userEvent.click(within(tables).getByRole('button', { name: 'Columns of chrome_visits' }));
    // One table's columns at a time: the first closed as the second opened.
    expect(
      within(tables)
        .getByRole('button', { name: 'Columns of chrome_stores' })
        .getAttribute('aria-expanded'),
    ).toBe('false');

    pending.get('chrome_visits')?.(columnsOf('chrome_visits', 'visited_at'));
    const columns = await within(dialog).findByRole('table', { name: 'Columns of chrome_visits' });
    expect((await within(columns).findByText('visited_at')).isConnected).toBe(true);
    pending.get('chrome_stores')?.(columnsOf('chrome_stores', 'city'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(within(columns).queryByText('city')).toBeNull();
    expect(within(columns).getByText('visited_at').isConnected).toBe(true);
  });

  /**
   * T276 / AC-249: IF a cube generated from a data source has the name or file
   * name of a cube or file already in the model store, THEN THE SYSTEM SHALL
   * refuse to save it, name the existing cube or file, and leave the existing
   * one unchanged.
   */
  it('marks a generated cube whose name or file the model has, naming it, and publishes nothing', async () => {
    const asked = api();
    const { dialog, onShow } = pane({
      existing: [
        { path: 'cubes/chrome_stores.yml', content: 'cubes:\n  - name: stores\n' },
        { path: 'views/visits.yml', content: 'views:\n  - name: chrome_visits\n' },
      ],
    });
    const tables = await toTables(dialog);
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_stores' }));
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_visits' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate 2 cubes' }));

    const stores = await within(dialog).findByRole('region', { name: 'cubes/chrome_stores.yml' });
    // "In the model": the pane's files are the store's and the unpublished drafts (T276's review).
    const clashOf = (region: HTMLElement) =>
      region.querySelector('.generate-pane__file-body > .generate-pane__note.is-err p')
        ?.textContent;
    expect(clashOf(stores)).toBe('cubes/chrome_stores.yml is already in the model.');
    expect(stores.querySelector('.generate-pane__status')?.textContent).toBe('Clashes');
    const visits = within(dialog).getByRole('region', { name: 'cubes/chrome_visits.yml' });
    expect(clashOf(visits)).toBe('chrome_visits is already a view in views/visits.yml.');
    expect(within(dialog).getByRole('note').textContent).toBe(
      '2 of 2 cubes clash with the model. Nothing is published while a cube clashes.Leave out clashing tables',
    );

    // Publish refused, with its reason beside it.
    const publish = within(dialog).getByRole('button', { name: 'Publish 2 cubes' });
    expect(publish.getAttribute('aria-disabled')).toBe('true');
    expect(dialog.querySelector('.source-pane__foot-note')?.textContent).toBe(
      'Resolve 2 clashes to publish',
    );
    await userEvent.click(publish);
    expect(asked.some((each) => each.url === '/api/model/publish')).toBe(false);

    // Open the file it clashes with, beside the pane.
    await userEvent.click(within(visits).getByRole('button', { name: 'Open views/visits.yml' }));
    expect(onShow).toHaveBeenCalledWith('views/visits.yml');
    // Leave a table out: the rest generated again, without it.
    await userEvent.click(within(stores).getByRole('button', { name: 'Leave this table out' }));
    await vi.waitFor(() => {
      expect(asked.filter((each) => each.url.endsWith('/scaffold')).at(-1)?.body).toEqual({
        tables: [{ schema: 'generate', table: 'chrome_visits' }],
      });
    });
  });

  /** T276's review: once published, the cubes are the model's — not a clash with it. */
  it('marks no clash with the files it has just published itself', async () => {
    api();
    const { dialog, rerender } = pane();
    const tables = await toTables(dialog);
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_stores' }));
    // One table chosen; the stub's scaffold answers with its two cubes all the same.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate 1 cube' }));
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Publish 2 cubes' }));
    expect((await within(dialog).findByText('Published 2 cubes.')).isConnected).toBe(true);

    // The page reads the store again, and hands the pane what it now holds.
    rerender({
      existing: [
        { path: 'cubes/chrome_stores.yml', content: STORES },
        { path: 'cubes/chrome_visits.yml', content: VISITS },
      ],
    });
    expect(dialog.querySelector('.generate-pane__status.is-clash')).toBeNull();
    expect(within(dialog).queryByText(/Nothing is published while a cube clashes/)).toBeNull();
    // Each file to open, closing the pane.
    expect(
      within(dialog).getByRole('list', { name: 'Published files' }).querySelectorAll('li'),
    ).toHaveLength(2);
  });

  /** T485's review: checked against the model as it is now, not as it was when generated. */
  it('clears a clash as soon as the model no longer has it', async () => {
    api();
    const { dialog, rerender } = pane({
      existing: [{ path: 'cubes/chrome_stores.yml', content: 'cubes:\n  - name: stores\n' }],
    });
    const tables = await toTables(dialog);
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_stores' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate 1 cube' }));
    expect(
      (await within(dialog).findByText('1 of 2 cubes clashes with the model.')).isConnected,
    ).toBe(true);
    expect(
      within(dialog).getByRole('button', { name: 'Publish 2 cubes' }).getAttribute('aria-disabled'),
    ).toBe('true');

    // The file is renamed in the editor beside the pane: the page hands over the model as it is.
    rerender({
      existing: [{ path: 'cubes/stores.yml', content: 'cubes:\n  - name: stores\n' }],
    });
    expect(dialog.querySelector('.generate-pane__status.is-clash')).toBeNull();
    expect(
      within(dialog).getByText('2 cubes ready to publish. Nothing is in the model until you do.')
        .isConnected,
    ).toBe(true);
    expect(
      within(dialog).getByRole('button', { name: 'Publish 2 cubes' }).hasAttribute('aria-disabled'),
    ).toBe(false);
    expect(dialog.querySelector('.source-pane__foot-note')).toBeNull();
  });

  /** T485's review: Back, from a round published, starts another at Tables with nothing chosen. */
  it('goes back from a published round to Tables, afresh', async () => {
    api();
    const { dialog } = pane();
    const tables = await toTables(dialog);
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_stores' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate 1 cube' }));
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Publish 2 cubes' }));
    expect((await within(dialog).findByText('Published 2 cubes.')).isConnected).toBe(true);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Back' }));
    const again = await within(dialog).findByRole('table', { name: 'Tables in generate' });
    expect(within(dialog).getByText('2 tables · none chosen').isConnected).toBe(true);
    expect(
      (within(again).getByRole('checkbox', { name: 'chrome_stores' }) as HTMLInputElement).checked,
    ).toBe(false);
    expect(foot(dialog)).toEqual(['‹ Back', 'Cancel', 'Generate cubes *']);
    // The step's first control takes focus as it opens.
    expect(document.activeElement).toBe(
      within(dialog).getByRole('searchbox', { name: 'Search tables' }),
    );
  });

  /** T485's review: Back while generating stops waiting for it; its answer lands nowhere. */
  it('lets Back leave a generation still running, and drops its answer', async () => {
    api();
    const fetchStub = vi.mocked(fetch);
    const answer = fetchStub.getMockImplementation();
    let release: (response: Response) => void = () => undefined;
    fetchStub.mockImplementation(async (input, init) =>
      String(input).endsWith('/scaffold')
        ? new Promise<Response>((resolve) => {
            release = resolve;
          })
        : ((await answer?.(input, init)) ?? new Response('{}')),
    );
    const { dialog } = pane();
    const tables = await toTables(dialog);
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_stores' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate 1 cube' }));
    expect((await within(dialog).findByText('Generating…')).isConnected).toBe(true);
    // Nothing to press yet: the pane's heading holds focus, not the page.
    expect(document.activeElement).toBe(
      within(dialog).getByRole('heading', { level: 2, name: 'Generate cubes' }),
    );

    const back = within(dialog).getByRole('button', { name: 'Back' });
    expect((back as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(back);
    expect(
      (await within(dialog).findByRole('table', { name: 'Tables in generate' })).isConnected,
    ).toBe(true);
    release(
      new Response(
        JSON.stringify({
          cubes: [
            {
              cube: 'chrome_stores',
              fileName: 'chrome_stores.yml',
              content: STORES,
              unmappedColumns: [],
            },
          ],
        }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(within(dialog).queryByRole('region', { name: 'cubes/chrome_stores.yml' })).toBeNull();
    expect(foot(dialog)).toEqual(['‹ Back', 'Cancel', 'Generate 1 cube *']);
  });

  /**
   * T489 / AC-347: a table a cube in the model already reads from, as its
   * `sql_table`, is marked "In model" with that cube, before generating —
   * matched as `schema.table`, unquoted and whatever its case.
   */
  it('marks a table a cube already reads from as in the model, naming the cube', async () => {
    api();
    const { dialog } = pane({
      existing: [
        {
          // Unquoted, whatever its case; quoted, exactly.
          path: 'cubes/stores.yml',
          content: 'cubes:\n  - name: stores\n    sql_table: \'"generate".Chrome_Stores\'\n',
        },
        {
          path: 'cubes/more.yml',
          content:
            'cubes:\n  - name: branches\n    sql_table: " GENERATE . chrome_stores "\n  - name: visits_sql\n    sql: SELECT * FROM generate.chrome_visits\n',
        },
        { path: 'views/v.yml', content: 'views:\n  - name: v\n' },
      ],
    });
    const tables = await toTables(dialog);
    const rowOf = (name: string) =>
      within(tables).getByRole('checkbox', { name }).closest('tr') as HTMLElement;
    const mark = rowOf('chrome_stores').querySelector('.generate-pane__in-model');
    expect(mark?.textContent).toBe('In model · stores, branches');
    // Said with its box, whose name stays the table's.
    expect(
      within(tables)
        .getByRole('checkbox', { name: 'chrome_stores' })
        .getAttribute('aria-describedby'),
    ).toBe(mark?.id);
    // A cube defined by its SQL isn't read for its table: only `sql_table` is.
    expect(rowOf('chrome_visits').querySelector('.generate-pane__in-model')).toBeNull();
  });

  /** T489's review: a cube reads its table in its own data source, not in every one. */
  it('marks a table only for the cubes reading it in the chosen data source', async () => {
    api();
    const { dialog } = pane({
      existing: [
        {
          path: 'cubes/other.yml',
          content:
            'cubes:\n  - name: elsewhere\n    data_source: staging\n    sql_table: generate.chrome_stores\n',
        },
        {
          // Quoted, a name is exact: another table than chrome_visits.
          path: 'cubes/quoted.yml',
          content: 'cubes:\n  - name: upper\n    sql_table: generate."Chrome_Visits"\n',
        },
        {
          // A template's cubes are Cube's to render: not read here.
          path: 'cubes/templated.yml',
          content: 'cubes:\n  - name: t_{{ n }}\n    sql_table: generate.chrome_visits\n',
        },
        {
          path: 'cubes/here.yml',
          content:
            'cubes:\n  - name: here\n    data_source: default\n    sql_table: generate.chrome_visits\n',
        },
      ],
    });
    const tables = await toTables(dialog);
    const rowOf = (name: string) =>
      within(tables).getByRole('checkbox', { name }).closest('tr') as HTMLElement;
    expect(rowOf('chrome_stores').querySelector('.generate-pane__in-model')).toBeNull();
    expect(rowOf('chrome_visits').querySelector('.generate-pane__in-model')?.textContent).toBe(
      'In model · here',
    );
  });

  /**
   * T490 / AC-348: each data source listed with its health as Data sources
   * shows it — icon, words, how long ago — or that it hasn't been tested.
   */
  it('shows each data source’s health beside it, as Data sources does', async () => {
    api();
    const fetchStub = vi.mocked(fetch);
    const answer = fetchStub.getMockImplementation();
    const listed = (name: string, folderId: string, lastTest: unknown) => ({
      id: `${folderId}-${name}`,
      name,
      folderId,
      folderPath: [],
      driver: 'postgres',
      authMethod: 'password',
      updatedAt: '2026-09-27T09:00:00.000Z',
      lastTest,
      usedBy: [],
    });
    fetchStub.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === '/api/introspection/sources')
        return new Response(
          JSON.stringify({
            dataSources: [
              { dataSource: 'default', dbType: 'postgres' },
              { dataSource: 'staging', dbType: 'postgres' },
              { dataSource: 'cube_env', dbType: 'postgres' },
            ],
          }),
        );
      if (url === '/api/data-sources')
        return new Response(
          JSON.stringify([
            // Another folder's `default`, listed first, is not the model's.
            listed('default', 'f1', {
              ok: true,
              ranAt: new Date().toISOString(),
              checks: [],
              current: true,
            }),
            listed('default', 'root', {
              ok: false,
              ranAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
              checks: [{ id: 'connect', status: 'failed' }],
              current: true,
            }),
            listed('staging', 'root', null),
          ]),
        );
      return (await answer?.(input, init)) ?? new Response('{}');
    });
    const { dialog } = pane();
    const source = await within(dialog).findByRole('radio', { name: 'default PostgreSQL' });
    const health = await vi.waitFor(() => {
      const found = document.getElementById(source.getAttribute('aria-describedby') ?? '');
      expect(found?.getAttribute('data-testid')).toBe('source-health');
      return found as HTMLElement;
    });
    expect([health.getAttribute('data-state'), health.textContent]).toEqual([
      'err',
      'Failed at connect · 2 h ago',
    ]);
    const staging = within(dialog).getByRole('radio', { name: 'staging PostgreSQL' });
    expect(
      document.getElementById(staging.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Not tested yet');
    // No record the user can see (Cube's own, or a folder not theirs): nothing said (T490's review).
    const own = within(dialog).getByRole('radio', { name: 'cube_env PostgreSQL' });
    expect(own.hasAttribute('aria-describedby')).toBe(false);
    expect(own.closest('label')?.querySelector('[data-testid="source-health"]')).toBeNull();
  });

  it('says no health when the data sources’ list can’t be read', async () => {
    // The stub answers `/api/data-sources` with a 500.
    api();
    const { dialog } = pane();
    const source = await within(dialog).findByRole('radio', { name: 'default PostgreSQL' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(source.hasAttribute('aria-describedby')).toBe(false);
    expect(dialog.querySelector('[data-testid="source-health"]')).toBeNull();
  });

  /** T491 / AC-349: the header's checkbox chooses or clears the page shown, and only it. */
  it('chooses every table on the page from the list’s header, mixed when some are', async () => {
    const asked = api();
    const fetchStub = vi.mocked(fetch);
    const answer = fetchStub.getMockImplementation();
    // Two pages: the first with chrome_stores and chrome_visits, the second with chrome_zones.
    fetchStub.mockImplementation(async (input, init) => {
      const url = String(input);
      if (!url.includes('/tables?')) return (await answer?.(input, init)) ?? new Response('{}');
      asked.push({ url });
      const second = url.includes('offset=50');
      const table = (name: string) => ({
        schema: 'generate',
        name,
        type: 'table',
        rawType: 'BASE TABLE',
      });
      return new Response(
        JSON.stringify({
          tables: second
            ? [table('chrome_zones')]
            : [table('chrome_stores'), table('chrome_visits')],
          total: 51,
        }),
      );
    });
    const { dialog } = pane();
    const tables = await toTables(dialog);
    const all = within(tables).getByRole('checkbox', { name: 'Choose every table on this page' });
    const box = (name: string) =>
      within(dialog).getByRole('checkbox', { name }) as HTMLInputElement;
    expect((all as HTMLInputElement).checked).toBe(false);
    expect((all as HTMLInputElement).indeterminate).toBe(false);

    // One of the two: mixed.
    await userEvent.click(box('chrome_stores'));
    expect([(all as HTMLInputElement).checked, (all as HTMLInputElement).indeterminate]).toEqual([
      false,
      true,
    ]);
    // Pressed: the page's all chosen, and it is checked.
    await userEvent.click(all);
    expect([box('chrome_stores').checked, box('chrome_visits').checked]).toEqual([true, true]);
    expect([(all as HTMLInputElement).checked, (all as HTMLInputElement).indeterminate]).toEqual([
      true,
      false,
    ]);
    expect(within(dialog).getByText('51 tables · 2 chosen · 1–50 of 51').isConnected).toBe(true);

    // The next page's is its own: none of it chosen.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next page' }));
    await within(dialog).findByRole('checkbox', { name: 'chrome_zones' });
    const next = within(dialog).getByRole('checkbox', {
      name: 'Choose every table on this page',
    }) as HTMLInputElement;
    expect([box('chrome_zones').checked, next.checked]).toEqual([false, false]);
    await userEvent.click(next);
    expect(within(dialog).getByText('51 tables · 3 chosen · 51–51 of 51').isConnected).toBe(true);

    // Back on the first, pressed again: it clears that page only.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Previous page' }));
    await within(dialog).findByRole('checkbox', { name: 'chrome_stores' });
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: 'Choose every table on this page' }),
    );
    expect([box('chrome_stores').checked, box('chrome_visits').checked]).toEqual([false, false]);
    expect(within(dialog).getByText('51 tables · 1 chosen · 1–50 of 51').isConnected).toBe(true);
  });

  /** T485's review: the Type menu closes as a menu does, and never the pane with it. */
  it('closes the Type menu on Escape, from its pill too, and on a press outside it', async () => {
    api();
    const { dialog, onClose } = pane();
    await toTables(dialog);
    const pill = within(dialog).getByRole('button', { name: /^Type · All/ });
    const menu = () => within(dialog).queryByRole('group', { name: 'Types' });

    await userEvent.click(pill);
    expect(pill.getAttribute('aria-controls')).toBe(menu()?.id);
    // Escape in the menu: closed, focus back on its pill.
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Views' }));
    await userEvent.keyboard('{Escape}');
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(pill);
    // Escape on the pill while it is open: the menu closes, the pane stays, nothing asked.
    await userEvent.click(pill);
    expect(document.activeElement).toBe(pill);
    await userEvent.keyboard('{Escape}');
    expect(menu()).toBeNull();
    expect(within(dialog).queryByRole('alertdialog')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    // A press outside it.
    await userEvent.click(pill);
    await userEvent.click(within(dialog).getByRole('searchbox', { name: 'Search tables' }));
    expect(menu()).toBeNull();
    expect(pill.getAttribute('aria-expanded')).toBe('false');
  });

  /** Design 11 state K: a file's YAML soft-wraps, and Wrap turns it off. */
  it('wraps a generated file’s YAML, with Wrap to turn it off', async () => {
    api();
    const { dialog } = pane();
    const tables = await toTables(dialog);
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_stores' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate 1 cube' }));
    const stores = await within(dialog).findByRole('region', { name: 'cubes/chrome_stores.yml' });
    await userEvent.click(within(stores).getByText('YAML', { selector: 'summary' }));
    const wrap = within(stores).getByRole('button', { name: 'Wrap' });
    const content = () => stores.querySelector('.cm-content');
    expect(wrap.getAttribute('aria-pressed')).toBe('true');
    expect(content()?.classList.contains('cm-lineWrapping')).toBe(true);
    await userEvent.click(wrap);
    expect(wrap.getAttribute('aria-pressed')).toBe('false');
    expect(content()?.classList.contains('cm-lineWrapping')).toBe(false);
  });

  /** T276's review: the API's refusal of a clash the pane could not see is shown as it gives it. */
  it('shows the API’s refusal of a clash, naming the file', async () => {
    api();
    const fetchStub = vi.mocked(fetch);
    const answer = fetchStub.getMockImplementation();
    fetchStub.mockImplementation(async (input, init) =>
      String(input) === '/api/model/publish'
        ? new Response(
            JSON.stringify({
              errors: [
                {
                  path: 'cubes/chrome_stores.yml',
                  message: '`chrome_stores` is already a cube in cubes/stores.js.',
                },
              ],
            }),
            { status: 422 },
          )
        : ((await answer?.(input, init)) ?? new Response('{}')),
    );
    const { dialog } = pane();
    const tables = await toTables(dialog);
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_stores' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate 1 cube' }));
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Publish 2 cubes' }));

    // The refusal and what was refused, read out as one alert (T485's review).
    const refused = await within(dialog).findByRole('alert');
    expect(refused.textContent).toBe(
      'Nothing was published. The model is unchanged.‹ Back to TablesRefusedcubes/chrome_stores.yml`chrome_stores` is already a cube in cubes/stores.js.',
    );
    // The API's words as it gives them, backticks and all, by file.
    expect(within(dialog).getByRole('list', { name: 'Refused' }).textContent).toBe(
      'cubes/chrome_stores.yml`chrome_stores` is already a cube in cubes/stores.js.',
    );
  });

  it('says why when a source cannot be browsed, and asks again on Retry', async () => {
    let asks = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        // The data sources Cube browses, asked again; not their health's list (T490).
        if (String(input) === '/api/introspection/sources') asks += 1;
        return new Response(
          JSON.stringify({
            error:
              'Cube did not let wechart browse its data sources: its introspection scope is not granted (infra/cube/cube.js).',
          }),
          { status: 503 },
        );
      }),
    );
    const { dialog } = pane();

    const failed = await within(dialog).findByRole('alert');
    expect(failed.textContent).toBe(
      'The data sources can’t be read.Cube did not let wechart browse its data sources: its introspection scope is not granted (infra/cube/cube.js).Retry',
    );
    await userEvent.click(within(failed).getByRole('button', { name: 'Retry' }));
    await vi.waitFor(() => {
      expect(asks).toBe(2);
    });
  });

  /** Design 11 pin 11, rule 85: leaving with work in it asks first. */
  it('asks before throwing away what is chosen, and closes at once when nothing is', async () => {
    api();
    const first = pane();
    await userEvent.click(within(first.dialog).getByRole('button', { name: 'Cancel' }));
    expect(first.onClose).toHaveBeenCalledTimes(1);
    first.unmount();

    const { dialog, onClose } = pane();
    const tables = await toTables(dialog);
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_stores' }));
    await userEvent.keyboard('{Escape}');
    const question = within(dialog).getByRole('alertdialog', { name: 'Discard this generation?' });
    expect(within(question).getByText('The 1 chosen table is forgotten.').isConnected).toBe(true);
    // On the answer that loses nothing.
    expect(document.activeElement).toBe(
      within(question).getByRole('button', { name: 'Keep editing' }),
    );
    await userEvent.click(within(question).getByRole('button', { name: 'Keep editing' }));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await userEvent.click(
      within(
        within(dialog).getByRole('alertdialog', { name: 'Discard this generation?' }),
      ).getByRole('button', { name: 'Discard' }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /** Design 11 pin 17: the pane keeps what it holds across pages, as the query cache does. */
  it('keeps its step and what is chosen when it is drawn again on another page', async () => {
    api();
    const cache = withCache();
    const first = pane({}, cache);
    const tables = await toTables(first.dialog);
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_visits' }));
    first.unmount();

    const { dialog } = pane({}, cache);
    const again = await within(dialog).findByRole('table', { name: 'Tables in generate' });
    expect(
      (within(again).getByRole('checkbox', { name: 'chrome_visits' }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(foot(dialog)).toEqual(['‹ Back', 'Cancel', 'Generate 1 cube *']);
  });
});
