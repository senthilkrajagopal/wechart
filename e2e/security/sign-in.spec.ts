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
    // Opening focuses the first item: Access tokens, above Sign out since
    // T769 (design 18, A1); Sign out is still offered, after it.
    await expect(panel.getByRole('menuitem')).toHaveText(['Access tokens', 'Sign out']);
    await expect(panel.getByRole('menuitem', { name: 'Access tokens' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(account).toBeFocused();
  });

  /**
   * T245's avatar check, moved here by T696: with sign-in off the chip takes
   * its place (AC-190 as amended). `.avatar { background: var(--role-dim-soft);
   * color: var(--role-dim) }` (N7, mismatch 3), in both themes, and painted at
   * all: a token the sheet never emitted would read as transparent on both
   * sides of the comparison (T245's review).
   */
  test('the avatar: the dimension role on its tint', async ({ page }) => {
    await page.goto('/explore');
    const avatar = page.getByRole('banner').getByTestId('account-avatar');
    const token = (name: string, property: 'color' | 'background-color') =>
      page.evaluate(
        ([tokenName, prop]) => {
          const probe = document.createElement('span');
          probe.style.setProperty(prop, `var(--wc-${tokenName})`);
          document.body.append(probe);
          const value = getComputedStyle(probe).getPropertyValue(prop);
          probe.remove();
          return value;
        },
        [name, property] as const,
      );
    for (const theme of ['light', 'dark'] as const) {
      if (theme === 'dark') {
        await page.getByRole('button', { name: /theme/i }).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      }
      const painted = await avatar.evaluate((each) => ({
        'background-color': getComputedStyle(each).backgroundColor,
        color: getComputedStyle(each).color,
      }));
      expect(painted).toEqual({
        'background-color': await token('bg-role-dimension-soft', 'background-color'),
        color: await token('role-dimension', 'color'),
      });
      expect(painted['background-color']).not.toBe('rgba(0, 0, 0, 0)');
    }
  });

  /** T696 (AC-190, AC-252; EXP-17, EXP-18; design 09, pins 3–6). */
  test('the account button is 36 px at the far right, and its menu design 09’s', async ({
    page,
  }) => {
    await page.goto('/explore');
    const bar = page.getByRole('banner');
    const account = bar.getByRole('button', { name: 'Account: Wren Writer' });
    const style = (locator: typeof account, ...keys: string[]) =>
      locator.evaluate(
        (each, names) => names.map((name) => getComputedStyle(each).getPropertyValue(name)),
        keys,
      );
    expect(Math.round((await account.boundingBox())!.height)).toBe(36);
    expect(await style(account, 'padding-left', 'padding-right')).toEqual(['4px', '8px']);
    await expect(account.getByTestId('account-chevron')).toBeVisible();
    // The avatar at the far right with sign-in on (AC-190).
    const search = bar.getByRole('button', { name: /^Search wechart/ });
    expect((await account.boundingBox())!.x).toBeGreaterThan((await search.boundingBox())!.x);

    await account.click();
    const panel = page.getByTestId('account-panel');
    expect(Math.round((await panel.boundingBox())!.width)).toBe(280);
    const identity = panel.getByText('writer@wechart.test');
    expect((await style(identity, 'font-family'))[0]).toMatch(/Plex Mono|monospace/);
    expect(await style(identity, 'font-size')).toEqual(['12px']);
    const signOut = panel.getByRole('menuitem', { name: 'Sign out' });
    expect(Math.round((await signOut.boundingBox())!.height)).toBe(30);
    expect(await style(signOut, 'font-size')).toEqual(['14px']);
    await expect(signOut.locator('svg[data-icon="sign-out"]')).toHaveCount(1);
  });
});

test.describe('signed in as super, the account menu’s badge', () => {
  test.use({ role: 'super', viewport: { width: 1280, height: 800 } });

  test('is the accent Super-Admin badge, 22 px with its shield (T696, EXP-18)', async ({
    page,
  }) => {
    await page.goto('/explore');
    await page
      .getByRole('banner')
      .getByRole('button', { name: /^Account: / })
      .click();
    const badge = page.getByTestId('account-panel').getByText('Super-Admin');
    expect(Math.round((await badge.boundingBox())!.height)).toBe(22);
    const [color, weight, background] = await badge.evaluate((each) => [
      getComputedStyle(each).color,
      getComputedStyle(each).fontWeight,
      getComputedStyle(each).backgroundColor,
    ]);
    const accent = await page
      .getByTestId('brand-mark')
      .evaluate((each) => getComputedStyle(each).backgroundColor);
    expect([color, weight]).toEqual([accent, '600']);
    expect(background).not.toBe('rgba(0, 0, 0, 0)');
    await expect(badge.locator('svg')).toHaveCount(1);
  });

  /**
   * T696 (CMP-07, T696-3): a Super-Admin's workspaces, the search at 260, at
   * 1,024. Six since SQL runner joined them (T796, AC-001).
   */
  test('fits the bar at 1,024: every workspace on one line, the search at 260', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('/explore');
    const links = page
      .getByRole('banner')
      .getByRole('navigation', { name: 'Workspaces' })
      .getByRole('link');
    await expect(links).toHaveCount(6);
    for (const link of await links.all())
      expect(
        await link.evaluate((each) => {
          const words = document.createRange();
          words.selectNodeContents(each);
          return new Set([...words.getClientRects()].map((box) => Math.round(box.top))).size;
        }),
        await link.innerText(),
      ).toBe(1);
    const search = (await page.locator('.app-bar > .app-search').boundingBox())!;
    expect(Math.round(search.width)).toBe(260);
    expect(
      await page.locator('.app-bar').evaluate((each) => each.scrollWidth - each.clientWidth),
    ).toBe(0);
  });
});

/**
 * Every test role signs in through the fixture (T320's review), each with
 * exactly the groups Dex's token carries: AC-252's groups half, seen by the
 * browser. `nobody`'s token has no groups claim at all.
 */
for (const role of ['super', 'writer', 'reader', 'many', 'nobody', 'manager'] as const) {
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
        superAdmin: boolean;
        security: string;
      };
      expect(me.security).toBe('oidc');
      expect(me.identity).toBe(USERS[signedInAs!].email);
      expect(me.groups).toEqual(USERS[signedInAs!].groups);
      // Only the configured group's member is a Super-Admin (T323, AC-256).
      expect(me.superAdmin).toBe(signedInAs === 'super');
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
