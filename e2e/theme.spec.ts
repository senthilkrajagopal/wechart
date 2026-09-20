import { expect, test } from '@playwright/test';

/**
 * AC-003: WHEN the user switches the theme, THE SYSTEM SHALL re-render the
 * current surface in the other theme without changing the route or losing
 * scroll position.
 * Fails when: the route changes, the scroll position resets, or any element
 * keeps the previous theme's background colour after the switch.
 *
 * The scroll half of this criterion is asserted at T016, the first task with a
 * surface long enough to scroll. Asserting it against a page that cannot
 * scroll would pass without proving anything.
 */
const LIGHT_PAGE = 'rgb(244, 244, 242)'; // --wc-bg-page light, #f4f4f2
const DARK_PAGE = 'rgb(18, 18, 17)'; // --wc-bg-page dark, #121211

const background = (selector: string) =>
  `getComputedStyle(document.querySelector(${JSON.stringify(selector)})).backgroundColor`;

test('switching the theme repaints the surface and keeps the route', async ({ page }) => {
  await page.goto('/jobs');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(background('body'))).toBe(LIGHT_PAGE);

  await page.getByRole('button', { name: /theme/i }).click();

  // The route is untouched...
  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByRole('link', { name: 'Jobs' })).toHaveAttribute('aria-current', 'page');
  // ...and nothing is still painted in the old theme.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(background('body'))).toBe(DARK_PAGE);
});

test('switches back again', async ({ page }) => {
  await page.goto('/explore');

  const toggle = page.getByRole('button', { name: /theme/i });
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(background('body'))).toBe(LIGHT_PAGE);
});

test('the chosen theme survives a reload', async ({ page }) => {
  await page.goto('/explore');
  await page.getByRole('button', { name: /theme/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(background('body'))).toBe(DARK_PAGE);
});

test('the bar and the page use different surfaces, so the switch is visible throughout', async ({
  page,
}) => {
  await page.goto('/explore');

  const lightBar = await page.evaluate(background('.app-bar'));
  expect(lightBar).not.toBe(await page.evaluate(background('body')));

  await page.getByRole('button', { name: /theme/i }).click();

  const darkBar = await page.evaluate(background('.app-bar'));
  expect(darkBar).not.toBe(lightBar);
  expect(darkBar).not.toBe(await page.evaluate(background('body')));
});
