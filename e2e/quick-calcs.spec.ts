import { expect, test, type Page } from '@playwright/test';

import { wellPicker } from './wells';

/**
 * Quick calculations (F6), in the chart editor as it is served.
 *
 * A test either opens the empty seed chart and never saves it, or saves a
 * chart of its own, so the browsers running at once share nothing they change.
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

/**
 * AC-049: WHEN a quick calculation needs a time dimension and the chart has
 * none, THE SYSTEM SHALL disable it and say which field is missing.
 * Fails when: the calculation is offered and produces an error, or gives no
 * reason when disabled.
 */
test.describe('a calculation over time on a chart with no time field (AC-049)', () => {
  test('is disabled, naming the field to add, until one is added', async ({ page }) => {
    await openEditorWithCount(page);
    const pill = page.getByTestId('in-measures-orders.count');
    const button = pill.getByRole('button', { name: 'Calculations on Count' });

    await button.click();
    const menu = page.getByRole('menu', { name: 'Calculations on Count' });
    for (const name of [
      'Difference from previous period',
      '% difference from previous period',
      'Running total',
      'Moving average, 3 periods',
      'Moving average, 6 periods',
      'Moving average, 12 periods',
    ]) {
      const item = menu.getByRole('menuitem', { name, exact: true });
      await expect(item).toHaveAttribute('aria-disabled', 'true');
      // Said where it can be read, naming Orders' time field, and as its description.
      await expect(item).toContainText('Needs a time field in Time: add Ordered at.');
      await expect(item).toHaveAccessibleDescription('Needs a time field in Time: add Ordered at.');
    }
    for (const name of ['% of total', 'Rank']) {
      await expect(menu.getByRole('menuitem', { name, exact: true })).not.toHaveAttribute(
        'aria-disabled',
      );
    }
    // Clicked anyway (past Playwright's own refusal to click a disabled
    // item), it isn't applied.
    await menu.getByRole('menuitem', { name: 'Running total', exact: true }).click({ force: true });
    await expect(button).toContainText('count');
    await expect(button).not.toContainText('Running total');

    // With the time field in Time, it is offered, and applies.
    await page.keyboard.press('Escape');
    await wellPicker(page, 'timeDimensions').selectOption('orders.ordered_at');
    await expect(page.getByTestId('in-timeDimensions-orders.ordered_at')).toBeVisible();
    await button.click();
    const running = menu.getByRole('menuitem', { name: 'Running total', exact: true });
    await expect(running).not.toHaveAttribute('aria-disabled');
    await running.click();
    await expect(button).toContainText('Running total');
  });

  test('says so in full, inside the menu, when the cube has no time field (T381’s review)', async ({
    page,
  }) => {
    await page.goto('/explore/charts/seed-chart-empty/edit');
    await page.getByLabel('Cube or view').selectOption({ label: 'Products' });
    await wellPicker(page, 'measures').selectOption('products.count');
    await page
      .getByTestId('in-measures-products.count')
      .getByRole('button', { name: 'Calculations on Count' })
      .click();
    const menu = page.getByRole('menu', { name: 'Calculations on Count' });
    const item = menu.getByRole('menuitem', { name: 'Running total', exact: true });
    const reason = 'Needs a time field in Time, and this cube or view has none.';

    await expect(item).toContainText(reason);
    // Read to its end: the menu doesn't cut it off or scroll sideways to show it.
    const fits = await menu.evaluate((element, text) => {
      const why = [...element.querySelectorAll('.quick-calc__why')].find(
        (each) => each.textContent === text,
      );
      if (why === undefined) return 'no reason drawn';
      const box = element.getBoundingClientRect();
      const line = why.getBoundingClientRect();
      if (element.scrollWidth > element.clientWidth) return 'the menu scrolls sideways';
      return line.right <= box.right && line.left >= box.left ? 'fits' : 'cut off';
    }, reason);
    expect(fits).toBe('fits');
  });
});
