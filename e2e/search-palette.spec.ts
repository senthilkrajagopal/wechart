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
    await expect(palette.getByRole('searchbox')).toBeFocused();

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
  await expect(palette(page).getByRole('searchbox')).toBeFocused();
});

test('Escape returns focus to where it came from', async ({ page }) => {
  await page.goto('/explore');

  const toggle = page.getByRole('button', { name: /theme/i });
  await toggle.focus();
  await page.keyboard.press(SHORTCUT);
  await expect(palette(page).getByRole('searchbox')).toBeFocused();

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

  await palette(page).getByRole('searchbox').fill('k');

  await expect(palette(page).getByRole('searchbox')).toHaveValue('k');
  await expect(page.getByRole('dialog', { name: /search/i })).toBeVisible();
});
