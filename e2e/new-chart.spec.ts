import { expect, test } from '@playwright/test';

import { cubePicker } from './cubePicker';
import { wellPicker } from './wells';
import { newInMyWorkspace } from './workspace';

/**
 * T227 / AC-213: WHEN the user chooses New › Chart in Explore, THE SYSTEM SHALL
 * open the chart editor on a new library chart titled "Untitled chart" in the
 * open folder, and saving it SHALL open that chart's page.
 * `Fails when: New › Chart ends anywhere but the chart editor, or the saved
 * chart is not in the folder that was open.`
 *
 * The critique found New › Chart landing on the chart's empty page instead
 * (docs/design/critiques/2026-09-24-chart-editor.md, F2).
 *
 * The open folder is My workspace, where the single user makes a chart, to
 * go to Finance (T359, AC-254; a shared folder's New makes a folder alone,
 * T331).
 */
test('New › Chart opens the editor on an untitled chart, and saving it opens its page in the folder', async ({
  page,
}) => {
  await newInMyWorkspace(page, 'Chart', 'seed-folder-0');

  // The editor, on the new chart.
  await expect(page).toHaveURL(/\/explore\/charts\/[^/]+\/edit\?new=true$/);
  const id = /\/explore\/charts\/([^/]+)\/edit\?new=true$/.exec(page.url())?.[1] ?? '';
  // Its title, in the editor's header to change (AC-214).
  await expect(page.getByLabel('Chart title')).toHaveValue('Untitled chart');

  // A field, and Save.
  await cubePicker(page).selectOption({ label: 'Orders' });
  await wellPicker(page, 'measures').selectOption('orders.count');
  await page.getByRole('button', { name: 'Save chart' }).click();

  // Its page, and it is in My workspace.
  await expect(page).toHaveURL(new RegExp(`/explore/charts/${id}$`));
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
    'Untitled chart',
  );
  // What was saved is there: the field added in the editor (T227's review).
  await expect(
    page
      .getByRole('complementary', { name: 'Chart details' })
      .getByRole('region', { name: 'Metrics' }),
  ).toContainText('Orders Count');
  await page.goto('/explore?folder=mine');
  await expect(page.getByTestId(`item-${id}`)).toBeVisible();
  // Stored there, going to Finance, the target it was made with.
  const stored = (await (await page.request.get(`/api/documents/chart/${id}`)).json()) as {
    body: { folderId?: string; targetFolderId?: string };
  };
  expect(stored.body.folderId).toBe('mine');
  expect(stored.body.targetFolderId).toBe('seed-folder-0');
});

/**
 * T255 / AC-214 ("the title cannot be edited in the editor"): a title typed
 * and saved straight away is the chart's title. Save chart pressed while the
 * field still had the focus sent the title from before the typing, and the
 * page read "Untitled chart" (recheck-chart-editor N1).
 */
test('a title typed and saved at once, without leaving the field, is the one saved', async ({
  page,
}) => {
  const title = `Typed and saved ${String(Date.now())}`;
  await newInMyWorkspace(page, 'Chart', 'seed-folder-0');
  await expect(page).toHaveURL(/\/explore\/charts\/[^/]+\/edit\?new=true$/);

  await cubePicker(page).selectOption({ label: 'Orders' });
  await wellPicker(page, 'measures').selectOption('orders.count');
  const field = page.getByLabel('Chart title');
  await field.fill(title);
  await expect(field).toBeFocused();
  await page.getByRole('button', { name: 'Save chart' }).click();

  await expect(page).toHaveURL(/\/explore\/charts\/[^/]+$/);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(title);
});
