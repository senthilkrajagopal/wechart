import type { RenderSpec } from '@wechart/core';
import { render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TileLoadError } from '../query/loadTile';
import { useDashboardColours } from './colours';
import { DashboardView } from './DashboardView';
import type { DashboardDocument } from './model/document';

/**
 * T023 / AC-018: WHEN the user opens a dashboard from Explore, THE SYSTEM
 * SHALL open it in view mode with its saved page tabs, tiles and settings.
 * `Fails when: the dashboard opens in edit mode, or a saved tile or setting is
 * missing.`
 *
 * And AC-039: THE SYSTEM SHALL give a member the same colour in every tile of
 * a dashboard, and keep that colour when filters change the set of visible
 * members. The mechanism was built at T046; this is the first place several
 * tiles are rendered together, so it is the first place the criterion can
 * actually be observed.
 *
 * The dashboard takes its tiles' data as a prop, the way `FolderContents`
 * takes its rows — fetching belongs to the route. What the view owns, and
 * what AC-039 is about, is that the *dashboard* decides the colours and hands
 * the same ones to every tile.
 */
const STATUS = 'orders.status';
const COUNT = 'orders.count';

/**
 * The fixture's charts are tables rather than bars, because ECharts draws to a
 * canvas and jsdom has none — which is why drawn charts are tested headlessly
 * in @wechart/charts and never here. What this file is about is where a tile
 * lands and what it is, which is the same question whichever renderer the
 * tile ends up using. AC-039's colours are proved in `colours.test.ts` on the
 * function that decides them, and on real marks in the browser at `e2e/`.
 */

/**
 * Two tiles listing the same members in a different order, with one member
 * missing from the second. This is the shape that catches colour-by-position:
 * paint by index and "shipped" is slot 0 in one tile and slot 1 in the other.
 */
const FIRST: RenderSpec = {
  chartType: 'table',
  encoding: { x: [STATUS], y: [COUNT] },
  rows: [
    { [STATUS]: 'paid', [COUNT]: 3 },
    { [STATUS]: 'shipped', [COUNT]: 2 },
    { [STATUS]: 'refunded', [COUNT]: 1 },
  ],
};

const SECOND: RenderSpec = {
  chartType: 'table',
  encoding: { x: [STATUS], y: [COUNT] },
  rows: [{ [STATUS]: 'dispatched', [COUNT]: 5 }],
};

const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Revenue',
  settings: { width: 'full' },
  pages: [
    {
      id: 'p1',
      title: 'Overview',
      items: [
        { id: 't1', kind: 'chart', w: 6, h: 40, chartId: 'c1' },
        { id: 't2', kind: 'markdown', w: 6, h: 16, text: 'Notes for the quarter' },
        {
          id: 's1',
          kind: 'section',
          title: 'Detail',
          items: [{ id: 't3', kind: 'chart', w: 12, h: 40, chartId: 'c2' }],
        },
      ],
    },
    {
      id: 'p2',
      title: 'Appendix',
      items: [{ id: 't4', kind: 'header', w: 12, h: 8, text: 'More' }],
    },
  ],
};

const SPECS = { c1: FIRST, c2: SECOND };

/** The same dashboard with a tab group, which is legal only inside a section. */
const withTabGroup: DashboardDocument = {
  ...DOC,
  pages: [
    {
      id: 'p1',
      title: 'Overview',
      items: [
        {
          id: 's2',
          kind: 'section',
          title: 'Grouped',
          items: [
            {
              id: 'tg1',
              kind: 'tabs',
              w: 12,
              tabs: [
                {
                  id: 'a',
                  title: 'A',
                  items: [{ id: 'ta', kind: 'markdown', w: 6, h: 16, text: 'A side' }],
                },
                {
                  id: 'b',
                  title: 'B',
                  items: [{ id: 'tb', kind: 'markdown', w: 6, h: 16, text: 'B side' }],
                },
              ],
            },
          ],
        },
      ],
    },
    { id: 'p2', title: 'Appendix', items: [] },
  ],
};

const view = (document: DashboardDocument = DOC) =>
  render(<DashboardView document={document} specs={SPECS} onSave={vi.fn()} />);

describe('opening a saved dashboard (AC-018)', () => {
  it('opens in view mode, not in edit mode', () => {
    view();

    // The whole criterion turns on this: a dashboard that opened ready to edit
    // would put a reader one keystroke from changing what they came to read.
    expect(screen.queryByRole('toolbar', { name: 'Dashboard editing' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Edit sidebar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('shows every saved page tab', () => {
    view();

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Overview',
      'Appendix',
    ]);
  });

  it('shows every tile on the open page, including the ones inside a section', () => {
    view();

    const tiles = screen.getAllByTestId('grid-tile').map((tile) => tile.dataset['tile']);
    // A view that rendered only the page's top-level items would drop t3 and
    // still look right, which is why the fixture nests one.
    expect(tiles).toEqual(['t1', 't2', 't3']);
  });

  it('renders each tile as the kind it was saved as', () => {
    view();

    expect(screen.getByText('Notes for the quarter')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Detail' })).toBeTruthy();
  });

  it('opens the second page when its tab is chosen', async () => {
    view();
    await userEvent.click(screen.getByRole('tab', { name: 'Appendix' }));

    expect(screen.getAllByTestId('grid-tile').map((tile) => tile.dataset['tile'])).toEqual(['t4']);
  });

  it('applies the saved width setting', () => {
    view();

    // "settings" in the criterion is not decorative: a dashboard saved as full
    // width that reopens at 1,440 px has lost a setting.
    expect(screen.getByTestId('dashboard-page').dataset['width']).toBe('full');
  });

  it('applies a fixed width when that is what was saved', () => {
    view({ ...DOC, settings: { width: 'fixed' } });

    expect(screen.getByTestId('dashboard-page').dataset['width']).toBe('fixed');
  });

  it('shows what went wrong on a chart whose query failed, not an empty chart', () => {
    render(
      <DashboardView
        document={DOC}
        specs={{ c2: SECOND }}
        errors={{ c1: 'Cube said: no such member orders.nope' }}
        onSave={vi.fn()}
      />,
    );

    // AC-012's state, on a dashboard tile. An empty chart here would read as
    // "no data", which is the one answer it is not — and a chart that is
    // *absent* is a different thing again, which the next test covers.
    expect(screen.getByRole('alert').textContent).toContain('no such member orders.nope');
    expect(screen.queryByTestId('tile-missing-chart')).toBeNull();
  });

  it('says a chart is unavailable when there is no chart, which is not an error', () => {
    render(<DashboardView document={DOC} specs={{}} onSave={vi.fn()} />);

    expect(screen.getAllByTestId('tile-missing-chart').length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a skeleton while the charts are still on their way', () => {
    render(<DashboardView document={DOC} specs={{}} loading onSave={vi.fn()} />);

    // Loading, absent and broken are three states. Treating the first as the
    // second made "this chart is no longer available" the normal appearance of
    // a healthy dashboard for as long as its queries took (AC-042, AC-010).
    expect(screen.getAllByTestId('tile-skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('tile-missing-chart')).toBeNull();
  });

  it('keeps the query on a failed tile, so it can still be diagnosed', () => {
    const failure = new TileLoadError('Cube said no', { measures: ['orders.nope'] }, 400);
    render(<DashboardView document={DOC} specs={{}} errors={{ c1: failure }} onSave={vi.fn()} />);

    // AC-012 asks for the message *and* a control revealing the query JSON.
    // Flattening the error to its message shows the text and loses the
    // diagnosis, and the tile cannot tell the difference.
    expect(screen.getByRole('alert').textContent).toContain('Cube said no');
    expect(screen.getByRole('button', { name: /query/i })).toBeTruthy();
  });

  it('renders a saved tab group, showing its first tab', async () => {
    // Tab groups are part of the saved structure, so "a saved tile is
    // missing" covers a tile inside one. direction.md has tab groups load
    // lazily, which is why only the open tab's tiles are drawn.
    view(withTabGroup);

    const group = screen.getByRole('tablist', { name: /Tabs in/ });
    expect(
      within(group)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['A', 'B']);
    expect(screen.getAllByTestId('grid-tile').map((tile) => tile.dataset['tile'])).toEqual(['ta']);

    await userEvent.click(within(group).getByRole('tab', { name: 'B' }));
    expect(screen.getAllByTestId('grid-tile').map((tile) => tile.dataset['tile'])).toEqual(['tb']);
  });

  it('keeps the page tabs distinct from a tab group inside the page', () => {
    view(withTabGroup);

    // Two tablists on one page. A test that asked for "the tabs" would find
    // both, and so would a reader using a screen reader.
    expect(
      within(screen.getByRole('tablist', { name: 'Pages' }))
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Overview', 'Appendix']);
  });
});

describe('the assignment survives a re-render (AC-039)', () => {
  /**
   * `colours.test.ts` proves one call. This proves the part only a component
   * can have: the assignment is *kept*. A pure function recomputed on every
   * data change is exactly what hands a hidden member's colour to whoever is
   * now first, and that is what a filter does.
   */
  const REGION = 'orders.region';

  /**
   * Split by status, so each status is a series and so has a colour of its
   * own. The structural fixture above is a plain table, where there is one
   * series and nothing to agree about.
   */
  const split = (rows: readonly Record<string, unknown>[]): RenderSpec => ({
    chartType: 'bar',
    encoding: { x: [REGION], y: [COUNT], color: [STATUS] },
    rows,
  });

  const ALL = [
    { [REGION]: 'east', [STATUS]: 'paid', [COUNT]: 3 },
    { [REGION]: 'east', [STATUS]: 'shipped', [COUNT]: 2 },
    { [REGION]: 'east', [STATUS]: 'refunded', [COUNT]: 1 },
  ];

  const specsOf = (rows: readonly Record<string, unknown>[]) => ({
    c1: split(rows),
    c2: SECOND,
  });

  const START = specsOf(ALL);

  it('keeps a member on its colour after a filter removes another member', () => {
    const { result, rerender } = renderHook(
      ({ specs }: { specs: Record<string, RenderSpec> }) => useDashboardColours(DOC, specs),
      { initialProps: { specs: START } },
    );

    const before = result.current['c1']?.colours ?? {};
    expect(Object.keys(before)).toEqual(['paid', 'shipped', 'refunded']);

    // "paid" is filtered out. Recomputed from scratch, "shipped" would become
    // the first member claimed and take the colour "paid" had.
    rerender({ specs: specsOf(ALL.filter((row) => row[STATUS] !== 'paid')) });

    const after = result.current['c1']?.colours ?? {};
    expect(after['shipped']).toBe(before['shipped']);
    expect(after['refunded']).toBe(before['refunded']);
  });

  it('gives a member its colour back when the filter is lifted', () => {
    const { result, rerender } = renderHook(
      ({ specs }: { specs: Record<string, RenderSpec> }) => useDashboardColours(DOC, specs),
      { initialProps: { specs: START } },
    );

    const paid = result.current['c1']?.colours?.['paid'];
    rerender({ specs: specsOf(ALL.filter((row) => row[STATUS] === 'shipped')) });
    rerender({ specs: START });

    // The reader who learnt that this colour means "paid" is not taught
    // something false by filtering and unfiltering.
    expect(result.current['c1']?.colours?.['paid']).toBe(paid);
  });
});
