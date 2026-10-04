import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GroupsPreview } from './GroupsPreview';

/**
 * T438 (AC-166; design 08 of 2026-09-27, state E): with sign-in on, a
 * Super-Admin previews as one or more AD groups: chosen as chips from the
 * "AD group" picker, then what they reach — each folder by its path, and
 * how — and what the model's policies give them, then a dashboard to open as
 * them. This replaces the JSON editor and "Find a dashboard".
 */
function serve() {
  const asked: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      asked.push(url);
      if (url === '/api/access/known-groups')
        return Response.json({ groups: ['emea-viewers', 'finance', 'sales-ro'] });
      if (url.startsWith('/api/access/reach?')) {
        const groups = new URL(url, 'http://x').searchParams.getAll('groups');
        return Response.json({
          groups,
          folders: groups.includes('budgets')
            ? [
                {
                  id: 'f',
                  path: ['Shared', 'Finance'],
                  reach: 'above',
                  write: false,
                  kinds: 'all',
                },
                {
                  id: 'b',
                  path: ['Shared', 'Finance', 'Budgets'],
                  reach: 'write',
                  write: true,
                  kinds: 'all',
                },
              ]
            : groups.includes('emea-viewers')
              ? [
                  {
                    id: 's',
                    path: ['Shared', 'Sales'],
                    reach: 'above',
                    write: false,
                    kinds: 'dashboards',
                  },
                  {
                    id: 'e',
                    path: ['Shared', 'Sales', 'EMEA'],
                    reach: 'view',
                    write: false,
                    kinds: 'dashboards',
                  },
                ]
              : groups.includes('finance')
                ? [
                    {
                      id: 'f',
                      path: ['Shared', 'Finance'],
                      reach: 'write',
                      write: true,
                      kinds: 'all',
                    },
                  ]
                : [],
        });
      }
      if (url.startsWith('/api/search?'))
        return Response.json([{ kind: 'dashboard', id: 'd1', title: 'Revenue overview' }]);
      return new Response(null, { status: 404 });
    }),
  );
  return asked;
}

beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function open() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <GroupsPreview
        model={{
          declared: [
            {
              policy: {
                object: 'customers',
                kind: 'cube',
                groups: ['emea-viewers'],
                rowLevel: { filters: [{ member: 'region', operator: 'equals', values: ['EMEA'] }] },
                conditions: [],
              },
              path: 'cubes/customers.yml',
            },
          ],
          open: [{ kind: 'cube', name: 'orders' }],
          reaches: {},
        }}
        policyGroups={['emea-viewers', '*']}
      />
    </QueryClientProvider>,
  );
}

const addGroup = async (name: string) => {
  const input = screen.getByRole('combobox', { name: 'AD group' });
  await userEvent.clear(input);
  await userEvent.type(input, `${name}{Enter}`);
};

describe('previewing as groups (T438, AC-166; design 08, state E)', () => {
  it('takes groups as chips, and says what they reach, by path and how', async () => {
    const asked = serve();
    open();
    // None chosen yet: they reach nothing.
    expect(await screen.findByText('Choose one or more AD groups to preview as.')).toBeTruthy();

    await addGroup('emea-viewers');
    const chips = screen.getByRole('list', { name: 'Groups' });
    expect(
      within(chips)
        .getAllByRole('listitem')
        .map((chip) => chip.textContent),
    ).toEqual(['emea-viewers']);
    // Looked up each time: the list is drawn anew as each answer comes.
    const rows = () =>
      within(screen.getByRole('list', { name: 'What these groups reach' })).getAllByRole(
        'listitem',
      );
    const reached = () => rows().map((row) => row.textContent);
    /**
     * T630 (AC-343; design 08, state E, as drawn): one list. The folders
     * granted, each with its eye or pencil, then those seen from above,
     * "(above)", with none; then the model's cubes and views.
     */
    await waitFor(() =>
      expect(reached()).toEqual([
        'Shared / Sales / EMEA · view only',
        'Shared / Sales (above) · its dashboards, view only',
        expect.stringMatching(/^customers · some members or rows/),
        expect.stringMatching(/^orders · everything/),
      ]),
    );
    expect(
      rows().map((row) => row.querySelector('[data-icon]')?.getAttribute('data-icon')),
    ).toEqual(['eye', undefined, 'warn', 'ok']);

    await addGroup('finance');
    // Each group its own parameter (T438's review).
    await waitFor(() =>
      expect(
        new URL(
          asked.filter((url) => url.startsWith('/api/access/reach?')).at(-1)!,
          'http://x',
        ).searchParams.getAll('groups'),
      ).toEqual(['emea-viewers', 'finance']),
    );
    // Removed as a chip, and asked again without it; focus to the chip in its place.
    await userEvent.click(screen.getByRole('button', { name: 'Remove emea-viewers' }));
    await waitFor(() =>
      expect(reached()).toEqual([
        'Shared / Finance · read-write',
        expect.stringMatching(/^customers · nothing/),
        expect.stringMatching(/^orders · everything/),
      ]),
    );
    expect(rows()[0]?.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('pencil');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove finance' })),
    );
    // The last removed, focus to the picker.
    await userEvent.click(screen.getByRole('button', { name: 'Remove finance' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'AD group' })),
    );
  });

  it('says a folder above a read-write grant is seen whole, view only (T438’s review)', async () => {
    serve();
    open();
    await addGroup('budgets');
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'What these groups reach' }))
          .getAllByRole('listitem')
          .map((row) => row.textContent),
      ).toEqual([
        'Shared / Finance / Budgets · read-write',
        'Shared / Finance (above) · view only',
        expect.stringMatching(/^customers · nothing/),
        expect.stringMatching(/^orders · everything/),
      ]),
    );
  });

  it('offers the groups the policies name as presets (AC-232)', async () => {
    serve();
    open();
    const presets = screen.getByRole('group', { name: 'Groups the policies name' });
    expect(
      within(presets)
        .getAllByRole('button')
        .map((each) => each.textContent),
    ).toEqual(['emea-viewers']);
    await userEvent.click(within(presets).getByRole('button', { name: 'emea-viewers' }));
    expect(
      within(screen.getByRole('list', { name: 'Groups' }))
        .getAllByRole('listitem')
        .map((chip) => chip.textContent),
    ).toEqual(['emea-viewers']);
    // Chosen, it is no longer offered.
    expect(screen.queryByRole('group', { name: 'Groups the policies name' })).toBeNull();
  });

  // T630: in the same list as the folders, after them (design 08, state E).
  it('says what the model’s policies give them, in what these groups reach', async () => {
    serve();
    open();
    await addGroup('emea-viewers');
    const reach = await screen.findByRole('list', { name: 'What these groups reach' });
    await waitFor(() =>
      expect(within(reach).getByTestId('access-customers').textContent).toContain(
        'customers · some members or rows',
      ),
    );
    expect(within(reach).getByTestId('access-customers').textContent).toContain(
      'emea-viewers: all; ',
    );
    expect(
      within(within(reach).getByTestId('access-customers'))
        .getByRole('link', { name: 'cubes/customers.yml' })
        .getAttribute('href'),
    ).toContain('customers.yml');
    expect(within(reach).getByTestId('access-orders').textContent).toContain(
      'orders · everything · No access policy: open to every context.',
    );
    // One section, as drawn: no second heading for the model.
    expect(screen.queryByRole('region', { name: 'What the model gives them' })).toBeNull();
  });

  it('opens a dashboard as exactly those groups, never as none', async () => {
    serve();
    open();
    // No group yet: no preview (T438's review).
    await userEvent.type(screen.getByRole('searchbox', { name: 'Dashboard to preview' }), 'Rev');
    expect(
      await screen.findByText('Choose a group first, to preview a dashboard as it.'),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Preview Revenue overview' })).toBeNull();
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Dashboard to preview' }));
    await addGroup('sales-ro');
    await addGroup('emea-viewers');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Dashboard to preview' }), 'Rev');
    const link = await screen.findByRole('link', { name: 'Preview Revenue overview' });
    const preview = new URL(link.getAttribute('href')!, 'http://x').searchParams.get('preview');
    expect(JSON.parse(preview!)).toEqual({ groups: ['sales-ro', 'emea-viewers'] });
  });

  it('keeps the groups for the session, so coming back finds them (AC-232)', async () => {
    serve();
    open();
    await addGroup('finance');
    cleanup();
    // Back, as from a preview.
    open();
    expect(
      within(screen.getByRole('list', { name: 'Groups' }))
        .getAllByRole('listitem')
        .map((chip) => chip.textContent),
    ).toEqual(['finance']);
  });
});
