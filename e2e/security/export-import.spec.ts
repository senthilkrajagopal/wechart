import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import type { APIRequestContext, APIResponse, Page } from '@playwright/test';
import { sealSecretV1, type SealedV1, type XcubeKey } from '@wechart/core';

import { landed } from '../model-files';
import { BASE_URL, expect, signInThroughDex, test, testedSource } from './fixtures';
import { changeShared, changeSharedSource } from './shared-change';

/**
 * F38: exporting a dashboard, and importing the file (T511 …).
 *
 * T511 (AC-354, AC-355, AC-360; design 13, screen 1): from the ⋯ in the
 * dashboard's header, and from its row's ⋯ in Explore, the Export pane lists
 * what goes with the dashboard, outlines the tiles a dependency is used on
 * while it is hovered over or focused, and downloads one JSON file,
 * `revenue-overview.wechart.json`, with no secret in it.
 *
 * `super` makes, through the API:
 *   /Sales <run>   (`sales-rw` writes it, `sales-ro` reads it)
 *     data source <run>_emea, the model cubes/<run>_sales.yml bound to it,
 *     the library chart "Top products", and the dashboard "Revenue overview"
 *     with its own charts "Revenue" and "Orders", and Top products and
 *     Margin trend on it
 *   /Hidden <run>  (`managers` alone)
 *     data source <run>_hid, the model cubes/<run>_margin.yml bound to it,
 *     and the library chart "Margin trend"
 *
 * Margin trend sits beside /Sales, off its path, so the API no longer puts it
 * on Revenue overview: it would make the dashboard its own copy, which binds
 * on /Sales's path, where no `<run>_margin` is (T527, AC-371). A dashboard
 * saved before copy on use may still show such a chart, and export must
 * still count what it can't offer (AC-354). So that tile is written into the
 * suite's database as such a save left it (T538).
 */
const RUN = `x${Math.random().toString(36).slice(2, 7)}`;
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
const FIELDS = { host: 'sample-db', port: 5432, database: 'sample', user: 'sample', ssl: false };
const TITLE = 'Revenue overview';
const FILE = 'revenue-overview.wechart.json';
const names = {
  sales: `${RUN}_sales`,
  margin: `${RUN}_margin`,
  emea: `${RUN}_emea`,
  hid: `${RUN}_hid`,
};
const modelPath = (name: string) => `cubes/${name}.yml`;
const ids = {
  sales: '',
  hidden: '',
  board: '',
  revenue: '',
  orders: '',
  top: '',
  margin: '',
};
const sources: string[] = [];
const published: { folderId: string; name: string }[] = [];
const envelopes: SealedV1[] = [];
/** The file the export downloaded, which the import then takes (T513). */
const exported = { text: '' };
/** What the imports made in writer's workspace, removed after. */
const drafts: { kind: string; id: string }[] = [];
/** The model files an import landed in writer's workspace root, removed after (T733). */
const importedModels: string[] = [];

const cubeYaml = (name: string, dataSource: string) =>
  [
    'cubes:',
    `  - name: ${name}`,
    "    sql: SELECT 1 AS n, 'EMEA' AS region",
    `    data_source: ${dataSource}`,
    '    measures:',
    '      - name: count',
    '        type: count',
    '    dimensions:',
    '      - name: region',
    '        sql: region',
    '        type: string',
    '',
  ].join('\n');

async function made(answer: APIResponse): Promise<string> {
  expect(answer.status(), await answer.text()).toBe(201);
  return ((await answer.json()) as { id: string }).id;
}

async function folder(request: APIRequestContext, title: string, access: object) {
  const id = await made(
    await request.post('/api/documents', { data: { kind: 'folder', title, folderId: 'root' } }),
  );
  expect((await request.put(`/api/folders/${id}/access`, { data: access })).status()).toBe(200);
  return id;
}

async function dataSource(request: APIRequestContext, folderId: string, name: string) {
  const envelope = await sealSecretV1(KEY, 'postgres', 'password', FIELDS, 'sample');
  envelopes.push(envelope);
  const id = await made(
    await request.post('/api/data-sources', {
      data: await testedSource(request, {
        folderId,
        name,
        driver: 'postgres',
        authMethod: 'password',
        fields: FIELDS,
        sealed: { password: envelope },
      }),
    }),
  );
  sources.push(id);
  // What it is for, which goes with it (AC-355): given as a shared one's
  // settings are, by approving a copy (T502, AC-278).
  await changeSharedSource(request, id, async () => ({
    description: `Sample rows for ${name}.`,
  }));
  const described = (await (await request.get(`/api/data-sources/${id}`)).json()) as {
    description: string | null;
  };
  expect(described.description).toBe(`Sample rows for ${name}.`);
  return id;
}

/** Through My workspace and a proposal its author approves (T451, AC-278). */
async function publish(request: APIRequestContext, folderId: string, name: string, source: string) {
  published.push({ folderId, name });
  const file = { path: modelPath(name), content: cubeYaml(name, source) };
  expect(await landed(request, folderId, [file])).toEqual([file]);
}

/** A chart's definition, on `cube`. */
const definitionOf = (cube: string) => ({
  source: { cube },
  wells: { measures: [`${cube}.count`], dimensions: [`${cube}.region`], timeDimensions: [] },
  chartType: 'bar',
});

/**
 * A library chart, made in its folder and then given its definition, as a
 * shared one's is given: by approving a copy (T502, AC-278).
 */
async function chart(request: APIRequestContext, title: string, folderId: string, cube: string) {
  const id = await made(
    await request.post('/api/documents', { data: { kind: 'chart', title, folderId } }),
  );
  const landed = await changeShared(request, 'chart', id, (body) => ({
    ...body,
    chart: definitionOf(cube),
  }));
  expect(landed).toEqual([{ kind: 'chart', id, version: 2 }]);
  return id;
}

/**
 * A tile added to a stored dashboard as a save before copy on use left it
 * (T538): in the suite's own database, at the version it has, through psql
 * in compose's metadata Postgres. Values go in as psql variables, never
 * spliced into the SQL.
 */
function addTileAsBeforeCopyOnUse(dashboardId: string, tile: Record<string, unknown>) {
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'wechart-meta',
      'psql',
      '-U',
      'wechart',
      '-d',
      'wechart_security',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      `id=${dashboardId}`,
      '-v',
      `tile=${JSON.stringify(tile)}`,
    ],
    {
      input: `UPDATE documents
        SET body = jsonb_set(body, '{pages,0,items}', (body #> '{pages,0,items}') || jsonb_build_array(:'tile'::jsonb))
        WHERE kind = 'dashboard' AND id = :'id';`,
      stdio: ['pipe', 'ignore', 'inherit'],
    },
  );
}

async function setUp(request: APIRequestContext) {
  ids.sales = await folder(request, `Sales ${RUN}`, {
    readOnly: ['sales-ro'],
    readWrite: ['sales-rw'],
  });
  ids.hidden = await folder(request, `Hidden ${RUN}`, { readOnly: [], readWrite: ['managers'] });
  await dataSource(request, ids.sales, names.emea);
  await dataSource(request, ids.hidden, names.hid);
  await publish(request, ids.sales, names.sales, names.emea);
  await publish(request, ids.hidden, names.margin, names.hid);

  ids.board = await made(
    await request.post('/api/documents', {
      data: { kind: 'dashboard', title: TITLE, folderId: ids.sales },
    }),
  );
  ids.top = await chart(request, 'Top products', ids.sales, names.sales);
  ids.margin = await chart(request, 'Margin trend', ids.hidden, names.margin);
  const tile = (id: string, chartId: string) => ({ id, kind: 'chart', chartId, w: 6, h: 30 });
  // Its two own charts made on its copy, and its tiles, landed by an approval (T502).
  const landed = await changeShared(
    request,
    'dashboard',
    ids.board,
    (body, [revenue, orders]) => ({
      ...body,
      pages: [
        {
          id: 'overview',
          title: 'Overview',
          items: [tile('t-revenue', revenue!), tile('t-orders', orders!), tile('t-top', ids.top)],
        },
      ],
      charts: [revenue, orders],
    }),
    {
      ownCharts: ['Revenue', 'Orders'].map((title) => ({
        body: { schemaVersion: 1, title, chart: definitionOf(names.sales) },
      })),
    },
  );
  expect(landed.map((each) => [each.kind, each.version])).toEqual([
    ['chart', 1],
    ['chart', 1],
    ['dashboard', 2],
  ]);
  // Its own charts' ids as they landed, by title.
  for (const { kind, id } of landed.filter((each) => each.kind === 'chart')) {
    const { body } = (await (await request.get(`/api/documents/${kind}/${id}`)).json()) as {
      body: { title: string };
    };
    if (body.title === 'Revenue') ids.revenue = id;
    if (body.title === 'Orders') ids.orders = id;
  }
  expect([ids.revenue, ids.orders]).not.toContain('');
  // Margin trend, off /Sales's path, as a save before copy on use left it (T538).
  addTileAsBeforeCopyOnUse(ids.board, tile('t-margin', ids.margin));
  const read = await request.get(`/api/documents/dashboard/${ids.board}`);
  expect(read.status(), await read.text()).toBe(200);
  const shown = (await read.json()) as {
    body: { pages: { items: { chartId?: string }[] }[] };
  };
  expect(shown.body.pages[0]!.items.map((item) => item.chartId)).toContain(ids.margin);
}

/** The Export pane, opened from the ⋯ in the dashboard's header. */
async function exportPane(page: Page) {
  await page.goto(`/explore/dashboards/${ids.board}`);
  await expect(page.locator('[data-tile]')).toHaveCount(4);
  await page.getByTestId('dashboard-more').click();
  await page.getByRole('menuitem', { name: 'Export…' }).click();
  return page.getByRole('dialog', { name: 'Export dashboard' });
}
/** My workspace, open in Explore. */
async function myWorkspace(page: Page) {
  await page.goto('/explore');
  await page
    .getByRole('tree')
    .getByRole('treeitem', { name: 'My workspace', exact: true })
    .getByRole('button')
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'My workspace', level: 1 })).toBeVisible();
}

/** Sales's items as its members see them, each at when it was last saved. */
async function folderItems(page: Page) {
  const answer = await page.request.get(`/api/folders/${ids.sales}/contents`);
  expect(answer.status()).toBe(200);
  return ((await answer.json()) as { kind: string; id: string; updatedAt: string }[])
    .map((item) => `${item.kind}:${item.id}:${item.updatedAt}`)
    .sort();
}

/** What the signed-in user's workspace holds now, by id: the drafts made next are those it lacks. */
async function workspaceIds(page: Page) {
  const answer = await page.request.get('/api/folders/mine/contents');
  expect(answer.status()).toBe(200);
  return ((await answer.json()) as { id: string }[]).map((item) => item.id);
}

/** A dependency's row in the pane, by its box's name. */
const rowOf = (pane: ReturnType<Page['getByRole']>, name: string) =>
  pane
    .locator('li.export-row')
    .filter({ has: pane.page().getByRole('checkbox', { name, exact: true }) });

test.describe.configure({ mode: 'serial' });

test.describe('exporting a dashboard (T511, AC-354, AC-355, AC-360)', () => {
  test.afterAll(async ({ browser }) => {
    const removed = async (what: string, answer: Promise<APIResponse>) => {
      const response = await answer;
      if (![200, 204, 404].includes(response.status()))
        console.warn(`${what}: ${String(response.status())} ${await response.text()}`);
    };
    // writer's imported drafts first: the dashboards' own charts, the library
    // charts, then the dashboards, so no chart is left using the models.
    const writer = await browser.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    await signInThroughDex(await writer.newPage(), 'writer');
    for (const { kind, id } of drafts.filter((each) => each.kind === 'dashboard')) {
      const board = await writer.request.get(`/api/documents/${kind}/${id}`);
      if (board.status() !== 200) continue;
      const shown = JSON.stringify((await board.json()) as unknown).match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
      );
      for (const chartId of new Set(shown ?? [])) {
        const chart = await writer.request.get(`/api/documents/chart/${chartId}`);
        if (chart.status() !== 200) continue;
        const body = ((await chart.json()) as { body: Record<string, unknown> }).body;
        if (body['localToDashboardId'] === id)
          await removed(
            `chart ${chartId}`,
            writer.request.delete(`/api/documents/chart/${chartId}`),
          );
      }
    }
    for (const path of importedModels)
      await removed(
        path,
        writer.request.delete(`/api/model/files?folder=mine&path=${encodeURIComponent(path)}`, {
          timeout: 90_000,
        }),
      );
    for (const { kind, id } of [...drafts].sort((a) => (a.kind === 'chart' ? -1 : 1)))
      await removed(
        `${kind} ${id}`,
        kind === 'data-source'
          ? writer.request.delete(`/api/data-sources/${id}`)
          : // Drafts in a workspace hold no chart back (T517, AC-362).
            writer.request.delete(`/api/documents/${kind}/${id}`),
      );
    await writer.close();

    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    await signInThroughDex(await context.newPage(), 'super');
    const request = context.request;
    // The dashboard, then the charts it showed, which a shared dashboard
    // keeps from being deleted (T517, AC-362), then what they used.
    if (ids.board !== '')
      await removed('dashboard', request.delete(`/api/documents/dashboard/${ids.board}`));
    for (const id of [ids.revenue, ids.orders, ids.top, ids.margin].filter((each) => each !== ''))
      await removed(`chart ${id}`, request.delete(`/api/documents/chart/${id}`));
    for (const { folderId, name } of [...published].reverse())
      await removed(
        modelPath(name),
        request.delete(
          `/api/model/files?folder=${folderId}&path=${encodeURIComponent(modelPath(name))}`,
        ),
      );
    for (const id of sources) await removed(id, request.delete(`/api/data-sources/${id}`));
    for (const id of [ids.sales, ids.hidden].filter((each) => each !== ''))
      await removed(`folder ${id}`, request.delete(`/api/documents/folder/${id}`));
    await context.close();
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes the folders, data sources, models, charts and dashboard', async ({ page }) => {
      await setUp(page.request);
    });
  });

  test.describe('as writer, a read-write member of Sales', () => {
    test.use({ role: 'writer' });

    test('lists what goes with it from the header’s ⋯, every dependency ticked, and counts what it can’t see', async ({
      page,
    }) => {
      const pane = await exportPane(page);
      await expect(pane.getByText(`Sales ${RUN} · version 2, as the folder has it`)).toBeVisible();
      await expect(
        pane.getByRole('list', { name: 'Always in the file' }).getByRole('listitem'),
      ).toHaveText([
        'Revenue overviewthe dashboard, as saved',
        '2 own chartsmade on this dashboard',
      ]);

      const library = pane.getByRole('group', { name: 'Library charts it shows' });
      await expect(library.getByRole('checkbox', { name: 'Top products' })).toBeChecked();
      await expect(rowOf(pane, 'Top products')).toContainText(`Sales ${RUN}`);
      await expect(rowOf(pane, 'Margin trend')).toContainText('folder not shown');

      const model = rowOf(pane, modelPath(names.sales));
      await expect(model.getByRole('checkbox')).toBeChecked();
      await expect(model).toContainText('Used by 3 charts');
      const source = rowOf(pane, names.emea);
      await expect(source).toContainText('Settings only · no secrets');
      await expect(source).toContainText(
        `PostgreSQL in Sales ${RUN} · bound by ${modelPath(names.sales)}`,
      );
      await expect(pane.getByTestId('export-not-offered')).toHaveText(
        'Not offered: 1 model and 1 data source that Margin trend uses, in a folder you can’t see.',
      );
      // Named nowhere: the hidden folder, its model and its data source.
      for (const hidden of [`Hidden ${RUN}`, names.margin, names.hid])
        await expect(pane).not.toContainText(hidden);
    });

    test('outlines the tiles a dependency is used on while it is hovered over or focused (AC-360)', async ({
      page,
    }) => {
      const pane = await exportPane(page);
      const outlined = page.locator('[data-tile][data-outlined="true"]');
      await rowOf(pane, modelPath(names.sales)).hover();
      await expect(outlined).toHaveCount(3);
      await expect(page.locator('[data-tile="t-margin"]')).not.toHaveAttribute(
        'data-outlined',
        'true',
      );
      await expect(page.locator('[data-tile="t-top"] .grid-tile__outline')).toHaveText(
        modelPath(names.sales),
      );
      await page.getByRole('heading', { name: 'Export dashboard' }).hover();
      await expect(outlined).toHaveCount(0);

      await pane.getByRole('checkbox', { name: 'Margin trend' }).focus();
      await expect(outlined).toHaveCount(1);
      await expect(page.locator('[data-tile="t-margin"]')).toHaveAttribute('data-outlined', 'true');
      await pane.getByLabel('File name').focus();
      await expect(outlined).toHaveCount(0);
    });

    test(`downloads ${FILE}: JSON, holding the dashboard, its charts and what was chosen, and no secret (AC-354, AC-355)`, async ({
      page,
    }) => {
      const pane = await exportPane(page);
      await expect(pane.getByLabel('File name')).toHaveValue(FILE);
      await expect(pane.getByTestId('export-counts')).toHaveText(
        'In the file: 1 dashboard · 4 charts · 1 model · 1 data source',
      );
      const downloading = page.waitForEvent('download');
      await pane.getByRole('button', { name: 'Export file' }).click();
      const download = await downloading;
      expect(download.suggestedFilename()).toBe(FILE);
      const text = readFileSync(await download.path(), 'utf8');
      // Kept for the import that follows (T513).
      exported.text = text;
      const file = JSON.parse(text) as {
        format: string;
        items: {
          kind: string;
          id?: string;
          title?: string;
          path?: string;
          name?: string;
          [key: string]: unknown;
        }[];
      };
      expect(file.format).toBe('wechart-export');
      expect(file.items.find((item) => item.kind === 'dashboard')?.title).toBe(TITLE);
      expect(
        file.items
          .filter((item) => item.kind === 'chart')
          .map((item) => item.title)
          .sort(),
      ).toEqual(['Margin trend', 'Orders', 'Revenue', 'Top products']);
      expect(file.items.filter((item) => item.kind === 'model').map((item) => item.path)).toEqual([
        modelPath(names.sales),
      ]);
      const source = file.items.find((item) => item.kind === 'data-source');
      expect(source).toEqual({
        kind: 'data-source',
        name: names.emea,
        driver: 'postgres',
        authMethod: 'password',
        fields: FIELDS,
        description: `Sample rows for ${names.emea}.`,
      });
      // No envelope, nor any part of one; neither the hidden folder's model nor
      // its data source (Margin trend's own body names its cube, as it may).
      for (const envelope of envelopes) {
        expect(text).not.toContain(envelope.ct);
        expect(text).not.toContain(envelope.enc);
      }
      for (const hidden of [modelPath(names.margin), names.hid, `Hidden ${RUN}`])
        expect(text).not.toContain(hidden);

      // The pane closes, focus goes back to the ⋯, and a toast says what went (state E).
      await expect(pane).toHaveCount(0);
      await expect(page.getByTestId('dashboard-more')).toBeFocused();
      await expect(page.getByRole('status').filter({ hasText: `Exported ${FILE}` })).toHaveText(
        `Exported ${FILE}: 1 dashboard, 4 charts, 1 model and 1 data source, without their secrets.`,
      );
    });

    test('exports only what stays ticked, from the dashboard’s row in Explore', async ({
      page,
    }) => {
      await page.goto(`/explore?folder=${ids.sales}`);
      await page
        .getByTestId(`item-${ids.board}`)
        .getByRole('button', { name: `Actions for ${TITLE}` })
        .click();
      await page.getByRole('menuitem', { name: 'Export…' }).click();
      const pane = page.getByRole('dialog', { name: 'Export dashboard' });
      await pane.getByRole('button', { name: 'None' }).click();
      await expect(pane.getByTestId('export-counts')).toHaveText(
        'In the file: 1 dashboard · 2 charts',
      );
      const downloading = page.waitForEvent('download');
      await pane.getByRole('button', { name: 'Export file' }).click();
      const file = JSON.parse(readFileSync(await (await downloading).path(), 'utf8')) as {
        items: { kind: string; title?: string }[];
      };
      expect(file.items.map((item) => item.kind).sort()).toEqual(['chart', 'chart', 'dashboard']);
      expect(
        file.items
          .filter((item) => item.kind === 'chart')
          .map((item) => item.title)
          .sort(),
      ).toEqual(['Orders', 'Revenue']);
    });

    test('imports the file from My workspace’s New, warns of what the drafts may affect, and lands them as new drafts (T513, AC-356, AC-357)', async ({
      page,
    }) => {
      expect(exported.text).not.toBe('');
      const salesBefore = await folderItems(page);
      await myWorkspace(page);
      // Its items' rows: an empty workspace's one row says so, and is none of them.
      const ITEM_ROWS = 'tbody tr:not(.folder-contents__empty-row)';
      const rowsBefore = await page.getByTestId('explore-contents').locator(ITEM_ROWS).count();
      const idsBefore = await workspaceIds(page);
      await page.getByRole('button', { name: 'New', exact: true }).click();
      await page.getByRole('menuitem', { name: /Import a dashboard…/ }).click();
      const pane = page.getByRole('dialog', { name: 'Import a dashboard' });
      await expect(pane.getByRole('button', { name: 'Choose file…' })).toBeVisible();
      await pane.locator('input[type="file"]').setInputFiles({
        name: FILE,
        mimeType: 'application/json',
        buffer: Buffer.from(exported.text),
      });
      await expect(pane.getByText('Read · every part is one this wechart has')).toBeVisible();
      await expect(
        pane.getByRole('list', { name: 'What it holds' }).getByRole('listitem'),
      ).toHaveText([
        `${TITLE}Dashboard · 2 own charts`,
        'Top productsLibrary chart',
        'Margin trendLibrary chart',
        `${modelPath(names.sales)}Model`,
        `${names.emea}PostgreSQL · settings only`,
      ]);
      await pane.getByRole('button', { name: /Next: Target/ }).click();
      await pane.getByRole('treeitem', { name: `Sales ${RUN}` }).click();
      await pane.getByRole('button', { name: /Next: Data sources/ }).click();

      // Its data source's name has landed, in Sales: mapped to that one, with
      // no Create and nothing asked (T719; AC-358, R71).
      const source = pane.getByRole('group', { name: new RegExp(`^${names.emea}`) });
      await expect(source.getByRole('status')).toHaveText('Mapped');
      await expect(source.getByTestId('held')).toHaveText(
        `Its name is ${names.emea}’s, in Sales ${RUN}: it is mapped to that one, and not imported.`,
      );
      await expect(source.getByRole('radio')).toHaveCount(0);
      await expect(source.getByRole('button', { name: 'Test connection' })).toHaveCount(0);
      await pane.getByRole('button', { name: /Next: Review/ }).click();

      // What the drafts may affect once proposed, none of it blocking; and
      // what was mapped, listed (AC-357, T720).
      await expect(pane.getByTestId(`lands-dashboard-${ids.board}`)).toContainText(
        `Sales ${RUN} has a dashboard by this name, version 2. Proposed, this draft replaces it once approved.`,
      );
      await expect(pane.getByTestId(`lands-chart-${ids.top}`)).toContainText(
        `Sales ${RUN} has a library chart by this name, version 2. Proposed, this draft replaces it once approved.`,
      );
      const mappedSource = pane.getByTestId(`lands-data-source-${names.emea}`);
      await expect(mappedSource).toContainText(`Mapped to ${names.emea} in Sales ${RUN}`);
      await expect(mappedSource).toContainText('Not imported');
      const mappedModel = pane.getByTestId(`lands-model-${modelPath(names.sales)}`);
      await expect(mappedModel).toContainText(`Mapped to ${names.sales} in Sales ${RUN}`);
      await expect(mappedModel).toContainText('Not imported');
      await expect(pane.getByTestId('import-summary')).toHaveText(
        `${TITLE} → Sales ${RUN} · 3 new drafts · 2 warnings`,
      );
      await expect(pane.getByText(`None stops the import`)).toBeVisible();
      await pane.getByRole('button', { name: `Import to My workspace` }).click();
      await expect(pane).toHaveCount(0);
      const toast = page.getByRole('status').filter({ hasText: 'Imported to My workspace' });
      await expect(toast).toContainText(
        `Imported to My workspace as new drafts: 1 dashboard and 4 charts. Nothing in Sales ${RUN} changed.`,
      );

      // New drafts in My workspace, each going to Sales; Sales as it was.
      const listed = (await (await page.request.get('/api/folders/mine/contents')).json()) as {
        kind: string;
        id: string;
        title: string;
        targetFolderId: string | null;
        origin: unknown;
      }[];
      const landed = listed.filter((item) => !idsBefore.includes(item.id));
      drafts.push(...landed.map((item) => ({ kind: item.kind, id: item.id })));
      const contents = page.getByTestId('explore-contents');
      await expect(contents.locator(ITEM_ROWS)).toHaveCount(rowsBefore + 3);
      // The mapped data source and model aren't imported: nothing made for them (AC-358, AC-357).
      expect(
        landed.map((item) => [item.kind, item.title, item.targetFolderId, item.origin]).sort(),
      ).toEqual(
        [
          ['chart', 'Margin trend', ids.sales, null],
          ['chart', 'Top products', ids.sales, null],
          ['dashboard', TITLE, ids.sales, null],
        ].sort(),
      );
      const board = landed.find((item) => item.kind === 'dashboard')!;
      await expect(contents.getByTestId(`item-${board.id}`)).toContainText(`Sales ${RUN} · new`);
      await expect(contents.getByTestId(`item-${board.id}`)).toBeFocused();
      expect(await folderItems(page)).toEqual(salesBefore);

      // The next step is the usual one: its Propose dialog takes the draft on (design 05).
      await toast.getByRole('button', { name: `Propose to Sales ${RUN}…` }).click();
      const dialog = page.getByRole('dialog', { name: `Propose to Sales ${RUN}` });
      await expect(dialog.getByTestId('propose-item')).toHaveText(
        `Dashboard · ${TITLE} — replaces version 2`,
      );
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toHaveCount(0);
    });

    test('maps a data source to one a model in the target binds to, warning of another driver without blocking (T514, AC-358, AC-361)', async ({
      page,
    }) => {
      await myWorkspace(page);
      const idsBefore = await workspaceIds(page);
      await page.getByRole('button', { name: 'New', exact: true }).click();
      await page.getByRole('menuitem', { name: /Import a dashboard…/ }).click();
      const pane = page.getByRole('dialog', { name: 'Import a dashboard' });
      // The same file, its data source a MySQL one of another name.
      const file = JSON.parse(exported.text) as { items: Record<string, unknown>[] };
      const lake = `${RUN}_lake`;
      await pane.locator('input[type="file"]').setInputFiles({
        name: FILE,
        mimeType: 'application/json',
        buffer: Buffer.from(
          JSON.stringify({
            ...file,
            items: file.items.map((item) =>
              item['kind'] === 'data-source' ? { ...item, name: lake, driver: 'mysql' } : item,
            ),
          }),
        ),
      });
      await pane.getByRole('button', { name: /Next: Target/ }).click();
      await pane.getByRole('treeitem', { name: `Sales ${RUN}` }).click();
      await pane.getByRole('button', { name: /Next: Data sources/ }).click();
      const source = pane.getByRole('group', { name: new RegExp(`^${lake}`) });
      await source.getByRole('radio', { name: 'Map to an existing one' }).check();
      const choices = source.getByRole('radiogroup', {
        name: `Data sources a model in Sales ${RUN} can bind to`,
      });
      // Sales's own; never the hidden folder's.
      await expect(choices).not.toContainText(names.hid);
      await choices
        .getByRole('radio', { name: `${names.emea}, PostgreSQL, in Sales ${RUN}` })
        .check();
      await expect(source.getByTestId('driver-mismatch')).toHaveText(
        `${lake} is MySQL in the file, and ${names.emea} is PostgreSQL: a model written for MySQL’s SQL may not run on PostgreSQL.`,
      );
      await expect(source.getByText('Mapped', { exact: true })).toBeVisible();
      // A warning only: on it goes.
      await pane.getByRole('button', { name: /Next: Review/ }).click();
      await expect(pane.getByTestId(`lands-data-source-${lake}`)).toContainText(
        `Mapped to ${names.emea} in Sales ${RUN}`,
      );
      await expect(pane.getByTestId(`lands-data-source-${lake}`)).toContainText('Not imported');
      await pane.getByRole('button', { name: 'Import to My workspace' }).click();
      await expect(
        page.getByRole('status').filter({ hasText: 'Imported to My workspace' }),
      ).toContainText(
        `Imported to My workspace as new drafts: 1 dashboard and 4 charts. Nothing in Sales ${RUN} changed.`,
      );
      const listed = (await (await page.request.get('/api/folders/mine/contents')).json()) as {
        kind: string;
        id: string;
        title: string;
      }[];
      const landed = listed.filter((item) => !idsBefore.includes(item.id));
      drafts.push(...landed.map((item) => ({ kind: item.kind, id: item.id })));
      // Nothing made for it: mapped, it isn't imported.
      expect(landed.map((item) => [item.kind, item.title]).sort()).toEqual(
        [
          ['chart', 'Margin trend'],
          ['chart', 'Top products'],
          ['dashboard', TITLE],
        ].sort(),
      );
    });

    /**
     * T721, T733 (AC-358, AC-356): a model of a name nothing holds lands in My
     * workspace as a draft going to the target, its cube bound to the data
     * source the file's one was mapped to, by that one's name.
     */
    test('lands a model of a new name as a draft, bound to the data source its file’s one was mapped to (T721, AC-358)', async ({
      page,
    }) => {
      await myWorkspace(page);
      const idsBefore = await workspaceIds(page);
      await page.getByRole('button', { name: 'New', exact: true }).click();
      await page.getByRole('menuitem', { name: /Import a dashboard…/ }).click();
      const pane = page.getByRole('dialog', { name: 'Import a dashboard' });
      // The same file, its data source of another name, and a model of a new
      // name on it in place of the one Sales holds.
      const file = JSON.parse(exported.text) as { items: Record<string, unknown>[] };
      const warehouse = `${RUN}_wh`;
      const cube = `${RUN}_whcube`;
      await pane.locator('input[type="file"]').setInputFiles({
        name: FILE,
        mimeType: 'application/json',
        buffer: Buffer.from(
          JSON.stringify({
            ...file,
            items: file.items.map((item) =>
              item['kind'] === 'data-source'
                ? { ...item, name: warehouse }
                : item['kind'] === 'model'
                  ? { kind: 'model', path: modelPath(cube), content: cubeYaml(cube, warehouse) }
                  : item,
            ),
          }),
        ),
      });
      await pane.getByRole('button', { name: /Next: Target/ }).click();
      await pane.getByRole('treeitem', { name: `Sales ${RUN}` }).click();
      await pane.getByRole('button', { name: /Next: Data sources/ }).click();
      const source = pane.getByRole('group', { name: new RegExp(`^${warehouse}`) });
      await source.getByRole('radio', { name: 'Map to an existing one' }).check();
      await source
        .getByRole('radiogroup', { name: `Data sources a model in Sales ${RUN} can bind to` })
        .getByRole('radio', { name: `${names.emea}, PostgreSQL, in Sales ${RUN}` })
        .check();
      await pane.getByRole('button', { name: /Next: Review/ }).click();
      await expect(pane.getByTestId(`lands-model-${modelPath(cube)}`)).toContainText(
        `${modelPath(cube)}ModelNew draft`,
      );
      await pane.getByRole('button', { name: `Import to My workspace` }).click();
      await expect(
        page.getByRole('status').filter({ hasText: 'Imported to My workspace' }),
      ).toContainText(
        `Imported to My workspace as new drafts: 1 dashboard, 4 charts and 1 model. Nothing in Sales ${RUN} changed.`,
      );
      const listed = (await (await page.request.get('/api/folders/mine/contents')).json()) as {
        kind: string;
        id: string;
      }[];
      drafts.push(
        ...listed
          .filter((item) => !idsBefore.includes(item.id) && item.kind !== 'model')
          .map((item) => ({ kind: item.kind, id: item.id })),
      );
      importedModels.push(modelPath(cube));
      // In My workspace's root, going to Sales, its cube on the mapped one by its name.
      const stored = (
        (await (await page.request.get('/api/model/files?folder=mine')).json()) as {
          files: { path: string; content: string }[];
        }
      ).files.find((each) => each.path === modelPath(cube));
      expect(stored?.content).toBe(cubeYaml(cube, names.emea));
    });

    /**
     * T733 (AC-358; R71): a data source of a name nothing holds is created in
     * My workspace under its own name alone, from the file's settings, its
     * secret typed and tested first.
     */
    test('creates a data source of a new name under its own name, tested, from the file’s settings (T514, AC-358)', async ({
      page,
    }) => {
      await myWorkspace(page);
      const idsBefore = await workspaceIds(page);
      await page.getByRole('button', { name: 'New', exact: true }).click();
      await page.getByRole('menuitem', { name: /Import a dashboard…/ }).click();
      const pane = page.getByRole('dialog', { name: 'Import a dashboard' });
      // The same file, its data source of a name nothing holds.
      const file = JSON.parse(exported.text) as { items: Record<string, unknown>[] };
      const fresh = `${RUN}_fresh`;
      await pane.locator('input[type="file"]').setInputFiles({
        name: FILE,
        mimeType: 'application/json',
        buffer: Buffer.from(
          JSON.stringify({
            ...file,
            items: file.items.map((item) =>
              item['kind'] === 'data-source' ? { ...item, name: fresh } : item,
            ),
          }),
        ),
      });
      await pane.getByRole('button', { name: /Next: Target/ }).click();
      await pane.getByRole('treeitem', { name: `Sales ${RUN}` }).click();
      await pane.getByRole('button', { name: /Next: Data sources/ }).click();
      const source = pane.getByRole('group', { name: new RegExp(`^${fresh}`) });
      await source.getByRole('radio', { name: 'Create it' }).check();
      // Under its own name alone (R71): the name is the file's, not to be edited.
      await expect(source.getByLabel(/^Name/)).toHaveValue(fresh);
      await expect(source.getByLabel(/^Name/)).toHaveAttribute('readonly', '');
      await expect(source.getByRole('button', { name: 'Create under another name' })).toHaveCount(
        0,
      );
      // The file's settings, as they are: shown, and not to be changed here (P4 not adopted).
      await expect(source.getByText('sample-db:5432 / sample')).toBeVisible();
      await expect(source.getByRole('textbox', { name: /^Host/ })).toHaveCount(0);
      await expect(pane.getByRole('button', { name: /Next: Review/ })).toBeDisabled();
      await source.getByLabel(/^Password/).fill('sample');
      await source.getByRole('button', { name: 'Test connection' }).click();
      await expect(source.getByRole('status')).toContainText('Every check passed', {
        timeout: 60_000,
      });
      await pane.getByRole('button', { name: /Next: Review/ }).click();
      await expect(pane.getByTestId(`lands-data-source-${fresh}`)).toContainText(
        `${fresh}Data source, created · test passed`,
      );
      await pane.getByRole('button', { name: `Import to My workspace` }).click();
      await expect(
        page.getByRole('status').filter({ hasText: 'Imported to My workspace' }),
      ).toContainText(
        `Imported to My workspace as new drafts: 1 dashboard, 4 charts and 1 data source. Nothing in Sales ${RUN} changed.`,
      );
      const listed = (await (await page.request.get('/api/folders/mine/contents')).json()) as {
        kind: string;
        id: string;
        title: string;
        targetFolderId: string | null;
        origin: unknown;
      }[];
      const landed = listed.filter((item) => !idsBefore.includes(item.id));
      drafts.push(...landed.map((item) => ({ kind: item.kind, id: item.id })));
      expect(
        landed.map((item) => [item.kind, item.title, item.targetFolderId, item.origin]).sort(),
      ).toEqual(
        [
          ['chart', 'Margin trend', ids.sales, null],
          ['chart', 'Top products', ids.sales, null],
          ['dashboard', TITLE, ids.sales, null],
          ['data-source', fresh, ids.sales, null],
        ].sort(),
      );
      // Made from the file's settings and description, its secret sealed, never shown.
      const made = landed.find((item) => item.kind === 'data-source')!;
      const view = (await (await page.request.get(`/api/data-sources/${made.id}`)).json()) as {
        fields: unknown;
        description: string | null;
        secrets: unknown;
        inWorkspace: boolean;
      };
      expect(view).toMatchObject({
        fields: FIELDS,
        description: `Sample rows for ${names.emea}.`,
        secrets: { password: { stored: true } },
        inWorkspace: true,
      });
    });

    test('refuses a file it can’t take, naming each part and why, and imports nothing (AC-359)', async ({
      page,
    }) => {
      await myWorkspace(page);
      const before = await page.request.get('/api/folders/mine/contents');
      const titles = ((await before.json()) as { id: string }[]).map((item) => item.id).sort();
      await page.getByRole('button', { name: 'New', exact: true }).click();
      await page.getByRole('menuitem', { name: /Import a dashboard…/ }).click();
      const pane = page.getByRole('dialog', { name: 'Import a dashboard' });
      const file = JSON.parse(exported.text) as { items: Record<string, unknown>[] };
      const altered = {
        ...file,
        items: [
          ...file.items.map((item) =>
            item['kind'] === 'data-source' ? { ...item, driver: 'databricks' } : item,
          ),
          { kind: 'alert', title: 'Late orders' },
        ],
      };
      await pane.locator('input[type="file"]').setInputFiles({
        name: 'q3-board-pack.wechart.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(altered)),
      });
      const refusal = pane.getByRole('alert');
      await expect(refusal).toContainText('Refused · 2 parts this wechart doesn’t have');
      await expect(refusal.getByRole('listitem')).toHaveText([
        `Data source ${names.emea}Driver databricks: this wechart connects with PostgreSQL, Amazon Redshift, MySQL, Snowflake, BigQuery, SQL Server, Oracle and Dremio.`,
        `Item ${String(altered.items.length)}, “Late orders”Kind alert: this wechart imports dashboards, charts, models and data sources.`,
      ]);
      await expect(refusal).toBeFocused();
      await expect(pane.getByRole('button', { name: /Next: Target/ })).toHaveCount(0);

      // A file that ends part-way, too.
      await pane.locator('input[type="file"]').setInputFiles({
        name: 'revenue-overview (1).wechart.json',
        mimeType: 'application/json',
        buffer: Buffer.from(exported.text.slice(0, 200)),
      });
      await expect(pane.getByRole('alert')).toContainText(
        'revenue-overview (1).wechart.json can’t be read as a wechart export.',
      );
      await expect(pane.getByRole('alert')).toContainText('It ends part-way through, at line');

      // Leaving asks first, and nothing was imported.
      await pane.getByRole('button', { name: 'Cancel' }).click();
      await pane
        .getByRole('alertdialog', { name: 'Discard this import?' })
        .getByRole('button', { name: 'Discard' })
        .click();
      await expect(pane).toHaveCount(0);
      const after = await page.request.get('/api/folders/mine/contents');
      expect(((await after.json()) as { id: string }[]).map((item) => item.id).sort()).toEqual(
        titles,
      );
    });
  });

  test.describe('as reader, View only on Sales', () => {
    test.use({ role: 'reader' });

    test('is offered the charts on the dashboard, and told why no model or data source is', async ({
      page,
    }) => {
      const pane = await exportPane(page);
      await expect(pane.getByTestId('export-view-only')).toHaveText(
        'Models and data sources aren’t offered. With View only access you see dashboards and the charts on them, not the models or data sources behind them.',
      );
      await expect(pane.getByRole('group', { name: 'Library charts it shows' })).toBeVisible();
      await expect(pane.getByRole('group', { name: 'Models its charts use' })).toHaveCount(0);
      await expect(pane).not.toContainText(names.emea);
    });
  });
});
