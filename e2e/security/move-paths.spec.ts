import type { APIRequestContext, Page, Response } from '@playwright/test';

import { landed } from '../model-files';
import { expect, test } from './fixtures';
import { changeShared } from './shared-change';

/**
 * T714 (AC-425, AC-263, AC-272), on xcube's R71 image: every cube a
 * dashboard's charts use stays in its folder or one above it through every
 * move. Moving one from Explore where its chart's cube isn't on the new path
 * is refused, naming the chart and the cube, and nothing moves. A move that
 * keeps it applies, rebinding nothing, and a reader of its new folder still
 * gets its tile's rows, xcube admitting them to the cube kept above it.
 *
 *   /MP A <run>          read-write sales-rw; keeps the cube `mp_a_<run>`
 *   /MP A <run>/MP B     two dashboards, each with a chart of its own on `mp_a_<run>`
 *   /MP A <run>/MP C     read-only sales-ro, beside /MP B
 *   /MP D <run>          read-write sales-rw, beside /MP A
 *
 * `super` makes them; `writer` moves; `reader` reads /MP A/MP C.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const A_CUBE = `mp_a_${RUN}`;
const ids = { a: '', b: '', c: '', d: '', j: '', stranding: '', keeping: '' };
// T715's: /MP A/MP J's cube, joining /MP A's.
const JOINER = `mp_join_${RUN}`;
const STRANDING = `Stranding ${RUN}`;
const KEEPING = `Keeping ${RUN}`;

async function made(request: APIRequestContext, data: Record<string, unknown>) {
  const answer = await request.post('/api/documents', { data });
  expect(answer.status(), await answer.text()).toBe(201);
  return ((await answer.json()) as { id: string }).id;
}
const folderOf = async (request: APIRequestContext, kind: string, id: string) =>
  (
    (await (await request.get(`/api/documents/${kind}/${id}`)).json()) as {
      body: { folderId: string };
    }
  ).body.folderId;

const cubeYaml = (name: string, lines: readonly string[] = []) =>
  [
    'cubes:',
    `  - name: ${name}`,
    '    sql_table: public.orders',
    ...lines,
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

/** A dashboard in /MP A/MP B with one chart of its own, on /MP A's cube. */
async function boardOn(request: APIRequestContext, title: string) {
  const id = await made(request, { kind: 'dashboard', title, folderId: ids.b });
  await changeShared(
    request,
    'dashboard',
    id,
    (body, [own]) => ({
      ...body,
      pages: [{ id: 'p1', title: 'Page 1', items: [{ id: 't1', kind: 'chart', chartId: own }] }],
    }),
    {
      ownCharts: [
        {
          body: {
            schemaVersion: 1,
            title: `Own on ${title}`,
            chart: {
              source: { cube: A_CUBE },
              wells: { measures: [`${A_CUBE}.count`], dimensions: [], timeDimensions: [] },
            },
          },
        },
      ],
    },
  );
  return id;
}

/** Moves an item in a folder (/MP A/MP B unless said) from Explore's row menu to the folder of that path. */
async function moveFromExplore(page: Page, id: string, title: string, to: string, from = ids.b) {
  await page.goto(`/explore?folder=${from}`);
  const row = page.getByTestId(`item-${id}`);
  await row.getByRole('button', { name: `Actions for ${title}` }).click();
  await page
    .getByRole('menu', { name: `Actions for ${title}` })
    .getByRole('menuitem', { name: 'Move to…' })
    .click();
  await row.getByRole('combobox', { name: `Move ${title} to` }).selectOption({ label: to });
}

test.describe.configure({ mode: 'serial' });

test.describe('setting up (T714)', () => {
  test.use({ role: 'super' });

  test('makes the folders, /MP A’s cube and /MP A/MP B’s two dashboards', async ({ page }) => {
    test.setTimeout(240_000);
    const request = page.request;
    ids.a = await made(request, { kind: 'folder', title: `MP A ${RUN}`, folderId: 'root' });
    ids.b = await made(request, { kind: 'folder', title: `MP B ${RUN}`, folderId: ids.a });
    ids.c = await made(request, { kind: 'folder', title: `MP C ${RUN}`, folderId: ids.a });
    ids.d = await made(request, { kind: 'folder', title: `MP D ${RUN}`, folderId: 'root' });
    for (const [folderId, access] of [
      [ids.a, { readOnly: null, readWrite: ['sales-rw'] }],
      [ids.c, { readOnly: ['sales-ro'], readWrite: null }],
      [ids.d, { readOnly: null, readWrite: ['sales-rw'] }],
    ] as const) {
      const set = await request.put(`/api/folders/${folderId}/access`, { data: access });
      expect(set.status(), await set.text()).toBe(200);
    }
    const file = { path: `cubes/${A_CUBE}.yml`, content: cubeYaml(A_CUBE) };
    expect(await landed(request, ids.a, [file])).toEqual([file]);
    ids.stranding = await boardOn(request, STRANDING);
    ids.keeping = await boardOn(request, KEEPING);
    // T715's: a folder whose only content is a model joining /MP A's cube.
    ids.j = await made(request, { kind: 'folder', title: `MP J ${RUN}`, folderId: ids.a });
    const joiner = {
      path: `cubes/${JOINER}.yml`,
      content: cubeYaml(JOINER, [
        '    joins:',
        `      - name: ${A_CUBE}`,
        `        sql: "{CUBE}.id = {${A_CUBE}}.id"`,
        '        relationship: many_to_one',
      ]),
    };
    expect(await landed(request, ids.j, [joiner])).toEqual([joiner]);
  });
});

test.describe('moving as a read-write member (T714, AC-425)', () => {
  test.use({ role: 'writer' });

  test('a dashboard whose chart would use a cube off its new path: refused in Explore, naming both, and not moved', async ({
    page,
  }) => {
    await moveFromExplore(page, ids.stranding, STRANDING, `Shared / MP D ${RUN}`);

    await expect(
      page.getByText(
        `Moved, “Own on ${STRANDING}” on “${STRANDING}” would use “${A_CUBE}”, which isn’t in its folder or one above it. Nothing was moved.`,
      ),
    ).toBeVisible();
    expect(await folderOf(page.request, 'dashboard', ids.stranding)).toBe(ids.b);
  });

  test('the folder holding it, moved under /MP D: refused, naming both charts, and not moved', async ({
    page,
  }) => {
    const answer = await page.request.patch(`/api/documents/folder/${ids.b}`, {
      data: { folderId: ids.d },
    });
    expect(answer.status(), await answer.text()).toBe(422);
    const said = (await answer.json()) as { stranded: { title: string; names: string[] }[] };
    expect(said.stranded.map(({ title, names }) => ({ title, names }))).toEqual(
      expect.arrayContaining([
        { title: `Own on ${STRANDING}`, names: [A_CUBE] },
        { title: `Own on ${KEEPING}`, names: [A_CUBE] },
      ]),
    );
    expect(said.stranded).toHaveLength(2);
    expect(await folderOf(page.request, 'folder', ids.b)).toBe(ids.a);
  });

  test('a dashboard whose chart keeps its cube on the new path: moved beside, its chart’s name as it was', async ({
    page,
  }) => {
    await moveFromExplore(page, ids.keeping, KEEPING, `Shared / MP A ${RUN} / MP C ${RUN}`);

    await expect.poll(() => folderOf(page.request, 'dashboard', ids.keeping)).toBe(ids.c);
    await expect(page.getByText('Nothing was moved.')).toHaveCount(0);
    const board = (await (
      await page.request.get(`/api/documents/dashboard/${ids.keeping}`)
    ).json()) as {
      body: { pages: { items: { chartId: string }[] }[] };
    };
    const own = (await (
      await page.request.get(`/api/documents/chart/${board.body.pages[0]!.items[0]!.chartId}`)
    ).json()) as { body: { chart: { source: { cube: string } } } };
    expect(own.body.chart.source.cube).toBe(A_CUBE);
  });
});

test.describe('moving a folder holding a model (T715, AC-425)', () => {
  test.use({ role: 'writer' });

  test('one whose cube joins a cube it would leave off its path: refused in Explore, as xcube refuses its tree, and not moved', async ({
    page,
  }) => {
    await moveFromExplore(page, ids.j, `MP J ${RUN}`, `Shared / MP D ${RUN}`, ids.a);

    await expect(
      page.getByText(
        `Moved, “${JOINER}” would refer to a cube that isn’t in its folder or one above it. Nothing was moved.`,
      ),
    ).toBeVisible();
    expect(await folderOf(page.request, 'folder', ids.j)).toBe(ids.a);
  });

  test('the same folder moved beside, under /MP A still: moved', async ({ page }) => {
    const answer = await page.request.patch(`/api/documents/folder/${ids.j}`, {
      data: { folderId: ids.c },
    });
    expect(answer.status(), await answer.text()).toBe(200);
    expect(await folderOf(page.request, 'folder', ids.j)).toBe(ids.c);
  });
});

test.describe('as a read-only member of /MP A/MP C (T714, AC-263)', () => {
  test.use({ role: 'reader' });

  test('the moved dashboard’s tile answers from /MP A’s cube', async ({ page }) => {
    const answers: Response[] = [];
    page.on('response', (response) => {
      if (response.url().endsWith('/api/load') && response.request().method() === 'POST')
        answers.push(response);
    });
    await page.goto(`/explore/dashboards/${ids.keeping}`);
    await expect.poll(() => answers.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
    for (const answer of answers) {
      expect(answer.status(), await answer.text()).toBe(200);
      const data = ((await answer.json()) as { data?: Record<string, unknown>[] }).data ?? [];
      expect(Number(data[0]?.[`${A_CUBE}.count`])).toBeGreaterThan(0);
    }
  });
});

test.describe('cleaning up', () => {
  test.use({ role: 'super' });

  test('removes what the run made', async ({ page }) => {
    const request = page.request;
    for (const id of [ids.stranding, ids.keeping])
      if (id !== '') await request.delete(`/api/documents/dashboard/${id}`);
    // The joining cube first: /MP A's can't go while it refers to it.
    for (const [folder, name] of [
      [ids.j, JOINER],
      [ids.a, A_CUBE],
    ] as const)
      if (folder !== '')
        await request.delete(
          `/api/model/files?folder=${folder}&path=${encodeURIComponent(`cubes/${name}.yml`)}`,
        );
    for (const id of [ids.b, ids.j, ids.c, ids.a, ids.d])
      if (id !== '') await request.delete(`/api/documents/folder/${id}`);
  });
});
