import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RunLine } from './RunLine';
import type { SqlSource } from './sqlSource';

/**
 * T802 (AC-385): THE SYSTEM SHALL say above the editor of every SQL runner
 * tab on a data source or on Cube Store, always and with no way to hide it,
 * that the SQL runs on the database directly, past folder permissions and
 * access policies, and name the tab's own data source and the login it runs
 * as.
 * Fails when: such a tab shows no such sentence, or it can be hidden, or it
 * names another tab's data source.
 */
const source = (name: string, user: string, host: string): SqlSource => ({
  id: `id-${name}`,
  version: 1,
  name,
  driver: 'postgres',
  fields: { host, port: 5432, database: 'sales', user, ssl: false },
  folderPath: [{ id: 'f', title: 'Sales' }],
  inWorkspace: false,
  sqlRunner: {
    on: true,
    tab: true,
    runs: true,
    confirmedBy: { name: 'Ada Admin' },
    confirmedAt: '2026-10-01T09:00:00Z',
  },
});
const cubeStore: SqlSource = {
  cubeStore: true,
  id: 'cubestore',
  version: 0,
  name: 'Cube Store',
  folderPath: [],
  inWorkspace: false,
  sqlRunner: { on: true, tab: true, runs: true },
};

describe('the run line and the warning, above every tab’s editor (T802, AC-385)', () => {
  it('names the tab’s database, host and login', () => {
    render(<RunLine source={source('emea_replica', 'cube_reader', 'pg-replica-1')} warningId="w" />);

    expect(screen.getByTestId('sql-runline').textContent).toBe(
      'Runs on sales at pg-replica-1:5432, as cube_reader',
    );
  });

  it('warns that the SQL runs on that data source’s database directly, as its login, past folder permissions and access policies', () => {
    render(<RunLine source={source('emea_replica', 'cube_reader', 'pg-replica-1')} warningId="w" />);

    const warning = screen.getByTestId('sql-warning');
    expect(warning.textContent).toBe(
      'This SQL runs on emea_replica’s database directly, as cube_reader. Folder permissions and access policies don’t apply here: you can read whatever that login can read.',
    );
    expect(warning.id).toBe('w');
    // An icon with it, and no control to hide either.
    expect(warning.querySelector('svg[data-icon="warn"]')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('names each tab’s own source, never another’s', () => {
    const { rerender } = render(
      <RunLine source={source('emea_replica', 'cube_reader', 'pg-replica-1')} warningId="w" />,
    );
    rerender(<RunLine source={source('fx_warehouse', 'fin_reader', 'pg-fin')} warningId="w" />);

    expect(screen.getByTestId('sql-runline').textContent).toBe('Runs on sales at pg-fin:5432, as fin_reader');
    expect(screen.getByTestId('sql-warning').textContent).toMatch(
      /^This SQL runs on fx_warehouse’s database directly, as fin_reader\./,
    );
  });

  it('says who switched it on, as an icon and words', () => {
    render(<RunLine source={source('emea_replica', 'cube_reader', 'pg-replica-1')} warningId="w" />);

    const on = screen.getByTestId('sql-switch');
    expect(on.textContent).toMatch(/^SQL runner on · turned on by Ada Admin, who confirmed the login can only read · /);
    expect(on.querySelector('svg[data-icon="ok"]')).not.toBeNull();
  });

  it('on Cube Store, says it runs there directly, over every folder’s rollups', () => {
    render(<RunLine source={cubeStore} warningId="w" />);

    expect(screen.getByTestId('sql-runline').textContent).toBe(
      'Runs on Cube Store, which holds every folder’s rollups',
    );
    expect(screen.getByTestId('sql-warning').textContent).toBe(
      'This SQL runs on Cube Store directly. It holds every folder’s rollups, and folder permissions and access policies don’t apply.',
    );
  });
});
