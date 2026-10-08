import { describe, expect, it, vi } from 'vitest';

import { clockTimeOf, dataAsOf, lagWords } from './dataAsOf';

/**
 * T273 / AC-245: WHEN the user opens the tile menu's Data as of submenu, THE
 * SYSTEM SHALL show, for an answer a pre-aggregation served, its name, its
 * last build, its refresh schedule in words and as written, and its next run
 * with how late it may start, with Refresh now, Open in Jobs on that
 * pre-aggregation and Edit schedule in Model; and, for an answer the database
 * served, say so, with Refresh now and Why not accelerated.
 * `Fails when: one of those items is missing, Open in Jobs does not select
 * that pre-aggregation, or a database answer is described as a
 * pre-aggregation's.`
 *
 * The submenu's words and actions; the e2e shows them on a tile.
 */
const NOW = new Date('2026-09-25T09:20:00Z');
const at = (iso: string) => new Date(iso);
const words = (entries: { kind: string; label?: string | undefined; text?: string }[]) =>
  entries.map((each) => each.text ?? each.label ?? `(${each.kind})`);

describe('what Data as of says', () => {
  it('names the pre-aggregation, its build, its schedule both ways, and its next run with its lateness', () => {
    const opened: string[] = [];
    const said = dataAsOf(
      {
        answered: {
          lastRefreshTime: '2026-09-25T09:15:00.000Z',
          usedPreAggregations: {
            'prod.monthly_orders_by_status_month': {
              preAggregationId: 'monthly_orders.by_status_month',
              lastUpdatedAt: at('2026-09-25T09:15:00Z').getTime(),
              type: 'rollup',
            },
          },
        },
        schedules: [
          {
            id: 'monthly_orders.by_status_month',
            cube: 'monthly_orders',
            fileName: 'cubes/monthly_orders.yml',
            when: 'Every 1 hour',
            every: '1 hour',
          },
        ],
        onRefresh: vi.fn(),
        onWhyNot: vi.fn(),
        onOpen: (href) => {
          opened.push(href);
        },
      },
      NOW,
      (date) => date.toISOString().slice(11, 16),
    );

    expect(said?.label).toBe('Data as of 09:15');
    expect(words(said?.entries ?? [])).toEqual([
      'Pre-aggregation monthly_orders.by_status_month',
      'Last built 09:15',
      'Refreshed every 1 hour',
      'As written: every: "1 hour"',
      'Next run 10:00, may start up to 5½ min late',
      '(separator)',
      'Refresh now',
      'Open in Jobs',
      'Edit schedule in Model',
    ]);
    for (const entry of said?.entries ?? [])
      if (entry.kind === 'item' && entry.label !== 'Refresh now') entry.onSelect();
    expect(opened).toEqual([
      '/jobs?preagg=monthly_orders.by_status_month',
      '/model/files/cubes%2Fmonthly_orders.yml?cube=monthly_orders&tab=pre_aggregations',
    ]);
  });

  // T530 (AC-222): a folder's rollup's schedule opens in its own folder's file.
  it('opens a folder rollup’s schedule in its folder’s file, by its short name', () => {
    const opened: string[] = [];
    const said = dataAsOf(
      {
        answered: {
          usedPreAggregations: {
            'prod.fsales__orders_main': {
              preAggregationId: 'fsales__orders.main',
              lastUpdatedAt: at('2026-09-25T09:15:00Z').getTime(),
              type: 'rollup',
            },
          },
        },
        schedules: [
          {
            id: 'fsales__orders.main',
            cube: 'fsales__orders',
            shortName: 'orders',
            mayOpen: true,
            fileName: 'cubes/orders.yml',
            fileFolderId: 'sales',
            when: 'Every 1 hour',
            every: '1 hour',
          },
        ],
        onRefresh: vi.fn(),
        onWhyNot: vi.fn(),
        onOpen: (href) => {
          opened.push(href);
        },
      },
      NOW,
      (date) => date.toISOString().slice(11, 16),
    );
    const edit = (said?.entries ?? []).find(
      (entry) => entry.kind === 'item' && entry.label === 'Edit schedule in Model',
    );
    if (edit?.kind === 'item') edit.onSelect();
    expect(opened).toEqual([
      '/explore/folders/sales/models/cubes%2Forders.yml?cube=orders&tab=pre_aggregations',
    ]);
  });

  it('says a database answer is the database’s, with Refresh now and Why not accelerated', () => {
    const said = dataAsOf(
      {
        answered: { lastRefreshTime: '2026-09-25T09:19:00.000Z' },
        schedules: [],
        onRefresh: vi.fn(),
        onWhyNot: vi.fn(),
        onOpen: vi.fn(),
      },
      NOW,
      (date) => date.toISOString().slice(11, 16),
      (date) => `Today ${date.toISOString().slice(11, 19)}`,
    );

    expect(said?.label).toBe('Data as of 09:19');
    // The footer's second line (design 08, state D; T681, DSH-21).
    expect(said?.detail).toBe('Live · from the database');
    expect(said?.served).toBe('live');
    // State D: its heading, then the time to the second, when Cube answered,
    // which a keyboard reaches (AC-148 with design 04 note 4; T681).
    expect(words(said?.entries ?? [])).toEqual([
      'Answered by the database',
      '(separator)',
      'Today 09:19:00',
      '(separator)',
      'Refresh now',
      'Why not accelerated?',
    ]);
    expect(said?.entries[0]).toEqual({
      kind: 'text',
      key: 'database',
      text: 'Answered by the database',
      heading: true,
      dot: true,
      sub: 'No pre-aggregation matched this chart’s query.',
    });
    expect(said?.entries[2]).toEqual({
      kind: 'text',
      key: 'as-of',
      term: 'Data as of',
      text: 'Today 09:19:00',
      sub: 'when Cube answered',
      dateTime: '2026-09-25T09:19:00.000Z',
    });
  });

  it('says no time where Cube’s isn’t one, rather than fail or say NaN (T681’s review)', () => {
    const said = dataAsOf(
      {
        answered: { lastRefreshTime: 'not a time' },
        schedules: [],
        onRefresh: vi.fn(),
        onWhyNot: vi.fn(),
        onOpen: vi.fn(),
      },
      NOW,
    );
    expect(said).toBeUndefined();
  });

  it('says a pre-aggregation’s schedule on the footer’s second line, where it is known (T681)', () => {
    const said = dataAsOf(
      {
        answered: {
          usedPreAggregations: { t: { preAggregationId: 'a.b', lastUpdatedAt: NOW.getTime() } },
        },
        schedules: [{ id: 'a.b', cube: 'a', when: 'Every 1 hour', every: '1 hour' }],
        onRefresh: vi.fn(),
        onWhyNot: vi.fn(),
        onOpen: vi.fn(),
      },
      NOW,
      (date) => date.toISOString().slice(11, 16),
    );
    expect(said?.detail).toBe('Pre-aggregation · every 1 hour');
    expect(said?.served).toBe('pre-aggregation');
    const unknown = dataAsOf(
      {
        answered: {
          usedPreAggregations: { t: { preAggregationId: 'a.b', lastUpdatedAt: NOW.getTime() } },
        },
        schedules: 'loading',
        onRefresh: vi.fn(),
        onWhyNot: vi.fn(),
        onOpen: vi.fn(),
      },
      NOW,
      (date) => date.toISOString().slice(11, 16),
    );
    expect(unknown?.detail).toBe('Pre-aggregation');
  });

  it('says so when a pre-aggregation’s schedule cannot be read, rather than guess one', () => {
    const said = dataAsOf(
      {
        answered: {
          usedPreAggregations: { t: { preAggregationId: 'a.b', lastUpdatedAt: NOW.getTime() } },
        },
        // Asked and not answered (T273's review: undefined is "still reading").
        schedules: 'failed',
        onRefresh: vi.fn(),
        onWhyNot: vi.fn(),
        onOpen: vi.fn(),
      },
      NOW,
      (date) => date.toISOString().slice(11, 16),
    );
    expect(words(said?.entries ?? [])).toEqual([
      'Pre-aggregation a.b',
      'Last built 09:20',
      'Its schedule could not be read.',
      '(separator)',
      'Refresh now',
      'Open in Jobs',
    ]);
  });

  it('offers nothing before there is an answer to date', () => {
    expect(
      dataAsOf(
        {
          answered: undefined,
          schedules: [],
          onRefresh: vi.fn(),
          onWhyNot: vi.fn(),
          onOpen: vi.fn(),
        },
        NOW,
      ),
    ).toBeUndefined();
  });
});

describe('how late a run may start, in words', () => {
  it('is seconds under a minute, and minutes to the half above it, as an "up to" is', () => {
    expect(lagWords(40)).toBe('40 s');
    expect(lagWords(330)).toBe('5½ min');
    expect(lagWords(300)).toBe('5 min');
    // T273's review: rounded down, "up to" undersold it.
    expect(lagWords(72)).toBe('1½ min');
    expect(lagWords(108)).toBe('2 min');
  });
});

/** T273's review: what the submenu said wrongly, or not at all. */
describe('what Data as of says, as reviewed', () => {
  const answered = {
    usedPreAggregations: {
      t: { preAggregationId: 'a.b', lastUpdatedAt: '2026-09-25T09:15:00.000Z' },
    },
  };
  const base = {
    answered,
    onRefresh: vi.fn(),
    onWhyNot: vi.fn(),
    onOpen: vi.fn(),
  };
  const time = (date: Date) => date.toISOString().slice(11, 16);

  it('says a key with SQL is checked, not rebuilt, on its interval, and foretells no run', () => {
    const said = dataAsOf(
      {
        ...base,
        schedules: [
          {
            id: 'a.b',
            cube: 'a',
            every: '1 hour',
            sql: 'SELECT MAX(updated_at) FROM orders',
            when: 'When its SQL returns a new value, checked every 1 hour',
          },
        ],
      },
      NOW,
      time,
    );
    expect(words(said?.entries ?? []).slice(1, 5)).toEqual([
      // Built at, from a `lastUpdatedAt` given as an ISO string (pre-aggregations.md).
      'Last built 09:15',
      'Refreshed when its SQL returns a new value, checked every 1 hour',
      'As written: sql: "SELECT MAX(updated_at) FROM orders", every: "1 hour"',
      'Next run: when its SQL returns a new value, so not foretold',
    ]);
  });

  it('says what is not scheduled without "Refreshed" in front of it', () => {
    const said = dataAsOf(
      {
        ...base,
        schedules: [
          { id: 'a.b', cube: 'a', when: 'Not scheduled: built only when asked for, from Jobs' },
        ],
      },
      NOW,
      time,
    );
    expect(words(said?.entries ?? [])).toContain(
      'Not scheduled: built only when asked for, from Jobs',
    );
  });

  /** T551: the API's words are Schedules' now; a cron's start "Daily", "Hourly" or "At". */
  it('says "Refreshed" before a cron’s words as before an interval’s, and not before a default’s', () => {
    const saidOf = (when: string) =>
      words(
        dataAsOf({ ...base, schedules: [{ id: 'a.b', cube: 'a', when }] }, NOW, time)?.entries ??
          [],
      );
    expect(saidOf('Daily at 08:00, Los Angeles')).toContain(
      'Refreshed daily at 08:00, Los Angeles',
    );
    expect(saidOf('Hourly at :15')).toContain('Refreshed hourly at :15');
    expect(saidOf('At 07:00 every Monday, Berlin')).toContain(
      'Refreshed at 07:00 every Monday, Berlin',
    );
    expect(saidOf('Every hour')).toContain('Refreshed every hour');
    expect(saidOf('Cube’s default: every hour')).toContain('Cube’s default: every hour');
    expect(saidOf('Not scheduled')).toContain('Not scheduled');
  });

  it('says it is reading the schedule while it is, rather than that it could not', () => {
    const said = dataAsOf({ ...base, schedules: 'loading' }, NOW, time);
    expect(words(said?.entries ?? [])).toContain('Reading its schedule…');
  });

  it('offers Refresh now off, with why, where the tile’s own ↻ is off, and runs it where it is not', () => {
    const blocked = dataAsOf(
      { ...base, schedules: [], refreshBlocked: 'Its newest answer is still on its way.' },
      NOW,
      time,
    );
    expect(blocked?.entries.find((each) => each.key === 'refresh')).toMatchObject({
      kind: 'item',
      disabled: 'Its newest answer is still on its way.',
    });

    const onRefresh = vi.fn();
    const open = dataAsOf({ ...base, onRefresh, schedules: [] }, NOW, time);
    const refresh = open?.entries.find((each) => each.key === 'refresh');
    if (refresh?.kind === 'item') refresh.onSelect();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('Data as of for one who may not use Jobs (T371; R42.7)', () => {
  it('says the freshness of a folder’s rollup by its short name, and offers no way into Jobs or Model', () => {
    const said = dataAsOf(
      {
        answered: {
          lastRefreshTime: '2026-09-25T09:15:00.000Z',
          usedPreAggregations: {
            'prod.fa1__sales_main': {
              preAggregationId: 'fa1__sales.main',
              lastUpdatedAt: at('2026-09-25T09:15:00Z').getTime(),
              type: 'rollup',
            },
          },
        },
        // As `/api/schedules?seen=1` answers a reader: no file, key or SQL.
        schedules: [
          {
            id: 'fa1__sales.main',
            cube: 'fa1__sales',
            shortName: 'sales',
            when: 'Every 1 hour',
            mayOpen: false,
          },
        ],
        onRefresh: undefined,
        onWhyNot: () => undefined,
        onOpen: () => undefined,
      },
      NOW,
      (date) => clockTimeOf(date, NOW),
    )!;
    const shown = words(said.entries);
    expect(shown[0]).toBe('Pre-aggregation sales.main');
    expect(shown).not.toContain('Open in Jobs');
    expect(shown).not.toContain('Edit schedule in Model');
    expect(shown.join(' ')).not.toContain('fa1__');
  });
});

describe('a time as the menu says it', () => {
  it('is the clock alone today, and the day beside it otherwise', () => {
    const now = new Date(2026, 8, 25, 23, 30);
    expect(clockTimeOf(new Date(2026, 8, 25, 9, 15), now)).toBe('09:15');
    // "Sep", never "Sept", and no comma (T477; Q6, Q8).
    expect(clockTimeOf(new Date(2026, 8, 26, 0, 0), now)).toBe('26 Sep 00:00');
    // Yesterday's data says so, as the tile's badge does (T477's review, Q8).
    expect(clockTimeOf(new Date(2026, 8, 24, 22, 32), now)).toBe('Yesterday 22:32');
    expect(clockTimeOf(new Date(2026, 8, 20, 22, 32), now)).toBe('20 Sep 22:32');
  });
});
