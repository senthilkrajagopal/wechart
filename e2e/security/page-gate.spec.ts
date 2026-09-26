import { execFileSync } from 'node:child_process';

import type { Page } from '@playwright/test';

import { BASE_URL, expect, signInThroughDex, test, USERS } from './fixtures';

/**
 * T321 (AC-251, AC-253's page half, AC-316 through the browser).
 *
 * AC-251: WHERE security is enabled, WHEN a request without a signed-in
 * session reaches a wechart page …, THE SYSTEM SHALL send it to the configured
 * OIDC provider's sign-in … returning no wechart content.
 * AC-253: WHEN the user signs out, … the next request needs a new sign-in.
 * AC-316: … end a sign-in 12 hours after it began ….
 *
 * "No wechart content" is watched from the page's first script: a binding
 * records whether the top bar ever appeared before the browser left for Dex.
 */
const DEX_FORM = /^http:\/\/localhost:5556\/dex\//;

/** Whether any of wechart's own page appeared, from the first script on. */
async function watchForWechart(page: Page): Promise<() => boolean> {
  let seen = false;
  await page.exposeBinding('wechartAppeared', () => {
    seen = true;
  });
  await page.addInitScript(() => {
    const report = () => {
      if (document.querySelector('.app-bar, main')) {
        (window as unknown as { wechartAppeared: () => void }).wechartAppeared();
      }
    };
    new MutationObserver(report).observe(document, { childList: true, subtree: true });
  });
  return () => seen;
}

/** The session id in the browser's `wechart` cookie (a signed id: `<id>.<signature>`). */
async function sessionIdOf(page: Page): Promise<string> {
  const cookie = (await page.context().cookies(BASE_URL)).find((each) => each.name === 'wechart');
  expect(cookie, 'a session cookie').toBeDefined();
  return decodeURIComponent(cookie!.value).split('.')[0]!;
}

test('a page without a session goes to Dex’s sign-in, with nothing of wechart shown first', async ({
  page,
}) => {
  const appeared = await watchForWechart(page);
  await page.goto('/explore/dashboards/seed-dashboard-0');
  await expect(page).toHaveURL(DEX_FORM);
  await expect(page.locator('input[name="login"]')).toBeVisible();
  expect(appeared()).toBe(false);
});

test('signing in from there comes back to the page that was asked for', async ({ page }) => {
  await page.goto('/explore?folder=seed-folder-0');
  await expect(page).toHaveURL(DEX_FORM);
  await page.locator('input[name="login"]').fill('reader@wechart.test');
  // The test user's password, from infra/dex/test-users.json (fixtures.ts).
  await page.locator('input[name="password"]').fill(USERS.reader.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(`${BASE_URL}/explore?folder=seed-folder-0`);
});

test('after Sign out, the next page asks for a new sign-in (AC-253)', async ({ page }) => {
  // A sign-in of this test's own: signing out ends it, and no other test's.
  await signInThroughDex(page, 'writer');
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^Account: / })
    .click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(DEX_FORM);

  const appeared = await watchForWechart(page);
  await page.goto('/explore');
  await expect(page).toHaveURL(DEX_FORM);
  expect(appeared()).toBe(false);
});

test('a sign-in past its 12 hours asks for a new one, and says so mid-work (AC-316)', async ({
  page,
}) => {
  await signInThroughDex(page, 'writer');
  await expect(page.getByRole('banner').getByRole('button', { name: /^Account: / })).toBeVisible();

  // Twelve hours on, as far as the session store is concerned.
  const id = await sessionIdOf(page);
  execFileSync('docker', [
    'exec',
    'wechart-meta',
    'psql',
    '-U',
    'wechart',
    '-d',
    'wechart_security',
    '-c',
    `UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE id = '${id.replace(/'/g, "''")}'`,
  ]);

  // Mid-work: the next thing the page asks the API for finds the session
  // gone (asked from the page itself, as a tile would; a click could be
  // answered from the page's cache without asking).
  await page.evaluate(() => fetch('/api/folders'));
  const ended = page.getByRole('dialog', { name: 'Your session has ended' });
  await expect(ended).toBeVisible();
  await expect(page.locator('.app-bar')).toHaveCount(0);
  await ended.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(DEX_FORM);
});

test('opening a page on a sign-in past its 12 hours asks for a new one (AC-316)', async ({
  page,
}) => {
  await signInThroughDex(page, 'reader');
  const id = await sessionIdOf(page);
  execFileSync('docker', [
    'exec',
    'wechart-meta',
    'psql',
    '-U',
    'wechart',
    '-d',
    'wechart_security',
    '-c',
    `UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE id = '${id.replace(/'/g, "''")}'`,
  ]);
  // The browser still sends the cookie; the session behind it has lapsed.
  const appeared = await watchForWechart(page);
  await page.goto('/explore');
  await expect(page).toHaveURL(DEX_FORM);
  expect(appeared()).toBe(false);
});
