import { readFileSync } from 'node:fs';

import type { APIRequestContext } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { CUBE, serviceToken } from '../api-process';
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
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
const FIELDS = { host: 'sample-db', port: 5432, database: 'sample', user: 'cube', ssl: false };
/**
 * Sealed as the browser seals one (T441), for exactly these fields: xcube
 * opens every envelope a data source lands with (T442).
 */
const sealedFor = (fields: Record<string, unknown>) =>
  sealSecretV1(KEY, 'postgres', 'password', fields, `e2e-${RUN}-password`);
const MODEL = 'e2e-security';
const connectionsOf = async (request: APIRequestContext) =>
  (
    (await (
      await request.get(`${CUBE}/v1/semantic/models/${MODEL}/connections`, {
        headers: { authorization: `Bearer ${serviceToken()}` },
      })
    ).json()) as { connections: { name: string; secrets: string[] }[] }
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
    data: {
      folderId,
      name: 'warehouse',
      driver: 'postgres',
      authMethod: 'password',
      fields: FIELDS,
      sealed: { password: envelope },
    },
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
    await expect(row).toContainText('warehouse');

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
 * connection — its full name `<folderId>__<name>`, its secret named and never
 * given back — and xcube, which opens each envelope for its target, refuses
 * one sealed for another, so wechart stores nothing. Removed, it leaves xcube.
 */
test('a data source lands in xcube as a connection, refused when its secret won’t open there, and leaves with it', async ({
  page,
}) => {
  const { folderId, sourceId } = await setUp(page.request);
  const name = `f${folderId.replaceAll('-', '')}__warehouse`;
  try {
    const held = (await connectionsOf(page.request)).find((each) => each.name === name);
    expect(held?.secrets).toEqual(['password']);
    expect(JSON.stringify(await connectionsOf(page.request))).not.toContain(`e2e-${RUN}-password`);

    // Sealed for another host, sent with this one: xcube can't open it.
    const moved = await page.request.post('/api/data-sources', {
      data: {
        folderId,
        name: 'elsewhere',
        driver: 'postgres',
        authMethod: 'password',
        fields: FIELDS,
        sealed: { password: await sealedFor({ ...FIELDS, host: 'other-db' }) },
      },
    });
    expect(moved.status(), await moved.text()).toBe(422);
    expect(((await moved.json()) as { error: string }).error).toMatch(
      /^xcube can’t open a secret: .*Enter it again\.$/,
    );
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
