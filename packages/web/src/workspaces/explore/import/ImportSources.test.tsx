import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SealedV1 } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImportSources, type SourceDecision } from './ImportSources';

/**
 * T514 (AC-358, AC-361, AC-282, AC-163; design 13, states M, N, O and P):
 * each data source in the file is mapped to an existing one a model in the
 * target can bind to, or created in the workspace from the file's settings,
 * its secrets typed, and decided only once its test passes. A name the
 * target already holds is refused until it is mapped or renamed. Mapping to
 * another driver warns, naming both, and blocks nothing.
 */
const REPLICA = {
  kind: 'data-source' as const,
  name: 'emea_replica',
  driver: 'postgres',
  authMethod: 'password',
  fields: { host: 'pg-replica-1.sales.internal', port: 5432, database: 'sales', user: 'cube_reader', ssl: true },
  description: 'Read replica for EMEA order cubes.',
};
const DW = {
  kind: 'data-source' as const,
  name: 'sales_dw',
  driver: 'snowflake',
  authMethod: 'key-pair',
  fields: { account: 'acme-emea', warehouse: 'REPORTING_WH', database: 'SALES', username: 'CUBE_SVC' },
  description: null,
};
const FOLDERS = [
  { id: 'sales', title: 'Sales', parentId: 'root' },
  { id: 'emea', title: 'EMEA', parentId: 'sales' },
  { id: 'finance', title: 'Finance', parentId: 'root' },
];
const listed = (id: string, name: string, driver: string, folderId: string, path: string[]) => ({
  id,
  name,
  driver,
  authMethod: 'password',
  folderId,
  folderPath: path.map((title, at) => ({ id: ['sales', 'emea'][at] ?? title, title })),
  updatedAt: '2026-09-28T10:00:00Z',
  lastTest: null,
  usedBy: null,
  usedElsewhere: 0,
});
const SOURCES = [
  listed('s-dw', 'sales_dw', 'snowflake', 'sales', ['Sales']),
  listed('s-default', 'default', 'postgres', 'root', []),
  listed('s-fin', 'ledger', 'postgres', 'finance', ['Finance']),
];
const answer = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const ENVELOPE: SealedV1 = { v: 1, kid: 'kid-1', enc: 'enc', ct: 'ct' };

function shown(
  sources: readonly (typeof REPLICA | typeof DW)[],
  serve: (url: string, init?: RequestInit) => Promise<Response>,
  held = SOURCES,
) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) =>
    url === '/api/data-sources'
      ? answer(200, held)
      : url === '/api/folders'
        ? answer(200, FOLDERS)
        : serve(url, init),
  );
  vi.stubGlobal('fetch', fetchMock);
  const seal = vi.fn(async () => ENVELOPE);
  const onDecisions = vi.fn<(decisions: Readonly<Record<string, SourceDecision | undefined>>) => void>();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ImportSources
        sources={sources}
        target={{ id: 'emea', path: ['Sales', 'EMEA'] }}
        seal={seal}
        onDecisions={onDecisions}
      />
    </QueryClientProvider>,
  );
  const last = () => onDecisions.mock.calls.at(-1)?.[0] ?? {};
  return { fetchMock, seal, last };
}
const row = (name: string) => screen.getByRole('group', { name: new RegExp(`^${name}`) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mapping an imported data source (T514, AC-358, AC-361)', () => {
  it('lists those a model in the target can bind to, nearest first, and maps to the one chosen', async () => {
    const { last } = shown([DW], () => answer(404, {}));
    const dw = row('sales_dw');
    await userEvent.click(within(dw).getByRole('radio', { name: 'Map to an existing one' }));
    const list = await within(dw).findByRole('radiogroup', {
      name: 'Data sources a model in Sales / EMEA can bind to',
    });
    // EMEA's own (none), then Sales, then Shared; never Finance's.
    expect(within(list).getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'))).toEqual([
      'sales_dw, Same name, Snowflake, in Sales',
      'default, PostgreSQL, in Shared',
    ]);
    expect(last()['sales_dw']).toBeUndefined();
    await userEvent.click(within(list).getByRole('radio', { name: /^sales_dw/ }));
    expect(last()['sales_dw']).toEqual({
      kind: 'map',
      to: { id: 's-dw', name: 'sales_dw', driver: 'snowflake', path: ['Sales'] },
    });
    expect(within(dw).queryByRole('note', { name: /driver/i })).toBeNull();
  });

  it('warns, naming both drivers, when the one chosen has another, and still maps it', async () => {
    const { last } = shown([DW], () => answer(404, {}));
    const dw = row('sales_dw');
    await userEvent.click(within(dw).getByRole('radio', { name: 'Map to an existing one' }));
    await userEvent.click(await within(dw).findByRole('radio', { name: /^default/ }));
    expect(within(dw).getByTestId('driver-mismatch').textContent).toBe(
      'sales_dw is Snowflake in the file, and default is PostgreSQL: a model written for Snowflake’s SQL may not run on PostgreSQL.',
    );
    expect(last()['sales_dw']).toEqual({
      kind: 'map',
      to: { id: 's-default', name: 'default', driver: 'postgres', path: [] },
    });
  });
});

describe('creating an imported data source in the workspace (T514, AC-358, AC-163)', () => {
  it('asks for its secrets, tests exactly the file’s settings, and is decided only once the test passes', async () => {
    let passing = false;
    const { fetchMock, seal, last } = shown([REPLICA], (url) =>
      url === '/api/data-sources/test'
        ? answer(200, {
            ok: passing,
            testId: passing ? 't-2' : 't-1',
            checks: passing
              ? [{ id: 'connect', status: 'passed', durationMs: 4 }]
              : [{ id: 'connect', status: 'failed', durationMs: 4, error: 'password authentication failed' }],
          })
        : answer(404, {}),
    );
    const replica = row('emea_replica');
    await userEvent.click(within(replica).getByRole('radio', { name: 'Create it' }));
    // The file's settings, read-only, and its secret typed here.
    expect(within(replica).getByText('pg-replica-1.sales.internal:5432 / sales')).toBeTruthy();
    expect(within(replica).getByText('Password, as cube_reader')).toBeTruthy();
    const test = within(replica).getByRole('button', { name: 'Test connection' });
    expect((test as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(within(replica).getByLabelText(/^Password/), 'wrong');
    await userEvent.click(test);
    await vi.waitFor(() => {
      expect(within(replica).getByRole('status').textContent).toMatch(/^Failed at Connect · /);
    });
    expect(last()['emea_replica']).toBeUndefined();
    const sent = fetchMock.mock.calls.find(([url]) => url === '/api/data-sources/test')!;
    expect(JSON.parse(String(sent[1]!.body))).toEqual({
      folderId: 'mine',
      driver: 'postgres',
      authMethod: 'password',
      fields: REPLICA.fields,
      sealed: { password: ENVELOPE },
    });
    expect(seal).toHaveBeenCalledWith('postgres', 'password', REPLICA.fields, 'wrong');

    passing = true;
    await userEvent.clear(within(replica).getByLabelText(/^Password/));
    await userEvent.type(within(replica).getByLabelText(/^Password/), 'right');
    await userEvent.click(within(replica).getByRole('button', { name: 'Test again' }));
    expect(await within(replica).findByText(/Every check passed/)).toBeTruthy();
    expect(last()['emea_replica']).toMatchObject({
      kind: 'create',
      name: 'emea_replica',
      testId: 't-2',
      trials: ['t-1'],
      sealed: { password: ENVELOPE },
    });

    // A secret changed after the pass: tested again before it is decided.
    await userEvent.type(within(replica).getByLabelText(/^Password/), '!');
    expect(last()['emea_replica']).toBeUndefined();
  });

  it('refuses a name the target already holds until it is mapped or renamed (AC-282, state P)', async () => {
    const taken = [...SOURCES, listed('s-emea', 'emea_replica', 'postgres', 'emea', ['Sales', 'EMEA'])];
    const { last } = shown(
      [REPLICA],
      (url) =>
        url === '/api/data-sources/test'
          ? answer(200, { ok: true, testId: 't-9', checks: [{ id: 'connect', status: 'passed' }] })
          : answer(404, {}),
      taken,
    );
    const replica = row('emea_replica');
    await userEvent.click(within(replica).getByRole('radio', { name: 'Create it' }));
    expect(await within(replica).findByText('Name taken')).toBeTruthy();
    expect(within(replica).getByRole('alert').textContent).toContain(
      'Sales / EMEA already has a data source named emea_replica. A new one can’t take that name there.',
    );
    await userEvent.type(within(replica).getByLabelText(/^Password/), 'right');
    expect((within(replica).getByRole('button', { name: 'Test connection' }) as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(within(replica).getByRole('button', { name: 'Create under another name' }));
    const name = within(replica).getByLabelText(/^Name/);
    expect(document.activeElement).toBe(name);
    await userEvent.clear(name);
    await userEvent.type(name, 'emea_replica_2');
    await userEvent.click(within(replica).getByRole('button', { name: 'Test connection' }));
    await within(replica).findByText(/Every check passed/);
    expect(last()['emea_replica']).toMatchObject({ kind: 'create', name: 'emea_replica_2' });

    // Or the existing one instead: mapped, and chosen.
    await userEvent.clear(name);
    await userEvent.type(name, 'emea_replica');
    await userEvent.click(within(replica).getByRole('button', { name: 'Use the existing one instead' }));
    expect(last()['emea_replica']).toEqual({
      kind: 'map',
      to: { id: 's-emea', name: 'emea_replica', driver: 'postgres', path: ['Sales', 'EMEA'] },
    });
  });
});
