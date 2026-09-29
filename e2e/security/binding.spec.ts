import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './fixtures';
import { changeShared } from './shared-change';

/**
 * T428, AC-275: WHEN a change to a model lands in a folder, THE SYSTEM SHALL
 * leave every other published item bound as it was published; an item
 * beneath a nearer new definition binds to it only when that item is next
 * published; a delete or rename of a name another published item still
 * references is refused, naming those items.
 *
 * Against compose's xcube, through the API as `super`, each run with its own
 * folders: /A publishes `binding_orders` and `binding_lines`, which joins it;
 * a chart is published in /A/B/C; then /A/B publishes its own
 * `binding_orders`. A shared chart is published by an approval of its copy,
 * never saved in place (T502, AC-278).
 */
const RUN = Math.random().toString(36).slice(2, 8);
const ids = { a: '', b: '', c: '', chart: '' };
const full = (folderId: string, name: string) => `f${folderId.replaceAll('-', '')}__${name}`;

async function folder(request: APIRequestContext, title: string, parent: string) {
  const made = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: parent },
  });
  expect(made.status()).toBe(201);
  return ((await made.json()) as { id: string }).id;
}

const cubeYaml = (name: string, joins: readonly string[] = [], empty = false) =>
  [
    'cubes:',
    `  - name: ${name}`,
    // An empty one, where its answer must tell it from another of its name.
    empty ? '    sql: "SELECT * FROM public.orders WHERE false"' : '    sql_table: public.orders',
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

async function publish(
  request: APIRequestContext,
  folderId: string,
  name: string,
  joins: string[] = [],
  empty = false,
) {
  const published = await request.post('/api/model/publish', {
    data: {
      folderId,
      files: [{ path: `cubes/${name}.yml`, content: cubeYaml(name, joins, empty) }],
    },
  });
  expect(published.status(), await published.text()).toBe(200);
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

test.describe('published items stay bound until published again (T428, AC-275)', () => {
  test.use({ role: 'super' });

  test('a chart keeps /A’s cube when /A/B publishes its own, and takes /A/B’s when published again', async ({
    page,
  }) => {
    const request = page.request;
    ids.a = await folder(request, `Binding A ${RUN}`, 'root');
    ids.b = await folder(request, `Binding B ${RUN}`, ids.a);
    ids.c = await folder(request, `Binding C ${RUN}`, ids.b);
    await publish(request, ids.a, 'binding_orders');
    await publish(request, ids.a, 'binding_lines', ['binding_orders']);

    const made = await request.post('/api/documents', {
      data: { kind: 'chart', title: `Bound ${RUN}`, folderId: ids.c },
    });
    ids.chart = ((await made.json()) as { id: string }).id;
    expect(await saveChart(request, 'binding_orders')).toEqual([
      { kind: 'chart', id: ids.chart, version: 2 },
    ]);
    expect((await storedCube(request)).body.chart.wells.measures).toEqual([
      `${full(ids.a, 'binding_orders')}.count`,
    ]);
    const before = await answered(request);
    expect(before).toBeGreaterThan(0);

    // /A/B's own, nearer, and empty: the chart, already published, is left
    // as it was, and answers as it did.
    await publish(request, ids.b, 'binding_orders', [], true);
    const kept = await storedCube(request);
    expect(kept.body.chart.wells.measures).toEqual([`${full(ids.a, 'binding_orders')}.count`]);
    expect(await answered(request)).toBe(before);

    // Deleting /A's while the chart names it is refused, naming the chart.
    const refused = await deleteIn(request, ids.a, 'binding_orders');
    expect(refused.status()).toBe(409);
    expect(await refused.json()).toEqual({
      error: `“binding_orders” is still used by the chart “Bound ${RUN}”.`,
      charts: [{ id: ids.chart, title: `Bound ${RUN}` }],
      dashboards: [],
      hidden: 0,
    });

    // Not bound anew in place: its stored body saved again is refused (T502).
    const inPlace = await request.put(`/api/documents/chart/${ids.chart}`, {
      data: { version: kept.version, body: kept.body },
    });
    expect(inPlace.status(), await inPlace.text()).toBe(409);
    expect(((await inPlace.json()) as { code: string }).code).toBe('shared_in_place');
    // Published again — as it is, through its copy and an approval — it takes
    // /A/B's, and answers from it.
    const republished = await changeShared(request, 'chart', ids.chart, (body) => body);
    expect(republished).toEqual([{ kind: 'chart', id: ids.chart, version: kept.version + 1 }]);
    expect((await storedCube(request)).body.chart.wells.measures).toEqual([
      `${full(ids.b, 'binding_orders')}.count`,
    ]);
    expect(await answered(request)).toBe(0);
  });

  test('a delete another model item is bound to is refused by xcube, and one nothing uses applies', async ({
    page,
  }) => {
    const request = page.request;
    // Renaming /A/B's `binding_orders`, which the chart now names, is refused.
    const renamed = await request.post('/api/model/publish', {
      data: {
        folderId: ids.b,
        files: [{ path: 'cubes/binding_orders.yml', content: cubeYaml('binding_renamed') }],
      },
    });
    expect(renamed.status()).toBe(409);
    expect(((await renamed.json()) as { error: string }).error).toBe(
      `“binding_orders” is still used by the chart “Bound ${RUN}”.`,
    );

    // /A's `binding_lines` joins /A's `binding_orders`: xcube refuses the delete.
    const refused = await deleteIn(request, ids.a, 'binding_orders');
    expect(refused.status(), await refused.text()).toBe(422);
    expect(JSON.stringify(await refused.json())).toContain('binding_lines');

    // `binding_lines` itself nothing uses: deleted, and then `binding_orders` too.
    expect((await deleteIn(request, ids.a, 'binding_lines')).status()).toBe(200);
    expect((await deleteIn(request, ids.a, 'binding_orders')).status()).toBe(200);
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
          .filter((name) => name.startsWith(full(ids.a, '')));
      })
      .toEqual([]);
  });
});
