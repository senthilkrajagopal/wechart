import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KEY_ROWS, paneOf, paused, schedule, shownSchedules, suspended } from './schedules.fixture';
import { SchedulesPage } from './SchedulesPage';

/**
 * T551 / AC-154 (design 16, screen 2 and state D5): Schedules' refresh-key
 * rows — each with its owner as an icon and a label; its schedule in words
 * and as written, "Cube's default" and "Not scheduled" with their icons; its
 * next run; and when Cube last built it — and a refresh key's read-only
 * pane: the `refresh_key` as written, its file, the next five runs with the
 * note on how late one can start, Open in Model to the pre-aggregation
 * itself, and Open in Jobs.
 */
const ROWS = [
  {
    id: 'fsales__orders.mornings',
    folderId: 'sales',
    shortName: 'orders',
    folderPath: ['Shared', 'Sales'],
    cube: 'fsales__orders',
    name: 'mornings',
    type: 'rollup',
    fileName: 'cubes/orders.yml',
    fileFolderId: 'sales',
    owner: 'cube',
    kind: 'key',
    scheduled: true,
    when: 'Daily at 08:00, Los Angeles',
    written: 'every: "0 8 * * *" · timezone: America/Los_Angeles',
    runs: { every: '0 8 * * *', timezone: 'America/Los_Angeles' },
    lagSeconds: 330,
    every: '0 8 * * *',
    timezone: 'America/Los_Angeles',
    lastBuiltAt: '2026-09-24T09:01:00.000Z',
  },
  {
    id: 'orders.plain',
    folderId: 'root',
    shortName: 'orders',
    folderPath: ['Shared'],
    cube: 'orders',
    name: 'plain',
    type: 'rollup',
    owner: 'cube',
    kind: 'default',
    scheduled: true,
    when: 'Cube’s default: every hour',
    written: 'no refresh_key declared',
    runs: { every: '1 hour' },
    lagSeconds: 40,
    lastBuiltAt: null,
  },
  {
    id: 'orders.on_demand',
    folderId: 'root',
    shortName: 'orders',
    folderPath: ['Shared'],
    cube: 'orders',
    name: 'on_demand',
    type: 'rollup',
    owner: 'cube',
    kind: 'not-scheduled',
    scheduled: false,
    when: 'Not scheduled',
    written: 'scheduled_refresh: false',
    public: false,
  },
];

function shown(at = '2026-09-24T12:00:00Z', rows: unknown[] = ROWS) {
  vi.useFakeTimers({ toFake: ['Date'] });
  // By default Thu 24 Sep 2026, 12:00 UTC: weeks from Los Angeles' next clock change.
  vi.setSystemTime(new Date(at));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/schedules'
        ? Response.json(rows)
        : Response.json({ error: 'not here' }, { status: 404 }),
    ),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SchedulesPage />
    </QueryClientProvider>,
  );
}

const text = (element: Element | null | undefined) => element?.textContent ?? '';
const rowOf = async (name: string) =>
  (await screen.findByText(name, { selector: '[data-testid="schedule-name"]' })).closest(
    'tr',
  ) as HTMLElement;
const cell = (row: HTMLElement, column: string) => {
  const table = row.closest('table') as HTMLElement;
  const at = within(table)
    .getAllByRole('columnheader')
    .findIndex((header) => text(header) === column);
  return within(row).getAllByRole('cell')[at] as HTMLElement;
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Schedules’ refresh-key rows (T551, AC-154)', () => {
  it('shows each row’s schedule in words and as written, its next run, its last, and its owner with an icon', async () => {
    shown();
    const row = await rowOf('orders.mornings');

    expect(
      within(screen.getByRole('table', { name: 'Refresh schedules' }))
        .getAllByRole('columnheader')
        .map((header) => text(header)),
    ).toEqual(['Pre-aggregation', 'Folder', 'Schedule', 'Next run', 'Last run', 'Owner']);
    expect(text(cell(row, 'Folder'))).toBe('Sales');
    expect(text(cell(row, 'Schedule'))).toBe(
      'Daily at 08:00, Los Angelesevery: "0 8 * * *" · timezone: America/Los_Angeles',
    );
    // In its own zone, with UTC and how long until it (design 16, screen 2).
    expect(text(cell(row, 'Next run'))).toBe('Thu 24 Sep, 08:0015:00 UTC · in 3 h');
    expect(cell(row, 'Last run').querySelector('time')?.getAttribute('dateTime')).toBe(
      '2026-09-24T09:01:00.000Z',
    );
    expect(text(cell(row, 'Last run'))).toMatch(/^Built today \d{2}:\d{2}$/);
    const owner = cell(row, 'Owner');
    expect(text(owner)).toBe('Cube’s refresh worker');
    expect(owner.querySelector('svg')?.getAttribute('data-icon')).toBe('cube');
    // What Last run means, under the table, with no word of phases (UX-111).
    const foot = screen.getByText(/^Times are your local time/);
    expect(text(foot)).toContain('Last run is when Cube last built the rollup');
    expect(text(foot)).not.toMatch(/\bphase\b/i);
  });

  it('draws Cube’s default and Not scheduled with their icons, and says what wasn’t built', async () => {
    shown();
    const plain = await rowOf('orders.plain');
    const off = await rowOf('orders.on_demand');

    expect(cell(plain, 'Schedule').querySelector('svg')?.getAttribute('data-icon')).toBe('info');
    expect(text(cell(plain, 'Last run'))).toBe('Not built yet');
    const notScheduled = cell(off, 'Schedule');
    expect(notScheduled.querySelector('svg')?.getAttribute('data-icon')).toBe('off');
    expect(text(notScheduled)).toBe('Not scheduledscheduled_refresh: false');
    expect(text(cell(off, 'Next run'))).toBe('—');
    // Its cube isn't public: listed all the same (research xcube-jobs-schedules-routes.md §2).
    expect(text(off)).toContain('on_demand');
  });

  it('opens a refresh key’s read-only pane: as written, its file, five runs, the note, and the ways to Model and Jobs', async () => {
    shown();
    await userEvent.click(await rowOf('orders.mornings'), { delay: null });

    const pane = screen.getByRole('complementary', { name: 'Schedule details' });
    expect(text(within(pane).getByRole('heading', { level: 2 }))).toBe('orders.mornings');
    expect(text(within(pane).getByTestId('schedule-written'))).toBe(
      'refresh_key:\n  every: "0 8 * * *"\n  timezone: America/Los_Angeles',
    );
    expect(text(within(pane).getByTestId('schedule-where'))).toBe(
      'Set in cubes/orders.yml in Sales, so it’s read-only here. To change it, edit the model in My workspace and propose it.',
    );
    const runs = within(within(pane).getByRole('list', { name: 'Next runs' })).getAllByRole(
      'listitem',
    );
    expect(runs).toHaveLength(5);
    expect(text(runs[0])).toBe('Thu 24 Sep08:0015:00 UTC');
    expect(text(within(pane).getByText(/can start up to about/))).toMatch(
      /^Cube’s refresh worker checks the key on its own cadence, so a run can start up to about 5½ minutes after its time\.$/,
    );
    expect(within(pane).getByRole('link', { name: 'Open in Model' }).getAttribute('href')).toBe(
      '/explore/folders/sales/models/cubes%2Forders.yml?cube=orders&tab=pre_aggregations&member=mornings',
    );
    expect(within(pane).getByRole('link', { name: 'Open in Jobs' }).getAttribute('href')).toBe(
      '/jobs?preagg=fsales__orders.mornings',
    );
    // Read-only: nothing on the page edits a schedule. Its only controls are
    // the list's filters, Folder (T559), Search (T610) and State (T558, R66),
    // which edit none.
    const controls = [...document.querySelectorAll('main input, input, select, textarea')];
    expect(controls.filter((each) => each.closest('.schedules__filters') === null)).toHaveLength(0);
    expect(controls).toEqual([
      screen.getByRole('combobox', { name: 'Folder' }),
      screen.getByRole('checkbox', { name: 'Include subfolders' }),
      screen.getByRole('searchbox', { name: 'Search schedules' }),
      screen.getByRole('combobox', { name: 'State' }),
    ]);
  });
});

/**
 * T610 (AC-399; design 16, screen 2's filters, G1, G5b and G6): Search
 * schedules, after the owner filter; the skeleton under the list's own
 * heads; no read-write folder left while open; and Schedules opened by one
 * who writes no folder reads as the app's Not found page.
 */
describe('Schedules: Search, and the rest of design 16’s states (T610, AC-399)', () => {
  const user = () => userEvent.setup({ delay: null });
  const named = () => screen.queryAllByTestId('wechart-schedule-name').map((each) => text(each));
  const keyNames = () =>
    within(screen.getByRole('table', { name: 'Refresh schedules' }))
      .queryAllByTestId('schedule-name')
      .map((each) => text(each));

  it('narrows the list to schedules whose rollup, name or folder holds what is typed; the owner filter counts them', async () => {
    shownSchedules({
      wechart: [schedule(), schedule({ id: 'sched-2', name: 'Weekends' })],
    });
    await screen.findByText('Weekends', { selector: '[data-testid="wechart-schedule-name"]' });
    const find = screen.getByRole('searchbox', { name: 'Search schedules' });
    expect(find.getAttribute('placeholder')).toBe('Search schedules');
    // After the owner filter, as screen 2 places it.
    expect(
      [...document.querySelectorAll('.schedules__filters > *')].map((each) =>
        each.matches('[role="radiogroup"]')
          ? 'Owner'
          : each.matches('input')
            ? each.getAttribute('aria-label')
            : each.matches('label')
              ? text(each)
              : text(each.querySelector('label')),
      ),
    ).toEqual(['Folder', 'Include subfolders', 'Owner', 'Search schedules', 'State']);

    await user().type(find, 'weekend');
    expect(named()).toEqual(['Weekends']);
    expect(keyNames()).toEqual(['orders.mornings']);
    expect(
      within(screen.getByRole('radiogroup', { name: 'Owner' }))
        .getAllByRole('radio')
        .map((radio) => text(radio)),
    ).toEqual(['All 1', 'Cube’s refresh worker 0', 'wechart 1']);

    await user().clear(find);
    await user().type(find, 'on_demand');
    expect([named(), keyNames()]).toEqual([[], ['orders.on_demand']]);
  });

  it('draws skeleton rows under the list’s heads while it is read (G1)', async () => {
    shownSchedules({ pending: true });

    await vi.waitFor(() => {
      expect(screen.getByTestId('skeleton-rows').children.length).toBeGreaterThanOrEqual(3);
    });
    expect(
      within(screen.getByTestId('skeleton-table'))
        .getAllByRole('columnheader')
        .map((header) => text(header)),
    ).toEqual(['Pre-aggregation', 'Folder', 'Schedule', 'Next run', 'Last run', 'Owner']);
  });

  it('says Schedules is for read-write members once no read-write folder is left (G5b)', async () => {
    const { refusedLater } = shownSchedules({ wechart: [schedule()] });
    await screen.findByText('Weekday mornings', {
      selector: '[data-testid="wechart-schedule-name"]',
    });

    await refusedLater();

    const left = await screen.findByTestId('no-folder-left');
    expect([
      text(left.querySelector('b')),
      text(left.querySelector('span')),
      within(left).getByRole('link', { name: 'Open Explore' }).getAttribute('href'),
    ]).toEqual([
      'Schedules is for read-write members of a folder',
      'You no longer have read-write access to any folder, so there’s nothing here for you. Your dashboards are in Explore.',
      '/explore',
    ]);
  });

  it('is the app’s Not found page to one who writes no folder (G6, rule 67)', async () => {
    shownSchedules({ refused: true });

    expect(text(await screen.findByRole('heading', { level: 1, name: 'Not found' }))).toBe(
      'Not found',
    );
    expect(screen.queryByRole('table', { name: 'Refresh schedules' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New schedule' })).toBeNull();
  });
});

/**
 * T557 (AC-397; design 16, P4, keeping design 07's filter): an owner
 * filter, All, Cube's refresh worker or wechart, each with the count of the
 * schedules it then lists, over the folders the user sees here; each lists
 * only its own owner's.
 */
describe('the owner filter, with counts (T557, AC-397)', () => {
  const user = () => userEvent.setup({ delay: null });
  /** The table's rows, each by its Owner cell's words. */
  const owners = () =>
    within(screen.getByRole('table', { name: 'Refresh schedules' }))
      .getAllByRole('row')
      .slice(1)
      .map((row) => text(within(row).getAllByRole('cell').at(-1)));

  it('counts each owner’s schedules, and lists only that owner’s when chosen', async () => {
    shownSchedules({
      wechart: [schedule(), schedule({ id: 'sched-2', name: 'Weekends' })],
    });
    await screen.findByText('Weekends', { selector: '[data-testid="wechart-schedule-name"]' });
    const filter = screen.getByRole('radiogroup', { name: 'Owner' });
    const keys = KEY_ROWS.length;
    expect(
      within(filter)
        .getAllByRole('radio')
        .map((radio) => [text(radio), radio.getAttribute('aria-checked')]),
    ).toEqual([
      [`All ${String(keys + 2)}`, 'true'],
      [`Cube’s refresh worker ${String(keys)}`, 'false'],
      ['wechart 2', 'false'],
    ]);
    expect(owners()).toHaveLength(keys + 2);

    await user().click(within(filter).getByRole('radio', { name: /^wechart/ }));
    expect(owners()).toEqual(['wechartby Wren Writer', 'wechartby Wren Writer']);

    await user().click(within(filter).getByRole('radio', { name: /^Cube’s refresh worker/ }));
    expect(owners()).toEqual(Array(keys).fill('Cube’s refresh worker'));

    await user().click(within(filter).getByRole('radio', { name: /^All/ }));
    expect(owners()).toHaveLength(keys + 2);
  });

  /** T557's review: one listed last, its rollup without a refresh key's row. */
  it('lists a wechart schedule of a rollup with no refresh key’s row only under All and wechart', async () => {
    shownSchedules({
      wechart: [schedule({ id: 'sched-3', name: 'Dropped', preAggregation: 'fgone__orders.gone' })],
    });
    await screen.findByText('Dropped', { selector: '[data-testid="wechart-schedule-name"]' });
    const filter = screen.getByRole('radiogroup', { name: 'Owner' });
    const named = () => screen.queryAllByTestId('wechart-schedule-name').map((each) => text(each));

    expect(named()).toEqual(['Dropped']);
    await user().click(within(filter).getByRole('radio', { name: /^Cube’s refresh worker/ }));
    expect([named(), owners()]).toEqual([[], Array(KEY_ROWS.length).fill('Cube’s refresh worker')]);
    await user().click(within(filter).getByRole('radio', { name: /^wechart/ }));
    expect([named(), owners()]).toEqual([['Dropped'], ['wechartby Wren Writer']]);
  });

  it('draws each owner with its icon, as its rows do', async () => {
    shownSchedules({ wechart: [schedule()] });
    await screen.findByText('Weekday mornings', {
      selector: '[data-testid="wechart-schedule-name"]',
    });
    const filter = screen.getByRole('radiogroup', { name: 'Owner' });
    expect(
      within(filter)
        .getAllByRole('radio')
        .map((radio) => radio.querySelector('svg')?.getAttribute('data-icon') ?? null),
    ).toEqual([null, 'cube', 'schedule']);
  });

  it('is a choice, not an input: the page still edits no schedule of Cube’s', async () => {
    shownSchedules({ wechart: [schedule()] });
    await screen.findByText('Weekday mornings', {
      selector: '[data-testid="wechart-schedule-name"]',
    });
    const filter = screen.getByRole('radiogroup', { name: 'Owner' });
    expect(filter.querySelectorAll('input, select, textarea')).toHaveLength(0);
    // One Tab stop, whose arrows move and choose, as a radio group's do (AC-176).
    const chosen = within(filter).getByRole('radio', { name: /^All/ });
    chosen.focus();
    await user().keyboard('{ArrowRight}');
    const cube = within(filter).getByRole('radio', { name: /^Cube’s refresh worker/ });
    expect([document.activeElement === cube, cube.getAttribute('aria-checked')]).toEqual([
      true,
      'true',
    ]);
  });
});

/**
 * T558 (AC-398; the user's answer, R66): a State pill, Any, Active, Paused
 * or Suspended, which Jobs' "1 suspended schedule" opens at
 * `?state=suspended`. A state is a wechart schedule's: one chosen lists
 * wechart's in that state only, and the owner filter counts what it lists.
 */
describe('Schedules’ State filter (T558, R66)', () => {
  const user = () => userEvent.setup({ delay: null });
  const named = () => screen.queryAllByTestId('wechart-schedule-name').map((each) => text(each));
  const listed = () =>
    within(screen.getByRole('table', { name: 'Refresh schedules' }))
      .getAllByRole('row')
      .slice(1);
  const THREE = [
    schedule({ id: 's-active', name: 'Running' }),
    paused({ id: 's-paused', name: 'Paused one' }),
    suspended({ id: 's-suspended', name: 'Suspended one' }),
  ];
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('opens at ?state=suspended on the suspended ones only, as many as Jobs’ summary counts', async () => {
    window.history.replaceState(null, '', '/schedules?state=suspended');
    shownSchedules({ wechart: THREE });
    await screen.findByText('Suspended one', {
      selector: '[data-testid="wechart-schedule-name"]',
    });

    const state = screen.getByRole('combobox', { name: 'State' }) as HTMLSelectElement;
    expect(state.value).toBe('suspended');
    expect(
      within(state)
        .getAllByRole('option')
        .map((option) => text(option)),
    ).toEqual(['Any', 'Active', 'Paused', 'Suspended']);
    expect(named()).toEqual(['Suspended one']);
    expect(listed()).toHaveLength(1);
    expect(listed().map((row) => row.getAttribute('data-schedule-id'))).toEqual(['s-suspended']);
    // The owner filter counts what is listed.
    expect(
      within(screen.getByRole('radiogroup', { name: 'Owner' }))
        .getAllByRole('radio')
        .map((radio) => text(radio)),
    ).toEqual(['All 1', 'Cube’s refresh worker 0', 'wechart 1']);
  });

  /** T611 (AC-399; design 16, pin 13): Jobs' "Also rebuilt by" opens a schedule at its address. */
  it('opens at ?schedule= on that schedule’s pane', async () => {
    window.history.replaceState(null, '', '/schedules?schedule=s-paused');
    shownSchedules({ wechart: THREE });

    const pane = await screen.findByRole('complementary', { name: 'Schedule details' });
    expect(text(await within(pane).findByRole('heading', { level: 2 }))).toBe('Paused one');
    expect(
      screen
        .getAllByRole('row')
        .find((row) => row.getAttribute('data-schedule-id') === 's-paused')
        ?.getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('gives the sheet opened at ?schedule= focus once its schedule is read, below 1,024 px (T611’s review)', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    window.history.replaceState(null, '', '/schedules?schedule=s-paused');
    shownSchedules({ wechart: THREE });

    const sheet = await screen.findByRole('dialog', { name: 'Schedule details' });
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(within(sheet).getByRole('heading', { level: 2 }));
    });
  });

  it('gives a suspended one’s sheet focus on Resume, as its pane opens (E1; T611’s review)', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    window.history.replaceState(null, '', '/schedules?schedule=s-suspended');
    shownSchedules({ wechart: THREE });

    const sheet = await screen.findByRole('dialog', { name: 'Schedule details' });
    const resume = await within(sheet).findByRole('button', { name: 'Resume' });
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(resume);
    });
  });

  it('opens nothing at ?schedule= for one that isn’t listed, as one that doesn’t exist (T611’s review)', async () => {
    window.history.replaceState(null, '', '/schedules?schedule=s-unknown');
    shownSchedules({ wechart: THREE });
    await screen.findByText('Running', { selector: '[data-testid="wechart-schedule-name"]' });

    expect(screen.queryAllByRole('complementary', { name: 'Schedule details' })).toHaveLength(0);
    // Nothing chosen: no row selected.
    expect(
      screen.getAllByRole('row').filter((row) => row.getAttribute('aria-selected') === 'true'),
    ).toHaveLength(0);
  });

  it('lists the active and the paused ones each by its own, and every one at Any', async () => {
    shownSchedules({ wechart: THREE });
    await screen.findByText('Running', { selector: '[data-testid="wechart-schedule-name"]' });
    const state = screen.getByRole('combobox', { name: 'State' });
    expect((state as HTMLSelectElement).value).toBe('');

    await user().selectOptions(state, 'Active');
    expect([named(), listed().length]).toEqual([['Running'], 1]);
    await user().selectOptions(state, 'Paused');
    expect([named(), listed().length]).toEqual([['Paused one'], 1]);
    await user().selectOptions(state, 'Any');
    expect(listed()).toHaveLength(KEY_ROWS.length + 3);
  });

  /** T558's review: as its row reads it, one paused and suspended is Suspended. */
  it('lists one both paused and suspended under Suspended, as its row reads, not Paused', async () => {
    shownSchedules({
      wechart: [
        suspended({
          id: 's-both',
          name: 'Both',
          pausedAt: '2026-10-02T11:00:00.000Z',
          pausedBy: { key: 'ada', name: 'Ada Admin' },
        }),
      ],
    });
    await screen.findByText('Both', { selector: '[data-testid="wechart-schedule-name"]' });
    const state = screen.getByRole('combobox', { name: 'State' });

    await user().selectOptions(state, 'Paused');
    expect(named()).toEqual([]);
    await user().selectOptions(state, 'Suspended');
    expect(named()).toEqual(['Both']);
  });
});

/**
 * T559 (AC-297, AC-399; design 16, screen 2 pin 3 and state H3): Schedules'
 * Folder filter, as every Jobs tab's: a member's folders, with Include
 * subfolders; and the scope note for a member, none for a Super-Admin. The
 * owner filter counts what the folder lists (AC-397).
 */
describe('Schedules’ Folder filter and scope note (T559, AC-297)', () => {
  const user = () => userEvent.setup({ delay: null });
  const named = () => screen.queryAllByTestId('wechart-schedule-name').map((each) => text(each));
  const listed = () =>
    within(screen.getByRole('table', { name: 'Refresh schedules' }))
      .getAllByRole('row')
      .slice(1);
  const counts = () =>
    within(screen.getByRole('radiogroup', { name: 'Owner' }))
      .getAllByRole('radio')
      .map((radio) => text(radio));
  const inEmea = schedule({
    id: 's-emea',
    name: 'EMEA mornings',
    preAggregation: 'femea__orders.daily',
    folderId: 'emea',
    folderPath: ['Shared', 'Sales', 'EMEA'],
  });

  it('says a member’s Schedules shows their folders; a Super-Admin’s says nothing', async () => {
    shownSchedules({ wechart: [schedule()] });
    expect(text(await screen.findByRole('note', { name: 'Scope' }))).toBe(
      'Showing schedules of pre-aggregations in the folders where you have read-write access.',
    );
  });

  it('has no scope note for a Super-Admin, whose Folder filter offers All folders', async () => {
    shownSchedules({
      wechart: [schedule()],
      folders: { everyFolder: true, folders: [{ id: 'root', path: ['Shared'], parentId: null }] },
    });
    await screen.findByText('Weekday mornings', {
      selector: '[data-testid="wechart-schedule-name"]',
    });
    await vi.waitFor(() => {
      expect(
        within(screen.getByRole('combobox', { name: 'Folder' }))
          .getAllByRole('option')
          .map((option) => text(option)),
        // The root a step in under All folders, as H2 draws it (T610).
      ).toEqual(['All folders', '   Shared · the root']);
    });
    expect(screen.queryByRole('note', { name: 'Scope' })).toBeNull();
  });

  it('lists a folder’s schedules, and with Include subfolders those below, the owner filter counting them', async () => {
    shownSchedules({ wechart: [schedule(), inEmea] });
    await screen.findByText('EMEA mornings', {
      selector: '[data-testid="wechart-schedule-name"]',
    });
    const folder = screen.getByRole('combobox', { name: 'Folder' });
    await vi.waitFor(() => {
      expect(
        within(folder)
          .getAllByRole('option')
          .map((option) => text(option)),
        // The member's paths, indented by depth below their top folder (H2; T610).
      ).toEqual(['All of mine', '   Sales', '      Sales / EMEA']);
    });

    await user().selectOptions(folder, 'emea');
    expect([named(), listed().length]).toEqual([['EMEA mornings'], 1]);
    expect(counts()).toEqual(['All 1', 'Cube’s refresh worker 0', 'wechart 1']);

    await user().selectOptions(folder, 'sales');
    expect([named(), listed().length]).toEqual([['Weekday mornings'], KEY_ROWS.length + 1]);
    await user().click(screen.getByRole('checkbox', { name: 'Include subfolders' }));
    expect([named(), listed().length]).toEqual([
      ['Weekday mornings', 'EMEA mornings'],
      KEY_ROWS.length + 2,
    ]);
    expect(counts()).toEqual([
      `All ${String(KEY_ROWS.length + 2)}`,
      `Cube’s refresh worker ${String(KEY_ROWS.length)}`,
      'wechart 2',
    ]);
  });
});

/**
 * T560 (AC-399; design 16, state G): Schedules in every state design 16
 * draws for Jobs, with its own words: loading as skeleton rows; an error
 * with Retry and Details; empty in the user's folders; and access lost
 * while open, the lists read again, the pane closed, and it said.
 */
describe('Schedules’ states (T560, AC-399)', () => {
  const user = () => userEvent.setup({ delay: null });

  it('draws skeleton rows while the schedules are read (G1)', async () => {
    shownSchedules({ pending: true });

    await vi.waitFor(() => {
      expect(screen.getByTestId('skeleton-rows').children.length).toBeGreaterThanOrEqual(3);
    });
    expect(text(screen.getByTestId('reading'))).toBe('Reading the schedules…');
  });

  it('says the schedules couldn’t be read, with Retry and Details (G2)', async () => {
    const { sent } = shownSchedules({ failing: ['keys'] });

    const said = await screen.findByRole('alert');
    expect(text(within(said).getByTestId('read-error'))).toBe('Couldn’t read the schedules.');
    expect(text(said)).toContain('Cube didn’t answer.');
    expect(text(within(said).getByText('Details'))).toBe('Details');
    const reads = () => sent.filter((each) => each.url === '/api/schedules').length;
    const before = reads();
    await user().click(within(said).getByRole('button', { name: 'Retry' }));
    await vi.waitFor(() => {
      expect(reads()).toBeGreaterThan(before);
    });
  });

  it('says no pre-aggregation is in their folders when there are none (G3)', async () => {
    shownSchedules({ keys: [] });

    const empty = await screen.findByTestId('list-empty');
    expect(text(empty)).toBe(
      'No pre-aggregations in your foldersNone of the models in the folders where you have read-write access defines one yet. Add one to a model in My workspace and propose it.',
    );
  });

  it('reads the lists again when an action finds access lost, closes the pane, and says so (G5)', async () => {
    const { sent } = shownSchedules({ wechart: [schedule()], accessLost: true });
    await user().click(await screen.findByText('Weekday mornings', { selector: 'b' }));
    const pane = paneOf();
    const reads = () => sent.filter((each) => each.url === '/api/wechart-schedules').length;
    const before = reads();

    await user().click(within(pane).getByRole('button', { name: 'Run now' }));

    const toast = await screen.findByText('You no longer have access to do this.');
    expect(text(toast)).toBe('You no longer have access to do this.');
    // An error, with its icon (T560's review).
    expect(toast.closest('[role="status"]')?.querySelector('svg')?.getAttribute('data-icon')).toBe(
      'err',
    );
    expect(reads()).toBeGreaterThan(before);
    await vi.waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'Schedule details' })).toBeNull();
    });
    // Its row went with it: focus goes to the list's New schedule, docked (T640; rule 85; T611's e2e).
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New schedule' }));
    });
  });

  it('says it when a row’s switch finds its schedule gone, another’s pane left open (G5)', async () => {
    const other = schedule({ id: 'sched-2', name: 'Weekends' });
    shownSchedules({ wechart: [schedule(), other], accessLost: ['sched-2'] });
    await user().click(await screen.findByText('Weekday mornings', { selector: 'b' }));
    const weekends = (
      await screen.findByText('Weekends', { selector: '[data-testid="wechart-schedule-name"]' })
    ).closest('tr') as HTMLElement;

    await user().click(within(weekends).getByRole('switch', { name: 'On: Weekends' }));

    expect(text(await screen.findByText('You no longer have access to do this.'))).toBe(
      'You no longer have access to do this.',
    );
    // Its own pane stays: Weekday mornings is still theirs.
    expect(text(within(paneOf()).getByRole('heading', { level: 2 }))).toBe('Weekday mornings');
  });

  it('says nothing of access when an action is refused and its schedule is still listed (G4)', async () => {
    const { sent } = shownSchedules({ wechart: [schedule()], forbidden: true });
    await user().click(await screen.findByText('Weekday mornings', { selector: 'b' }));
    const reads = () => sent.filter((each) => each.url === '/api/wechart-schedules').length;
    const before = reads();

    await user().click(within(paneOf()).getByRole('button', { name: 'Run now' }));

    await vi.waitFor(() => {
      expect(reads()).toBeGreaterThan(before);
    });
    expect(screen.queryByText('You no longer have access to do this.')).toBeNull();
    expect(text(within(paneOf()).getByRole('heading', { level: 2 }))).toBe('Weekday mornings');
  });
});

/** T552 (design 16, screen 2 pins 5–8 and states D1, D6). */
describe('Schedules’ wechart rows (T552, AC-154, AC-234)', () => {
  const user = () => userEvent.setup({ delay: null });
  const wechartRow = async (name: string) =>
    (await screen.findByText(name, { selector: '[data-testid="wechart-schedule-name"]' })).closest(
      'tr',
    ) as HTMLElement;

  it('lists a rollup with both kinds of schedule as two rows: wechart’s names who made it, with how its last run ended', async () => {
    shownSchedules({ wechart: [schedule()] });
    const row = await wechartRow('Weekday mornings');

    const rows = screen
      .getAllByRole('row')
      .filter((each) => text(each).startsWith('orders.mornings'));
    expect(rows).toHaveLength(2);
    // Cube's first, then wechart's.
    expect(rows[1]).toBe(row);
    expect(text(cell(row, 'Folder'))).toBe('Sales');
    expect(text(cell(row, 'Schedule'))).toBe(
      'Weekday mornings · At 07:55, Monday to Friday.55 7 * * 1-5 · Europe/Berlin',
    );
    expect(text(cell(row, 'Next run'))).toBe('Mon 5 Oct, 07:5505:55 UTC · in 3 days');
    const last = cell(row, 'Last run');
    expect(text(last)).toMatch(/^DoneToday \d{2}:\d{2}$/);
    expect(last.querySelector('[data-state="done"]')).not.toBeNull();
    const owner = cell(row, 'Owner');
    expect(text(owner)).toBe('wechartby Wren Writer');
    expect(owner.querySelector('svg')?.getAttribute('data-icon')).toBe('schedule');
  });

  /** T611 (AC-399; design 16's keyboard table, "A row in a list"). */
  it('names each row by a button read as the row is, and ↑ ↓ go from row to row', async () => {
    shownSchedules({ wechart: [schedule()] });
    const own = await wechartRow('Weekday mornings');
    const key = own.previousElementSibling as HTMLElement;

    const keyName = within(key).getByRole('button', {
      name: 'orders.mornings, Sales, Daily at 08:00, Los Angeles, Cube’s refresh worker',
    });
    const ownName = within(own).getByRole('button', {
      name: 'orders.mornings, Sales, Weekday mornings, Active, wechart',
    });
    // The rows themselves are no stops of their own: their names are.
    expect([key.hasAttribute('tabindex'), own.hasAttribute('tabindex')]).toEqual([false, false]);
    keyName.focus();
    await user().keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(ownName);
    await user().keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(keyName);
    await user().keyboard('{Enter}');
    expect(key.getAttribute('aria-selected')).toBe('true');
  });

  it('applies a change at once, with no proposal', async () => {
    const { sent } = shownSchedules({ wechart: [schedule()] });
    await user().click(await wechartRow('Weekday mornings'));
    const pane = paneOf();
    const cron = within(pane).getByRole('textbox', { name: 'Cron expression' });

    await user().clear(cron);
    await user().type(cron, '0 6 * * *');
    const save = within(pane).getByRole('button', { name: 'Save changes' }) as HTMLButtonElement;
    await waitFor(() => {
      expect(save.disabled).toBe(false);
    });
    await user().click(save);

    await waitFor(() => {
      expect(sent.filter((each) => each.method === 'PUT')).toEqual([
        {
          method: 'PUT',
          url: '/api/wechart-schedules/sched-1',
          body: {
            preAggregation: 'fsales__orders.mornings',
            name: 'Weekday mornings',
            cron: '0 6 * * *',
            timezone: 'Europe/Berlin',
            missed: 'once',
            suspendAfter: 3,
          },
        },
      ]);
    });
    // The list read again: its row as changed.
    await waitFor(async () => {
      expect(text(cell(await wechartRow('Weekday mornings'), 'Schedule'))).toContain(
        '0 6 * * * · Europe/Berlin',
      );
    });
  });

  it('asks before a delete, ending “You can’t undo this.”, with Cancel focused, then deletes it at once', async () => {
    const { sent } = shownSchedules({ wechart: [schedule()] });
    await user().click(await wechartRow('Weekday mornings'));

    await user().click(within(paneOf()).getByRole('button', { name: 'Delete…' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Delete “Weekday mornings”?' });
    expect(
      within(dialog)
        .getAllByRole('paragraph')
        .map((each) => text(each)),
    ).toEqual([
      'Its runs stop. The builds it started stay in Run history. orders.mornings keeps its refresh key, which Cube’s refresh worker runs.',
      'You can’t undo this.',
    ]);
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    // A plain Cancel with the focus ring, its one primary the destructive one (D6; T611).
    expect(within(dialog).getByRole('button', { name: 'Cancel' }).className).toBe('btn');

    await user().click(within(dialog).getByRole('button', { name: 'Delete schedule' }));

    await waitFor(() => {
      expect(sent.filter((each) => each.method === 'DELETE')).toEqual([
        { method: 'DELETE', url: '/api/wechart-schedules/sched-1' },
      ]);
    });
    await waitFor(() => {
      expect(
        screen.queryAllByText('Weekday mornings', {
          selector: '[data-testid="wechart-schedule-name"]',
        }),
      ).toHaveLength(0);
    });
    expect(screen.queryAllByRole('alertdialog')).toHaveLength(0);
    expect(screen.queryAllByRole('complementary', { name: 'Schedule details' })).toHaveLength(0);
  });

  it('says what goes when the rollup’s refresh key isn’t scheduled: nothing rebuilds it', async () => {
    shownSchedules({
      wechart: [schedule({ preAggregation: 'fsales__orders.on_demand' })],
    });
    await user().click(await wechartRow('Weekday mornings'));
    await user().click(within(paneOf()).getByRole('button', { name: 'Delete…' }));

    const dialog = screen.getByRole('alertdialog');
    expect(text(within(dialog).getAllByRole('paragraph')[0])).toBe(
      'Its runs stop. The builds it started stay in Run history. orders.on_demand keeps its refresh key, which is Not scheduled, so nothing will rebuild it until someone builds it or schedules it again.',
    );
  });

  it('puts focus back on Delete… when the question is cancelled, deleting nothing (T552’s review)', async () => {
    const { sent } = shownSchedules({ wechart: [schedule()] });
    await user().click(await wechartRow('Weekday mornings'));
    const remove = within(paneOf()).getByRole('button', { name: 'Delete…' });
    await user().click(remove);

    await user().click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
    );

    expect(screen.queryAllByRole('alertdialog')).toHaveLength(0);
    expect(document.activeElement).toBe(remove);
    expect(sent.filter((each) => each.method === 'DELETE')).toEqual([]);
  });

  it('says when wechart’s schedules can’t be read, the refresh keys listed still (T552’s review)', async () => {
    shownSchedules({ wechart: [schedule()], failing: ['wechart'] });

    expect(text(await screen.findByText('wechart’s schedules could not be read.'))).toBe(
      'wechart’s schedules could not be read.',
    );
    expect(text(await rowOf('orders.mornings'))).toContain('Daily at 08:00, Los Angeles');
  });

  it('lists wechart’s schedules, and offers New schedule, when the refresh keys can’t be read (T552’s review)', async () => {
    shownSchedules({ wechart: [schedule()], failing: ['keys'] });

    expect(text(await screen.findByText('Cube didn’t answer.'))).toBe('Cube didn’t answer.');
    const row = await wechartRow('Weekday mornings');
    expect(text(cell(row, 'Owner'))).toBe('wechartby Wren Writer');
    expect(screen.getAllByRole('button', { name: 'New schedule' })).toHaveLength(1);
  });
});

/** T551's review. */
describe('Schedules, as Cube runs them (T551’s review)', () => {
  it('stops a key’s runs at its zone’s clock change, in the row and the pane, by AC-153’s rule', async () => {
    // Sat 31 Oct, after that day's 08:00 in Los Angeles: the next is after the change.
    shown('2026-10-31T16:00:00Z');
    const row = await rowOf('orders.mornings');

    expect(text(cell(row, 'Next run'))).toBe('After the clocks change on Sun 1 Nov');
    await userEvent.click(row);
    const pane = screen.getByRole('complementary', { name: 'Schedule details' });
    expect(within(pane).queryAllByRole('list', { name: 'Next runs' })).toHaveLength(0);
    expect(text(within(pane).getByTestId('schedule-clock-change'))).toBe(
      'The clocks go back on Sun 1 Nov. Cube may run this key an hour off after that, until it next compiles the model, so later runs aren’t listed.',
    );
  });

  it('gives the lateness the API gives: the hourly fallback’s is under a minute', async () => {
    shown();
    await userEvent.click(await rowOf('orders.plain'));

    const pane = screen.getByRole('complementary', { name: 'Schedule details' });
    expect(text(within(pane).getByText(/can start up to about/))).toBe(
      'Cube’s refresh worker checks the key on its own cadence, so a run can start up to about 40 seconds after its time.',
    );
  });

  it('offers no Open in Jobs for a cube that isn’t public, which Jobs doesn’t list, and says why', async () => {
    shown();
    await userEvent.click(await rowOf('orders.on_demand'));

    const pane = screen.getByRole('complementary', { name: 'Schedule details' });
    expect(within(pane).queryAllByRole('link', { name: 'Open in Jobs' })).toHaveLength(0);
    expect(text(within(pane).getByTestId('schedule-not-in-jobs'))).toBe(
      'Its cube isn’t public, so Jobs doesn’t list it.',
    );
    // With no link of its own either, no empty bar is pinned at the sheet's foot (T610's review).
    expect(within(pane).queryAllByRole('link', { name: 'Open in Model' })).toHaveLength(0);
    expect(pane.querySelectorAll('.admin-pane__actions')).toHaveLength(0);
  });

  it('says why Cube can’t run a key, in the words the model editor uses', async () => {
    shown(undefined, [
      {
        ...ROWS[1],
        id: 'orders.odd',
        name: 'odd',
        kind: 'unrunnable',
        when: '"55 7 * * 1-5", which Cube’s refresh worker can’t run',
        written: 'every: "55 7 * * 1-5"',
        problem: 'Cube’s refresh worker can’t run "55 7 * * 1-5": no ranges.',
        runs: undefined,
        lagSeconds: undefined,
      },
    ]);
    await userEvent.click(await rowOf('orders.odd'));

    const pane = screen.getByRole('complementary', { name: 'Schedule details' });
    expect(text(within(pane).getByRole('alert'))).toBe(
      'Cube’s refresh worker can’t run "55 7 * * 1-5": no ranges.',
    );
  });
});
