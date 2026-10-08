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

/**
 * T474 (design 08, state D; AC-295, rule 67): for anyone but a Super-Admin,
 * a writer, a reader and someone in no group, none of the three tabs is
 * there, and each address renders the same Not found as a missing page.
 */
for (const role of ['writer', 'reader', 'nobody'] as const) {
  test.describe(`Security, as ${role} sees it`, () => {
    test.use({ role });

    test('isn’t in the bar, and its addresses are Not found (state D)', async ({ page }) => {
      await page.goto('/explore');
      await expect(bar(page).getByRole('link', { name: 'Explore' })).toBeVisible();
      await expect(bar(page).getByRole('link', { name: 'Security' })).toHaveCount(0);

      for (const address of ['/security', '/security/preview', '/security/audit']) {
        await page.goto(address);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not found');
        await expect(page.getByRole('main')).toContainText('Nothing here matches that address.');
        await expect(page.getByRole('navigation', { name: 'Security' })).toHaveCount(0);
        await expect(page.getByRole('table', { name: 'Access policies' })).toHaveCount(0);
        await expect(page.getByRole('table', { name: 'Audit trail' })).toHaveCount(0);
      }
    });
  });
}

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
    // As design 08 draws the page (T699, SEC-13 to SEC-16): its title 14 px under
    // the top bar, its parts 10 px apart; the note at 12/16 across the content's
    // width; identifiers in the code face; a cube with no policy a row, its words
    // in the secondary colour.
    const topBar = (await page.getByRole('banner').boundingBox())!;
    const title = (await main.getByRole('heading', { level: 1 }).boundingBox())!;
    expect(Math.round(title.y - (topBar.y + topBar.height))).toBe(14);
    await expect(main.locator('.security-workspace')).toHaveCSS('row-gap', '10px');
    const note = main.getByRole('note').filter({ hasText: 'Access comes from AD groups' });
    await expect(note).toHaveCSS('font-size', '12px');
    await expect(note).toHaveCSS('line-height', '16px');
    const policies = main.getByRole('table', { name: 'Access policies' });
    expect(Math.round((await note.boundingBox())!.width)).toBe(
      Math.round((await main.locator('.security-workspace').boundingBox())!.width),
    );
    const none = policies.getByRole('row').filter({ hasText: 'No policy: open within' }).first();
    await expect(none.getByRole('cell').first()).toHaveCSS('font-family', /^"IBM Plex Mono"/);
    const secondary = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.color = 'var(--wc-text-secondary)';
      document.body.append(probe);
      const said = getComputedStyle(probe).color;
      probe.remove();
      return said;
    });
    await expect(none.getByRole('cell').nth(1)).toHaveCSS('color', secondary);
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
    // T474: groups chosen as chips from the AD group picker, in place of
    // phase 1's JSON editor and "Find a dashboard" (state E; AC-166).
    const preview = main.getByRole('region', { name: 'Preview as groups' });
    await expect(preview.getByRole('combobox', { name: 'AD group' })).toBeVisible();
    // Its fields at 28/12, as design 08's preview has them (T699, CMP-08).
    for (const field of [
      preview.getByRole('combobox', { name: 'AD group' }),
      preview.getByRole('searchbox', { name: 'Dashboard to preview' }),
    ]) {
      await expect(field).toHaveCSS('height', '28px');
      await expect(field).toHaveCSS('font-size', '12px');
    }
    await expect(main.getByLabel('Security context (JSON)')).toHaveCount(0);
    await expect(main.getByLabel('Find a dashboard')).toHaveCount(0);
    await expect(main.getByRole('region', { name: 'Preview a security context' })).toHaveCount(0);

    // T474: the third tab, the audit trail, at its own address (pin 1; T369's page).
    await main
      .getByRole('navigation', { name: 'Security' })
      .getByRole('link', { name: 'Audit trail' })
      .click();
    await expect(page).toHaveURL(/\/security\/audit(\?.*)?$/);
    await expect(
      main.getByRole('navigation', { name: 'Security' }).getByRole('link', { name: 'Audit trail' }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      main.getByRole('table', { name: 'Audit trail' }).getByRole('columnheader'),
    ).toHaveText(['Time', 'User', 'Event', 'Folder', 'Item', 'Details']);
    await expect(main.getByText(/^Records older than .+ are removed\./)).toBeVisible();
  });
});
