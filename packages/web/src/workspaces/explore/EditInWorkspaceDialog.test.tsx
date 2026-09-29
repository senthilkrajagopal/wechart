import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EditInWorkspaceDialog } from './EditInWorkspaceDialog';

/**
 * T348 (AC-278, AC-279; design 04, state D; surface 5): copying a shared
 * dashboard into My workspace. It says what is always copied — the
 * dashboard, its own charts and the library charts it shows — offers its
 * data sources unticked, "only if you'll change them", and copies only
 * what is ticked. The copy opens to be edited.
 */
const offered = {
  dashboard: { id: 'd1', title: 'Revenue overview', path: ['Shared', 'Sales', 'EMEA'] },
  fileName: 'revenue-overview.wechart.json',
  ownCharts: [
    { id: 'l1', title: 'A' },
    { id: 'l2', title: 'B' },
  ],
  libraryCharts: [{ id: 'c1', title: 'Margin', path: ['Shared', 'Sales'], chartIds: ['c1'] }],
  models: [],
  dataSources: [
    {
      id: 'ds1',
      name: 'emea_replica',
      driver: 'postgres',
      authMethod: 'password',
      fields: {},
      description: null,
      folderPath: ['Shared', 'Sales', 'EMEA'],
      boundBy: [],
      chartIds: ['l1'],
      byDashboard: false,
    },
    {
      id: 'ds2',
      name: 'finance_ledger',
      driver: 'postgres',
      authMethod: 'password',
      fields: {},
      description: null,
      folderPath: ['Shared', 'Finance'],
      boundBy: [],
      chartIds: ['l2'],
      byDashboard: false,
    },
  ],
  notOffered: { charts: 0, models: 0, dataSources: 0, folders: 0, usedBy: [] },
  viewOnly: false,
};

function shown() {
  const sent: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/export/dashboards/d1')
        return Promise.resolve(new Response(JSON.stringify(offered)));
      // writer writes /Sales/EMEA, and only reads /Finance.
      if (url === '/api/data-sources/ds1')
        return Promise.resolve(new Response(JSON.stringify({ id: 'ds1', canWrite: true })));
      if (url === '/api/data-sources/ds2')
        return Promise.resolve(new Response(JSON.stringify({ id: 'ds2', canWrite: false })));
      sent.push(`${init?.method ?? 'GET'} ${url} ${String(init?.body ?? '')}`);
      if (url === '/api/workspace/copies')
        return Promise.resolve(
          new Response(JSON.stringify({ kind: 'dashboard', id: 'copy1', created: true }), {
            status: 201,
          }),
        );
      if (url === '/api/data-sources/ds1/copy')
        return Promise.resolve(new Response(JSON.stringify({ id: 'dscopy' }), { status: 201 }));
      return Promise.resolve(new Response('{}', { status: 404 }));
    }),
  );
  const onCopied = vi.fn();
  const onClose = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <EditInWorkspaceDialog
        dashboardId="d1"
        title="Revenue overview"
        targetPath="Sales / EMEA"
        onCopied={onCopied}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return { sent, onCopied, onClose };
}
/** A data source's box, once whether it may be copied is known. */
async function boxOf(name: RegExp, disabled: boolean) {
  const dialog = screen.getByRole('dialog', { name: 'Edit in my workspace' });
  const box = (await within(dialog).findByRole('checkbox', { name })) as HTMLInputElement;
  await vi.waitFor(() => {
    expect(box.disabled).toBe(disabled);
  });
  return box;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Edit in my workspace, for a dashboard (T348, AC-279)', () => {
  it('says what is always copied, and offers its data sources unticked', async () => {
    shown();
    const dialog = screen.getByRole('dialog', { name: 'Edit in my workspace' });
    expect(dialog.textContent).toContain(
      'Copies Revenue overview into My workspace. You’ll propose it back to Sales / EMEA.',
    );
    expect(await within(dialog).findByTestId('always-copied')).toHaveProperty(
      'textContent',
      'Always copied: the dashboard, its 2 local charts and the 1 library chart it shows.',
    );
    const source = within(dialog).getByRole('checkbox', { name: /emea_replica/ });
    expect((source as HTMLInputElement).checked).toBe(false);
    expect(dialog.textContent).toContain('Anything you don’t copy is used from its folder.');
  });

  it('copies the dashboard alone unless a data source is ticked, then opens the copy', async () => {
    const { sent, onCopied } = shown();
    const dialog = screen.getByRole('dialog', { name: 'Edit in my workspace' });
    await within(dialog).findByRole('checkbox', { name: /emea_replica/ });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy and edit' }));
    await vi.waitFor(() => {
      expect(onCopied).toHaveBeenCalledWith('copy1');
    });
    expect(sent).toEqual(['POST /api/workspace/copies {"kind":"dashboard","id":"d1"}']);
  });

  it('shows a data source in a folder the user only reads, and doesn’t offer it (T348’s review)', async () => {
    shown();
    // Once it's known which may be copied: the one they write in is offered.
    expect((await boxOf(/emea_replica/, false)).checked).toBe(false);
    const box = await boxOf(/finance_ledger/, true);
    expect(box.closest('label')?.textContent).toContain('Data source · Finance · view only here');
  });

  it('closes on Escape, as every dialog here does (T348’s review)', async () => {
    const { onClose } = shown();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('copies a ticked data source too', async () => {
    const { sent, onCopied } = shown();
    const dialog = screen.getByRole('dialog', { name: 'Edit in my workspace' });
    await userEvent.click(await boxOf(/emea_replica/, false));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy and edit' }));
    await vi.waitFor(() => {
      expect(onCopied).toHaveBeenCalledWith('copy1');
    });
    expect(sent).toEqual([
      'POST /api/data-sources/ds1/copy ',
      'POST /api/workspace/copies {"kind":"dashboard","id":"d1"}',
    ]);
  });
});
