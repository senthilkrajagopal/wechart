import type { Browser } from '@playwright/test';

import { BASE_URL, expect, signInThroughDex, test, type Role } from './fixtures';
import { changeShared } from './shared-change';

/**
 * Design 14 (R48): deleting only what nothing depends on, with sign-in on.
 *
 * T517 (AC-362): a library chart a shared folder's dashboard shows can't be
 * deleted; the refusal names that dashboard. A draft in a workspace doesn't
 * hold it back: once no shared dashboard shows it, it is deleted, and the
 * draft's tile finds it gone.
 *
 * `super` makes a folder `writer` (`sales-rw`) writes and `reader`
 * (`sales-ro`) reads.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const FOLDER = `Deleting ${RUN}`;
const CHART = `Top products ${RUN}`;
const BOARD = `Revenue ${RUN}`;
const DRAFT = `Q4 review ${RUN}`;
const made = { folder: '', chart: '', board: '', draft: '' };

/** A signed-in context of `who`'s own, for set-up and clean-up. */
async function as(browser: Browser, who: Role) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
  });
  await signInThroughDex(await context.newPage(), who);
  return context;
}

test.describe.configure({ mode: 'serial' });

test.describe('deleting a library chart (T517, AC-362)', () => {
  test.afterAll(async ({ browser }) => {
    const writer = await as(browser, 'writer');
    if (made.draft !== '') await writer.request.delete(`/api/documents/dashboard/${made.draft}`);
    await writer.close();
    const admin = await as(browser, 'super');
    if (made.board !== '') await admin.request.delete(`/api/documents/dashboard/${made.board}`);
    if (made.chart !== '') await admin.request.delete(`/api/documents/chart/${made.chart}`);
    if (made.folder !== '') await admin.request.delete(`/api/documents/folder/${made.folder}`);
    await admin.close();
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes the folder, its chart, and a dashboard showing it', async ({ page }) => {
      const folder = await page.request.post('/api/documents', {
        data: { kind: 'folder', title: FOLDER, folderId: 'root' },
      });
      made.folder = ((await folder.json()) as { id: string }).id;
      expect(
        (
          await page.request.put(`/api/folders/${made.folder}/access`, {
            data: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
          })
        ).status(),
      ).toBe(200);
      const chart = await page.request.post('/api/documents', {
        data: { kind: 'chart', title: CHART, folderId: made.folder },
      });
      expect(chart.status(), await chart.text()).toBe(201);
      made.chart = ((await chart.json()) as { id: string }).id;
      const board = await page.request.post('/api/documents', {
        data: { kind: 'dashboard', title: BOARD, folderId: made.folder },
      });
      made.board = ((await board.json()) as { id: string }).id;
      // Shown on it as a shared dashboard changes: by an approved proposal (T502).
      await changeShared(page.request, 'dashboard', made.board, (body) => ({
        ...body,
        pages: [
          {
            id: 'p1',
            title: 'Page 1',
            items: [{ id: 't1', kind: 'chart', w: 6, h: 40, chartId: made.chart }],
          },
        ],
      }));
    });
  });

  test.describe('as reader', () => {
    test.use({ role: 'reader' });

    test('opens the chart the dashboard shows, with no way to delete it', async ({ page }) => {
      await page.goto(`/explore/charts/${made.chart}`);
      await expect(page.getByRole('heading', { level: 1, name: CHART })).toBeVisible();
      // Where it lives is said once who is signed in and the folders are known.
      await expect(
        page.locator('.chart-page__head').getByText(new RegExp(`^In ${FOLDER} · version`)),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: `More actions for ${CHART}` })).toHaveCount(0);
    });
  });

  test.describe('as writer', () => {
    test.use({ role: 'writer' });

    test('is refused while the shared dashboard shows it, and not held back by a draft', async ({
      page,
    }) => {
      // A draft of the writer's own, in My workspace, showing the chart too.
      const draft = await page.request.post('/api/documents', {
        data: { kind: 'dashboard', title: DRAFT, folderId: 'mine', targetFolderId: made.folder },
      });
      expect(draft.status(), await draft.text()).toBe(201);
      made.draft = ((await draft.json()) as { id: string }).id;
      const stored = (await (
        await page.request.get(`/api/documents/dashboard/${made.draft}`)
      ).json()) as { body: Record<string, unknown>; version: number };
      const saved = await page.request.put(`/api/documents/dashboard/${made.draft}`, {
        data: {
          version: stored.version,
          body: {
            ...stored.body,
            pages: [
              {
                id: 'p1',
                title: 'Page 1',
                items: [{ id: 't1', kind: 'chart', w: 6, h: 40, chartId: made.chart }],
              },
            ],
          },
        },
      });
      expect(saved.status(), await saved.text()).toBe(200);

      // Refused: the shared dashboard named, as a link, with its folder; the draft not at all.
      await page.goto(`/explore/charts/${made.chart}`);
      await page.getByRole('button', { name: `More actions for ${CHART}` }).click();
      await page.getByRole('menuitem', { name: 'Delete chart…' }).click();
      const refused = page.getByRole('alertdialog', { name: `Can’t delete “${CHART}”` });
      await expect(refused).toContainText(
        '1 dashboard uses it. Remove it from the dashboard, then delete it.',
      );
      const list = refused.getByRole('list', { name: 'Dashboards that use it, 1' });
      await expect(list.getByRole('link', { name: new RegExp(BOARD) })).toHaveAttribute(
        'href',
        `/explore/dashboards/${made.board}`,
      );
      await expect(list.getByText(FOLDER, { exact: true })).toBeVisible();
      await expect(refused).not.toContainText(DRAFT);
      await expect(refused).toContainText(
        'A shared dashboard changes through Edit in my workspace and a proposal.',
      );
      await refused.getByRole('button', { name: 'Close' }).click();
      expect((await page.request.get(`/api/documents/chart/${made.chart}`)).status()).toBe(200);

      // Once no shared dashboard shows it, it goes, the draft notwithstanding.
      expect((await page.request.delete(`/api/documents/dashboard/${made.board}`)).status()).toBe(
        204,
      );
      made.board = '';
      await page.reload();
      await page.getByRole('button', { name: `More actions for ${CHART}` }).click();
      await page.getByRole('menuitem', { name: 'Delete chart…' }).click();
      const confirm = page.getByRole('alertdialog', { name: `Delete “${CHART}”?` });
      await expect(confirm).toContainText('No dashboard uses it. You can’t undo this.');
      await confirm.getByRole('button', { name: 'Delete chart' }).click();
      await expect(page).toHaveURL(new RegExp(`/explore\\?folder=${made.folder}$`));
      await expect(
        page.getByRole('status').filter({ hasText: `Deleted “${CHART}”.` }),
      ).toBeVisible();
      made.chart = '';

      // The draft's tile finds it gone.
      await page.goto(`/explore/dashboards/${made.draft}`);
      await expect(page.getByTestId('tile-missing-chart')).toHaveText(
        'This chart is no longer available.',
      );
    });
  });
});
