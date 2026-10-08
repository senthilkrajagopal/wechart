import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NEXT_RUNS, paneOf, runsIn, shownSchedules, text } from './schedules.fixture';

/**
 * T552 / AC-234 (design 16, screen 2 pins 9–15 and states D2–D4): New
 * schedule opens the form in the pane, with a pre-aggregation of the user's
 * folders and a name; the cron, read back in words as it's typed; a required
 * zone that starts empty; the next five runs, in that zone and in UTC, with a
 * clock change among them marked; a cron it can't read named, with Create
 * waiting; one a refresh key could run, with its note (Q11); and the line
 * that each run builds every partition, with the missed-run choice, "Run it
 * once, when wechart is back" chosen (Q8).
 */
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const user = () => userEvent.setup({ delay: null });

async function opened() {
  const shown = shownSchedules();
  await user().click(await screen.findByRole('button', { name: 'New schedule' }));
  const pane = paneOf();
  return { ...shown, pane };
}

/** A text field; the zone's, with its list of zones, a combobox. */
const field = (pane: HTMLElement, name: RegExp | string) =>
  within(pane).getByRole(name === 'Time zone' ? 'combobox' : 'textbox', {
    name,
  }) as HTMLInputElement;
const button = (pane: HTMLElement, name: string) =>
  within(pane).getByRole('button', { name }) as HTMLButtonElement;
const radio = (pane: HTMLElement, name: string) =>
  within(pane).getByRole('radio', { name }) as HTMLInputElement;

describe('New schedule (T552, AC-234)', () => {
  it('opens the form in the pane: a pre-aggregation of the user’s folders, a name, the cron in words as typed, a zone that starts empty', async () => {
    const { pane } = await opened();

    expect(text(within(pane).getByRole('heading', { level: 2 }))).toBe('New schedule');
    const picker = within(pane).getByRole('combobox', { name: 'Pre-aggregation' });
    // With the pre-aggregation's cube beside it, its names in the code face (pin 9; T613).
    expect(
      picker.closest('.schedule-form__picker')?.querySelector('svg')?.getAttribute('data-icon'),
    ).toBe('cube');
    expect(picker.classList.contains('is-code')).toBe(true);
    // What Jobs lists in their folders, by short name with its folder; never a
    // lambda, which isn't built itself (T375).
    expect(
      within(picker)
        .getAllByRole('option')
        .map((option) => text(option)),
    ).toEqual(['Choose a pre-aggregation', 'orders.mornings · Sales', 'orders.on_demand · Sales']);
    expect(text(within(pane).getByText(/From the folders where/))).toBe(
      'From the folders where you have read-write access.',
    );
    expect(field(pane, /^Name/).value).toBe('');
    // Required, and empty to start (AC-234).
    expect(field(pane, 'Time zone').value).toBe('');
    expect(field(pane, 'Time zone').required).toBe(true);

    await user().type(field(pane, 'Cron expression'), '0 4 1 1,4,7,10 *');

    expect(
      text(await within(pane).findByText('At 04:00 on day 1 of January, April, July and October.')),
    ).toBe('At 04:00 on day 1 of January, April, July and October.');
    expect(text(within(pane).getByText(/^minute · hour/))).toBe(
      'minute · hour · day of month · month · day of week',
    );
    // No zone yet: no next runs.
    expect(within(pane).queryAllByRole('list', { name: NEXT_RUNS })).toHaveLength(0);
  });

  it('lists the next five runs in the zone and in UTC, with a clock change among them marked (D4)', async () => {
    const { pane } = await opened();

    await user().type(field(pane, 'Cron expression'), '0 7 * 10,11 1');
    await user().type(field(pane, 'Time zone'), 'Europe/Berlin');

    await waitFor(() => {
      expect(runsIn(pane)).toEqual([
        'Mon 5 Oct07:0005:00 UTC',
        'Mon 12 Oct07:0005:00 UTC',
        'Mon 19 Oct07:0005:00 UTC',
        'Sun 25 Oct: clocks go back an hour',
        'Mon 26 Oct07:0006:00 UTC',
        'Mon 2 Nov07:0006:00 UTC',
      ]);
    });
    expect(text(within(pane).getByText(/^Next runs/))).toBe('Next runs · Europe/Berlin, then UTC');
    // Named as design 16's keyboard table names it, and the change explained (D4; T612).
    expect(within(pane).getAllByRole('list', { name: 'Next 5 runs, Europe/Berlin' })).toHaveLength(
      1,
    );
    expect(text(within(pane).getByText(/follow the zone’s clock/))).toBe(
      'wechart’s schedules follow the zone’s clock, so 07:00 stays 07:00.',
    );
    // The change with its warning (D4; T613).
    expect(pane.querySelector('.schedules__change svg')?.getAttribute('data-icon')).toBe('warn');
  });

  it('names a cron it can’t read, shows no runs, and Create waits (D3)', async () => {
    const { pane } = await opened();
    await user().selectOptions(
      within(pane).getByRole('combobox', { name: 'Pre-aggregation' }),
      'fsales__orders.mornings',
    );
    await user().type(field(pane, /^Name/), 'Weekday mornings');
    await user().type(field(pane, 'Time zone'), 'Europe/Berlin');

    await user().type(field(pane, 'Cron expression'), '0 25 * * 1-5');

    expect(text(await within(pane).findByText('The hour is 25; it must be 0 to 23.'))).toBe(
      'The hour is 25; it must be 0 to 23.',
    );
    expect(field(pane, 'Cron expression').getAttribute('aria-invalid')).toBe('true');
    expect(within(pane).queryAllByRole('list', { name: NEXT_RUNS })).toHaveLength(0);
    expect(button(pane, 'Create schedule').disabled).toBe(true);
  });

  it('notes a cron a refresh key could run, in the model, by proposal, and takes it (Q11, D2)', async () => {
    const { pane } = await opened();

    await user().type(field(pane, 'Cron expression'), '0 6 * * *');
    await user().type(field(pane, 'Time zone'), 'Europe/Berlin');

    const could = await within(pane).findByTestId('refresh-key-could');
    expect(text(could)).toBe(
      'A refresh key could run this. Set in the model as every: "0 6 * * *" with timezone: Europe/Berlin, Cube’s refresh worker runs it, and it changes by proposal. This schedule works too.',
    );
    // With its icons (T613): D2's info, and the cron's reading its tick.
    expect(could.querySelector('svg')?.getAttribute('data-icon')).toBe('info');
    expect(pane.querySelector('.schedule-form__reading svg')?.getAttribute('data-icon')).toBe('ok');
    // And takes it: with a pre-aggregation and a name, Create is offered.
    await user().selectOptions(
      within(pane).getByRole('combobox', { name: 'Pre-aggregation' }),
      'fsales__orders.mornings',
    );
    await user().type(field(pane, /^Name/), 'Daily');
    await waitFor(() => {
      expect(button(pane, 'Create schedule').disabled).toBe(false);
    });
  });

  it('says each run builds every partition, offers the missed-run choice with “Run it once” chosen, and creates it at once (Q7, Q8)', async () => {
    const { pane, sent } = await opened();

    expect(text(within(pane).getByTestId('each-run'))).toBe(
      'Each run builds every partition, as Build all does.',
    );
    const missed = within(pane).getByRole('radiogroup', {
      name: 'If wechart was stopped when a run was due',
    });
    expect(radio(missed, 'Run it once, when wechart is back').checked).toBe(true);
    expect(radio(missed, 'Skip it').checked).toBe(false);
    // Recorded, now that the trail records it (T505; design 16, screen 2).
    expect(text(within(pane).getByTestId('applies-at-once'))).toBe(
      'Applies at once, with no proposal. Recorded in the audit trail.',
    );
    const create = button(pane, 'Create schedule');
    // It waits for a pre-aggregation, a name, a cron it can read and a zone (pin 15).
    expect(create.disabled).toBe(true);

    await user().selectOptions(
      within(pane).getByRole('combobox', { name: 'Pre-aggregation' }),
      'fsales__orders.on_demand',
    );
    await user().type(field(pane, /^Name/), 'Quarter-end close');
    await user().type(field(pane, 'Cron expression'), '0 4 1 1,4,7,10 *');
    await user().type(field(pane, 'Time zone'), 'Europe/Berlin');
    await waitFor(() => {
      expect(create.disabled).toBe(false);
    });
    await user().click(create);

    await waitFor(() => {
      expect(sent.filter((each) => each.method === 'POST')).toEqual([
        {
          method: 'POST',
          url: '/api/wechart-schedules',
          body: {
            preAggregation: 'fsales__orders.on_demand',
            name: 'Quarter-end close',
            cron: '0 4 1 1,4,7,10 *',
            timezone: 'Europe/Berlin',
            missed: 'once',
            // 3 unless changed (T379).
            suspendAfter: 3,
          },
        },
      ]);
    });
    // Made at once: its row is listed, and its pane opens on it.
    expect(text(within(paneOf()).getByRole('heading', { level: 2 }))).toBe('Quarter-end close');
  });

  it('sends Skip it when chosen (Q8)', async () => {
    const { pane, sent } = await opened();
    await user().selectOptions(
      within(pane).getByRole('combobox', { name: 'Pre-aggregation' }),
      'fsales__orders.mornings',
    );
    await user().type(field(pane, /^Name/), 'Skipping');
    await user().type(field(pane, 'Cron expression'), '0 6 * * *');
    await user().type(field(pane, 'Time zone'), 'Europe/Berlin');

    await user().click(radio(pane, 'Skip it'));
    const create = button(pane, 'Create schedule');
    await waitFor(() => {
      expect(create.disabled).toBe(false);
    });
    await user().click(create);

    await waitFor(() => {
      expect(sent.filter((each) => each.method === 'POST').map((each) => each.body)).toEqual([
        {
          preAggregation: 'fsales__orders.mornings',
          name: 'Skipping',
          cron: '0 6 * * *',
          timezone: 'Europe/Berlin',
          missed: 'skip',
          suspendAfter: 3,
        },
      ]);
    });
  });

  it('sets how many failed runs in a row suspend it: 3 unless changed, a whole number of 1 or more (T379, pin 14)', async () => {
    const { pane, sent } = await opened();
    const limit = within(pane).getByRole('spinbutton', {
      name: 'Suspend after failed runs in a row',
    }) as HTMLInputElement;
    expect(limit.value).toBe('3');
    expect(text(within(pane).getByTestId('suspend-help'))).toBe(
      'It then stops running until someone resumes it.',
    );
    await user().selectOptions(
      within(pane).getByRole('combobox', { name: 'Pre-aggregation' }),
      'fsales__orders.mornings',
    );
    await user().type(field(pane, /^Name/), 'Five');
    await user().type(field(pane, 'Cron expression'), '0 6 * * *');
    await user().type(field(pane, 'Time zone'), 'Europe/Berlin');
    // Complete, with 3: Create is offered (T379's review).
    await waitFor(() => {
      expect(button(pane, 'Create schedule').disabled).toBe(false);
    });

    // No "never": 0 is refused, and Create waits.
    await user().clear(limit);
    await user().type(limit, '0');
    expect(text(within(pane).getByTestId('suspend-error'))).toBe(
      'Suspend it after a whole number of failed runs in a row, 1 or more.',
    );
    expect(limit.getAttribute('aria-invalid')).toBe('true');
    expect(button(pane, 'Create schedule').disabled).toBe(true);

    await user().clear(limit);
    await user().type(limit, '5');
    const create = button(pane, 'Create schedule');
    await waitFor(() => {
      expect(create.disabled).toBe(false);
    });
    await user().click(create);
    await waitFor(() => {
      expect(
        sent
          .filter((each) => each.method === 'POST')
          .map((each) => (each.body as { suspendAfter: unknown }).suspendAfter),
      ).toEqual([5]);
    });
  });

  it('names a zone it doesn’t know under the zone, the cron’s words kept, and Create waits (T552’s review)', async () => {
    const { pane } = await opened();

    await user().type(field(pane, 'Cron expression'), '0 6 * * *');
    await user().type(field(pane, 'Time zone'), 'Mars/Olympus');

    const zone = field(pane, 'Time zone');
    await waitFor(() => {
      expect(zone.getAttribute('aria-invalid')).toBe('true');
    });
    const said = (zone.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => text(document.getElementById(id)))
      .join(' ');
    expect(said).toContain('“Mars/Olympus” isn’t a time zone wechart knows.');
    expect(field(pane, 'Cron expression').getAttribute('aria-invalid')).toBe(null);
    expect(text(within(pane).getByText('At 06:00 every day.'))).toBe('At 06:00 every day.');
    expect(button(pane, 'Create schedule').disabled).toBe(true);
  });

  it('gives a run in another year its year (screen 2, pin 11)', async () => {
    const { pane } = await opened();

    await user().type(field(pane, 'Cron expression'), '0 4 1 1,4,7,10 *');
    await user().type(field(pane, 'Time zone'), 'Europe/Berlin');

    await waitFor(() => {
      expect(runsIn(pane)).toEqual([
        'Fri 1 Jan 202704:0003:00 UTC',
        'Thu 1 Apr 202704:0002:00 UTC',
        'Thu 1 Jul 202704:0002:00 UTC',
        'Fri 1 Oct 202704:0002:00 UTC',
        'Sat 1 Jan 202804:0003:00 UTC',
      ]);
    });
  });

  it('loses only what was typed on Cancel', async () => {
    const { pane, sent } = await opened();
    await user().click(within(pane).getByRole('radio', { name: 'Skip it' }));
    await user().type(field(pane, /^Name/), 'Not kept');

    await user().click(within(pane).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryAllByRole('complementary', { name: 'Schedule details' })).toHaveLength(0);
    expect(sent.filter((each) => each.method !== 'GET')).toEqual([]);
    await user().click(screen.getByRole('button', { name: 'New schedule' }));
    expect(field(paneOf(), /^Name/).value).toBe('');
    expect(radio(paneOf(), 'Run it once, when wechart is back').checked).toBe(true);
  });
});
