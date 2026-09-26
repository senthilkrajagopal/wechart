import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { pgSessionStore } from './session-store';

/**
 * T316 (AC-252, AC-316): sessions kept in the metadata database, which neither
 * returns an expired session nor keeps it forever.
 */
afterAll(async () => {
  await closeDb();
});

const store = () => pgSessionStore(getDb());
const put = (id: string, expires: Date | null) =>
  new Promise<void>((resolve, reject) => {
    store().set(id, { cookie: { expires: expires?.toISOString() ?? null } } as never, (error) =>
      error ? reject(error as Error) : resolve(),
    );
  });
const read = (id: string) =>
  new Promise<unknown>((resolve, reject) => {
    store().get(id, (error, session) => (error ? reject(error as Error) : resolve(session)));
  });

describe('the session store', () => {
  it('returns a live session and nothing for an expired one', async () => {
    const live = randomUUID();
    const expired = randomUUID();
    await put(live, new Date(Date.now() + 60_000));
    await put(expired, new Date(Date.now() - 1_000));
    expect(await read(live)).not.toBeNull();
    expect(await read(expired)).toBeNull();
  });

  it('sweeps expired sessions out of the table, and only those', async () => {
    const live = randomUUID();
    const expired = randomUUID();
    await put(live, new Date(Date.now() + 60_000));
    await put(expired, new Date(Date.now() - 1_000));

    await pgSessionStore(getDb()).sweep();

    const ids = (await getDb().selectFrom('sessions').select('id').execute()).map((row) => row.id);
    expect(ids).toContain(live);
    expect(ids).not.toContain(expired);
  });
});
