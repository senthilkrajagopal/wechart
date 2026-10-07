import type { APIRequestContext, Page } from '@playwright/test';

import { landed } from '../model-files';
import { expect, test } from './fixtures';

/**
 * T371 (AC-297; R40, the user: "Build T371 properly next"): Jobs and
 * Schedules for Super-Admins and each folder's read-write members, over their
 * own folders, against compose's xcube. A read-write member of a folder sees
 * its pre-aggregation by its short name with its folder, and none of another
 * folder's; a Super-Admin sees every folder's; a reader has neither page.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const ids = { mine: '', theirs: '', below: '' };

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
  access: { readOnly: string[]; readWrite: string[] } | undefined,
  cube: string,
  /** Its parent: the root, or a folder below which it inherits its groups (T559). */
  parent = 'root',
) {
  const made = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: parent },
  });
  expect(made.status()).toBe(201);
  const id = ((await made.json()) as { id: string }).id;
  if (access !== undefined)
    expect((await request.put(`/api/folders/${id}/access`, { data: access })).status()).toBe(200);
  // Through My workspace and a proposal `super` approves (T451, AC-278).
  const file = { path: `cubes/${cube}.yml`, content: cubeYaml(cube) };
  expect(await landed(request, id, [file])).toEqual([file]);
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

    /**
     * T559 (AC-297; design 16, pins 3 and 4, state H): a folder below the
     * member's, theirs by its parent's grant. A Super-Admin's tabs offer All
     * folders, each folder by its path, and carry no scope note.
     */
    test('sees every folder in each tab’s Folder filter, and no scope note', async ({ page }) => {
      ids.below = await folderWith(
        page.request,
        `Below ${RUN}`,
        undefined,
        `jobs_below_${RUN}`,
        ids.mine,
      );
      for (const [tab, panel] of [
        ['', 'Pre-aggregations'],
        ['?tab=history', 'Run history'],
        ['?tab=queue', /^Queue/],
      ] as const) {
        await page.goto(`/jobs${tab}`);
        const shown = page.getByRole('tabpanel', { name: panel });
        const folder = shown.getByRole('combobox', { name: 'Folder' });
        await expect(folder.locator('option').first()).toHaveText('All folders');
        // A tree of short names under the root, each indented by its depth (state H2; T560).
        const indent = '   ';
        await expect(folder.locator('option').nth(1)).toHaveText('Shared · the root');
        const labels = await folder.locator('option').allTextContents();
        expect(labels).toEqual(
          expect.arrayContaining([
            `${indent}Jobs mine ${RUN}`,
            `${indent}${indent}Below ${RUN}`,
            `${indent}Jobs theirs ${RUN}`,
          ]),
        );
        // Below sits under its parent, next after it (T560's review).
        expect(labels.indexOf(`${indent}${indent}Below ${RUN}`)).toBe(
          labels.indexOf(`${indent}Jobs mine ${RUN}`) + 1,
        );
        await expect(shown.getByRole('note', { name: 'Scope' })).toHaveCount(0);
      }
      await page.goto('/schedules');
      await expect(
        page.getByRole('main').getByRole('combobox', { name: 'Folder' }).locator('option').first(),
      ).toHaveText('All folders');
      await expect(page.getByRole('note', { name: 'Scope' })).toHaveCount(0);
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
      // By its short name with its folder, never its prefixed name; the
      // folder in a column of its own (T551; design 16, screen 2).
      await expect(row.getByRole('cell').first()).toHaveText(`jobs_mine_${RUN}.main`);
      await expect(row.getByRole('cell').nth(1)).toHaveText(`Jobs mine ${RUN}`);
      await expect(schedules).not.toContainText('__jobs_');
      await expect(schedules).not.toContainText(`jobs_theirs_${RUN}`);
    });

    /**
     * T559 (AC-297, rule 84; design 16, pins 3 and 4, state H): each tab and
     * Schedules shows each row's folder; "All of mine" offers the member's
     * folders, the one below theirs included, with Include subfolders; and
     * each carries the scope note and names no other folder.
     */
    test('has each row’s folder, All of mine with Include subfolders, and the scope note, on every tab', async ({
      page,
    }) => {
      const notes = {
        'Pre-aggregations':
          'Showing pre-aggregations of models in the folders where you have read-write access.',
        'Run history':
          'Showing builds of pre-aggregations in the folders where you have read-write access.',
        Queue:
          'Showing queued and building builds in the folders where you have read-write access.',
      };
      // A build of theirs, so Run history has a row of their folder.
      await page.goto('/jobs');
      const mine = table(page)
        .getByRole('row')
        .filter({ hasText: `jobs_mine_${RUN}.main` });
      // Recorded before the page moves on (T559's review).
      const built = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/builds') && response.request().method() === 'POST',
      );
      await mine
        .getByRole('button', { name: `Build jobs_mine_${RUN}.main in Jobs mine ${RUN}` })
        .click();
      expect((await built).status()).toBe(200);

      for (const [tab, panel] of [
        ['', 'Pre-aggregations'],
        ['?tab=history', 'Run history'],
        ['?tab=queue', 'Queue'],
      ] as const) {
        await page.goto(`/jobs${tab}`);
        const shown = page.getByRole('tabpanel', { name: new RegExp(`^${panel}`) });
        await expect(shown.getByRole('note', { name: 'Scope' })).toHaveText(notes[panel]);
        const folder = shown.getByRole('combobox', { name: 'Folder' });
        await expect(folder.locator('option').first()).toHaveText('All of mine');
        for (const path of [`Jobs mine ${RUN}`, `Jobs mine ${RUN} / Below ${RUN}`])
          await expect(
            folder.locator('option').filter({ hasText: new RegExp(`^${path}$`) }),
          ).toHaveCount(1);
        await expect(shown.getByRole('checkbox', { name: 'Include subfolders' })).toBeDisabled();
        // No other folder named anywhere on the page.
        await expect(page.getByRole('main')).not.toContainText(`Jobs theirs ${RUN}`);
      }

      // Pre-aggregations: each row's folder in its column; a folder's own, then those below.
      await page.goto('/jobs');
      const below = table(page)
        .getByRole('row')
        .filter({ hasText: `jobs_below_${RUN}.main` });
      await expect(mine.getByTestId('preagg-folder')).toHaveText(`Jobs mine ${RUN}`);
      await expect(below.getByTestId('preagg-folder')).toHaveText(
        `Jobs mine ${RUN} / Below ${RUN}`,
      );
      const panel = page.getByRole('tabpanel', { name: 'Pre-aggregations' });
      await panel
        .getByRole('combobox', { name: 'Folder' })
        .selectOption({ label: `Jobs mine ${RUN}` });
      await expect(mine).toHaveCount(1);
      await expect(below).toHaveCount(0);
      await panel.getByRole('checkbox', { name: 'Include subfolders' }).check();
      await expect(below).toHaveCount(1);

      // Run history: the build started above, with its folder.
      await page.goto('/jobs?tab=history');
      await expect(
        page
          .getByRole('table', { name: 'Run history' })
          .getByRole('row')
          .filter({ hasText: `jobs_mine_${RUN}.main` })
          .first(),
      ).toContainText(`Jobs mine ${RUN}`);

      // Schedules: the note, the filter, and no other folder.
      await page.goto('/schedules');
      await expect(page.getByRole('note', { name: 'Scope' })).toHaveText(
        'Showing schedules of pre-aggregations in the folders where you have read-write access.',
      );
      const folder = page.getByRole('main').getByRole('combobox', { name: 'Folder' });
      await expect(folder.locator('option').first()).toHaveText('All of mine');
      await expect(
        folder
          .locator('option')
          .filter({ hasText: new RegExp(`^Jobs mine ${RUN} / Below ${RUN}$`) }),
      ).toHaveCount(1);
      await expect(page.getByRole('main')).not.toContainText(`Jobs theirs ${RUN}`);
      const schedules = page.getByRole('table', { name: 'Refresh schedules' });
      await expect(
        schedules
          .getByRole('row')
          .filter({ hasText: `jobs_below_${RUN}.main` })
          .getByRole('cell')
          .nth(1),
      ).toHaveText(`Jobs mine ${RUN} / Below ${RUN}`);
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
