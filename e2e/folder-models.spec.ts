import { expect, test } from '@playwright/test';

import { PUBLISHED } from './model-files';

/**
 * T452, AC-328: WHEN a cube is published, THE SYSTEM SHALL publish it under
 * its short name in the shared root, and as `<folderId>__<shortName>` in any
 * other folder, the folder id being the xcube id stored with the folder (`f`
 * and the 32 hex digits of a folder with a UUID).
 *
 * Against compose's xcube, through wechart's API: a cube published into a
 * folder made here is served under that folder's id, and the root's `orders`
 * stays `orders`.
 */
test('a cube published into a new folder is served under the folder’s id, and the root’s stay bare', async ({
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
  const name = 'folder_orders';

  const published = await request.post('/api/model/publish', {
    data: {
      folderId: id,
      files: [
        {
          path: `cubes/${name}.yml`,
          content: `cubes:\n  - name: ${name}\n    sql_table: public.orders\n    measures:\n      - name: count\n        type: count\n`,
        },
      ],
    },
  });
  expect(published.status(), await published.text()).toBe(200);

  // Stored in the folder, by its own name there.
  const stored = (await (await request.get(`/api/model/files?folder=${id}`)).json()) as {
    files: { path: string }[];
  };
  expect(stored.files.map((file) => file.path)).toEqual([`cubes/${name}.yml`]);

  // Served as the folder's: `f`, its UUID's hex digits, `__`, the short name.
  const full = `f${id.replaceAll('-', '').toLowerCase()}__${name}`;
  const count = async (cube: string) => {
    const answer = (await (
      await request.post('/api/load', { data: { query: { measures: [`${cube}.count`] } } })
    ).json()) as { data?: Record<string, unknown>[] };
    return answer.data?.[0]?.[`${cube}.count`];
  };
  await expect.poll(() => count(full), { timeout: 30_000 }).toBeDefined();
  // The same table as the root's `orders`, which keeps its bare name.
  expect(await count(full)).toBe(await count('orders'));

  const meta = (await (await request.get('/api/meta')).json()) as { cubes?: { name: string }[] };
  const names = (meta.cubes ?? []).map((cube) => cube.name);
  expect(names).toContain(full);
  expect(names).toContain('orders');
  expect(names).not.toContain(name);
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
  const cube = `t450_keyed_${testInfo.project.name}`;
  const published = await page.request.post('/api/model/publish', {
    data: {
      folderId: id,
      files: [
        {
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
        },
      ],
    },
  });
  expect(published.status(), await published.text()).toBe(200);

  await page.goto('/schedules');
  const table = page.getByRole('main').getByRole('table', { name: 'Refresh schedules' });
  // Said by its short name, with its folder (T371; §P2.6 D), never the prefixed one.
  // This run's: a rerun makes another folder holding a cube of the same name (T530's review).
  const row = table
    .getByRole('row')
    .filter({ hasText: `${cube}.main` })
    .filter({ hasText: folderTitle });
  await expect(row).toContainText(
    'When its SQL returns a new value, checked every 1 hour',
    PUBLISHED,
  );
  await expect(row).not.toContainText(`${id.replaceAll('-', '')}__`);

  // Edit in Model opens its own folder's file, on its pre-aggregations (T530, AC-222).
  await row.getByRole('link', { name: `Edit ${cube}.main in Model` }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `/explore/folders/${id}/models/${encodeURIComponent(`cubes/${cube}.yml`)}\\?cube=${cube}&tab=pre_aggregations$`,
    ),
  );
  await expect(page.getByRole('heading', { name: `cubes/${cube}.yml`, level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Pre-aggs 1' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

/**
 * T450's review, AC-189: IF a model change being published leaves a
 * pre-aggregation naming a member the model does not have, THEN THE SYSTEM
 * SHALL refuse to publish the change and show each unknown name … — here a
 * change at the root that breaks another folder's rollup. The refusal is
 * said as that folder's file, with a way to the folder, and never marks the
 * root's file of the same path.
 */
test('a root change that breaks a folder’s rollup is refused, and said as that folder’s file', async ({
  page,
}, testInfo) => {
  const request = page.request;
  const base = `t450_base_${testInfo.project.name}`;
  // One path in both folders: the root's declares `base`, the folder's a
  // cube whose rollup names `base.total`.
  const path = `cubes/t450_${testInfo.project.name}.yml`;
  const root = await request.post('/api/model/publish', {
    data: {
      files: [
        {
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
        },
      ],
    },
  });
  expect(root.status(), await root.text()).toBe(200);

  const title = `T450 rollups ${testInfo.project.name} ${String(Date.now())}`;
  const made = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: 'root' },
  });
  expect(made.status()).toBe(201);
  const { id } = (await made.json()) as { id: string };
  const inFolder = await request.post('/api/model/publish', {
    data: {
      folderId: id,
      files: [
        {
          path,
          content: [
            'cubes:',
            '  - name: t450_summary',
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
        },
      ],
    },
  });
  expect(inFolder.status(), await inFolder.text()).toBe(200);

  // At the root, `total` renamed: the folder's rollup then names what the
  // model doesn't have.
  await page.goto(`/model/files/${encodeURIComponent(path)}`);
  await page.locator('.cm-line', { hasText: /^\s+- name: total$/ }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('_gone');
  await page.getByRole('button', { name: 'Save & reload Cube' }).click();

  await expect(
    page.getByRole('alert').filter({ hasText: 'names members the model doesn’t have' }),
  ).toBeVisible(PUBLISHED);
  const where = page
    .getByRole('region', { name: 'Problems' })
    .getByRole('link', { name: new RegExp(`^Shared / ${title} · ${path}:\\d+$`) });
  await expect(where).toHaveCount(1);
  await expect(where).toHaveAttribute('href', `/explore?folder=${id}`);
  // The root's file of that path is not marked for it.
  await expect(
    page
      .getByRole('navigation', { name: 'Model files' })
      .getByRole('link', { name: new RegExp(`^t450_${testInfo.project.name}\\.yml`) }),
  ).not.toContainText('problems');
});
