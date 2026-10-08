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
  fields: {
    host: 'pg-replica-1.sales.internal',
    port: 5432,
    database: 'sales',
    user: 'cube_reader',
    ssl: true,
  },
  description: 'Read replica for EMEA order cubes.',
};
const DW = {
  kind: 'data-source' as const,
  name: 'sales_dw',
  driver: 'snowflake',
  authMethod: 'key-pair',
  fields: {
    account: 'acme-emea',
    warehouse: 'REPORTING_WH',
    database: 'SALES',
    username: 'CUBE_SVC',
  },
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
  /** Those whose names are held, as Review says them (T719). */
  named: Readonly<
    Record<string, { name: string; path: readonly string[] | null; onPath: boolean }>
  > = {},
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
  const onDecisions =
    vi.fn<(decisions: Readonly<Record<string, SourceDecision | undefined>>) => void>();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ImportSources
        sources={sources}
        target={{ id: 'emea', path: ['Sales', 'EMEA'] }}
        held={named}
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
    expect(
      within(list)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('aria-label')),
    ).toEqual(['sales_dw, Same name, Snowflake, in Sales', 'default, PostgreSQL, in Shared']);
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
              : [
                  {
                    id: 'connect',
                    status: 'failed',
                    durationMs: 4,
                    error: 'password authentication failed',
                  },
                ],
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

  // T719 (AC-358; R71): a name never changes, so one is created under its own name alone.
  it('creates it under its own name only: the name is the file’s, not to be edited', async () => {
    shown([REPLICA], () => answer(404, {}));
    const replica = row('emea_replica');
    await userEvent.click(within(replica).getByRole('radio', { name: 'Create it' }));
    const name = within(replica).getByLabelText(/^Name/);
    expect((name as HTMLInputElement).readOnly).toBe(true);
    expect((name as HTMLInputElement).value).toBe('emea_replica');
    expect(within(replica).queryByRole('button', { name: 'Create under another name' })).toBeNull();
  });
});

/**
 * T719 (AC-358; R71, R72, R73): one whose name has landed, or a draft in the
 * workspace holds, is mapped to that one: nothing is asked of it, and it
 * offers no Map and no Create. One off the target's path blocks the import,
 * saying so, and nothing of a folder the user can't see.
 */
describe('an imported data source whose name is held (T719, AC-358)', () => {
  it('is mapped to the one holding its name, asking nothing', async () => {
    const { last } = shown([REPLICA], () => answer(404, {}), SOURCES, {
      emea_replica: { name: 'EMEA_replica', path: ['Sales'], onPath: true },
    });
    const replica = row('emea_replica');
    expect(within(replica).getByRole('status').textContent).toBe('Mapped');
    expect(within(replica).getByTestId('held').textContent).toBe(
      'Its name is EMEA_replica’s, in Sales: it is mapped to that one, and not imported.',
    );
    expect(within(replica).queryByRole('radio')).toBeNull();
    expect(within(replica).queryByRole('button', { name: 'Test connection' })).toBeNull();
    expect(last()['emea_replica']).toEqual({ kind: 'held' });
  });

  it('blocks the import while that one is off the target’s path, naming no folder unseen', async () => {
    const { last } = shown([REPLICA], () => answer(404, {}), SOURCES, {
      emea_replica: { name: 'emea_replica', path: null, onPath: false },
    });
    const replica = row('emea_replica');
    expect(within(replica).getByRole('status').textContent).toBe('Off the target’s path');
    expect(within(replica).getByRole('alert').textContent).toBe(
      'Its name is that of a data source in a folder you can’t see, not in Sales / EMEA or a folder above it, so a model there couldn’t use it. Choose a target on its path.',
    );
    expect(last()['emea_replica']).toBeUndefined();
  });
});
