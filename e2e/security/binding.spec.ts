import type { APIRequestContext } from '@playwright/test';

import { landed } from '../model-files';
import { expect, test } from './fixtures';
import { changeShared } from './shared-change';

/**
 * T428, AC-275, reworked by T729 to R71's one name per item: WHEN a change to
 * a model lands in a folder, a move included, THE SYSTEM SHALL leave every
 * other published item bound as it was published; a delete of a name another
 * published item still references is refused, naming those items. T428's
 * rename case goes: a landed cube's name is never changed (AC-423, T706).
 *
 * Against compose's xcube, through the API as `super`, each run with its own
 * folders and names: /A publishes `binding_orders_<run>` and
 * `binding_lines_<run>`, which joins it; a chart is published in /A/B/C on
 * the orders cube. A shared chart is published by an approval of its copy,
 * never saved in place (T502, AC-278).
 */
const RUN = Math.random().toString(36).slice(2, 8);
const ORDERS = `binding_orders_${RUN}`;
const LINES = `binding_lines_${RUN}`;
const OTHER = `binding_other_${RUN}`;
const ids = { a: '', b: '', c: '', chart: '' };

async function folder(request: APIRequestContext, title: string, parent: string) {
  const made = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: parent },
  });
  expect(made.status()).toBe(201);
  return ((await made.json()) as { id: string }).id;
}

const cubeYaml = (name: string, joins: readonly string[] = [], title?: string) =>
  [
    'cubes:',
    `  - name: ${name}`,
    ...(title === undefined ? [] : [`    title: ${title}`]),
    '    sql_table: public.orders',
    '    measures:',
    '      - name: count',
    '        type: count',
    '    dimensions:',
    '      - name: id',
    '        sql: id',
    '        type: number',
    '        primary_key: true',
    ...(joins.length === 0
      ? []
      : [
          '    joins:',
          ...joins.flatMap((join) => [
            `      - name: ${join}`,
            '        relationship: many_to_one',
            `        sql: "{CUBE}.id = {${join}.id}"`,
          ]),
        ]),
    '',
  ].join('\n');

/**
 * A cube put in a shared folder as a model changes now: through My workspace
 * and a proposal `super` approves (T451, AC-278), never published in place.
 */
async function publish(
  request: APIRequestContext,
  folderId: string,
  name: string,
  joins: string[] = [],
  title?: string,
) {
  const file = { path: `cubes/${name}.yml`, content: cubeYaml(name, joins, title) };
  expect(await landed(request, folderId, [file])).toEqual([file]);
}

/**
 * The chart published with `cube`: a shared one is changed in a copy, and
 * published when that is approved, which binds it (T502, AC-278, AC-272).
 */
const saveChart = (request: APIRequestContext, cube: string) =>
  changeShared(request, 'chart', ids.chart, (body) => ({
    ...body,
    chart: {
      source: { cube },
      wells: { measures: [`${cube}.count`], dimensions: [], timeDimensions: [] },
    },
  }));

const storedCube = async (request: APIRequestContext) =>
  (await (await request.get(`/api/documents/chart/${ids.chart}`)).json()) as {
    body: Record<string, unknown> & {
      chart: { source: { cube: string }; wells: { measures: string[] } };
    };
    version: number;
  };

/** What the stored chart's query answers: its measure's count, as a tile asks it. */
const answered = async (request: APIRequestContext) => {
  const [measure = ''] = (await storedCube(request)).body.chart.wells.measures;
  const answer = (await (
    await request.post('/api/load', { data: { query: { measures: [measure] } } })
  ).json()) as { data?: Record<string, unknown>[] };
  return Number(answer.data?.[0]?.[measure]);
};

const deleteIn = (request: APIRequestContext, folderId: string, name: string) =>
  request.delete(
    `/api/model/files?folder=${folderId}&path=${encodeURIComponent(`cubes/${name}.yml`)}`,
  );

test.describe.configure({ mode: 'serial' });

test.describe('published items stay bound through any landing, a move included (T428, T729; AC-275)', () => {
  test.use({ role: 'super' });

  test('a chart keeps querying its cube by its own name through landings and a move', async ({
    page,
  }) => {
    const request = page.request;
    ids.a = await folder(request, `Binding A ${RUN}`, 'root');
    ids.b = await folder(request, `Binding B ${RUN}`, ids.a);
    ids.c = await folder(request, `Binding C ${RUN}`, ids.b);
    await publish(request, ids.a, ORDERS);
    await publish(request, ids.a, LINES, [ORDERS]);

    const made = await request.post('/api/documents', {
      data: { kind: 'chart', title: `Bound ${RUN}`, folderId: ids.c },
    });
    ids.chart = ((await made.json()) as { id: string }).id;
    expect(await saveChart(request, ORDERS)).toEqual([
      { kind: 'chart', id: ids.chart, version: 2 },
    ]);
    // Bound by the cube's own name: no folder prefix (AC-272, AC-328).
    expect((await storedCube(request)).body.chart.wells.measures).toEqual([`${ORDERS}.count`]);
    const before = await answered(request);
    expect(before).toBeGreaterThan(0);

    // Landings: /A/B publishes a cube of its own, and /A's orders cube a new
    // title. The chart, already published, is left as it was, and answers
    // as it did.
    await publish(request, ids.b, OTHER);
    await publish(request, ids.a, ORDERS, [], `Orders ${RUN}`);
    const kept = await storedCube(request);
    expect(kept.body.chart.wells.measures).toEqual([`${ORDERS}.count`]);
    expect(await answered(request)).toBe(before);

    // A move: /A/B/C, holding the chart, beneath /A, still on /A's path.
    const moved = await request.patch(`/api/documents/folder/${ids.c}`, {
      data: { folderId: ids.a },
    });
    expect(moved.status(), await moved.text()).toBe(200);
    expect((await storedCube(request)).body.chart.wells.measures).toEqual([`${ORDERS}.count`]);
    expect(await answered(request)).toBe(before);

    // Published again, as it is: the same cube, the same answer.
    const republished = await changeShared(request, 'chart', ids.chart, (body) => body);
    expect(republished).toEqual([{ kind: 'chart', id: ids.chart, version: kept.version + 1 }]);
    expect((await storedCube(request)).body.chart.wells.measures).toEqual([`${ORDERS}.count`]);
    expect(await answered(request)).toBe(before);
  });

  test('a delete of a cube a chart or a cube references is refused, naming them, and one nothing uses applies', async ({
    page,
  }) => {
    const request = page.request;
    // The chart names it, and /A's lines cube joins it: refused, naming
    // both, the cube from xcube's bindings (AC-365).
    const refused = await deleteIn(request, ids.a, ORDERS);
    expect(refused.status(), await refused.text()).toBe(409);
    expect(await refused.json()).toEqual({
      error: `“${ORDERS}” is still used by the cube “${LINES}” and the chart “Bound ${RUN}”.`,
      views: [],
      cubes: [{ name: LINES, folderId: ids.a }],
      charts: [{ id: ids.chart, title: `Bound ${RUN}` }],
      dashboards: [],
      hidden: 0,
    });

    // The chart gone, the lines cube is all that still joins it.
    expect((await request.delete(`/api/documents/chart/${ids.chart}`)).status()).toBeLessThan(300);
    const joined = await deleteIn(request, ids.a, ORDERS);
    expect(joined.status(), await joined.text()).toBe(409);
    expect(await joined.json()).toEqual({
      error: `“${ORDERS}” is still used by the cube “${LINES}”.`,
      views: [],
      cubes: [{ name: LINES, folderId: ids.a }],
      charts: [],
      dashboards: [],
      hidden: 0,
    });

    // The lines cube itself nothing uses: deleted, and then the orders cube too.
    expect((await deleteIn(request, ids.a, LINES)).status()).toBe(200);
    expect((await deleteIn(request, ids.a, ORDERS)).status()).toBe(200);
    expect((await deleteIn(request, ids.b, OTHER)).status()).toBe(200);
    const left = (await (await request.get(`/api/model/files?folder=${ids.a}`)).json()) as {
      files: unknown[];
    };
    expect(left.files).toEqual([]);
    // And xcube serves neither any more: the delete reached it.
    await expect
      .poll(async () => {
        const meta = (await (await request.get('/api/meta')).json()) as {
          cubes?: { name: string }[];
        };
        return (meta.cubes ?? [])
          .map((cube) => cube.name)
          .filter((name) => [ORDERS, LINES, OTHER].includes(name));
      })
      .toEqual([]);
  });
});
