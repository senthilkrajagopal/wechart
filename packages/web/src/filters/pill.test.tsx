import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../dashboard/DashboardView';
import { openHeaderSheet } from '../dashboard/header/testing';
import type { DashboardDocument } from '../dashboard/model/document';
import { summaryOf } from './describe';
import { openFilter } from './testing';

/**
 * Found by T204's review (AC-187, and the keyboard rules of direction.md): the
 * filter pill's popover lost focus when Escape closed it, and Tab could carry
 * focus out of it onto the tiles it lies over.
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Sales',
  settings: { width: 'full' },
  pages: [
    {
      id: 'p1',
      title: 'Overview',
      items: [{ id: 't-note', kind: 'markdown', w: 3, text: 'Notes' }],
    },
  ],
  filters: [
    { id: 'f1', widget: 'checkbox', member: 'orders.status' },
    { id: 'f2', widget: 'checkbox', member: 'orders.region' },
  ],
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
    vi.fn(async (input: RequestInfo | URL) =>
      String(input) === '/api/meta'
        ? new Response(JSON.stringify(META))
        : new Response(JSON.stringify({ data: [{ 'orders.status': 'shipped' }] })),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function dashboard() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DashboardView dashboardId="d1" document={DOC} specs={{}} onSave={vi.fn()} />
    </QueryClientProvider>,
  );
}

/** The bar's pills, its header sheet opened first (T828). */
const pills = async () => {
  await openHeaderSheet();
  return (await screen.findAllByRole('group', { name: /filter \d$/ })) as [
    HTMLElement,
    HTMLElement,
  ];
};
const summaryIn = (pill: HTMLElement) =>
  within(pill)
    .getAllByRole('button')
    .find((button) => button.hasAttribute('aria-expanded')) as HTMLElement;

describe('a filter pill’s popover', () => {
  it('gives focus back to its pill when Escape closes it', async () => {
    dashboard();
    const [status] = await pills();
    await openFilter(status);
    (await within(status).findByRole('checkbox', { name: 'shipped' })).focus();

    await userEvent.keyboard('{Escape}');

    expect(summaryIn(status).getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(summaryIn(status));
  });

  it('closes when focus leaves it, so nothing it lies over is focused beneath it', async () => {
    dashboard();
    const [status, region] = await pills();
    await openFilter(status);
    (await within(status).findByRole('checkbox', { name: 'shipped' })).focus();

    // Onwards from the popover's last control: the next pill.
    await userEvent.tab();

    expect(within(status).queryByRole('checkbox')).toBeNull();
    expect(region.contains(document.activeElement)).toBe(true);
  });

  it('names its popover only while there is one', async () => {
    dashboard();
    const [status] = await pills();
    expect(summaryIn(status).hasAttribute('aria-controls')).toBe(false);

    await openFilter(status);
    const controls = summaryIn(status).getAttribute('aria-controls') ?? '';
    expect(document.getElementById(controls)).not.toBeNull();
  });
});

describe('a pill’s summary', () => {
  it('reads "All" for a value that filters nothing', () => {
    // A URL can carry these; "≤ undefined" and a bare "Status: " were shown.
    expect(summaryOf('range', { kind: 'range' })).toBe('All');
    expect(summaryOf('checkbox', { kind: 'values', values: [] })).toBe('All');
  });
});
