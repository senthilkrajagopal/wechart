import type { APIRequestContext } from '@playwright/test';

import { CUBE } from '../api-process';
import { inMyWorkspace, landed, proposedModel } from '../model-files';
import { queryToken } from '../tokens';
import { expect, test } from './fixtures';
import { changeShared } from './shared-change';

/**
 * T436 (AC-320, AC-263, AC-321): Cube itself refuses what wechart refuses.
 * The suite's API pushes every folder's allowed groups to xcube, with
 * security on, when it starts and after every permission or folder change:
 * a folder's allowed groups are those granted on it, above it or below it,
 * and the Super-Admin group (research `xcube-slice-4.md`, "PUT …/folders",
 * "What the gate does on Cube's routes").
 *
 * Asked of compose's xcube directly, past wechart's own check, with tokens
 * signed as the API signs them (RS256 under its pushed key, `e2e/tokens.ts`),
 * and through the app for a read-only user and a publish:
 *
 *   /Refuses A <run>          no grant         cube refuses_a_<run>, and a policied one
 *   /Refuses A <run>/B        read-write  ab-<run>
 *   /Refuses C <run>          read-only   c-<run>        cube refuses_c_<run>
 *   /Refuses N <run>          no grant, none beneath     cube refuses_n_<run>
 *   /Refuses R <run>          read-only   sales-ro       a dashboard on the root's `orders`
 *
 * The AC-321 case shows a break refused with security on; that the probes
 * run as the Super-Admin group is `access/models.test.ts`'s.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const MODEL = 'e2e-security';
const SUPER = 'wechart-super-admins';
const G = { ab: `ab-${RUN}`, c: `c-${RUN}`, cd: `cd-${RUN}` };
const CUBES = {
  a: `refuses_a_${RUN}`,
  c: `refuses_c_${RUN}`,
  cd: `refuses_cd_${RUN}`,
  n: `refuses_n_${RUN}`,
  policied: `refuses_p_${RUN}`,
};
const ids = { a: '', b: '', c: '', cd: '', n: '', r: '', board: '', chart: '' };
const full = (folderId: string, name: string) => `f${folderId.replaceAll('-', '')}__${name}`;

async function folder(request: APIRequestContext, title: string, parent: string) {
  const made = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: parent },
  });
  expect(made.status(), await made.text()).toBe(201);
  return ((await made.json()) as { id: string }).id;
}

async function grant(
  request: APIRequestContext,
  folderId: string,
  access: { readOnly: string[] | null; readWrite: string[] | null },
) {
  const set = await request.put(`/api/folders/${folderId}/access`, { data: access });
  expect(set.status(), await set.text()).toBe(200);
}

const cubeYaml = (name: string, extra: readonly string[] = []) =>
  [
    'cubes:',
    `  - name: ${name}`,
    '    sql_table: public.orders',
    '    dimensions:',
    '      - name: id',
    '        sql: id',
    '        type: number',
    '        primary_key: true',
    '      - name: status',
    '        sql: status',
    '        type: string',
    '    measures:',
    '      - name: count',
    '        type: count',
    ...extra,
    '',
  ].join('\n');

/** Put in a shared folder through My workspace and a proposal `super` approves (T451, AC-278). */
async function publish(request: APIRequestContext, folderId: string, name: string, yaml: string) {
  const file = { path: `cubes/${name}.yml`, content: yaml };
  expect(await landed(request, folderId, [file])).toEqual([file]);
}

interface Answer {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly revision: string | null;
}

/**
 * Cube asked directly with a token carrying `groups`, as wechart signs one:
 * a catching-up 503 and Cube's "Continue wait" are asked again, as wechart
 * does. What comes back is the first real answer.
 */
async function count(groups: readonly string[], member: string, model = MODEL): Promise<Answer> {
  const query = encodeURIComponent(JSON.stringify({ measures: [`${member}.count`] }));
  for (let ask = 0; ; ask += 1) {
    const response = await fetch(`${CUBE}/v1/load?query=${query}`, {
      headers: { authorization: `Bearer ${queryToken({ groups, wechartModel: model })}` },
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const again =
      response.status === 503 || (response.status === 200 && body['error'] === 'Continue wait');
    if (!again || ask >= 30)
      return { status: response.status, body, revision: response.headers.get('x-xcube-revision') };
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

const rows = (answer: Answer, member: string) =>
  Number((answer.body['data'] as Record<string, unknown>[] | undefined)?.[0]?.[`${member}.count`]);

/**
 * Cube's answer once it admits the groups: the API puts the tree to xcube
 * as a grant's answer is sent, and every Cube instance applies it within
 * 60 seconds (AC-320).
 */
async function admitted(groups: readonly string[], member: string): Promise<Answer> {
  let answer: Answer | undefined;
  await expect
    .poll(
      async () => {
        answer = await count(groups, member);
        return answer.status;
      },
      { timeout: 60_000, intervals: [1_000] },
    )
    .toBe(200);
  return answer!;
}

/** Refused by xcube's folder gate: a 403 naming the folder the groups don't reach. */
const refused = (answer: Answer) => ({
  status: answer.status,
  gate: /None of these groups reaches folder/.test(String(answer.body['error'] ?? '')),
});

test.describe.configure({ mode: 'serial' });

test.describe('Cube refuses what wechart refuses (T436, AC-320)', () => {
  test.use({ role: 'super' });

  test('makes the folders, their grants and cubes', async ({ page }) => {
    const request = page.request;
    ids.a = await folder(request, `Refuses A ${RUN}`, 'root');
    ids.b = await folder(request, 'B', ids.a);
    ids.c = await folder(request, `Refuses C ${RUN}`, 'root');
    // /C/D sets a group of its own, beneath /C's (T408, AC-261).
    ids.cd = await folder(request, 'D', ids.c);
    await grant(request, ids.b, { readOnly: null, readWrite: [G.ab] });
    await grant(request, ids.c, { readOnly: [G.c], readWrite: null });
    await grant(request, ids.cd, { readOnly: null, readWrite: [G.cd] });
    await publish(request, ids.a, CUBES.a, cubeYaml(CUBES.a));
    await publish(request, ids.c, CUBES.c, cubeYaml(CUBES.c));
    await publish(request, ids.cd, CUBES.cd, cubeYaml(CUBES.cd));
    // An authored row-level policy: /A/B's group sees shipped orders alone,
    // the Super-Admins every row (no Super-Admin bypass of authored policies).
    await publish(
      request,
      ids.a,
      CUBES.policied,
      cubeYaml(CUBES.policied, [
        '    access_policy:',
        `      - group: ${G.ab}`,
        '        row_level:',
        '          filters:',
        '            - member: status',
        '              operator: equals',
        '              values: [shipped]',
        `      - group: ${SUPER}`,
        '        row_level:',
        '          allow_all: true',
      ]),
    );
  });

  test('a token none of whose groups a folder allows gets nothing from its cubes', async () => {
    const c = full(ids.c, CUBES.c);
    expect(refused(await count([G.ab], c))).toEqual({ status: 403, gate: true });
    expect(refused(await count([], c))).toEqual({ status: 403, gate: true });
    // Its own group, and the Super-Admins', which every folder admits.
    for (const groups of [[G.c], [SUPER]])
      expect(rows(await admitted(groups, c), c)).toBeGreaterThan(0);
  });

  test('a member of a group granted on /A/B gets the /A cube their charts are bound to', async () => {
    const a = full(ids.a, CUBES.a);
    expect(rows(await admitted([G.ab], a), a)).toBeGreaterThan(0);
  });

  // T408 (AC-255): a token of 20 groups, only the last of which /C allows.
  test('a member of 20 groups gets a folder’s cube through the last of them alone', async () => {
    const c = full(ids.c, CUBES.c);
    const twenty = [...Array.from({ length: 19 }, (_, at) => `other-${String(at)}-${RUN}`), G.c];
    expect(rows(await admitted(twenty, c), c)).toBeGreaterThan(0);
    expect(refused(await count(twenty.slice(0, 19), c))).toEqual({ status: 403, gate: true });
  });

  // T408 (AC-261): /C's group reaches /C/D, whatever group /C/D sets.
  test('a group granted on a folder gets its descendant’s cube, whatever group that sets', async () => {
    const cd = full(ids.cd, CUBES.cd);
    expect(rows(await admitted([G.c], cd), cd)).toBeGreaterThan(0);
    expect(rows(await admitted([G.cd], cd), cd)).toBeGreaterThan(0);
    expect(refused(await count([G.ab], cd))).toEqual({ status: 403, gate: true });
  });

  test('an authored row-level policy still filters within', async () => {
    const policied = full(ids.a, CUBES.policied);
    const [member, everyone] = [
      await admitted([G.ab], policied),
      await admitted([SUPER], policied),
    ];
    expect(rows(member, policied)).toBeGreaterThan(0);
    expect(rows(member, policied)).toBeLessThan(rows(everyone, policied));
  });

  /**
   * Both ways within 60 seconds. That no module is compiled for it is
   * xcube's own test (research `xcube-slice-4.md`, "What the gate does":
   * [t-sec] L300-315): the model's revision is shared with the suite's other
   * specs here, so it can't show that.
   */
  test('a permission change applies within 60 seconds, granted and revoked', async ({ page }) => {
    const c = full(ids.c, CUBES.c);
    const before = await admitted([G.c], c);
    // Answered from a revision xcube names, as every answer it serves is.
    expect(before.revision).toMatch(new RegExp(`^${MODEL}@\\d+$`));
    expect(refused(await count([G.ab], c))).toEqual({ status: 403, gate: true });

    await grant(page.request, ids.c, { readOnly: [G.c, G.ab], readWrite: null });
    let at = Date.now();
    await expect
      .poll(async () => (await count([G.ab], c)).status, { timeout: 60_000, intervals: [1_000] })
      .toBe(200);
    expect(Date.now() - at).toBeLessThan(60_000);

    // Revoked: refused again.
    await grant(page.request, ids.c, { readOnly: [G.c], readWrite: null });
    at = Date.now();
    await expect
      .poll(async () => refused(await count([G.ab], c)), { timeout: 60_000, intervals: [1_000] })
      .toEqual({ status: 403, gate: true });
    expect(Date.now() - at).toBeLessThan(60_000);
  });

  test('a folder no group reaches admits the Super-Admins alone', async ({ page }) => {
    const request = page.request;
    ids.n = await folder(request, `Refuses N ${RUN}`, 'root');
    await publish(request, ids.n, CUBES.n, cubeYaml(CUBES.n));
    const n = full(ids.n, CUBES.n);

    expect(rows(await admitted([SUPER], n), n)).toBeGreaterThan(0);
    // A group granted elsewhere, and none at all.
    for (const groups of [[G.c], [G.ab], []])
      expect(refused(await count(groups, n)), JSON.stringify(groups)).toEqual({
        status: 403,
        gate: true,
      });
  });

  test('a read-only user’s dashboard, in their folder, is made for them to read (AC-263)', async ({
    page,
  }) => {
    const request = page.request;
    ids.r = await folder(request, `Refuses R ${RUN}`, 'root');
    await grant(request, ids.r, { readOnly: ['sales-ro'], readWrite: null });
    const made = async (data: Record<string, unknown>) => {
      const answer = await request.post('/api/documents', { data });
      expect(answer.status(), await answer.text()).toBe(201);
      return ((await answer.json()) as { id: string }).id;
    };
    ids.board = await made({ kind: 'dashboard', title: `Refuses board ${RUN}`, folderId: ids.r });
    ids.chart = await made({ kind: 'chart', title: `Refuses orders ${RUN}`, folderId: ids.r });
    // Given their content as a shared one's is given: by approving a copy (T502).
    await changeShared(request, 'chart', ids.chart, (body) => ({
      ...body,
      chart: {
        source: { cube: 'orders' },
        wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
      },
    }));
    await changeShared(request, 'dashboard', ids.board, (body) => ({
      ...body,
      pages: [
        { id: 'p1', title: 'Page 1', items: [{ id: 't1', kind: 'chart', chartId: ids.chart }] },
      ],
    }));
  });

  test('with security on, a publish that breaks a folder’s rollup is refused (AC-321)', async ({
    page,
  }) => {
    const request = page.request;
    // A rollup in /A of its own count by a joined cube's dimension, as
    // `preaggregations.spec.ts` builds one: planned through the join.
    const base = `refuses_base_${RUN}`;
    const summary = `refuses_sum_${RUN}`;
    await publish(request, ids.a, base, cubeYaml(base));
    const joined = (joins: boolean) =>
      cubeYaml(summary, [
        ...(joins
          ? [
              '    joins:',
              `      - name: ${base}`,
              `        sql: "{CUBE}.id = {${base}}.id"`,
              '        relationship: one_to_one',
            ]
          : []),
        '    pre_aggregations:',
        '      - name: by_status',
        '        measures: [count]',
        `        dimensions: [${base}.status]`,
      ]);
    await publish(request, ids.a, summary, joined(true));

    // The join taken away in a copy in My workspace: the rollup can no longer
    // be planned. Every name it uses is still in the model, so only the
    // check's probe, run as the Super-Admin group that /A admits, can tell:
    // the proposal's dry run (T451).
    const path = `cubes/${summary}.yml`;
    const copy = await inMyWorkspace(request, ids.a, [{ path, content: joined(false) }]);
    try {
      const broken = await proposedModel(request, copy.folderOf(path), path);
      expect(broken.status(), await broken.text()).toBe(422);
      const { errors } = (await broken.json()) as { errors?: { message: string }[] };
      expect(errors?.[0]?.message).toMatch(
        /^Pre-aggregation by_status can't be built: Cube cannot join its cubes\. Can't find join path/,
      );
    } finally {
      await copy.drop();
    }
  });
});

test.describe('as a read-only member (T436, AC-263)', () => {
  test.use({ role: 'reader' });

  test('their dashboard answers: Cube admits them to the cube it is bound to', async ({ page }) => {
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

test.describe('with security off (T436, AC-320)', () => {
  test('every token is admitted: the phase-1 model’s own cubes answer a token with no groups', async () => {
    const answer = await count([], 'orders', 'e2e');
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(rows(answer, 'orders')).toBeGreaterThan(0);
  });
});

test.describe('cleaning up', () => {
  test.use({ role: 'super' });

  test('removes what the run made', async ({ page }) => {
    const request = page.request;
    for (const [kind, id] of [
      ['dashboard', ids.board],
      ['chart', ids.chart],
    ] as const)
      if (id !== '') await request.delete(`/api/documents/${kind}/${id}`);
    for (const [folderId, names] of [
      [ids.a, [CUBES.a, CUBES.policied, `refuses_sum_${RUN}`, `refuses_base_${RUN}`]],
      [ids.c, [CUBES.c]],
      [ids.cd, [CUBES.cd]],
      [ids.n, [CUBES.n]],
    ] as const)
      for (const name of names)
        if (folderId !== '')
          await request.delete(
            `/api/model/files?folder=${folderId}&path=${encodeURIComponent(`cubes/${name}.yml`)}`,
          );
    for (const id of [ids.b, ids.a, ids.cd, ids.c, ids.n, ids.r])
      if (id !== '') await request.delete(`/api/documents/folder/${id}`);
  });
});
