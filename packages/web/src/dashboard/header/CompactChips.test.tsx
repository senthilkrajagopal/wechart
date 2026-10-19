import type { ChartDocument, RenderSpec } from '@wechart/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../DashboardView';
import type { DashboardDocument } from '../model/document';

/**
 * T838 (AC-200, AC-119, AC-098; design 19 screen 1 pin 4, states B4 and D1):
 * while the header sheet is closed, the compact row summarises what is
 * marked, or cross-filtered: a compact chip per non-empty marking, at most
 * two and then "+n", or the first cross-filter's compact chip and then "+n".
 * Each has its menu and its ×; the tile it came from is in its tooltip, its
 * accessible name and its menu's heading. With the sheet open, they give way
 * to the full chips in the bar.
 */
const BAR: RenderSpec = {
  chartType: 'bar',
  encoding: { x: ['orders.status'], y: ['orders.count'] },
  rows: [
    { 'orders.status': 'shipped', 'orders.count': 3 },
    { 'orders.status': 'completed', 'orders.count': 5 },
  ],
};
const chartTitled = (title: string): ChartDocument => ({
  schemaVersion: 1,
  title,
  chart: {
    source: { cube: 'orders' },
    wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
    chartType: 'bar',
  },
});
const TILES = [
  { tile: 't-a', chart: 'c-a', title: 'By status', marking: 'mk1' },
  { tile: 't-b', chart: 'c-b', title: 'Status share', marking: 'mk2' },
  { tile: 't-c', chart: 'c-c', title: 'Status trend', marking: 'mk3' },
] as const;

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ data: [] }))),
  );
  // A chart's canvas sizes itself by one; jsdom has none.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Three bar tiles, each marking with a marking of its own, or cross-filtering. */
function board(mode: 'markings' | 'crossFilter') {
  const document: DashboardDocument = {
    schemaVersion: 1,
    title: 'Sales',
    description: 'Revenue for EMEA.',
    settings: {
      width: 'full',
      // Highlighting, so a tile cross-filtered still draws its items for the
      // keyboard to pick (jsdom has no Cube to ask again).
      interactions: { mode, crossFilter: { defaultAction: 'highlight' } },
    },
    markings: [
      { id: 'mk1', name: 'Marking', slot: 'mk1', isDefault: true },
      { id: 'mk2', name: 'Shortlist', slot: 'mk2', isDefault: false },
      { id: 'mk3', name: 'Review', slot: 'mk3', isDefault: false },
    ],
    pages: [
      {
        id: 'p1',
        title: 'Overview',
        items: TILES.map((each) => ({
          id: each.tile,
          kind: 'chart' as const,
          chartId: each.chart,
          w: 4,
          marksWith: each.marking,
        })),
      },
    ],
    filters: [{ id: 'f1', widget: 'checkbox', member: 'orders.status' }],
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DashboardView
        dashboardId="d1"
        document={document}
        specs={Object.fromEntries(TILES.map((each) => [each.chart, BAR]))}
        documents={Object.fromEntries(TILES.map((each) => [each.chart, chartTitled(each.title)]))}
        onSave={vi.fn()}
        place={{ line: 'In Shared / Sales', editsElsewhere: false }}
        memberTitle={(member) => (member === 'orders.status' ? 'Status' : undefined)}
      />
    </QueryClientProvider>,
  );
}

const row = () => document.querySelector<HTMLElement>('.dashboard__header')!;
const toggle = () => within(row()).getByRole('button', { name: /^Filters\b/ });
const tileOf = (id: string) => document.querySelector<HTMLElement>(`[data-tile="${id}"]`)!;
/** Space on a focused tile marks, or cross-filters, its first item (T405). */
async function pick(id: string) {
  tileOf(id).focus();
  await userEvent.keyboard(' ');
}
const compactMarks = () => within(row()).queryAllByTestId('compact-mark-chip');
const compactCrosses = () => within(row()).queryAllByTestId('compact-cross-chip');
const more = () => within(row()).queryByTestId('compact-chips-more');

describe('the compact chips', () => {
  it('shows two marking chips then "+1", each naming its marking and values, from its tile, its × unmarking', async () => {
    board('markings');
    for (const each of TILES) await pick(each.tile);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');

    const chips = compactMarks();
    expect(chips).toHaveLength(2);
    // "+1" for the third, which it names for whoever can't see it.
    expect(more()?.querySelector('[aria-hidden="true"]')?.textContent).toBe('+1');
    expect(more()?.textContent).toContain('1 more: Review');

    const [first, second] = chips as [HTMLElement, HTMLElement];
    // The marking's name and its values by the members' titles (AC-200,
    // AC-098); the tile in its tooltip and accessible name.
    expect(first.querySelector('.compact-chip__name')?.textContent).toBe('Marking');
    expect(first.querySelector('.compact-chip__values')?.textContent).toBe('Status: shipped');
    expect(first.getAttribute('role')).toBe('group');
    expect(first.getAttribute('aria-label')).toBe('Marking: Status: shipped, from By status');
    expect(first.getAttribute('title')).toBe('Marking: Status: shipped, from By status');
    expect(first.textContent).not.toContain('orders.status');
    expect(second.getAttribute('aria-label')).toBe('Shortlist: Status: shipped, from Status share');
    // Bordered in its marking's colour, as the full chip is.
    expect(first.style.borderColor).not.toBe('');
    expect(first.style.borderColor).not.toBe(second.style.borderColor);

    // Its menu, headed by the tile it came from.
    await userEvent.click(within(first).getByRole('button', { name: 'Marking menu' }));
    const menu = screen.getByRole('menu', { name: 'Marking menu' });
    expect(menu.querySelector('.menu-button__head')?.textContent).toBe('Marking, from By status');
    expect(within(menu).getByRole('menuitem', { name: 'Unmark' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');

    // Its × unmarks it: the third comes into the row, and "+n" goes.
    await userEvent.click(within(first).getByRole('button', { name: 'Unmark Marking' }));
    expect(
      compactMarks().map((chip) => chip.querySelector('.compact-chip__name')?.textContent),
    ).toEqual(['Shortlist', 'Review']);
    expect(more()).toBeNull();
    // Focus on to the next compact chip's ×, not left on the page.
    await vi.waitFor(() => {
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Unmark Shortlist');
      expect(row().contains(document.activeElement)).toBe(true);
    });
  });

  it('shows the first cross-filter then "+1", naming member and value, from its tile, its × clearing it (AC-119)', async () => {
    board('crossFilter');
    await pick('t-a');
    await pick('t-b');
    expect(document.querySelectorAll('[data-testid="cross-filter-chip"]')).toHaveLength(2);

    const chips = compactCrosses();
    expect(chips).toHaveLength(1);
    expect(compactMarks()).toHaveLength(0);
    expect(more()?.querySelector('[aria-hidden="true"]')?.textContent).toBe('+1');

    const chip = chips[0] as HTMLElement;
    expect(chip.querySelector('.compact-chip__values')?.textContent).toBe('Status = shipped');
    expect(chip.getAttribute('role')).toBe('group');
    expect(chip.getAttribute('aria-label')).toBe('Status = shipped, from By status');
    expect(chip.getAttribute('title')).toBe('Status = shipped, from By status');

    await userEvent.click(within(chip).getByRole('button', { name: 'Status = shipped menu' }));
    const menu = screen.getByRole('menu', { name: 'Status = shipped menu' });
    expect(menu.querySelector('.menu-button__head')?.textContent).toBe(
      'Status = shipped, from By status',
    );
    expect(within(menu).getByRole('menuitem', { name: 'Clear' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');

    await userEvent.click(within(chip).getByRole('button', { name: 'Clear Status = shipped' }));
    expect(document.querySelectorAll('[data-testid="cross-filter-chip"]')).toHaveLength(1);
    const left = compactCrosses();
    expect(left).toHaveLength(1);
    expect(left[0]?.getAttribute('aria-label')).toBe('Status = shipped, from Status share');
    expect(more()).toBeNull();
    await vi.waitFor(() => {
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Clear Status = shipped');
      expect(row().contains(document.activeElement)).toBe(true);
    });
  });

  it('gives way to the full chips in the bar while the sheet is open', async () => {
    board('markings');
    await pick('t-a');
    expect(compactMarks()).toHaveLength(1);

    await userEvent.click(toggle());

    expect(compactMarks()).toHaveLength(0);
    expect(more()).toBeNull();
    const bar = screen.getByRole('region', { name: 'Filters' });
    expect(within(bar).getAllByTestId('mark-chip')).toHaveLength(1);

    await userEvent.click(toggle());
    expect(compactMarks()).toHaveLength(1);
  });

  it('says what Copy link with marks came to beside the chips, with the sheet closed', async () => {
    board('markings');
    await pick('t-a');
    const chip = compactMarks()[0] as HTMLElement;
    await userEvent.click(within(chip).getByRole('button', { name: 'Marking menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Copy link with marks' }));

    await vi.waitFor(() => {
      // jsdom has no secure clipboard: the note says so, as the bar's would.
      expect(within(row()).getByTestId('compact-link-note').textContent).toMatch(
        /^Copying needs a secure page/,
      );
    });
  });

  it('shows none with nothing marked or cross-filtered', () => {
    board('markings');
    expect(compactMarks()).toHaveLength(0);
    expect(compactCrosses()).toHaveLength(0);
    expect(more()).toBeNull();
    expect(count()).toBeNull();
  });
});

/**
 * AC-484, decision CLOSE-2: below 1,280 px the compact chips collapse to a
 * count, "n filters" or "n markings", so the row keeps its tabs and its
 * toggle on one line. The stylesheet shows the count, not the chips, from
 * 1,024 to 1,279 px (headerStyles.ts); both are drawn, one hidden. The
 * count's accessible name and tooltip list what it holds, and it opens the
 * header sheet, where the full chips are, focus going to the Filters toggle.
 */
const count = () => within(row()).queryByTestId('compact-chips-count');

describe('the compact chips as a count (AC-484, CLOSE-2)', () => {
  it('counts the cross-filters, lists them in its name and tooltip, and opens the sheet', async () => {
    board('crossFilter');
    await pick('t-a');
    await pick('t-b');

    const button = count()!;
    expect(button.tagName).toBe('BUTTON');
    expect(button.textContent).toBe('2 filters');
    const said =
      '2 filters: Status = shipped, from By status; Status = shipped, from Status share';
    expect(button.getAttribute('aria-label')).toBe(said);
    expect(button.getAttribute('title')).toBe(said);
    expect(button.getAttribute('aria-controls')).toBe(toggle().getAttribute('aria-controls'));

    await userEvent.click(button);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(count()).toBeNull();
    expect(document.activeElement).toBe(toggle());
  });

  it('counts the non-empty markings, one as "1 marking"', async () => {
    board('markings');
    await pick('t-a');
    expect(count()?.textContent).toBe('1 marking');
    expect(count()?.getAttribute('aria-label')).toBe(
      '1 marking: Marking: Status: shipped, from By status',
    );
    await pick('t-b');
    await pick('t-c');
    expect(count()?.textContent).toBe('3 markings');
    expect(count()?.getAttribute('aria-label')).toBe(
      '3 markings: Marking: Status: shipped, from By status; Shortlist: Status: shipped, from Status share; Review: Status: shipped, from Status trend',
    );
  });
});
