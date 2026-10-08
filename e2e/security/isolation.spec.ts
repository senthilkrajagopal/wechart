import type { APIRequestContext } from '@playwright/test';

import { serviceToken } from '../api-process';
import { landed } from '../model-files';
import { expect, test } from './fixtures';
import { seedRootDefault } from './root-default';
import { changeShared } from './shared-change';

/**
 * T341, reworked by T728 to R71 (AC-274's same-named cubes went with it):
 * AC-328, each cube published under its own name in any folder, the shared
 * root's and two folders', one cube per name. `Fails when: … a table or
 * column name Cube builds for it exceeds the database's identifier limit (63
 * bytes on Postgres); or renaming or moving a folder changes a published
 * name, breaks a stored reference, or rebuilds a pre-aggregation.`
 *
 * Against compose's xcube, as `super`: three cubes over different rows of one
 * table — the root's the orders not completed, /A's every order, /C's the
 * completed ones — so a chart answered from any cube but its own shows
 * another count.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const ids = { a: '', c: '' };
/** Each folder's chart, bound at save: the root's, /A's and /C's. */
const charts: Record<'root' | 'a' | 'c', string> = { root: '', a: '', c: '' };
/** xcube's admin routes for this suite's model, as its API is given them (the security config). */
const XCUBE = 'http://localhost:54000/cubejs-api/v1/semantic/models/e2e-security';
const xcubeIdOf = (folderId: string) => `f${folderId.replaceAll('-', '')}`;
/** Each folder's cube, by its own name: one item per name (AC-421). */
const cubes = { root: `iso_root_${RUN}`, a: `iso_a_${RUN}`, c: `iso_c_${RUN}` } as const;

async function folder(request: APIRequestContext, title: string, parent: string) {
  const made = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: parent },
  });
  expect(made.status()).toBe(201);
  return ((await made.json()) as { id: string }).id;
}

const salesYaml = (name: string, source: string) =>
  [
    'cubes:',
    `  - name: ${name}`,
    `    ${source}`,
    '    measures:',
    '      - name: count',
    '        type: count',
    '    dimensions:',
    '      - name: status',
    '        sql: status',
    '        type: string',
    '    pre_aggregations:',
    '      - name: by_status',
    '        measures: [count]',
    '        dimensions: [status]',
    '',
  ].join('\n');

/** Through My workspace and a proposal `super` approves (T451, AC-278). */
async function publish(request: APIRequestContext, folderId: string, name: string, source: string) {
  const file = { path: `cubes/${name}.yml`, content: salesYaml(name, source) };
  expect(await landed(request, folderId, [file])).toEqual([file]);
}

/** A chart made in a folder and saved on its cube, as the editor saves one; its id. */
async function chartIn(request: APIRequestContext, folderId: string, title: string, cube: string) {
  const made = await request.post('/api/documents', {
    data: { kind: 'chart', title, folderId },
  });
  expect(made.status()).toBe(201);
  const { id } = (await made.json()) as { id: string };
  // Published by an approval of its copy, never saved in place (T502, AC-278).
  const landed = await changeShared(request, 'chart', id, (body) => ({
    ...body,
    chart: {
      source: { cube },
      wells: { measures: [`${cube}.count`], dimensions: [], timeDimensions: [] },
    },
  }));
  expect(landed).toEqual([{ kind: 'chart', id, version: 2 }]);
  return id;
}

/** A stored chart's measure: what its tile asks. */
async function measureOf(request: APIRequestContext, chartId: string) {
  const stored = (await (await request.get(`/api/documents/chart/${chartId}`)).json()) as {
    body: { chart: { source: { cube: string }; wells: { measures: string[] } } };
  };
  const [measure = ''] = stored.body.chart.wells.measures;
  return {
    cube: stored.body.chart.source.cube,
    measures: stored.body.chart.wells.measures,
    measure,
  };
}

/** A query's count, and what its rollup was last built at. */
async function asked(request: APIRequestContext, measure: string, dimension?: string) {
  type Answer = {
    data?: Record<string, unknown>[];
    usedPreAggregations?: Record<string, { lastUpdatedAt?: number }>;
  };
  let answer: Answer = {};
  // Answered with data: a revision just published may still be loading.
  await expect
    .poll(
      async () => {
        const response = await request.post('/api/load', {
          data: {
            query: {
              measures: [measure],
              ...(dimension === undefined ? {} : { dimensions: [dimension] }),
            },
          },
        });
        answer = (await response.json()) as Answer;
        return response.ok() && Array.isArray(answer.data) ? 'answered' : await response.text();
      },
      { timeout: 60_000 },
    )
    .toBe('answered');
  const counts = (answer.data ?? []).map((row) => Number(row[measure]));
  return {
    count: counts.reduce((sum, each) => sum + each, 0),
    builtAt: Object.values(answer.usedPreAggregations ?? {})[0]?.lastUpdatedAt,
  };
}

/** A chart's own query answered: the count its tile shows. */
const chartCount = async (request: APIRequestContext, chartId: string) =>
  (await asked(request, (await measureOf(request, chartId)).measure)).count;

/** A rollup built, and the table its build wrote. */
async function built(request: APIRequestContext, preAggregation: string): Promise<string> {
  const started = (await (
    await request.post('/api/builds', { data: { preAggregation } })
  ).json()) as { tokens: string[] };
  expect(started.tokens.length, preAggregation).toBeGreaterThan(0);
  let table = '';
  await expect
    .poll(
      async () => {
        const answered = (await (
          await request.post('/api/builds/status', { data: { tokens: started.tokens } })
        ).json()) as { status: string; table?: string }[];
        table = answered.find((each) => each.table !== undefined)?.table ?? '';
        return answered.every((each) => each.status === 'done');
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  expect(table, preAggregation).not.toBe('');
  return table;
}

/** A rollup table's name before the version Cube adds: `…_by_status`. */
const stemOf = (table: string) => {
  const name = table.split('.').at(-1) ?? '';
  return name.slice(0, name.indexOf('_by_status') + '_by_status'.length);
};

/** The SQL the query a rollup serves runs. */
async function sqlOf(request: APIRequestContext, cube: string) {
  const planned = (await (
    await request.post('/api/sql', {
      data: { query: { measures: [`${cube}.count`], dimensions: [`${cube}.status`] } },
    })
  ).json()) as { queries: { sql: string }[] };
  return planned.queries.map((query) => query.sql).join('\n');
}

test.describe.configure({ mode: 'serial' });

test.describe('cubes in the root and in folders, each under its own name (T341, T728; AC-328)', () => {
  test.use({ role: 'super' });

  test('each folder’s cube publishes under its own name, with no folder prefix, and each chart answers from the one it was bound to', async ({
    page,
  }) => {
    const request = page.request;
    // The root's `default` stored first, as an install's Job stores it. A
    // reset leaves it in xcube while the root's cubes are published, and from
    // `465865f3fd` the root keeps its names without it; seeded all the same,
    // a second seeding changing nothing (xcube-465865f3fd.md, findings 8, 9).
    const seeded = await seedRootDefault();
    expect(seeded.code, seeded.said.join('\n')).toBe(0);
    ids.a = await folder(request, `Isolation A ${RUN}`, 'root');
    ids.c = await folder(request, `Isolation C ${RUN}`, 'root');
    await publish(
      request,
      'root',
      cubes.root,
      `sql: "SELECT * FROM public.orders WHERE status <> 'completed'"`,
    );
    await publish(request, ids.a, cubes.a, 'sql_table: public.orders');
    await publish(
      request,
      ids.c,
      cubes.c,
      `sql: "SELECT * FROM public.orders WHERE status = 'completed'"`,
    );

    const names = (
      (await (await request.get('/api/meta')).json()) as {
        cubes: { name: string }[];
      }
    ).cubes.map((cube) => cube.name);
    expect(names).toEqual(expect.arrayContaining([cubes.root, cubes.a, cubes.c]));
    // No folder's prefix on any (AC-328).
    expect(names.filter((name) => name.includes('__'))).toEqual([]);
    // Each held by xcube in its folder's stored xcube id.
    const held = (
      (await (
        await request.get(`${XCUBE}/items`, {
          headers: { authorization: `Bearer ${serviceToken()}` },
        })
      ).json()) as { items: { folderId: string; name: string }[] }
    ).items
      .filter((item) => Object.values(cubes).includes(item.name as never))
      .map(({ folderId, name }) => ({ folderId, name }));
    expect(held).toEqual(
      expect.arrayContaining([
        { folderId: 'froot', name: cubes.root },
        { folderId: xcubeIdOf(ids.a), name: cubes.a },
        { folderId: xcubeIdOf(ids.c), name: cubes.c },
      ]),
    );
    expect(held).toHaveLength(3);

    // Each folder's chart, bound to its own at save: its source and its
    // measure both name it.
    for (const [key, folderId] of [
      ['root', 'root'],
      ['a', ids.a],
      ['c', ids.c],
    ] as const) {
      const bound = cubes[key];
      charts[key] = await chartIn(request, folderId, `Isolation ${key} ${RUN}`, bound);
      const stored = await measureOf(request, charts[key]);
      expect({ cube: stored.cube, measures: stored.measures }).toEqual({
        cube: bound,
        measures: [`${bound}.count`],
      });
    }

    // And each answers its own count, as its tile asks it: /A's every order,
    // /C's the completed, the root's the rest — three counts, none another's.
    const counts = {
      root: await chartCount(request, charts.root),
      a: await chartCount(request, charts.a),
      c: await chartCount(request, charts.c),
    };
    expect(counts.c).toBeLessThan(counts.a);
    expect(counts.root).toBeLessThan(counts.a);
    expect(new Set(Object.values(counts)).size, JSON.stringify(counts)).toBe(3);
  });

  test('their rollups build into tables of their own, none over 63 bytes', async ({ page }) => {
    const request = page.request;
    const tables = [
      await built(request, `${cubes.root}.by_status`),
      await built(request, `${cubes.a}.by_status`),
      await built(request, `${cubes.c}.by_status`),
    ];

    // Apart by name, not only by the version Cube adds.
    expect(new Set(tables.map(stemOf)).size, tables.join(', ')).toBe(3);
    for (const table of tables)
      for (const part of table.split('.'))
        expect(Buffer.byteLength(part, 'utf8'), table).toBeLessThanOrEqual(63);
    // Each is its own name, in the root and in a folder alike: a plain
    // lower-case cube on `default` with short names gets no alias in any
    // folder (research `xcube-256d632371.md`, R72's last smaller call; AC-328).
    for (const [index, cube] of [cubes.root, cubes.a, cubes.c].entries())
      expect(stemOf(tables[index]!)).toMatch(new RegExp(`(^|_)${cube}_by_status$`));

    // And the SQL each query runs, the root's and each folder's, reads its
    // own table, naming no identifier over 63 bytes.
    for (const [cube, table] of [
      [cubes.root, tables[0]!],
      [cubes.a, tables[1]!],
      [cubes.c, tables[2]!],
    ] as const) {
      const sql = await sqlOf(request, cube);
      expect(sql, cube).toContain(stemOf(table));
      for (const identifier of sql.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])
        expect(Buffer.byteLength(identifier, 'utf8'), identifier).toBeLessThanOrEqual(63);
    }
  });

  test('renaming and moving /A changes no published name, breaks no chart, and rebuilds no rollup', async ({
    page,
  }) => {
    const request = page.request;
    const before = await asked(request, `${cubes.a}.count`, `${cubes.a}.status`);
    expect(typeof before.builtAt).toBe('number');
    const chartsBefore = {
      a: await chartCount(request, charts.a),
      c: await chartCount(request, charts.c),
    };
    /** Where xcube holds /A's cube: its folder's stored xcube id, never another. */
    const heldA = async () =>
      (
        (await (
          await request.get(`${XCUBE}/items`, {
            headers: { authorization: `Bearer ${serviceToken()}` },
          })
        ).json()) as { items: { folderId: string; name: string }[] }
      ).items
        .filter((item) => item.name === cubes.a)
        .map(({ folderId, name }) => ({ folderId, name }));
    expect(await heldA()).toEqual([{ folderId: xcubeIdOf(ids.a), name: cubes.a }]);
    // Something only /C holds, published after: the model as it is now.
    const onlyC = {
      path: `cubes/iso_only_c_${RUN}.yml`,
      // A measure, so the field list has something to list it by, and a key
      // for a join to it.
      content: `cubes:\n  - name: iso_only_c_${RUN}\n    sql_table: public.orders\n    dimensions:\n      - name: id\n        sql: id\n        type: number\n        primary_key: true\n    measures:\n      - name: count\n        type: count\n`,
    };
    expect(await landed(request, ids.c, [onlyC])).toEqual([onlyC]);
    // A cube of /A's joining it: off /A's path while /A is beside /C, so
    // xcube refuses its save (`reference_range`, research
    // `xcube-256d632371.md`, R72; T713). Taken once /A is beneath /C: the
    // move observed in xcube's tree, not only in wechart's.
    const joiner = {
      path: `cubes/iso_joins_c_${RUN}.yml`,
      content: [
        'cubes:',
        `  - name: iso_joins_c_${RUN}`,
        '    sql_table: public.orders',
        '    dimensions:',
        '      - name: id',
        '        sql: id',
        '        type: number',
        '        primary_key: true',
        '    measures:',
        '      - name: count',
        '        type: count',
        '    joins:',
        `      - name: iso_only_c_${RUN}`,
        '        relationship: many_to_one',
        `        sql: "{CUBE}.id = {iso_only_c_${RUN}}.id"`,
        '',
      ].join('\n'),
    };
    const project = await folder(request, `Isolation joins ${RUN}`, 'mine');
    const offPath = await request.post('/api/model/publish', {
      data: { folderId: project, targetFolderId: ids.a, files: [joiner] },
      timeout: 90_000,
    });
    expect(offPath.status(), await offPath.text()).toBe(422);
    expect(
      ((await offPath.json()) as { errors: { path: string }[] }).errors.map((each) => each.path),
    ).toEqual([joiner.path]);
    expect((await request.delete(`/api/documents/folder/${project}`)).status()).toBeLessThan(300);

    expect(
      (
        await request.patch(`/api/documents/folder/${ids.a}`, {
          data: { title: `Isolation A renamed ${RUN}` },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.patch(`/api/documents/folder/${ids.a}`, { data: { folderId: ids.c } })
      ).status(),
    ).toBe(200);
    // xcube's tree has /A beneath /C: the cube joining /C's now lands in /A.
    expect(await landed(request, ids.a, [joiner])).toEqual([joiner]);
    // Cube serves the revision that holds /C's new cube: what follows is
    // asked of the model as it is now.
    await expect
      .poll(
        async () =>
          (
            (await (await request.get('/api/meta')).json()) as { cubes: { name: string }[] }
          ).cubes.some((cube) => cube.name === `iso_only_c_${RUN}`),
        { timeout: 60_000 },
      )
      .toBe(true);

    // Served as before: the same name, held in the same xcube id, the same
    // answer, from the same rollup build.
    expect(await heldA()).toEqual([{ folderId: xcubeIdOf(ids.a), name: cubes.a }]);
    await expect
      .poll(async () => {
        const after = await asked(request, `${cubes.a}.count`, `${cubes.a}.status`);
        return { count: after.count, builtAt: after.builtAt };
      })
      .toEqual({ count: before.count, builtAt: before.builtAt });
    const names = (
      (await (await request.get('/api/meta')).json()) as {
        cubes: { name: string }[];
      }
    ).cubes.map((cube) => cube.name);
    expect(names).toContain(cubes.a);
    expect(names.filter((name) => name.includes('__'))).toEqual([]);
    // And the charts stored before the move answer as they did.
    expect({
      a: await chartCount(request, charts.a),
      c: await chartCount(request, charts.c),
    }).toEqual(chartsBefore);
  });
});
