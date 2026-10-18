import { expect, test } from '@playwright/test';

/**
 * AC-002: WHEN the user opens a workspace, a dashboard, a chart or a model
 * file, THE SYSTEM SHALL change the URL so that reloading it restores the same
 * surface and the same selected object.
 * Fails when: after reload the application shows a different workspace,
 * dashboard, chart or file than the URL names.
 *
 * Each case navigates, reloads, and asserts the surface came back — reload is
 * the whole point, so none of these may assert only that a link works.
 */
const WORKSPACES = [
  { path: '/explore', label: 'Explore' },
  { path: '/data-sources', label: 'Data sources' },
  { path: '/jobs', label: 'Jobs' },
  { path: '/schedules', label: 'Schedules' },
  { path: '/sql', label: 'SQL runner' },
  { path: '/security', label: 'Security' },
];

test.describe('workspaces survive a reload', () => {
  for (const { path, label } of WORKSPACES) {
    test(`${label} at ${path}`, async ({ page }) => {
      // Exact: a workspace's own rows can name it too ("Edit schedules_… in Model").
      await page.goto(path);
      await expect(page.getByRole('link', { name: label, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );

      await page.reload();

      // SQL runner names its open tab in the address too (AC-446, T801).
      await expect(page).toHaveURL(
        new RegExp(path === '/sql' ? `${path}\\?tab=[0-9a-f]{8}$` : `${path}$`),
      );
      await expect(page.getByRole('link', { name: label, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });
  }

  /**
   * The Model workspace keeps its address, though the switcher lists it no
   * more (AC-001; T331): known by its heading, before and after a reload.
   */
  test('Model at /model', async ({ page }) => {
    const heading = page.getByRole('heading', { name: 'Model', level: 1 });
    await page.goto('/model');
    await expect(heading).toBeVisible();

    await page.reload();

    await expect(page).toHaveURL(/\/model$/);
    await expect(heading).toBeVisible();
  });
});

test('navigating the switcher changes the URL', async ({ page }) => {
  await page.goto('/explore');
  await page.getByRole('link', { name: 'Jobs' }).click();

  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByRole('link', { name: 'Jobs' })).toHaveAttribute('aria-current', 'page');
});

test.describe('a selected object survives a reload', () => {
  const cases = [
    { what: 'chart', path: '/explore/charts/chart-7', id: 'chart-7' },
    { what: 'model file', path: '/model/files/cubes%2Forders.yml', id: 'cubes/orders.yml' },
  ];

  for (const { what, path, id } of cases) {
    test(`${what} ${id}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByTestId('selected-object')).toHaveText(id);

      await page.reload();

      // The URL names the object, and the app comes back showing that one --
      // not a different object and not an empty surface.
      await expect(page.getByTestId('selected-object')).toHaveText(id);
    });
  }

  /**
   * The dashboard is asserted through the surface itself — the dashboard's own
   * title — rather than through a marker put in the page for the test. Since
   * T023 the route renders a real dashboard, so there is something honest to
   * look at, and a test-only element would now be the only reason it existed.
   */
  test('dashboard seed-root-dashboard-1', async ({ page }) => {
    await page.goto('/explore/dashboards/seed-root-dashboard-1');
    await expect(page.getByRole('heading', { name: 'Company dashboard 01' })).toBeVisible();

    await page.reload();

    await expect(page.getByRole('heading', { name: 'Company dashboard 01' })).toBeVisible();
  });

  test('a different id in the URL selects a different object', async ({ page }) => {
    await page.goto('/explore/dashboards/seed-root-dashboard-1');
    await expect(page.getByRole('heading', { name: 'Company dashboard 01' })).toBeVisible();

    await page.goto('/explore/dashboards/seed-root-dashboard-2');
    await expect(page.getByRole('heading', { name: 'Company dashboard 02' })).toBeVisible();
  });
});

test('an unknown route reports itself rather than rendering a blank page', async ({ page }) => {
  await page.goto('/nonsense');
  await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible();
});
