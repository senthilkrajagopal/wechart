import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Me } from '../../shell/AccountMenu';
import { ME_QUERY } from '../../shell/me';
import { SourcePicker } from './SourcePicker';
import type { SqlSourceRow } from './sources';
import { SqlWorkspace } from './SqlWorkspace';

/**
 * T798 (AC-447, AC-373): the SQL runner workspace's data source picker. A
 * custom listbox grouped by folder path, My workspace's first with "Yours",
 * then each folder, then Cube Store at the root; each row with its driver
 * and the runner's state as an icon and a label, "SQL runner on" or "Off".
 * Choosing an off source shows the off panel, with Turn on… for a
 * Super-Admin, and no editor that can run.
 */
const SALES = { id: 'f-sales', title: 'Sales' };
const EMEA = { id: 'f-emea', title: 'EMEA' };
const row = (over: Partial<SqlSourceRow> & Pick<SqlSourceRow, 'id' | 'name'>): SqlSourceRow => ({
  driver: 'postgres',
  cubeStore: false,
  folderId: EMEA.id,
  folderPath: [SALES, EMEA],
  inWorkspace: false,
  runner: 'on',
  ...over,
});
const ROWS: readonly SqlSourceRow[] = [
  row({ id: 'ws', name: 'sandbox_pg', inWorkspace: true, runner: 'no-switch', folderPath: [] }),
  row({ id: 'on', name: 'emea_replica' }),
  row({ id: 'off', name: 'emea_snowflake', driver: 'snowflake', runner: 'off' }),
  row({ id: 'fx', name: 'fx_warehouse', folderId: 'f-fin', folderPath: [{ id: 'f-fin', title: 'Finance' }] }),
  row({ id: 'root', name: 'default', folderId: 'root', folderPath: [] }),
  row({
    id: 'cubestore',
    name: 'Cube Store',
    driver: null,
    cubeStore: true,
    folderId: 'root',
    folderPath: [],
  }),
];

afterEach(() => {
  vi.unstubAllGlobals();
  // Each test a first visit: the workspace keeps its tabs in this browser (T801).
  localStorage.clear();
});

const wrap = (node: React.ReactNode, me?: Me) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (me !== undefined) client.setQueryData(ME_QUERY.queryKey, me);
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
};

describe('the data source picker (T798, AC-447)', () => {
  it('is a custom listbox grouped by folder path, My workspace’s first with “Yours”, Cube Store at the root', async () => {
    wrap(<SourcePicker rows={ROWS} value="" onChoose={() => undefined} />);

    const button = screen.getByRole('button', { name: /Data source/ });
    expect(button.textContent).toContain('Choose…');
    await userEvent.click(button);

    const list = screen.getByRole('listbox', { name: 'Data sources' });
    const groups = within(list).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'My workspace Yours',
      'Shared / Finance',
      'Shared / Sales / EMEA',
      'Shared',
    ]);
    expect(within(groups[0]!).getAllByRole('option').map((option) => option.textContent)).toEqual([
      expect.stringContaining('sandbox_pg'),
    ]);
    // The root's one group: its data source, then Cube Store.
    expect(within(groups[3]!).getAllByRole('option').map((option) => option.textContent)).toEqual([
      expect.stringContaining('default'),
      expect.stringContaining('Cube Store'),
    ]);
  });

  it('gives each row its driver and the runner’s state as an icon and a label, never colour alone', async () => {
    wrap(<SourcePicker rows={ROWS} value="" onChoose={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: /Data source/ }));

    const option = (name: string) =>
      screen.getAllByRole('option').find((each) => each.textContent?.includes(name))!;
    for (const [name, driver, state, icon] of [
      ['emea_replica', 'PostgreSQL', 'SQL runner on', 'ok'],
      ['emea_snowflake', 'Snowflake', 'Off', 'off'],
      ['sandbox_pg', 'PostgreSQL', 'Yours · no switch', 'ok'],
      ['Cube Store', 'Cube Store rollups', 'SQL runner on', 'ok'],
    ] as const) {
      const each = option(name);
      expect(each.textContent, name).toContain(driver);
      expect(each.querySelector('.sql-picker__state')?.textContent, name).toBe(state);
      expect(each.querySelector(`.sql-picker__state svg[data-icon="${icon}"]`), name).not.toBeNull();
    }
  });

  it('hands back the one chosen, and names it on its button with its folder and state', async () => {
    const onChoose = vi.fn();
    const { rerender } = wrap(<SourcePicker rows={ROWS} value="" onChoose={onChoose} />);
    await userEvent.click(screen.getByRole('button', { name: /Data source/ }));
    await userEvent.click(screen.getByRole('option', { name: /emea_replica/ }));
    expect(onChoose).toHaveBeenCalledWith('on');

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <SourcePicker rows={ROWS} value="on" onChoose={onChoose} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('button', { name: /Data source/ }).textContent).toContain(
      'emea_replica',
    );
    const place = screen.getByTestId('sql-picker-chosen');
    expect(place.textContent).toBe('Sales / EMEA · SQL runner on');
  });
});

/** The API, as the workspace asks it: the picker's rows and an off source's page. */
const OFF_SOURCE = {
  id: 'off',
  folderId: EMEA.id,
  name: 'emea_snowflake',
  driver: 'snowflake',
  authMethod: 'password',
  fields: { account: 'acme', user: 'wechart_ro', warehouse: 'wh', database: 'emea' },
  secrets: {},
  targetFolderId: null,
  origin: null,
  version: 3,
  updatedAt: '2026-10-17T10:00:00Z',
  folderPath: [SALES, EMEA],
  canWrite: true,
  inWorkspace: false,
  description: null,
  sqlRunner: { on: false },
  sqlAccess: { tab: true, runs: false, why: 'The SQL runner is off for this data source: a Super-Admin turns it on.' },
};
const answering = () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const json = (body: unknown) =>
        Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
      if (url === '/api/sql/sources') return json(ROWS);
      if (url === '/api/data-sources/off') return json(OFF_SOURCE);
      if (url.startsWith('/api/folders/')) return Promise.resolve(new Response('{}', { status: 404 }));
      return Promise.resolve(new Response('{}', { status: 404 }));
    }),
  );
};
const signedIn = (who: Partial<Me>): Me => ({
  name: 'Wren Writer',
  groups: [],
  superAdmin: false,
  readWrite: true,
  security: 'oidc',
  ...who,
});
async function chooseOff(me: Me) {
  answering();
  wrap(<SqlWorkspace />, me);
  // The picker's button, named by its label and what's chosen: not the pane's rail.
  await userEvent.click(await screen.findByRole('button', { name: 'Data source Choose…' }));
  await userEvent.click(await screen.findByRole('option', { name: /emea_snowflake/ }));
  return screen.findByRole('heading', { name: /The SQL runner is off for emea_snowflake/ });
}

describe('an off source chosen in the workspace (T798, AC-447, AC-373)', () => {
  it('shows a member the off panel, with no Turn on… and no editor that can run', async () => {
    const panel = (await chooseOff(signedIn({}))).closest('section')!;

    expect(within(panel).getByText(/Only a Super-Admin can turn it on/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Turn on the SQL runner/ })).toBeNull();
    // The editor's place holds the panel instead (T798's review).
    expect(screen.queryByTestId('sql-editor-area')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Run/ })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /SQL/ })).toBeNull();
  });

  it('shows a Super-Admin the off panel with Turn on…, and no editor that can run', async () => {
    await chooseOff(signedIn({ superAdmin: true }));

    expect(screen.getByRole('button', { name: /Turn on the SQL runner…/ })).toBeTruthy();
    expect(screen.queryByTestId('sql-editor-area')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Run/ })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /SQL/ })).toBeNull();
  });
});
