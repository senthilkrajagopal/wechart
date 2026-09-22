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

function page() {
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
      <SecurityPage />
    </QueryClientProvider>,
  );
}

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
    ]);
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Cube / view', 'Group', 'Members', 'Rows', 'Conditions', 'Masked', 'Source']);
  });

  it('names the cubes and views with no policy as open, and the files it cannot read', async () => {
    page();

    expect((await screen.findByTestId('policies-open')).textContent).toBe(
      'No access_policy, so open to every security context: orders.',
    );
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
