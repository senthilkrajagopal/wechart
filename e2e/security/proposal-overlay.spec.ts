import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { APIRequestContext } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { querySigner } from '../../packages/api/src/cube/signing';
import { landed } from '../model-files';
import { BASE_URL, expect, signInThroughDex, test, testedSource } from './fixtures';

/**
 * T440 (AC-323): a proposal's overlay, `p-<proposal id>`, in compose's xcube.
 * A data source copied into the writer's workspace and pointed at another
 * database is proposed back. Its review's queries answer from that database
 * for its author and for a Super-Admin, whose tokens name the overlay; a
 * read-only member of its folder is refused before Cube is asked. A token
 * naming it that wechart didn't sign is refused by Cube. Once withdrawn, its
 * review answers from the published model, and a token naming the overlay
 * gets an error, never the published model.
 *
 * `super` makes a folder `writer` (`sales-rw`) writes and `reader`
 * (`sales-ro`) reads, a data source in it and a cube bound to that.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const FOLDER = `Proposed ${RUN}`;
const CUBE = `t440db_${RUN}`;
const SOURCE = `wh440_${RUN}`;
const MODEL = 'e2e-security';
const CUBE_URL = 'http://localhost:54000/cubejs-api';
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
const fieldsOf = (database: string) => ({
  host: 'sample-db',
  port: 5432,
  database,
  user: 'sample',
  ssl: false,
});
const made = { folder: '', source: '', copy: '', project: '', proposal: '' };
// Its own name in every folder (R71, T716).
const dimension = () => `${CUBE}.db`;

/** The review's query of the proposal, as its tiles ask: its status and rows. */
async function review(request: APIRequestContext) {
  const answer = await request.post('/api/load', {
    data: { query: { dimensions: [dimension()] }, for: { kind: 'proposal', id: made.proposal } },
    timeout: 90_000,
  });
  return {
    status: answer.status(),
    rows: answer.ok() ? ((await answer.json()) as { data: unknown[] }).data : [],
  };
}

/** Cube asked straight, with a token naming the proposal's overlay. */
async function straight(token: string) {
  const response = await fetch(
    `${CUBE_URL}/v1/load?query=${encodeURIComponent(JSON.stringify({ dimensions: [dimension()] }))}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  return { status: response.status, text: await response.text() };
}

const base64Url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

test.describe.configure({ mode: 'serial' });

test.describe('a proposal’s overlay (T440, AC-323)', () => {
  test.afterAll(async ({ browser }) => {
    test.setTimeout(180_000);
    for (const who of ['writer', 'super'] as const) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: { cookies: [], origins: [] },
      });
      await signInThroughDex(await context.newPage(), who);
      const { request } = context;
      if (who === 'writer') {
        if (made.proposal !== '')
          await request.post(`/api/proposals/${made.proposal}/reject`, { data: {} });
        if (made.copy !== '') await request.delete(`/api/data-sources/${made.copy}`);
        if (made.project !== '' && made.project !== 'mine')
          await request.delete(`/api/documents/folder/${made.project}`);
      }
      if (who === 'super' && made.folder !== '') {
        await request.delete(
          `/api/model/files?folder=${made.folder}&path=${encodeURIComponent(`cubes/${CUBE}.yml`)}`,
          { timeout: 90_000 },
        );
        if (made.source !== '') await request.delete(`/api/data-sources/${made.source}`);
        await request.delete(`/api/documents/folder/${made.folder}`);
      }
      await context.close();
    }
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes the folder, its data source and a cube bound to it', async ({ page }) => {
      const { request } = page;
      const folder = await request.post('/api/documents', {
        data: { kind: 'folder', title: FOLDER, folderId: 'root' },
      });
      made.folder = ((await folder.json()) as { id: string }).id;
      expect(
        (
          await request.put(`/api/folders/${made.folder}/access`, {
            data: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
          })
        ).status(),
      ).toBe(200);
      const source = await request.post('/api/data-sources', {
        data: await testedSource(request, {
          folderId: made.folder,
          name: SOURCE,
          driver: 'postgres',
          authMethod: 'password',
          fields: fieldsOf('sample'),
          sealed: {
            password: await sealSecretV1(KEY, 'postgres', 'password', fieldsOf('sample'), 'sample'),
          },
        }),
        timeout: 90_000,
      });
      expect(source.status(), await source.text()).toBe(201);
      made.source = ((await source.json()) as { id: string }).id;
      // Through My workspace and a proposal `super` approves (T451, AC-278).
      const file = {
        path: `cubes/${CUBE}.yml`,
        content: `cubes:\n  - name: ${CUBE}\n    sql: SELECT current_database()::text AS db, 1 AS n\n    data_source: ${SOURCE}\n    dimensions:\n      - name: db\n        sql: db\n        type: string\n    measures:\n      - name: n\n        sql: n\n        type: sum\n`,
      };
      expect(await landed(request, made.folder, [file])).toEqual([file]);
    });
  });

  test.describe('as writer', () => {
    test.use({ role: 'writer' });

    test('proposes a copy of the data source pointed at another database, whose review answers from it', async ({
      page,
    }) => {
      const { request } = page;
      const copied = await request.post(`/api/data-sources/${made.source}/copy`, {
        data: { timeZone: 'UTC' },
      });
      expect(copied.status(), await copied.text()).toBeLessThan(300);
      const { id, folderId } = (await copied.json()) as { id: string; folderId: string };
      made.copy = id;
      made.project = folderId;
      const tried = await request.post(`/api/data-sources/${id}/test`, {
        data: { fields: fieldsOf('postgres') },
        timeout: 90_000,
      });
      expect(tried.status(), await tried.text()).toBe(200);
      const { ok, testId } = (await tried.json()) as { ok: boolean; testId: string };
      expect(ok).toBe(true);
      const changed = await request.put(`/api/data-sources/${id}`, {
        data: { fields: fieldsOf('postgres'), testId },
      });
      expect(changed.status(), await changed.text()).toBe(200);
      const proposed = await request.post('/api/proposals', {
        data: { kind: 'data-source', id, description: `T440 ${RUN}` },
      });
      expect(proposed.status(), await proposed.text()).toBe(201);
      made.proposal = ((await proposed.json()) as { id: string }).id;

      // Its author's review: from the proposal's overlay.
      expect(await review(request)).toEqual({
        status: 200,
        rows: [{ [dimension()]: 'postgres' }],
      });
    });
  });

  test.describe('as super, a reviewer', () => {
    test.use({ role: 'super' });

    test('reviews it from its overlay too', async ({ page }) => {
      expect(await review(page.request)).toEqual({
        status: 200,
        rows: [{ [dimension()]: 'postgres' }],
      });
    });
  });

  test.describe('as reader, a read-only member of its folder', () => {
    test.use({ role: 'reader' });

    test('is refused, and Cube refuses a token naming the overlay that wechart didn’t sign', async ({
      page,
    }) => {
      expect((await review(page.request)).status).toBe(404);

      // Signed with Cube's own secret, as no one but wechart could RS256:
      // once the model has keys, Cube takes no other (AC-326).
      const at = Math.floor(Date.now() / 1000);
      const unsigned = `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url({
        groups: ['sales-ro'],
        wechartModel: MODEL,
        wechartOverlay: `p-${made.proposal}`,
        iat: at,
        exp: at + 300,
      })}`;
      const forged = `${unsigned}.${createHmac('sha256', 'dev-secret').update(unsigned).digest('base64url')}`;
      const answer = await straight(forged);
      expect([401, 403], answer.text).toContain(answer.status);
    });
  });

  test.describe('as writer, its author', () => {
    test.use({ role: 'writer' });

    test('withdrawn, it is dropped: its review answers from the published model, and a token naming it gets an error', async ({
      page,
    }) => {
      const { request } = page;
      const withdrawn = await request.post(`/api/proposals/${made.proposal}/reject`, { data: {} });
      expect(withdrawn.status(), await withdrawn.text()).toBe(200);

      await expect
        .poll(async () => review(request), { timeout: 30_000 })
        .toEqual({ status: 200, rows: [{ [dimension()]: 'sample' }] });

      // A token wechart signed for it, as it would have while it was open:
      // xcube has dropped it, so an error, never the published model.
      const signer = await querySigner({
        privateKeyPem: readFileSync(
          new URL('../../infra/xcube/dev-signing-key.pem', import.meta.url),
          'utf8',
        ),
        issuer: 'wechart',
      });
      const token = await signer.sign(
        { groups: ['sales-rw'], wechartModel: MODEL, wechartOverlay: `p-${made.proposal}` },
        300,
      );
      await expect.poll(async () => (await straight(token)).status, { timeout: 30_000 }).toBe(410);
      made.proposal = '';
    });
  });
});
