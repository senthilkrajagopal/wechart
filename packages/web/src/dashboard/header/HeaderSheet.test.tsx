import type { ChartDocument, RenderSpec } from '@wechart/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isInaccessible, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../DashboardView';
import type { DashboardDocument } from '../model/document';

/**
 * T828 (AC-196, AC-486, AC-487, AC-490; design 19): the description, the
 * ownership line and the filter bar are in a header sheet the Filters toggle
 * opens and closes, closed whenever the dashboard opens, and nothing in it
 * reachable while it is closed.
 */
const DESCRIPTION = 'Revenue for EMEA, refreshed nightly.';
const OWNERSHIP = 'In Shared / Sales / EMEA · version 7';

const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Sales',
  description: DESCRIPTION,
  settings: { width: 'full' },
  pages: [
    {
      id: 'p1',
      title: 'Overview',
      items: [{ id: 't-kpi', kind: 'chart', chartId: 'c-kpi', w: 3 }],
    },
  ],
  filters: [{ id: 'f1', widget: 'checkbox', member: 'orders.status' }],
};

const kpi: ChartDocument = {
  schemaVersion: 1,
  title: 'Orders',
  chart: {
    source: { cube: 'orders' },
    wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
    chartType: 'kpi',
  },
};

const spec: RenderSpec = {
  chartType: 'kpi',
  encoding: { y: ['orders.count'] },
  rows: [{ 'orders.count': 240 }],
};

const META = {
  cubes: [
    {
      name: 'orders',
      title: 'Orders',
      measures: [{ name: 'orders.count', title: 'Count', type: 'number' }],
      dimensions: [{ name: 'orders.status', title: 'Status', type: 'string' }],
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/meta') return new Response(JSON.stringify(META));
      return new Response(JSON.stringify({ data: [{ 'orders.status': 'completed' }] }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function view() {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DashboardView
        dashboardId="d1"
        document={DOC}
        specs={{ 'c-kpi': spec }}
        documents={{ 'c-kpi': kpi }}
        onSave={vi.fn()}
        place={{ line: OWNERSHIP, editsElsewhere: false }}
      />
    </QueryClientProvider>
  );
}

const toggle = () => screen.getByRole('button', { name: /^Filters\b/ });
/** The sheet, by the id the toggle's `aria-controls` names. */
function sheet(): HTMLElement {
  const id = toggle().getAttribute('aria-controls') ?? '';
  const found = document.getElementById(id);
  if (found === null) throw new Error(`No element #${id}`);
  return found;
}
const description = () => screen.getByText(DESCRIPTION);
const ownership = () => screen.getByText(OWNERSHIP);

describe('the header sheet', () => {
  it('starts closed: the toggle collapsed, and nothing in the sheet focusable or in the accessibility tree', () => {
    render(view());

    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    // `aria-controls` names the sheet, the region holding the folded parts.
    expect(sheet().getAttribute('role')).toBe('region');
    expect(sheet().getAttribute('aria-label')).toBe('Filters and details');
    expect(sheet().contains(description())).toBe(true);
    expect(sheet().contains(ownership())).toBe(true);
    expect(sheet().querySelector('section.filter-bar')).not.toBeNull();

    // Closed: hidden, so none of it is read or reached.
    expect(sheet().hidden).toBe(true);
    expect(screen.queryByRole('region', { name: 'Filters' })).toBeNull();
    expect(isInaccessible(description())).toBe(true);
    expect(isInaccessible(ownership())).toBe(true);
    const controls = sheet().querySelectorAll<HTMLElement>('button, [tabindex]');
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) expect(isInaccessible(control)).toBe(true);
    // Not in the row either (AC-484's other half).
    const header = document.querySelector('.dashboard__header');
    expect(header?.contains(description())).toBe(false);
    expect(header?.contains(ownership())).toBe(false);
    expect(header?.querySelector('section.filter-bar')).toBeNull();
  });

  it('opens on a click with the description, the ownership line and the bar with its hint, focus kept on the toggle; a second press closes it', async () => {
    render(view());

    await userEvent.click(toggle());

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(toggle());
    expect(sheet().hidden).toBe(false);
    expect(isInaccessible(description())).toBe(false);
    expect(isInaccessible(ownership())).toBe(false);
    const bar = screen.getByRole('region', { name: 'Filters' });
    expect(sheet().contains(bar)).toBe(true);
    // Nothing set: the bar says how to mark or filter (AC-196).
    const hint = bar.querySelector('.filter-bar__hint');
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toBe(
      'Click, drag or Alt+drag to mark · Ctrl/⌘ adds or toggles · Esc unmarks',
    );
    expect(isInaccessible(hint as HTMLElement)).toBe(false);
    expect(within(bar).getByRole('button', { name: /Status/ })).toBeTruthy();
    // In order: the description, the ownership line, the bar.
    const parts = [description(), ownership(), bar];
    for (let index = 1; index < parts.length; index += 1)
      expect(
        (parts[index - 1] as HTMLElement).compareDocumentPosition(parts[index] as HTMLElement) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

    await userEvent.click(toggle());

    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(sheet().hidden).toBe(true);
    expect(screen.queryByRole('region', { name: 'Filters' })).toBeNull();
  });

  it('opens and closes with Enter and with Space, focus staying on the toggle', async () => {
    render(view());
    toggle().focus();

    await userEvent.keyboard('{Enter}');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(toggle());

    await userEvent.keyboard('{Enter}');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle());

    await userEvent.keyboard(' ');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(sheet().hidden).toBe(false);
    expect(document.activeElement).toBe(toggle());

    await userEvent.keyboard(' ');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle());
  });

  it('starts closed again when the dashboard is opened anew', async () => {
    const first = render(view());
    await userEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    first.unmount();

    render(view());

    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(sheet().hidden).toBe(true);
  });

  it('is open with no toggle while editing, and back as the reader left it after (rule 114)', async () => {
    render(view());

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.queryByRole('button', { name: /^Filters\b/ })).toBeNull();
    const bar = screen.getByRole('region', { name: 'Filters' });
    expect(isInaccessible(bar)).toBe(false);
    expect(isInaccessible(description())).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: /^Discard/ }));

    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: 'Filters' })).toBeNull();
  });

  it('starts with the whole title only where the row cut it short (AC-485)', async () => {
    // Laid out as a browser would, the title wider than its room.
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(900);
    const client = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
    const cut = render(view());
    await userEvent.click(toggle());

    const whole = sheet().querySelector('.header-sheet__title');
    expect(whole?.textContent).toBe('Sales');
    expect(whole?.getAttribute('aria-hidden')).toBe('true');
    expect(
      (whole as HTMLElement).compareDocumentPosition(description()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    cut.unmount();

    // Whole in the row: none in the sheet.
    scroll.mockReturnValue(120);
    client.mockReturnValue(120);
    render(view());
    await userEvent.click(toggle());
    expect(sheet().querySelector('.header-sheet__title')).toBeNull();
    scroll.mockRestore();
    client.mockRestore();
  });

  it('comes back open after editing when the reader had left it open', async () => {
    render(view());
    await userEvent.click(toggle());

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('button', { name: /^Filters\b/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Discard/ }));

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(isInaccessible(screen.getByRole('region', { name: 'Filters' }))).toBe(false);
  });
});
