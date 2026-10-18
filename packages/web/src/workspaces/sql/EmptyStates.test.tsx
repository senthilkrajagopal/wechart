import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Me } from '../../shell/AccountMenu';
import { ME_QUERY } from '../../shell/me';
import { NoSourceToRun } from './EmptyStates';
import type { SqlSourceRow } from './sources';
import { SqlWorkspace } from './SqlWorkspace';

/**
 * T799 (AC-466; design 17, state H): WHEN the user first opens the
 * workspace, THE SYSTEM SHALL show one tab, "Query 1", with no data source
 * chosen, focus on the picker, and "Choose a data source to write SQL
 * against."; WHEN a member may run SQL on no data source, it SHALL say "No
 * data source runs SQL for you yet. A Super-Admin turns the SQL runner on
 * for each data source. Your own data sources in My workspace need no
 * switch." with a link to Data sources.
 */
const CHOOSE = 'Choose a data source to write SQL against.';
const NONE =
  'No data source runs SQL for you yet. A Super-Admin turns the SQL runner on for each data source. Your own data sources in My workspace need no switch.';

const row = (over: Partial<SqlSourceRow> & Pick<SqlSourceRow, 'id' | 'name'>): SqlSourceRow => ({
  driver: 'postgres',
  cubeStore: false,
  folderId: 'f-sales',
  folderPath: [{ id: 'f-sales', title: 'Sales' }],
  inWorkspace: false,
  runner: 'on',
  ...over,
});
const writer: Me = {
  name: 'Wren Writer',
  groups: [],
  superAdmin: false,
  readWrite: true,
  security: 'oidc',
};

afterEach(() => {
  vi.unstubAllGlobals();
  // Each test a first visit: the workspace keeps its tabs in this browser (T801).
  localStorage.clear();
});

/** The workspace, its picker answered with `rows`. */
function openWith(rows: readonly SqlSourceRow[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url === '/api/sql/sources'
          ? new Response(JSON.stringify(rows), { status: 200 })
          : new Response('{}', { status: 404 }),
      ),
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(ME_QUERY.queryKey, writer);
  render(
    <QueryClientProvider client={client}>
      <SqlWorkspace />
    </QueryClientProvider>,
  );
}

describe('a first visit (T799, AC-466)', () => {
  it('shows one tab, “Query 1”, no data source chosen, focus on the picker, and the sentence to choose one', async () => {
    openWith([row({ id: 'on', name: 'emea_replica' })]);

    expect(await screen.findByText(CHOOSE)).toBeTruthy();
    const tabs = screen.getByRole('tablist', { name: 'SQL tabs' });
    const each = within(tabs).getAllByRole('tab');
    expect(each.map((tab) => tab.textContent)).toEqual(['Query 1']);
    expect(each[0]!.getAttribute('aria-selected')).toBe('true');
    const picker = screen.getByRole('button', { name: 'Data source Choose…' });
    expect(document.activeElement).toBe(picker);
    expect(screen.queryByText(NONE)).toBeNull();
  });

  it('tells a member who may run SQL on no data source so, with a link to Data sources', async () => {
    // Only an off one, which they see off but can't run on.
    openWith([row({ id: 'off', name: 'emea_snowflake', runner: 'off' })]);

    const said = await screen.findByText(NONE);
    const link = within(said.closest('.sql-empty')!).getByRole('link', {
      name: 'Go to Data sources',
    });
    expect(link.getAttribute('href')).toBe('/data-sources');
    expect(screen.queryByText(CHOOSE)).toBeNull();
    // Still one tab, with nothing chosen.
    expect(within(screen.getByRole('tablist', { name: 'SQL tabs' })).getAllByRole('tab')).toHaveLength(1);
  });

  it('counts their own workspace source as one to run on', async () => {
    openWith([
      row({ id: 'ws', name: 'sandbox_pg', inWorkspace: true, runner: 'no-switch', folderPath: [] }),
    ]);
    expect(await screen.findByText(CHOOSE)).toBeTruthy();
  });

  it('counts Cube Store, while on, as one to run on', async () => {
    openWith([
      row({ id: 'cubestore', name: 'Cube Store', driver: null, cubeStore: true, folderPath: [] }),
    ]);
    expect(await screen.findByText(CHOOSE)).toBeTruthy();
  });

  it('tells a member with nothing listed at all the same, the likeliest case', async () => {
    openWith([]);
    expect(await screen.findByText(NONE)).toBeTruthy();
  });

  it('says neither sentence while the data sources are still being read', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(ME_QUERY.queryKey, writer);
    render(
      <QueryClientProvider client={client}>
        <SqlWorkspace />
      </QueryClientProvider>,
    );
    // Its name carries its state since T800 (AC-450).
    expect(await screen.findByRole('tab', { name: 'Query 1, Not run yet' })).toBeTruthy();
    expect(screen.queryByText(CHOOSE)).toBeNull();
    expect(screen.queryByText(NONE)).toBeNull();
  });

  it('never tells a Super-Admin, who may turn one on, that a Super-Admin turns it on', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify([row({ id: 'off', name: 'emea', runner: 'off' })]), {
            status: 200,
          }),
        ),
      ),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(ME_QUERY.queryKey, { ...writer, superAdmin: true });
    render(
      <QueryClientProvider client={client}>
        <SqlWorkspace />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(CHOOSE)).toBeTruthy();
    expect(screen.queryByText(NONE)).toBeNull();
  });

  it('draws its sentence with an icon, and its action as a link', () => {
    render(<NoSourceToRun />);
    const box = screen.getByText(NONE).closest('.sql-empty')!;
    // Design 17's H2 draws it with the off icon.
    expect(box.querySelector('svg[data-icon="off"]')).not.toBeNull();
    expect(within(box as HTMLElement).getByRole('link', { name: 'Go to Data sources' })).toBeTruthy();
  });
});
