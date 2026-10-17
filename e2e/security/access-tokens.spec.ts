import type { APIRequestContext } from '@playwright/test';

import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * T769 (AC-430, AC-468, AC-469; design 18, screens 1 and 2, state A1):
 * "Access tokens" in the account menu opens the user's own page at
 * `/account/tokens`, and a token made there is listed, without its text.
 */
const RUN = Math.random().toString(36).slice(2, 8);

/** Revokes, then removes, every token of this run: none is left working. */
async function tidy(request: APIRequestContext) {
  const answer = await request.get('/api/account/tokens');
  if (!answer.ok()) return;
  const { tokens, stopped } = (await answer.json()) as {
    tokens: { id: string; name: string }[];
    stopped: { id: string; name: string }[];
  };
  for (const token of tokens.filter((each) => each.name.includes(RUN)))
    await request.delete(`/api/account/tokens/${token.id}`);
  for (const token of [...tokens, ...stopped].filter((each) => each.name.includes(RUN)))
    await request.post(`/api/account/tokens/${token.id}/remove`);
}

test.describe('Access tokens, signed in (T769, AC-430)', () => {
  // One with a My workspace, so Workspace edit is on offer: a Super-Admin
  // always has one, where `writer` has one only in a folder granting it.
  test.use({ role: 'super' });

  test.afterEach(async ({ page }) => {
    await tidy(page.request);
  });

  test('the account menu opens the page, and a token made there is listed', async ({ page }) => {
    await page.goto('/explore');
    await page.getByRole('button', { name: 'Account: Super Admin' }).click();
    await page.getByRole('menuitem', { name: 'Access tokens' }).click();
    await expect(page).toHaveURL(/\/account\/tokens$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Access tokens' })).toBeVisible();

    await page.getByRole('button', { name: 'New token' }).click();
    const dialog = page.getByRole('dialog', { name: 'New access token' });
    await expect(dialog.getByRole('checkbox', { name: /^Read/ })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: /^Read/ })).toBeDisabled();
    await expect(dialog.getByRole('radio', { name: '30 days' })).toBeChecked();
    const name = `Claude Code · desktop ${RUN}`;
    await dialog.getByRole('textbox', { name: /^Name/ }).fill(name);
    await dialog.getByRole('checkbox', { name: /^Workspace edit/ }).check();
    await dialog.getByRole('button', { name: 'Create token' }).click();

    // T770 (AC-430; design 18, screen 3): its text, once, with the command filled in.
    const shown = page.getByRole('dialog', { name: 'Copy your token now' });
    const text = shown.getByRole('textbox', { name: 'Your token' });
    await expect(text).toHaveValue(/^wct_[0-9a-f]{64}_[0-9a-f]{8}$/);
    const token = await text.inputValue();
    const server = new URL('/mcp', page.url()).href;
    await expect(
      shown.getByRole('textbox', { name: 'Add wechart to Claude Code, in a terminal' }),
    ).toHaveValue(
      `claude mcp add --transport http wechart ${server} --header "Authorization: Bearer ${token}"`,
    );
    // Done before any Copy asks first (C2); Close then closes it for good.
    await shown.getByRole('button', { name: 'Done' }).click();
    const asking = page.getByRole('alertdialog', { name: 'Close without copying?' });
    await expect(asking.getByRole('button', { name: 'Go back and copy it' })).toBeFocused();
    await asking.getByRole('button', { name: 'Close' }).click();
    await expect(shown).toBeHidden();

    const row = page.getByRole('table', { name: 'Your tokens' }).getByRole('row', { name });
    await expect(row).toBeVisible();
    await expect(row.getByRole('listitem')).toHaveText(['Read', 'Workspace edit']);
    await expect(row.getByRole('cell').nth(3)).toContainText('in 30 days');
    await expect(row.getByRole('cell').nth(4)).toHaveText('Never');
    expect(await page.content()).not.toContain(token.slice(4, 68));

    // A reload shows the row, and nothing of its text (C3).
    await page.reload();
    await expect(row).toBeVisible();
    expect(await page.content()).not.toContain(token.slice(4, 68));
    expect(await (await page.request.get('/api/account/tokens')).text()).not.toContain(
      token.slice(4, 68),
    );
  });
});

test.describe('Revoking from the page, and No longer working (T771, AC-431; design 18, D, E)', () => {
  test.use({ role: 'super' });

  test.afterEach(async ({ page }) => {
    await tidy(page.request);
  });

  test('Revoke asks first, revokes with no Undo, and Remove takes it off', async ({ page }) => {
    const name = `Claude Code · laptop ${RUN}`;
    const made = await page.request.post('/api/account/tokens', {
      data: { name, scopes: ['read'], days: 7 },
    });
    expect(made.status()).toBe(201);

    await page.goto('/account/tokens');
    const working = page.getByRole('table', { name: 'Your tokens' }).getByRole('row', { name });
    await working.getByRole('button', { name: 'Revoke' }).click();
    const asking = page.getByRole('alertdialog', { name: `Revoke “${name}”?` });
    await expect(asking.getByRole('button', { name: 'Cancel' })).toBeFocused();
    expect((await asking.boundingBox())?.width).toBe(520);
    await asking.getByRole('button', { name: 'Revoke token' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Revoked “' })).toHaveText(
      `Revoked “${name}”. Clients using it now get 401.`,
    );
    await expect(page.getByRole('button', { name: /undo/i })).toHaveCount(0);
    await expect(working).toHaveCount(0);
    const stopped = page
      .getByRole('table', { name: 'No longer working' })
      .getByRole('row', { name });
    await expect(stopped.getByRole('cell').nth(3)).toHaveText(
      /^Revoked · by Super Admin, \d{1,2} \w{3}/,
    );

    await stopped.getByRole('button', { name: 'Remove' }).click();
    await expect(stopped).toHaveCount(0);
    // Gone from the API's answer too.
    expect(await (await page.request.get('/api/account/tokens')).text()).not.toContain(name);
  });
});

test.describe('Security › Access tokens (T772, AC-470; design 18, screen 4)', () => {
  test.use({ role: 'super' });

  test('a Super-Admin sees another user’s token, revokes it, and the owner sees who', async ({
    page,
    browser,
  }) => {
    // Wren Writer makes a token in a context of her own.
    // An empty state: a new context would otherwise come with this test's own (super's).
    const wren = await browser.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const wrenPage = await wren.newPage();
      await signInThroughDex(wrenPage, 'writer');
      const name = `Claude Code · laptop ${RUN}`;
      const made = await wrenPage.request.post('/api/account/tokens', {
        data: { name, scopes: ['read'], days: 7 },
      });
      expect(made.status()).toBe(201);

      await page.goto('/security/tokens');
      const tabs = page.getByRole('navigation', { name: 'Security' });
      await expect(tabs.getByRole('link', { name: 'Access tokens' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await page.getByRole('combobox', { name: 'User' }).selectOption({ label: 'Wren Writer' });
      const row = page.getByRole('table', { name: 'Everyone’s tokens' }).getByRole('row', { name });
      await expect(row.getByRole('cell').first()).toHaveText('Wren Writer');
      expect(await page.content()).not.toContain((await made.json()).text.slice(4, 68));

      await row.getByRole('button', { name: `Revoke Wren Writer’s ${name}` }).click();
      const asking = page.getByRole('alertdialog', {
        name: `Revoke Wren Writer’s token “${name}”?`,
      });
      await expect(asking.getByRole('button', { name: 'Cancel' })).toBeFocused();
      await asking.getByRole('button', { name: 'Revoke token' }).click();
      await expect(row).toHaveCount(0);

      // Wren's own list names the Super-Admin as who revoked it (AC-431).
      const own = (await (await wrenPage.request.get('/api/account/tokens')).json()) as {
        stopped: { name: string; state: string; revokedBy: { name: string } | null }[];
      };
      expect(own.stopped.find((each) => each.name === name)).toEqual(
        expect.objectContaining({ state: 'revoked', revokedBy: { name: 'Super Admin' } }),
      );
      await tidy(wrenPage.request);
    } finally {
      await wren.close();
    }
  });
});

test.describe('Security › Access tokens, to anyone else (T772, AC-470; design 18, A4)', () => {
  test.use({ role: 'writer' });

  test('is Not found to a read-write member', async ({ page }) => {
    await page.goto('/security/tokens');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not found');
    expect((await page.request.get('/api/security/tokens')).status()).toBe(404);
  });
});

test.describe('Access tokens, read-only everywhere (T769, AC-469; design 18, A5)', () => {
  test.use({ role: 'reader' });

  test('offers only Read, the other two disabled with the reason', async ({ page }) => {
    await page.goto('/account/tokens');
    await page.getByRole('button', { name: 'New token' }).click();
    const dialog = page.getByRole('dialog', { name: 'New access token' });
    for (const scope of ['Workspace edit', 'Proposals and jobs']) {
      const box = dialog.getByRole('checkbox', { name: new RegExp(`^${scope}`) });
      await expect(box).toBeDisabled();
      await expect(box).toHaveAccessibleDescription(
        'You have no My workspace, so this wouldn’t let a client do anything.',
      );
    }
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });
});
