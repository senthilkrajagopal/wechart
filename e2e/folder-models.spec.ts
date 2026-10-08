import { expect, test } from '@playwright/test';

import { CUBE, serviceToken } from './api-process';
import {
  inMyWorkspace,
  landed,
  modelFilesIn,
  ownModelCopy,
  proposedModel,
  PUBLISHED,
} from './model-files';

/**
 * T452, AC-328, reworked by T728 to R71: a cube is published under its own
 * name in whatever folder it is kept, with no folder prefix. The folder id
 * stays the xcube id stored with the folder (`f` and the 32 hex digits of a
 * folder with a UUID), which xcube holds the item in.
 *
 * Against compose's xcube, through wechart's API: a cube published into a
 * folder made here is served under its own name, held in that folder's
 * xcube id, as the root's `orders` is under its own.
 */
test('a cube published into a new folder is served under its own name, held in the folder’s xcube id', async ({
  request,
}, testInfo) => {
  const made = await request.post('/api/documents', {
    data: {
      kind: 'folder',
      title: `Folder models ${testInfo.project.name} ${String(Date.now())}`,
      folderId: 'root',
    },
  });
  expect(made.status()).toBe(201);
  const { id } = (await made.json()) as { id: string };
  // Of this browser's own: the browsers share the single user's workspace,
  // which holds a name once (T451's switch). And this run's: a rerun makes
  // another folder, and a name lands once across the system (T700, AC-421).
  const name = `folder_orders_${testInfo.project.name}_${Date.now().toString(36)}`;

  // Through My workspace and a proposal the single user approves (T451's switch; AC-254).
  const file = {
    path: `cubes/${name}.yml`,
    content: `cubes:\n  - name: ${name}\n    sql_table: public.orders\n    measures:\n      - name: count\n        type: count\n`,
  };
  expect(await landed(request, id, [file])).toEqual([file]);

  // Stored in the folder, by its own name there.
  const stored = (await (await request.get(`/api/model/files?folder=${id}`)).json()) as {
    files: { path: string }[];
  };
  expect(stored.files.map((file) => file.path)).toEqual([`cubes/${name}.yml`]);

  // Served under its own name, as the root's `orders` is under its own.
  const xcubeId = `f${id.replaceAll('-', '').toLowerCase()}`;
  const count = async (cube: string) => {
    const answer = (await (
      await request.post('/api/load', { data: { query: { measures: [`${cube}.count`] } } })
    ).json()) as { data?: Record<string, unknown>[] };
    return answer.data?.[0]?.[`${cube}.count`];
  };
  // The same table as the root's `orders`, once it is served.
  const orders = await count('orders');
  expect(String(orders)).toMatch(/^[1-9][0-9]*$/);
  await expect.poll(() => count(name), { timeout: 30_000 }).toBe(orders);

  const meta = (await (await request.get('/api/meta')).json()) as { cubes?: { name: string }[] };
  const names = (meta.cubes ?? []).map((cube) => cube.name);
  expect(names).toContain(name);
  expect(names).toContain('orders');
  // No folder prefix, this folder's or any (AC-328).
  expect(names.filter((each) => each.includes('__'))).toEqual([]);

  // Held by xcube in the folder's stored xcube id.
  const items = (
    (await (
      await request.get(`${CUBE}/v1/semantic/models/e2e/items`, {
        headers: { authorization: `Bearer ${serviceToken()}` },
      })
    ).json()) as { items: { folderId: string; name: string }[] }
  ).items.filter((item) => item.name === name);
  expect(items).toEqual([expect.objectContaining({ folderId: xcubeId, name })]);
});

/**
 * T450's review, AC-154: a folder's rollup with a refresh key's SQL is said
 * on Schedules as checked on its interval and rebuilt when the SQL changes,
 * read from that folder's own file (the metadata drops the key's SQL).
 */
test('Schedules reads a folder rollup’s key SQL from its folder’s file', async ({
  page,
}, testInfo) => {
  const folderTitle = `T450 schedules ${testInfo.project.name} ${String(Date.now())}`;
  const made = await page.request.post('/api/documents', {
    data: { kind: 'folder', title: folderTitle, folderId: 'root' },
  });
  expect(made.status()).toBe(201);
  const { id } = (await made.json()) as { id: string };
  // This run's: a rerun makes another folder, and a name lands once across
  // the system (T700, AC-421).
  const cube = `t450_keyed_${testInfo.project.name}_${Date.now().toString(36)}`;
  // Through My workspace and a proposal the single user approves (T451's switch; AC-254).
  const file = {
    path: `cubes/${cube}.yml`,
    content: [
      'cubes:',
      `  - name: ${cube}`,
      '    sql_table: public.orders',
      '    measures:',
      '      - name: count',
      '        type: count',
      '    pre_aggregations:',
      '      - name: main',
      '        measures: [CUBE.count]',
      '        refresh_key:',
      '          sql: SELECT MAX(id) FROM public.orders',
      '          every: 1 hour',
      '',
    ].join('\n'),
  };
  expect(await landed(page.request, id, [file])).toEqual([file]);

  await page.goto('/schedules');
  const table = page.getByRole('main').getByRole('table', { name: 'Refresh schedules' });
  // Said by its short name, with its folder (T371; §P2.6 D), never the prefixed one.
  // This run's: a rerun makes another folder holding a cube of the same name (T530's review).
  const row = table
    .getByRole('row')
    .filter({ hasText: `${cube}.main` })
    .filter({ hasText: folderTitle });
  await expect(row).toContainText(
    'When its SQL returns a new value, checked every hour',
    PUBLISHED,
  );
  // Nothing of the folder's id in the row (T728).
  await expect(row).not.toContainText(id.replaceAll('-', ''));

  // Open in Model, in its pane (T551; design 16, D5), opens its own folder's
  // file, on the pre-aggregation itself (T530, AC-222).
  await row.click();
  await page
    .getByRole('complementary', { name: 'Schedule details' })
    .getByRole('link', { name: 'Open in Model' })
    .click();
  await expect(page).toHaveURL(
    new RegExp(
      `/explore/folders/${id}/models/${encodeURIComponent(`cubes/${cube}.yml`)}\\?cube=${cube}&tab=pre_aggregations&member=main$`,
    ),
  );
  await expect(page.getByRole('heading', { name: `cubes/${cube}.yml`, level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Pre-aggs 1' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

/**
 * T450's review, AC-189 (amended 2026-10-04, `[R60]`): IF a model change
 * being proposed or approved leaves a pre-aggregation naming a member the
 * model does not have, THEN THE SYSTEM SHALL refuse the proposal or the
 * approval, and a refused approval's review SHALL name each unknown name
 * with its pre-aggregation and file (design 05, state L) — here a folder's
 * rollup on a member of the root's cube of the same path.
 *
 * As a shared model is changed with sign-in off now (T451's switch; AC-254,
 * R52): the folder's file, in My workspace, is proposed while the root's
 * cube has the member; the root's copy, the member renamed away, lands
 * meanwhile; then the approval is refused, the review saying the break as
 * that folder's file, never the root's of the same path, with the name; and
 * nothing lands.
 */
test('a folder’s rollup whose root member went while it waited is refused at approval, said as that folder’s file', async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const request = page.request;
  const project = testInfo.project.name;
  const base = `t450_base_${project}`;
  // One path in both folders: the root's declares `base`, the folder's a
  // cube whose rollup names `base.total`.
  const path = `cubes/t450_${project}.yml`;
  const rootFile = {
    path,
    content: [
      'cubes:',
      `  - name: ${base}`,
      '    sql_table: public.orders',
      '    dimensions:',
      '      - name: id',
      '        sql: id',
      '        type: number',
      '        primary_key: true',
      '    measures:',
      '      - name: count',
      '        type: count',
      '      - name: total',
      '        sql: amount',
      '        type: sum',
      '',
    ].join('\n'),
  };
  expect(await landed(request, 'root', [rootFile])).toEqual([rootFile]);

  const title = `T450 rollups ${project} ${String(Date.now())}`;
  const made = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: 'root' },
  });
  expect(made.status()).toBe(201);
  const { id } = (await made.json()) as { id: string };

  // The folder's rollup on `base.total`, in My workspace, proposed while the
  // root's cube has `total`: the dry run passes.
  const folderFile = {
    path,
    content: [
      'cubes:',
      `  - name: t450_summary_${project}`,
      '    sql_table: public.orders',
      '    joins:',
      `      - name: ${base}`,
      `        sql: "{CUBE}.id = {${base}}.id"`,
      '        relationship: one_to_one',
      '    dimensions:',
      '      - name: id',
      '        sql: id',
      '        type: number',
      '        primary_key: true',
      '    measures:',
      '      - name: count',
      '        type: count',
      '    pre_aggregations:',
      '      - name: spend',
      `        measures: [${base}.total]`,
      '',
    ].join('\n'),
  };
  const held = await inMyWorkspace(request, id, [folderFile]);
  const copy = await ownModelCopy(request, path);
  let proposal = '';
  try {
    const proposed = await proposedModel(request, held.folderOf(path), path);
    expect(proposed.status(), await proposed.text()).toBe(201);
    proposal = ((await proposed.json()) as { id: string }).id;

    // Meanwhile, at the root, `total` renamed in the single user's copy,
    // saved, and landed.
    await page.goto(copy.href);
    await page.locator('.cm-line', { hasText: /^\s+- name: total$/ }).click();
    await page.keyboard.press('End');
    await page.keyboard.type('_gone');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Saved. Previews in My workspace use it now.' }),
    ).toBeVisible(PUBLISHED);
    await copy.land();
    const renamed = rootFile.content.replace('- name: total\n', '- name: total_gone\n');
    expect((await modelFilesIn(request, 'root')).find((file) => file.path === path)?.content).toBe(
      renamed,
    );

    // Approved now, the folder's rollup would name what the model doesn't
    // have: refused, said as the folder's file, with the name.
    await page.goto(`/reviews/${proposal}`);
    await page.getByRole('button', { name: 'Approve my own proposal' }).click();
    await page.getByRole('button', { name: 'Approve and publish' }).click();
    await expect(page.getByRole('alert')).toHaveText('Can’t approve: 1 item would break', {
      timeout: 90_000,
    });
    const broken = page.locator('.review-refusal__break');
    await expect(broken).toHaveCount(1);
    await expect(broken).toContainText(`${path} · ${title}`);
    await expect(broken).toContainText(
      `Pre-aggregation spend names what the model doesn’t have: ${base}.total (measures).`,
    );
    // Nothing landed: the folder has no file of that path.
    expect((await modelFilesIn(request, id)).map((file) => file.path)).not.toContain(path);
  } finally {
    if (proposal !== '') await request.post(`/api/proposals/${proposal}/reject`, { data: {} });
    await held.drop();
    await copy.drop();
  }
});
