import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DataSourcesList, type ListedSource } from './DataSourcesList';

/**
 * T364 (AC-157): every data source the user may see, in every folder, as
 * `GET /api/data-sources` lists them: each with its folder's path, which
 * opens it in Explore, its driver, and its health from the last test of its
 * stored settings (T362) — an icon, its words and when (direction.md rule 84,
 * references.md surface 10). Filters: folder, driver, health, and a search.
 */
const source = (over: Partial<ListedSource> = {}): ListedSource => ({
  id: 'ds-1',
  name: 'warehouse',
  folderId: 'f-sales',
  folderPath: [
    { id: 'f-finance', title: 'Finance' },
    { id: 'f-sales', title: 'Sales' },
  ],
  driver: 'postgres',
  authMethod: 'password',
  updatedAt: '2026-09-26T10:00:00.000Z',
  lastTest: { ok: true, ranAt: '2026-09-26T11:00:00.000Z', checks: [], current: true },
  ...over,
});
const failed = source({
  id: 'ds-2',
  name: 'lake',
  folderId: 'root',
  folderPath: [],
  driver: 'snowflake',
  lastTest: {
    ok: false,
    ranAt: '2026-09-26T09:00:00.000Z',
    checks: [
      { id: 'secrets', status: 'passed', durationMs: 1 },
      { id: 'connect', status: 'failed', durationMs: 30, error: 'password authentication failed' },
    ],
    current: true,
  },
});
const untested = source({ id: 'ds-3', name: 'archive', driver: 'mysql', lastTest: null });

const rows = () => screen.getAllByRole('row').slice(1);
const cellsOf = (row: HTMLElement) => within(row).getAllByRole('cell');

describe('the data sources a user may see (T364, AC-157)', () => {
  it('lists each with its folder’s path, opening it in Explore, and its driver’s name', () => {
    render(<DataSourcesList sources={[source(), failed]} />);

    const [first, second] = rows();
    expect(cellsOf(first!)[0]?.textContent).toBe('warehouse');
    const path = within(cellsOf(first!)[1]!).getByRole('link');
    expect(path.textContent).toBe('Finance / Sales');
    expect(path.getAttribute('href')).toBe('/explore?folder=f-sales');
    expect(cellsOf(first!)[2]?.textContent).toBe('PostgreSQL');
    // The shared root's own, as Explore names it.
    expect(within(cellsOf(second!)[1]!).getByRole('link').textContent).toBe('Shared');
    expect(cellsOf(second!)[2]?.textContent).toBe('Snowflake');
  });

  it('says each one’s health from its last test: an icon, its words, and when; a failure with its check', () => {
    render(<DataSourcesList sources={[source(), failed, untested]} />);

    const [ok, bad, never] = rows().map((row) => within(row).getByTestId('source-health'));
    expect(ok?.getAttribute('data-state')).toBe('ok');
    expect(ok?.textContent).toContain('Passed');
    expect(ok?.querySelector('svg')).not.toBeNull();
    expect(ok?.textContent).toContain(new Date('2026-09-26T11:00:00.000Z').toLocaleString());
    expect(bad?.getAttribute('data-state')).toBe('err');
    expect(bad?.textContent).toContain('Failed at connect');
    expect(never?.getAttribute('data-state')).toBe('idle');
    expect(never?.textContent).toBe('Not tested yet');
  });

  it('says a source saved since its last test hasn’t been tested since, whatever that test said (T364’s review)', () => {
    render(
      <DataSourcesList
        sources={[
          source({
            lastTest: { ok: true, ranAt: '2026-09-26T11:00:00.000Z', checks: [], current: false },
          }),
        ]}
      />,
    );

    const health = within(rows()[0]!).getByTestId('source-health');
    expect(health.getAttribute('data-state')).toBe('idle');
    expect(health.textContent).toBe('Not tested since it changed');
  });

  it('names a workspace’s own as Explore does, never as the shared root (T364’s review)', () => {
    render(<DataSourcesList sources={[source({ folderId: 'mine', folderPath: [] })]} />);

    expect(within(cellsOf(rows()[0]!)[1]!).getByRole('link').textContent).toBe('My workspace');
  });

  it('filters by folder, driver, health and name', async () => {
    const user = userEvent.setup();
    render(<DataSourcesList sources={[source(), failed, untested]} />);

    await user.selectOptions(screen.getByLabelText('Health'), 'err');
    expect(rows().map((row) => cellsOf(row)[0]?.textContent)).toEqual(['lake']);
    await user.selectOptions(screen.getByLabelText('Health'), '');

    await user.selectOptions(screen.getByLabelText('Driver'), 'mysql');
    expect(rows().map((row) => cellsOf(row)[0]?.textContent)).toEqual(['archive']);
    await user.selectOptions(screen.getByLabelText('Driver'), '');

    await user.selectOptions(screen.getByLabelText('Folder'), 'root');
    expect(rows().map((row) => cellsOf(row)[0]?.textContent)).toEqual(['lake']);
    await user.selectOptions(screen.getByLabelText('Folder'), '');

    await user.type(screen.getByRole('searchbox', { name: 'Search data sources' }), 'ware');
    expect(rows().map((row) => cellsOf(row)[0]?.textContent)).toEqual(['warehouse']);
  });

  it('says none has been added yet, to one who sees every folder', () => {
    render(<DataSourcesList sources={[]} seesEveryFolder />);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('note').textContent).toBe('No data source has been added yet.');
  });

  it('says none is in their folders yet, to a read-write member who sees none (T364’s review)', () => {
    render(<DataSourcesList sources={[]} readWrite />);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('note').textContent).toBe(
      'No data source has been added to your folders, or to the folders above them, yet.',
    );
    expect(screen.queryByRole('link', { name: 'Open Explore' })).toBeNull();
  });

  it('says so where the user sees none, pointing to Explore', () => {
    render(<DataSourcesList sources={[]} />);

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('note').textContent).toBe(
      'Data sources are available to read-write members of a folder. Your dashboards are in Explore.',
    );
    expect(screen.getByRole('link', { name: 'Open Explore' }).getAttribute('href')).toBe(
      '/explore',
    );
  });
});
