import { expect, test } from './fixtures';

/**
 * T500 (AC-295, AC-265, AC-002; design 08 of 2026-09-27, pin 1 and states D
 * and F): with sign-in on, Security is the Super-Admins' alone, in tabs at
 * their own addresses; its Policies say where access comes from now. Anyone
 * else has no Security in the bar, and its address shows the same Not found
 * as a missing page.
 */
const bar = (page: import('@playwright/test').Page) =>
  page.getByRole('banner').getByRole('navigation', { name: 'Workspaces' }).first();

test.describe('Security, as a writer sees it', () => {
  test.use({ role: 'writer' });

  test('isn’t in the bar, and its addresses are Not found (state D)', async ({ page }) => {
    await page.goto('/explore');
    await expect(bar(page).getByRole('link', { name: 'Explore' })).toBeVisible();
    await expect(bar(page).getByRole('link', { name: 'Security' })).toHaveCount(0);

    for (const address of ['/security', '/security/preview']) {
      await page.goto(address);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not found');
      await expect(page.getByRole('main')).toContainText('Nothing here matches that address.');
      await expect(page.getByRole('table', { name: 'Access policies' })).toHaveCount(0);
    }
  });
});

test.describe('Security, as a Super-Admin sees it', () => {
  test.use({ role: 'super' });

  test('is tabs at their own addresses, its Policies saying where access comes from (pin 1, state F)', async ({
    page,
  }) => {
    await page.goto('/explore');
    await bar(page).getByRole('link', { name: 'Security' }).click();
    await expect(page).toHaveURL(/\/security$/);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 1 })).toHaveText('Security');
    const tabs = main.getByRole('navigation', { name: 'Security' });
    await expect(tabs.getByRole('link')).toHaveText([
      'Policies',
      'Preview as groups',
      'Audit trail',
    ]);
    await expect(tabs.getByRole('link', { name: 'Policies' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(main).toContainText(
      'Access comes from AD groups set on folders: Cube refuses a folder’s cubes to anyone without one of its groups.',
    );
    await expect(main.getByRole('table', { name: 'Access policies' })).toBeVisible();
    // Not phase 1's sentence, which sign-in off keeps.
    await expect(main).not.toContainText(
      'The groups a request carries decide which of them apply.',
    );
    // The tabs drawn as design 08's: 36 px, the current underlined in the accent.
    const current = tabs.getByRole('link', { name: 'Policies' });
    expect(
      await current.evaluate((link) => {
        const style = getComputedStyle(link);
        return [style.height, style.borderBottomStyle, style.borderBottomWidth];
      }),
    ).toEqual(['36px', 'solid', '2px']);

    // Each tab at its own address, kept on reload (AC-002).
    await tabs.getByRole('link', { name: 'Preview as groups' }).click();
    await expect(page).toHaveURL(/\/security\/preview$/);
    await page.reload();
    await expect(
      main.getByRole('navigation', { name: 'Security' }).getByRole('link', {
        name: 'Preview as groups',
      }),
    ).toHaveAttribute('aria-current', 'page');
    // As groups (T438; design 08, state E).
    await expect(main.getByRole('region', { name: 'Preview as groups' })).toBeVisible();
    await expect(main.getByRole('table', { name: 'Access policies' })).toHaveCount(0);
  });
});
