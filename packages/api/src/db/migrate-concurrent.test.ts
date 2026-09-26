import { afterAll, describe, expect, it } from 'vitest';

import { closeDb } from './client';
import { migrateToLatest, migrationLockMode } from './migrate';

/**
 * T421, AC-319: API replicas starting at once each run the migrations. With
 * node-pg-migrate's default lock mode a second replica throws "Another
 * migration is already running" and its pod restarts; waiting for the lock,
 * each finds nothing left to do (research `cube/ha-topology.md`, table row 6
 * and gotcha 9).
 */
afterAll(async () => {
  await closeDb();
});

describe('replicas migrating at once (T421, AC-319)', () => {
  it('wait for the lock rather than failing', () => {
    expect(migrationLockMode).toBe('wait');
  });

  it('all come up', async () => {
    await expect(
      Promise.all([migrateToLatest(), migrateToLatest(), migrateToLatest()]),
    ).resolves.toBeDefined();
  });
});
