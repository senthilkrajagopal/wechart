import { expect, test, type Page } from '@playwright/test';

/**
 * T183 / AC-177: THE SYSTEM SHALL pair every status, validation and job state
 * with an icon and a text label (direction.md rule 3).
 * Fails when: any state is conveyed by colour alone.
 *
 * Swept across the workspaces as they open, as each fails to read what it
 * asks for, and through a dashboard save that fails and a publish Cube
 * refuses: every element the app marks as a state — an alert, a status line,
 * a job state — is checked for both an icon (an `svg` or a `data-icon` glyph)
 * and words. A tile being asked again is held to it in `tiles/tileBusy.test.tsx`.
 */
const STATES = '[role="alert"], [role="status"], .status, [data-state], .state-line';

/**
 * Each visible state on the page that lacks its icon or its words. Shown
 * means taking up room — a kept-mounted live region with nothing to say is
 * empty and takes none — so a state drawn without words (a dot, a fade on a
 * box) is caught as well as words without an icon. The icon is a state's own
 * (`data-icon`), not any picture inside it.
 */
async function statesLacking(page: Page) {
  return page.locator(STATES).evaluateAll((elements) =>
    elements
      .filter((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return box.width > 2 && box.height > 2 && style.visibility !== 'hidden';
      })
      .map((element) => ({
        text: (element.textContent ?? '').trim().slice(0, 80),
        icon: element.querySelector('[data-icon]') !== null,
      }))
      .filter((state) => !state.icon || state.text === ''),
  );
}

const SURFACES = [
  { name: 'Explore', url: '/explore' },
  { name: 'a dashboard', url: '/explore/dashboards/seed-root-dashboard-1' },
  {
    name: 'a dashboard previewed as a security context',
    url: `/explore/dashboards/seed-root-dashboard-1?preview=${encodeURIComponent(
      JSON.stringify({ groups: ['sales'] }),
    )}`,
  },
  { name: 'the chart editor', url: '/explore/charts/seed-chart-status/edit' },
  { name: 'the Model workspace', url: '/model/files/cubes%2Forders.yml' },
  { name: 'Jobs', url: '/jobs' },
  { name: 'Jobs, its queries', url: '/jobs?tab=queries' },
  { name: 'Security', url: '/security' },
];

for (const surface of SURFACES) {
  test(`every state on ${surface.name} has an icon and words`, async ({ page }) => {
    await page.goto(surface.url);
    // Once what it asks for has come back.
    await page.waitForLoadState('networkidle');
    expect(await statesLacking(page)).toEqual([]);
  });

  /**
   * The failures a surface can show — each thing it asks for answering with
   * an error — held to the same rule: the error states are where colour
   * alone tends to creep in.
   */
  /**
   * While what it asks for is on its way: every answer held back, so the
   * loading states are what the page shows when it is swept.
   */
  test(`every state while ${surface.name} loads has an icon and words`, async ({ page }) => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/**', async (route) => {
      await held;
      await route.continue().catch(() => undefined);
    });
    await page.goto(surface.url, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[role="status"], .state-line').first()).toBeAttached();
    expect(await statesLacking(page)).toEqual([]);
    release();
  });

  test(`every failure on ${surface.name} has an icon and words`, async ({ page }) => {
    await page.route('**/api/**', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status: 503, json: { error: 'Unavailable for this test.' } })
        : route.continue(),
    );
    await page.goto(surface.url);
    await page.waitForLoadState('networkidle');
    expect(await statesLacking(page)).toEqual([]);
  });
}

/** An edit's states: a heading added, then a save the API fails. */
test('every state of a dashboard save that fails has an icon and words', async ({ page }) => {
  await page.goto('/explore/dashboards/seed-root-dashboard-1');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .getByRole('complementary', { name: 'Edit sidebar' })
    .getByRole('tab', { name: 'Add' })
    .click();
  await page.getByTestId('add-header').click();
  // Either way a dashboard is saved: alone, or with charts of its own.
  await page.route(/\/api\/(documents\/dashboard|dashboards)\//, (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, json: { error: 'Unavailable for this test.' } })
      : route.continue(),
  );
  await page
    .getByRole('toolbar', { name: 'Dashboard editing' })
    .getByRole('button', { name: 'Save', exact: true })
    .click();

  await expect(page.getByTestId('save-failed')).toBeVisible();
  expect(await statesLacking(page)).toEqual([]);
});

/** A tile deleted in an edit: the toast that offers it back. */
test('every state of a deletion has an icon and words', async ({ page }) => {
  await page.goto('/explore/dashboards/seed-root-dashboard-1');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByTestId('tile-menu-tile-status').click();
  await page.getByTestId('delete-tile-status').click();

  await expect(page.getByTestId('undo-toast')).toBeVisible();
  expect(await statesLacking(page)).toEqual([]);
});

/** A download from a tile's ⋯ menu: the note on what it holds. */
test('every state of a download has an icon and words', async ({ page }) => {
  await page.goto('/explore/dashboards/seed-root-dashboard-1');
  await page.waitForLoadState('networkidle');
  const tile = page.locator('[data-tile="tile-status"]');
  await tile.getByRole('button', { name: /^Actions for / }).click();
  await Promise.all([
    page.waitForEvent('download'),
    tile.getByRole('button', { name: 'Download CSV' }).click(),
  ]);

  await expect(tile.locator('.tile-export-note')).toContainText('Downloaded');
  expect(await statesLacking(page)).toEqual([]);
});

/** A model edit Cube refuses: the outcome, and the problem on its file. */
test('every state of a publish Cube refuses has an icon and words', async ({ page }) => {
  await page.goto('/model/files/cubes%2Forders.yml');
  await page.route('**/api/model/publish', (route) =>
    route.fulfill({
      status: 422,
      json: { errors: [{ path: 'cubes/orders.yml', message: 'no_such_member is not defined' }] },
    }),
  );
  const form = page.getByRole('region', { name: 'Cube orders' });
  await form.getByLabel('Title', { exact: true }).fill('Orders, edited');
  await page.getByRole('button', { name: 'Save & reload Cube' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'Cube refused the model' })).toBeVisible();
  expect(await statesLacking(page)).toEqual([]);
});
