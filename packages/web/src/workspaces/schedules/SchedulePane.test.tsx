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
