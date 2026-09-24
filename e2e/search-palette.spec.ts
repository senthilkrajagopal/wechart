import { expect, test } from '@playwright/test';

/**
 * AC-006: WHEN the user presses ⌘K or Ctrl+K anywhere in the application, THE
 * SYSTEM SHALL open the search palette with keyboard focus in its input.
 *
 * The component test covers both chords in jsdom; this covers what the browser
 * actually does with them, including that the browser's own Ctrl/⌘+K binding
 * does not win.
 */
const SHORTCUT = process.platform === 'darwin' ? 'Meta+k' : 'Control+k';

/** The palette itself — Explore and Security each have a search box of their own. */
const palette = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog', { name: /search/i });

test('opens from every workspace with focus in the input', async ({ page }) => {
  for (const path of ['/explore', '/jobs', '/security']) {
    await page.goto(path);
    // The shortcut is bound by an effect, so wait for the app to be mounted
    // rather than racing it — pressing a key at a document with no listener
    // yet fails intermittently and says nothing about the criterion.
    await expect(page.getByRole('button', { name: /theme/i })).toBeVisible();

    await page.keyboard.press(SHORTCUT);

    const palette = page.getByRole('dialog', { name: /search/i });
    await expect(palette).toBeVisible();
    // The palette's own: Security has a search box of its own (T172's "Find a dashboard").
    await expect(palette.getByRole('combobox')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
  }
});

test('opens while focus is in another control', async ({ page }) => {
  await page.goto('/explore');

  const toggle = page.getByRole('button', { name: /theme/i });
  await toggle.focus();
  await expect(toggle).toBeFocused();

  await page.keyboard.press(SHORTCUT);

  // The palette's box: Explore has a search box of its own (AC-019).
  await expect(palette(page).getByRole('combobox')).toBeFocused();
});

test('Escape returns focus to where it came from', async ({ page }) => {
  await page.goto('/explore');

  const toggle = page.getByRole('button', { name: /theme/i });
  await toggle.focus();
  await page.keyboard.press(SHORTCUT);
  await expect(palette(page).getByRole('combobox')).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(toggle).toBeFocused();
});

test('typing into the palette does not trigger the shortcut again', async ({ page }) => {
  await page.goto('/explore');
  // Mounted first, as in the first test: a key pressed before the shortcut's
  // listener is bound opens nothing, and the test then waits on a palette
  // that never comes (seen failing intermittently in Chrome and Safari).
  await expect(page.getByRole('button', { name: /theme/i })).toBeVisible();
  await page.keyboard.press(SHORTCUT);

  await palette(page).getByRole('combobox').fill('k');

  await expect(palette(page).getByRole('combobox')).toHaveValue('k');
  await expect(page.getByRole('dialog', { name: /search/i })).toBeVisible();
});

/**
 * T211 / AC-190: THE SYSTEM SHALL show at the right of the top bar a search
 * field that names the platform's shortcut (⌘K or Ctrl+K) and opens the
 * search palette when clicked, and an identity avatar at the far right.
 * `Fails when: the top bar offers no visible way to open search, or the
 * avatar is missing.`
 */
test('the top bar shows a search field naming the shortcut, and the avatar', async ({ page }) => {
  await page.goto('/explore');
  const bar = page.getByRole('banner');

  const trigger = bar.getByRole('button', { name: /^Search/ });
  await expect(trigger).toContainText(process.platform === 'darwin' ? '⌘K' : 'Ctrl K');
  await trigger.click();
  await expect(palette(page)).toBeVisible();
  await page.keyboard.press('Escape');
  // Back where it was: on the field that opened it.
  await expect(trigger).toBeFocused();

  // Phase 1's one user, named by the API, at the far right.
  const avatar = bar.getByRole('img', { name: 'Signed in as admin' });
  await expect(avatar).toHaveText('AD');
  const right = async (locator: typeof avatar) => (await locator.boundingBox())?.x ?? 0;
  expect(await right(avatar)).toBeGreaterThan(await right(trigger));
});

test('focus goes back where it was after ⌘K pressed twice, and after Close', async ({ page }) => {
  // T211's review: a second ⌘K while open recorded the palette's own input as
  // where it came from, and Escape then left focus on nothing.
  await page.goto('/explore');
  const toggle = page.getByRole('button', { name: /theme/i });
  await toggle.focus();
  await page.keyboard.press(SHORTCUT);
  await expect(palette(page).getByRole('combobox')).toBeFocused();
  await page.keyboard.press(SHORTCUT);
  await expect(palette(page).getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();

  // And by the Close button, the way out for a pointer.
  await page.keyboard.press(SHORTCUT);
  await palette(page).getByRole('button', { name: 'Close' }).click();
  await expect(palette(page)).toBeHidden();
  await expect(toggle).toBeFocused();
});

test('the avatar is there even when who is signed in cannot be read', async ({ page }) => {
  // AC-190's failing state is "the avatar is missing"; it was, until the API
  // answered, and for good if it failed.
  await page.route('**/api/me', (route) => route.fulfill({ status: 500, body: '{}' }));
  await page.goto('/explore');
  await expect(page.getByRole('banner').getByRole('img', { name: /^Signed in/ })).toBeVisible();
});

/**
 * T211 / AC-191: WHEN the user types in the search palette, THE SYSTEM SHALL
 * list the matching dashboards, library charts, Cube fields and model files,
 * each with its type, move the active result with the arrow keys, open it
 * with Enter, and return focus to where it was when the palette closes (R9).
 */
test('the palette finds fields and model files by type, and the arrows and Enter open one', async ({
  page,
}) => {
  await page.goto('/explore');
  await expect(page.getByRole('button', { name: /theme/i })).toBeVisible();
  await page.keyboard.press(SHORTCUT);
  const input = palette(page).getByRole('combobox');
  const results = palette(page).getByRole('listbox', { name: 'Search results' });

  // A model file, by its path.
  // (monthly_orders.yml matches too; the one asked for is found by name.)
  await input.fill('orders.yml');
  const file = results.getByRole('option', { name: /\bcubes\/orders\.yml$/ });
  await expect(file).toContainText('Model file');

  // A field, by its name: typed, and saying where it lives.
  await input.fill('total_amount');
  const field = results.getByRole('option').first();
  await expect(field).toContainText('Measure');
  await expect(field).toContainText('orders.total_amount');

  // The arrows move the active result, which the input names.
  await input.fill('orders');
  await expect(results.getByRole('option').nth(1)).toBeVisible();
  // Followed by what the input names as active, not by row number: results
  // arrive from three sources at different moments, and the active one is
  // kept by identity while the rows around it move.
  const activeId = async () => (await input.getAttribute('aria-activedescendant')) ?? '';
  await page.keyboard.press('ArrowDown');
  const first = await activeId();
  await page.keyboard.press('ArrowDown');
  const next = await activeId();
  expect(first).not.toBe('');
  expect(next).not.toBe(first);
  await page.keyboard.press('ArrowUp');
  expect(await activeId()).toBe(first);
  await page.keyboard.press('ArrowDown');
  const second = palette(page).locator(`[id="${next}"]`);
  await expect(second).toHaveAttribute('aria-selected', 'true');
  await expect(second).toBeInViewport();

  // Enter opens it, where it lives.
  const href = (await second.getAttribute('data-href')) ?? '';
  expect(href).not.toBe('');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
});
