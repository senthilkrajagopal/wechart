import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { mintToken } from '../mcp/tokenText';
import { accessTokenStore } from './access-tokens';

/**
 * T767 (AC-430): personal access tokens as stored: a digest, never the
 * text; each owner's working ones, newest first, an expired one not among
 * them.
 */
const OWNER = `owner-${randomUUID()}`;
const store = () => accessTokenStore(getDb());
const DAY = 86_400_000;

afterAll(async () => {
  await getDb().deleteFrom('personal_access_tokens').where('owner_key', '=', OWNER).execute();
  await closeDb();
});

const make = (name: string, expiresAt: Date) =>
  store().create({
    owner: { key: OWNER, name: 'Owner' },
    name,
    scopes: ['read'],
    expiresAt,
    digest: mintToken().digest,
  });

describe('the token store (T767)', () => {
  it('keeps the digest and lists the owner’s working tokens, newest first', async () => {
    const first = await make('first', new Date(Date.now() + DAY));
    const second = await make('second', new Date(Date.now() + DAY));
    const row = await getDb()
      .selectFrom('personal_access_tokens')
      .select(['digest', 'owner_name'])
      .where('id', '=', first.id)
      .executeTakeFirstOrThrow();
    expect(row.digest).toHaveLength(32);
    expect(row.owner_name).toBe('Owner');

    const working = await store().working(OWNER, new Date());
    expect(working.map((each) => each.name)).toEqual(['second', 'first']);
    expect(working[0]).toEqual({
      id: second.id,
      name: 'second',
      scopes: ['read'],
      createdAt: expect.any(Date),
      expiresAt: expect.any(Date),
      lastUsedAt: null,
    });
  });

  it('leaves out a token past its expiry, and frees its name', async () => {
    await make('gone', new Date(Date.now() - 1000));
    const now = new Date();
    expect((await store().working(OWNER, now)).map((each) => each.name)).not.toContain('gone');
    expect(await store().workingNamed(OWNER, 'gone', now)).toBe(false);
    expect(await store().workingNamed(OWNER, 'first', now)).toBe(true);
    expect(await store().workingNamed(`other-${OWNER}`, 'first', now)).toBe(false);
  });

  it('revokes a working token once, lists it stopped, and removes it from there (T768)', async () => {
    await make('lapsed', new Date(Date.now() - DAY));
    const made = await make('to revoke', new Date(Date.now() + DAY));
    const by = { key: 'admin-key', name: 'Ada Admin' };
    expect(await store().revoke(made.id, by, new Date())).toBe(true);
    // A second time: it is no longer working.
    expect(await store().revoke(made.id, by, new Date())).toBe(false);

    const now = new Date();
    const stopped = await store().stopped(OWNER, now);
    const revoked = stopped.find((each) => each.id === made.id);
    expect(revoked).toEqual({
      ...made,
      state: 'revoked',
      stoppedAt: expect.any(Date),
      revokedBy: { name: 'Ada Admin' },
    });
    const lapsed = stopped.find((each) => each.name === 'lapsed');
    expect(lapsed?.state).toBe('expired');
    expect(lapsed?.revokedBy).toBe(null);
    expect(lapsed?.stoppedAt).toEqual(lapsed?.expiresAt);
    // Newest stop first: the one just revoked before the one expired a day ago.
    const names = stopped.map((each) => each.name);
    expect(names.indexOf('to revoke')).toBe(0);
    expect(names.indexOf('lapsed')).toBeGreaterThan(0);

    expect(await store().remove(made.id, now)).toBe(true);
    expect((await store().stopped(OWNER, now)).map((each) => each.id)).not.toContain(made.id);
    // A working token isn't removed.
    const working = await make('kept', new Date(Date.now() + DAY));
    expect(await store().remove(working.id, now)).toBe(false);
  });
});
