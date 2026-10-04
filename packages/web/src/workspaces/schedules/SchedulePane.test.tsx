import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  KEY_ROWS,
  localDay,
  paneOf,
  runsIn,
  schedule,
  shownSchedules,
  suspended,
  SUSPENDED_RUNS,
  text,
} from './schedules.fixture';

/**
 * T552 / AC-392, AC-234 (design 16, pin 12 and state D1): for a rollup whose
 * refresh key Cube's refresh worker runs, the form and a wechart schedule's
 * pane say that the key runs too and that both run; nothing offers
 * `scheduled_refresh: false`. A wechart schedule's pane: its state and next
 * run, what it builds, who made it and changed it, its last run, its
 * fields to change, and Delete.
 */
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const user = () => userEvent.setup({ delay: null });

/** The row of a wechart schedule, by its name. */
const wechartRow = async (name: string) =>
  (await screen.findByText(name, { selector: '[data-testid="wechart-schedule-name"]' })).closest(
    'tr',
  ) as HTMLElement;

describe('A refresh key that runs too (T552, AC-392)', () => {
  it('says in the form that the rollup’s refresh key runs too and both run, and offers no scheduled_refresh: false', async () => {
    shownSchedules();
    await user().click(await screen.findByRole('button', { name: 'New schedule' }));
    const pane = paneOf();
    const picker = within(pane).getByRole('combobox', { name: 'Pre-aggregation' });

    await user().selectOptions(picker, 'fsales__orders.mornings');

    expect(text(within(pane).getByTestId('refresh-key-runs'))).toBe(
      'Its refresh key also runs: Cube’s refresh worker rebuilds orders.mornings daily at 08:00, Los Angeles. Both run; this schedule adds builds.',
    );
    expect(text(pane)).not.toContain('scheduled_refresh');

    // One Cube's refresh worker never runs: nothing to say.
    await user().selectOptions(picker, 'fsales__orders.on_demand');
    expect(within(pane).queryAllByTestId('refresh-key-runs')).toHaveLength(0);
  });

  it('says it in a wechart schedule’s pane too, beside its state, what it builds, who made it and its last run (D1)', async () => {
    shownSchedules({ wechart: [schedule()] });
    await user().click(await wechartRow('Weekday mornings'));
    const pane = paneOf();

    expect(text(within(pane).getByRole('heading', { level: 2 }))).toBe('Weekday mornings');
    const facts = Object.fromEntries(
      within(pane)
        .getAllByRole('term')
        .map((term) => [text(term), text(term.nextElementSibling)]),
    );
    expect(facts['State']).toBe('Active · next Mon 5 Oct, 07:55');
    expect(facts['Builds']).toBe('orders.mornings · Sales');
    // The day it was made in the zone the tests run in: "2 Sep" in most (T552's review).
    expect(facts['Made by']).toMatch(
      new RegExp(
        `^Wren Writer, ${localDay(schedule().createdAt)} · changed yesterday \\d{2}:\\d{2}$`,
      ),
    );
    expect(facts['Last run']).toMatch(/^Done · today \d{2}:\d{2} · Run history$/);
    expect(within(pane).getByRole('link', { name: 'Run history' }).getAttribute('href')).toBe(
      '/jobs?tab=history&preagg=fsales__orders.mornings',
    );
    expect(text(within(pane).getByTestId('refresh-key-runs'))).toBe(
      'Its refresh key also runs: Cube’s refresh worker rebuilds orders.mornings daily at 08:00, Los Angeles. Both run; this schedule adds builds.',
    );
    expect(text(pane)).not.toContain('scheduled_refresh');
    // Its fields, as stored, to change; Save waits for a change.
    expect(
      (within(pane).getByRole('textbox', { name: 'Cron expression' }) as HTMLInputElement).value,
    ).toBe('55 7 * * 1-5');
    expect(
      (within(pane).getByRole('combobox', { name: 'Time zone' }) as HTMLInputElement).value,
    ).toBe('Europe/Berlin');
    await waitFor(() => {
      expect(runsIn(pane)).toHaveLength(5);
    });
    expect(
      (within(pane).getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('says Cube’s default as the hourly rebuild it is, and nothing of a key Cube can’t run (T552’s review)', async () => {
    const [mornings] = KEY_ROWS;
    shownSchedules({
      keys: [
        {
          ...mornings,
          kind: 'default',
          when: 'Cube’s default: every hour',
          runs: { every: '1 hour' },
        },
        {
          ...KEY_ROWS[1],
          kind: 'unrunnable',
          scheduled: true,
          when: '"0 * * * 1", which Cube’s refresh worker can’t run',
        },
      ],
    });
    await user().click(await screen.findByRole('button', { name: 'New schedule' }));
    const pane = paneOf();
    const picker = within(pane).getByRole('combobox', { name: 'Pre-aggregation' });

    await user().selectOptions(picker, 'fsales__orders.mornings');
    expect(text(within(pane).getByTestId('refresh-key-runs'))).toBe(
      'Its refresh key also runs: Cube’s refresh worker rebuilds orders.mornings on Cube’s default, every hour. Both run; this schedule adds builds.',
    );
    await user().selectOptions(picker, 'fsales__orders.on_demand');
    expect(within(pane).queryAllByTestId('refresh-key-runs')).toHaveLength(0);
  });
});

/** T379 / AC-155 (design 16, state E, screen 2 pin 7). */
describe('Suspended after its failed runs in a row, and Resume (T379, AC-155)', () => {
  /** A cell of a row, by its column's header. */
  const cellOf = (row: HTMLElement, column: string) => {
    const table = row.closest('table') as HTMLElement;
    const at = within(table)
      .getAllByRole('columnheader')
      .findIndex((header) => text(header) === column);
    return within(row).getAllByRole('cell')[at] as HTMLElement;
  };

  it('says on its row and pane it’s suspended after its failures, lists them with Cube’s last error, and offers Resume, focused', async () => {
    shownSchedules({ wechart: [suspended()], runs: SUSPENDED_RUNS });
    const row = await wechartRow('Weekday mornings');

    // Where its next run would be, with its icon: design 16's paused one (pin 7, s-susp).
    const next = cellOf(row, 'Next run');
    expect(text(next)).toBe('Suspended after 3 failures');
    expect(next.querySelector('[data-state="suspended"] svg')?.getAttribute('data-icon')).toBe(
      'susp',
    );

    await user().click(row);
    const pane = paneOf();
    expect(text(within(pane).getByTestId('suspended-note'))).toMatch(
      /^Suspended after 3 failed runs in a row, at \d{2}:\d{2}:\d{2} today\. It won’t run again until it’s resumed\.$/,
    );
    const resume = within(pane).getByRole('button', { name: 'Resume' });
    expect(document.activeElement).toBe(resume);
    expect(text(within(pane).getByTestId('resume-help'))).toBe(
      'Its next run would be Mon 5 Oct, 07:55. The count of failures starts again from 0.',
    );
    const failed = within(pane).getByRole('table', { name: 'The failed runs' });
    await waitFor(() => {
      expect(within(failed).getAllByRole('row')).toHaveLength(4);
    });
    expect(
      within(failed)
        .getAllByRole('row')
        .map((each) =>
          within(each)
            .getAllByRole('cell')
            .slice(1, 3)
            .map((cell) => text(cell)),
        ),
    ).toEqual([
      ['Failed', '3 of 3'],
      ['Failed', '2 of 3'],
      ['Failed', '1 of 3'],
      ['Done', ''],
    ]);
    expect(text(within(pane).getByTestId('last-error'))).toBe(
      'failure: Error: connect ETIMEDOUT 10.20.4.17:5432',
    );
  });

  it('counts the failures in a row on its row before its number (E2)', async () => {
    shownSchedules({ wechart: [schedule({ failuresInARow: 2 })] });
    const row = await wechartRow('Weekday mornings');

    expect(text(cellOf(row, 'Next run'))).toBe(
      'Mon 5 Oct, 07:5505:55 UTC · in 3 days2 failed in a row · suspends after 3',
    );
  });

  it('starts it again on Resume: active again, saying when it next runs (E3)', async () => {
    const { sent } = shownSchedules({ wechart: [suspended()], runs: SUSPENDED_RUNS });
    await user().click(await wechartRow('Weekday mornings'));

    await user().click(within(paneOf()).getByRole('button', { name: 'Resume' }));

    await waitFor(() => {
      expect(sent.filter((each) => each.method === 'POST')).toEqual([
        { method: 'POST', url: '/api/wechart-schedules/sched-1/resume' },
      ]);
    });
    expect(text(await within(paneOf()).findByRole('status'))).toBe(
      'Resumed “Weekday mornings”. Its next run is Mon 5 Oct, 07:55.',
    );
    const facts = within(paneOf()).getAllByRole('term');
    expect(text(facts.find((term) => text(term) === 'State')?.nextElementSibling)).toBe(
      'Active · next Mon 5 Oct, 07:55',
    );
    // Focus stays on its row (design 16's keyboard table).
    expect(document.activeElement).toBe(await wechartRow('Weekday mornings'));
  });

  it('moves no focus to Resume when a schedule open in the pane is suspended by a refresh (T379’s review)', async () => {
    const { listedLater } = shownSchedules({ wechart: [schedule()], runs: SUSPENDED_RUNS });
    await user().click(await wechartRow('Weekday mornings'));
    const name = within(paneOf()).getByRole('textbox', { name: /^Name/ });
    name.focus();

    await listedLater([suspended()]);

    const resume = await within(paneOf()).findByRole('button', { name: 'Resume' });
    expect(text(resume)).toBe('Resume');
    expect(document.activeElement).toBe(name);
  });

  it('says a resume on its own schedule’s pane only (T379’s review)', async () => {
    shownSchedules({
      wechart: [suspended(), schedule({ id: 'sched-2', name: 'Month-end close' })],
      runs: SUSPENDED_RUNS,
    });
    await user().click(await wechartRow('Weekday mornings'));
    await user().click(within(paneOf()).getByRole('button', { name: 'Resume' }));
    expect(text(await within(paneOf()).findByRole('status'))).toContain('Resumed');

    await user().click(await wechartRow('Month-end close'));

    expect(text(within(paneOf()).getByRole('status'))).toBe('');
  });

  it('numbers only the runs that count, leaving out one whose record Cube dropped (T379’s review)', async () => {
    shownSchedules({
      wechart: [suspended({ failuresInARow: 2, suspendAfter: 2 })],
      runs: [
        SUSPENDED_RUNS[0],
        { id: 'run-x', startedAt: '2026-10-02T11:30:00.000Z', outcome: 'expired', error: null },
        SUSPENDED_RUNS[1],
        SUSPENDED_RUNS[3],
      ],
    });
    await user().click(await wechartRow('Weekday mornings'));
    const failed = within(paneOf()).getByRole('table', { name: 'The failed runs' });

    await waitFor(() => {
      expect(
        within(failed)
          .getAllByRole('row')
          .map((each) =>
            within(each)
              .getAllByRole('cell')
              .slice(1, 3)
              .map((cell) => text(cell)),
          ),
      ).toEqual([
        ['Failed', '2 of 2'],
        ['Failed', '1 of 2'],
        ['Done', ''],
      ]);
    });
  });

  it('says what to do when the model no longer has its pre-aggregation, and only then (E4)', async () => {
    shownSchedules({ wechart: [suspended({ inModel: false })], runs: SUSPENDED_RUNS });
    await user().click(await wechartRow('Weekday mornings'));
    expect(text(within(paneOf()).getByTestId('not-in-model'))).toBe(
      'Cube’s answer when the pre-aggregation it names no longer exists. Delete the schedule, or resume it once the pre-aggregation is back.',
    );
  });

  it('says nothing of a missing pre-aggregation where the model couldn’t be read (T379’s review)', async () => {
    shownSchedules({ wechart: [suspended()], runs: SUSPENDED_RUNS });
    await user().click(await wechartRow('Weekday mornings'));
    expect(within(paneOf()).queryAllByTestId('not-in-model')).toHaveLength(0);
  });
});

/**
 * T555 (AC-395; design 16, P2 and D1; R59): Run now in a wechart schedule's
 * pane starts its build at once, and says so; Cube's refusal is said in its
 * words. It is offered on a suspended schedule too, and its runs aren't
 * among the failed runs that suspend it.
 */
describe('Run now (T555, AC-395)', () => {
  it('starts its build at once from the pane, and says so', async () => {
    const { sent } = shownSchedules({ wechart: [schedule()] });
    await user().click(await wechartRow('Weekday mornings'));

    await user().click(within(paneOf()).getByRole('button', { name: 'Run now' }));

    await waitFor(() => {
      expect(sent.filter((each) => each.method === 'POST')).toEqual([
        { method: 'POST', url: '/api/wechart-schedules/sched-1/run' },
      ]);
    });
    expect(text(await within(paneOf()).findByTestId('ran-now'))).toBe(
      'Started “Weekday mornings” now. Run history lists it.',
    );
  });

  it('says Cube started no job, rather than that it ran, when Cube answers with none (T555’s review)', async () => {
    shownSchedules({ wechart: [schedule()], runNowNoJob: true });
    await user().click(await wechartRow('Weekday mornings'));

    await user().click(within(paneOf()).getByRole('button', { name: 'Run now' }));

    await waitFor(() => {
      expect(text(within(paneOf()).getByTestId('ran-now'))).toBe(
        'Cube started no job: nothing of “Weekday mornings” was built.',
      );
    });
  });

  it('says Cube’s refusal in its words', async () => {
    shownSchedules({
      wechart: [schedule()],
      runNowRefused: 'A user’s selector doesn’t match any of the pre-aggregations.',
    });
    await user().click(await wechartRow('Weekday mornings'));

    await user().click(within(paneOf()).getByRole('button', { name: 'Run now' }));

    expect(text(await within(paneOf()).findByTestId('ran-now-refused'))).toBe(
      'Not started: A user’s selector doesn’t match any of the pre-aggregations.',
    );
  });

  it('offers Run now on a suspended schedule, and doesn’t number its runs among the failures (R59)', async () => {
    shownSchedules({
      wechart: [suspended()],
      runs: [
        {
          id: 'run-5',
          startedAt: '2026-10-02T12:30:00.000Z',
          outcome: 'failed',
          error: 'failure: Error: connect ETIMEDOUT 10.20.4.17:5432',
          via: 'run-now',
        },
        ...SUSPENDED_RUNS,
      ],
    });
    await user().click(await wechartRow('Weekday mornings'));

    expect(within(paneOf()).getByRole('button', { name: 'Run now' }).hasAttribute('disabled')).toBe(
      false,
    );
    const failed = within(paneOf()).getByRole('table', { name: 'The failed runs' });
    await waitFor(() => {
      expect(within(failed).getAllByRole('row')).toHaveLength(4);
    });
    expect(
      within(failed)
        .getAllByRole('row')
        .map((each) =>
          within(each)
            .getAllByRole('cell')
            .slice(1, 3)
            .map((cell) => text(cell)),
        ),
    ).toEqual([
      ['Failed', '3 of 3'],
      ['Failed', '2 of 3'],
      ['Failed', '1 of 3'],
      ['Done', ''],
    ]);
  });
});
