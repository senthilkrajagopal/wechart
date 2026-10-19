import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardFilter, FilterValue } from '../../../filters/model';
import { FilterControl } from './FilterControl';

/**
 * T892 / AC-528: WHEN the author inserts a Filter control into a Text tile,
 * THE SYSTEM SHALL make it one of the dashboard's filters …: the filter
 * bar's widget at 28 px with its scope tag (AC-077), the same value, state
 * and popover … and a control whose filter has been deleted SHALL … do
 * nothing for readers.
 * `Fails when: … the control holds a value of its own; or a control whose
 * filter is deleted still filters.`
 */

const COUNTRY: DashboardFilter = { id: 'f-country', widget: 'list', member: 'customers.country' };
const MEMBER = {
  name: 'customers.country',
  title: 'Customers Country',
  shortTitle: 'Country',
  kind: 'dimension' as const,
  type: 'string',
  cube: 'customers',
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: ['France', 'Germany', 'United Kingdom'].map((country) => ({
              'customers.country': country,
            })),
          }),
        ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('a Filter control (T892, AC-528)', () => {
  it('is the filter bar’s widget for Country, compact, with its scope tag', () => {
    render(
      <FilterControl
        filter={COUNTRY}
        member={MEMBER}
        name="List with search filter 1"
        scope="Dashboard"
        value={undefined}
        onValue={() => undefined}
      />,
      { wrapper },
    );
    const control = screen.getByRole('group', { name: 'List with search filter 1' });
    // The bar's own pill, by its class and its filter's id: one filter, not a copy.
    expect([...control.classList]).toEqual(['filter-pill', 'filter-pill--compact']);
    expect(control.dataset['filterId']).toBe('f-country');
    expect(within(control).getByTestId('scope-badge').textContent).toBe('Dashboard');
    expect(within(control).getByRole('button', { expanded: false }).textContent).toBe(
      'Customers Country: All▾',
    );
  });

  it('shows the value it is given and sets the filter through the same handler', async () => {
    const onValue = vi.fn<(value: FilterValue | undefined) => void>();
    const { rerender } = render(
      <FilterControl
        filter={COUNTRY}
        member={MEMBER}
        name="List with search filter 1"
        scope="Dashboard"
        value={undefined}
        onValue={onValue}
      />,
      { wrapper },
    );
    await userEvent.click(screen.getByRole('button', { expanded: false }));
    await userEvent.click(await screen.findByRole('button', { name: 'France', pressed: false }));
    expect(onValue).toHaveBeenLastCalledWith({ kind: 'values', values: ['France'] });
    // It holds no value of its own: until the dashboard's value changes, it reads All.
    expect(screen.getByRole('button', { expanded: true }).textContent).toBe(
      'Customers Country: All▾',
    );
    rerender(
      <FilterControl
        filter={COUNTRY}
        member={MEMBER}
        name="List with search filter 1"
        scope="Dashboard"
        value={{ kind: 'values', values: ['France'] }}
        onValue={onValue}
      />,
    );
    expect(screen.getByRole('button', { expanded: true }).textContent).toBe(
      'Customers Country: France▾',
    );
    // Cleared by its ×, as the bar's pill is.
    await userEvent.click(screen.getByRole('button', { name: 'Clear Customers Country' }));
    expect(onValue).toHaveBeenLastCalledWith(undefined);
  });

  it('draws nothing a reader can work once its filter is deleted', async () => {
    const { container } = render(
      <FilterControl
        filter={undefined}
        member={undefined}
        name="Filter"
        scope="Dashboard"
        value={undefined}
        onValue={() => undefined}
      />,
      { wrapper },
    );
    await waitFor(() => {
      expect(container.querySelector('button, input')).toBeNull();
    });
  });
});
