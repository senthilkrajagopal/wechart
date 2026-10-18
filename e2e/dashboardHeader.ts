import { expect, type Page } from '@playwright/test';

/** The dashboard's Filters toggle, last in its header (AC-486). */
export const headerToggle = (page: Page) => page.locator('.dashboard__header button.header-toggle');

/**
 * Opens the dashboard's header sheet, where the description, the ownership
 * line and the filter bar are (F43): the reader's own step since T828
 * (AC-490). Waits for the dashboard's header first; a sheet already open, or
 * shown open while editing with no toggle (rule 114), is left as it is.
 */
export async function openHeaderSheet(page: Page): Promise<void> {
  await expect(page.locator('.dashboard__header h1')).toBeVisible();
  const toggle = headerToggle(page);
  if ((await toggle.count()) === 0) return;
  if ((await toggle.getAttribute('aria-expanded')) === 'true') return;
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}
