import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    // Read-only: nothing on the page edits a schedule.
    expect(document.querySelectorAll('main input, input, select, textarea')).toHaveLength(0);
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
