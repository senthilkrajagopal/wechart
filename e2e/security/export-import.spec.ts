import { readFileSync } from 'node:fs';

import type { APIRequestContext, APIResponse, Page } from '@playwright/test';
import { sealSecretV1, type SealedV1, type XcubeKey } from '@wechart/core';

import { BASE_URL, expect, signInThroughDex, test, testedSource } from './fixtures';

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
 */
const RUN = `x${Math.random().toString(36).slice(2, 7)}`;
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
const FIELDS = { host: 'sample-db', port: 5432, database: 'sample', user: 'sample', ssl: false };
const TITLE = 'Revenue overview';
const FILE = 'revenue-overview.wechart.json';
const names = { sales: `${RUN}_sales`, margin: `${RUN}_margin`, emea: `${RUN}_emea`, hid: `${RUN}_hid` };
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
  // What it is for, which goes with it (AC-355).
  const described = await request.put(`/api/data-sources/${id}`, {
    data: { description: `Sample rows for ${name}.` },
  });
  expect(described.status(), await described.text()).toBe(200);
  return id;
}

async function publish(request: APIRequestContext, folderId: string, name: string, source: string) {
  const answer = await request.post('/api/model/publish', {
    data: { folderId, files: [{ path: modelPath(name), content: cubeYaml(name, source) }] },
  });
  expect(answer.status(), await answer.text()).toBe(200);
  published.push({ folderId, name });
}

/** A chart, made in its folder and then given its definition (and, if local, its dashboard). */
async function chart(
  request: APIRequestContext,
  title: string,
  folderId: string,
  cube: string,
  localTo?: string,
) {
  const id = await made(
    await request.post('/api/documents', { data: { kind: 'chart', title, folderId } }),
  );
  const saved = await request.put(`/api/documents/chart/${id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        ...(localTo === undefined ? { folderId } : { localToDashboardId: localTo }),
        chart: {
          source: { cube },
          wells: { measures: [`${cube}.count`], dimensions: [`${cube}.region`], timeDimensions: [] },
          chartType: 'bar',
        },
      },
    },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  return id;
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
  ids.revenue = await chart(request, 'Revenue', ids.sales, names.sales, ids.board);
  ids.orders = await chart(request, 'Orders', ids.sales, names.sales, ids.board);
  ids.top = await chart(request, 'Top products', ids.sales, names.sales);
  ids.margin = await chart(request, 'Margin trend', ids.hidden, names.margin);
  const board = (await (await request.get(`/api/documents/dashboard/${ids.board}`)).json()) as {
    body: Record<string, unknown>;
    version: number;
  };
  const tile = (id: string, chartId: string) => ({ id, kind: 'chart', chartId, w: 6, h: 30 });
  const saved = await request.put(`/api/documents/dashboard/${ids.board}`, {
    data: {
      version: board.version,
      body: {
        ...board.body,
        pages: [
          {
            id: 'overview',
            title: 'Overview',
            items: [
              tile('t-revenue', ids.revenue),
              tile('t-orders', ids.orders),
              tile('t-top', ids.top),
              tile('t-margin', ids.margin),
            ],
          },
        ],
        charts: [ids.revenue, ids.orders],
      },
    },
  });
  expect(saved.status(), await saved.text()).toBe(200);
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
          await removed(`chart ${chartId}`, writer.request.delete(`/api/documents/chart/${chartId}?confirm=true`));
      }
    }
    for (const { kind, id } of [...drafts].sort((a) => (a.kind === 'chart' ? -1 : 1)))
      await removed(
        `${kind} ${id}`,
        writer.request.delete(`/api/documents/${kind}/${id}${kind === 'chart' ? '?confirm=true' : ''}`),
      );
    await writer.close();

    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    await signInThroughDex(await context.newPage(), 'super');
    const request = context.request;
    // The charts, confirmed though a dashboard shows them, then the dashboard,
    // then what they used.
    for (const id of [ids.revenue, ids.orders, ids.top, ids.margin].filter((each) => each !== ''))
      await removed(`chart ${id}`, request.delete(`/api/documents/chart/${id}?confirm=true`));
    if (ids.board !== '')
      await removed('dashboard', request.delete(`/api/documents/dashboard/${ids.board}`));
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
      ).toHaveText(['Revenue overviewthe dashboard, as saved', '2 own chartsmade on this dashboard']);

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

    test('exports only what stays ticked, from the dashboard’s row in Explore', async ({ page }) => {
      await page.goto(`/explore?folder=${ids.sales}`);
      await page
        .getByTestId(`item-${ids.board}`)
        .getByRole('button', { name: `Actions for ${TITLE}` })
        .click();
      await page.getByRole('menuitem', { name: 'Export…' }).click();
      const pane = page.getByRole('dialog', { name: 'Export dashboard' });
      await pane.getByRole('button', { name: 'None' }).click();
      await expect(pane.getByTestId('export-counts')).toHaveText('In the file: 1 dashboard · 2 charts');
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
      const rowsBefore = await page.getByTestId('explore-contents').locator('tbody tr').count();
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
      await expect(pane.getByRole('list', { name: 'What it holds' }).getByRole('listitem')).toHaveText([
        `${TITLE}Dashboard · 2 own charts`,
        'Top productsLibrary chart',
        'Margin trendLibrary chart',
        `${modelPath(names.sales)}Not imported yet`,
        `${names.emea}PostgreSQL · settings only`,
      ]);
      await pane.getByRole('button', { name: /Next: Target/ }).click();
      await pane.getByRole('treeitem', { name: `Sales ${RUN}` }).click();
      await pane.getByRole('button', { name: /Next: Review/ }).click();

      // What the drafts may affect once proposed; none of it blocks.
      await expect(pane.getByTestId(`lands-dashboard-${ids.board}`)).toContainText(
        `Sales ${RUN} has a dashboard by this name, version 2. Proposed, this draft replaces it once approved.`,
      );
      await expect(pane.getByTestId(`lands-chart-${ids.top}`)).toContainText(
        `Sales ${RUN} has a library chart by this name, version 2. Proposed, this draft replaces it once approved.`,
      );
      await expect(pane.getByTestId(`lands-data-source-${names.emea}`)).toContainText(
        `Sales ${RUN} already has a data source named ${names.emea}.`,
      );
      await expect(pane.getByTestId(`lands-model-${modelPath(names.sales)}`)).toContainText(
        'Not imported yet',
      );
      await expect(pane.getByTestId('import-summary')).toHaveText(
        `${TITLE} → Sales ${RUN} · 3 new drafts · 3 warnings`,
      );
      await pane.getByRole('button', { name: 'Import to My workspace' }).click();
      await expect(pane).toHaveCount(0);
      const toast = page.getByRole('status').filter({ hasText: 'Imported to My workspace' });
      await expect(toast).toContainText(
        `Imported to My workspace as new drafts: 1 dashboard and 4 charts. Nothing in Sales ${RUN} changed.`,
      );

      // New drafts in My workspace, each going to Sales; Sales as it was.
      const contents = page.getByTestId('explore-contents');
      await expect(contents.locator('tbody tr')).toHaveCount(rowsBefore + 3);
      const listed = (await (await page.request.get('/api/folders/mine/contents')).json()) as {
        kind: string;
        id: string;
        title: string;
        targetFolderId: string | null;
        origin: unknown;
      }[];
      const landed = listed.filter((item) =>
        [TITLE, 'Top products', 'Margin trend'].includes(item.title),
      );
      drafts.push(...landed.map((item) => ({ kind: item.kind, id: item.id })));
      expect(landed.map((item) => [item.kind, item.title, item.targetFolderId, item.origin]).sort()).toEqual(
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
      await pane.getByRole('alertdialog', { name: 'Discard this import?' }).getByRole('button', { name: 'Discard' }).click();
      await expect(pane).toHaveCount(0);
      const after = await page.request.get('/api/folders/mine/contents');
      expect(((await after.json()) as { id: string }[]).map((item) => item.id).sort()).toEqual(titles);
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
