import { expect, test, type Page } from '@playwright/test';

/**
 * T061 / AC-055, second half: THE SYSTEM SHALL offer no numeric width or
 * height field anywhere in the editor (direction.md rule 36).
 * `Fails when: … a width or height input exists in the editor.`
 *
 * This is a property of the whole surface rather than of one component, so it
 * is asserted by sweeping the rendered page. Rule 36 exists because size
 * fields and a grid disagree: a tile typed as 437 px is not on the grid, and
 * the two ways of setting size then contradict each other. The rule is only
 * worth anything if nothing anywhere offers one, which a component test cannot
 * establish and a sweep can.
 */
const DASHBOARD = '/explore/dashboards/seed-root-dashboard-1';

/** Anything that would let a size be typed or stepped. */
async function sizeFields(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const names: string[] = [];
    for (const field of document.querySelectorAll('input, select, textarea')) {
      const element = field as HTMLInputElement;
      // Every source together, not the first one present: a field named
      // "tileWidth" whose visible label reads "Width (px)" would otherwise be
      // judged on the name alone, and "width" does not match inside camelCase
      // under a word boundary.
      const label = [
        element.getAttribute('aria-label'),
        element.getAttribute('name'),
        element.getAttribute('id'),
        element.getAttribute('placeholder'),
        element.getAttribute('title'),
        ...[...(element.labels ?? [])].map((node) => node.textContent),
      ]
        .filter((part) => part !== null && part !== '')
        .join(' ');

      // Width and height anywhere in that text, camelCase included, plus the
      // units a size would be typed in.
      if (/width|height|\b(cols?|columns?|px|pixels?|rows?)\b/i.test(label)) {
        names.push(`${element.tagName.toLowerCase()}[${label.trim()}]`);
      }
    }
    return names;
  });
}

test('a dashboard in edit mode offers no width or height field', async ({ page }) => {
  await page.goto(DASHBOARD);
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeVisible();

  expect(await sizeFields(page)).toEqual([]);
});

test('every panel of the edit sidebar offers no width or height field', async ({ page }) => {
  await page.goto(DASHBOARD);
  await page.getByRole('button', { name: 'Edit' }).click();

  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  for (const panel of ['Add', 'Outline', 'Properties']) {
    await sidebar.getByRole('tab', { name: panel }).click();
    await expect(sidebar.getByRole('tabpanel')).toBeVisible();

    // Properties is where a size field would most plausibly be added, which is
    // exactly why each panel is opened rather than only the default one.
    expect(await sizeFields(page)).toEqual([]);
  }
});

test('the chart editor offers no width or height field either', async ({ page }) => {
  // "Anywhere in the editor" is the criterion's wording, and a tile's pencil
  // leads here.
  await page.goto('/explore/charts/new/edit');
  await page.getByLabel('Cube or view').selectOption({ label: 'Orders' });
  await expect(page.getByTestId('member-orders.count')).toBeVisible();

  // An empty editor renders almost none of its controls, so a sweep of it
  // would be a sweep of nothing. Filling the wells brings out the chart-type
  // chooser, the axis editor and the tile itself — the panels where a size
  // field would actually be reached for.
  await page.getByTestId('add-measures').selectOption('orders.count');
  await page.getByTestId('add-dimensions').selectOption('orders.status');
  await page.getByTestId('add-timeDimensions').selectOption('orders.ordered_at');
  await expect(page.getByTestId('result-row-count')).toBeVisible();

  expect(await sizeFields(page)).toEqual([]);

  // The results drawer is part of the editor and is reached by a control, so
  // a sweep that never opens it has not swept it.
  for (const view of ['rows', 'underlying', 'query']) {
    const tab = page.getByTestId(`drawer-tab-${view}`);
    if ((await tab.count()) === 0) continue;
    await tab.click();
    await expect(page.getByTestId('results-drawer')).toBeVisible();

    expect(await sizeFields(page)).toEqual([]);
  }
});
