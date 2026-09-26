import { expect, test, USERS } from './fixtures';

/**
 * T320 (AC-257, compose half; AC-252's top bar; direction.md rule 59).
 *
 * AC-257: THE SYSTEM SHALL provide a development OIDC provider … in
 * docker-compose, so that sign-in can be tested locally.
 * AC-252: WHERE security is enabled, WHEN a user signs in, THE SYSTEM SHALL …
 * show the user's name and a Sign out control in the top bar.
 * Rule 59: the name beside a 28 px avatar at 1,280 px and wider; the account
 * menu holds the identity, and Sign out.
 *
 * `writer` signs in through Dex's own form (fixtures.ts), from compose.
 */
test.describe('signed in as writer, through Dex in docker-compose', () => {
  test.use({ role: 'writer', viewport: { width: 1280, height: 800 } });

  test('the top bar names them beside a 28 px avatar, and their menu offers Sign out', async ({
    page,
  }) => {
    await page.goto('/explore');
    const bar = page.getByRole('banner');
    const account = bar.getByRole('button', { name: 'Account: Wren Writer' });
    await expect(account).toBeVisible();
    await expect(account.getByTestId('account-name')).toBeVisible();
    await expect(account.getByTestId('account-name')).toHaveText('Wren Writer');
    const avatar = await account.getByTestId('account-avatar').boundingBox();
    expect([avatar?.width, avatar?.height]).toEqual([28, 28]);
    await expect(account.getByTestId('account-avatar')).toHaveText('WW');
    // Security is on: no single-user chip.
    await expect(bar.getByRole('button', { name: 'Single-user mode' })).toHaveCount(0);

    await account.click();
    const panel = page.getByTestId('account-panel');
    await expect(panel).toContainText('writer@wechart.test');
    await expect(panel.getByRole('menuitem', { name: 'Sign out' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(account).toBeFocused();
  });
});

/**
 * Every test role signs in through the fixture (T320's review), each with
 * exactly the groups Dex's token carries: AC-252's groups half, seen by the
 * browser. `nobody`'s token has no groups claim at all.
 */
for (const role of ['super', 'writer', 'reader', 'many', 'nobody'] as const) {
  test.describe(`signed in as ${role}`, () => {
    test.use({ role, viewport: { width: 1280, height: 800 } });

    test('the top bar names them, and wechart holds exactly the token’s groups', async ({
      page,
      role: signedInAs,
    }) => {
      await page.goto('/explore');
      const me = (await (await page.request.get('/api/me')).json()) as {
        name: string;
        identity: string;
        groups: string[];
        security: string;
      };
      expect(me.security).toBe('oidc');
      expect(me.identity).toBe(USERS[signedInAs!].email);
      expect(me.groups).toEqual(USERS[signedInAs!].groups);
      await expect(
        page.getByRole('banner').getByRole('button', { name: `Account: ${me.name}` }),
      ).toBeVisible();
    });
  });
}

test.describe('in a window narrower than 1,280 px', () => {
  test.use({ role: 'writer', viewport: { width: 1100, height: 800 } });

  test('the avatar stands alone, the name kept for the menu', async ({ page }) => {
    await page.goto('/explore');
    const account = page.getByRole('banner').getByRole('button', { name: 'Account: Wren Writer' });
    await expect(account.getByTestId('account-avatar')).toBeVisible();
    await expect(account.getByTestId('account-name')).toBeHidden();
    await account.click();
    await expect(page.getByTestId('account-panel')).toContainText('Wren Writer');
  });
});
