import { readFileSync } from 'node:fs';

import type { APIRequestContext } from '@playwright/test';

import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

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
/** The key the suite's API gives the browser: an envelope must be sealed to it. */
const KID = (
  JSON.parse(
    readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
  ) as { kid: string }
).kid;
/** Sized as xcube takes an envelope: a 32-byte `enc`, one 256-byte bucket and its tag. */
const ENVELOPE = {
  v: 1,
  kid: KID,
  enc: Buffer.alloc(32, `enc-${RUN}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${RUN}-secret-envelope`).toString('base64url'),
};

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
  const source = await request.post('/api/data-sources', {
    data: {
      folderId,
      name: 'warehouse',
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'sample-db', port: 5432, database: 'sample', user: 'cube', ssl: false },
      sealed: { password: ENVELOPE },
    },
  });
  expect(source.status(), await source.text()).toBe(201);
  return { folderId, sourceId: ((await source.json()) as { id: string }).id };
}

test.use({ role: 'super' });

test('a folder lists its data source as a data source, built on its driver, and a reader sees none', async ({
  page,
  browser,
}) => {
  const { folderId, sourceId } = await setUp(page.request);
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
    await expect(row).toContainText('warehouse');

    // Its settings say a secret is stored, never what it is (AC-164).
    const opened = await page.request.get(`/api/data-sources/${sourceId}`);
    expect(await opened.json()).toMatchObject({ secrets: { password: { stored: true } } });
    answers.push(await opened.text());
    for (const answer of answers) {
      expect(answer).not.toContain(ENVELOPE.ct);
      expect(answer).not.toContain(ENVELOPE.enc);
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
