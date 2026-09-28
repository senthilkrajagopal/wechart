import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { auditStore, type AuditEntry } from './audit';

/**
 * T368 (AC-294): every sign-in, permission change, proposal, approval,
 * rejection, restore and data-source change is recorded with who, what,
 * which folder and when. T369 (AC-295) lists them newest first, filtered by
 * user, event, folder and time, a page at a time.
 */
const run = randomUUID().slice(0, 8);
// As the signed-in user is known: a stable key, a name, and the identity the provider sent.
const ada = { key: `ada-${run}`, name: 'Ada Admin', identity: `ada-${run}@corp.example` };
const wren = { key: `wren-${run}`, name: 'Wren Writer', identity: `wren-${run}@corp.example` };
const emea = `emea-${run}`;
const finance = `finance-${run}`;

afterAll(async () => {
  await getDb().deleteFrom('audit_records').where('actor_key', 'in', [ada.key, wren.key]).execute();
  await closeDb();
});

const at = (iso: string) => new Date(iso);
const entries: AuditEntry[] = [
  {
    at: at('2026-09-22T10:14:30Z'),
    actor: ada,
    event: 'approval',
    folderId: emea,
    item: { kind: 'dashboard', id: 'd1', title: 'Revenue overview' },
    summary: 'Approved version 7, self-approved',
  },
  {
    at: at('2026-09-27T11:48:03Z'),
    actor: ada,
    event: 'access-change',
    folderId: emea,
    item: { kind: 'folder', id: emea, title: 'EMEA' },
    summary: 'Added read-write group emea-analysts',
    details: {
      readWrite: { before: ['sales-emea-rw'], after: ['sales-emea-rw', 'emea-analysts'] },
    },
  },
  {
    at: at('2026-09-27T14:22:40Z'),
    actor: wren,
    event: 'data-source-change',
    folderId: emea,
    item: { kind: 'data-source', id: 'ds-1', title: 'emea_replica' },
    summary: 'Host changed; password replaced',
    details: { changes: [{ setting: 'Password', before: null, after: 'replaced' }] },
  },
  {
    at: at('2026-09-27T09:00:00Z'),
    actor: wren,
    event: 'sign-in',
    folderId: null,
    item: null,
    summary: 'Signed in',
  },
  {
    at: at('2026-09-26T16:40:12Z'),
    actor: ada,
    event: 'rejection',
    folderId: finance,
    item: { kind: 'dashboard', id: 'd2', title: 'Churn watch' },
    summary: '"Please keep Avg order value as the…"',
  },
];

describe('the audit trail’s records (T368, AC-294)', () => {
  it('keeps each with who, what, which folder and when, and lists them newest first', async () => {
    const audit = auditStore(getDb());
    for (const entry of entries) await audit.record(entry);

    const { records } = await audit.list({ users: [ada.key, wren.key] });
    expect(records.map((record) => record.summary)).toEqual([
      'Host changed; password replaced',
      'Added read-write group emea-analysts',
      'Signed in',
      '"Please keep Avg order value as the…"',
      'Approved version 7, self-approved',
    ]);
    expect(records[1]).toMatchObject({
      at: at('2026-09-27T11:48:03Z'),
      actor: ada,
      event: 'access-change',
      folderId: emea,
      item: { kind: 'folder', id: emea, title: 'EMEA' },
      details: {
        readWrite: { before: ['sales-emea-rw'], after: ['sales-emea-rw', 'emea-analysts'] },
      },
    });
    expect(records[2]).toMatchObject({ folderId: null, item: null, details: null });
  });

  it('filters by user, event, folders and time, all together', async () => {
    const audit = auditStore(getDb());
    const summaries = async (filter: Parameters<typeof audit.list>[0]) =>
      (await audit.list(filter)).records.map((record) => record.summary);
    const both = [ada.key, wren.key];

    expect(await summaries({ users: [wren.key] })).toEqual([
      'Host changed; password replaced',
      'Signed in',
    ]);
    expect(await summaries({ users: both, events: ['approval', 'rejection'] })).toEqual([
      '"Please keep Avg order value as the…"',
      'Approved version 7, self-approved',
    ]);
    expect(await summaries({ users: both, folderIds: [finance] })).toEqual([
      '"Please keep Avg order value as the…"',
    ]);
    expect(
      await summaries({
        users: both,
        folderIds: [emea],
        since: at('2026-09-27T00:00:00Z'),
        until: at('2026-09-27T12:00:00Z'),
      }),
    ).toEqual(['Added read-write group emea-analysts']);
  });

  it('pages newest first, never repeating or skipping one', async () => {
    const audit = auditStore(getDb());
    const first = await audit.list({ users: [ada.key, wren.key], limit: 2 });
    expect(first.records).toHaveLength(2);
    expect(first.next).toBeDefined();
    const second = await audit.list({ users: [ada.key, wren.key], limit: 2, after: first.next });
    const third = await audit.list({ users: [ada.key, wren.key], limit: 2, after: second.next });
    expect([...first.records, ...second.records, ...third.records].map((r) => r.summary)).toEqual([
      'Host changed; password replaced',
      'Added read-write group emea-analysts',
      'Signed in',
      '"Please keep Avg order value as the…"',
      'Approved version 7, self-approved',
    ]);
    expect(third.next).toBeUndefined();
  });

  it('pages records stamped a moment apart, or at once, never skipping one (T368’s review)', async () => {
    const audit = auditStore(getDb());
    const quick = { key: `quick-${run}`, name: 'Quick', identity: `quick-${run}@corp.example` };
    try {
      // Stamped as they're kept, several within one millisecond.
      await Promise.all(
        Array.from({ length: 7 }, (_, at) =>
          audit.record({
            actor: quick,
            event: 'sign-in',
            folderId: null,
            item: null,
            summary: `sign-in ${String(at)}`,
          }),
        ),
      );
      const seen: string[] = [];
      let after: string | undefined;
      do {
        const page = await audit.list({ users: [quick.key], limit: 3, after });
        seen.push(...page.records.map((record) => record.summary));
        after = page.next;
      } while (after !== undefined);
      expect(seen.toSorted()).toEqual(
        Array.from({ length: 7 }, (_, at) => `sign-in ${String(at)}`),
      );
    } finally {
      await getDb().deleteFrom('audit_records').where('actor_key', '=', quick.key).execute();
    }
  });

  it('names each person once, for the User filter', async () => {
    const people = await auditStore(getDb()).actors();
    const ours = people.filter((person) => [ada.key, wren.key].includes(person.key));
    expect(ours).toEqual([ada, wren]);
  });
});
