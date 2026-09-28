import { expect, test, type Page } from '@playwright/test';

import { wellPicker } from './wells';

/**
 * Quick calculations (F6), in the chart editor as it is served.
 *
 * Every test opens the empty seed chart and never saves it, so the browsers
 * running at once share nothing they change.
 */
async function openEditorWithCount(page: Page) {
  await page.goto('/explore/charts/seed-chart-empty/edit');
  await page.getByLabel('Cube or view').selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();
  await wellPicker(page, 'measures').selectOption('orders.count');
  await expect(page.getByTestId('in-measures-orders.count')).toBeVisible();
}

/**
 * AC-047: WHEN the user opens the menu on a measure in the chart editor, THE
 * SYSTEM SHALL offer % of total, difference from previous period, % difference
 * from previous period, running total, rank and moving average.
 * Fails when: any of the six is missing from the menu.
 */
test.describe('the menu on a measure (AC-047)', () => {
  test('offers the six quick calculations', async ({ page }) => {
    await openEditorWithCount(page);

    await page
      .getByTestId('in-measures-orders.count')
      .getByRole('button', { name: 'Calculations on Count' })
      .click();
    const menu = page.getByRole('menu', { name: 'Calculations on Count' });

    for (const name of [
      '% of total',
      'Difference from previous period',
      '% difference from previous period',
      'Running total',
      'Rank',
      'Moving average, 3 periods',
    ]) {
      await expect(menu.getByRole('menuitem', { name, exact: true })).toBeVisible();
    }
  });

  test('names the calculation chosen on the measure’s pill', async ({ page }) => {
    await openEditorWithCount(page);
    const pill = page.getByTestId('in-measures-orders.count');

    await pill.getByRole('button', { name: 'Calculations on Count' }).click();
    await page.getByRole('menuitem', { name: 'Rank', exact: true }).click();

    await expect(pill.getByRole('button', { name: 'Calculations on Count' })).toContainText('Rank');
  });

  test('keeps the calculation chosen when the chart is saved and opened again', async ({
    page,
  }) => {
    // A chart of this test's own: New › Chart in Finance.
    await page.goto('/explore?folder=seed-folder-0');
    const contents = page.getByTestId('explore-contents');
    await contents.getByRole('button', { name: 'New', exact: true }).click();
    await page
      .getByRole('menu', { name: 'New' })
      .getByRole('menuitem', { name: /Chart$/ })
      .click();
    await expect(page).toHaveURL(/\/explore\/charts\/[^/]+\/edit\?new=true$/);
    const id = /\/explore\/charts\/([^/]+)\/edit\?new=true$/.exec(page.url())?.[1] ?? '';

    await page.getByLabel('Cube or view').selectOption({ label: 'Orders' });
    await wellPicker(page, 'measures').selectOption('orders.count');
    await page
      .getByTestId('in-measures-orders.count')
      .getByRole('button', { name: 'Calculations on Count' })
      .click();
    await page.getByRole('menuitem', { name: 'Rank', exact: true }).click();
    await page.getByRole('button', { name: 'Save chart' }).click();
    await expect(page).toHaveURL(new RegExp(`/explore/charts/${id}$`));

    await page.goto(`/explore/charts/${id}/edit`);
    await expect(
      page
        .getByTestId('in-measures-orders.count')
        .getByRole('button', { name: 'Calculations on Count' }),
    ).toContainText('Rank');
  });
});
