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
      // No height: a header is as tall as its text (`SIZED_KINDS`).
      items: [{ id: 't4', kind: 'header', w: 12, text: 'More' }],
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

    const items = screen.getAllByTestId('grid-item').map((item) => item.dataset['tile']);
    // A view that rendered only the page's top-level items would drop t3 and
    // still look right, which is why the fixture nests one.
    //
    // The section is itself a grid item: it takes a position on the page's
    // grid exactly as a tile does, which is what lets a tile be dropped before
    // or after it (AC-056).
    expect(items).toEqual(['t1', 't2', 's1', 't3']);
  });

  it('renders each tile as the kind it was saved as', () => {
    view();

    expect(screen.getByText('Notes for the quarter')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Detail' })).toBeTruthy();
  });

  it('opens the second page when its tab is chosen', async () => {
    view();
    await userEvent.click(screen.getByRole('tab', { name: 'Appendix' }));

    expect(screen.getAllByTestId('grid-item').map((tile) => tile.dataset['tile'])).toEqual(['t4']);
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
    // The section and the tab group take positions on the grid too; only the
    // open tab's own tiles are drawn beneath them.
    expect(screen.getAllByTestId('grid-item').map((item) => item.dataset['tile'])).toEqual([
      's2',
      'tg1',
      'ta',
    ]);

    await userEvent.click(within(group).getByRole('tab', { name: 'B' }));
    expect(screen.getAllByTestId('grid-item').map((item) => item.dataset['tile'])).toEqual([
      's2',
      'tg1',
      'tb',
    ]);
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

describe('moving a tile without dragging it (AC-056)', () => {
  const edit = async (document: DashboardDocument = DOC) => {
    render(<DashboardView document={document} specs={SPECS} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  };

  it('gives a grip the baseline a screen reader needs to use it', async () => {
    await edit();
    const grip = screen.getByTestId('grip-t2');

    /**
     * docs/research/dashboard-grid.md makes this a condition of writing the
     * drag ourselves instead of taking dnd-kit: a role description on the
     * grip, persistent instructions it points at, and a polite live region.
     * Without them a drag is a silent change to the document.
     */
    expect(grip.getAttribute('aria-roledescription')).toBe('draggable tile');
    const describedBy = grip.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.textContent).toContain('without dragging');

    const region = screen.getByTestId('drag-announcement');
    expect(region.getAttribute('aria-live')).toBe('polite');

    // And it is named for what it is, not for its id.
    expect(grip.getAttribute('aria-label')).toBe('Move markdown: Notes for the quarter');
  });

  it('acts on a key only when the tile itself has focus', async () => {
    await edit();

    // Delete pressed while focus is on the tile's own ⋯ button must not
    // destroy the tile — nor would an arrow key in an open menu move it, nor
    // an "e" typed into a future text field leave for the chart editor.
    const before = screen.getAllByTestId('grid-item').map((item) => item.dataset['tile']);
    screen.getByTestId('tile-menu-t1').focus();
    await userEvent.keyboard('{Delete}');

    expect(screen.getAllByTestId('grid-item').map((item) => item.dataset['tile'])).toEqual(before);
  });

  it('records nothing for a key that changed nothing', async () => {
    await edit();
    const first = screen.getAllByTestId('grid-item')[0] as HTMLElement;
    first.focus();

    // The first tile in its container cannot go earlier. Holding the key
    // against that edge would otherwise pile up undo entries that each undo
    // nothing — the failure the pointer path already guards against for a
    // click on a resize handle.
    for (let press = 0; press < 4; press += 1) await userEvent.keyboard('{ArrowLeft}');

    expect(screen.getByRole('button', { name: /^Discard/ }).textContent).toBe('Discard');
    expect(screen.getByRole('button', { name: 'Undo' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('leaves a section alone, exactly as the drag refuses one', async () => {
    await edit();
    const section = screen
      .getAllByTestId('grid-item')
      .find((item) => item.dataset['tile'] === 's1') as HTMLElement;

    section.focus();
    await userEvent.keyboard('{Delete}');

    // Delete is the most destructive of the four keys, and AC-057 says "a
    // tile". Taking a section and everything in it, with no prompt, would
    // also pre-empt AC-061 in the more destructive direction.
    expect(screen.getAllByTestId('grid-item').map((item) => item.dataset['tile'])).toContain('s1');
  });

  it('says what a key did, into the same region the drag narrates into', async () => {
    await edit();
    const first = screen.getAllByTestId('grid-item')[0] as HTMLElement;
    first.focus();
    await userEvent.keyboard('{ArrowRight}');

    // docs/research/dashboard-grid.md makes announcements a condition of
    // building this in-house, and the keyboard is exactly where dnd-kit
    // would have supplied them.
    expect(screen.getByTestId('drag-announcement').textContent).toContain('position 2 of 3');
  });

  it('gives no grip to a section, which is a container rather than a tile', async () => {
    await edit();

    // A grip on a container was a gesture no criterion describes, and it let
    // a section be dropped inside itself.
    expect(screen.queryByTestId('grip-s1')).toBeNull();
    expect(screen.getByTestId('grip-t1').getAttribute('aria-roledescription')).toBe(
      'draggable tile',
    );
  });

  it('offers no tile menu in view mode', () => {
    view();

    expect(screen.queryByTestId('tile-menu-t1')).toBeNull();
  });

  it('offers a way to move a tile that does not require a drag', async () => {
    await edit();
    await userEvent.click(screen.getByTestId('tile-menu-t1'));

    // WCAG SC 2.5.7 forbids a path that can only be travelled by dragging,
    // and docs/research/dashboard-grid.md makes this menu a condition of
    // building the drag ourselves instead of taking a library.
    expect(screen.getByTestId('move-t1-to-sec:s1').textContent).toBe('Overview › Detail');
  });

  it('does not offer to move a tile where it already is', async () => {
    await edit();
    await userEvent.click(screen.getByTestId('tile-menu-t1'));

    // t1 is on page p1, so that is not somewhere to move it to.
    expect(screen.queryByTestId('move-t1-to-page:p1')).toBeNull();
  });

  it('closes on Escape and gives focus back, rather than trapping it', async () => {
    await edit();
    const trigger = screen.getByTestId('tile-menu-t1');
    await userEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    await userEvent.keyboard('{Escape}');

    // A menu that exists to satisfy an accessibility rule and then strands a
    // keyboard user inside it would be its own failure.
    expect(screen.queryByTestId('move-t1-to-sec:s1')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('moves the tile when a destination is chosen', async () => {
    await edit();
    await userEvent.click(screen.getByTestId('tile-menu-t1'));
    await userEvent.click(screen.getByTestId('move-t1-to-sec:s1'));

    // Out of the page's own items and into the section's, which is exactly
    // what a drop on that container does.
    const section = screen.getByTestId('dashboard-page').querySelector('[data-section="s1"]');
    const inside = [...(section?.querySelectorAll('[data-tile]') ?? [])].map((node) =>
      node.getAttribute('data-tile'),
    );
    expect(inside).toEqual(['t3', 't1']);
  });
});

describe('adding an element from the sidebar (AC-058)', () => {
  const edit = async () => {
    render(<DashboardView document={DOC} specs={SPECS} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  };

  it('offers every element type the criterion names', async () => {
    await edit();

    // Reachable, not merely defined: the palette lives in the Add panel, and
    // the Add panel had no content at all until now.
    const list = screen.getByRole('list', { name: 'Elements to add' });
    expect(
      within(list)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toHaveLength(10);
    expect(screen.getByTestId('add-markdown')).toBeTruthy();
  });

  it('says where the element will land before it is clicked', async () => {
    await edit();

    // "After the selection or into the chosen slot" is a rule the user cannot
    // see, and an insert that lands somewhere unexpected is the criterion's
    // own failing state.
    expect(screen.getByTestId('add-destination').textContent).toBe('Adds to the end of Overview.');
  });

  it('inserts after the selection once a tile is chosen', async () => {
    await edit();
    const first = screen.getAllByTestId('grid-item')[0] as HTMLElement;
    await userEvent.click(first);

    // Naming the container alone could not tell this from "the end of the
    // page", which is exactly the distinction the criterion draws.
    expect(screen.getByTestId('add-destination').textContent).toBe(
      'Adds to Overview, after chart tile.',
    );
    await userEvent.click(screen.getByTestId('add-divider'));

    // Straight after t1, not at the end of the page — which is the whole
    // difference between "after the selection" and "somewhere else", and the
    // criterion's own failing state.
    const ids = screen.getAllByTestId('grid-item').map((item) => item.dataset['tile']);
    expect(ids.indexOf('t2')).toBe(ids.indexOf('t1') + 2);
  });

  it('inserts into the chosen "+ Add" slot, which wins over the selection', async () => {
    await edit();
    await userEvent.click(screen.getAllByTestId('grid-item')[0] as HTMLElement);
    await userEvent.click(screen.getByTestId('add-here-sec:s1'));

    expect(screen.getByTestId('add-destination').textContent).toBe(
      'Adds to the end of Overview › Detail.',
    );
    await userEvent.click(screen.getByTestId('add-divider'));

    // Into the section, at its end — not after the tile that is still
    // selected on the page above it.
    const section = screen.getByTestId('dashboard-page').querySelector('[data-section="s1"]');
    const inside = [...(section?.querySelectorAll('[data-tile]') ?? [])].map((node) =>
      node.getAttribute('data-tile'),
    );
    expect(inside).toHaveLength(2);
    expect(inside[0]).toBe('t3');
  });

  it('wraps a tab group added to a page in a section, and says so (AC-059)', async () => {
    await edit();
    await userEvent.click(screen.getByTestId('add-tabs'));

    // direction.md rule 37: a tab group can exist only inside a section. The
    // criterion's failing state is one created directly on a page tab...
    const sections = screen.getByTestId('dashboard-page').querySelectorAll('.dashboard-section');
    expect(sections.length).toBe(2);

    // ...and the other half is that nothing explains it. A section nobody
    // asked for, appearing silently, is its own kind of surprise.
    expect(screen.getByTestId('add-message').textContent).toMatch(/section/i);
  });

  it('inserts the chosen element onto the dashboard', async () => {
    await edit();
    const before = screen.getAllByTestId('grid-item').length;

    await userEvent.click(screen.getByTestId('add-divider'));

    expect(screen.getAllByTestId('grid-item').length).toBe(before + 1);
    // And it is an undoable change like any other.
    expect(screen.getByRole('button', { name: /^Discard/ }).textContent).toBe('Discard (1 change)');
  });
});

describe('an undo for every delete (AC-060)', () => {
  const edit = async () => {
    render(<DashboardView document={DOC} specs={SPECS} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  };

  const deleteFirstTile = async () => {
    const tile = screen.getAllByTestId('grid-item')[0] as HTMLElement;
    tile.focus();
    await userEvent.keyboard('{Delete}');
  };

  it('offers the undo in a toast, naming what went', async () => {
    await edit();
    await deleteFirstTile();

    // "No undo is offered" is half the criterion's failing state. There are
    // two Undo buttons on the page now — the toast's and the edit bar's —
    // which is precisely what "in a toast **and** through Undo" asks for.
    const toast = screen.getByTestId('undo-toast');
    expect(toast.textContent).toContain('Deleted');
    expect(within(toast).getByRole('button', { name: 'Undo' }).tagName).toBe('BUTTON');
  });

  it('puts the element back from the toast', async () => {
    await edit();
    const before = screen.getAllByTestId('grid-item').map((item) => item.dataset['tile']);
    await deleteFirstTile();

    await userEvent.click(
      within(screen.getByTestId('undo-toast')).getByRole('button', { name: 'Undo' }),
    );

    expect(screen.getAllByTestId('grid-item').map((item) => item.dataset['tile'])).toEqual(before);
    // And the toast goes with it: offering to undo what is already back would
    // undo something else.
    expect(screen.queryByTestId('undo-toast')).toBeNull();
  });

  it('puts it back from the edit bar too, which is the same history', async () => {
    await edit();
    const before = screen.getAllByTestId('grid-item').map((item) => item.dataset['tile']);
    await deleteFirstTile();

    await userEvent.click(
      within(screen.getByRole('toolbar', { name: 'Dashboard editing' })).getByRole('button', {
        name: 'Undo',
      }),
    );

    expect(screen.getAllByTestId('grid-item').map((item) => item.dataset['tile'])).toEqual(before);
  });

  it('deletes a page tab and a tab, the two that are not on the grid', async () => {
    render(<DashboardView document={withTabGroup} specs={SPECS} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    // A page tab: neither the Delete key nor a tile's ⋯ menu reaches one.
    await userEvent.click(screen.getByTestId('delete-page-p2'));
    expect(screen.getByTestId('undo-toast').textContent).toContain('Appendix');
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).not.toContain('Appendix');

    // And a tab of a tab group, the fourth of the four.
    await userEvent.click(screen.getByTestId('delete-tab-tg1-b'));
    expect(screen.getByTestId('undo-toast').textContent).toContain('B');
  });

  it('restores a section with everything that was inside it', async () => {
    await edit();
    const before = screen.getAllByTestId('grid-item').map((item) => item.dataset['tile']);

    /**
     * Through the ⋯ menu, not the Delete key: the key acts on tiles alone,
     * because a container taken with no prompt would pre-empt AC-061's "ask
     * whether to delete its contents or keep them". The criterion still names
     * sections, so the menu is where they go.
     *
     * The section holds t3, and "restoring the element **and its contents**"
     * is the criterion — a delete that emptied it first would bring back an
     * empty section.
     */
    await userEvent.click(screen.getByTestId('tile-menu-s1'));
    await userEvent.click(screen.getByTestId('delete-s1'));
    expect(screen.queryAllByTestId('grid-item').map((i) => i.dataset['tile'])).not.toContain('t3');

    await userEvent.click(
      within(screen.getByTestId('undo-toast')).getByRole('button', { name: 'Undo' }),
    );
    expect(screen.getAllByTestId('grid-item').map((item) => item.dataset['tile'])).toEqual(before);
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
