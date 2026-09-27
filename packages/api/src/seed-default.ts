import { readFileSync } from 'node:fs';

import { DRIVER_TYPES, DRIVERS, sealSecretV1, type DriverType } from '@wechart/core';

import { xcubePublicKeyOf } from './secrets/xcube-key';

/**
 * The install Job's seeding of the shared root's `default` data source (T443,
 * AC-310): `node dist/main.js seed-default`, in wechart's API image. It seals
 * the deployment's database password with xcube's public key, as the browser
 * seals a typed secret (T441), and sends wechart's API only the envelope,
 * with the Job's token, so wechart never receives the password. It waits for
 * the API to be up; once the root has a `default`, there is nothing to do.
 *
 * Settings, from the chart:
 * - `WECHART_API_URL`, `WECHART_SEED_TOKEN` (or `_FILE`), `WECHART_XCUBE_PUBLIC_KEY`;
 * - `WECHART_DEFAULT_DB_TYPE`, one of xcube's drivers, and
 *   `WECHART_DEFAULT_DB_PASSWORD` (or `_PASSWORD_FILE`, a mounted Secret);
 * - each field of that driver's connection and password sign-in (core's
 *   DRIVERS), as `WECHART_DEFAULT_DB_<FIELD>`: `_HOST`, `_PORT`, `_DATABASE`,
 *   `_USER`, `_SSL`, `_SSL_REJECT_UNAUTHORIZED`, `_SSL_CA`, `_ACCOUNT`, … .
 */
export interface Seeding {
  readonly fetch?: typeof globalThis.fetch;
  /** Between tries while the API isn't up. */
  readonly wait?: (ms: number) => Promise<void>;
  readonly log?: (line: string) => void;
}

const TRIES = 60;
const BETWEEN_MS = 5_000;

/** A driver field's setting name: `sslRejectUnauthorized` is `SSL_REJECT_UNAUTHORIZED`. */
const envNameOf = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

/** A setting, or the file its `_FILE` twin names, trimmed. */
function setting(env: NodeJS.ProcessEnv, name: string): string {
  const file = env[`${name}_FILE`] ?? '';
  if (file !== '') return readFileSync(file, 'utf8').trim();
  return (env[name] ?? '').trim();
}

/** 0 when the root has its `default`, 1 when it couldn't be seeded (said in the log). */
export async function seedDefault(env: NodeJS.ProcessEnv, seeding: Seeding = {}): Promise<number> {
  const send = seeding.fetch ?? globalThis.fetch;
  const wait =
    seeding.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const log = seeding.log ?? ((line: string) => console.log(line));

  let body: string;
  let url: string;
  let token: string;
  try {
    // Each driver's own required fields are the API's to name, in its log.
    const missing = [
      'WECHART_API_URL',
      'WECHART_SEED_TOKEN',
      'WECHART_DEFAULT_DB_TYPE',
      'WECHART_DEFAULT_DB_PASSWORD',
    ].filter((name) => setting(env, name) === '');
    if (missing.length > 0) {
      log(`seed-default: not set: ${missing.join(', ')}`);
      return 1;
    }
    const driver = setting(env, 'WECHART_DEFAULT_DB_TYPE');
    if (!(DRIVER_TYPES as readonly string[]).includes(driver)) {
      log(
        `seed-default: WECHART_DEFAULT_DB_TYPE ${JSON.stringify(driver)} is no driver xcube takes`,
      );
      return 1;
    }
    // The driver's own sign-in whose one secret is the password (T443's
    // review): its fields and its connection's, never another driver's.
    const spec = DRIVERS[driver as DriverType];
    const method = spec.auth.find((each) => {
      const secrets = each.fields.filter((field) => field.secret === true);
      return secrets.length === 1 && secrets[0]?.key === 'password';
    });
    if (method === undefined) {
      log(
        `seed-default: ${driver} has no sign-in by password; add the root's default in Data sources`,
      );
      return 1;
    }
    const fields: Record<string, string | number | boolean> = {};
    for (const field of [...spec.connection, ...method.fields]) {
      if (field.secret === true) continue;
      const value = setting(env, `WECHART_DEFAULT_DB_${envNameOf(field.key)}`);
      if (value === '') continue;
      fields[field.key] =
        field.kind === 'number'
          ? Number(value)
          : field.kind === 'boolean'
            ? value === 'true'
            : value;
    }
    const sealed = await sealSecretV1(
      xcubePublicKeyOf(env),
      driver as DriverType,
      'password',
      fields,
      setting(env, 'WECHART_DEFAULT_DB_PASSWORD'),
    );
    body = JSON.stringify({ driver, authMethod: method.id, fields, sealed: { password: sealed } });
    url = `${setting(env, 'WECHART_API_URL').replace(/\/$/, '')}/api/data-sources/root-default`;
    token = setting(env, 'WECHART_SEED_TOKEN');
  } catch (error) {
    log(`seed-default: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  for (let tried = 1; tried <= TRIES; tried += 1) {
    let status: number | undefined;
    try {
      status = (
        await send(url, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body,
        })
      ).status;
    } catch {
      status = undefined;
    }
    if (status === 204) {
      log('seed-default: the shared root’s default data source is made');
      return 0;
    }
    if (status === 409) {
      log('seed-default: the shared root already has its default data source');
      return 0;
    }
    if (status !== undefined && status < 500) {
      log(`seed-default: the API refused it (${String(status)}); its log says why`);
      return 1;
    }
    log(
      `seed-default: the API isn't up yet (${status === undefined ? 'no answer' : String(status)}); try ${String(tried)} of ${String(TRIES)}`,
    );
    if (tried < TRIES) await wait(BETWEEN_MS);
  }
  log('seed-default: the API never answered');
  return 1;
}
