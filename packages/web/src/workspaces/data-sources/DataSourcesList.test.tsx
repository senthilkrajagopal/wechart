import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { shortDay } from '../../shell/relativeAge';
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
  usedBy: [],
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
    // Two hours after the test, by the clock.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-26T13:00:00.000Z'));
    render(<DataSourcesList sources={[source(), failed, untested]} />);
    vi.useRealTimers();

    const [ok, bad, never] = rows().map((row) => within(row).getByTestId('source-health'));
    expect(ok?.getAttribute('data-state')).toBe('ok');
    expect(ok?.querySelector('svg')).not.toBeNull();
    // When, as design 01 writes it, the time itself on hover (item 9, T490).
    expect(ok?.textContent).toBe('Passed · 2 h ago');
    expect(ok?.querySelector('.status__when')?.getAttribute('title')).toBe(
      new Date('2026-09-26T11:00:00.000Z').toLocaleString(),
    );
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

  /**
   * T459 (AC-157): beside each, the cubes xcube bound to it at publish, each
   * with its folder's path; none said as none, and none known — xcube away —
   * said so, never as none.
   */
  it('lists the cubes that use each, with their folders, and says when none is known', () => {
    render(
      <DataSourcesList
        sources={[
          source({
            usedBy: [
              {
                name: 'sales',
                folderId: 'f-sales',
                folderPath: [
                  { id: 'f-finance', title: 'Finance' },
                  { id: 'f-sales', title: 'Sales' },
                ],
              },
              { name: 'orders', folderId: 'root', folderPath: [] },
            ],
          }),
          failed,
          source({ id: 'ds-4', name: 'unknown', usedBy: null }),
        ]}
      />,
    );

    const [used, none, unknown] = rows().map((row) => within(row).getByTestId('source-used-by'));
    // A count, the cubes and their folders one step away (design 01 item 10, T496).
    const count = within(used!).getByText('2 cubes');
    const tip = within(used!).getByRole('tooltip', { hidden: true });
    expect(count.getAttribute('tabindex')).toBe('0');
    expect(count.getAttribute('aria-describedby')).toBe(tip.id);
    expect(
      within(tip)
        .getAllByRole('listitem', { hidden: true })
        .map((item) => item.textContent),
    ).toEqual(['sales · Finance / Sales', 'orders · Shared']);
    expect(none?.textContent).toBe('No cube');
    // "Cube", not "xcube", in what the user reads (design 01 note 10).
    expect(unknown?.textContent).toBe('Not known: Cube didn’t answer');
    expect(screen.getByRole('columnheader', { name: 'Used by' })).toBeDefined();
  });

  it('counts, never names, the cubes that use it in folders the user can’t see (T459’s review, as AC-322 counts them)', () => {
    render(
      <DataSourcesList
        sources={[
          source({
            usedBy: [{ name: 'sales', folderId: 'root', folderPath: [] }],
            usedElsewhere: 1,
          }),
          source({ id: 'ds-5', name: 'lake', usedBy: [], usedElsewhere: 2 }),
        ]}
      />,
    );

    const [some, hidden] = rows().map((row) => within(row).getByTestId('source-used-by'));
    // Counted in the cell with the ones it can name; the rest counted in its tooltip.
    expect(within(some!).getByText('2 cubes').isConnected).toBe(true);
    expect(
      within(within(some!).getByRole('tooltip', { hidden: true }))
        .getAllByRole('listitem', { hidden: true })
        .map((item) => item.textContent),
    ).toEqual(['sales · Shared', '1 cube in a folder you can’t see']);
    expect(within(hidden!).getByText('2 cubes').isConnected).toBe(true);
    expect(within(hidden!).getByRole('tooltip', { hidden: true }).textContent).toBe(
      '2 cubes in folders you can’t see',
    );
  });

  /** T496: the list as design 01 draws it (2026-09-27, AC-157, AC-343). */
  it('sets names in the code face and Updated as the day, its time in the tooltip', () => {
    render(<DataSourcesList sources={[source()]} />);

    const cells = cellsOf(rows()[0]!);
    expect(cells[0]?.classList.contains('is-code')).toBe(true);
    const then = new Date('2026-09-26T10:00:00.000Z');
    expect(cells[5]?.textContent).toBe(shortDay(then, new Date()));
    expect(cells[5]?.querySelector('time')?.getAttribute('title')).toBe(then.toLocaleString());
    expect(cells[5]?.querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-09-26T10:00:00.000Z',
    );
  });

  it('draws its filters as pills, each named with what it holds', () => {
    render(<DataSourcesList sources={[source(), failed]} />);

    const pills = [...document.querySelectorAll('.select-pill')];
    expect(
      pills.map((pill) => [
        pill.firstChild?.textContent,
        (pill.querySelector('select') as HTMLSelectElement).selectedOptions[0]?.textContent,
      ]),
    ).toEqual([
      ['Folder', 'All'],
      ['Driver', 'All'],
      ['Health', 'Any'],
    ]);
  });

  it('says what a read-write member is shown, and that the folders above are view only', () => {
    const { rerender } = render(<DataSourcesList sources={[source()]} readWrite />);
    expect(screen.getByText(/^Showing data sources in the folders where/).textContent).toBe(
      'Showing data sources in the folders where you have read-write access, and in the folders above them (view only).',
    );
    // Not to one who sees every folder.
    rerender(<DataSourcesList sources={[source()]} readWrite seesEveryFolder />);
    expect(screen.queryByText(/^Showing data sources in the folders where/)).toBeNull();
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
