import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { CUBE, serviceToken, startApi, stopApi, type ApiProcess } from './api-process';
import { DEV_SIGNING_KID, kidOf, queryToken, queryTokenWith } from './tokens';

/**
 * T437 (AC-326): a rotation of the query keys, against compose's xcube. An
 * API given a next key (`WECHART_SIGNING_NEXT_KEY_FILE`) pushes the current
 * and the next key together, and signs with the next once that push is
 * answered. xcube then takes a token signed with either key, so a token
 * signed with the current key is not refused during the rotation, nor one
 * signed with the new key after it.
 * `Fails when: … a token signed with a new key is refused after a rotation,
 * or one signed with the current key is refused during it …`
 *
 * The current key is the development signing key (`e2e/tokens.ts`); the next
 * is made for this run, and its file is the run's own. The API runs on a
 * database and a model of its own, so the suite's `e2e` model's keys are
 * never changed. Dropping the current key once its tokens have expired (an
 * hour and a minute on) is `xcube/keys.test.ts`'s, on its own clock.
 */

/** SQL in the metadata Postgres, as its admin, on stdin. */
const psql = (database: string, sql: string) =>
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'wechart-meta',
      'psql',
      '-U',
      'wechart',
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
      '-f',
      '-',
    ],
    { encoding: 'utf8', input: sql, stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim();

const newKey = () =>
  generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  }) as string;

/**
 * Cube's `/v1/load` asked straight, with this token: its status and body,
 * asked again while Cube is still working on it ("Continue wait") or its
 * instance catches up (503), as wechart asks it.
 */
async function load(
  token: string,
  query: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  for (let ask = 0; ; ask += 1) {
    const response = await fetch(`${CUBE}/v1/load`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const again =
      response.status === 503 || (response.status === 200 && body['error'] === 'Continue wait');
    if (!again || ask >= 30) return { status: response.status, body };
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

const QUERY = { measures: ['orders.count'] };

test.describe.serial('rotating the query keys (T437, AC-326)', () => {
  test.setTimeout(300_000);
  let database = '';
  let model = '';
  let api: ApiProcess | undefined;
  let next = '';
  const logged: string[] = [];

  test.beforeAll(async () => {
    const testInfo = test.info();
    testInfo.setTimeout(300_000);
    database = `wechart_key_rotation_${testInfo.project.name}`;
    model = `e2e-key-rotation-${testInfo.project.name}`;
    // A new database each run: migrated and seeded by the API's first start.
    psql('wechart_meta', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    psql('wechart_meta', `CREATE DATABASE ${database}`);
    next = newKey();
    const file = testInfo.outputPath('next-signing-key.pem');
    writeFileSync(file, next, { mode: 0o600 });
    api = await startApi(4540 + testInfo.parallelIndex, {
      database,
      model,
      settings: { WECHART_SIGNING_NEXT_KEY_FILE: file },
      onLog: (line) => logged.push(line),
    });
  });

  test.afterAll(async () => {
    await stopApi(api?.process);
    if (database !== '') psql('wechart_meta', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  });

  test('pushes the current and the next key together, then signs with the next', async () => {
    const held = await fetch(`${CUBE}/v1/semantic/models/${model}/keys`, {
      headers: { authorization: `Bearer ${serviceToken()}` },
    });
    expect(held.status).toBe(200);
    const set = (await held.json()) as { issuer: string; keys: { kid: string }[] };
    expect(set.issuer).toBe('wechart');
    expect(set.keys.map((key) => key.kid).sort()).toEqual([DEV_SIGNING_KID, kidOf(next)].sort());

    // It says which key it signs with once the push is answered: the next.
    const pushed = logged
      .flatMap((line): { msg?: string; kid?: string }[] => {
        try {
          return [JSON.parse(line) as { msg?: string; kid?: string }];
        } catch {
          return [];
        }
      })
      .find((line) => line.msg === 'query keys pushed to xcube');
    expect(pushed?.kid).toBe(kidOf(next));

    // And its own queries, signed so, are answered.
    await expect
      .poll(
        async () => {
          const answer = await fetch(`${api!.url}/api/load`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query: QUERY }),
          });
          const body = (await answer.json().catch(() => ({}))) as { data?: unknown[] };
          return answer.status === 200 && Array.isArray(body.data) && body.data.length === 1;
        },
        { timeout: 120_000, intervals: [2000] },
      )
      .toBe(true);
  });

  test('takes a token signed with the current key during the rotation, and one with the next', async () => {
    const claims = { wechartModel: model };
    const current = await load(queryToken(claims), QUERY);
    expect(current.status, JSON.stringify(current.body)).toBe(200);
    expect(current.body['data']).toHaveLength(1);
    const rotated = await load(queryTokenWith(next, claims), QUERY);
    expect(rotated.status, JSON.stringify(rotated.body)).toBe(200);
    expect(rotated.body['data']).toEqual(current.body['data']);

    // A key the model doesn't hold is refused: the check is xcube's, not lenient.
    const stranger = await load(queryTokenWith(newKey(), claims), QUERY);
    expect(stranger.status).toBe(403);
  });

  /**
   * The drop, an hour and a minute on, pushes exactly the next key one
   * version up (`xcube/keys.test.ts`, on its own clock). Pushed so here, as
   * the API pushes it: the next key's tokens, and the API's own queries, are
   * still taken after the rotation, and the current key's are refused.
   */
  test('after the current key is dropped, takes the next key’s tokens and refuses the current’s', async () => {
    const held = await fetch(`${CUBE}/v1/semantic/models/${model}/keys`, {
      headers: { authorization: `Bearer ${serviceToken()}` },
    });
    const { version, keys } = (await held.json()) as {
      version: number;
      keys: { kid: string; kty: string; n: string; e: string }[];
    };
    const kept = keys.filter((key) => key.kid === kidOf(next));
    expect(kept).toHaveLength(1);
    const dropped = await fetch(`${CUBE}/v1/semantic/models/${model}/keys`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${serviceToken()}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        version: version + 1,
        issuer: 'wechart',
        keys: kept.map(({ kty, kid, n, e }) => ({ kty, kid, n, e, alg: 'RS256', use: 'sig' })),
      }),
    });
    expect(dropped.status, await dropped.text()).toBe(200);

    const claims = { wechartModel: model };
    const rotated = await load(queryTokenWith(next, claims), QUERY);
    expect(rotated.status, JSON.stringify(rotated.body)).toBe(200);
    expect(rotated.body['data']).toHaveLength(1);
    const current = await load(queryToken(claims), QUERY);
    expect(current.status).toBe(403);

    const answer = await fetch(`${api!.url}/api/load`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: QUERY }),
    });
    expect(answer.status).toBe(200);
    expect(((await answer.json()) as { data?: unknown[] }).data).toHaveLength(1);
  });
});
