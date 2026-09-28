import { describe, expect, it } from 'vitest';

import { exportedBodyOf, exportedDataSourceOf, exportFileNameOf } from './exportFile';

/**
 * T511 (AC-354, AC-355): the export file's name, and what of a stored item
 * goes into it.
 */
describe('an export file’s name (T511, AC-354; R46 Q4)', () => {
  it('is the dashboard’s name, in lower case, words joined by hyphens, as .wechart.json', () => {
    expect(exportFileNameOf('Revenue overview')).toBe('revenue-overview.wechart.json');
    expect(exportFileNameOf('  Q3 board pack — EMEA / 2026 ')).toBe(
      'q3-board-pack-emea-2026.wechart.json',
    );
    expect(exportFileNameOf('Côte de Blaye')).toBe('cote-de-blaye.wechart.json');
  });

  it('is still a name when the dashboard’s has no letter or digit', () => {
    expect(exportFileNameOf('—')).toBe('dashboard.wechart.json');
  });
});

describe('what of a stored item goes into the file (T511, AC-355)', () => {
  it('leaves where an item was, and whose, behind', () => {
    expect(
      exportedBodyOf({
        title: 'Revenue',
        folderId: 'sales',
        owner: 'ada',
        targetFolderId: 'emea',
        origin: { id: 'x', version: 2 },
        localToDashboardId: 'd1',
        pages: [],
      }),
    ).toEqual({ title: 'Revenue', pages: [] });
  });

  it('takes a data source’s driver, sign-in method, settings and description, and no secret', () => {
    expect(
      exportedDataSourceOf({
        name: 'sales_dw',
        driver: 'snowflake',
        authMethod: 'key-pair',
        fields: {
          account: 'acme-emea',
          warehouse: 'REPORTING_WH',
          username: 'CUBE_SVC',
          // Not a key Snowflake's settings name: left behind.
          user: 'someone',
          // Never stored, but never carried out either, were one there.
          privateKey: '-----BEGIN PRIVATE KEY-----',
          sealed: 'envelope',
        },
        description: 'Sales warehouse.',
      }),
    ).toEqual({
      kind: 'data-source',
      name: 'sales_dw',
      driver: 'snowflake',
      authMethod: 'key-pair',
      fields: { account: 'acme-emea', warehouse: 'REPORTING_WH', username: 'CUBE_SVC' },
      description: 'Sales warehouse.',
    });
  });
});
