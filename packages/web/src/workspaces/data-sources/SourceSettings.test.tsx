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
      if (url in extra) return Response.json(extra[url]);
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
    serve(source());
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
