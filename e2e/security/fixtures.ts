import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import {
  test as base,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';

/**
 * Signing the security suite's test users in (T320). Each role is signed in
 * through Dex's own login form, as a person would, once per worker; its
 * storage state (the session cookie) is then handed to every test that asks
 * for that role (Playwright's "authenticate once per worker" pattern,
 * research/test-stack.md, T320 addendum). A test that signs out should sign
 * in afresh with `signInThroughDex`, so it never ends a session others share.
 *
 * The users and their test passwords are Dex's static ones
 * (`infra/dex/test-users.json`, T315): development values only.
 */
export type Role = 'super' | 'writer' | 'reader' | 'many' | 'nobody' | 'manager';

interface TestUser {
  readonly email: string;
  readonly password: string;
  readonly groups: readonly string[];
}

export const USERS = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../infra/dex/test-users.json', import.meta.url)), 'utf8'),
) as Record<Role, TestUser>;

/** The suite's web preview; `browser.newPage` in a worker fixture has no baseURL. */
export const BASE_URL = 'http://localhost:5373';

/** Signs `role` in on `page`: wechart sends it to Dex, Dex's form, and back to Explore. */
export async function signInThroughDex(page: Page, role: Role): Promise<void> {
  const user = USERS[role];
  await page.goto(`${BASE_URL}/api/auth/login?returnTo=/explore`);
  // Dex's password connector's own form (research/dex.md).
  await expect(page).toHaveURL(/^http:\/\/localhost:5556\/dex\//);
  await page.locator('input[name="login"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.locator('button[type="submit"]').click();
  // The callback sets the session cookie on its way back to Explore.
  await page.waitForURL(`${BASE_URL}/explore`);
}

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

/** Each role's signed-in state, once per worker: a worker is its own process. */
const signedIn = new Map<Role, StorageState>();

export const test = base.extend<{ role: Role | undefined }>({
  /** Who the test's page is signed in as; nobody at all when unset. */
  role: [undefined, { option: true }],

  storageState: async ({ role, browser }, use) => {
    if (role === undefined) {
      await use(undefined);
      return;
    }
    let state = signedIn.get(role);
    if (state === undefined) {
      // A new context starts with no cookies, so no other role's comes along.
      const context = await browser.newContext();
      const page = await context.newPage();
      await signInThroughDex(page, role);
      state = await context.storageState();
      await context.close();
      signedIn.set(role, state);
    }
    await use(state);
  },
});

/**
 * A data source's body with the id of its passing test, which xcube runs on
 * exactly these settings: one is made only from that (T363, AC-158; the
 * user's answer, 2026-09-27: "test first, and dont save if test fails").
 */
export async function testedSource<Body extends Record<string, unknown>>(
  request: APIRequestContext,
  body: Body,
): Promise<Body & { testId: string }> {
  const { name: _name, targetFolderId: _target, ...settings } = body;
  void _name;
  void _target;
  const run = await request.post('/api/data-sources/test', { data: settings, timeout: 90_000 });
  expect(run.status(), await run.text()).toBe(200);
  const answer = (await run.json()) as { ok: boolean; testId: string };
  expect(answer.ok, JSON.stringify(answer)).toBe(true);
  return { ...body, testId: answer.testId };
}

export { expect };
