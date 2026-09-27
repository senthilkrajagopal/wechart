import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

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

describe('a pre-aggregation’s refresh schedule', () => {
  it('takes a cron and a time zone, writes them as its refresh_key, and shows the next runs', async () => {
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
