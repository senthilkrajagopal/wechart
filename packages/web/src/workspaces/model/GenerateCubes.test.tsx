import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GenerateCubes } from './GenerateCubes';

/**
 * T145 / AC-139: WHEN the user generates cubes from a data source, THE SYSTEM
 * SHALL browse that connection's schemas and tables and create a cube per
 * selected table with its columns mapped to dimensions and a count measure.
 * `Fails when: a selected table produces no cube, or a column is dropped
 * without saying so.`
 *
 * The flow alone, against a stub of the API's proxy (T145) — whose answers are
 * the fork's, as observed (research/cube/introspection-api.md); the e2e asks
 * the real one.
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

describe('generating cubes from a data source (AC-139)', () => {
  it('browses to tables, generates a cube for each chosen, says what it left out, and publishes them', async () => {
    const asked = api();
    const onPublished = vi.fn();
    render(<GenerateCubes existing={[]} onClose={vi.fn()} onPublished={onPublished} />);
    const dialog = screen.getByRole('dialog', { name: 'Generate cubes from a data source' });

    // The source, its one data source chosen already; then the schema.
    expect(await within(dialog).findByRole('option', { name: 'default (postgres)' })).toBeTruthy();
    await userEvent.selectOptions(
      await within(dialog).findByRole('combobox', { name: 'Schema' }),
      'generate',
    );
    const tables = await within(dialog).findByRole('table', { name: 'Tables in generate' });
    expect(within(dialog).getByText('2 tables')).toBeTruthy();

    // A look at one table's columns before choosing.
    await userEvent.click(within(tables).getByRole('button', { name: 'Columns of chrome_visits' }));
    const columns = await within(dialog).findByRole('table', { name: 'Columns of chrome_visits' });
    expect(within(columns).getByText('store_id')).toBeTruthy();
    expect(within(columns).getByText('→ chrome_stores.id')).toBeTruthy();

    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_stores' }));
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_visits' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate 2 cubes' }));

    // A cube per table, its YAML, and every column left out with why.
    const stores = await within(dialog).findByRole('region', { name: 'cubes/chrome_stores.yml' });
    expect(within(stores).getByTestId('generated-yaml').textContent).toBe(STORES);
    expect(within(stores).getByRole('list', { name: 'Columns left out' }).textContent).toBe(
      'floor_area (numeric): a number, neither a key nor named like a measure',
    );
    const visits = within(dialog).getByRole('region', { name: 'cubes/chrome_visits.yml' });
    expect(
      [
        ...within(visits).getByRole('list', { name: 'Columns left out' }).querySelectorAll('li'),
      ].map((item) => item.textContent),
    ).toEqual([
      'store_id (integer): a number, neither a key nor named like a measure',
      '_loaded_at (timestamp with time zone): its name starts with an underscore',
    ]);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish 2 cubes' }));
    expect(await within(dialog).findByText('Published 2 cubes.')).toBeTruthy();
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
    render(<GenerateCubes existing={[]} onClose={vi.fn()} onPublished={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Generate cubes from a data source' });
    await userEvent.selectOptions(
      await within(dialog).findByRole('combobox', { name: 'Schema' }),
      'generate',
    );
    const tables = await within(dialog).findByRole('table', { name: 'Tables in generate' });
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_visits' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate 1 cube' }));

    const visits = await within(dialog).findByRole('region', { name: 'cubes/chrome_visits.yml' });
    expect(within(visits).getByRole('list', { name: 'Columns left out' }).textContent).toBe(
      'Amount (numeric): its member’s name is another column’s, and Cube kept only one',
    );
    expect(
      within(visits).getByText('No count measure: a column’s measure took its name, count.'),
    ).toBeTruthy();
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
    render(<GenerateCubes existing={[]} onClose={vi.fn()} onPublished={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Generate cubes from a data source' });
    await userEvent.selectOptions(
      await within(dialog).findByRole('combobox', { name: 'Schema' }),
      'generate',
    );
    const tables = await within(dialog).findByRole('table', { name: 'Tables in generate' });
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_stores' }));
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_visits' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate 2 cubes' }));

    const stores = await within(dialog).findByRole('region', { name: 'cubes/chrome_stores.yml' });
    expect(
      within(stores).getByText(
        'Not marked as the cube’s primary key: opened_at. A join to this cube needs one.',
      ),
    ).toBeTruthy();
    const visits = within(dialog).getByRole('region', { name: 'cubes/chrome_visits.yml' });
    expect(within(visits).queryByText('Every column is in the cube.')).toBeNull();
    expect(
      within(visits).getByText(
        'wechart could not read this file to check it against its table: only Cube’s list of what it left out is shown.',
      ),
    ).toBeTruthy();
  });

  /** T145's review: the Next page, and a type, are asked of the API as chosen. */
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
    render(<GenerateCubes existing={[]} onClose={vi.fn()} onPublished={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Generate cubes from a data source' });
    await userEvent.selectOptions(
      await within(dialog).findByRole('combobox', { name: 'Schema' }),
      'generate',
    );
    expect(await within(dialog).findByText('120 tables · showing 1–50')).toBeTruthy();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(await within(dialog).findByText('120 tables · showing 51–100')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Views' }));
    expect(await within(dialog).findByText('120 tables · showing 1–50')).toBeTruthy();

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
    render(<GenerateCubes existing={[]} onClose={vi.fn()} onPublished={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Generate cubes from a data source' });
    await userEvent.selectOptions(
      await within(dialog).findByRole('combobox', { name: 'Schema' }),
      'generate',
    );
    const tables = await within(dialog).findByRole('table', { name: 'Tables in generate' });
    await userEvent.click(within(tables).getByRole('button', { name: 'Columns of chrome_stores' }));
    await userEvent.click(within(tables).getByRole('button', { name: 'Columns of chrome_visits' }));

    pending.get('chrome_visits')?.(columnsOf('chrome_visits', 'visited_at'));
    const columns = await within(dialog).findByRole('table', { name: 'Columns of chrome_visits' });
    expect(await within(columns).findByText('visited_at')).toBeTruthy();
    pending.get('chrome_stores')?.(columnsOf('chrome_stores', 'city'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(within(columns).queryByText('city')).toBeNull();
    expect(within(columns).getByText('visited_at')).toBeTruthy();
  });

  /**
   * T276 / AC-249: IF a cube generated from a data source has the name or file
   * name of a cube or file already in the model store, THEN THE SYSTEM SHALL
   * refuse to save it, name the existing cube or file, and leave the existing
   * one unchanged.
   */
  it('marks a generated cube whose name or file the model has, naming it, and publishes nothing', async () => {
    const asked = api();
    render(
      <GenerateCubes
        existing={[
          { path: 'cubes/chrome_stores.yml', content: 'cubes:\n  - name: stores\n' },
          { path: 'views/visits.yml', content: 'views:\n  - name: chrome_visits\n' },
        ]}
        onClose={vi.fn()}
        onPublished={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Generate cubes from a data source' });
    await userEvent.selectOptions(
      await within(dialog).findByRole('combobox', { name: 'Schema' }),
      'generate',
    );
    const tables = await within(dialog).findByRole('table', { name: 'Tables in generate' });
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_stores' }));
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_visits' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate 2 cubes' }));

    const stores = await within(dialog).findByRole('region', { name: 'cubes/chrome_stores.yml' });
    // "In the model": the dialog's files are the store's and the unpublished drafts (T276's review).
    expect(within(stores).getByRole('list', { name: 'Clashes with the model' }).textContent).toBe(
      'cubes/chrome_stores.yml is already in the model.',
    );
    const visits = within(dialog).getByRole('region', { name: 'cubes/chrome_visits.yml' });
    expect(within(visits).getByRole('list', { name: 'Clashes with the model' }).textContent).toBe(
      '`chrome_visits` is already a view in views/visits.yml.',
    );
    const publish = within(dialog).getByRole('button', { name: 'Publish 2 cubes' });
    expect(publish.getAttribute('aria-disabled')).toBe('true');
    expect(
      within(dialog).getByText(
        'Nothing is published while a cube clashes with the model: leave its table out and generate again.',
      ),
    ).toBeTruthy();
    await userEvent.click(publish);
    expect(asked.some((each) => each.url === '/api/model/publish')).toBe(false);
  });

  /** T276's review: once published, the cubes are the model's — not a clash with it. */
  it('marks no clash with the files it has just published itself', async () => {
    api();
    const props = { onClose: vi.fn(), onPublished: vi.fn() };
    const { rerender } = render(<GenerateCubes existing={[]} {...props} />);
    const dialog = screen.getByRole('dialog', { name: 'Generate cubes from a data source' });
    await userEvent.selectOptions(
      await within(dialog).findByRole('combobox', { name: 'Schema' }),
      'generate',
    );
    const tables = await within(dialog).findByRole('table', { name: 'Tables in generate' });
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_stores' }));
    // One table chosen; the stub's scaffold answers with its two cubes all the same.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate 1 cube' }));
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Publish 2 cubes' }));
    expect(await within(dialog).findByText('Published 2 cubes.')).toBeTruthy();

    // The page reads the store again, and hands the dialog what it now holds.
    rerender(
      <GenerateCubes
        existing={[
          { path: 'cubes/chrome_stores.yml', content: STORES },
          { path: 'cubes/chrome_visits.yml', content: VISITS },
        ]}
        {...props}
      />,
    );
    expect(within(dialog).queryByRole('list', { name: 'Clashes with the model' })).toBeNull();
    expect(within(dialog).queryByText(/Nothing is published while a cube clashes/)).toBeNull();
  });

  /** T276's review: the API's refusal of a clash the dialog could not see is shown as it gives it. */
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
    render(<GenerateCubes existing={[]} onClose={vi.fn()} onPublished={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Generate cubes from a data source' });
    await userEvent.selectOptions(
      await within(dialog).findByRole('combobox', { name: 'Schema' }),
      'generate',
    );
    const tables = await within(dialog).findByRole('table', { name: 'Tables in generate' });
    await userEvent.click(within(tables).getByRole('checkbox', { name: 'chrome_stores' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Generate 1 cube' }));
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Publish 2 cubes' }));

    const refused = await within(dialog).findByRole('alert');
    expect(refused.textContent).toBe(
      'Nothing was published:cubes/chrome_stores.yml: `chrome_stores` is already a cube in cubes/stores.js.',
    );
  });

  it('says why when a source cannot be browsed, rather than list nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error:
                'Cube did not let wechart browse its data sources: its introspection scope is not granted (infra/cube/cube.js).',
            }),
            { status: 503 },
          ),
      ),
    );
    render(<GenerateCubes existing={[]} onClose={vi.fn()} onPublished={vi.fn()} />);

    expect(
      await screen.findByText(
        'Cube did not let wechart browse its data sources: its introspection scope is not granted (infra/cube/cube.js).',
      ),
    ).toBeTruthy();
  });
});
