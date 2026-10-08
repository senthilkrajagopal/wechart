import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProposalItem } from './review';
import { SettingsDiff } from './SettingsDiff';

/**
 * T356 (design 05, state H; rule 83): a proposed data source against the
 * folder's current one, a setting a row: Setting, Current (version n),
 * Proposed. What didn't change says "unchanged"; a credential is only ever
 * "unchanged" or "Replaced", never a value.
 */
const fields = {
  host: 'pg-replica-1.sales.internal',
  port: 5432,
  database: 'sales',
  user: 'cube_reader',
  ssl: true,
};

const item = (over: Partial<ProposalItem>): ProposalItem => ({
  kind: 'data-source',
  id: 'ws-copy',
  title: 'sales_dw',
  version: 2,
  landsIn: 'f1',
  landsInPath: ['Shared', 'Sales', 'EMEA'],
  replaces: { id: 'shared-1', version: 3, copiedFrom: true },
  snapshot: {
    name: 'sales_dw',
    driver: 'postgres',
    authMethod: 'password',
    fields: { ...fields, host: 'pg-replica-2.sales.internal' },
    secrets: ['password'],
  },
  secretChanges: { password: 'replaced' },
  ...over,
});

function shown(proposed: ProposalItem) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url === '/api/data-sources/shared-1'
          ? new Response(
              JSON.stringify({
                id: 'shared-1',
                name: 'sales_dw',
                driver: 'postgres',
                authMethod: 'password',
                fields,
                secrets: { password: { stored: true } },
                version: 3,
              }),
            )
          : new Response('{}', { status: 404 }),
      ),
    ),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SettingsDiff item={proposed} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const cellsOf = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent);

describe('a data source’s settings diff (T356, state H)', () => {
  it('sets each setting beside the current one, and says a credential only unchanged or replaced', async () => {
    shown(item({}));
    const table = await screen.findByRole('table', { name: 'Settings, current and proposed' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Setting', 'Current (version 3)', 'Proposed']);
    const row = (label: string) =>
      within(table).getByRole('row', { name: new RegExp(`^${label}`) });
    await vi.waitFor(() => {
      expect(cellsOf(row('Host and port'))).toEqual([
        'pg-replica-1.sales.internal:5432',
        'pg-replica-2.sales.internal:5432',
      ]);
    });
    expect(cellsOf(row('Database'))).toEqual(['sales', 'unchanged']);
    expect(cellsOf(row('Password'))).toEqual(['Stored · encrypted', 'Replaced']);
    expect(table.textContent).not.toContain('Changed');
  });

  it('says a credential kept as copied is unchanged', async () => {
    shown(item({ secretChanges: { password: 'unchanged' } }));
    const table = await screen.findByRole('table', { name: 'Settings, current and proposed' });
    await vi.waitFor(() => {
      expect(cellsOf(within(table).getByRole('row', { name: /^Password/ }))).toEqual([
        'Stored · encrypted',
        'unchanged',
      ]);
    });
  });

  it('shows a decided one as proposed, alone, set against nothing (T356’s review)', async () => {
    vi.stubGlobal('fetch', vi.fn());
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SettingsDiff item={item({ secretChanges: {} })} alone />
      </QueryClientProvider>,
    );
    const table = screen.getByRole('table', { name: 'Settings, proposed' });
    expect(cellsOf(within(table).getByRole('row', { name: /^Password/ }))).toEqual([
      'Stored · encrypted',
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  /** T699 (design 05, state H; the critique's SEC-22): Test connection runs the proposed settings. */
  it('offers a decider Test connection of the proposed settings, saying when they passed as proposed', async () => {
    const passedAt = new Date();
    passedAt.setHours(14, 21, 0, 0);
    const ranAt = new Date();
    ranAt.setHours(14, 30, 5, 0);
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        asked.push(`${init?.method ?? 'GET'} ${url}`);
        if (url === '/api/data-sources/ws-copy/review-test')
          return Promise.resolve(
            init?.method === 'POST'
              ? Response.json({
                  ok: true,
                  checks: [{ id: 'connect', status: 'passed', durationMs: 5 }],
                  ranAt: ranAt.toISOString(),
                })
              : Response.json({ passedAt: passedAt.toISOString() }),
          );
        return Promise.resolve(new Response('{}', { status: 404 }));
      }),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SettingsDiff item={item({})} testable />
      </QueryClientProvider>,
    );

    const said = await screen.findByTestId('review-test');
    await vi.waitFor(() => expect(said.textContent).toBe('Passed when proposed · 14:21'));
    expect(said.querySelector('svg')?.getAttribute('data-icon')).toBe('ok');
    const run = screen.getByRole('button', { name: 'Test connection' });
    run.click();
    await vi.waitFor(() => expect(said.textContent).toBe('Passed · 14:30'));
    expect(asked).toContain('POST /api/data-sources/ws-copy/review-test');
  });

  it('offers no test where it isn’t testable: one who may not decide, or decided', async () => {
    shown(item({}));
    await screen.findByRole('table', { name: 'Settings, current and proposed' });
    expect(screen.queryByRole('button', { name: 'Test connection' })).toBeNull();
  });

  it('shows a new one’s settings alone, its credentials entered', async () => {
    shown(item({ replaces: null, secretChanges: { password: 'new' } }));
    const table = await screen.findByRole('table', { name: 'Settings, proposed' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Setting', 'Proposed']);
    expect(cellsOf(within(table).getByRole('row', { name: /^Password/ }))).toEqual(['Entered']);
  });
});
