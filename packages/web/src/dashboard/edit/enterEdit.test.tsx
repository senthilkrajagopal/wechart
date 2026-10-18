import type { ChartDocument, RenderSpec } from '@wechart/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isInaccessible, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../DashboardView';
import type { DashboardDocument } from '../model/document';
import { EditChrome } from './EditChrome';

/**
 * T032 needs something other than the Edit button to be able to enter edit
 * mode. direction.md §2: "A tile's ✎ pencil opens the chart editor as a
 * full-viewport overlay … From view mode, the pencil switches the dashboard
 * into edit mode first."
 *
 * The session could change, undo and report its state, but only `EditChrome`
 * itself could start editing. This adds `session.edit()`.
 */
interface Doc {
  readonly tiles: readonly string[];
}

const DOC: Doc = { tiles: ['a'] };

function Harness() {
  return (
    <EditChrome document={DOC} title={() => 'Revenue'} onSave={vi.fn()}>
      {(session) => (
        <>
          <button type="button" onClick={() => session.edit()}>
            Pencil
          </button>
          <button
            type="button"
            onClick={() => session.change({ tiles: [...session.document.tiles, 'b'] })}
          >
            Add a tile
          </button>
          <p data-testid="tiles">{session.document.tiles.join(',')}</p>
        </>
      )}
    </EditChrome>
  );
}

const bar = () => screen.queryByRole('toolbar', { name: 'Dashboard editing' });

describe('entering edit mode from inside the dashboard', () => {
  it('shows the edit bar, as the Edit button does', async () => {
    render(<Harness />);
    expect(bar()).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Pencil' }));

    expect(bar()).not.toBeNull();
  });

  it('does nothing while already editing, so every change stays discardable', async () => {
    /**
     * Entering edit mode starts a fresh history — that is what makes Discard
     * return to where editing began (AC-066). A pencil pressed while editing
     * must not enter again. Doing so keeps the document as it is, so nothing
     * *looks* lost, but it moves the baseline to here: the user's changes
     * stay applied and can no longer be discarded, and the bar reports none.
     * Quieter than losing them, and worse for it.
     */
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Pencil' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add a tile' }));
    expect(screen.getByTestId('tiles').textContent).toBe('a,b');

    await userEvent.click(screen.getByRole('button', { name: 'Pencil' }));

    expect(screen.getByTestId('tiles').textContent).toBe('a,b');
    // And the change is still one Discard would undo.
    expect(screen.getByRole('button', { name: /Discard/ }).textContent).toBe('Discard (1 change)');
  });
});

/**
 * T836 (AC-491, AC-206; 19-Q3 (a); design 19 state C; rule 114): while a
 * dashboard is edited, the header sheet is open and the Filters toggle gone;
 * the compact row reads "Editing ‹name›", with "+ Page tab" after the inline
 * page tabs. Save or Discard puts the sheet back as the reader had it before
 * Edit was pressed.
 */
describe('the compact header in edit mode', () => {
  const DOC: DashboardDocument = {
    schemaVersion: 1,
    title: 'Sales',
    description: 'Revenue for EMEA.',
    settings: { width: 'full' },
    pages: [
      {
        id: 'p1',
        title: 'Overview',
        items: [{ id: 't-kpi', kind: 'chart', chartId: 'c-kpi', w: 3 }],
      },
      { id: 'p2', title: 'Detail', items: [] },
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
      vi.fn(async () => new Response(JSON.stringify({ data: [] }))),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const onSave = vi.fn();
  function board() {
    return render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DashboardView
          dashboardId="d1"
          document={DOC}
          specs={{ 'c-kpi': spec }}
          documents={{ 'c-kpi': kpi }}
          onSave={onSave}
          place={{ line: 'In Shared / Sales', editsElsewhere: false }}
        />
      </QueryClientProvider>,
    );
  }

  const row = () => document.querySelector<HTMLElement>('.dashboard__header')!;
  const toggle = () => within(row()).queryByRole('button', { name: /^Filters\b/ });
  /** The filter bar, reachable only while the sheet shows. */
  const bar = () => screen.queryByRole('region', { name: 'Filters' });

  it('shows the sheet open and no toggle, the row reading "Editing ‹name›" with "+ Page tab" after the tabs; Discard puts it back closed', async () => {
    board();
    expect(toggle()?.getAttribute('aria-expanded')).toBe('false');
    expect(bar()).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    // Open, nothing in it hidden, and no toggle anywhere.
    expect(toggle()).toBeNull();
    expect(screen.queryByRole('button', { name: /^(Filters\b|Details$)/ })).toBeNull();
    expect(bar()).not.toBeNull();
    expect(isInaccessible(bar()!)).toBe(false);
    // The row's title and its "+ Page tab", after the inline tabs (AC-206).
    expect(within(row()).getByRole('heading', { level: 1 }).textContent).toBe('Editing Sales');
    const tabs = within(row()).getByRole('tablist', { name: 'Pages' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Overview', 'Detail']);
    const add = within(row()).getByRole('button', { name: '+ Page tab' });
    expect(tabs.contains(add)).toBe(false);
    expect(tabs.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Nothing the reader alone uses: no "More ▾" for the pages (AC-491).
    expect(within(row()).queryByRole('button', { name: /^More\b/ })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /^Discard/ }));

    expect(toggle()?.getAttribute('aria-expanded')).toBe('false');
    expect(bar()).toBeNull();
    expect(within(row()).getByRole('heading', { level: 1 }).textContent).toBe('Sales');
    expect(within(row()).queryByRole('button', { name: '+ Page tab' })).toBeNull();
  });

  it('leaves the sheet open after Save when the reader had it open before Edit', async () => {
    board();
    await userEvent.click(toggle()!);
    expect(toggle()?.getAttribute('aria-expanded')).toBe('true');

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(toggle()).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalled();
    expect(screen.queryByRole('toolbar', { name: 'Dashboard editing' })).toBeNull();
    expect(toggle()?.getAttribute('aria-expanded')).toBe('true');
    expect(bar()).not.toBeNull();
    expect(isInaccessible(bar()!)).toBe(false);
  });

  it('puts it back closed after Save when the reader had it closed', async () => {
    board();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(bar()).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(toggle()?.getAttribute('aria-expanded')).toBe('false');
    expect(bar()).toBeNull();
  });
});
