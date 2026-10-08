import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { exactOf } from '../../shell/formatTime';

import { Health } from './Health';

/**
 * T162 / AC-156: THE SYSTEM SHALL show the refresh worker's state and the
 * Cube deployment's health, and mark the deployment as down when Cube's
 * health endpoint does not report healthy.
 * Fails when: the indicator stays healthy while Cube reports otherwise.
 *
 * The Jobs header's two badges, as the prototype's ("Refresh worker
 * running"), each an icon and words, asked again while the page is open.
 */
function answering(...answers: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      // A server with no xcube offers no refresh-worker route (T553): the probes alone.
      if (String(input) === '/api/jobs/refresh-worker') return new Response(null, { status: 404 });
      expect(String(input)).toBe('/api/cube-health');
      const next = answers.length > 1 ? answers.shift() : answers[0];
      return new Response(JSON.stringify(next));
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Health pollMs={10} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const badge = (id: string) => screen.getByTestId(id);

describe('Cube’s health, in the Jobs header', () => {
  it('shows the deployment healthy and the refresh worker running, each with its icon', async () => {
    answering({ cube: 'healthy', worker: 'healthy' });

    await vi.waitFor(() => {
      expect(badge('cube-health').textContent).toBe('Cube healthy');
    });
    expect(badge('cube-health').querySelector('svg')?.getAttribute('data-icon')).toBe('ok');
    expect(badge('worker-health').textContent).toBe('Refresh worker running');
    expect(badge('worker-health').querySelector('svg')?.getAttribute('data-icon')).toBe('ok');
  });

  it('marks the deployment down as soon as Cube stops reporting healthy', async () => {
    answering({ cube: 'healthy', worker: 'healthy' }, { cube: 'down', worker: 'down' });

    await vi.waitFor(() => {
      expect(badge('cube-health').textContent).toBe('Cube down');
    });
    expect(badge('cube-health').querySelector('svg')?.getAttribute('data-icon')).toBe('err');
    expect(badge('worker-health').textContent).toBe('Refresh worker down');
  });

  it('says so when the refresh worker is not watched, rather than calling it running', async () => {
    answering({ cube: 'healthy', worker: 'unwatched' });

    await vi.waitFor(() => {
      expect(badge('worker-health').textContent).toBe('Refresh worker not watched');
    });
    expect(badge('worker-health').querySelector('svg')?.getAttribute('data-icon')).toBe('warn');
  });

  it('stops calling it healthy once its health can no longer be read', async () => {
    // The last answer is kept by the query when a later ask fails; shown, it
    // would say healthy while nothing says so any more.
    let asks = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === '/api/jobs/refresh-worker')
          return new Response(null, { status: 404 });
        asks += 1;
        return asks === 1
          ? new Response(JSON.stringify({ cube: 'healthy', worker: 'healthy' }))
          : new Response('', { status: 502 });
      }),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Health pollMs={10} />
      </QueryClientProvider>,
    );

    await vi.waitFor(() => {
      expect(asks).toBeGreaterThan(1);
      expect(badge('cube-health').textContent).toBe('Cube health unknown');
    });
  });

  it('reads an answer it does not know as unknown, rather than breaking the page', async () => {
    // A state the API may one day add, or a body with none (T162's review).
    answering({ cube: 'degraded', worker: null });

    await vi.waitFor(() => {
      expect(badge('cube-health').textContent).toBe('Cube health unknown');
    });
    expect(badge('worker-health').textContent).toBe('Refresh worker unknown');
  });

  it('says its health is unknown when it cannot be read at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 502 })),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Health pollMs={10} />
      </QueryClientProvider>,
    );

    await vi.waitFor(() => {
      expect(badge('cube-health').textContent).toBe('Cube health unknown');
    });
    expect(badge('cube-health').querySelector('svg')?.getAttribute('data-icon')).toBe('warn');
  });
});

/**
 * T553 (AC-393; design 16, state F and Q4): the refresh worker's badge as
 * xcube reports it, running with its last run, behind, failing or none, an
 * icon and words; it opens a panel of each worker and module. A module's
 * error is a Super-Admin's: a member is told one failed, and why they can't
 * see it.
 */
describe('the refresh worker, as xcube reports it (T553, AC-393)', () => {
  /** Today at a local time, as the API gives it. */
  const at = (h: number, m: number, s = 0) => {
    const day = new Date();
    day.setHours(h, m, s, 0);
    return day.toISOString();
  };
  const RUNNING = {
    status: { state: 'running', lastRunAt: at(14, 39, 52) },
    modelRevision: 12,
    workers: [
      { instance: 'cube-refresh-0', revision: 12, lastRunAt: at(14, 39, 52), finished: true },
      { instance: 'cube-refresh-old', revision: 11, lastRunAt: at(9, 0), finished: false },
    ],
    modules: [
      { module: 'all', lastRunAt: at(14, 39, 52), lastOkAt: at(14, 39, 52), failing: false },
    ],
    errorsShown: false,
  };
  const FAILING = {
    status: { state: 'failing', lastRunAt: at(14, 39, 52), modules: 1 },
    modelRevision: 12,
    workers: [
      { instance: 'cube-refresh-0', revision: 12, lastRunAt: at(14, 39, 52), finished: true },
    ],
    modules: [
      { module: 'commons', lastRunAt: at(14, 39, 52), lastOkAt: at(14, 39, 52), failing: false },
      {
        module: 'm8be41d07a2',
        lastRunAt: at(14, 39, 50),
        lastOkAt: at(13, 52),
        failing: true,
        error: 'Refresh Scheduler Error: connect ETIMEDOUT 10.20.4.17:5432',
      },
    ],
    errorsShown: true,
  };

  function reporting(report: unknown, probes: unknown = { cube: 'healthy', worker: 'healthy' }) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/jobs/refresh-worker'
          ? Response.json(report)
          : Response.json(probes),
      ),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Health pollMs={60_000} />
      </QueryClientProvider>,
    );
  }
  const iconOf = (id: string) => badge(id).querySelector('svg')?.getAttribute('data-icon');

  it.each([
    [RUNNING, 'Refresh worker running · last run 14:39', 'ok'],
    [
      { ...RUNNING, status: { state: 'behind', lastRunAt: at(14, 39), revision: 11, of: 12 } },
      'Refresh worker behind · on revision 11 of 12',
      'warn',
    ],
    [FAILING, 'Refresh runs failing · 1 module', 'err'],
    [
      { ...FAILING, status: { state: 'failing', lastRunAt: at(14, 39), modules: 2 } },
      'Refresh runs failing · 2 modules',
      'err',
    ],
    [
      { ...RUNNING, status: { state: 'none' }, workers: [], modules: [] },
      'No refresh worker has run this model',
      'off',
    ],
  ])('draws the badge as xcube reports it: %#', async (report, words, icon) => {
    reporting(report);

    await vi.waitFor(() => {
      expect(badge('worker-health').textContent).toBe(words);
    });
    expect(iconOf('worker-health')).toBe(icon);
  });

  /** Yesterday at 14:39:52, local: a last run of another day. */
  const yesterdays = (errorsShown: boolean) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(14, 39, 52, 0);
    const iso = yesterday.toISOString();
    return {
      yesterday,
      report: {
        ...RUNNING,
        status: { state: 'running', lastRunAt: iso },
        workers: [{ instance: 'cube-refresh-0', revision: 12, lastRunAt: iso, finished: true }],
        modules: [{ module: 'all', lastRunAt: iso, lastOkAt: iso, failing: false }],
        errorsShown,
      },
    };
  };

  it('names the day of a last run that wasn’t today in a Super-Admin’s tables, the exact time on hover (T477; F2, T614)', async () => {
    const { yesterday, report } = yesterdays(true);
    reporting(report);
    await userEvent.click(await screen.findByRole('button', { name: /Refresh worker running/ }));
    const panel = screen.getByRole('region', { name: 'Refresh worker' });
    const worker = within(within(panel).getByRole('table', { name: 'Workers' })).getAllByRole(
      'row',
    )[0]!;
    expect(worker.textContent).toContain('last run Yesterday 14:39:52');
    expect(worker.querySelector('time')?.getAttribute('title')).toBe(exactOf(yesterday));
    const module = within(within(panel).getByRole('table', { name: 'Modules' })).getAllByRole(
      'row',
    )[1]!;
    expect(within(module).getAllByRole('cell')[1]?.textContent).toBe('Yesterday 14:39');
  });

  it('names the day of a last run that wasn’t today, the exact time and UTC on hover (T477, Q8, Q9)', async () => {
    const { yesterday, report } = yesterdays(false);
    reporting(report);
    await vi.waitFor(() => {
      expect(badge('worker-health').textContent).toBe(
        'Refresh worker running · last run Yesterday 14:39',
      );
    });
    expect(badge('worker-health').getAttribute('title')).toContain(exactOf(yesterday));
    // Its last run in the lighter style, as screen 1's badge draws it (T613).
    expect(badge('worker-health').querySelector('.status__detail')?.textContent).toBe(
      '· last run Yesterday 14:39',
    );

    await userEvent.click(screen.getByRole('button', { name: /Refresh worker running/ }));
    const panel = screen.getByRole('region', { name: 'Refresh worker' });
    // A member's panel, F3: the line, its day named (the tables are a Super-Admin's, above).
    expect(within(panel).getByTestId('refresh-summary').textContent).toBe(
      'Running · last run Yesterday 14:39:52, on the current revision',
    );
    expect(within(panel).queryAllByRole('table')).toHaveLength(0);
  });

  it('says the worker’s state is unknown while xcube’s report can’t be read, never running (T553’s review)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/jobs/refresh-worker'
          ? Response.json(
              { error: 'The refresh worker’s state couldn’t be read from xcube.' },
              { status: 502 },
            )
          : Response.json({ cube: 'healthy', worker: 'healthy' }),
      ),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Health pollMs={60_000} />
      </QueryClientProvider>,
    );

    // Once the probes have answered healthy, and xcube's report failed.
    await vi.waitFor(() => {
      expect([badge('cube-health').textContent, badge('worker-health').textContent]).toEqual([
        'Cube healthy',
        'Refresh worker unknown',
      ]);
    });
    expect(iconOf('worker-health')).toBe('warn');
  });

  it('says the worker is down when its own probes say so, whatever xcube last recorded', async () => {
    reporting(RUNNING, { cube: 'healthy', worker: 'down' });

    await vi.waitFor(() => {
      expect(badge('worker-health').textContent).toBe('Refresh worker down');
    });
    expect(iconOf('worker-health')).toBe('err');
  });

  it('opens a panel of each worker and module, with a module’s error, from the badge (F2)', async () => {
    reporting(FAILING);
    const opener = await screen.findByRole('button', { name: /Refresh runs failing/ });
    expect(opener.getAttribute('aria-expanded')).toBe('false');

    await userEvent.click(opener);

    expect(opener.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByRole('region', { name: 'Refresh worker' });
    expect(within(panel).getByTestId('model-revision').textContent).toBe('Model revision 12');
    // As F2 draws it: the tables, and no summary line over them (J1; T614).
    expect(within(panel).queryByTestId('refresh-summary')).toBeNull();
    expect(within(panel).queryByTestId('refresh-failing')).toBeNull();
    const rows = (name: string) =>
      within(within(panel).getByRole('table', { name }))
        .getAllByRole('row')
        .map((row) =>
          within(row)
            .queryAllByRole('cell')
            .map((cell) => cell.textContent),
        );
    expect(rows('Workers')).toEqual([
      ['cube-refresh-0', 'revision 12', 'last run 14:39:52', 'Finished'],
    ]);
    expect(rows('Modules')).toEqual([
      [],
      ['commons', '14:39', 'OK'],
      ['m8be41d07a2', '14:39', 'Failing · OK at 13:52'],
    ]);
    expect(within(panel).getByTestId('module-error-m8be41d07a2').textContent).toBe(
      'Refresh Scheduler Error: connect ETIMEDOUT 10.20.4.17:5432',
    );

    // Escape closes it, giving focus back to the badge (rule 85).
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Refresh worker' })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  /** T611 (AC-399; design 16's keyboard table): "a non-modal popover, and Esc closes it". */
  it('opens its panel as a popover by the badge, which a click elsewhere closes', async () => {
    reporting(FAILING);
    const opener = await screen.findByRole('button', { name: /Refresh runs failing/ });
    await userEvent.click(opener);
    const panel = screen.getByRole('region', { name: 'Refresh worker' });

    // Anchored to the badge, over the page, not a block in its flow.
    expect(panel.closest('.jobs-health__anchor')?.contains(opener)).toBe(true);
    expect(panel.className).toContain('popover');
    // Non-modal: what's in it is used, and a click on it keeps it open.
    await userEvent.click(within(panel).getByTestId('model-revision'));
    expect(screen.getByRole('region', { name: 'Refresh worker' })).toBe(panel);

    await userEvent.click(document.body);
    expect(screen.queryByRole('region', { name: 'Refresh worker' })).toBeNull();
    expect(opener.getAttribute('aria-expanded')).toBe('false');
  });

  it('tells a member a module failed, and why they can’t see its error (F3, Q4)', async () => {
    const withoutError = Object.fromEntries(
      Object.entries(FAILING.modules[1]!).filter(([key]) => key !== 'error'),
    );
    reporting({
      ...FAILING,
      modules: [FAILING.modules[0], withoutError],
      errorsShown: false,
    });
    await userEvent.click(await screen.findByRole('button', { name: /Refresh runs failing/ }));

    const panel = screen.getByRole('region', { name: 'Refresh worker' });
    expect(within(panel).queryByTestId('module-error-m8be41d07a2')).toBeNull();
    expect(panel.textContent).toContain(
      'A module can hold cubes from several folders, so its error can name some you can’t see. A Super-Admin can see it.',
    );
    // As F3 draws it (J1; T614): two status lines, each with its icon, the
    // help under the second; no tables, and no Model revision in its head.
    const lines = [
      within(panel).getByTestId('refresh-summary'),
      within(panel).getByTestId('refresh-failing'),
    ];
    expect(lines.map((line) => line.textContent)).toEqual([
      'Running · last run 14:39:52, on the current revision',
      '1 module’s last run failed · 14:39',
    ]);
    expect(lines.map((line) => line.querySelector('svg')?.getAttribute('data-icon'))).toEqual([
      'ok',
      'err',
    ]);
    expect(within(panel).queryAllByRole('table')).toHaveLength(0);
    expect(within(panel).queryByTestId('model-revision')).toBeNull();
  });

  it('says to a member when it is on the current revision, in F3’s one line (J1; T614)', async () => {
    reporting(RUNNING);
    await userEvent.click(await screen.findByRole('button', { name: /Refresh worker running/ }));

    const panel = screen.getByRole('region', { name: 'Refresh worker' });
    expect(within(panel).getByTestId('refresh-summary').textContent).toBe(
      'Running · last run 14:39:52, on the current revision',
    );
    // Nothing failing: no second line.
    expect(within(panel).queryByTestId('refresh-failing')).toBeNull();
  });

  it('lists to a Super-Admin a worker whose run is still waiting on builds as such (F2)', async () => {
    reporting({ ...RUNNING, errorsShown: true });
    await userEvent.click(await screen.findByRole('button', { name: /Refresh worker running/ }));

    const panel = screen.getByRole('region', { name: 'Refresh worker' });
    expect(
      within(within(panel).getByRole('table', { name: 'Workers' })).getAllByRole('row')[1]
        ?.textContent,
    ).toBe('cube-refresh-oldrevision 11last run 09:00:00Waiting on builds');
  });

  it('says to a member that the worker is behind, from its workers, while a module fails (F3; J1, T614)', async () => {
    reporting({
      ...FAILING,
      modelRevision: 12,
      workers: [{ ...FAILING.workers[0], revision: 11 }],
      errorsShown: false,
    });
    await userEvent.click(await screen.findByRole('button', { name: /Refresh runs failing/ }));

    const panel = screen.getByRole('region', { name: 'Refresh worker' });
    expect(within(panel).getByTestId('refresh-summary').textContent).toBe(
      'Behind · on revision 11 of 12, last run 14:39:52',
    );
    expect(
      within(panel).getByTestId('refresh-summary').querySelector('svg')?.getAttribute('data-icon'),
    ).toBe('warn');
    expect(within(panel).getByTestId('refresh-failing').textContent).toBe(
      '1 module’s last run failed · 14:39',
    );
  });
});
