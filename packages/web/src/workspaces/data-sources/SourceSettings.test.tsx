import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SourceSettings, type StoredSource } from './SourceSettings';

/**
 * T698 (AC-343, AC-284; design 03 of 2026-09-27, pins 2–4 and state A; the
 * data sources critique's SRC-02, SRC-03, SRC-06, SRC-07, SRC-19 and Q6): a
 * data source's page as design 03 draws it. A workspace copy proposes
 * itself from its head, once its changes are saved or discarded; a shared
 * one's version line says who approved it and when; its head is the item
 * mark, its name, and its badges as drawn.
 *
 * The page's router is the app's; here it is a stand-in, as no route changes.
 */
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ history: { push: vi.fn() } }),
  useBlocker: () => ({ status: 'idle' }),
}));

const SALES = [
  { id: 'sales', title: 'Sales' },
  { id: 'emea', title: 'EMEA' },
];

const source = (over: Partial<StoredSource> = {}): StoredSource => ({
  id: 'ds-1',
  folderId: 'emea',
  name: 'emea_replica',
  driver: 'postgres',
  authMethod: 'password',
  fields: { host: 'db-1', port: 5432, database: 'sales', user: 'cube_reader', ssl: false },
  secrets: { password: { stored: true } },
  targetFolderId: null,
  origin: null,
  version: 3,
  updatedAt: '2026-09-24T09:40:00.000Z',
  folderPath: SALES,
  canWrite: true,
  inWorkspace: false,
  description: null,
  ...over,
});

const copy = source({
  id: 'ds-2',
  folderId: 'ws:wren/project',
  inWorkspace: true,
  targetFolderId: 'emea',
  origin: { id: 'ds-1', version: 3, folderId: 'emea' },
  folderPath: [{ id: 'ws:wren/project', title: 'project-2026-10-08-1200' }],
  originPath: SALES,
  targetPath: SALES,
  version: 1,
});

const ME = { name: 'Wren Writer', groups: ['sales-rw'], superAdmin: false, readWrite: true };

function serve(stored: StoredSource, extra: Record<string, unknown> = {}) {
  const asked: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      asked.push(`${init?.method ?? 'GET'} ${url}`);
      // null: refused, as for one who may not see it.
      if (url in extra)
        return extra[url] === null
          ? new Response(null, { status: 404 })
          : Response.json(extra[url]);
      if (url === `/api/data-sources/${stored.id}`) return Response.json(stored);
      if (url === '/api/me') return Response.json({ ...ME, security: 'oidc' });
      if (url === '/api/data-sources') return Response.json([]);
      if (url === `/api/history/data-source/${stored.id}`)
        return Response.json({
          current: 3,
          versions: [
            {
              version: 3,
              at: '2026-09-24T09:40:00.000Z',
              title: 'emea_replica',
              author: { key: 'wren', name: 'Wren Writer' },
              approver: { key: 'ada', name: 'Ada Admin' },
              description: null,
              current: true,
            },
          ],
        });
      if (url === '/api/proposals/check')
        return Response.json({
          targetPath: ['Shared', 'Sales', 'EMEA'],
          items: [
            {
              kind: 'data-source',
              id: stored.id,
              title: stored.name,
              landsInPath: ['Shared', 'Sales', 'EMEA'],
              replaces: { id: 'ds-1', version: 3, copiedFrom: true },
            },
          ],
        });
      return new Response(null, { status: 404 });
    }),
  );
  return asked;
}

function open(id: string) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SourceSettings id={id} />
    </QueryClientProvider>,
  );
}

const head = () => document.querySelector<HTMLElement>('.source-settings__head')!;

beforeEach(() => {
  window.history.replaceState(null, '', '/explore/data-sources/x');
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a workspace copy proposes itself from its head (SRC-02; pin 3, AC-284)', () => {
  it('has “Propose to ‹its target›…” as the head’s primary, last, after Discard my copy…', async () => {
    serve(copy);
    open('ds-2');
    const propose = await screen.findByRole('button', { name: 'Propose to Sales / EMEA…' });
    expect(propose.className).toMatch(/\bbtn-primary\b/);
    expect(
      within(head())
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Discard my copy…', 'Propose to Sales / EMEA…']);
    expect(propose.getAttribute('aria-disabled')).toBeNull();
  });

  it('waits for a save, saying why, while a change is unsaved, then opens the proposal', async () => {
    const asked = serve(copy);
    open('ds-2');
    const propose = await screen.findByRole('button', { name: 'Propose to Sales / EMEA…' });
    await userEvent.click(screen.getByRole('tab', { name: 'General' }));
    await userEvent.type(screen.getByLabelText('Description'), 'For EMEA.');
    expect(propose.getAttribute('aria-disabled')).toBe('true');
    expect(propose.title).toBe('Save or discard your changes first.');
    // Said to a screen reader too, as its description.
    expect(
      document.getElementById(propose.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Save or discard your changes first.');
    await userEvent.click(propose);
    expect(asked).not.toContain('POST /api/proposals/check');
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(propose.getAttribute('aria-disabled')).toBeNull();
    await userEvent.click(propose);
    await waitFor(() => {
      expect(asked).toContain('POST /api/proposals/check');
    });
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('offers none on a shared one, nor on a workspace one with no target yet', async () => {
    serve(source({ id: 'ds-3', inWorkspace: true, folderPath: [], origin: null }));
    open('ds-3');
    await screen.findByRole('heading', { level: 1, name: 'emea_replica' });
    expect(screen.queryByRole('button', { name: /^Propose to/ })).toBeNull();
  });
});

describe('its head and version line as design 03 draws them (SRC-03, SRC-06, SRC-07; Q6)', () => {
  it('marks it “◍”, says a shared one’s version and who approved it, with its access badge’s eye', async () => {
    // Its approval in its own answer (T698 follow-up).
    serve(
      source({
        approved: {
          version: 3,
          at: '2026-09-24T09:40:00.000Z',
          by: { name: 'Ada Admin' },
        },
      }),
    );
    open('ds-1');
    await screen.findByRole('heading', { level: 1, name: 'emea_replica' });
    // The item-kind mark, not the driver's monogram (data-sources-Q6).
    expect(head().querySelector('.itemicon')?.textContent).toBe('◍');
    expect(head().textContent).not.toContain('Pg');
    await waitFor(() => {
      expect(document.querySelector('.source-settings__version')?.textContent).toBe(
        'Version 3 · approved 24 Sep by Ada Admin',
      );
    });
    const access = document.querySelector<HTMLElement>('.source-settings__access')!;
    expect(access.textContent).toBe('Read-only · in Sales / EMEA');
    expect(access.querySelector('svg[data-icon="eye"]')).not.toBeNull();
    // The driver an outlined badge.
    expect(head().querySelector('.badge.line')?.textContent).toBe('PostgreSQL');
  });

  it('says a version kept with no approver as saved, as History does (T698’s second review)', async () => {
    serve(source({ approved: { version: 3, at: '2026-09-24T09:40:00.000Z', by: null } }));
    open('ds-1');
    await screen.findByRole('heading', { level: 1, name: 'emea_replica' });
    await waitFor(() => {
      expect(document.querySelector('.source-settings__version')?.textContent).toBe(
        'Version 3 · saved 24 Sep',
      );
    });
  });

  it('says who approved it to a view-only reader, whose history is none, from its own answer (T698 follow-up; note J)', async () => {
    serve(
      source({
        canWrite: false,
        approved: {
          version: 3,
          at: '2026-09-24T09:40:00.000Z',
          by: { name: 'Ada Admin' },
        },
      }),
      // Not theirs: the history answers as for none.
      { '/api/history/data-source/ds-1': null },
    );
    open('ds-1');
    await screen.findByRole('heading', { level: 1, name: 'emea_replica' });
    await waitFor(() => {
      expect(document.querySelector('.source-settings__version')?.textContent).toBe(
        'Version 3 · approved 24 Sep by Ada Admin',
      );
    });
    expect(screen.queryByRole('button', { name: 'History' })).toBeNull();
  });

  it('says a copy’s version once, as where it was copied from', async () => {
    serve(copy);
    open('ds-2');
    await screen.findByRole('heading', { level: 1, name: 'emea_replica' });
    expect(document.querySelector('.source-settings__origin')?.textContent).toBe(
      'Copied from Sales / EMEA › emea_replica · version 3',
    );
    expect(document.querySelector('.source-settings__version')).toBeNull();
  });

  it('puts the crumbs, head, line and tabs in one band, the tabs across its foot', async () => {
    serve(source());
    open('ds-1');
    await screen.findByRole('heading', { level: 1, name: 'emea_replica' });
    const band = document.querySelector<HTMLElement>('.source-settings__pagehead')!;
    expect(band).not.toBeNull();
    expect(
      [...band.children].map((child) => child.getAttribute('aria-label') ?? child.className),
    ).toEqual([
      'Breadcrumb',
      'source-settings__head',
      'source-settings__line',
      'source-settings__line',
      'Data source',
    ]);
  });
});

/**
 * T823 (AC-464, AC-373; design 17's N): the sixth tab, renamed "SQL
 * runner", to those AC-373 names; and "Open in SQL runner" first in the
 * page head's ⋯ for one who may run SQL there now.
 */
describe('its “SQL runner” tab and “Open in SQL runner” (T823, AC-464, AC-373)', () => {
  const on = {
    sqlRunner: { on: true, confirmedBy: { name: 'Ada Admin' }, confirmedAt: '2026-10-01T09:12:00.000Z' },
    sqlAccess: { tab: true, runs: true },
  };

  it('names the sixth tab “SQL runner”, and offers “Open in SQL runner” first in the head’s ⋯', async () => {
    serve(source(on));
    open('ds-1');
    const tabs = within(await screen.findByRole('tablist', { name: 'Data source' }));
    expect(tabs.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'General',
      'Connection',
      'Test history',
      'Usage',
      'In Cube',
      'SQL runner',
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'More actions for emea_replica' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Open in SQL runner',
      'Delete data source…',
    ]);
  });

  it('has the ⋯ for “Open in SQL runner” alone on its owner’s source in My workspace', async () => {
    serve({ ...copy, sqlAccess: { tab: true, runs: true } });
    open('ds-2');
    await userEvent.click(
      await screen.findByRole('button', { name: 'More actions for emea_replica' }),
    );
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Open in SQL runner',
    ]);
  });

  it('offers no “Open in SQL runner” while it is off, nor the tab to one AC-373 doesn’t name', async () => {
    serve(source({ ...on, sqlAccess: { tab: true, runs: false } }));
    open('ds-1');
    await userEvent.click(
      await screen.findByRole('button', { name: 'More actions for emea_replica' }),
    );
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Delete data source…',
    ]);
  });

  it('shows neither the tab nor the ⋯ item to a reader the API gives no tab', async () => {
    serve(source({ canWrite: false, sqlRunner: on.sqlRunner }));
    open('ds-1');
    const tabs = within(await screen.findByRole('tablist', { name: 'Data source' }));
    expect(tabs.queryByRole('tab', { name: /SQL/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More actions for emea_replica' })).toBeNull();
  });
});
