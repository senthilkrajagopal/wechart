import { describe, expect, it } from 'vitest';

import { accessChangeSummary, dataSourceChange } from './record';

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
