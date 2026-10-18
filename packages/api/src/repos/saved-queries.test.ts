import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { savedQueryStore } from './saved-queries';

/**
 * T812 (AC-457, AC-483): the store keeps a saved query by its owner's key,
 * its parameters with their types and values, a name once per owner, and
 * reaches none of another owner's.
 */
const MARK = `sqr${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const store = () => savedQueryStore(getDb());
const ADA = `ada-${MARK}`;
const WREN = `wren-${MARK}`;
const input = (name: string) => ({
  name: `${name} ${MARK}`,
  description: '',
  sourceId: 'cubestore',
  sql: 'SELECT {{n}}',
  parameters: [{ name: 'n', type: 'number' as const, value: '7' }],
});

afterAll(async () => {
  await getDb().deleteFrom('saved_queries').where('owner_key', 'in', [ADA, WREN]).execute();
  await closeDb();
});

describe('saved queries, by owner (T812)', () => {
  it('keeps one with its parameters, and gives it back to its owner alone', async () => {
    const made = await store().create(ADA, input('kept'));
    if (!('saved' in made)) throw new Error('not saved');
    expect(await store().get(ADA, made.saved.id)).toMatchObject(input('kept'));
    expect(await store().get(WREN, made.saved.id)).toBeUndefined();
    expect(await store().update(WREN, made.saved.id, input('stolen'))).toBeUndefined();
  });

  it('a name is its owner’s once, on create and on update; another owner may use it', async () => {
    expect('saved' in (await store().create(ADA, input('once')))).toBe(true);
    expect(await store().create(ADA, input('once'))).toEqual({ taken: true });
    expect('saved' in (await store().create(WREN, input('once')))).toBe(true);

    const other = await store().create(ADA, input('other'));
    if (!('saved' in other)) throw new Error('not saved');
    expect(await store().update(ADA, other.saved.id, input('once'))).toEqual({ taken: true });
  });
});
