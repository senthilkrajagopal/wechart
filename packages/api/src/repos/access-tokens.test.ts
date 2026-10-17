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
});
