import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './fixtures';
import { changeShared } from './shared-change';

/**
 * T527 (AC-371, AC-263; the user's answer on AC-263, "Copy on use"): a
 * dashboard shows only library charts kept on its folder's path. A chart
 * from elsewhere, put on it, becomes a chart of its own, so no tile needs a
 * folder its readers can't see, and xcube admits them to every cube it asks.
 *
 *   /Copy F <run>     read-only sales-ro, read-write sales-rw    the dashboard
 *   /Copy G <run>     read-write sales-rw                        a chart, on G's own `orders`
 *
 * G's chart is bound to G's `orders` (nearest first, AC-273). Shown on F's
 * dashboard as it is, the reader's tile would ask xcube for a cube in G,
 * which refuses them (AC-320). As F's own copy it lands bound on F's path:
 * the root's `orders`.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const ids = { f: '', g: '', chart: '', board: '', mine: '' };
const full = (folderId: string, name: string) => `f${folderId.replaceAll('-', '')}__${name}`;

type Stored = { body: Record<string, unknown>; version: number };
const read = async (request: APIRequestContext, kind: string, id: string) =>
  (await (await request.get(`/api/documents/${kind}/${id}`)).json()) as Stored;

async function made(request: APIRequestContext, data: Record<string, unknown>) {
  const answer = await request.post('/api/documents', { data });
  expect(answer.status(), await answer.text()).toBe(201);
  return ((await answer.json()) as { id: string }).id;
}

const cubeYaml = (name: string) =>
  [
    'cubes:',
    `  - name: ${name}`,
    '    sql_table: public.orders',
    '    dimensions:',
    '      - name: id',
    '        sql: id',
    '        type: number',
    '        primary_key: true',
    '    measures:',
    '      - name: count',
    '        type: count',
    '',
  ].join('\n');

test.describe.configure({ mode: 'serial' });

test.describe('copy on use (T527, AC-371)', () => {
  test.use({ role: 'super' });

  test('makes a folder the reader reads, one they don’t, and a chart kept there on a cube of its own', async ({
    page,
  }) => {
    const request = page.request;
    ids.f = await made(request, { kind: 'folder', title: `Copy F ${RUN}`, folderId: 'root' });
    ids.g = await made(request, { kind: 'folder', title: `Copy G ${RUN}`, folderId: 'root' });
    for (const [folderId, access] of [
      [ids.f, { readOnly: ['sales-ro'], readWrite: ['sales-rw'] }],
      [ids.g, { readOnly: null, readWrite: ['sales-rw'] }],
    ] as const) {
      const set = await request.put(`/api/folders/${folderId}/access`, { data: access });
      expect(set.status(), await set.text()).toBe(200);
    }
    const published = await request.post('/api/model/publish', {
      data: { folderId: ids.g, files: [{ path: 'cubes/orders.yml', content: cubeYaml('orders') }] },
    });
    expect(published.status(), await published.text()).toBe(200);

    ids.chart = await made(request, {
      kind: 'chart',
      title: `G’s orders ${RUN}`,
      folderId: ids.g,
    });
    await changeShared(request, 'chart', ids.chart, (body) => ({
      ...body,
      chart: {
        source: { cube: 'orders' },
        wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
      },
    }));
    // Bound in G, to G's own `orders`.
    const chart = (await read(request, 'chart', ids.chart)).body['chart'] as {
      source: { cube: string };
    };
    expect(chart.source.cube).toBe(full(ids.g, 'orders'));
    ids.board = await made(request, {
      kind: 'dashboard',
      title: `Copy board ${RUN}`,
      folderId: ids.f,
    });
  });

  test('puts it on F’s dashboard as the dashboard’s own copy, bound on F’s path', async ({
    page,
  }) => {
    const request = page.request;
    await changeShared(request, 'dashboard', ids.board, (body) => ({
      ...body,
      pages: [
        { id: 'p1', title: 'Page 1', items: [{ id: 't1', kind: 'chart', chartId: ids.chart }] },
      ],
    }));
    const board = await read(request, 'dashboard', ids.board);
    const shown = (board.body['pages'] as { items: { chartId: string }[] }[])[0]!.items[0]!.chartId;
    expect(shown).not.toBe(ids.chart);
    const own = await read(request, 'chart', shown);
    expect(own.body['localToDashboardId']).toBe(ids.board);
    expect(own.body['folderId']).toBeUndefined();
    expect((own.body['chart'] as { source: { cube: string } }).source.cube).toBe('orders');
    // The one it came from is G's still.
    expect((await read(request, 'chart', ids.chart)).body['folderId']).toBe(ids.g);
  });
});

test.describe('as a read-only member of F (T527, AC-263)', () => {
  test.use({ role: 'reader' });

  test('every tile of the dashboard answers', async ({ page }) => {
    const loaded = page.waitForResponse(
      (response) => response.url().endsWith('/api/load') && response.request().method() === 'POST',
    );
    await page.goto(`/explore/dashboards/${ids.board}`);
    const answer = await loaded;
    expect(answer.status(), await answer.text()).toBe(200);
    const data = ((await answer.json()) as { data?: Record<string, unknown>[] }).data ?? [];
    expect(Number(data[0]?.['orders.count'])).toBeGreaterThan(0);
  });
});

test.describe('as a read-write member, from the chart’s page (T527, AC-371)', () => {
  test.use({ role: 'writer' });

  test('Add to dashboard says their dashboard gets its own copy', async ({ page }) => {
    const title = `Mine to F ${RUN}`;
    ids.mine = await made(page.request, {
      kind: 'dashboard',
      title,
      folderId: 'mine',
      targetFolderId: ids.f,
    });
    await page.goto(`/explore/charts/${ids.chart}`);
    await page.getByLabel('Dashboard', { exact: true }).selectOption({ label: title });
    await page.getByRole('button', { name: 'Add to dashboard' }).click();

    await expect(page.getByTestId('added-as-copy')).toHaveText(
      `Added to “${title}” as its own copy: this chart isn’t kept in the folder that dashboard is shown in, or one above it.`,
    );
    // The dashboard shows its own copy, not G's chart.
    const listed = (await read(page.request, 'dashboard', ids.mine)).body['charts'] as string[];
    expect(listed).toHaveLength(1);
    expect(listed).not.toContain(ids.chart);
    await page.request.delete(`/api/documents/dashboard/${ids.mine}`);
    ids.mine = '';
  });
});

test.describe('cleaning up', () => {
  test.use({ role: 'super' });

  test('removes what the run made', async ({ page }) => {
    const request = page.request;
    for (const [kind, id] of [
      ['dashboard', ids.mine],
      ['dashboard', ids.board],
      ['chart', ids.chart],
    ] as const)
      if (id !== '') await request.delete(`/api/documents/${kind}/${id}`);
    if (ids.g !== '')
      await request.delete(
        `/api/model/files?folder=${ids.g}&path=${encodeURIComponent('cubes/orders.yml')}`,
      );
    for (const id of [ids.f, ids.g])
      if (id !== '') await request.delete(`/api/documents/folder/${id}`);
  });
});
