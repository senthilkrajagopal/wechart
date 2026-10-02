import { execFileSync } from 'node:child_process';

import type { APIRequestContext, Page } from '@playwright/test';

import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * T342: a model opened in its folder, beside that folder's files, read-only
 * when shared.
 *
 * AC-222: WHILE a model is open, THE SYSTEM SHALL show its folder's model
 * files beside the editor, open the chosen file in place with its folder and
 * name in the URL, offer New cube and New view in the user's workspace, and
 * mark each file that has problems.
 * `Fails when: moving to another of the folder's files requires leaving the
 * editor; New cube or New view is missing in the workspace, or offered in a
 * shared folder; or a file with an error carries no mark.`
 * (Its workspace half waits on T347: My workspace holds no model yet.)
 *
 * AC-131: WHEN the user opens a model in a folder, THE SYSTEM SHALL show the
 * cubes, views, measures, dimensions, segments, hierarchies, joins and
 * pre-aggregations each of its files defines.
 * `Fails when: a file's object is missing from the listing.`
 *
 * AC-329, the model page's part: a folder's cubes are never shown by their
 * prefixed names.
 *
 * Rules 70 and 71: a model opens under its folder's breadcrumb, read-only in
 * a shared folder, where a read-write member's action is "Edit in my
 * workspace" and a view-only one has none.
 *
 * The fixture, made by `super`: "Sales", no group's own, holds a model file
 * and "EMEA" (read-write `sales-rw`, so `writer`, who only views Sales;
 * read-only `sales-ro`). EMEA's model is three files — one at
 * `cubes/orders.yml`, the path of the root's seeded orders cube.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const names = { sales: `Sales ${RUN}`, emea: `EMEA ${RUN}` };
const made = { sales: '', emea: '', files: [] as string[], region: false };
const ORDERS = 'cubes/orders.yml';
const CUSTOMERS = 'cubes/t342_customers.yml';
const SUMMARY = 'views/t342_summary.yml';
const REGION = 'cubes/t342_region.yml';
const CUSTOMERS_YAML = [
  'cubes:',
  '  - name: t342_customers',
  '    sql_table: public.customers',
  '    dimensions:',
  '      - name: id',
  '        sql: id',
  '        type: number',
  '        primary_key: true',
  '      - name: country',
  '        sql: country',
  '        type: string',
  '    measures:',
  '      - name: count',
  '        type: count',
  '',
].join('\n');
const FILES = [
  { path: CUSTOMERS, content: CUSTOMERS_YAML },
  {
    path: ORDERS,
    content: [
      'cubes:',
      '  - name: t342_orders',
      '    sql_table: public.orders',
      '    joins:',
      '      - name: t342_customers',
      '        relationship: many_to_one',
      "        sql: '{CUBE}.customer_id = {t342_customers}.id'",
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
      '    segments:',
      '      - name: completed',
      `        sql: "{CUBE}.status = 'completed'"`,
      '    hierarchies:',
      '      - name: status_levels',
      '        levels: [status]',
      '    pre_aggregations:',
      '      - name: by_status',
      '        measures: [CUBE.count]',
      '        dimensions: [CUBE.status]',
      '',
    ].join('\n'),
  },
  {
    path: SUMMARY,
    content: [
      'views:',
      '  - name: t342_summary',
      '    cubes:',
      '      - join_path: t342_orders',
      '        includes: [count, status]',
      '',
    ].join('\n'),
  },
];

async function folder(
  request: APIRequestContext,
  title: string,
  parent: string,
  access?: { readOnly: string[] | null; readWrite: string[] | null },
) {
  const answer = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: parent },
  });
  expect(answer.status(), await answer.text()).toBe(201);
  const id = ((await answer.json()) as { id: string }).id;
  if (access !== undefined)
    expect((await request.put(`/api/folders/${id}/access`, { data: access })).status()).toBe(200);
  return id;
}

/** A file's text in the suite's own database, as a file stored before a rule tightened. */
function storeAs(folderId: string, path: string, content: string) {
  expect(folderId).toMatch(/^[0-9a-f-]{36}$/);
  const said = execFileSync(
    'docker',
    [
      'exec',
      'wechart-meta',
      'psql',
      '-U',
      'wechart',
      '-d',
      'wechart_security',
      '-Atc',
      `UPDATE model_files SET content = $t342$${content}$t342$ WHERE folder_id = '${folderId}' AND path = '${path}'`,
    ],
    { encoding: 'utf8' },
  );
  expect(said.trim()).toBe('UPDATE 1');
}

const fileUrl = (folderId: string, path: string) =>
  `/explore/folders/${folderId}/models/${encodeURIComponent(path)}`;
const tree = (page: Page) => page.getByRole('navigation', { name: 'Model files' });
const yaml = (page: Page, path: string) => page.getByRole('textbox', { name: `${path}, as YAML` });

test.describe.configure({ mode: 'serial' });

test.describe('a model in its folder, read-only when shared (T342; AC-222, AC-131, AC-329)', () => {
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    await signInThroughDex(await context.newPage(), 'super');
    const request = context.request;
    // What uses a cube first: the view, then the cube that joins, then the one joined.
    for (const path of [SUMMARY, ORDERS, CUSTOMERS].filter((each) => made.files.includes(each))) {
      if (path === CUSTOMERS) storeAs(made.emea, CUSTOMERS, CUSTOMERS_YAML);
      await request.delete(`/api/model/files?folder=${made.emea}&path=${encodeURIComponent(path)}`);
    }
    if (made.region)
      await request.delete(
        `/api/model/files?folder=${made.sales}&path=${encodeURIComponent(REGION)}`,
      );
    for (const id of [made.emea, made.sales].filter((id) => id !== ''))
      await request.delete(`/api/documents/folder/${id}`);
    await context.close();
  });

  test.describe('as super, a Super-Admin', () => {
    test.use({ role: 'super' });

    test('makes a folder with a model of three files, inside one with a file of its own', async ({
      page,
    }) => {
      const { request } = page;
      made.sales = await folder(request, names.sales, 'root');
      made.emea = await folder(request, names.emea, made.sales, {
        readOnly: ['sales-ro'],
        readWrite: ['sales-rw'],
      });
      // One at a time, each what the next joins or includes.
      for (const file of FILES) {
        const published = await request.post('/api/model/publish', {
          data: { folderId: made.emea, files: [file] },
          timeout: 90_000,
        });
        expect(published.status(), await published.text()).toBe(200);
        made.files.push(file.path);
      }
      const region = await request.post('/api/model/publish', {
        data: {
          folderId: made.sales,
          files: [
            {
              path: REGION,
              content: CUSTOMERS_YAML.replace('name: t342_customers', 'name: t342_region'),
            },
          ],
        },
        timeout: 90_000,
      });
      expect(region.status(), await region.text()).toBe(200);
      made.region = true;
    });

    test('opens a model row from Explore in its folder, never the root’s file of the same path', async ({
      page,
    }) => {
      await page.goto(`/explore?folder=${made.emea}`);
      const row = page.getByTestId(`item-${ORDERS}`);
      await expect(row.getByRole('cell').nth(0)).toHaveText('Model');
      // Its name, not its ⋯ "Actions for orders.yml" (T526).
      await row.getByRole('button', { name: 'orders.yml', exact: true }).click();

      // The folder and the file in the address (AC-222), under the folder's breadcrumb (rule 70).
      await expect(page).toHaveURL(
        new RegExp(`/explore/folders/${made.emea}/models/cubes%2Forders\\.yml$`),
      );
      await expect(yaml(page, ORDERS)).toContainText('name: t342_orders');
      await expect(yaml(page, ORDERS)).not.toContainText('name: orders');
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveText(
        `Explore / Shared / ${names.sales} / ${names.emea} / Model / ${ORDERS}`,
      );

      // The folder's files beside the editor, and only its own.
      await expect(tree(page).getByRole('link')).toHaveCount(3);
      for (const name of [/^orders\.yml/, /^t342_customers\.yml/, /^t342_summary\.yml/])
        await expect(tree(page).getByRole('link', { name })).toBeVisible();
      await expect(tree(page).getByRole('link', { name: /^orders\.yml/ })).toHaveAttribute(
        'aria-current',
        'page',
      );

      // Another of its files, opened in place: the page never reloads.
      await page.evaluate(() => {
        (window as unknown as { stayed?: boolean }).stayed = true;
      });
      await tree(page)
        .getByRole('link', { name: /^t342_customers\.yml/ })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/explore/folders/${made.emea}/models/cubes%2Ft342_customers\\.yml$`),
      );
      await expect(yaml(page, CUSTOMERS)).toContainText('name: t342_customers');
      expect(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed)).toBe(
        true,
      );
    });

    test('is read-only in its shared folder: no New cube or New view, and Edit in my workspace offered', async ({
      page,
    }) => {
      await page.goto(fileUrl(made.emea, ORDERS));
      const form = page.getByRole('region', { name: 'Form editor' });
      await expect(yaml(page, ORDERS)).toHaveAttribute('aria-readonly', 'true');
      await expect(form.getByLabel('Title', { exact: true })).toBeDisabled();
      await expect(form.getByText(`Read-only · in ${names.sales} / ${names.emea}`)).toBeVisible();
      for (const name of ['Save & reload Cube', 'Discard'])
        await expect(page.getByRole('button', { name })).toHaveCount(0);
      for (const name of [/New cube/, /New view/, /Generate/])
        await expect(tree(page).getByRole('button', { name })).toHaveCount(0);

      // A Super-Admin could propose it back: offered, to be pressed (T347;
      // workspace-overlay.spec.ts presses it).
      const copy = form.getByRole('button', { name: 'Edit in my workspace' });
      await expect(copy).toBeEnabled();
      // Nothing refused yet: no reason said beside it.
      await expect(copy).toHaveAccessibleDescription('');

      // Its overview offers nothing to make either.
      await page.goto(`/explore/folders/${made.emea}/models`);
      await expect(page.getByRole('heading', { level: 1, name: 'Model' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'New', exact: true })).toHaveCount(0);
      await expect(page.getByText(`Read-only · in ${names.sales} / ${names.emea}`)).toBeVisible();

      // Nor does the root's, in the Model workspace: shared too.
      await page.goto('/model');
      await expect(page.getByRole('table', { name: 'Cubes and views' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'New', exact: true })).toHaveCount(0);
      await expect(tree(page).getByRole('button', { name: /New cube/ })).toHaveCount(0);
    });

    test('lists every object each of the folder’s files defines, by the names its files give them (AC-131, AC-329)', async ({
      page,
    }) => {
      await page.goto(`/explore/folders/${made.emea}/models`);
      const table = page.getByRole('table', { name: 'Cubes and views' });
      const rowOf = (path: string) =>
        table.getByRole('row').filter({ has: page.getByRole('link', { name: path, exact: true }) });

      const orders = rowOf(ORDERS);
      await expect(orders.getByRole('cell').nth(1)).toHaveText('Cube');
      await expect(orders.getByRole('cell').nth(2)).toHaveText('t342_orders');
      await orders.locator('.model-overview__members').hover();
      const tip = orders.getByRole('tooltip');
      await expect(tip).toBeVisible();
      for (const listed of [
        'Dimensions · id, status',
        'Measures · count',
        'Joins · t342_customers',
        'Pre-aggs · by_status',
        'Segments · completed',
        'Hierarchies · status_levels',
      ])
        await expect(tip).toContainText(listed);

      const customers = rowOf(CUSTOMERS);
      await expect(customers.getByRole('cell').nth(2)).toHaveText('t342_customers');
      const summary = rowOf(SUMMARY);
      await expect(summary.getByRole('cell').nth(1)).toHaveText('View');
      await expect(summary.getByRole('cell').nth(2)).toHaveText('t342_summary');
      await expect(summary.locator('.model-overview__members')).toHaveText(
        't342_orders.count, t342_orders.status',
      );

      // Never a prefixed name, anywhere on the page (AC-329).
      expect(await page.locator('main').innerText()).not.toMatch(/\bf[0-9a-z]+__/);
    });

    test('marks a file of the folder that has problems, and no other', async ({ page }) => {
      // Stored with a dimension type Cube would refuse, as a file kept from
      // before a rule tightened: xcube serves the text it was published with.
      storeAs(made.emea, CUSTOMERS, CUSTOMERS_YAML.replace('type: string', 'type: strng'));
      await page.goto(fileUrl(made.emea, ORDERS));
      await expect(tree(page).getByRole('link', { name: /^t342_customers\.yml/ })).toContainText(
        'problems',
      );
      await expect(tree(page).getByRole('link', { name: /^orders\.yml/ })).not.toContainText(
        'problems',
      );
      storeAs(made.emea, CUSTOMERS, CUSTOMERS_YAML);
    });
  });

  test.describe('as writer, a read-write member of EMEA', () => {
    test.use({ role: 'writer' });

    test('is offered Edit in my workspace in the folder, and nothing where only viewing', async ({
      page,
    }) => {
      await page.goto(fileUrl(made.emea, ORDERS));
      const form = page.getByRole('region', { name: 'Form editor' });
      await expect(yaml(page, ORDERS)).toHaveAttribute('aria-readonly', 'true');
      // Offered, to be pressed (T347).
      await expect(form.getByRole('button', { name: 'Edit in my workspace' })).toBeEnabled();
      await expect(tree(page).getByRole('button', { name: /New cube/ })).toHaveCount(0);

      // Sales' model, which writer only views (AC-262): read-only, with neither action (rule 71).
      await page.goto(fileUrl(made.sales, REGION));
      await expect(yaml(page, REGION)).toContainText('name: t342_region');
      await expect(form.getByText(`Read-only · in ${names.sales}`)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Edit in my workspace' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Save & reload Cube' })).toHaveCount(0);

      // A folder that isn't there reads as Not found, as one they can't see does (rule 67).
      await page.goto('/explore/folders/00000000-0000-4000-8000-000000000342/models');
      await expect(page.getByRole('heading', { level: 1, name: 'Not found' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Model files' })).toHaveCount(0);
    });
  });
});
