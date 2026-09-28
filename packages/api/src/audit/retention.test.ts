import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../config';
import { closeDb, getDb } from '../db/client';
import { auditStore } from '../repos/audit';
import { AUDIT_RETENTION_DAYS, pruneAudit, startAuditRetention } from './retention';

/**
 * T370 (AC-296): audit records older than the retention the deployment
 * configures are removed, and those older than one year when none is.
 */
const run = randomUUID().slice(0, 8);
const actor = { key: `retained-${run}`, name: 'Retained' };
afterAll(async () => {
  await getDb().deleteFrom('audit_records').where('actor_key', '=', actor.key).execute();
  await closeDb();
});

const DAY = 86_400_000;
const now = new Date('2026-09-27T12:00:00Z');
const keep = (daysAgo: number, summary: string) =>
  auditStore(getDb()).record({
    at: new Date(now.getTime() - daysAgo * DAY),
    actor,
    event: 'sign-in',
    folderId: null,
    item: null,
    summary,
  });
const left = async () =>
  (await auditStore(getDb()).list({ users: [actor.key] })).records.map((r) => r.summary);

describe('the audit trail’s retention (T370, AC-296)', () => {
  it('is one year unless the deployment says otherwise, in whole days', () => {
    const env = { CUBE_API_SECRET: 'secret' };
    expect(AUDIT_RETENTION_DAYS).toBe(365);
    expect(loadConfig(env).auditRetentionDays).toBe(365);
    expect(loadConfig({ ...env, WECHART_AUDIT_RETENTION_DAYS: '90' }).auditRetentionDays).toBe(90);
    // Empty is unset, as the chart renders a value it isn't given.
    expect(loadConfig({ ...env, WECHART_AUDIT_RETENTION_DAYS: '' }).auditRetentionDays).toBe(365);
    for (const wrong of ['0', '-3', '1.5', 'a year'])
      expect(() => loadConfig({ ...env, WECHART_AUDIT_RETENTION_DAYS: wrong }), wrong).toThrow(
        /WECHART_AUDIT_RETENTION_DAYS/,
      );
  });

  it('removes the records older than it, and keeps the younger', async () => {
    await keep(400, 'older than a year');
    await keep(100, 'a hundred days ago');
    await keep(1, 'yesterday');

    expect(await pruneAudit(auditStore(getDb()), 365, now)).toBeGreaterThanOrEqual(1);
    expect(await left()).toEqual(['yesterday', 'a hundred days ago']);

    await pruneAudit(auditStore(getDb()), 90, now);
    expect(await left()).toEqual(['yesterday']);
  });

  it('says a failure, and tries again next time (T370’s review)', async () => {
    let calls = 0;
    const failures: unknown[] = [];
    const stop = startAuditRetention(
      {
        removeBefore: async () => {
          calls += 1;
          if (calls === 1) throw new Error('the database is away');
          return 0;
        },
      },
      { days: 30, every: 20, now: () => now, onError: (error) => failures.push(error) },
    );
    await new Promise((resolve) => setTimeout(resolve, 70));
    stop();

    expect(failures.map((error) => (error as Error).message)).toEqual(['the database is away']);
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('prunes at once and then on its interval, until stopped', async () => {
    const pruned: Date[] = [];
    const store = {
      removeBefore: async (cutoff: Date) => {
        pruned.push(cutoff);
        return 0;
      },
    };
    const stop = startAuditRetention(store, { days: 30, every: 20, now: () => now });
    await new Promise((resolve) => setTimeout(resolve, 70));
    stop();
    const count = pruned.length;
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(count).toBeGreaterThanOrEqual(2);
    expect(pruned.length).toBe(count);
    expect(pruned[0]).toEqual(new Date(now.getTime() - 30 * DAY));
  });
});
