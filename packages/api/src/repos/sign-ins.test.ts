import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { signInStore } from './sign-ins';

/**
 * T777 (AC-471): each user's latest web sign-in, with the groups it
 * carried and when, the groups a token of theirs acts with on `/mcp`.
 */
const KEY = `signer-${randomUUID()}`;
const store = () => signInStore(getDb());

afterAll(async () => {
  await getDb().deleteFrom('latest_sign_ins').where('user_key', '=', KEY).execute();
  await closeDb();
});

describe('the latest sign-in (T777, AC-471)', () => {
  it('knows none for a user who never signed in', async () => {
    expect(await store().latest(`never-${randomUUID()}`)).toBe(undefined);
  });

  it('keeps each sign-in’s groups and time, the latest replacing the one before', async () => {
    const first = new Date('2026-10-17T09:00:00.000Z');
    const second = new Date('2026-10-17T10:00:00.000Z');
    await store().record(KEY, ['A', 'B'], first);
    expect(await store().latest(KEY)).toEqual({ groups: ['A', 'B'], at: first });
    await store().record(KEY, ['B'], second);
    expect(await store().latest(KEY)).toEqual({ groups: ['B'], at: second });
    await store().record(KEY, [], new Date('2026-10-17T11:00:00.000Z'));
    expect((await store().latest(KEY))?.groups).toEqual([]);
    // One finishing late, but begun before, doesn't replace a later one.
    await store().record(KEY, ['A'], second);
    expect((await store().latest(KEY))?.groups).toEqual([]);
  });
});
