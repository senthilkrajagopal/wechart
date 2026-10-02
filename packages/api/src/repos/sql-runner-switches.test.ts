import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { sqlRunnerSwitches } from './sql-runner-switches';

/**
 * T531 / AC-374: the SQL runner's switch, per target, with who confirmed its
 * credential read-only and when. Every target starts off. Against the real
 * Postgres, as the other repos are.
 */
const switches = () => sqlRunnerSwitches(getDb());
const made: string[] = [];

afterAll(async () => {
  for (const target of made) await switches().off(target);
  await closeDb();
});

describe('the SQL runner’s switch (T531, AC-374)', () => {
  it('starts off, is on with who confirmed it and when, and goes off again', async () => {
    const target = `ds-${randomUUID()}`;
    made.push(target);
    expect(await switches().of(target)).toBeUndefined();

    const before = Date.now();
    const on = await switches().on(target, { key: 'super-key', name: 'Super Admin' });
    expect(on.confirmedBy).toEqual({ key: 'super-key', name: 'Super Admin' });
    expect(on.confirmedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(await switches().of(target)).toEqual(on);

    await switches().off(target);
    expect(await switches().of(target)).toBeUndefined();
  });

  it('keeps the latest confirmation when switched on again', async () => {
    const target = `ds-${randomUUID()}`;
    made.push(target);
    await switches().on(target, { key: 'a', name: 'First' });
    const again = await switches().on(target, { key: 'b', name: 'Second' });
    expect((await switches().of(target))?.confirmedBy).toEqual({ key: 'b', name: 'Second' });
    expect(again.confirmedBy.name).toBe('Second');
  });

  it('answers several at once, for a listing', async () => {
    const [one, two, three] = [randomUUID(), randomUUID(), randomUUID()].map((id) => `ds-${id}`);
    made.push(one!, two!);
    await switches().on(one!, { key: 'k', name: 'N' });
    await switches().on(two!, { key: 'k', name: 'N' });
    expect([...(await switches().among([one!, two!, three!])).keys()].sort()).toEqual(
      [one!, two!].sort(),
    );
  });
});
