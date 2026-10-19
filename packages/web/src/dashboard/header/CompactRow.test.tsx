import type { ChartDocument, RenderSpec } from '@wechart/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardView, type DashboardViewProps } from '../DashboardView';
import type { DashboardDocument } from '../model/document';

/**
 * T829 (AC-484, AC-196; design 19 screen 1): in view mode the dashboard's
 * header is one row holding, in order, the way back, the title, the page
 * tabs, History, Bookmarks, the primary action, the gear where it shows, ⋯
 * and the Filters toggle — and none of the description, the ownership line
 * or a filter pill.
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Sales',
  description: 'Revenue for EMEA, refreshed nightly.',
  folderId: 'root',
  settings: { width: 'full' },
  pages: [
    {
      id: 'p1',
      title: 'Overview',
      items: [{ id: 't-kpi', kind: 'chart', chartId: 'c-kpi', w: 3 }],
    },
    { id: 'p2', title: 'By country', items: [] },
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

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/folders' || url.startsWith('/api/bookmarks'))
        return new Response(JSON.stringify([]));
      return new Response(JSON.stringify({ data: [{ 'orders.status': 'completed' }] }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function view(props: Partial<DashboardViewProps> = {}) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DashboardView
        dashboardId="d1"
        document={DOC}
        specs={{ 'c-kpi': spec }}
        documents={{ 'c-kpi': kpi }}
        onSave={vi.fn()}
        crumbs
        onHistory={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
  const header = document.querySelector<HTMLElement>('.dashboard__header');
  if (header === null) throw new Error('No header');
  return header;
}

/** Each in the header, and each after the one before it. */
function expectInOrder(header: HTMLElement, parts: readonly HTMLElement[]) {
  for (const part of parts) expect(header.contains(part)).toBe(true);
  for (let index = 1; index < parts.length; index += 1)
    expect(
      (parts[index - 1] as HTMLElement).compareDocumentPosition(parts[index] as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      String(index),
    ).toBeTruthy();
}

/** Nothing the sheet holds is in the row (AC-484). */
function expectNothingOfTheSheet(header: HTMLElement) {
  expect(header.querySelector('.dashboard__description')).toBeNull();
  expect(header.querySelector('.dashboard__ownership')).toBeNull();
  expect(header.querySelector('section.filter-bar')).toBeNull();
  expect(header.querySelector('[data-filter-id]')).toBeNull();
  expect(header.querySelector('.header-sheet')).toBeNull();
}

describe('the compact row', () => {
  it('holds the way back, the title, the page tabs, History, Bookmarks, Edit, the gear, ⋯ and the toggle, in that order', () => {
    const header = view({ place: { line: 'In Shared · version 7', editsElsewhere: false } });
    const row = within(header);

    expectInOrder(header, [
      // The way back, one step since T830 (AC-485).
      row.getByRole('link', { name: /^Back to / }),
      row.getByRole('heading', { level: 1, name: 'Sales' }),
      row.getByRole('tablist', { name: 'Pages' }),
      row.getByRole('button', { name: 'History' }),
      row.getByRole('button', { name: /^Bookmarks/ }),
      row.getByRole('button', { name: 'Edit' }),
      row.getByRole('button', { name: 'Dashboard settings' }),
      row.getByRole('button', { name: 'More' }),
      row.getByRole('button', { name: /^Filters\b/ }),
    ]);
    expect(row.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Overview',
      'By country',
    ]);
    expectNothingOfTheSheet(header);
  });

  it('on a shared one, its copy’s primary after Bookmarks and no gear', () => {
    const header = view({
      place: {
        line: 'In Shared · version 7',
        editsElsewhere: true,
        copy: { label: 'Edit in my workspace', onClick: vi.fn() },
      },
    });
    const row = within(header);

    expectInOrder(header, [
      row.getByRole('link', { name: /^Back to / }),
      row.getByRole('heading', { level: 1, name: 'Sales' }),
      row.getByRole('tablist', { name: 'Pages' }),
      row.getByRole('button', { name: 'History' }),
      row.getByRole('button', { name: /^Bookmarks/ }),
      row.getByRole('button', { name: 'Edit in my workspace' }),
      row.getByRole('button', { name: 'More' }),
      row.getByRole('button', { name: /^Filters\b/ }),
    ]);
    expect(row.queryByRole('button', { name: 'Dashboard settings' })).toBeNull();
    expectNothingOfTheSheet(header);
  });

  /**
   * Decision CLOSE-3 (AC-484, as AC-494 for History and Bookmarks): in My
   * workspace the copy's "Propose to …" carries an icon, and its words in a
   * label the stylesheet hides from 1,024 to 1,279 px, and in its accessible
   * name and tooltip, so the row keeps its tabs on its one line there.
   */
  it('in My workspace, its Propose names itself in its name and tooltip, its words a label beside an icon', () => {
    const header = view({
      place: {
        line: 'In My workspace',
        editsElsewhere: false,
        proposeTo: { label: 'Propose to Shared…', onClick: vi.fn() },
      },
    });
    const propose = within(header).getByRole('button', { name: 'Propose to Shared…' });
    expect(propose.getAttribute('aria-label')).toBe('Propose to Shared…');
    expect(propose.getAttribute('title')).toBe('Propose to Shared…');
    expect(propose.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(propose.querySelector('.header-action__label')?.textContent).toBe('Propose to Shared…');
  });

  it('keeps the page tabs out of the band under it', () => {
    view();
    const tablists = screen.getAllByRole('tablist', { name: 'Pages' });
    expect(tablists).toHaveLength(1);
    expect(document.querySelector('.dashboard__fixed [role="tablist"]')).toBeNull();
  });
});
