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
