import { describe, expect, it, vi } from 'vitest';

import { dataAsOf, lagWords } from './dataAsOf';

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
    );

    expect(said?.label).toBe('Data as of 09:19');
    expect(words(said?.entries ?? [])).toEqual([
      'Answered by the database, not a pre-aggregation',
      '(separator)',
      'Refresh now',
      'Why not accelerated?',
    ]);
  });

  it('says so when a pre-aggregation’s schedule cannot be read, rather than guess one', () => {
    const said = dataAsOf(
      {
        answered: {
          usedPreAggregations: { t: { preAggregationId: 'a.b', lastUpdatedAt: NOW.getTime() } },
        },
        schedules: undefined,
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
  it('is seconds under a minute, and minutes with a half past it', () => {
    expect(lagWords(40)).toBe('40 s');
    expect(lagWords(330)).toBe('5½ min');
    expect(lagWords(300)).toBe('5 min');
  });
});
