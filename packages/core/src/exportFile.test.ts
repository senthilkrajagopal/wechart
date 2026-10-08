import { describe, expect, it } from 'vitest';

import {
  exportedBodyOf,
  exportedDataSourceOf,
  exportFileNameOf,
  readExport,
  readExportFile,
} from './exportFile';

/**
 * T511 (AC-354, AC-355): the export file's name, and what of a stored item
 * goes into it.
 */
describe('an export file’s name (T511, AC-354; R46 Q4)', () => {
  it('is the dashboard’s name, in lower case, words joined by hyphens, as .wechart.json', () => {
    expect(exportFileNameOf('Revenue overview')).toBe('revenue-overview.wechart.json');
    expect(exportFileNameOf('  Q3 board pack — EMEA / 2026 ')).toBe(
      'q3-board-pack-emea-2026.wechart.json',
    );
    expect(exportFileNameOf('Côte de Blaye')).toBe('cote-de-blaye.wechart.json');
  });

  it('is still a name when the dashboard’s has no letter or digit', () => {
    expect(exportFileNameOf('—')).toBe('dashboard.wechart.json');
  });
});

describe('what of a stored item goes into the file (T511, AC-355)', () => {
  it('leaves where an item was, and whose, behind', () => {
    expect(
      exportedBodyOf({
        title: 'Revenue',
        folderId: 'sales',
        owner: 'ada',
        targetFolderId: 'emea',
        origin: { id: 'x', version: 2 },
        localToDashboardId: 'd1',
        pages: [],
      }),
    ).toEqual({ title: 'Revenue', pages: [] });
  });

  it('takes a data source’s driver, sign-in method, settings and description, and no secret', () => {
    expect(
      exportedDataSourceOf({
        name: 'sales_dw',
        driver: 'snowflake',
        authMethod: 'key-pair',
        fields: {
          account: 'acme-emea',
          warehouse: 'REPORTING_WH',
          username: 'CUBE_SVC',
          // Not a key Snowflake's settings name: left behind.
          user: 'someone',
          // Never stored, but never carried out either, were one there.
          privateKey: '-----BEGIN PRIVATE KEY-----',
          sealed: 'envelope',
        },
        description: 'Sales warehouse.',
      }),
    ).toEqual({
      kind: 'data-source',
      name: 'sales_dw',
      driver: 'snowflake',
      authMethod: 'key-pair',
      fields: { account: 'acme-emea', warehouse: 'REPORTING_WH', username: 'CUBE_SVC' },
      description: 'Sales warehouse.',
    });
  });
});

/**
 * T512 (AC-359; design 13, states I, J and K): a file this wechart can't
 * read, or holding a kind, chart type or driver it doesn't have, is refused,
 * naming the part and why. Reading changes nothing: it is a function of the
 * text alone, and the import writes only what it reads whole (T513).
 */
const DASHBOARD = {
  kind: 'dashboard',
  id: 'd1',
  title: 'Q3 board pack',
  body: {
    schemaVersion: 1,
    title: 'Q3 board pack',
    pages: [
      {
        id: 'p1',
        items: [
          { id: 't1', kind: 'chart', chartId: 'c1', w: 6, h: 30 },
          { id: 't2', kind: 'chart', chartId: 'c2', w: 6, h: 30 },
        ],
      },
    ],
    charts: ['c1'],
  },
};
const chartBody = (title: string, extra: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  title,
  chart: {
    source: { cube: 'orders' },
    wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
    ...extra,
  },
});
const OWN = {
  kind: 'chart',
  id: 'c1',
  title: 'Order flow',
  dashboardId: 'd1',
  body: chartBody('Order flow', { chartType: 'bar' }),
};
const LIBRARY = { kind: 'chart', id: 'c2', title: 'Top products', body: chartBody('Top products') };
const MODEL = { kind: 'model', path: 'orders.yml', content: 'cubes:\n  - name: orders\n' };
const SOURCE = {
  kind: 'data-source',
  name: 'emea_replica',
  driver: 'postgres',
  authMethod: 'password',
  fields: { host: 'pg-replica-1', port: 5432, database: 'sales', user: 'cube_reader', ssl: true },
  description: 'Read replica.',
};
const fileOf = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  format: 'wechart-export',
  version: 1,
  exportedAt: '2026-09-28T14:00:00.000Z',
  items,
  ...extra,
});
const textOf = (items: unknown[]) => JSON.stringify(fileOf(items), null, 2);

describe('reading an export file (T512, AC-359)', () => {
  it('reads one whose every part this wechart has', () => {
    const read = readExportFile(textOf([DASHBOARD, OWN, LIBRARY, MODEL, SOURCE]));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.file.items.map((item) => item.kind)).toEqual([
      'dashboard',
      'chart',
      'chart',
      'model',
      'data-source',
    ]);
  });

  it('brings a chart from an older wechart up to this one’s format', () => {
    const read = readExport(
      fileOf([
        DASHBOARD,
        {
          ...OWN,
          body: {
            schemaVersion: 1,
            title: 'Order flow',
            chart: {
              source: { cube: 'orders' },
              wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
            },
          },
        },
      ]),
    );
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const upgraded = read.file.items[1];
    expect(upgraded?.kind).toBe('chart');
    if (upgraded?.kind !== 'chart') return;
    expect(upgraded.body['schemaVersion']).toBe(2);
  });

  it('refuses a file that ends part-way through, saying where', () => {
    const text = textOf([DASHBOARD, OWN]);
    const cut = text.slice(0, text.indexOf('"Order flow"'));
    const line = cut.split('\n').length;
    const column = cut.length - cut.lastIndexOf('\n');
    expect(readExportFile(cut)).toEqual({
      ok: false,
      unreadable: `It ends part-way through, at line ${String(line)}, column ${String(column)}.`,
    });
  });

  it('refuses text that isn’t JSON, saying where it stops being JSON', () => {
    expect(readExportFile('{\n  "format": "wechart-export",\n  version: 1\n}')).toEqual({
      ok: false,
      unreadable: 'It isn’t JSON: it stops being JSON at line 3, column 3.',
    });
    expect(readExportFile('')).toEqual({ ok: false, unreadable: 'It’s empty.' });
  });

  it('refuses JSON that isn’t a wechart export, or is from a newer wechart', () => {
    expect(readExport({ items: [] })).toEqual({
      ok: false,
      unreadable: 'It isn’t a wechart export: it doesn’t say it is one.',
    });
    expect(readExport([1, 2])).toEqual({
      ok: false,
      unreadable: 'It isn’t a wechart export: it doesn’t say it is one.',
    });
    expect(readExport(fileOf([DASHBOARD], { version: 2 }))).toEqual({
      ok: false,
      unreadable: 'It was made by a newer wechart, as export version 2; this one reads version 1.',
    });
    expect(readExport(fileOf([DASHBOARD], { items: 'many' }))).toEqual({
      ok: false,
      unreadable: 'It holds no list of items.',
    });
  });

  it('refuses a kind, a chart type or a driver this wechart doesn’t have, naming each part and why', () => {
    const read = readExport(
      fileOf([
        DASHBOARD,
        { ...OWN, body: chartBody('Order flow', { chartType: 'sankey' }) },
        LIBRARY,
        { ...SOURCE, name: 'lakehouse', driver: 'databricks', authMethod: 'token', fields: {} },
        MODEL,
        { kind: 'alert', title: 'Late orders' },
      ]),
    );
    expect(read).toEqual({
      ok: false,
      parts: [
        {
          part: 'Chart “Order flow”, on the dashboard Q3 board pack',
          why: 'Chart type sankey: this wechart has no such chart type.',
        },
        {
          part: 'Data source lakehouse',
          why: 'Driver databricks: this wechart connects with PostgreSQL, Amazon Redshift, MySQL, Snowflake, BigQuery, SQL Server, Oracle and Dremio.',
        },
        {
          part: 'Item 6, “Late orders”',
          why: 'Kind alert: this wechart imports dashboards, charts, models and data sources.',
        },
      ],
    });
  });

  it('refuses a tile meant to become a chart type this wechart doesn’t have', () => {
    const tile = { id: 't9', kind: 'chart', chartType: 'sankey', w: 6, h: 30 };
    const board = {
      ...DASHBOARD,
      body: {
        ...DASHBOARD.body,
        pages: [{ id: 'p1', items: [{ id: 's1', kind: 'section', items: [tile] }] }],
      },
    };
    expect(readExport(fileOf([board]))).toEqual({
      ok: false,
      parts: [
        {
          part: 'Tile t9, on the dashboard Q3 board pack',
          why: 'Chart type sankey: this wechart has no such chart type.',
        },
      ],
    });
  });

  it('reads a dashboard as it opens: none of its pages is an empty one, and a page must list its items', () => {
    const { pages: _pages, ...pageless } = DASHBOARD.body;
    void _pages;
    expect(readExport(fileOf([{ ...DASHBOARD, body: pageless }])).ok).toBe(true);
    expect(
      readExport(fileOf([{ ...DASHBOARD, body: { ...pageless, pages: [{ id: 'p1' }] } }])),
    ).toEqual({
      ok: false,
      parts: [
        {
          part: 'Dashboard “Q3 board pack”',
          why: 'It can’t be read: a page of it has no list of items.',
        },
      ],
    });
    expect(readExport(fileOf([{ ...DASHBOARD, body: { ...pageless, pages: 'all' } }]))).toEqual({
      ok: false,
      parts: [
        { part: 'Dashboard “Q3 board pack”', why: 'It can’t be read: its pages are not a list.' },
      ],
    });
  });

  it('leaves behind where an item was and whose, whatever the file says of it', () => {
    const place = {
      folderId: 'shared',
      owner: 'someone',
      targetFolderId: 'elsewhere',
      origin: { id: 'x' },
      localToDashboardId: 'other',
    };
    const read = readExport(
      fileOf([
        { ...DASHBOARD, body: { ...DASHBOARD.body, ...place } },
        { ...LIBRARY, body: { ...LIBRARY.body, ...place } },
      ]),
    );
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    for (const item of read.file.items)
      if (item.kind === 'dashboard' || item.kind === 'chart')
        for (const key of Object.keys(place)) expect(Object.keys(item.body)).not.toContain(key);
  });

  it('refuses a body nested past reading, rather than failing on it', () => {
    let deep: unknown = [];
    for (let level = 0; level < 100_000; level += 1) deep = [deep];
    const text = JSON.stringify(
      fileOf([{ ...DASHBOARD, body: { ...DASHBOARD.body, pages: [{ id: 'p1', items: deep }] } }]),
    );
    expect(readExportFile(text)).toEqual({
      ok: false,
      parts: [
        {
          part: 'Dashboard “Q3 board pack”',
          why: 'It can’t be read: it nests deeper than 100 levels.',
        },
      ],
    });
    // And text so deep it isn't JSON's to parse is still refused, without a place.
    expect(readExportFile(`${'['.repeat(200_000)}x`)).toEqual({
      ok: false,
      unreadable: 'It isn’t JSON.',
    });
  });

  it('says a whole file followed by more than JSON’s spaces stops being JSON there', () => {
    expect(readExportFile('{"format":"wechart-export"} ')).toEqual({
      ok: false,
      unreadable: 'It isn’t JSON: it stops being JSON at line 1, column 28.',
    });
  });

  it('names each other part it can’t take, and why', () => {
    const read = readExport(
      fileOf([
        DASHBOARD,
        { title: 'Kindless' },
        { kind: 'dashboard', title: 'No body' },
        { kind: 'model', title: 'No path' },
        { ...MODEL, path: '../../etc/passwd' },
        MODEL,
        { ...MODEL, content: 'again' },
        { kind: 'data-source', name: 'half' },
        { ...SOURCE, name: 'Not A Name' },
        { ...SOURCE, name: 'with_key', fields: { ...SOURCE.fields, sslKey: 'PEM' } },
        { ...SOURCE, name: 'unknown_setting', fields: { ...SOURCE.fields, warehouse: 'X' } },
        { ...SOURCE, name: 'odd_value', fields: { ...SOURCE.fields, port: [5432] } },
        { ...SOURCE, name: 'odd_description', description: 7 },
      ]),
    );
    expect(read.ok).toBe(false);
    if (read.ok || !('parts' in read)) return;
    expect(read.parts).toEqual([
      { part: 'The file', why: 'It holds 2 dashboards: an export holds exactly one.' },
      { part: 'Item 2, “Kindless”', why: 'It names no kind.' },
      { part: 'Item 3, “No body”', why: 'A dashboard needs an id, a title and a body.' },
      { part: 'Item 4, “No path”', why: 'A model needs a path and its text.' },
      {
        part: 'Model ../../etc/passwd',
        why: 'Not a model file’s path: folders and a name of letters, digits, “_”, “.” and “-”, ending .yml or .yaml.',
      },
      { part: 'Model orders.yml', why: 'Another model in the file has its path.' },
      {
        part: 'Item 8, “half”',
        why: 'A data source needs a name, a driver, a way to sign in and its settings.',
      },
      {
        part: 'Data source Not A Name',
        // R72's grammar (T703, AC-426).
        why: '“Not A Name” isn’t a name: start with a letter, then use letters, digits and single underscores, not ending in one, at most 40 characters.',
      },
      {
        part: 'Data source with_key',
        why: 'It holds sslKey, which PostgreSQL keeps secret: an export never holds a secret.',
      },
      {
        part: 'Data source unknown_setting',
        why: 'It holds a setting PostgreSQL has no field for: warehouse.',
      },
      {
        part: 'Data source odd_value',
        why: 'Its setting port isn’t text, a number, true or false.',
      },
      { part: 'Data source odd_description', why: 'Its description isn’t text.' },
    ]);
    expect(readExport(fileOf([DASHBOARD], { version: 'one' }))).toEqual({
      ok: false,
      unreadable: 'It names no export version this wechart knows.',
    });
  });

  it('refuses a chart this wechart can’t read, and a data source’s sign-in or setting its driver hasn’t', () => {
    const read = readExport(
      fileOf([
        DASHBOARD,
        { ...OWN, body: { ...chartBody('Order flow'), schemaVersion: 9 } },
        { ...SOURCE, authMethod: 'kerberos' },
        { ...SOURCE, name: 'with_secret', fields: { ...SOURCE.fields, password: 'hunter2' } },
      ]),
    );
    expect(read.ok).toBe(false);
    if (read.ok || !('parts' in read)) return;
    expect(read.parts).toEqual([
      {
        part: 'Chart “Order flow”, on the dashboard Q3 board pack',
        why: 'It can’t be read: The stored chart is version 9, but this wechart understands only up to 2. It was saved by a newer version.',
      },
      {
        part: 'Data source emea_replica',
        why: 'Sign-in kerberos: PostgreSQL signs in with Password or Client certificate.',
      },
      {
        part: 'Data source with_secret',
        why: 'It holds password, which PostgreSQL keeps secret: an export never holds a secret.',
      },
    ]);
  });

  it('refuses a file without exactly one dashboard, or whose parts don’t fit together', () => {
    expect(readExport(fileOf([LIBRARY]))).toEqual({
      ok: false,
      parts: [{ part: 'The file', why: 'It holds no dashboard: an export holds exactly one.' }],
    });
    expect(readExport(fileOf([DASHBOARD, { ...DASHBOARD, id: 'd2' }]))).toEqual({
      ok: false,
      parts: [{ part: 'The file', why: 'It holds 2 dashboards: an export holds exactly one.' }],
    });
    expect(
      readExport(
        fileOf([
          DASHBOARD,
          { ...OWN, dashboardId: 'elsewhere' },
          { ...LIBRARY, id: 'c1' },
          SOURCE,
          // One name in any case (AC-421).
          { ...SOURCE, name: 'EMEA_Replica' },
          { kind: 'chart', title: 'No body' },
          42,
        ]),
      ),
    ).toEqual({
      ok: false,
      parts: [
        {
          part: 'Chart “Order flow”',
          why: 'It is the own chart of a dashboard the file doesn’t hold.',
        },
        { part: 'Chart “Top products”', why: 'Another chart in the file has its id.' },
        { part: 'Data source EMEA_Replica', why: 'Another data source in the file has its name.' },
        { part: 'Item 6, “No body”', why: 'A chart needs an id, a title and a body.' },
        { part: 'Item 7', why: 'It isn’t an item: each item is an object naming its kind.' },
      ],
    });
  });
});
