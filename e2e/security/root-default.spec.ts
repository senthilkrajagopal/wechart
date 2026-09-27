import { readFileSync } from 'node:fs';

import { API_PORT, SEED_TOKEN } from '../../playwright.security.config';
import { seedDefault } from '../../packages/api/src/seed-default';
import { CUBE, serviceToken } from '../api-process';
import { expect, test } from './fixtures';

/**
 * T443 (AC-310): the shared root's `default` data source, seeded at install
 * by a Job that seals the database password itself and sends wechart only the
 * envelope (`seed-default.ts`, run here as the Job runs it, against this
 * suite's API with its token). It lands in xcube as the connection `default`
 * and answers xcube's connection test; the seeded root cubes, which name no
 * data source, are bound to it. A second seeding changes nothing.
 *
 * Its settings are compose's sample database, as the Helm chart's are the
 * deployment's (its development login).
 */
const env = {
  WECHART_API_URL: `http://localhost:${String(API_PORT)}`,
  WECHART_SEED_TOKEN: SEED_TOKEN,
  WECHART_XCUBE_PUBLIC_KEY: readFileSync(
    new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url),
    'utf8',
  ),
  WECHART_DEFAULT_DB_TYPE: 'postgres',
  WECHART_DEFAULT_DB_HOST: 'sample-db',
  WECHART_DEFAULT_DB_PORT: '5432',
  WECHART_DEFAULT_DB_DATABASE: 'sample',
  WECHART_DEFAULT_DB_USER: 'sample',
  WECHART_DEFAULT_DB_SSL: 'false',
  WECHART_DEFAULT_DB_PASSWORD: 'sample',
};
type Listed = {
  id: string;
  name: string;
  folderId: string;
  driver: string;
  usedBy: { name: string }[] | null;
};

test.describe('the root’s default data source, seeded at install (T443, AC-310)', () => {
  test.use({ role: 'super' });

  test('is made from the Job’s envelope, lands in xcube, connects, and binds the root’s cubes', async ({
    page,
  }) => {
    const said: string[] = [];
    // Seeded now, or by an earlier run: the root keeps it while its cubes use it.
    expect(await seedDefault(env, { log: (line) => said.push(line) }), said.join('\n')).toBe(0);
    // Again: nothing to do.
    expect(await seedDefault(env, { log: (line) => said.push(line) })).toBe(0);
    expect(said.at(-1)).toBe('seed-default: the shared root already has its default data source');

    const request = page.request;
    const listed = (await (await request.get('/api/data-sources')).json()) as Listed[];
    const seeded = listed.filter((row) => row.folderId === 'root' && row.name === 'default');
    expect(seeded).toHaveLength(1);
    const [root] = seeded;
    expect(root?.driver).toBe('postgres');

    // Its settings, with its password said as stored and never given back.
    const opened = await request.get(`/api/data-sources/${root!.id}`);
    expect(opened.status()).toBe(200);
    expect(await opened.json()).toMatchObject({
      fields: { host: 'sample-db', port: 5432, database: 'sample', user: 'sample', ssl: false },
      secrets: { password: { stored: true } },
    });
    // The password is no setting given back: only said to be stored.
    expect(((await opened.json()) as { fields: object }).fields).not.toHaveProperty('password');

    // xcube opens its envelope and connects with Cube's driver.
    const tested = await request.post(`/api/data-sources/${root!.id}/test`, {
      data: {},
      timeout: 90_000,
    });
    expect(tested.status(), await tested.text()).toBe(200);
    expect(((await tested.json()) as { ok: boolean }).ok).toBe(true);

    // xcube holds it as the connection `default`, in this suite's model: the
    // root cubes' default, where Cube's own environment served before (T443's review).
    const held = await request.get(`${CUBE}/v1/semantic/models/e2e-security/connections`, {
      headers: { authorization: `Bearer ${serviceToken()}` },
    });
    expect(held.status()).toBe(200);
    const connections = ((await held.json()) as { connections: { name: string; driver: string }[] })
      .connections;
    expect(connections).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'default', driver: 'postgres' })]),
    );

    // The seeded root cubes name no data source: bound to it (AC-310).
    const cubes = root!.usedBy?.map((cube) => cube.name) ?? [];
    expect(cubes).toEqual(expect.arrayContaining(['orders']));
  });
});
