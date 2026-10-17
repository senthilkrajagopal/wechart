import { expect, test } from '@playwright/test';

/**
 * T769 (AC-479; design 18, states A3 and H): with sign-in off, the
 * Single-user mode chip's menu opens the same Access tokens page, and the
 * single user can make a token there.
 *
 * The phase-1 configuration: `playwright.config.ts`, sign-in off.
 */
const RUN = Math.random().toString(36).slice(2, 8);

test.describe('Access tokens with sign-in off (T769, AC-479)', () => {
  test.afterEach(async ({ request }) => {
    const answer = await request.get('/api/account/tokens');
    if (!answer.ok()) return;
    const { tokens } = (await answer.json()) as { tokens: { id: string; name: string }[] };
    for (const token of tokens.filter((each) => each.name.includes(RUN))) {
      await request.delete(`/api/account/tokens/${token.id}`);
      await request.post(`/api/account/tokens/${token.id}/remove`);
    }
  });

  test('the chip’s menu opens the page, and a token can be made', async ({ page }) => {
    await page.goto('/explore');
    await page.getByRole('button', { name: 'Single-user mode' }).click();
    await page.getByRole('menuitem', { name: 'Access tokens' }).click();
    await expect(page).toHaveURL(/\/account\/tokens$/);
    await expect(
      page.getByText(/^Sign-in is off\. A token acts as wechart’s single user/),
    ).toBeVisible();

    await page.getByRole('button', { name: 'New token' }).click();
    const dialog = page.getByRole('dialog', { name: 'New access token' });
    // The single user holds every permission, so every scope is on offer.
    await expect(dialog.getByRole('checkbox', { name: /^Proposals and jobs/ })).toBeEnabled();
    const name = `Solo ${RUN}`;
    await dialog.getByRole('textbox', { name: /^Name/ }).fill(name);
    // The segment is its label, over a visually hidden radio.
    await dialog.getByText('7 days', { exact: true }).click();
    await expect(dialog.getByRole('radio', { name: '7 days' })).toBeChecked();
    await dialog.getByRole('button', { name: 'Create token' }).click();
    // Its text, once (T770); closed uncopied, after the question.
    const shown = page.getByRole('dialog', { name: 'Copy your token now' });
    await expect(shown.getByRole('textbox', { name: 'Your token' })).toHaveValue(/^wct_/);
    await shown.getByRole('button', { name: 'Done' }).click();
    await page
      .getByRole('alertdialog', { name: 'Close without copying?' })
      .getByRole('button', { name: 'Close' })
      .click();
    await expect(shown).toBeHidden();

    const row = page.getByRole('table', { name: 'Your tokens' }).getByRole('row', { name });
    await expect(row).toBeVisible();
    await expect(row.getByRole('cell').nth(3)).toContainText('in 7 days');
  });
});
