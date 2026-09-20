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
    await expect(page.getByRole('searchbox')).toBeFocused();

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

  await expect(page.getByRole('searchbox')).toBeFocused();
});

test('Escape returns focus to where it came from', async ({ page }) => {
  await page.goto('/explore');

  const toggle = page.getByRole('button', { name: /theme/i });
  await toggle.focus();
  await page.keyboard.press(SHORTCUT);
  await expect(page.getByRole('searchbox')).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(toggle).toBeFocused();
});

test('typing into the palette does not trigger the shortcut again', async ({ page }) => {
  await page.goto('/explore');
  await page.keyboard.press(SHORTCUT);

  await page.getByRole('searchbox').fill('k');

  await expect(page.getByRole('searchbox')).toHaveValue('k');
  await expect(page.getByRole('dialog', { name: /search/i })).toBeVisible();
});
