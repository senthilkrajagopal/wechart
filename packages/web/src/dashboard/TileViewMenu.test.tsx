import type { RenderSpec } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TileViewMenu, csvFileName } from './TileViewMenu';

/**
 * T177 / AC-171: WHEN the user exports a chart, THE SYSTEM SHALL produce a
 * CSV whose rows and columns match what the tile shows.
 *
 * From the tile's ⋯ menu in view mode, as the prototype's is ("Download
 * CSV"): the file is the tile's render spec as CSV (`csvOf`).
 */
const SPEC: RenderSpec = {
  chartType: 'bar',
  encoding: { x: ['orders.status'], y: ['orders.count'] },
  rows: [
    { 'orders.status': 'shipped', 'orders.count': '3' },
    { 'orders.status': 'completed', 'orders.count': '5' },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

/** Export › CSV (T272, AC-244): the tile's table, where Download CSV was. */
async function exportCsv() {
  await userEvent.click(screen.getByRole('menuitem', { name: /^Export/ }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'CSV' }));
}

describe('a tile’s view-mode menu', () => {
  it('downloads the tile’s rows and columns as CSV, named by its chart', async () => {
    const saved: { name: string; text: string | Blob }[] = [];
    render(
      <TileViewMenu
        tileId="t1"
        title="Orders by status"
        spec={SPEC}
        save={(name, text) => {
          saved.push({ name, text });
        }}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'Actions for Orders by status' });
    await userEvent.click(trigger);
    await exportCsv();

    expect(saved).toEqual([
      {
        name: 'Orders by status.csv',
        // The tile's table, after the mark telling a spreadsheet it is UTF-8.
        text: '﻿orders.status,orders.count\r\nshipped,3\r\ncompleted,5',
      },
    ]);
    // Closed, submenu and all, and focus back where it was opened.
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  /**
   * T178 / AC-172: WHEN an export exceeds the row limit Cube returns, THE
   * SYSTEM SHALL say how many rows were exported and that the result was
   * truncated. Fails when: a truncated export claims to be complete.
   */
  it('says how many rows it wrote, and that Cube cut them short past its limit', async () => {
    const order: string[] = [];
    render(
      <TileViewMenu
        tileId="t1"
        title="T"
        spec={SPEC}
        countRows={async () => {
          order.push('counted');
          return { returned: 10_000, total: 12_345 };
        }}
        save={() => {
          order.push('saved');
        }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for T' }));
    await exportCsv();

    const note = await screen.findByText(/^Downloaded 2 rows\. Truncated:/);
    expect(note.textContent).toBe(
      'Downloaded 2 rows. Truncated: the query has 12,345 rows, and Cube returned the first 10,000.',
    );
    expect(note.getAttribute('role')).toBe('status');
    // The file first, at the click; the count after.
    expect(order).toEqual(['saved', 'counted']);
  });

  it('says nothing was cut short when Cube returned every row', async () => {
    render(
      <TileViewMenu
        tileId="t1"
        title="T"
        spec={SPEC}
        countRows={async () => ({ returned: 2, total: 2 })}
        save={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for T' }));
    await exportCsv();

    expect((await screen.findByText(/Nothing was cut short/)).textContent).toBe(
      'Downloaded 2 rows. Nothing was cut short: Cube returned all 2 rows of the query.',
    );
  });

  it('says it could not tell when the count fails or cannot be had', async () => {
    for (const countRows of [async () => Promise.reject(new Error('down')), undefined]) {
      const { unmount } = render(
        <TileViewMenu tileId="t1" title="T" spec={SPEC} countRows={countRows} save={vi.fn()} />,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Actions for T' }));
      await exportCsv();
      expect((await screen.findByText(/Could not tell/)).textContent).toBe(
        'Downloaded 2 rows. Could not tell whether Cube cut the result short.',
      );
      unmount();
    }
  });

  /** From T178's review: an earlier download's count, arriving late, is not said of the last. */
  it('says only the latest download’s count, letting go of the one before', async () => {
    const counts: {
      signal: AbortSignal;
      answer: (counted: { returned: number; total: number }) => void;
    }[] = [];
    render(
      <TileViewMenu
        tileId="t1"
        title="T"
        spec={SPEC}
        countRows={(signal) =>
          new Promise((answer) => {
            counts.push({ signal, answer });
          })
        }
        save={vi.fn()}
      />,
    );
    for (let time = 0; time < 2; time += 1) {
      await userEvent.click(screen.getByRole('button', { name: 'Actions for T' }));
      await exportCsv();
    }
    expect(counts[0]?.signal.aborted).toBe(true);

    // The last download's count, truncated, and then the first's, late.
    counts[1]?.answer({ returned: 10_000, total: 12_345 });
    await screen.findByText(/Truncated/);
    counts[0]?.answer({ returned: 2, total: 2 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(/Nothing was cut short/)).toBeNull();
    expect(screen.getByText(/Truncated/)).toBeTruthy();
  });

  it('puts the note away when the menu is opened, so neither covers the other', async () => {
    render(
      <TileViewMenu
        tileId="t1"
        title="T"
        spec={SPEC}
        countRows={async () => ({ returned: 2, total: 2 })}
        save={vi.fn()}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Actions for T' });
    await userEvent.click(trigger);
    await exportCsv();
    await screen.findByText(/Nothing was cut short/);

    // From the keyboard, where focus went back to.
    expect(document.activeElement).toBe(trigger);
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: /^Export/ })).toBeTruthy();
    expect(screen.queryByText(/Nothing was cut short/)).toBeNull();
  });

  it('offers no download while the tile’s newest answer is on its way (T177’s review)', async () => {
    const save = vi.fn();
    render(<TileViewMenu tileId="t1" title="T" spec={SPEC} asking save={save} />);
    await userEvent.click(screen.getByRole('button', { name: 'Actions for T' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^Export/ }));

    const download = screen.getByRole('menuitem', { name: 'CSV' });
    // A menu item says it is off as the APG menu has it, and stays focusable (T266).
    expect(download.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(download);
    expect(save).not.toHaveBeenCalled();
    // Why, in words beside it (T182, AC-176): a disabled button takes no
    // focus, so a tooltip on it was out of the keyboard's reach.
    const why = screen.getByText('Its newest answer is still on its way.').closest('p');
    expect(download.getAttribute('aria-describedby')).toBe(why?.id);
    expect(download.hasAttribute('title')).toBe(false);
  });

  it('closes on a press elsewhere', async () => {
    render(
      <>
        <button type="button">Elsewhere</button>
        <TileViewMenu tileId="t1" title="T" spec={SPEC} save={vi.fn()} />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for T' }));
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  /**
   * T272 / AC-244: THE SYSTEM SHALL offer under a chart tile's Export the
   * tile's CSV, the marked rows' CSV while the marking holds items, and SVG
   * and PNG images of a chart ECharts draws, each downloading the chart as
   * drawn.
   * `Fails when: one of those items is missing where it applies, or an image
   * file is not the chart as drawn.` The images themselves are the e2e's.
   */
  it('offers under Export the CSV, the marked rows’ CSV while something is marked, and the images', async () => {
    const saved: { name: string; text: string | Blob }[] = [];
    const marked = {
      name: 'Marking',
      count: 1,
      onUnmark: vi.fn(),
      exportRows: async () => ({ text: 'Status\r\nshipped', written: 1, total: 1 }),
    };
    const { rerender } = render(
      <TileViewMenu
        tileId="t1"
        title="By status"
        spec={SPEC}
        marked={marked}
        save={(name, text) => {
          saved.push({ name, text });
        }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for By status' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^Export/ }));

    const exported = screen.getByRole('menu', { name: /^Export/ });
    expect(
      [...exported.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent),
    ).toEqual(['CSV', 'Marked rows CSV', 'SVG image', 'PNG image']);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Marked rows CSV' }));
    await vi.waitFor(() => {
      expect(saved).toEqual([{ name: 'By status - marked rows.csv', text: '﻿Status\r\nshipped' }]);
    });
    expect((await screen.findByRole('status')).textContent).toContain('Downloaded 1 row');

    // Nothing marked: no marked rows to export.
    rerender(
      <TileViewMenu
        tileId="t1"
        title="By status"
        spec={SPEC}
        marked={{ ...marked, count: 0 }}
        save={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for By status' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^Export/ }));
    expect(screen.queryByRole('menuitem', { name: 'Marked rows CSV' })).toBeNull();
  });

  /**
   * T271 / AC-241, AC-242, AC-243: Copy › Marked values, Image and To
   * dashboard. The clipboard itself, and the image, are the e2e's: jsdom has
   * neither (research/clipboard-and-image-export.md).
   */
  it('copies the marked values as tab-separated text, and says how many', async () => {
    const written: string[] = [];
    const clipboard = {
      writeText: async (text: string) => {
        written.push(text);
      },
      write: vi.fn(async () => undefined),
    };
    const onCopyToDashboard = vi.fn();
    render(
      <TileViewMenu
        tileId="t1"
        title="By status"
        spec={SPEC}
        save={vi.fn()}
        clipboard={clipboard}
        onCopyToDashboard={onCopyToDashboard}
        marked={{
          name: 'Marking',
          count: 2,
          onUnmark: vi.fn(),
          valuesTsv: () => 'Status\nshipped\ncompleted',
        }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for By status' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^Copy/ }));
    const copy = screen.getByRole('menu', { name: /^Copy/ });
    expect([...copy.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)).toEqual(
      ['Marked values', 'Image', 'To dashboard…'],
    );

    await userEvent.click(screen.getByRole('menuitem', { name: 'Marked values' }));
    expect(written).toEqual(['Status\nshipped\ncompleted']);
    expect((await screen.findByRole('status')).textContent).toContain('Copied 2 marked values.');

    await userEvent.click(screen.getByRole('button', { name: 'Actions for By status' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^Copy/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'To dashboard…' }));
    expect(onCopyToDashboard).toHaveBeenCalledTimes(1);
  });

  it('offers no copy where the page has no clipboard, and says why', async () => {
    render(
      <TileViewMenu
        tileId="t1"
        title="T"
        spec={SPEC}
        save={vi.fn()}
        clipboard={null}
        marked={{ name: 'Marking', count: 1, onUnmark: vi.fn(), valuesTsv: () => 'S\nx' }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for T' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^Copy/ }));
    for (const name of ['Marked values', 'Image']) {
      const item = screen.getByRole('menuitem', { name });
      expect(item.getAttribute('aria-disabled')).toBe('true');
      expect(
        document.getElementById(item.getAttribute('aria-describedby') ?? '')?.textContent,
      ).toBe('Copying needs a secure page: HTTPS, or localhost.');
    }
  });

  it('still downloads the marked rows when the CSV is chosen while they are read (T272’s review)', async () => {
    const saved: string[] = [];
    let answer: (rows: { text: string; written: number; total: number }) => void = () => undefined;
    render(
      <TileViewMenu
        tileId="t1"
        title="By status"
        spec={SPEC}
        countRows={async () => ({ returned: 2, total: 2 })}
        marked={{
          name: 'Marking',
          count: 1,
          onUnmark: vi.fn(),
          exportRows: () =>
            new Promise((resolve) => {
              answer = resolve;
            }),
        }}
        save={(name) => {
          saved.push(name);
        }}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Actions for By status' });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('menuitem', { name: /^Export/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Marked rows CSV' }));
    await userEvent.click(trigger);
    await exportCsv();

    answer({ text: 'Status\r\nshipped', written: 1, total: 1 });
    await vi.waitFor(() => {
      expect(saved).toEqual(['By status.csv', 'By status - marked rows.csv']);
    });
  });

  it('offers no image while a newer answer is on its way, in table view, or with nothing drawn', async () => {
    const reasonOf = (name: string) => {
      const item = screen.getByRole('menuitem', { name });
      expect(item.getAttribute('aria-disabled')).toBe('true');
      return document.getElementById(item.getAttribute('aria-describedby') ?? '')?.textContent;
    };
    const cases = [
      { props: { asking: true }, why: 'Its newest answer is still on its way.' },
      {
        props: { tableView: true, onTableView: vi.fn() },
        why: 'Shown as a table: view it as a chart to export its image.',
      },
      {
        props: { undrawn: 'Nothing is marked yet, so the tile draws no chart.' },
        why: 'Nothing is marked yet, so the tile draws no chart.',
      },
    ];
    for (const { props, why } of cases) {
      const { unmount } = render(
        <TileViewMenu tileId="t1" title="T" spec={SPEC} save={vi.fn()} {...props} />,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Actions for T' }));
      await userEvent.click(screen.getByRole('menuitem', { name: /^Export/ }));
      expect([reasonOf('SVG image'), reasonOf('PNG image')]).toEqual([why, why]);
      unmount();
    }
  });

  it('offers no image of a tile drawn as text, and says why', async () => {
    render(
      <TileViewMenu
        tileId="t1"
        title="Total"
        spec={{ ...SPEC, chartType: 'kpi' }}
        save={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Total' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^Export/ }));

    for (const name of ['SVG image', 'PNG image']) {
      const item = screen.getByRole('menuitem', { name });
      expect(item.getAttribute('aria-disabled')).toBe('true');
      expect(
        document.getElementById(item.getAttribute('aria-describedby') ?? '')?.textContent,
      ).toBe('A KPI, table or pivot is drawn as text, not as a chart image.');
    }
  });

  it.each(['kpi', 'pivot'] as const)(
    'offers Copy › Image disabled on a %s tile, saying why (AC-242, T271’s review)',
    async (chartType) => {
      render(
        <TileViewMenu
          tileId="t1"
          title="Total"
          spec={{ ...SPEC, chartType }}
          save={vi.fn()}
          clipboard={{ writeText: vi.fn(), write: vi.fn() }}
        />,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Actions for Total' }));
      await userEvent.click(screen.getByRole('menuitem', { name: /^Copy/ }));

      const image = screen.getByRole('menuitem', { name: 'Image' });
      expect(image.getAttribute('aria-disabled')).toBe('true');
      expect(
        document.getElementById(image.getAttribute('aria-describedby') ?? '')?.textContent,
      ).toBe('A KPI, table or pivot is drawn as text, not as a chart image.');
    },
  );

  /**
   * T267 / AC-247: WHILE the tile's marking holds items, THE SYSTEM SHALL
   * head the tile's menu with the marking's name, the marked values by their
   * members' titles, and the count marked out of the tile's items.
   * `Fails when: the heading omits the values, or either count differs from
   * the marked items or the tile's items.`
   */
  it('heads its marked group with the marking, its values by title, and how many of the tile’s items', async () => {
    const marked = { name: 'Marking', count: 2, onUnmark: vi.fn() };
    const { rerender } = render(
      <TileViewMenu
        tileId="t1"
        title="By country"
        spec={SPEC}
        save={vi.fn()}
        marked={{
          ...marked,
          values: 'Country: Norway, Spain',
          onTile: () => ({ marked: 2, of: 6 }),
        }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for By country' }));

    expect(
      screen.getByRole('group', { name: 'Marking · Country: Norway, Spain · 2 of 6 marked' }),
    ).toBeTruthy();
    await userEvent.keyboard('{Escape}');

    // T267's review: a marking holding items none of which is this tile's —
    // another tile's member — is "0 of 6" here, and still something to
    // unmark or view the rows of: those go by the marking's own count.
    rerender(
      <TileViewMenu
        tileId="t1"
        title="By country"
        spec={SPEC}
        save={vi.fn()}
        marked={{
          ...marked,
          values: 'Status: shipped',
          onTile: () => ({ marked: 0, of: 6 }),
          onViewMarkedRows: vi.fn(),
        }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for By country' }));
    const group = screen.getByRole('group', { name: 'Marking · Status: shipped · 0 of 6 marked' });
    for (const name of ['Unmark', 'View marked rows'])
      expect(
        [...group.querySelectorAll('[role="menuitem"]')]
          .find((item) => item.textContent === name)
          ?.getAttribute('aria-disabled'),
      ).toBeNull();
    await userEvent.keyboard('{Escape}');

    // A tile whose items cannot be counted — a table marks rows — says how
    // many are marked, and no "of".
    rerender(
      <TileViewMenu
        tileId="t1"
        title="By country"
        spec={SPEC}
        save={vi.fn()}
        marked={{ ...marked, values: 'Country: Norway, Spain' }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for By country' }));
    expect(
      screen.getByRole('group', { name: 'Marking · Country: Norway, Spain · 2 marked' }),
    ).toBeTruthy();
  });

  /**
   * T269 / AC-240: … the panel SHALL be turned on and off both from the tile's
   * menu and from the panel itself. The menu's half: a checkbox in the marked
   * group, checked while the panel is on — offered with nothing marked too,
   * where the panel says so.
   */
  it('turns the details panel on and off from a checkbox in its marked group', async () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <TileViewMenu
        tileId="t1"
        title="By country"
        spec={SPEC}
        save={vi.fn()}
        marked={{
          name: 'Marking',
          count: 0,
          onUnmark: vi.fn(),
          detailsPanel: { on: false, onToggle },
        }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for By country' }));
    const off = screen.getByRole('menuitemcheckbox', { name: 'Details panel' });
    expect(off.getAttribute('aria-checked')).toBe('false');
    expect(off.getAttribute('aria-disabled')).toBeNull();
    await userEvent.click(off);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <TileViewMenu
        tileId="t1"
        title="By country"
        spec={SPEC}
        save={vi.fn()}
        marked={{
          name: 'Marking',
          count: 2,
          onUnmark: vi.fn(),
          detailsPanel: { on: true, onToggle },
        }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for By country' }));
    const on = screen.getByRole('menuitemcheckbox', { name: 'Details panel' });
    expect(on.getAttribute('aria-checked')).toBe('true');
    await userEvent.click(on);
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  /**
   * T270 / AC-237: WHEN the user opens Drill by on a tile, THE SYSTEM SHALL
   * offer the next level of the member's hierarchy first, then finer time
   * granularities, then the dimensions of the tile's cube and of the cubes
   * Cube reports joined to it. The order is `drillOptions`' (core); the menu
   * groups them as the context-menu mockup does, under what is drilled.
   */
  it('offers Drill by, grouped as the mockup groups it, while something is marked', async () => {
    const onDrill = vi.fn();
    const own = { cube: 'orders', title: 'Orders', joined: false };
    const joined = { cube: 'products', title: 'Products', joined: true };
    const options = [
      {
        member: 'customers.city',
        title: 'City',
        kind: 'level' as const,
        from: { cube: 'customers', title: 'Customers', joined: true },
      },
      {
        member: 'orders.ordered_at',
        title: 'Ordered at',
        granularity: 'month' as const,
        kind: 'time' as const,
        from: own,
      },
      {
        member: 'orders.ordered_at',
        title: 'Ordered at',
        granularity: 'week' as const,
        kind: 'time' as const,
        from: own,
      },
      { member: 'orders.status', title: 'Status', kind: 'dimension' as const, from: own },
      { member: 'products.category', title: 'Category', kind: 'dimension' as const, from: joined },
    ];
    const marked = {
      name: 'Marking',
      count: 2,
      onUnmark: vi.fn(),
      values: 'Country: Germany, United States',
      drillBy: { items: 'Germany, United States', options: () => options, onDrill },
    };
    const { rerender } = render(
      <TileViewMenu tileId="t1" title="By country" spec={SPEC} save={vi.fn()} marked={marked} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for By country' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^Drill by/ }));

    const drill = screen.getByRole('menu', { name: /^Drill by/ });
    expect(drill.textContent).toContain('Drill Germany, United States by');
    const groups = [...drill.querySelectorAll('[role="group"]')].map((group) => [
      group.getAttribute('aria-label'),
      [...group.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent),
    ]);
    expect(groups).toEqual([
      ['Hierarchy', ['City']],
      ['Time · Ordered at', ['By month', 'By week']],
      ['Orders', ['Status']],
      ['Products · via join', ['Category']],
    ]);
    await userEvent.click(screen.getByRole('menuitem', { name: 'By week' }));
    expect(onDrill).toHaveBeenCalledWith(options[2]);

    // Nothing marked: offered, and said why it can't be used.
    rerender(
      <TileViewMenu
        tileId="t1"
        title="By country"
        spec={SPEC}
        save={vi.fn()}
        marked={{ ...marked, count: 0 }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for By country' }));
    expect(screen.getByRole('menuitem', { name: /^Drill by/ }).getAttribute('aria-disabled')).toBe(
      'true',
    );
  });

  it('says so when there is nothing to drill by', async () => {
    render(
      <TileViewMenu
        tileId="t1"
        title="By country"
        spec={SPEC}
        save={vi.fn()}
        marked={{
          name: 'Marking',
          count: 1,
          onUnmark: vi.fn(),
          drillBy: { items: 'Germany', options: () => [], onDrill: vi.fn() },
        }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for By country' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^Drill by/ }));
    expect(screen.getByRole('menu', { name: /^Drill by/ }).textContent).toContain(
      'The model offers nothing else to group these by.',
    );
  });

  it('closes on Escape, giving focus back to its trigger', async () => {
    render(<TileViewMenu tileId="t1" title="T" spec={SPEC} save={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Actions for T' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe('the CSV file’s name', () => {
  it('is the chart’s title, without characters a file system refuses', () => {
    expect(csvFileName('Sales / region: 2026?')).toBe('Sales - region- 2026-.csv');
    expect(csvFileName('   ')).toBe('chart.csv');
  });
});

/**
 * T631 (AC-176, AC-090, AC-091; R63, the user: "Tile ⋯ menu entries"): a
 * whole series, as a click on its legend entry marks it, and a trellis panel,
 * as a click on its header does, reached from the keyboard through the tile's
 * menu (Shift+F10): "Mark series ›" and "Mark panel ›" in its marked group;
 * in cross-filter mode "Filter by series ›" and "Filter by panel ›", as a
 * click on a series or a panel filters there.
 */
describe('a series or a panel from the tile’s menu (T631, R63)', () => {
  /**
   * Each by its label, as the legend or the header writes it, and handed
   * back by its value; a panel by its place among those drawn (T632).
   */
  const parts = (verb: 'mark' | 'filter') => ({
    verb,
    series: [
      { value: 'completed', label: 'completed' },
      { value: '2026-01-01T00:00:00.000', label: 'Jan 2026' },
    ],
    panels: [
      { value: 'n', label: 'North', index: 0 },
      // A blank panel between them, drawn and not offered.
      { value: 's', label: 'South', index: 2 },
    ],
    onSeries: vi.fn(),
    onPanel: vi.fn(),
  });

  it('marks a series or a panel from its marked group', async () => {
    const byPart = parts('mark');
    render(
      <TileViewMenu
        tileId="t1"
        title="By status"
        spec={SPEC}
        save={vi.fn()}
        marked={{ name: 'Marking', count: 0, onUnmark: vi.fn() }}
        parts={byPart}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for By status' }));
    const group = screen.getByRole('group', { name: /^Marking/ });
    await userEvent.click(within(group).getByRole('menuitem', { name: /^Mark series/ }));
    const series = screen.getByRole('menu', { name: /^Mark series/ });
    expect(
      within(series)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['completed', 'Jan 2026']);
    await userEvent.click(within(series).getByRole('menuitem', { name: 'Jan 2026' }));
    expect(byPart.onSeries).toHaveBeenCalledWith('2026-01-01T00:00:00.000');

    await userEvent.click(screen.getByRole('button', { name: 'Actions for By status' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^Mark panel/ }));
    await userEvent.click(
      within(screen.getByRole('menu', { name: /^Mark panel/ })).getByRole('menuitem', {
        name: 'South',
      }),
    );
    expect(byPart.onPanel).toHaveBeenCalledWith(2);
  });

  it('filters by a series or a panel in cross-filter mode, with no marked group', async () => {
    const byPart = parts('filter');
    render(
      <TileViewMenu tileId="t1" title="By status" spec={SPEC} save={vi.fn()} parts={byPart} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for By status' }));
    expect(screen.queryByRole('menuitem', { name: /^Mark/ })).toBeNull();
    // First in the menu, as the task says (T631's review).
    const items = within(screen.getByRole('menu', { name: /^Actions for / })).getAllByRole(
      'menuitem',
    );
    expect(items[0]?.textContent).toMatch(/^Filter by series/);
    expect(items[1]?.textContent).toMatch(/^Filter by panel/);
    await userEvent.click(screen.getByRole('menuitem', { name: /^Filter by series/ }));
    await userEvent.click(
      within(screen.getByRole('menu', { name: /^Filter by series/ })).getByRole('menuitem', {
        name: 'completed',
      }),
    );
    expect(byPart.onSeries).toHaveBeenCalledWith('completed');
    await userEvent.click(screen.getByRole('button', { name: 'Actions for By status' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^Filter by panel/ }));
    await userEvent.click(
      within(screen.getByRole('menu', { name: /^Filter by panel/ })).getByRole('menuitem', {
        name: 'North',
      }),
    );
    expect(byPart.onPanel).toHaveBeenCalledWith(0);
  });

  /**
   * T634 (AC-176; R64, the user: "Ctrl+Enter adds"): on a "Mark series ›" or
   * "Mark panel ›" entry, Ctrl+Enter or ⌘+Enter adds it to the marking — a
   * series as a Ctrl-click on its legend entry adds it — and each entry says
   * so. Filtering has one selection a tile, so nothing adds there.
   */
  it('adds a series or a panel to the marking with Ctrl+Enter, and says so', async () => {
    const byPart = parts('mark');
    render(
      <TileViewMenu
        tileId="t1"
        title="By status"
        spec={SPEC}
        save={vi.fn()}
        marked={{ name: 'Marking', count: 1, onUnmark: vi.fn() }}
        parts={byPart}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for By status' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^Mark series/ }));
    const series = within(screen.getByRole('menu', { name: /^Mark series/ })).getByRole(
      'menuitem',
      { name: 'completed' },
    );
    expect(
      document.getElementById(series.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Ctrl/⌘+Enter adds it to the marking.');
    series.focus();
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(byPart.onSeries).toHaveBeenCalledWith('completed', true);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for By status' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^Mark panel/ }));
    within(screen.getByRole('menu', { name: /^Mark panel/ }))
      .getByRole('menuitem', { name: 'South' })
      .focus();
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
    expect(byPart.onPanel).toHaveBeenCalledWith(2, true);
  });

  it('offers no add when filtering by a series', async () => {
    const byPart = parts('filter');
    render(
      <TileViewMenu tileId="t1" title="By status" spec={SPEC} save={vi.fn()} parts={byPart} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for By status' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /^Filter by series/ }));
    const series = within(screen.getByRole('menu', { name: /^Filter by series/ })).getByRole(
      'menuitem',
      { name: 'completed' },
    );
    expect(series.getAttribute('aria-describedby')).toBeNull();
    series.focus();
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(byPart.onSeries).toHaveBeenCalledWith('completed');
  });

  it('offers neither where the tile has no series or no panels', async () => {
    render(
      <TileViewMenu
        tileId="t1"
        title="By status"
        spec={SPEC}
        save={vi.fn()}
        parts={{ ...parts('filter'), series: [], panels: [] }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Actions for By status' }));
    expect(screen.queryByRole('menuitem', { name: /^Filter by/ })).toBeNull();
  });
});
