import { readFileSync } from 'node:fs';

import type { APIRequestContext } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { CUBE, serviceToken } from '../api-process';
import { BASE_URL, expect, signInThroughDex, test, testedSource } from './fixtures';

/**
 * T335:
 * - AC-269: THE SYSTEM SHALL list a folder's models and data sources in
 *   Explore beside its dashboards and charts, each labelled with its kind.
 *   Its data sources' half: listed as "Data source", Built on its driver
 *   (references.md §4). Opening one in its settings comes with T363.
 * - AC-263: a read-only user sees no data sources.
 * - AC-164: no response to the browser holds a stored secret.
 *
 * A folder read-write for `sales-rw` (writer), read-only for `sales-ro`
 * (reader), made by `super`, with one data source in it, sealed as the
 * browser seals one: an envelope wechart keeps and never opens.
 */
const RUN = Math.random().toString(36).slice(2, 8);
/** The folder's data source: a name held once across the system (T700, AC-421). */
const SOURCE = `warehouse_${RUN}`;
/** The key the suite's API gives the browser: an envelope must be sealed to it. */
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
const FIELDS = { host: 'sample-db', port: 5432, database: 'sample', user: 'sample', ssl: false };
/** A password no response may hold, sealed only where nothing can be made from it. */
const CANARY = `e2e-${RUN}-password`;
/**
 * Sealed as the browser seals one (T441), for exactly these fields: xcube
 * opens every envelope a data source lands with (T442). The sample server's
 * own password, so its test passes and it can be made (T363).
 */
const sealedFor = (fields: Record<string, unknown>, secret = 'sample') =>
  sealSecretV1(KEY, 'postgres', 'password', fields, secret);
const MODEL = 'e2e-security';
const connectionsOf = async (request: APIRequestContext) =>
  (
    (await (
      await request.get(`${CUBE}/v1/semantic/models/${MODEL}/connections`, {
        headers: { authorization: `Bearer ${serviceToken()}` },
      })
    ).json()) as { connections: { name: string; folderId: string; secrets: string[] }[] }
  ).connections;

async function setUp(request: APIRequestContext) {
  const folder = await request.post('/api/documents', {
    data: { kind: 'folder', title: `Sources ${RUN}`, folderId: 'root' },
  });
  expect(folder.status()).toBe(201);
  const folderId = ((await folder.json()) as { id: string }).id;
  expect(
    (
      await request.put(`/api/folders/${folderId}/access`, {
        data: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
      })
    ).status(),
  ).toBe(200);
  const envelope = await sealedFor(FIELDS);
  const source = await request.post('/api/data-sources', {
    data: await testedSource(request, {
      folderId,
      name: SOURCE,
      driver: 'postgres',
      authMethod: 'password',
      fields: FIELDS,
      sealed: { password: envelope },
    }),
  });
  expect(source.status(), await source.text()).toBe(201);
  return { folderId, sourceId: ((await source.json()) as { id: string }).id, envelope };
}

test.use({ role: 'super' });

test('a folder lists its data source as a data source, built on its driver, and a reader sees none', async ({
  page,
  browser,
}) => {
  const { folderId, sourceId, envelope } = await setUp(page.request);
  try {
    const answers: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/api/'))
        void response.text().then(
          (text) => answers.push(text),
          () => undefined,
        );
    });

    await page.goto(`/explore?folder=${folderId}`);
    const row = page.getByTestId(`item-${sourceId}`);
    await expect(row).toBeVisible();
    await expect(row.getByRole('cell').nth(0)).toHaveText('Data source');
    await expect(row.getByRole('cell').nth(1)).toHaveText('PostgreSQL');
    await expect(row.locator('.itemicon')).toHaveAttribute('data-icon', 'data-source');
    await expect(row).toContainText(SOURCE);

    // Its settings say a secret is stored, never what it is (AC-164).
    const opened = await page.request.get(`/api/data-sources/${sourceId}`);
    expect(await opened.json()).toMatchObject({ secrets: { password: { stored: true } } });
    answers.push(await opened.text());
    for (const answer of answers) {
      expect(answer).not.toContain(envelope.ct);
      expect(answer).not.toContain(envelope.enc);
    }

    // A read-only member of the folder sees no data source there (AC-263).
    // Signed in as no one, not as the test's Super-Admin.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const reader = await context.newPage();
      await signInThroughDex(reader, 'reader');
      // A context made here has no base URL of its own.
      await reader.goto(`${BASE_URL}/explore?folder=${folderId}`);
      await expect(reader.getByRole('heading', { name: `Sources ${RUN}` })).toBeVisible();
      await expect(reader.getByTestId(`item-${sourceId}`)).toHaveCount(0);
      expect((await reader.request.get(`${BASE_URL}/api/data-sources/${sourceId}`)).status()).toBe(
        404,
      );
    } finally {
      await context.close();
    }
  } finally {
    await page.request.delete(`/api/data-sources/${sourceId}`);
    await page.request.delete(`/api/documents/folder/${folderId}`);
  }
});

/**
 * T442 (AC-327, AC-161): a folder's data source lands in xcube as a
 * connection — under its own name in its folder's xcube id (T728, AC-328;
 * `[R71]`), its secret named and never given back — and xcube, which opens
 * each envelope for its target, refuses one sealed for another, so wechart
 * stores nothing. Removed, it leaves xcube.
 */
test('a data source lands in xcube as a connection, refused when its secret won’t open there, and leaves with it', async ({
  page,
}) => {
  const { folderId, sourceId } = await setUp(page.request);
  const name = SOURCE;
  try {
    const held = (await connectionsOf(page.request)).filter((each) => each.name === name);
    expect(held.map(({ folderId: heldIn, secrets }) => ({ folderId: heldIn, secrets }))).toEqual([
      { folderId: `f${folderId.replaceAll('-', '')}`, secrets: ['password'] },
    ]);
    // No connection's name carries a folder's prefix.
    expect((await connectionsOf(page.request)).filter((each) => each.name.includes('__'))).toEqual(
      [],
    );

    // Sealed for another host, sent with this one: xcube can't open it, so
    // its test fails there, and nothing is made from it (T363).
    const moved = {
      folderId,
      driver: 'postgres',
      authMethod: 'password',
      fields: FIELDS,
      sealed: { password: await sealedFor({ ...FIELDS, host: 'other-db' }, CANARY) },
    };
    const tried = await page.request.post('/api/data-sources/test', {
      data: moved,
      timeout: 90_000,
    });
    const answer = (await tried.json()) as {
      ok: boolean;
      testId: string;
      checks: { id: string; status: string }[];
    };
    expect(answer.ok).toBe(false);
    expect(answer.checks[0]?.id).toBe('secrets');
    expect(answer.checks[0]?.status).toBe('failed');
    const refused = await page.request.post('/api/data-sources', {
      data: { ...moved, name: 'elsewhere', testId: answer.testId },
    });
    expect(refused.status(), await refused.text()).toBe(422);
    expect(((await refused.json()) as { error: string }).error).toMatch(
      /^Test its connection first/,
    );
    expect(JSON.stringify(await connectionsOf(page.request))).not.toContain(CANARY);
    const listed = (await (await page.request.get(`/api/folders/${folderId}/contents`)).json()) as {
      title: string;
    }[];
    expect(listed.map((row) => row.title)).not.toContain('elsewhere');

    expect((await page.request.delete(`/api/data-sources/${sourceId}`)).status()).toBe(204);
    expect((await connectionsOf(page.request)).map((each) => each.name)).not.toContain(name);
  } finally {
    await page.request.delete(`/api/data-sources/${sourceId}`);
    await page.request.delete(`/api/documents/folder/${folderId}`);
  }
});

/**
 * T361 (AC-159): a connection test runs in xcube, with Cube's own PostgreSQL
 * driver, against compose's sample database (its development login,
 * docker-compose.yml): each check said, a wrong password failing at connect
 * with the driver's own words and never the password itself.
 */
test('a connection test runs in xcube with Cube’s driver, each check said, and never gives a secret back', async ({
  page,
}) => {
  const fields = { host: 'sample-db', port: 5432, database: 'sample', user: 'sample', ssl: false };
  const testWith = async (password: string) => {
    const answer = await page.request.post('/api/data-sources/test', {
      data: {
        folderId: 'root',
        driver: 'postgres',
        authMethod: 'password',
        fields,
        sealed: { password: await sealSecretV1(KEY, 'postgres', 'password', fields, password) },
      },
      timeout: 90_000,
    });
    expect(answer.status(), await answer.text()).toBe(200);
    return { text: await answer.text(), body: (await answer.json()) as TestAnswer };
  };
  type TestAnswer = { ok: boolean; checks: { id: string; status: string; error?: string }[] };

  const wrong = `e2e-${RUN}-not-the-password`;
  const failed = await testWith(wrong);
  expect(failed.body.ok).toBe(false);
  expect(failed.body.checks.map(({ id, status }) => [id, status])).toEqual([
    ['secrets', 'passed'],
    ['config', 'passed'],
    ['connect', 'failed'],
    ['schemas', 'skipped'],
  ]);
  expect(failed.body.checks[2]?.error).toMatch(/password authentication failed/);
  expect(failed.text).not.toContain(wrong);

  const passed = await testWith('sample');
  // Kept, as the wizard's test is, so a data source can be made from it (T363).
  const { testId, ...answered } = passed.body as TestAnswer & { testId: string };
  expect(testId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(answered).toEqual({
    ok: true,
    checks: [
      expect.objectContaining({ id: 'secrets', status: 'passed' }),
      expect.objectContaining({ id: 'config', status: 'passed' }),
      expect.objectContaining({ id: 'connect', status: 'passed' }),
      expect.objectContaining({ id: 'schemas', status: 'passed' }),
    ],
  });

  // A stored one's tests are kept, newest first (T362, AC-163).
  const stored = await page.request.post('/api/data-sources', {
    data: await testedSource(page.request, {
      folderId: 'root',
      name: `e2e_${RUN}_tested`,
      driver: 'postgres',
      authMethod: 'password',
      fields,
      sealed: { password: await sealSecretV1(KEY, 'postgres', 'password', fields, 'sample') },
    }),
  });
  expect(stored.status(), await stored.text()).toBe(201);
  const id = ((await stored.json()) as { id: string }).id;
  try {
    // As stored, then with a password tried and not saved: a canary, which
    // no answer, and nothing the history keeps, may hold (AC-298).
    const canary = `e2e-${RUN}-canary-password`;
    for (const data of [
      {},
      { sealed: { password: await sealSecretV1(KEY, 'postgres', 'password', fields, canary) } },
    ])
      expect(
        (
          await page.request.post(`/api/data-sources/${id}/test`, { data, timeout: 90_000 })
        ).status(),
      ).toBe(200);
    const answer = await page.request.get(`/api/data-sources/${id}/tests`);
    const history = (await answer.json()) as {
      ok: boolean;
      asStored: boolean;
      checks: { id: string; status: string; error?: string }[];
      by: { name: string } | null;
    }[];
    expect(
      history.map(({ ok, asStored, checks }) => [
        ok,
        asStored,
        checks.map((check) => check.status),
      ]),
    ).toEqual([
      [false, false, ['passed', 'passed', 'failed', 'skipped']],
      [true, true, ['passed', 'passed', 'passed', 'passed']],
      // The test it was made from, first in its history (T363).
      [true, true, ['passed', 'passed', 'passed', 'passed']],
    ]);
    expect(history[0]?.checks[2]?.error).toMatch(/password authentication failed/);
    expect(history.every((test) => test.by !== null)).toBe(true);
    expect(await answer.text()).not.toContain(canary);
  } finally {
    await page.request.delete(`/api/data-sources/${id}`);
  }
});
