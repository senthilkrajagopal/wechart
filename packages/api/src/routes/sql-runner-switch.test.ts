import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pgSessionStore } from '../auth/session-store';
import { PUBLIC_URL, signIn, USERS } from '../auth/sign-in.fixture';
import { closeDb, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { catalog } from '../repos/catalog';
import { connectionTestStore } from '../repos/connection-tests';
import { dataSourceStore } from '../repos/data-sources';
import { documents } from '../repos/documents';
import { folderAccessStore } from '../repos/folder-access';
import { proposalStore } from '../repos/proposals';
import { sqlRunnerSwitches } from '../repos/sql-runner-switches';
import { versionStore } from '../repos/versions';
import { buildServer } from '../server';
import { removeProjectFolders, TEST_TIME_ZONE } from './project-folder.fixture';
import { signsInOtherwise } from './sql-runner-switch';

/**
 * T531 (AC-374, AC-373; R50, R51): the SQL runner's switch on a data source.
 * Every data source starts off. A Super-Admin turns it on only by confirming
 * its login can only read, which is kept with who and when; turning it on or
 * off is an audit event (design 15's P4). Nobody else switches it. A change
 * of how it signs in turns it off until confirmed again (Q4).
 *
 * `writer` (`sales-rw`) writes /Sales; `super` is a Super-Admin.
 */
const secured = {
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  port: 4100,
  modelDir: '',
  security: 'oidc' as const,
  publicUrl: PUBLIC_URL,
  sessionSecret: 'a-test-session-secret-at-least-32-characters',
  superAdminGroup: 'wechart-super-admins',
  oidc: {
    issuer: 'http://localhost:5556/dex',
    clientId: 'wechart',
    clientSecret: 'dev-oidc-secret',
    groupsClaim: 'groups',
    scopes: 'openid profile email groups',
    allowHttp: true,
  },
};

const MARK = `srs${randomUUID().slice(0, 8)}`;
const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}-${MARK}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}-${MARK}`).toString('base64url'),
});
const docs = () => documents(getDb());
const sources = () => dataSourceStore(getDb());
const switches = () => sqlRunnerSwitches(getDb());
const audit = () => auditStore(getDb());
const cookies: Record<string, string> = {};
const ids = { sales: '', source: '' };
let app: FastifyInstance;

beforeAll(async () => {
  ids.sales = randomUUID();
  await docs().create({
    kind: 'folder',
    id: ids.sales,
    body: {
      title: `Sales ${MARK}`,
      folderId: 'root',
      owner: 'admin',
      access: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
    },
  });
  ids.source = (
    await sources().create({
      folderId: ids.sales,
      name: `warehouse_${MARK}`,
      driver: 'postgres',
      authMethod: 'password',
      fields: { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false },
      sealed: { password: sealed('sales') },
    })
  ).id;
  app = buildServer({
    config: secured,
    sessions: pgSessionStore(getDb()),
    documents: docs(),
    catalog: catalog(getDb()),
    folderAccess: folderAccessStore(getDb()),
    dataSources: sources(),
    audit: audit(),
    sqlRunnerSwitches: switches(),
    connectionTests: connectionTestStore(getDb()),
    proposals: proposalStore(getDb()),
    versions: versionStore(getDb()),
  });
  for (const who of ['writer', 'super']) cookies[who] = await signIn(app, USERS[who]!);
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  const db = getDb();
  await db.deleteFrom('proposals').where('target_folder_id', '=', ids.sales).execute();
  await db.deleteFrom('item_versions').where('folder_id', '=', ids.sales).execute();
  for (const copy of copies) await sources().remove(copy);
  await removeProjectFolders();
  if (ids.source !== '') {
    await switches().off(ids.source);
    await sources().remove(ids.source);
  }
  await docs()
    .remove('folder', ids.sales)
    .catch(() => undefined);
  await closeDb();
});

const as = (who: string, options: InjectOptions) =>
  app.inject({ ...options, headers: { ...options.headers, cookie: cookies[who]! } });
const turn = (who: string, payload: Record<string, unknown>) =>
  as(who, { method: 'PUT', url: `/api/data-sources/${ids.source}/sql-runner`, payload });
const runnerOf = async (who: string) =>
  (await as(who, { method: 'GET', url: `/api/data-sources/${ids.source}` })).json<{
    sqlRunner: unknown;
  }>().sqlRunner;
const recorded = async () =>
  (await audit().list({ events: ['data-source-change'], folderIds: [ids.sales], limit: 200 }))
    .records;

describe('the SQL runner’s switch on a data source (T531, AC-374)', () => {
  it('starts off', async () => {
    expect(await runnerOf('super')).toEqual({ on: false });
    expect(await runnerOf('writer')).toEqual({ on: false });
  });

  it('is switched by a Super-Admin alone', async () => {
    const answer = await turn('writer', { on: true, readOnlyConfirmed: true });
    expect(answer.statusCode, answer.body).toBe(403);
    expect(await switches().of(ids.source)).toBeUndefined();
  });

  it('goes on only with its login confirmed read-only, keeping who and when, as an audit event', async () => {
    const unconfirmed = await turn('super', { on: true });
    expect(unconfirmed.statusCode, unconfirmed.body).toBe(400);
    expect(unconfirmed.json<{ error: string }>().error).toBe(
      'Confirm that this data source’s login can only read before turning the SQL runner on.',
    );
    expect(await switches().of(ids.source)).toBeUndefined();

    const before = Date.now();
    const on = await turn('super', { on: true, readOnlyConfirmed: true });
    expect(on.statusCode, on.body).toBe(200);
    const said = on.json<{ on: boolean; confirmedBy: { name: string }; confirmedAt: string }>();
    expect(said.on).toBe(true);
    expect(said.confirmedBy).toEqual({ name: (await switches().of(ids.source))!.confirmedBy.name });
    expect(Date.parse(said.confirmedAt)).toBeGreaterThanOrEqual(before - 1000);
    // Shown to whoever sees the data source, by name: never a key.
    expect(await runnerOf('writer')).toEqual(said);

    const events = await recorded();
    expect(events.map((each) => each.summary)).toContain(
      'Turned the SQL runner on, confirming its login can only read',
    );
  });

  it('goes off, as an audit event', async () => {
    const off = await turn('super', { on: false });
    expect(off.statusCode, off.body).toBe(200);
    expect(off.json()).toEqual({ on: false });
    expect(await switches().of(ids.source)).toBeUndefined();
    expect((await recorded()).map((each) => each.summary)).toContain('Turned the SQL runner off');
  });

  it('answers a data source that isn’t there as one', async () => {
    const answer = await as('super', {
      method: 'PUT',
      url: `/api/data-sources/${randomUUID()}/sql-runner`,
      payload: { on: true, readOnlyConfirmed: true },
    });
    expect(answer.statusCode, answer.body).toBe(404);
  });
});

/** The writer's copy of the shared data source, changed in their workspace (T346). */
const copies: string[] = [];
async function copyChanged(change: Parameters<ReturnType<typeof sources>['update']>[1]) {
  const copied = await as('writer', {
    method: 'POST',
    url: `/api/data-sources/${ids.source}/copy`,
    payload: { timeZone: TEST_TIME_ZONE },
  });
  expect(copied.statusCode, copied.body).toBeLessThan(300);
  const copy = copied.json<{ id: string }>().id;
  copies.push(copy);
  await sources().update(copy, change);
  // Tested as a changed one is before it is proposed (T515, AC-158).
  const stored = (await sources().get(copy))!;
  await connectionTestStore(getDb()).record(copy, {
    ok: true,
    checks: [{ id: 'connect', status: 'passed', durationMs: 1 }],
    fields: stored.fields,
    asStored: true,
    settings: stored.settingsPrint,
    by: { key: 'writer', name: 'Wren Writer' },
  });
  return copy;
}
async function proposedAndApproved(copy: string) {
  const proposed = await as('writer', {
    method: 'POST',
    url: '/api/proposals',
    payload: { kind: 'data-source', id: copy },
  });
  expect(proposed.statusCode, proposed.body).toBe(201);
  const approved = await as('super', {
    method: 'POST',
    url: `/api/proposals/${proposed.json<{ id: string }>().id}/approve`,
    payload: {},
  });
  expect(approved.statusCode, approved.body).toBe(200);
  // Its copy goes, as a workspace's items do once landed and done with.
  await sources().remove(copy);
}

describe('an approved change of how it signs in (T531, AC-374, design 15’s Q4)', () => {
  it('turns the runner off, as an audit event, and an approved change that signs in the same leaves it on', async () => {
    await turn('super', { on: true, readOnlyConfirmed: true });
    await proposedAndApproved(await copyChanged({ description: `For ${MARK}` }));
    expect(await switches().of(ids.source)).toBeDefined();

    const fields = (await sources().get(ids.source))!.fields;
    await proposedAndApproved(await copyChanged({ fields: { ...fields, user: 'cube_admin' } }));
    expect(await switches().of(ids.source)).toBeUndefined();
    expect((await recorded()).map((each) => each.summary)).toContain(
      'Turned the SQL runner off: how it signs in changed, so its login is to be confirmed read-only again',
    );
  });
});

describe('a change of how a data source signs in (T531, AC-374, design 15’s Q4)', () => {
  const was = {
    authMethod: 'password',
    fields: { host: 'sales-db', port: 5432, database: 'sales', user: 'cube', ssl: false },
    sealed: { password: sealed('a') },
  };

  it('is its user, its target, its database, its way of signing in, a field of it, or a secret replaced', () => {
    for (const changed of [
      { fields: { ...was.fields, user: 'admin' } },
      { fields: { ...was.fields, host: 'elsewhere' } },
      { fields: { ...was.fields, port: 6543 } },
      // Grants are per database: read-only on one, a login may own another.
      { fields: { ...was.fields, database: 'other' } },
      { authMethod: 'client-certificate' },
      { sealed: { password: sealed('b') } },
    ])
      expect(
        signsInOtherwise('postgres', was, { ...was, ...changed }),
        JSON.stringify(changed),
      ).toBe(true);
  });

  it('is a field only another way of signing in takes, such as a client certificate’s', () => {
    const certified = {
      authMethod: 'client-certificate',
      fields: { ...was.fields, sslCert: 'PEM-A' },
      sealed: { sslKey: sealed('k') },
    };
    expect(
      signsInOtherwise('postgres', certified, {
        ...certified,
        fields: { ...certified.fields, sslCert: 'PEM-B' },
      }),
    ).toBe(true);
  });

  it('isn’t the same settings sent again, nor nothing sent', () => {
    expect(signsInOtherwise('postgres', was, { ...was, fields: { ...was.fields } })).toBe(false);
    expect(signsInOtherwise('postgres', was, { ...was, sealed: { password: sealed('a') } })).toBe(
      false,
    );
    expect(signsInOtherwise('postgres', was, {})).toBe(false);
  });
});
