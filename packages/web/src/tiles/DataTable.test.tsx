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

  it('says so when the query returned nothing', () => {
    render(<DataTable spec={spec({ rows: [] })} />);

    expect(screen.getByTestId('table-empty')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
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

    expect(screen.getByText('$1,234.50')).toBeTruthy();
  });

  it('leaves a member with no declared format as a plain number', () => {
    render(<DataTable spec={spec({ rows: [{ [STATUS]: 'paid', [COUNT]: 1234 }], formats: {} })} />);

    // The format follows the member, not the table.
    expect(screen.getByText('1,234')).toBeTruthy();
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
