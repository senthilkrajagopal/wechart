import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { declaredFiltersFor, GeneratedSql } from './GeneratedSql';
import { policiesOf } from './policies';

/**
 * T174 / AC-168: THE SYSTEM SHALL show the generated SQL and the effective
 * filters for a chart under the previewed context.
 * Fails when: the SQL shown omits the row-level filters the policy adds.
 *
 * The SQL is Cube's own, from `/v1/sql` asked as the context: generated after
 * the policies apply, so it carries their row filters (research/cube/
 * access-control.md, "Observed locally"). Beside it, the row filters the
 * model's policies declare for the context's groups.
 */
const SECURED = `views:
  - name: secured_orders
    cubes:
      - join_path: orders
        includes: [count, status]
    access_policy:
      - group: managers
        member_level:
          includes: '*'
        row_level:
          allow_all: true
      - group: sales
        conditions:
          - if: '{ securityContext.is_employee }'
        member_level:
          includes: '*'
        row_level:
          filters:
            - member: status
              operator: equals
              values: [shipped]
      - group: '*'
        member_level:
          includes: [count]
cubes:
  - name: customers
    sql_table: public.customers
    access_policy:
      - group: sales
        row_level:
          filters:
            - member: region
              operator: equals
              values: [North]
`;

const POLICIES = policiesOf('views/secured_orders.yml', SECURED).policies;

describe('declaredFiltersFor', () => {
  it('lists the row filters the policies declare for the context’s groups, on the objects queried', () => {
    expect(
      declaredFiltersFor(POLICIES, { groups: ['sales'] }, [
        'secured_orders.count',
        'secured_orders.status',
      ]),
    ).toEqual([
      {
        object: 'secured_orders',
        groups: 'sales',
        rows: 'status equals shipped',
        conditions: '{ securityContext.is_employee }',
      },
      {
        object: 'secured_orders',
        groups: 'any group',
        rows: 'all rows (none declared)',
        conditions: 'none',
      },
    ]);
  });

  it('lists only the any-group policies for a context with no groups', () => {
    expect(declaredFiltersFor(POLICIES, {}, ['secured_orders.count'])).toEqual([
      {
        object: 'secured_orders',
        groups: 'any group',
        rows: 'all rows (none declared)',
        conditions: 'none',
      },
    ]);
  });
});

const SQL =
  'SELECT "orders".status "secured_orders__status", count("orders".id) "secured_orders__count"\nFROM public.orders AS "orders"\nWHERE ("orders".status = $1)\nGROUP BY 1';

const asked: unknown[] = [];

beforeEach(() => {
  asked.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/model/files')
        return Response.json({ files: [{ path: 'views/secured_orders.yml', content: SECURED }] });
      if (String(input) === '/api/sql') {
        asked.push(JSON.parse(String(init?.body)));
        return Response.json({ queries: [{ sql: SQL, params: ['shipped'] }] });
      }
      return new Response('not found', { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GeneratedSql', () => {
  it('shows Cube’s SQL as the context, its values, and the filters its groups declare', async () => {
    const query = { measures: ['secured_orders.count'], dimensions: ['secured_orders.status'] };
    const context = { groups: ['sales'], is_employee: true };
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <GeneratedSql title="Secured by status" query={query} context={context} onClose={onClose} />
      </QueryClientProvider>,
    );

    const dialog = screen.getByRole('dialog', {
      name: 'SQL for Secured by status as this context',
    });
    // The row filter the policy adds, in Cube's own SQL, with its value.
    expect((await within(dialog).findByTestId('generated-sql')).textContent).toContain(
      'WHERE ("orders".status = $1)',
    );
    // Numbered in order, whatever the database's placeholder (T174's review).
    expect(within(dialog).getByTestId('generated-sql-params').textContent).toBe(
      'Values bound, in order: 1 = shipped',
    );
    expect(asked).toEqual([{ query, context }]);
    // Opened with focus on Close; read-only code, reachable and named.
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Close' }));
    expect(within(dialog).getByRole('textbox', { name: 'SQL' }).getAttribute('aria-readonly')).toBe(
      'true',
    );

    const declared = await within(dialog).findByRole('table', {
      name: 'Row filters declared for this context',
    });
    expect(declared.textContent).toContain('status equals shipped');
    expect(declared.textContent).toContain('{ securityContext.is_employee }');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <GeneratedSql
          title="T"
          query={{ measures: ['secured_orders.count'] }}
          context={{}}
          onClose={onClose}
        />
      </QueryClientProvider>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  /**
   * From T174's review: a view's cubes' row filters apply with the view's
   * (research/cube/access-control.md, "Views"), and a file whose policies
   * cannot be read is named rather than left out.
   */
  it('lists the policies of a view’s cubes, and names the files it could not read', async () => {
    const VIEW_ONLY = `views:
  - name: orders_view
    cubes:
      - join_path: orders
        includes: [count, status]
`;
    const CUBE_POLICY = `cubes:
  - name: orders
    sql_table: public.orders
    access_policy:
      - group: sales
        row_level:
          filters:
            - member: region
              operator: equals
              values: [North]
`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === '/api/model/files')
          return Response.json({
            files: [
              { path: 'views/orders_view.yml', content: VIEW_ONLY },
              { path: 'cubes/orders.yml', content: CUBE_POLICY },
              { path: 'cubes/dynamic.js', content: 'cube(`dynamic`, {})' },
            ],
          });
        return Response.json({ queries: [{ sql: 'SELECT 1', params: [] }] });
      }),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <GeneratedSql
          title="T"
          query={{ measures: ['orders_view.count'] }}
          context={{ groups: ['sales'] }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const declared = await screen.findByRole('table', {
      name: 'Row filters declared for this context',
    });
    expect(declared.textContent).toContain('region equals North');
    expect(screen.getByTestId('generated-sql-unread').textContent).toContain('cubes/dynamic.js');
  });

  it('says what Cube refused, rather than showing no SQL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === '/api/sql'
          ? Response.json(
              { error: "Error: You requested hidden member: 'secured_orders.count'." },
              { status: 500 },
            )
          : Response.json({ files: [] }),
      ),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <GeneratedSql
          title="T"
          query={{ measures: ['secured_orders.count'] }}
          context={{}}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      "You requested hidden member: 'secured_orders.count'",
    );
  });
});
