import type { APIRequestContext, Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * T371 (AC-297; R40, the user: "Build T371 properly next"): Jobs and
 * Schedules for Super-Admins and each folder's read-write members, over their
 * own folders, against compose's xcube. A read-write member of a folder sees
 * its pre-aggregation by its short name with its folder, and none of another
 * folder's; a Super-Admin sees every folder's; a reader has neither page.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const ids = { mine: '', theirs: '' };

const cubeYaml = (name: string) =>
  [
    'cubes:',
    `  - name: ${name}`,
    '    sql_table: public.orders',
    '    measures:',
    '      - name: count',
    '        type: count',
    '    dimensions:',
    '      - name: status',
    '        sql: status',
    '        type: string',
    '    pre_aggregations:',
    '      - name: main',
    '        measures: [count]',
    '        dimensions: [status]',
    '',
  ].join('\n');

async function folderWith(
  request: APIRequestContext,
  title: string,
  access: { readOnly: string[]; readWrite: string[] },
  cube: string,
) {
  const made = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: 'root' },
  });
  expect(made.status()).toBe(201);
  const id = ((await made.json()) as { id: string }).id;
  expect((await request.put(`/api/folders/${id}/access`, { data: access })).status()).toBe(200);
  const published = await request.post('/api/model/publish', {
    data: { folderId: id, files: [{ path: `cubes/${cube}.yml`, content: cubeYaml(cube) }] },
  });
  expect(published.status(), await published.text()).toBe(200);
  return id;
}

const table = (page: Page) => page.getByRole('table', { name: 'Pre-aggregations' });

test.describe.configure({ mode: 'serial' });

test.describe('Jobs and Schedules, scoped to the user’s read-write folders (T371, AC-297)', () => {
  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('publishes a rollup in a folder `writer` writes, and one in a folder they don’t', async ({
      page,
    }) => {
      ids.mine = await folderWith(
        page.request,
        `Jobs mine ${RUN}`,
        { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
        `jobs_mine_${RUN}`,
      );
      ids.theirs = await folderWith(
        page.request,
        `Jobs theirs ${RUN}`,
        { readOnly: [], readWrite: ['g01'] },
        `jobs_theirs_${RUN}`,
      );
      // A Super-Admin sees both, each by its short name with its folder.
      await page.goto('/jobs');
      for (const [cube, folder] of [
        [`jobs_mine_${RUN}`, `Jobs mine ${RUN}`],
        [`jobs_theirs_${RUN}`, `Jobs theirs ${RUN}`],
      ] as const) {
        const row = table(page)
          .getByRole('row')
          .filter({ hasText: `${cube}.main` });
        await expect(row.getByTestId('preagg-name')).toHaveText(`${cube}.main`);
        await expect(row.getByTestId('preagg-folder')).toHaveText(folder);
      }
    });
  });

  test.describe('as writer, a read-write member of one', () => {
    test.use({ role: 'writer' });

    test('sees and builds only their folder’s, in Jobs and in Schedules', async ({ page }) => {
      await page.goto('/jobs');
      const mine = table(page)
        .getByRole('row')
        .filter({ hasText: `jobs_mine_${RUN}.main` });
      await expect(mine.getByTestId('preagg-folder')).toHaveText(`Jobs mine ${RUN}`);
      await expect(table(page)).not.toContainText(`jobs_theirs_${RUN}`);
      // Nor the root's, which they don't write.
      await expect(table(page)).not.toContainText('monthly_orders');
      await expect(
        mine.getByRole('button', { name: `Build jobs_mine_${RUN}.main in Jobs mine ${RUN}` }),
      ).toBeVisible();
      // Another folder's, asked for by its published name, is refused.
      const refused = await page.request.post('/api/builds', {
        data: { preAggregation: `f${ids.theirs.replaceAll('-', '')}__jobs_theirs_${RUN}.main` },
      });
      expect(refused.status()).toBe(403);

      // Their own queries only, in a tab that opens (R42.6).
      await page.goto('/jobs?tab=queries');
      await expect(page.getByRole('main')).not.toContainText('could not be read');
      await expect(page.getByRole('alert')).toHaveCount(0);

      await page.goto('/schedules');
      const schedules = page.getByRole('table', { name: 'Refresh schedules' });
      const row = schedules.getByRole('row').filter({ hasText: `jobs_mine_${RUN}.main` });
      // By its short name with its folder, never its prefixed name.
      await expect(row.getByRole('cell').first()).toHaveText(
        `jobs_mine_${RUN}.mainJobs mine ${RUN}`,
      );
      await expect(schedules).not.toContainText('__jobs_');
      await expect(schedules).not.toContainText(`jobs_theirs_${RUN}`);
    });
  });

  test.describe('as reader', () => {
    test.use({ role: 'reader' });

    test('has neither Jobs nor Schedules', async ({ page }) => {
      const refusal = 'Jobs and Schedules are for Super-Admins and read-write members of a folder.';
      await page.goto('/jobs');
      // The open tab's own; the Queries tab, hidden, says it too.
      await expect(
        page.getByRole('tabpanel', { name: 'Pre-aggregations' }).getByText(refusal),
      ).toBeVisible();
      await page.goto('/schedules');
      await expect(page.getByRole('main').getByText(refusal)).toBeVisible();
      await expect(page.getByRole('main')).not.toContainText(`jobs_mine_${RUN}`);
    });
  });
});
