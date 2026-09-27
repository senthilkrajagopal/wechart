import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { seedDefault } from './seed-default';

/**
 * T443 (AC-310): the install Job seeds the shared root's `default` data
 * source. It seals the database password itself, with xcube's public key and
 * core's sealer, as the browser seals a typed one (T441). It sends wechart
 * only the envelope, with its token, and waits for the API to be up. So no
 * request to wechart carries the password.
 */
const KEY = readFileSync(
  new URL('../../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url),
  'utf8',
);
const PASSWORD = 'a-database-password-never-sent';
const env = {
  WECHART_API_URL: 'http://wechart-api:4100',
  WECHART_SEED_TOKEN: 't'.repeat(40),
  WECHART_XCUBE_PUBLIC_KEY: KEY,
  WECHART_DEFAULT_DB_TYPE: 'postgres',
  WECHART_DEFAULT_DB_HOST: 'warehouse.example',
  WECHART_DEFAULT_DB_PORT: '5432',
  WECHART_DEFAULT_DB_DATABASE: 'sales',
  WECHART_DEFAULT_DB_USER: 'cube',
  WECHART_DEFAULT_DB_SSL: 'true',
  WECHART_DEFAULT_DB_PASSWORD: PASSWORD,
};
type Sent = { url: string; init: RequestInit };
const answering = (...answers: (number | Error)[]) => {
  const sent: Sent[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), init: init ?? {} });
    const next = answers.shift() ?? 500;
    if (next instanceof Error) throw next;
    return new Response(null, { status: next });
  };
  return { sent, fetch: fetch as typeof globalThis.fetch };
};
const quietly = { log: () => undefined, wait: async () => undefined };

describe('the install Job’s seeding of the root’s default (T443, AC-310)', () => {
  it('seals the password and sends only its envelope, with its token', async () => {
    const { sent, fetch } = answering(204);

    expect(await seedDefault(env, { ...quietly, fetch })).toBe(0);

    expect(sent).toHaveLength(1);
    const [only] = sent;
    expect(only?.url).toBe('http://wechart-api:4100/api/data-sources/root-default');
    expect(only?.init.method).toBe('POST');
    expect(new Headers(only?.init.headers).get('authorization')).toBe(`Bearer ${'t'.repeat(40)}`);
    const body = JSON.parse(String(only?.init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'warehouse.example', port: 5432, database: 'sales', user: 'cube', ssl: true },
    });
    expect(body['sealed']).toMatchObject({ password: { v: 1, kid: JSON.parse(KEY).kid } });
    expect(String(only?.init.body)).not.toContain(PASSWORD);
  });

  /**
   * T443's review: every driver's own fields, from its sign-in whose one
   * secret is the password (core's DRIVERS), each typed as the driver says —
   * never PostgreSQL's fields sent to another driver.
   */
  it('sends each driver its own fields and password sign-in, and refuses one with none', async () => {
    const sentAs = async (extra: Record<string, string>) => {
      const { sent, fetch } = answering(204);
      const code = await seedDefault({ ...env, ...extra }, { ...quietly, fetch });
      return { code, body: sent[0] && JSON.parse(String(sent[0].init.body)) };
    };

    const mssql = await sentAs({
      WECHART_DEFAULT_DB_TYPE: 'mssql',
      WECHART_DEFAULT_DB_PORT: '1433',
    });
    expect(mssql.code).toBe(0);
    expect(mssql.body).toMatchObject({ driver: 'mssql', authMethod: 'sql-login' });
    expect(mssql.body.fields).toMatchObject({
      host: 'warehouse.example',
      port: 1433,
      user: 'cube',
    });

    const snowflake = await sentAs({
      WECHART_DEFAULT_DB_TYPE: 'snowflake',
      WECHART_DEFAULT_DB_ACCOUNT: 'acme-eu',
      WECHART_DEFAULT_DB_WAREHOUSE: 'compute_wh',
      WECHART_DEFAULT_DB_USERNAME: 'cube',
    });
    expect(snowflake.body).toMatchObject({ driver: 'snowflake', authMethod: 'password' });
    expect(snowflake.body.fields).toEqual({
      account: 'acme-eu',
      warehouse: 'compute_wh',
      database: 'sales',
      username: 'cube',
    });

    const said: string[] = [];
    const bigquery = await seedDefault(
      { ...env, WECHART_DEFAULT_DB_TYPE: 'bigquery' },
      { ...quietly, log: (line) => said.push(line), ...answering(204) },
    );
    expect(bigquery).toBe(1);
    expect(said.join('\n')).toMatch(/bigquery.*no sign-in by password/i);
  });

  it('waits for the API to be up, then sends', async () => {
    const { sent, fetch } = answering(new TypeError('fetch failed'), 503, 204);

    expect(await seedDefault(env, { ...quietly, fetch })).toBe(0);
    expect(sent).toHaveLength(3);
  });

  it('is done when the root already has its default', async () => {
    expect(await seedDefault(env, { ...quietly, ...answering(409) })).toBe(0);
  });

  it('fails, saying so, when its token or the data source is refused, or a setting is missing', async () => {
    const said: string[] = [];
    const log = (line: string) => said.push(line);
    expect(await seedDefault(env, { ...quietly, log, ...answering(401) })).toBe(1);
    expect(await seedDefault(env, { ...quietly, log, ...answering(400) })).toBe(1);
    const without = Object.fromEntries(
      Object.entries(env).filter(([name]) => name !== 'WECHART_DEFAULT_DB_PASSWORD'),
    );
    expect(await seedDefault(without, { ...quietly, log, ...answering(204) })).toBe(1);
    expect(said.join('\n')).toMatch(/401/);
    expect(said.join('\n')).toMatch(/WECHART_DEFAULT_DB_PASSWORD/);
    expect(said.join('\n')).not.toContain(PASSWORD);
  });
});
