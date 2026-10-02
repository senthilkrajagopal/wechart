import type { APIRequestContext } from '@playwright/test';

import { serviceToken } from '../api-process';
import { landed } from '../model-files';
import { expect, test } from './fixtures';
import { seedRootDefault } from './root-default';
import { changeShared } from './shared-change';

/**
 * T341:
 * - AC-274: WHEN two folders define cubes of the same short name, THE
 *   SYSTEM SHALL publish them under different prefixed names, answer each
 *   folder's items from the cube they were bound to, and keep their
 *   pre-aggregations apart.
 * - AC-328: the shared root's under its short name, any other folder's as
 *   `<folderId>__<shortName>`, the folder's stored xcube id. `Fails when: …
 *   a table or column name Cube builds for it exceeds the database's
 *   identifier limit (63 bytes on Postgres); or renaming or moving a folder
 *   changes a published name, breaks a stored reference, or rebuilds a
 *   pre-aggregation.`
 *
 * Against compose's xcube, as `super`: three `iso_sales` over different rows
 * of one table — the root's the orders not completed, /A's every order, /C's
 * the completed ones — so a chart answered from any cube but its own shows
 * another count.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const ids = { a: '', c: '' };
/** Each folder's chart, bound at save: the root's, /A's and /C's. */
const charts: Record<'root' | 'a' | 'c', string> = { root: '', a: '', c: '' };
/** xcube's admin routes for this suite's model, as its API is given them (the security config). */
const XCUBE = 'http://localhost:54000/cubejs-api/v1/semantic/models/e2e-security';
const xcubeIdOf = (folderId: string) => `f${folderId.replaceAll('-', '')}`;
const full = (folderId: string) => `${xcubeIdOf(folderId)}__iso_sales`;

async function folder(request: APIRequestContext, title: string, parent: string) {
  const made = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: parent },
  });
  expect(made.status()).toBe(201);
  return ((await made.json()) as { id: string }).id;
}

const salesYaml = (source: string) =>
  [
    'cubes:',
    '  - name: iso_sales',
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
async function publish(request: APIRequestContext, folderId: string, source: string) {
  const file = { path: 'cubes/iso_sales.yml', content: salesYaml(source) };
  expect(await landed(request, folderId, [file])).toEqual([file]);
}

/** A chart made in a folder and saved on `iso_sales`, as the editor saves one; its id. */
async function chartIn(request: APIRequestContext, folderId: string, title: string) {
  const made = await request.post('/api/documents', {
    data: { kind: 'chart', title, folderId },
  });
  expect(made.status()).toBe(201);
  const { id } = (await made.json()) as { id: string };
  // Published by an approval of its copy, never saved in place (T502, AC-278).
  const landed = await changeShared(request, 'chart', id, (body) => ({
    ...body,
    chart: {
      source: { cube: 'iso_sales' },
      wells: { measures: ['iso_sales.count'], dimensions: [], timeDimensions: [] },
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

test.describe('two folders’ same-named cubes, kept apart (T341, AC-274, AC-328)', () => {
  test.use({ role: 'super' });

  test('each folder’s cube publishes under its own name, and each chart answers from the one it was bound to', async ({
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
      `sql: "SELECT * FROM public.orders WHERE status <> 'completed'"`,
    );
    await publish(request, ids.a, 'sql_table: public.orders');
    await publish(request, ids.c, `sql: "SELECT * FROM public.orders WHERE status = 'completed'"`);

    const names = (
      (await (await request.get('/api/meta')).json()) as {
        cubes: { name: string }[];
      }
    ).cubes.map((cube) => cube.name);
    expect(names).toEqual(expect.arrayContaining(['iso_sales', full(ids.a), full(ids.c)]));

    // Each folder's chart, bound to its own at save: its source and its
    // measure both name it.
    for (const [key, folderId] of [
      ['root', 'root'],
      ['a', ids.a],
      ['c', ids.c],
    ] as const) {
      charts[key] = await chartIn(request, folderId, `Isolation ${key} ${RUN}`);
      const bound = folderId === 'root' ? 'iso_sales' : full(folderId);
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
      await built(request, 'iso_sales.by_status'),
      await built(request, `${full(ids.a)}.by_status`),
      await built(request, `${full(ids.c)}.by_status`),
    ];

    // Apart by name, not only by the version Cube adds.
    expect(new Set(tables.map(stemOf)).size, tables.join(', ')).toBe(3);
    for (const table of tables)
      for (const part of table.split('.'))
        expect(Buffer.byteLength(part, 'utf8'), table).toBeLessThanOrEqual(63);
    // The root's is the root's own name, as it was before folders: a cube on
    // a connection still at its first identity keeps its names (the user,
    // 2026-09-28: alias only once a target changes; AC-328).
    expect(stemOf(tables[0]!)).toMatch(/(^|_)iso_sales_by_status$/);

    // And the SQL each query runs, the root's and each folder's, reads its
    // own table, naming no identifier over 63 bytes.
    for (const [cube, table] of [
      ['iso_sales', tables[0]!],
      [full(ids.a), tables[1]!],
      [full(ids.c), tables[2]!],
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
    const before = await asked(request, `${full(ids.a)}.count`, `${full(ids.a)}.status`);
    expect(before.builtAt).toBeDefined();
    const chartsBefore = {
      a: await chartCount(request, charts.a),
      c: await chartCount(request, charts.c),
    };
    // Something only /C holds: /A reaches it once xcube has /A beneath /C.
    const onlyC = {
      path: 'cubes/iso_only_c.yml',
      // A measure, so the field list has something to list it by.
      content:
        'cubes:\n  - name: iso_only_c\n    sql_table: public.orders\n    measures:\n      - name: count\n        type: count\n',
    };
    expect(await landed(request, ids.c, [onlyC])).toEqual([onlyC]);
    const onlyCFull = `${xcubeIdOf(ids.c)}__iso_only_c`;
    const resolvedFromA = async () =>
      (
        (await (
          await request.post(`${XCUBE}/resolve`, {
            headers: { authorization: `Bearer ${serviceToken()}` },
            data: { folderId: xcubeIdOf(ids.a), names: ['iso_only_c'] },
          })
        ).json()) as { names?: Record<string, string | null> }
      ).names?.['iso_only_c'] ?? null;
    expect(await resolvedFromA()).toBe(null);

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
    // xcube has the tree with /A beneath /C, and Cube serves the revision
    // that holds /C's new cube: what follows is asked of the model as it is now.
    await expect.poll(resolvedFromA).toBe(onlyCFull);
    await expect
      .poll(
        async () =>
          (
            (await (await request.get('/api/meta')).json()) as { cubes: { name: string }[] }
          ).cubes.some((cube) => cube.name === onlyCFull),
        { timeout: 60_000 },
      )
      .toBe(true);

    // Served as before: the same name, the same answer, from the same
    // rollup build.
    await expect
      .poll(async () => {
        const after = await asked(request, `${full(ids.a)}.count`, `${full(ids.a)}.status`);
        return { count: after.count, builtAt: after.builtAt };
      })
      .toEqual({ count: before.count, builtAt: before.builtAt });
    const names = (
      (await (await request.get('/api/meta')).json()) as {
        cubes: { name: string }[];
      }
    ).cubes.map((cube) => cube.name);
    expect(names).toContain(full(ids.a));
    // And the charts stored before the move answer as they did.
    expect({
      a: await chartCount(request, charts.a),
      c: await chartCount(request, charts.c),
    }).toEqual(chartsBefore);
  });
});
