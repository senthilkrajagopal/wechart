import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CubeForm } from '../form/CubeForm';

/**
 * T159 / AC-153: WHEN the user sets a pre-aggregation's refresh schedule in
 * the model editor as a cron expression and time zone, THE SYSTEM SHALL
 * accept only expressions Cube's refresh worker can run, show the next runs
 * Cube's refresh key implies with a note that a run can start up to about
 * five minutes after its time, and write the schedule into the model as that
 * pre-aggregation's `refresh_key`.
 *
 * In the cube's form, as the model editor draws it; the publish is the
 * model's own (e2e/model-schedule.spec.ts).
 */
type Value = Record<string, unknown>;

const cubeWith = (refreshKey?: unknown): Value => ({
  name: 'monthly_orders',
  sql_table: 'public.orders',
  pre_aggregations: [
    {
      name: 'by_status_month',
      measures: ['count'],
      ...(refreshKey === undefined ? {} : { refresh_key: refreshKey }),
    },
  ],
});

function Held({ start, onValue }: { start: Value; onValue: (value: Value) => void }) {
  const [value, setValue] = useState(start);
  return (
    <CubeForm
      kind="cube"
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

const keyOf = (value: Value | undefined) =>
  ((value?.['pre_aggregations'] as Value[] | undefined)?.[0] as Value | undefined)?.['refresh_key'];

async function openRollup(start: Value) {
  let last: Value | undefined;
  render(<Held start={start} onValue={(value) => (last = value)} />);
  await userEvent.click(screen.getByRole('tab', { name: /^Pre-aggs/ }));
  await userEvent.click(screen.getByText('by_status_month', { selector: '.model-member__name' }));
  return () => last;
}

/** The runs shown are the clock's: a fixed one, so they don't move with the date (T377). */
function clockAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('a pre-aggregation’s refresh schedule', () => {
  it('takes a cron and a time zone, writes them as its refresh_key, and shows the next runs', async () => {
    // Weeks from Los Angeles' next daylight-saving change (1 Nov 2026).
    clockAt('2026-09-24T12:00:00Z');
    const value = await openRollup(cubeWith());
    const schedule = screen.getByLabelText('Refresh key');
    await userEvent.type(schedule, '0 8 * * *');
    await userEvent.tab();
    expect(keyOf(value())).toEqual({ every: '0 8 * * *' });

    await userEvent.selectOptions(screen.getByLabelText('Time zone'), 'America/Los_Angeles');
    expect(keyOf(value())).toEqual({ every: '0 8 * * *', timezone: 'America/Los_Angeles' });

    // Five runs, each at 08:00 in its zone.
    const runs = screen.getByRole('list', { name: 'Next refreshes' });
    const items = within(runs).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    for (const item of items) expect(item.textContent).toMatch(/08:00/);
    // Day first, "Fri 25 Sep 08:00": "Sep", never "Sept", no comma (T477; Q6, Q8).
    expect(items[0]?.textContent).toMatch(/^[A-Z][a-z]{2} \d{1,2} Sep 08:00 /);
    // How late one can start: 300 s of staleness and the 30 s beat (research).
    expect(screen.getByText(/can start up to about 5½ minutes after its time/)).toBeDefined();
  });

  it('refuses what Cube’s refresh worker can’t run, saying why, and shows no runs for it', async () => {
    const value = await openRollup(cubeWith({ every: '1 hour' }));
    const schedule = screen.getByLabelText('Refresh key');
    await userEvent.clear(schedule);
    await userEvent.type(schedule, '55 7 * * 1-5');

    expect(screen.getByRole('alert').textContent).toMatch(/can’t run "55 7 \* \* 1-5"/);
    expect(schedule.getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByRole('list', { name: 'Next refreshes' })).toBeNull();
    // Not taken while Cube can't run it: nothing is written, so the key stays as it was.
    await userEvent.tab();
    expect(value()).toBeUndefined();
  });

  it('writes an interval with no time zone, which Cube ignores for one', async () => {
    const value = await openRollup(cubeWith({ every: '0 8 * * *', timezone: 'Europe/Paris' }));
    const schedule = screen.getByLabelText('Refresh key');
    await userEvent.clear(schedule);
    await userEvent.type(schedule, '1 hour');
    await userEvent.tab();
    expect(keyOf(value())).toEqual({ every: '1 hour' });
    expect(screen.queryByLabelText('Time zone')).toBeNull();
    expect(
      within(screen.getByRole('list', { name: 'Next refreshes' })).getAllByRole('listitem')[0]
        ?.textContent,
    ).toMatch(/:00/);
  });

  it('keeps an incremental key’s other settings, and leaves a key of SQL to YAML', async () => {
    const value = await openRollup(
      cubeWith({ every: '1 day', incremental: true, update_window: '7 day' }),
    );
    const schedule = screen.getByLabelText('Refresh key');
    await userEvent.clear(schedule);
    await userEvent.type(schedule, '0 3 * * *');
    await userEvent.tab();
    expect(keyOf(value())).toEqual({
      every: '0 3 * * *',
      incremental: true,
      update_window: '7 day',
    });
  });

  it('edits a key of SQL as YAML: it is not a schedule', async () => {
    await openRollup(cubeWith({ sql: 'SELECT MAX(id) FROM orders', every: '1 hour' }));
    expect(screen.getByLabelText('Refresh key').tagName).toBe('TEXTAREA');
  });
});

/** T377: what T159's and T258's reviews found (docs/tasks.md, T264). */
describe('a refresh schedule, as Cube runs it (T377)', () => {
  it('lists runs only up to the zone’s next daylight-saving change, then says why no more (Q3)', async () => {
    // Los Angeles falls back on Sun 1 Nov 2026: three runs at 08:00 before it.
    clockAt('2026-10-29T12:00:00Z');
    await openRollup(cubeWith({ every: '0 8 * * *', timezone: 'America/Los_Angeles' }));

    const runs = within(screen.getByRole('list', { name: 'Next refreshes' })).getAllByRole(
      'listitem',
    );
    expect(runs.map((run) => run.textContent?.match(/\w{3} \d+ \w{3}/)?.[0])).toEqual([
      'Thu 29 Oct',
      'Fri 30 Oct',
      'Sat 31 Oct',
    ]);
    for (const run of runs) expect(run.textContent).toMatch(/08:00/);
    expect(screen.getByTestId('refresh-clock-change').textContent).toBe(
      'The clocks go back on Sun 1 Nov. Cube may run this key an hour off after that, until it next compiles the model, so later runs aren’t listed.',
    );
  });

  it('says so when the change comes before the next run, listing none (T377’s review)', async () => {
    // Sat 31 Oct, after that day's 08:00 in Los Angeles: the next is after the change.
    clockAt('2026-10-31T16:00:00Z');
    await openRollup(cubeWith({ every: '0 8 * * *', timezone: 'America/Los_Angeles' }));

    expect(screen.queryAllByRole('list', { name: 'Next refreshes' })).toHaveLength(0);
    expect(screen.getByTestId('refresh-clock-change').textContent).toMatch(
      /^The clocks go back on Sun 1 Nov\./,
    );
    expect(screen.getByText(/can start up to about 5½ minutes after its time/).tagName).toBe('P');
    // What the field's description names is there.
    const described = screen.getByLabelText('Refresh key').getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(described)?.textContent).toContain('The clocks go back');
  });

  it('says when the clocks go forward instead', async () => {
    clockAt('2026-03-10T12:00:00Z');
    await openRollup(cubeWith({ every: '0 7 * * 1', timezone: 'Europe/Berlin' }));

    expect(screen.getByTestId('refresh-clock-change').textContent).toMatch(
      /^The clocks go forward on Sun 29 Mar\./,
    );
  });

  it('says a rollup with scheduled_refresh: false isn’t scheduled, and shows no runs', async () => {
    clockAt('2026-09-24T12:00:00Z');
    await openRollup({
      ...cubeWith(),
      pre_aggregations: [
        {
          name: 'by_status_month',
          measures: ['count'],
          scheduled_refresh: false,
          refresh_key: { every: '0 8 * * *' },
        },
      ],
    });

    expect(screen.queryAllByRole('list', { name: 'Next refreshes' })).toHaveLength(0);
    expect(screen.getByTestId('refresh-not-scheduled').textContent).toBe(
      'Not scheduled: scheduled_refresh is false, so Cube’s refresh worker never rebuilds it on this key. Build it from Jobs.',
    );
  });

  it('won’t clear the schedule of an incremental key, which Cube can’t take without one', async () => {
    const value = await openRollup(
      cubeWith({ every: '1 day', incremental: true, update_window: '7 day' }),
    );
    const schedule = screen.getByLabelText('Refresh key');
    await userEvent.clear(schedule);
    await userEvent.tab();

    // Cube's validator requires `every` (or `sql`) in a key (research, "Where each key is allowed").
    expect(screen.getByRole('alert').textContent).toBe(
      'A refresh key with incremental or update_window needs a schedule: Cube refuses one without. Give it one, or remove those in YAML.',
    );
    expect(value()).toBeUndefined();
  });
});
