import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SecurityPage } from './SecurityPage';

/**
 * T171 / AC-165: THE SYSTEM SHALL list every access policy in the model with
 * its role, member-level rules, row-level filters, conditions and masking, as
 * declared.
 * Fails when: a declared policy or rule is missing from the listing.
 *
 * The Security workspace, as the prototype's: a table of the policies, one
 * row each, naming the file each is declared in; then the cubes and views
 * with none, open to every context.
 */
const FILES = [
  {
    path: 'views/secured_orders.yml',
    content: `views:
  - name: secured_orders
    access_policy:
      - group: sales
        conditions:
          - if: '{ securityContext.is_employee }'
        member_level:
          includes: '*'
          excludes: [total_amount]
        row_level:
          filters:
            - member: status
              operator: equals
              values: [shipped]
      - groups: [auditors, finance]
        member_level:
          includes: [count]
        member_masking:
          includes: [total_amount]
`,
  },
  { path: 'cubes/orders.yml', content: 'cubes:\n  - name: orders\n    sql_table: public.orders\n' },
  { path: 'cubes/legacy.js', content: 'cube(`legacy`, {})' },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

function page(props: Parameters<typeof SecurityPage>[0] = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      // Whether Cube refuses unsigned requests (T175), asked beside the files.
      if (String(input) === '/api/cube-auth') return Response.json({ auth: 'enforced' });
      // And which API scopes it has (T176).
      if (String(input) === '/api/cube-scopes')
        return Response.json({
          meta: 'granted',
          data: 'granted',
          sql: 'granted',
          graphql: 'granted',
          jobs: 'granted',
        });
      expect(String(input)).toBe('/api/model/files');
      return new Response(JSON.stringify({ files: FILES }));
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SecurityPage {...props} />
    </QueryClientProvider>,
  );
}

/**
 * T500 (AC-295, AC-002; design 08 of 2026-09-27, pin 1 and state F): with
 * sign-in on, Security is tabs, each at its own address, and its Policies
 * say where access comes from now. With sign-in off it stays phase 1's page.
 */
describe('Security in tabs, with sign-in on (T500)', () => {
  it('opens on Policies, saying access comes from folder groups, and links each tab by its address', async () => {
    page({ signedIn: true });

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Security');
    const tabs = screen.getByRole('navigation', { name: 'Security' });
    const links = within(tabs).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Policies', '/security'],
      ['Preview as groups', '/security/preview'],
      // The audit trail joins with T369.
      ['Audit trail', '/security/audit'],
      // Everyone's tokens, the fourth tab, with sign-in on alone (T772, AC-470; design 18, pin 1).
      ['Access tokens', '/security/tokens'],
    ]);
    expect(links[0]?.getAttribute('aria-current')).toBe('page');
    // Said over the list, once the model's files are read.
    expect(
      await screen.findByText(
        'Access comes from AD groups set on folders: Cube refuses a folder’s cubes to anyone without one of its groups. Within that, the access policies below, written in the model, decide rows and members.',
      ),
    ).toBeTruthy();
    const table = await screen.findByRole('table', { name: 'Access policies' });
    expect(table.tagName).toBe('TABLE');
    // A cube with no policy is open within its folder's groups, not to all: a
    // row of its own, as state F draws it (T699, SEC-16; security-Q2).
    expect(
      within(within(table).getByRole('row', { name: /^orders / }))
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['orders', 'No policy: open within its folder’s groups', '', '', '', '', '']);
    // The preview is its own tab, not a pane beside the list.
    expect(screen.queryByRole('region', { name: 'Preview a security context' })).toBeNull();
  });

  it('shows the preview on its own tab, without the list', async () => {
    page({ signedIn: true, tab: 'preview' });

    const tabs = screen.getByRole('navigation', { name: 'Security' });
    expect(
      within(tabs).getByRole('link', { name: 'Preview as groups' }).getAttribute('aria-current'),
    ).toBe('page');
    // As groups (T438; design 08, state E), in place of the JSON editor.
    expect(await screen.findByRole('region', { name: 'Preview as groups' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Preview a security context' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Security context (JSON)' })).toBeNull();
    expect(screen.queryByRole('table', { name: 'Access policies' })).toBeNull();
  });

  it('holds the audit trail on its own tab, at its own address (T369)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/audit?'))
          return Response.json({ records: [], total: 0, retentionDays: 365 });
        if (url === '/api/audit/people' || url === '/api/folders') return Response.json([]);
        return Response.json({ files: [] });
      }),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SecurityPage
          signedIn
          tab="audit"
          audit={{ filters: { events: [], subfolders: false, time: 'all' }, onFilters: vi.fn() }}
        />
      </QueryClientProvider>,
    );

    const tabs = screen.getByRole('navigation', { name: 'Security' });
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/security', '/security/preview', '/security/audit', '/security/tokens']);
    expect(
      within(tabs).getByRole('link', { name: 'Audit trail' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(await screen.findByText('No records match these filters.')).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Access policies' })).toBeNull();
  });

  /**
   * T699 (AC-166, AC-343; security-Q1, R76): with sign-in off, the same tabs,
   * Preview as groups among them; phase 1's floating JSON pane and its "Find
   * a dashboard" (UX-085) are gone.
   */
  it('is the same tabs with sign-in off, Preview as groups in place of phase 1’s JSON pane', async () => {
    page();

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Security');
    const tabs = screen.getByRole('navigation', { name: 'Security' });
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Policies', 'Preview as groups', 'Audit trail']);
    expect(await screen.findByRole('table', { name: 'Access policies' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Preview a security context' })).toBeNull();
    expect(screen.queryByLabelText('Find a dashboard')).toBeNull();
    expect(screen.queryByLabelText('Security context (JSON)')).toBeNull();
  });

  it('previews as groups on its own tab with sign-in off too', async () => {
    page({ tab: 'preview' });

    expect(screen.getByRole('region', { name: 'Preview as groups' })).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Access policies' })).toBeNull();
  });
});

describe('the Security workspace’s policies', () => {
  it('lists each policy with its group, members, rows, conditions, masking and file', async () => {
    page();

    const table = await screen.findByRole('table', { name: 'Access policies' });
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      );
    expect(rows).toEqual([
      [
        'secured_orders',
        'sales',
        'all except total_amount',
        'status equals shipped',
        '{ securityContext.is_employee }',
        'none',
        'views/secured_orders.yml',
      ],
      [
        'secured_orders',
        'auditors, finance',
        'count',
        'all rows (none declared)',
        'none',
        'total_amount',
        'views/secured_orders.yml',
      ],
      // Then the cubes and views with none, as rows (T699, SEC-16).
      ['orders', 'No policy: open to every security context', '', '', '', '', ''],
    ]);
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Cube / view', 'Group', 'Members', 'Rows', 'Conditions', 'Masked', 'Source']);
    // A policy's identifiers in the code face, as state F draws its cube, group
    // and row filter (SEC-15; T406's check): the cells set so, and no others.
    const policy = within(table).getAllByRole('row')[1]!;
    expect(
      within(policy)
        .getAllByRole('cell')
        .map((cell) => cell.classList.contains('is-code')),
    ).toEqual([true, true, false, true, true, false, false]);
  });

  it('names the cubes and views with no policy as open, and the files it cannot read', async () => {
    page();

    // A row each, as state F draws "No policy" (T699, SEC-16; security-Q2): its
    // name in the code face, the words in the secondary colour.
    const table = await screen.findByRole('table', { name: 'Access policies' });
    const open = within(table).getByRole('row', { name: /^orders / });
    expect(
      within(open)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['orders', 'No policy: open to every security context', '', '', '', '', '']);
    expect(within(open).getAllByRole('cell')[0]?.classList.contains('is-code')).toBe(true);
    expect(within(open).getAllByRole('cell')[1]?.classList.contains('policies__none')).toBe(true);
    expect(screen.queryByTestId('policies-open')).toBeNull();
    expect(screen.getByTestId('policies-unread').textContent).toBe(
      'Not read here: cubes/legacy.js (JavaScript). Any policies in these files are not listed.',
    );
  });

  /**
   * T175 / AC-169, from its review: the warning that Cube lets unsigned
   * requests in stands whatever becomes of the model's files.
   */
  it('warns that Cube lets unsigned requests in even when the model cannot be read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/cube-auth'
          ? Response.json({ auth: 'open', accepted: ['no token'] })
          : Response.json({ error: 'down' }, { status: 500 }),
      ),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SecurityPage />
      </QueryClientProvider>,
    );

    const warning = await vi.waitFor(() => {
      const found = screen
        .getAllByRole('alert')
        .find((alert) => alert.getAttribute('data-testid') === 'cube-auth');
      if (found === undefined) throw new Error('No warning yet');
      return found;
    });
    expect(warning.textContent).toContain('Cube lets in requests with no token.');
    // And the model's failure is said beside it.
    expect(await screen.findByText('The model files could not be read (500).')).toBeTruthy();
  });
});
