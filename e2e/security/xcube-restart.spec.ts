import { readFileSync } from 'node:fs';

import type { APIRequestContext } from '@playwright/test';
import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { CUBE, serviceToken, startApi, stopApi, type ApiProcess } from '../api-process';
import { landed } from '../model-files';
import { queryToken } from '../tokens';
import { BASE_URL, expect, signInThroughDex, test, testedSource } from './fixtures';

/**
 * T765 (AC-330): WHEN wechart's API starts, THE SYSTEM SHALL bring xcube's
 * copy up to what wechart has published (folders, their allowed groups,
 * model items and data sources), sending a full snapshot when xcube's copy is
 * missing or behind. Cube SHALL then answer queries on published items with
 * every API replica stopped. `Fails when: after xcube's copy is emptied and
 * the API restarts, a published item can't be queried; or a query on a
 * published item fails while every API replica is stopped.`
 *
 * xcube has no route to empty a model, and the shared schema's rows are no
 * test's to delete. So a second API process starts on this suite's database
 * under a model id of its own, `e2e-security-restart`, one fixed id (the
 * coordinator's call, 2026-10-07): on its first run xcube holds nothing of
 * it (missing), on every later run only what an earlier run published
 * (behind). What `super` publishes in a folder of its own, granted to
 * `sales-ro`, with a data source of the folder's own, must then answer from
 * that data source under the new model, to that group and to no other; and
 * go on answering once that API process is stopped.
 */
const RESTART_MODEL = 'e2e-security-restart';
const PORT = 4390;
const RUN = `r${Math.random().toString(36).slice(2, 7)}`;
const FOLDER = `Restart ${RUN}`;
const SOURCE = `${RUN}_restart_src`;
const CUBE_NAME = `${RUN}_restart`;
const PATH = `cubes/${CUBE_NAME}.yml`;
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
/** The sample server's `template1`, so an answer from Cube's own default (`sample`) can't pass. */
const FIELDS = { host: 'sample-db', port: 5432, database: 'template1', user: 'sample', ssl: false };
const CONTENT = [
  'cubes:',
  `  - name: ${CUBE_NAME}`,
  '    sql: SELECT current_database()::text AS db, 1 AS n',
  `    data_source: ${SOURCE}`,
  '    measures:',
  '      - name: count',
  '        type: count',
  '    dimensions:',
  '      - name: db',
  '        sql: db',
  '        type: string',
  '',
].join('\n');
/** The security suite's own API's settings (playwright.security.config.ts), development values. */
const SECURED = {
  CUBE_WORKER_URL: 'http://localhost:54001',
  WECHART_SECURITY: 'oidc',
  WECHART_PUBLIC_URL: 'http://localhost:5373',
  WECHART_SESSION_SECRET: 'the-security-suite-session-secret-0123456789',
  WECHART_OIDC_ISSUER: 'http://localhost:5556/dex',
  WECHART_OIDC_CLIENT_ID: 'wechart',
  WECHART_OIDC_CLIENT_SECRET: 'dev-oidc-secret',
  WECHART_OIDC_SCOPES: 'openid profile email groups',
  WECHART_OIDC_ALLOW_HTTP: 'true',
  WECHART_SUPER_ADMIN_GROUP: 'wechart-super-admins',
};
const made = { folder: '', source: '', landed: false };
let restarted: ApiProcess | undefined;

/** Cube's answer under the restarted model, to a token of `groups`. */
async function asked(request: APIRequestContext, groups: string[]) {
  const query = encodeURIComponent(
    JSON.stringify({ measures: [`${CUBE_NAME}.count`], dimensions: [`${CUBE_NAME}.db`] }),
  );
  const answer = await request.get(`${CUBE}/v1/load?query=${query}`, {
    headers: { authorization: `Bearer ${queryToken({ wechartModel: RESTART_MODEL, groups })}` },
  });
  const body = (await answer.json().catch(() => ({}))) as {
    data?: Record<string, string>[];
    error?: string;
  };
  return { status: answer.status(), db: body.data?.[0]?.[`${CUBE_NAME}.db`], error: body.error };
}
/** Asked again while Cube says "Continue wait", or the copy hasn't reached it yet. */
const answered = (request: APIRequestContext, groups: string[]) =>
  expect
    .poll(
      async () => {
        const { status, db, error } = await asked(request, groups);
        // What it answered instead, said if it never answers.
        return db ?? `${String(status)} ${error ?? ''}`;
      },
      { timeout: 120_000, intervals: [2_000] },
    )
    .toBe('template1')
    .catch((failure: unknown) => {
      // What the restarted API said of xcube, if Cube never answers.
      throw new Error(`The restarted API logged:\n${apiLog.slice(-20).join('\n')}`, {
        cause: failure,
      });
    });
/** The restarted API's log lines about xcube, kept to explain a failure. */
const apiLog: string[] = [];

test.describe.configure({ mode: 'serial' });

test.describe('xcube brought up to date when an API starts (T765, AC-330)', () => {
  test.afterAll(async ({ browser }) => {
    test.setTimeout(180_000);
    await stopApi(restarted?.process);
    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    await signInThroughDex(await context.newPage(), 'super');
    const { request } = context;
    // The cube first: a data source goes only once nothing is bound to it.
    if (made.landed)
      await request.delete(
        `/api/model/files?folder=${made.folder}&path=${encodeURIComponent(PATH)}`,
        {
          timeout: 90_000,
        },
      );
    if (made.source !== '') await request.delete(`/api/data-sources/${made.source}`);
    if (made.folder !== '') await request.delete(`/api/documents/folder/${made.folder}`);
    await context.close();
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('publishes a folder granted to sales-ro, its data source, and a cube on it', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const { request } = page;
      const folder = await request.post('/api/documents', {
        data: { kind: 'folder', title: FOLDER, folderId: 'root' },
      });
      expect(folder.status(), await folder.text()).toBe(201);
      made.folder = ((await folder.json()) as { id: string }).id;
      expect(
        (
          await request.put(`/api/folders/${made.folder}/access`, {
            data: { readOnly: ['sales-ro'], readWrite: null },
          })
        ).status(),
      ).toBe(200);
      const source = await request.post('/api/data-sources', {
        data: await testedSource(request, {
          folderId: made.folder,
          name: SOURCE,
          driver: 'postgres',
          authMethod: 'password',
          fields: FIELDS,
          sealed: { password: await sealSecretV1(KEY, 'postgres', 'password', FIELDS, 'sample') },
        }),
        timeout: 90_000,
      });
      expect(source.status(), await source.text()).toBe(201);
      made.source = ((await source.json()) as { id: string }).id;
      made.landed = true;
      expect(await landed(request, made.folder, [{ path: PATH, content: CONTENT }])).toEqual([
        { path: PATH, content: CONTENT },
      ]);
    });
  });

  test('an API started on a model xcube lacks or holds behind brings it up to date, and Cube answers with that API stopped', async ({
    request,
  }) => {
    test.setTimeout(300_000);
    restarted = await startApi(PORT, {
      database: 'wechart_security',
      model: RESTART_MODEL,
      settings: SECURED,
      onLog: (line) => {
        if (/xcube|snapshot|revision|refus|error|warn/i.test(line)) apiLog.push(line.slice(0, 600));
      },
    });
    // Its folder, the folder's group, its data source and its cube: answered
    // from the folder's own data source, to its group alone.
    await answered(request, ['sales-ro']);
    const refused = await asked(request, ['managers']);
    expect(refused.status, JSON.stringify(refused)).toBe(403);
    // Its whole tree wechart's, as the suite's own API pushes it to its model
    // from the same database: no folder an earlier run deleted is left in it,
    // as it would be on every run after the first had this start not caught
    // xcube up (T765; research xcube-c2602ac72a.md).
    const heldIds = async (model: string) => {
      const answer = await request.get(`${CUBE}/v1/semantic/models/${model}/folders`, {
        headers: { authorization: `Bearer ${serviceToken()}` },
      });
      expect(answer.status(), await answer.text()).toBe(200);
      return ((await answer.json()) as { folders: { id: string }[] }).folders
        .map((folder) => folder.id)
        .sort();
    };
    await expect
      .poll(async () => heldIds(RESTART_MODEL), { timeout: 90_000, intervals: [2_000] })
      .toEqual(await heldIds('e2e-security'));

    // Every API replica of the model stopped: Cube answers still.
    await stopApi(restarted.process);
    restarted = undefined;
    expect(
      (await fetch(`http://localhost:${String(PORT)}/api/health`).catch(() => undefined))?.status,
    ).toBeUndefined();
    await answered(request, ['sales-ro']);
  });
});
