import { randomUUID } from 'node:crypto';

import type { SealedV1 } from '@wechart/core';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { connectionTestStore } from './connection-tests';
import { dataSourceStore } from './data-sources';

/**
 * T362 (AC-163): every connection test of a stored data source is recorded —
 * when, by whom, what it connected to, whether that was the stored settings or
 * changes not yet saved, and each check xcube ran — and the source's history
 * lists them all, newest first. A test holds no secret: xcube redacts each from
 * its errors, and the fields tested are the non-secret ones.
 */
const folder = `folder-${randomUUID()}`;
afterAll(async () => {
  await getDb().deleteFrom('data_sources').where('folder_id', '=', folder).execute();
  await closeDb();
});

const sealed = (tag: string): SealedV1 => ({
  v: 1,
  kid: 'kid-1',
  enc: Buffer.alloc(32, `enc-${tag}`).toString('base64url'),
  ct: Buffer.alloc(272, `ct-${tag}`).toString('base64url'),
});
const source = (name: string) =>
  dataSourceStore(getDb()).create({
    folderId: folder,
    name,
    driver: 'postgres',
    authMethod: 'password',
    fields: { host: 'db', port: 5432, database: 'sales', user: 'cube', ssl: true },
    sealed: { password: sealed(name) },
  });
const tests = () => connectionTestStore(getDb());
const failedChecks = [
  { id: 'secrets', status: 'passed' as const, durationMs: 2 },
  { id: 'config', status: 'passed' as const, durationMs: 1 },
  {
    id: 'connect',
    status: 'failed' as const,
    durationMs: 30,
    error: 'password authentication failed for user "cube"',
  },
  { id: 'schemas', status: 'skipped' as const, durationMs: 0 },
];

describe('a data source’s connection tests (T362, AC-163)', () => {
  it('are each recorded, and listed newest first, with who ran them and each check', async () => {
    const made = await source('warehouse');
    const first = await tests().record(made.id, {
      ok: false,
      checks: failedChecks,
      fields: made.fields,
      asStored: true,
      settings: made.settingsPrint,
      by: { key: 'u1', name: 'Writer' },
    });
    const second = await tests().record(made.id, {
      ok: true,
      checks: failedChecks.map((check) => ({
        id: check.id,
        status: 'passed' as const,
        durationMs: 1,
      })),
      fields: { ...made.fields, database: 'other' },
      asStored: false,
      settings: null,
      by: { key: 'u2', name: 'Other writer' },
    });

    const history = await tests().history(made.id);
    expect(history.map((each) => each.id)).toEqual([second.id, first.id]);
    expect(history[1]).toEqual({
      id: first.id,
      ranAt: first.ranAt,
      ok: false,
      checks: failedChecks,
      fields: made.fields,
      asStored: true,
      settings: made.settingsPrint,
      by: { key: 'u1', name: 'Writer' },
    });
    expect(history[0]?.asStored).toBe(false);
  });

  it('keeps each source’s own, and goes with its source', async () => {
    const one = await source('one');
    const two = await source('two');
    await tests().record(one.id, {
      ok: true,
      checks: [],
      fields: one.fields,
      asStored: true,
      settings: one.settingsPrint,
      by: null,
    });

    expect(await tests().history(two.id)).toEqual([]);
    expect(await tests().history(one.id)).toHaveLength(1);

    await dataSourceStore(getDb()).remove(one.id);
    const left = await getDb()
      .selectFrom('connection_tests')
      .select('id')
      .where('data_source_id', '=', one.id)
      .execute();
    expect(left).toEqual([]);
  });

  it('lists every one, however many, in the order recorded (T362’s review)', async () => {
    const made = await source('busy');
    const recorded: string[] = [];
    for (let at = 0; at < 60; at += 1)
      recorded.push(
        (
          await tests().record(made.id, {
            ok: at % 2 === 0,
            checks: [],
            fields: made.fields,
            asStored: true,
            settings: made.settingsPrint,
            by: null,
          })
        ).id,
      );

    expect((await tests().history(made.id)).map((each) => each.id)).toEqual(recorded.reverse());
  });

  it('keeps of each check only what xcube says of it (T362’s review)', async () => {
    const made = await source('trimmed');
    await tests().record(made.id, {
      ok: true,
      checks: [{ id: 'secrets', status: 'passed', durationMs: 1, extra: 'not kept' } as never],
      fields: made.fields,
      asStored: true,
      settings: made.settingsPrint,
      by: null,
    });

    expect((await tests().history(made.id))[0]?.checks).toEqual([
      { id: 'secrets', status: 'passed', durationMs: 1 },
    ]);
  });
});
