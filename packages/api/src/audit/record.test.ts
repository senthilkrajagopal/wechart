import { describe, expect, it } from 'vitest';

import {
  accessChangeSummary,
  buildCancelledSummary,
  buildStartedSummary,
  dataSourceChange,
  preAggregationItem,
  scheduleChangeEntry,
  scheduleChangeSummary,
  WECHART_SCHEDULER,
} from './record';

/**
 * T368 (AC-294; design 08 of 2026-09-27, pin 6 and state A): each record's
 * one line, and a data-source change's settings before and after, a secret
 * only "replaced" (AC-298, rule 83).
 */
describe('an access change in one line (T368)', () => {
  it('names each group added or removed, read-write first', () => {
    expect(
      accessChangeSummary(
        { readOnly: ['viewers'], readWrite: ['sales-rw'] },
        { readOnly: [], readWrite: ['sales-rw', 'emea-analysts', 'ops'] },
      ),
    ).toBe('Added read-write groups emea-analysts and ops; removed read-only group viewers');
  });

  it('says a setting made here where it was inherited, and one inherited again', () => {
    expect(
      accessChangeSummary(
        { readOnly: null, readWrite: null },
        { readOnly: ['a'], readWrite: null },
      ),
    ).toBe('Set read-only groups here, no longer inherited: a');
    expect(
      accessChangeSummary(
        { readOnly: null, readWrite: ['b'] },
        { readOnly: null, readWrite: null },
      ),
    ).toBe('Read-write groups inherited again, instead of b');
    expect(
      accessChangeSummary({ readOnly: null, readWrite: null }, { readOnly: [], readWrite: null }),
    ).toBe('Set read-only groups here, no longer inherited: none');
  });

  it('says so when nothing changed', () => {
    const same = { readOnly: ['a'], readWrite: null };
    expect(accessChangeSummary(same, same)).toBe('No change');
  });
});

describe('a data-source change (T368)', () => {
  const before = {
    name: 'emea_replica',
    description: null,
    authMethod: 'password',
    fields: { host: 'db-1', port: 5432, database: 'sales', user: 'cube', ssl: false },
  };

  it('lists each setting before and after, and a secret only as replaced', () => {
    const said = dataSourceChange(
      'postgres',
      before,
      { ...before, fields: { ...before.fields, host: 'db-2', port: 5433, ssl: true } },
      ['password'],
    );
    expect(said.summary).toBe('Host, port and use TLS changed; password replaced');
    expect(said.changes).toEqual([
      { setting: 'Host', before: 'db-1', after: 'db-2' },
      { setting: 'Port', before: '5432', after: '5433' },
      { setting: 'Use TLS', before: 'off', after: 'on' },
      { setting: 'Password', before: null, after: 'replaced' },
    ]);
  });

  it('says a rename, a description and a new way to sign in', () => {
    const said = dataSourceChange(
      'postgres',
      before,
      {
        ...before,
        name: 'eu_replica',
        description: 'Read replica.',
        authMethod: 'client-certificate',
      },
      [],
    );
    expect(said.summary).toBe('Renamed from emea_replica; description changed; sign-in changed');
    expect(said.changes).toEqual([
      { setting: 'Name', before: 'emea_replica', after: 'eu_replica' },
      { setting: 'Description', before: null, after: 'Read replica.' },
      { setting: 'Sign in with', before: 'Password', after: 'Client certificate' },
    ]);
  });

  it('keeps an acronym as it is written, mid-sentence', () => {
    const said = dataSourceChange(
      'mssql',
      { ...before, fields: { host: 'db', encrypt: false } },
      { ...before, fields: { host: 'db', encrypt: true } },
      [],
    );
    expect(said.summary).not.toMatch(/tls|ssl/);
  });

  it('never throws for a driver it doesn’t know: it runs after the save', () => {
    expect(
      dataSourceChange('nosuch' as 'postgres', before, { ...before, name: 'other' }, []).summary,
    ).toBe('Renamed from emea_replica');
  });
});

/** T505 (AC-294; design 16, state I): builds, cancels and schedule changes, each in one line. */
describe('a build started or cancelled in one line (T505)', () => {
  it('says Build now, Build all or Rebuild selected, with the partitions asked for', () => {
    expect(buildStartedSummary(null, null)).toBe('Build now · whole');
    expect(buildStartedSummary(null, 'day')).toBe('Build all · every partition');
    expect(
      buildStartedSummary(['2026-09-01T00:00:00.000', '2026-08-01T00:00:00.000'], 'month'),
    ).toBe('Rebuild selected · Sep, Aug 2026');
    expect(buildStartedSummary(['2026-09-29T00:00:00.000'], 'day')).toBe(
      'Rebuild selected · 29 Sep 2026',
    );
  });

  it('says a cancel’s state then, and its partition, or the whole', () => {
    expect(buildCancelledSummary('queued', '2026-08-01T00:00:00.000', 'month')).toBe(
      'Queued · Aug 2026',
    );
    expect(buildCancelledSummary('stalled', null, null)).toBe('Stalled · whole');
  });

  it('names a pre-aggregation by its cube’s short name, never its folder’s prefix', () => {
    expect(preAggregationItem('f9a1b2__orders.by_month')).toEqual({
      kind: 'pre-aggregation',
      id: 'f9a1b2__orders.by_month',
      title: 'orders.by_month',
    });
  });
});

describe('a wechart schedule’s change (T505)', () => {
  const settings = {
    name: 'Month-end close',
    preAggregation: 'f9a1b2__orders.by_month',
    cron: '0 6 1 * *',
    timezone: 'Europe/Berlin',
    missed: 'once' as const,
    suspendAfter: 3,
  };
  const schedule = { id: 's-1', folderId: 'emea', ...settings };

  it('names each setting changed, in the form’s order, or none', () => {
    expect(
      scheduleChangeSummary(settings, {
        ...settings,
        suspendAfter: 5,
        cron: '0 5 1 * *',
        missed: 'skip',
      }),
    ).toBe('Changed · cron, missed run, suspend after');
    expect(scheduleChangeSummary(settings, { ...settings })).toBe('Saved unchanged');
  });

  it('keeps every setting before and after as the inspector shows it', () => {
    expect(
      scheduleChangeEntry(null, schedule, {
        change: 'changed',
        before: settings,
        after: { ...settings, missed: 'skip' },
      }).details?.['settings'],
    ).toEqual([
      { setting: 'Name', before: 'Month-end close', after: 'Month-end close' },
      { setting: 'Pre-aggregation', before: 'orders.by_month', after: 'orders.by_month' },
      { setting: 'Cron', before: '0 6 1 * *', after: '0 6 1 * *' },
      { setting: 'Time zone', before: 'Europe/Berlin', after: 'Europe/Berlin' },
      { setting: 'A missed run', before: 'Run once', after: 'Skipped' },
      { setting: 'Suspend after', before: '3', after: '3' },
    ]);
  });

  it('records a suspension by wechart’s scheduler, after how many failures', () => {
    const one = scheduleChangeEntry(WECHART_SCHEDULER, schedule, {
      change: 'suspended',
      failures: 1,
      error: 'gone',
    });
    expect([one.actor, one.summary, one.folderId, one.item]).toEqual([
      { key: 'wechart:scheduler', name: 'wechart’s scheduler' },
      'Suspended after 1 failure',
      'emea',
      { kind: 'schedule', id: 's-1', title: 'Month-end close' },
    ]);
    expect(
      scheduleChangeEntry(WECHART_SCHEDULER, schedule, {
        change: 'suspended',
        failures: 3,
        error: null,
      }).summary,
    ).toBe('Suspended after 3 failures');
  });
});
