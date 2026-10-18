import { expect, type Page } from '@playwright/test';

/** The dashboard's Filters toggle, last in its header (AC-486). */
export const headerToggle = (page: Page) => page.locator('.dashboard__header button.header-toggle');

/** The header sheet: the description, the ownership line and the filter bar (F43). */
export const headerSheet = (page: Page) =>
  page.getByRole('region', { name: 'Filters and details', exact: true });

/**
 * Opens a dashboard's page by its tab in the compact row, or from "More ▾"
 * where the tab doesn't fit the row in view mode (AC-492, T837): a compact
 * chip in the row (T838) can leave less room for the tabs.
 */
export async function openPageTab(page: Page, name: string): Promise<void> {
  const row = page.locator('.dashboard__header');
  const tab = row.getByRole('tab', { name, exact: true });
  const more = row.getByRole('button', { name: 'More pages' });
  await expect(tab.or(more).first()).toBeVisible();
  // The row places its tabs again a frame after it changes (a chip coming,
  // T838): two frames, so the tab is where it will stay before choosing.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
  if ((await tab.count()) > 0) {
    await tab.click();
  } else {
    await more.click();
    await page
      .getByRole('menu', { name: 'More pages' })
      .getByRole('menuitem', { name, exact: true })
      .click();
  }
  await expect(row.getByRole('tab', { name, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
}

/**
 * Opens the dashboard's header sheet, where the description, the ownership
 * line and the filter bar are (F43): the reader's own step since T828
 * (AC-490). Waits for the dashboard's header first; a sheet already open, or
 * shown open while editing with no toggle (rule 114), is left as it is. Back
 * once the sheet is at rest, open.
 */
export async function openHeaderSheet(page: Page): Promise<void> {
  await expect(page.locator('.dashboard__header h1')).toBeVisible();
  const toggle = headerToggle(page);
  if ((await toggle.count()) === 0) return;
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // At rest: while it opens, nothing in it takes focus (AC-488, T833).
  await expect(page.locator('.header-sheet')).not.toHaveAttribute('data-motion', /./);
}
