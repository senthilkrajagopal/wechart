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
    // One publish of both, so their join compiles with them (AC-136, AC-137).
    expect(asked.find((each) => each.url === '/api/model/publish')?.body).toEqual({
      files: [
        { path: 'cubes/chrome_stores.yml', content: STORES },
        { path: 'cubes/chrome_visits.yml', content: VISITS },
      ],
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
