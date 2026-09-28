import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../dashboard/DashboardView';
import type { DashboardDocument } from '../dashboard/model/document';

/**
 * T468, UX-031 (the user's answer, 2026-09-28, option a): selecting a filter,
 * or adding one, switches the edit sidebar to Properties, which shows that
 * filter's field picker, scope and Remove, with focus in the field picker.
 * The pill's popover keeps only the value control.
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Revenue',
  settings: { width: 'full' },
  pages: [{ id: 'p1', title: 'Overview', items: [] }],
};

const META = {
  cubes: [
    {
      name: 'orders',
      title: 'Orders',
      measures: [{ name: 'orders.count', title: 'Count', type: 'number' }],
      dimensions: [
        { name: 'orders.status', title: 'Status', type: 'string' },
        { name: 'orders.region', title: 'Region', type: 'string' },
      ],
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/meta') return new Response(JSON.stringify(META), { status: 200 });
      if (url.startsWith('/api/load')) {
        const { query } = JSON.parse(String(init?.body)) as { query: Record<string, unknown> };
        const member = (query['dimensions'] as string[])[0] ?? '';
        return new Response(
          JSON.stringify({ data: ['completed', 'shipped'].map((value) => ({ [member]: value })) }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function editing() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DashboardView dashboardId="d1" document={DOC} specs={{}} onSave={vi.fn()} />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
}

async function addFilter(label: string) {
  // Adding one leaves the sidebar on Properties: back to Add for the next.
  await userEvent.click(screen.getByRole('tab', { name: 'Add' }));
  await userEvent.click(screen.getByTestId('add-filter'));
  const kinds = screen.getByRole('list', { name: 'Filter widgets' });
  await userEvent.click(within(kinds).getByRole('button', { name: new RegExp(`^${label}`) }));
}

const bar = () => screen.getByRole('region', { name: 'Filters' });
const properties = () => screen.getByRole('tabpanel', { name: 'Properties' });

describe('a filter’s settings are in Properties (T468, UX-031)', () => {
  it('adding one selects it: Properties, its field picker focused, its scope and Remove', async () => {
    await editing();
    await addFilter('List with search');

    expect(screen.getByRole('tab', { name: 'Properties' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    const settings = within(properties()).getByRole('region', {
      name: 'List with search filter 1',
    });
    const field = within(settings).getByLabelText('Filter on');
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(within(settings).getByLabelText('Applies to').tagName).toBe('SELECT');
    expect(
      within(settings).getByRole('button', { name: 'Remove List with search filter 1' }),
    ).toBeTruthy();
    // Not in the pill.
    expect(within(bar()).queryByLabelText('Filter on')).toBeNull();
  });

  it('keeps only the value control in the pill’s popover', async () => {
    await editing();
    await addFilter('List with search');
    await userEvent.selectOptions(
      within(properties()).getByLabelText('Filter on'),
      'orders.status',
    );

    const pill = within(bar()).getByTestId(/^filter-/);
    await userEvent.click(within(pill).getByRole('button', { expanded: false }));

    expect(await within(pill).findByRole('searchbox', { name: 'Search Status' })).toBeTruthy();
    expect(within(pill).queryByLabelText('Filter on')).toBeNull();
    expect(within(pill).queryByLabelText('Applies to')).toBeNull();
    expect(within(pill).queryByRole('button', { name: /^Remove / })).toBeNull();
  });

  it('selecting another filter shows its settings', async () => {
    await editing();
    await addFilter('List with search');
    await addFilter('Checkbox list');
    expect(
      within(properties()).getByRole('region', { name: 'Checkbox list filter 2' }),
    ).toBeTruthy();

    const [first] = within(bar()).getAllByTestId(/^filter-/) as [HTMLElement];
    await userEvent.click(within(first).getByRole('button', { expanded: false }));

    const settings = within(properties()).getByRole('region', {
      name: 'List with search filter 1',
    });
    // No field yet, so no value to set: focus goes to its field picker.
    await waitFor(() =>
      expect(document.activeElement).toBe(within(settings).getByLabelText('Filter on')),
    );
    expect(first.getAttribute('data-selected')).toBe('true');
  });

  /**
   * T468's review: the user's words hold for a filter with a field too —
   * selected, focus is in its field picker. Pressed again, it opens its value;
   * Escape in its settings goes back to its pill.
   */
  it('selecting one with a field focuses its field picker; a second press opens its value', async () => {
    await editing();
    await addFilter('List with search');
    await userEvent.selectOptions(
      within(properties()).getByLabelText('Filter on'),
      'orders.status',
    );
    await addFilter('Checkbox list');
    const [first] = within(bar()).getAllByTestId(/^filter-/) as [HTMLElement];
    const summary = within(first).getByRole('button', { expanded: false });

    await userEvent.click(summary);
    const settings = within(properties()).getByRole('region', {
      name: 'List with search filter 1',
    });
    await waitFor(() =>
      expect(document.activeElement).toBe(within(settings).getByLabelText('Filter on')),
    );
    expect(summary.getAttribute('aria-expanded')).toBe('false');

    // Escape: back to its pill, still selected.
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(summary);
    expect(first.getAttribute('data-selected')).toBe('true');

    // Pressed again: its value.
    await userEvent.keyboard('{Enter}');
    expect(summary.getAttribute('aria-expanded')).toBe('true');
    expect(await within(first).findByRole('searchbox', { name: 'Search Status' })).toBeTruthy();
  });

  it('leaving edit mode lets go of it', async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DashboardView
          dashboardId="d1"
          document={{ ...DOC, filters: [{ id: 'f1', widget: 'list', member: 'orders.status' }] }}
          specs={{}}
          onSave={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const pill = within(bar()).getByTestId('filter-f1');
    await userEvent.click(within(pill).getByRole('button', { expanded: false }));
    expect(within(properties()).getByRole('region', { name: 'List with search filter 1' })).toBe(
      within(properties()).getByRole('region'),
    );

    await userEvent.click(screen.getByRole('button', { name: /^Discard/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Properties' }));

    // The filter is there; its selection is not.
    expect(within(properties()).queryByLabelText('Filter on')).toBeNull();
    expect(within(bar()).getByTestId('filter-f1').getAttribute('data-selected')).toBeNull();
  });

  it('Remove takes it off the bar, and Properties is the dashboard’s again', async () => {
    await editing();
    await addFilter('List with search');

    await userEvent.click(
      within(properties()).getByRole('button', { name: 'Remove List with search filter 1' }),
    );

    expect(within(bar()).queryAllByTestId(/^filter-/)).toHaveLength(0);
    expect(within(properties()).queryByLabelText('Filter on')).toBeNull();
  });
});
