import type { APIRequestContext, Response } from '@playwright/test';

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
 *
 * T537 (AC-371, amended 2026-10-01): so too when a chart F's dashboard shows
 * is moved to G, from Explore, which says which dashboard got its own copy;
 * and when an approval lands a dashboard showing a chart moved to G since it
 * was drafted.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const ids = {
  f: '',
  g: '',
  chart: '',
  board: '',
  mine: '',
  // T537's.
  moving: '',
  later: '',
  draft: '',
  landed: '',
};
const full = (folderId: string, name: string) => `f${folderId.replaceAll('-', '')}__${name}`;

type Stored = { body: Record<string, unknown>; version: number };
const read = async (request: APIRequestContext, kind: string, id: string) =>
  (await (await request.get(`/api/documents/${kind}/${id}`)).json()) as Stored;

async function made(request: APIRequestContext, data: Record<string, unknown>) {
  const answer = await request.post('/api/documents', { data });
  expect(answer.status(), await answer.text()).toBe(201);
  return ((await answer.json()) as { id: string }).id;
}

/** A dashboard's tiles' charts, first page first. */
const tilesOf = (board: Stored) =>
  (board.body['pages'] as { items: { chartId?: string }[] }[]).flatMap((page) =>
    page.items.map((tile) => tile.chartId),
  );
const chartOf = (chart: Stored) => chart.body['chart'] as { source: { cube: string } };

/** A shared chart of orders by status in a folder, as a Super-Admin makes one. */
async function ordersChart(request: APIRequestContext, title: string, folderId: string) {
  const id = await made(request, { kind: 'chart', title, folderId });
  await changeShared(request, 'chart', id, (body) => ({
    ...body,
    chart: {
      source: { cube: 'orders' },
      wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
    },
  }));
  return id;
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

  test('moving a chart the dashboard shows to G, from Explore, gives it its own copy and says so (T537)', async ({
    page,
  }) => {
    const request = page.request;
    const title = `F’s orders ${RUN}`;
    ids.moving = await ordersChart(request, title, ids.f);
    // For the writer's draft, below.
    ids.later = await ordersChart(request, `F’s later ${RUN}`, ids.f);
    // Bound in F: no folder on its path but the root holds `orders`.
    expect(chartOf(await read(request, 'chart', ids.moving)).source.cube).toBe('orders');
    await changeShared(request, 'dashboard', ids.board, (body) => {
      const [first, ...rest] = body['pages'] as { items: unknown[] }[];
      return {
        ...body,
        pages: [
          { ...first, items: [...first!.items, { id: 't2', kind: 'chart', chartId: ids.moving }] },
          ...rest,
        ],
      };
    });
    // Kept in F, on its path: shown as it is.
    expect(tilesOf(await read(request, 'dashboard', ids.board))[1]).toBe(ids.moving);

    await page.goto(`/explore?folder=${ids.f}`);
    const row = page.getByTestId(`item-${ids.moving}`);
    await row.getByRole('button', { name: `Actions for ${title}` }).click();
    await page
      .getByRole('menu', { name: `Actions for ${title}` })
      .getByRole('menuitem', { name: 'Move to…' })
      .click();
    await row
      .getByRole('combobox', { name: `Move ${title} to` })
      .selectOption({ label: `Shared / Copy G ${RUN}` });

    await expect(page.getByTestId('moved-copies')).toHaveText(
      `“Copy board ${RUN}” now shows its own copy of “${title}”: after this move, that chart isn’t kept in the dashboard’s folder or one above it.`,
    );
    const shown = tilesOf(await read(request, 'dashboard', ids.board));
    expect(shown).not.toContain(ids.moving);
    const own = await read(request, 'chart', shown[1]!);
    expect(own.body['localToDashboardId']).toBe(ids.board);
    expect(own.body['title']).toBe(title);
    // Bound on F's path, as the chart was before it moved.
    expect(chartOf(own).source.cube).toBe('orders');
    // The chart itself is G's now, bound to G's own.
    const moved = await read(request, 'chart', ids.moving);
    expect(moved.body['folderId']).toBe(ids.g);
    expect(chartOf(moved).source.cube).toBe(full(ids.g, 'orders'));
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

  test('an approval lands their draft, showing a chart moved to G since, with its own copy (T537)', async ({
    page,
  }) => {
    const request = page.request;
    ids.draft = await made(request, {
      kind: 'dashboard',
      title: `Draft to F ${RUN}`,
      folderId: 'mine',
      targetFolderId: ids.f,
    });
    const drafted = await read(request, 'dashboard', ids.draft);
    const saved = await request.put(`/api/documents/dashboard/${ids.draft}`, {
      data: {
        body: {
          ...drafted.body,
          pages: [
            { id: 'p1', title: 'Page 1', items: [{ id: 't1', kind: 'chart', chartId: ids.later }] },
          ],
        },
        version: drafted.version,
      },
    });
    expect(saved.status(), await saved.text()).toBe(200);
    // Kept in F, on the path of where it goes: shown as it is.
    expect(tilesOf(await read(request, 'dashboard', ids.draft))).toEqual([ids.later]);

    // Moved to G since. A draft is its author's: the move leaves it for its approval.
    const moved = await request.patch(`/api/documents/chart/${ids.later}`, {
      data: { folderId: ids.g },
    });
    expect(moved.status(), await moved.text()).toBe(200);
    expect(((await moved.json()) as { copiedOn?: unknown }).copiedOn).toBeUndefined();
    expect(tilesOf(await read(request, 'dashboard', ids.draft))).toEqual([ids.later]);

    const proposed = await request.post('/api/proposals', {
      data: { kind: 'dashboard', id: ids.draft },
    });
    expect(proposed.status(), await proposed.text()).toBe(201);
    const approved = await request.post(
      `/api/proposals/${((await proposed.json()) as { id: string }).id}/approve`,
      { data: {} },
    );
    expect(approved.status(), await approved.text()).toBe(200);
    const { landed } = (await approved.json()) as { landed: { kind: string; id: string }[] };
    ids.landed = landed.find((each) => each.kind === 'dashboard')!.id;

    const [shown] = tilesOf(await read(request, 'dashboard', ids.landed));
    expect(shown).not.toBe(ids.later);
    const own = await read(request, 'chart', shown!);
    expect(own.body['localToDashboardId']).toBe(ids.landed);
    // Bound on F's path, where it landed: the root's `orders`.
    expect(chartOf(own).source.cube).toBe('orders');
    await request.delete(`/api/documents/dashboard/${ids.draft}`);
    ids.draft = '';
  });
});

test.describe('as a read-only member of F (T527, T537, AC-263, AC-371)', () => {
  test.use({ role: 'reader' });

  // Each tile's answer, once every one of `tiles` has answered.
  for (const [which, tiles] of [
    ['the dashboard a chart was moved away from', 2],
    ['the dashboard the approval landed', 1],
  ] as const)
    test(`every tile of ${which} answers`, async ({ page }) => {
      const answers: Response[] = [];
      page.on('response', (response) => {
        if (response.url().endsWith('/api/load') && response.request().method() === 'POST')
          answers.push(response);
      });
      const id = tiles === 2 ? ids.board : ids.landed;
      await page.goto(`/explore/dashboards/${id}`);
      await expect.poll(() => answers.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(tiles);
      for (const answer of answers) {
        expect(answer.status(), await answer.text()).toBe(200);
        const data = ((await answer.json()) as { data?: Record<string, unknown>[] }).data ?? [];
        expect(Number(data[0]?.['orders.count'])).toBeGreaterThan(0);
      }
    });
});

test.describe('cleaning up', () => {
  test.use({ role: 'super' });

  test('removes what the run made', async ({ page }) => {
    const request = page.request;
    for (const [kind, id] of [
      ['dashboard', ids.mine],
      ['dashboard', ids.board],
      ['dashboard', ids.landed],
      ['chart', ids.chart],
      ['chart', ids.moving],
      ['chart', ids.later],
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
