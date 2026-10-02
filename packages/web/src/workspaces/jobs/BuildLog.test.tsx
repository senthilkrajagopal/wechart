import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BuildLog, type BuildRecord } from './BuildLog';

/**
 * T374 / AC-150 (design 16, state B): a build's log in the pane — its
 * outcome, its partitions, its folder, who started it and how, when it ended
 * and how long it took, Cube's error, and each state Cube reported with its
 * token and the time wechart saw it.
 */
const record = (over: Partial<BuildRecord> = {}): BuildRecord => ({
  id: 'b-1',
  preAggregation: 'femea__orders_emea.by_month',
  name: 'orders_emea.by_month',
  folderId: 'emea',
  folderPath: ['Shared', 'Sales', 'EMEA'],
  partitions: ['2026-08-01T00:00:00.000'],
  granularity: 'month',
  via: 'rebuild-selected',
  starter: { kind: 'person', key: 'wren', name: 'Wren Writer' },
  requestId: 'wechart-1',
  startedAt: '2026-10-02T12:05:12.204Z',
  answeredAt: '2026-10-02T12:05:12.391Z',
  endedAt: '2026-10-02T12:05:53.117Z',
  durationMs: 40_913,
  outcome: 'failed',
  failedCount: 1,
  error: 'failure: canceling statement due to statement timeout',
  tokens: [
    {
      token: '9f2c41e0aa7d4b1c8e3f00ab12cda41e',
      status: 'failure: canceling statement due to statement timeout',
      table: 'prod_pre_aggregations.orders_emea_by_month20260801_abcdefgh_ijklmnop_1d4kq0',
      finished: true,
      finishedAt: '2026-10-02T12:05:53.117Z',
      log: [
        { at: '2026-10-02T12:05:13.902Z', status: 'scheduled' },
        {
          at: '2026-10-02T12:05:16.418Z',
          status: 'processing',
          table: 'prod_pre_aggregations.orders_emea_by_month20260801_abcdefgh_ijklmnop_1d4kq0',
        },
        {
          at: '2026-10-02T12:05:53.117Z',
          status: 'failure: canceling statement due to statement timeout',
        },
      ],
    },
  ],
  ...over,
});

function shown(answer: BuildRecord) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) =>
      String(input) === `/api/jobs/builds/${answer.id}`
        ? Response.json(answer)
        : Response.json({ error: 'There’s no build by that id in your folders.' }, { status: 404 }),
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BuildLog id={answer.id} onClose={() => undefined} />
    </QueryClientProvider>,
  );
}

/** A time as the pane gives it: the reader's own clock, to the millisecond in the log. */
const clock = (iso: string, ms = false) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...(ms ? { fractionalSecondDigits: 3 } : {}),
  });

const text = (element: Element | null | undefined) => element?.textContent ?? '';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a build’s log (T374, AC-150)', () => {
  it('says how it ended, what it built, where, who started it and how, and when it ended', async () => {
    shown(record());

    const pane = await screen.findByRole('complementary', {
      name: /Build of orders_emea\.by_month/,
    });
    const facts = within(pane).getByRole('group', { name: 'Build' });
    expect(text(within(facts).getByTestId('build-outcome'))).toBe('Failed');
    expect(text(facts)).toContain('Aug 2026 · UTC');
    expect(text(facts)).toContain('Shared / Sales / EMEA');
    expect(text(facts)).toContain(
      `${clock('2026-10-02T12:05:12.204Z')} by Wren Writer, with Rebuild selected in Jobs`,
    );
    expect(text(facts)).toContain(`${clock('2026-10-02T12:05:53.117Z')} · 41 s, as wechart saw it`);
    expect(text(within(pane).getByRole('region', { name: 'Cube’s error' }))).toContain(
      'failure: canceling statement due to statement timeout',
    );
  });

  it('lists each state Cube reported, with its token and the time wechart saw it', async () => {
    shown(record());

    const log = await screen.findByRole('region', {
      name: 'Log · what Cube reported, when wechart saw it',
    });
    const lines = within(log)
      .getAllByRole('listitem')
      .map((line) => line.textContent);
    expect(lines).toEqual([
      `${clock('2026-10-02T12:05:12.204Z', true)}Asked Cube to build Aug 2026`,
      `${clock('2026-10-02T12:05:12.391Z', true)}1 job · token 9f2c41e0…a41e`,
      `${clock('2026-10-02T12:05:13.902Z', true)}scheduled`,
      `${clock('2026-10-02T12:05:16.418Z', true)}processing · table …by_month20260801_abcd…`,
      `${clock('2026-10-02T12:05:53.117Z', true)}failure: canceling statement due to statement timeout`,
    ]);
    // The whole token is there to copy, not only its short form.
    expect(text(within(log).getByTitle('9f2c41e0aa7d4b1c8e3f00ab12cda41e'))).toBe(
      '1 job · token 9f2c41e0…a41e',
    );
  });

  it('lists every partition of one start, each with its state and token (B3)', async () => {
    const day = (n: number) => String(n).padStart(2, '0');
    const tokens = Array.from({ length: 30 }, (_, at) => ({
      token: `tok${day(at)}aaaaaaaaaaaaaaaaaaaaaaaaaaa`,
      status: at === 0 ? 'missing_partition' : at === 1 ? 'failure: boom' : 'done',
      table: `prod_pre_aggregations.dach_orders_daily202609${day(at + 1)}_aaaaaaaa_bbbbbbbb_1d4kq0`,
      finished: true,
      finishedAt: '2026-09-29T05:57:00.000Z',
      log: [],
    }));
    shown(
      record({
        name: 'dach.orders_daily',
        partitions: null,
        granularity: 'day',
        via: 'schedule',
        starter: { kind: 'schedule', id: 's-1', name: 'Weekday mornings' },
        failedCount: 2,
        tokens,
      }),
    );

    const parts = await screen.findByRole('table', { name: 'Partitions of this build' });
    const rows = within(parts).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(30);
    // Each partition's token, whole in its title.
    expect(text(within(rows[0]!).getByTitle(tokens[0]!.token))).toBe('tok00aaa…aaaa');
    expect(text(rows[0])).toContain('1 Sep 2026');
    expect(text(rows[0])).toContain('Missing partition');
    expect(text(rows[1])).toContain('Failed');
    expect(text(rows[2])).toContain('Done');
    const pane = screen.getByRole('complementary', { name: /Build of dach\.orders_daily/ });
    expect(text(within(pane).getByTestId('build-outcome'))).toBe('Failed · 2 of 30');
    expect(text(pane)).toContain('by Weekday mornings, a wechart schedule');
  });

  it('names each line’s job, by its partition or else its token, when the build made several', async () => {
    shown(
      record({
        partitions: null,
        tokens: [
          {
            token: 'aaaa1111000000000000000000002222',
            status: 'done',
            table: 'prod_pre_aggregations.orders_emea_by_month20260801_abcdefgh_ijklmnop_1d4kq0',
            finished: true,
            finishedAt: '2026-10-02T12:05:20.000Z',
            log: [{ at: '2026-10-02T12:05:20.000Z', status: 'done' }],
          },
          {
            // Cube knew it no more before telling its table.
            token: 'bbbb3333000000000000000000004444',
            status: 'not_found',
            table: null,
            finished: true,
            finishedAt: '2026-10-02T12:06:00.000Z',
            log: [{ at: '2026-10-02T12:06:00.000Z', status: 'not_found' }],
          },
        ],
      }),
    );

    const log = await screen.findByRole('region', {
      name: 'Log · what Cube reported, when wechart saw it',
    });
    const lines = within(log)
      .getAllByRole('listitem')
      .map((line) => line.textContent);
    expect(lines.at(-2)).toContain('Aug 2026: done');
    expect(lines.at(-1)).toContain('bbbb3333…4444: not_found');
  });

  it('names the gap when Cube’s record expired before wechart saw the end (B2)', async () => {
    shown(
      record({
        outcome: 'expired',
        failedCount: 0,
        error: null,
        // How it ended isn't known: no end, no duration (T372).
        endedAt: null,
        durationMs: null,
        tokens: [
          {
            token: '41aa00000000000000000000000007d02',
            status: 'not_found',
            table: null,
            finished: true,
            finishedAt: '2026-10-03T12:14:40.000Z',
            log: [
              { at: '2026-10-02T12:05:16.000Z', status: 'processing' },
              { at: '2026-10-03T12:14:40.000Z', status: 'not_found' },
            ],
          },
        ],
      }),
    );

    const pane = await screen.findByRole('complementary', { name: /Build of orders_emea/ });
    expect(text(within(pane).getByTestId('build-outcome'))).toBe('Cube’s record expired');
    const log = within(pane).getByRole('region', {
      name: 'Log · what Cube reported, when wechart saw it',
    });
    // The gap named, without claiming a cause wechart can't know.
    expect(text(log)).toContain('wechart didn’t see how it ended');
    // A day on: its date beside its time (B2).
    const lines = within(log).getAllByRole('listitem');
    const day = new Date('2026-10-03T12:14:40.000Z').toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
    expect(text(lines.at(-1))).toContain(`${day} ${clock('2026-10-03T12:14:40.000Z')}not_found`);
    expect(text(pane)).toContain(
      'Cube no longer knew this job when wechart asked again: it keeps a job’s record for 24 hours. How the build ended can’t be known, so it isn’t counted as Done or Failed.',
    );
    expect(within(pane).queryAllByRole('region', { name: 'Cube’s error' })).toHaveLength(0);
  });
});
