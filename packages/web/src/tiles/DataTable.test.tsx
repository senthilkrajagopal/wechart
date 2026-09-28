import type { RenderSpec } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DataTable } from './DataTable';

/**
 * T041 / AC-037 and AC-178: the table.
 *
 * Two things are being asserted and they pull against each other. Real
 * `<table>` semantics are what a screen reader needs (AC-176, AC-178), and
 * virtualisation is what keeps ten thousand rows from being ten thousand DOM
 * nodes — and the usual way to virtualise is absolute positioning, which
 * destroys table layout. `docs/research/table.md` settles it: fixed row
 * heights and spacer rows, so the native layout survives, plus `aria-rowcount`
 * and `aria-rowindex`, which the APG table pattern requires exactly when rows
 * "are hidden or not present in the DOM".
 */
const STATUS = 'orders.status';
const COUNT = 'orders.count';

const rowsOf = (n: number) =>
  Array.from({ length: n }, (_, index) => ({
    [STATUS]: `status ${String(index)}`,
    [COUNT]: index,
  }));

const spec = (over: Partial<RenderSpec> = {}): RenderSpec => ({
  chartType: 'table',
  encoding: { x: [STATUS], y: [COUNT] },
  rows: rowsOf(3),
  ...over,
});

describe('table semantics', () => {
  it('is a real table, not a grid of divs', () => {
    render(<DataTable spec={spec()} />);

    const table = screen.getByRole('table');
    expect(table.tagName).toBe('TABLE');
    expect(table.querySelector('thead')).toBeTruthy();
    expect(table.querySelector('tbody')).toBeTruthy();
  });

  it('gives every column a scoped header', () => {
    render(<DataTable spec={spec()} />);

    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([STATUS, COUNT]);
    // Without scope a screen reader cannot associate a cell with its column.
    for (const header of headers) expect(header.getAttribute('scope')).toBe('col');
  });

  it('takes its columns from the members the rows carry', () => {
    render(<DataTable spec={spec({ rows: [{ a: 1, b: 2, c: 3 }] })} />);

    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['a', 'b', 'c']);
  });

  /**
   * T393, AC-301: THE SYSTEM SHALL order a table's columns as the wells order
   * its fields: time and dimensions first, then measures in the Metrics
   * well's order. `Fails when: a table's columns differ from the wells' order.`
   */
  it('heads its columns in the wells’ order, whatever order the rows carry them in', () => {
    render(
      <DataTable
        spec={spec({
          rows: [{ 'orders.amount': 9, [COUNT]: 1, [STATUS]: 'paid', 'orders.day.day': 'x' }],
          fields: ['orders.day', STATUS, COUNT, 'orders.amount'],
        })}
      />,
    );

    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'orders.day.day',
      STATUS,
      COUNT,
      'orders.amount',
    ]);
  });

  it('says so when the query returned nothing', () => {
    render(<DataTable spec={spec({ rows: [] })} />);

    expect(screen.getByTestId('table-empty')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

/**
 * T182 / AC-176: every action reachable from the keyboard. A table longer or
 * wider than its tile scrolls, and its scroller takes focus — WebKit does not
 * make a scrolling box focusable of itself — so arrow keys and Page Down can
 * scroll it, and it is named for what it holds.
 */
describe('scrolling from the keyboard', () => {
  it('takes focus, named as the chart’s table', () => {
    render(<DataTable spec={spec()} label="Orders by status" />);
    const scroller = screen.getByRole('region', { name: 'Orders by status, table' });
    expect(scroller.getAttribute('tabindex')).toBe('0');
    expect(scroller).toBe(screen.getByTestId('data-table'));
  });
});

describe('member formats (AC-046)', () => {
  const AMOUNT = 'orders.total_amount';

  it('writes a currency member as money', () => {
    render(
      <DataTable
        spec={spec({
          rows: [{ [STATUS]: 'paid', [AMOUNT]: 1234.5 }],
          formats: { [AMOUNT]: 'currency' },
        })}
      />,
    );

    // Cube's currency format, `$,.2~f` (T201, the user's choice).
    expect(screen.getByText('$1,234.5')).toBeTruthy();
  });

  it('leaves a member with no declared format as a plain number', () => {
    render(<DataTable spec={spec({ rows: [{ [STATUS]: 'paid', [COUNT]: 1234 }], formats: {} })} />);

    // The format follows the member, not the table.
    expect(screen.getByText('1,234')).toBeTruthy();
  });

  it('writes a time value by its granularity, never as Cube’s timestamp (AC-188)', () => {
    const AT = 'orders.ordered_at';
    render(
      <DataTable
        spec={spec({
          encoding: { x: [AT], y: [COUNT] },
          rows: [
            { [AT]: '2026-01-01T00:00:00.000', [COUNT]: 30 },
            { [AT]: '2026-02-01T00:00:00.000', [COUNT]: 28 },
          ],
          granularities: { [AT]: 'month' },
        })}
      />,
    );

    const firstCells = screen
      .getAllByTestId('table-row')
      .map((row) => row.querySelector('td')?.textContent);
    expect(firstCells).toEqual(['Jan 2026', 'Feb 2026']);
  });

  it('shows a gap as blank rather than as a zero', () => {
    render(<DataTable spec={spec({ rows: [{ [STATUS]: 'paid', [COUNT]: null }], formats: {} })} />);

    const cells = screen.getAllByTestId('table-row')[0]?.querySelectorAll('td');
    expect(cells?.[1]?.textContent).toBe('');
  });
});

describe('virtualisation', () => {
  const many = spec({ rows: rowsOf(1000) });

  it('does not put ten thousand rows in the document', () => {
    render(<DataTable spec={many} />);

    // The whole point. A table that rendered every row would pass every other
    // assertion in this file.
    const drawn = screen.getAllByTestId('table-row');
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.length).toBeLessThan(200);
  });

  it('still tells assistive technology how many rows there are', () => {
    render(<DataTable spec={many} />);

    // APG requires this precisely because the rows are not all present.
    expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('1000');
  });

  it('numbers each row by its place in the result, not in the document', () => {
    render(<DataTable spec={many} />);

    const indexes = screen
      .getAllByTestId('table-row')
      .map((row) => Number(row.getAttribute('aria-rowindex')));

    // 1-based, and the header is row 1, so the first body row is 2.
    expect(indexes[0]).toBe(2);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it('keeps the scroll height of the whole result, not of what is drawn', () => {
    render(<DataTable spec={many} />);

    // At the top of the list nothing is above, so the invariant is the spacer
    // below: it stands in for the rows not drawn, which is what makes the
    // scrollbar reflect a thousand rows while the native table layout
    // survives. A table without it would look a screen tall.
    const spacer = screen.getByTestId('table-spacer-bottom');
    expect(spacer.tagName).toBe('TR');

    const drawn = screen.getAllByTestId('table-row').length;
    const spacerHeight = Number(
      /height:\s*([\d.]+)px/.exec(spacer.querySelector('td')?.getAttribute('style') ?? '')?.[1] ??
        0,
    );
    // Roughly the rows that were left out, at the fixed row height.
    expect(spacerHeight).toBeGreaterThan((1000 - drawn - 1) * 20);
  });
});

/**
 * T453 / AC-097, as the user answered on 2026-09-28 (R43): a partly marked
 * row of a table — one of a tile that doesn't group by what its marking names,
 * whose marked share T388 answers apart — wears the prototype's left rule in
 * the secondary colour, and shows its marked share beside each measure:
 * "10 · Marked: 4".
 */
describe('a table under a marking', () => {
  const AVERAGE = 'orders.average_amount';
  const CATEGORY = 'products.category';
  const rows = [
    { [CATEGORY]: 'Books', [COUNT]: 10, [AVERAGE]: 40 },
    { [CATEGORY]: 'Games', [COUNT]: 20, [AVERAGE]: 30 },
    { [CATEGORY]: 'Toys', [COUNT]: 5, [AVERAGE]: 20 },
  ];
  const marked = (share: RenderSpec['rows'], y: string[] = [COUNT]): RenderSpec =>
    spec({
      encoding: { x: [CATEGORY], y },
      measures: [COUNT, AVERAGE],
      rows,
      marking: {
        predicate: { items: [[{ member: STATUS, value: 'shipped' }]], ranges: [] },
        colour: '#151107',
        share,
        aggTypes: { [COUNT]: 'count', [AVERAGE]: 'avg' },
      },
    });
  const cellsOf = (row: HTMLElement) =>
    [...row.querySelectorAll('td')].map((cell) => cell.textContent);

  it('rules a partly marked row and says its marked share beside each measure', () => {
    render(
      <DataTable
        spec={marked([
          { [CATEGORY]: 'Books', [COUNT]: 4, [AVERAGE]: 45 },
          { [CATEGORY]: 'Toys', [COUNT]: 5, [AVERAGE]: 20 },
        ])}
      />,
    );
    const [books, games, toys] = screen.getAllByTestId('table-row');

    expect(cellsOf(books!)).toEqual(['Books', '10 · Marked: 4', '40 · Marked: 45']);
    expect(books!.getAttribute('data-marked')).toBe('partly');
    // Nothing of Games is marked: no marked share, no rule, and dimmed as an
    // unmarked row is (AC-096, T507).
    expect(cellsOf(games!)).toEqual(['Games', '20', '30']);
    expect(games!.getAttribute('data-marked')).toBe('none');
    // Toys is marked in all its rows, but an average says nothing of that:
    // partly marked, as a chart hatches it (T387's review).
    expect(cellsOf(toys!)).toEqual(['Toys', '5 · Marked: 5', '20 · Marked: 20']);
    expect(toys!.getAttribute('data-marked')).toBe('partly');
  });

  // A row marked in full is a marked row (AC-096, T507): not the partial rule.
  it('draws a row an additive measure shows marked in full as a marked row', () => {
    render(
      <DataTable
        spec={spec({
          encoding: { x: [CATEGORY], y: [COUNT] },
          measures: [COUNT],
          rows: rows.map((row) => ({ [CATEGORY]: row[CATEGORY], [COUNT]: row[COUNT] })),
          marking: {
            predicate: { items: [[{ member: STATUS, value: 'shipped' }]], ranges: [] },
            colour: '#151107',
            share: [{ [CATEGORY]: 'Toys', [COUNT]: 5 }],
            aggTypes: { [COUNT]: 'count' },
          },
        })}
      />,
    );
    const toys = screen.getAllByTestId('table-row')[2]!;

    expect(cellsOf(toys)).toEqual(['Toys', '5 · Marked: 5']);
    expect(toys.getAttribute('data-marked')).toBe('whole');
  });

  // T453's review: a measure over the marked rows with no value is none, never 0.
  it('says no marked value where the marked rows give a measure none', () => {
    render(<DataTable spec={marked([{ [CATEGORY]: 'Books', [COUNT]: 4, [AVERAGE]: null }])} />);
    const [books] = screen.getAllByTestId('table-row');

    expect(cellsOf(books!)).toEqual(['Books', '10 · Marked: 4', '40']);
  });

  // T453's review: Top N's "Other (n)" holds the rows of the categories it folds (AC-041).
  it('gives Top N’s “Other” the marked share of the categories it folds', () => {
    render(
      <DataTable
        spec={spec({
          encoding: { x: [CATEGORY], y: [COUNT] },
          measures: [COUNT],
          rows: [
            { [CATEGORY]: 'Books', [COUNT]: 10 },
            { [CATEGORY]: 'Other (2)', [COUNT]: 25 },
          ],
          marking: {
            predicate: { items: [[{ member: STATUS, value: 'shipped' }]], ranges: [] },
            colour: '#151107',
            share: [
              { [CATEGORY]: 'Books', [COUNT]: 4 },
              { [CATEGORY]: 'Games', [COUNT]: 3 },
              { [CATEGORY]: 'Toys', [COUNT]: 5 },
            ],
            aggTypes: { [COUNT]: 'count' },
          },
        })}
      />,
    );
    const [, other] = screen.getAllByTestId('table-row');

    expect(cellsOf(other!)).toEqual(['Other (2)', '25 · Marked: 8']);
    expect(other!.getAttribute('data-marked')).toBe('partly');
  });

  // T507's review: a table of dimensions alone has no measure to say how much
  // of a row is marked; one with marked rows is not unmarked.
  it('draws a row with marked rows, and no measure, as marked in part', () => {
    render(
      <DataTable
        spec={spec({
          encoding: { x: [CATEGORY] },
          measures: [],
          rows: [{ [CATEGORY]: 'Books' }, { [CATEGORY]: 'Games' }],
          marking: {
            predicate: { items: [[{ member: STATUS, value: 'shipped' }]], ranges: [] },
            colour: '#151107',
            share: [{ [CATEGORY]: 'Books' }],
          },
        })}
      />,
    );
    const [books, games] = screen.getAllByTestId('table-row');

    expect(books!.getAttribute('data-marked')).toBe('partly');
    expect(games!.getAttribute('data-marked')).toBe('none');
  });

  it('shows no marked share until one is answered', () => {
    render(
      <DataTable
        spec={spec({
          encoding: { x: [CATEGORY], y: [COUNT] },
          rows: [{ [CATEGORY]: 'Books', [COUNT]: 10 }],
          marking: {
            predicate: { items: [[{ member: STATUS, value: 'shipped' }]], ranges: [] },
            colour: '#151107',
          },
        })}
      />,
    );
    const [books] = screen.getAllByTestId('table-row');

    expect(cellsOf(books!)).toEqual(['Books', '10']);
    // Its rows hold no status to be marked by: unmarked, as a chart's items
    // are while their share is asked (AC-096, T507).
    expect(books!.getAttribute('data-marked')).toBe('none');
  });
});

/**
 * T507 / AC-096: WHEN a tile shows a marking, THE SYSTEM SHALL draw marked
 * items … and fade unmarked items. `Fails when: unmarked items render at full
 * strength, or marked items carry no outline.` A table's items are its rows
 * (direction.md §7a: "Tables: marked rows are bold with a left rule; the
 * others are dimmed"), the rule in the marking's colour.
 */
describe('a table showing a marking (AC-096)', () => {
  const byStatus = (predicate: RenderSpec['rows'][number][], whole = false): RenderSpec =>
    spec({
      marking: {
        predicate: {
          items: predicate.map((values) =>
            Object.entries(values).map(([member, value]) => ({ member, value: String(value) })),
          ),
          ranges: [],
        },
        colour: '#151107',
        ...(whole ? { whole: true } : {}),
      },
    });

  it('draws its marked rows marked and dims the others', () => {
    render(<DataTable spec={byStatus([{ [STATUS]: 'status 1' }])} />);
    const rows = screen.getAllByTestId('table-row');

    expect(rows.map((row) => row.getAttribute('data-marked'))).toEqual(['none', 'whole', 'none']);
    // The rule in the marking's colour.
    expect(screen.getByTestId('data-table').style.getPropertyValue('--wc-mark-colour')).toBe(
      '#151107',
    );
  });

  it('marks every row of a table marked whole', () => {
    render(<DataTable spec={byStatus([], true)} />);

    expect(
      screen.getAllByTestId('table-row').map((row) => row.getAttribute('data-marked')),
    ).toEqual(['whole', 'whole', 'whole']);
  });

  it('dims nothing while its marking holds nothing', () => {
    render(<DataTable spec={byStatus([])} />);

    expect(
      screen.getAllByTestId('table-row').map((row) => row.getAttribute('data-marked')),
    ).toEqual([null, null, null]);
  });
});
