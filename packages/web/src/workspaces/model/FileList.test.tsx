import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FileList } from './FileList';

/**
 * T137 / AC-131: WHEN the user opens the Model workspace, THE SYSTEM SHALL
 * list the model files and show the cubes, views, measures, dimensions,
 * segments, hierarchies, joins and pre-aggregations each file defines.
 * Fails when: a file's object is missing from the listing.
 *
 * Drawn as design 12 (T486, AC-344; MW-01): one card holding a table, a row
 * per cube or view — File, Kind, Name, the counts, and Members, whose full
 * list, grouped by kind, is its tooltip.
 */
const FILES = [
  {
    path: 'views/summary.yml',
    content: 'views:\n  - name: summary\n',
  },
  {
    path: 'cubes/orders.yml',
    content: `cubes:
  - name: orders
    joins:
      - name: customers
        relationship: many_to_one
        sql: '{CUBE}.customer_id = {customers}.id'
    dimensions:
      - name: status
        sql: status
        type: string
      - name: id
        sql: id
        type: number
    measures:
      - name: count
        type: count
    segments:
      - name: shipped
        sql: "{CUBE}.status = 'shipped'"
    hierarchies:
      - name: by_status
        levels: [status]
    pre_aggregations:
      - name: by_day
`,
  },
  {
    path: 'views/orders_view.yml',
    content: `views:
  - name: orders_view
    cubes:
      - join_path: orders
        includes: [count, status]
    measures:
      - name: share
        sql: "{count} / 2"
        type: number
`,
  },
  { path: 'cubes/broken.yml', content: 'cubes:\n  - name: [unclosed\n' },
  {
    path: 'cubes/generated.yml',
    content: 'cubes:\n{% for n in ["a"] %}\n  - name: {{ n }}\n{% endfor %}\n',
  },
  { path: 'globals.py', content: 'from cube import TemplateContext\n' },
  {
    path: 'cubes/two.yml',
    content:
      'cubes:\n  - name: first\n    measures:\n      - name: count\n        type: count\n  - name: second\n',
  },
];

function list(props: Partial<Parameters<typeof FileList>[0]> = {}) {
  const handlers = { onOpen: vi.fn(), onNew: vi.fn(), onGenerate: vi.fn() };
  render(<FileList files={FILES} unpublished={new Set()} {...handlers} {...props} />);
  return { ...handlers, table: screen.getByRole('table', { name: 'Cubes and views' }) };
}

/** A row's cells, by their text: the tooltip is the cell's description, not its text. */
const cellsOf = (row: HTMLElement) =>
  [...row.querySelectorAll('td')].map((cell) => {
    const shown = cell.cloneNode(true) as HTMLElement;
    for (const tip of shown.querySelectorAll('[role="tooltip"]')) tip.remove();
    return shown.textContent?.trim() ?? '';
  });

/** The body's rows, by the path their File cell names. */
const rowsOf = (table: HTMLElement) =>
  within(table)
    .getAllByRole('row')
    .filter((row) => row.closest('tbody') !== null);

describe('the model overview (AC-131, design 12)', () => {
  it('lists a row per cube or view — file, kind, name, the counts and its members — sorted by file', () => {
    const { table } = list();
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent?.trim()),
    ).toEqual([
      'File',
      'Kind',
      'Name',
      'Dimensions',
      'Measures',
      'Joins',
      'Pre-aggs',
      'Segments',
      'Members',
    ]);
    const rows = rowsOf(table);
    expect(rows.map((row) => cellsOf(row)[0])).toEqual([
      'cubes/broken.ymlproblems',
      'cubes/generated.yml',
      'cubes/orders.yml',
      'cubes/two.yml',
      'cubes/two.yml',
      'globals.py',
      'views/orders_view.yml',
      'views/summary.yml',
    ]);
    // A cube: its counts in the editor's tabs' order, its members in the same order.
    expect(cellsOf(rows[2] as HTMLElement)).toEqual([
      'cubes/orders.yml',
      'Cube',
      'orders',
      '2',
      '1',
      '1',
      '1',
      '1',
      'status, id · count · customers · by_day · shipped · by_status',
    ]);
    // A file of two cubes: a row each, under the same path.
    expect(cellsOf(rows[4] as HTMLElement).slice(1, 5)).toEqual(['Cube', 'second', '0', '0']);
    // A view counts what it includes, and its own; the rest don't apply.
    expect(cellsOf(rows[6] as HTMLElement)).toEqual([
      'views/orders_view.yml',
      'View',
      'orders_view',
      '2 included · 1 own',
      '—',
      '—',
      '—',
      'share · orders.count, orders.status',
    ]);
  });

  it('keeps every member one step away: grouped by kind in the members’ tooltip', () => {
    const { table } = list();
    const orders = rowsOf(table)[2] as HTMLElement;
    const members = within(orders).getByText(/^status, id · /);
    expect(members.getAttribute('tabindex')).toBe('0');
    const tip = document.getElementById(members.getAttribute('aria-describedby') ?? '');
    expect(tip?.getAttribute('role')).toBe('tooltip');
    expect(
      [...(tip?.querySelectorAll('.model-overview__tip-row') ?? [])].map((row) => row.textContent),
    ).toEqual([
      'Dimensions · status, id',
      'Measures · count',
      'Joins · customers',
      'Pre-aggs · by_day',
      'Segments · shipped',
      'Hierarchies · by_status',
    ]);
    const view = within(rowsOf(table)[6] as HTMLElement).getByText(/^share · /);
    expect(
      [
        ...(document
          .getElementById(view.getAttribute('aria-describedby') ?? '')
          ?.querySelectorAll('.model-overview__tip-row') ?? []),
      ].map((row) => row.textContent),
    ).toEqual(['Measures · share', 'Includes · orders.count, orders.status']);
  });

  it('says a Jinja template and Python aren’t read here, and why, and a file that doesn’t parse where', () => {
    const { table } = list();
    const [broken, template] = rowsOf(table) as [HTMLElement, HTMLElement];
    expect(cellsOf(template)).toEqual([
      'cubes/generated.yml',
      'Jinja template · read-only',
      '—',
      '—',
      '—',
      '—',
      '—',
      'Not listed: a template isn’t read here',
    ]);
    expect(template.querySelector('.model-overview__code')?.getAttribute('title')).toBe(
      'Jinja template: wechart publishes plain YAML only, so this template is never rendered or served, and its cubes and views aren’t listed.',
    );
    expect(cellsOf(rowsOf(table)[5] as HTMLElement).slice(1)).toEqual([
      'Python · read-only',
      '—',
      '—',
      '—',
      '—',
      '—',
      'Not listed: Python isn’t read here',
    ]);
    // Unreadable: marked on its path, the parser's line across the rest.
    const problem = broken.querySelectorAll('td')[1] as HTMLElement;
    expect(problem.textContent).toMatch(/line \d+/);
    expect(problem.getAttribute('title')).toBe(problem.textContent);
    expect(problem.classList.contains('is-err')).toBe(true);
  });

  it('marks a file not yet published, as the tree does', () => {
    const { table } = list({ unpublished: new Set(['cubes/two.yml']) });
    const marked = rowsOf(table).filter(
      (row) => row.querySelector('.model-tree__tag')?.textContent === 'unpublished',
    );
    expect(marked.map((row) => cellsOf(row)[2])).toEqual(['first', 'second']);
  });

  it('opens a row’s file from anywhere in its row; its path is a link to it', async () => {
    const { table, onOpen } = list();
    const orders = rowsOf(table)[2] as HTMLElement;
    expect(
      within(orders).getByRole('link', { name: 'cubes/orders.yml' }).getAttribute('href'),
    ).toBe('/model/files/cubes%2Forders.yml');
    await userEvent.click(within(orders).getByText('Cube'));
    expect(onOpen).toHaveBeenCalledWith('cubes/orders.yml');
    await userEvent.click(within(orders).getByRole('link', { name: 'cubes/orders.yml' }));
    expect(onOpen).toHaveBeenCalledTimes(2);
    // Its Members too, the widest cell (T486's review).
    await userEvent.click(within(orders).getByText(/^status, id · /));
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it('orders files as the tree does, by code point', () => {
    const { table } = list({
      files: [
        { path: 'cubes/orders.yml', content: 'cubes:\n  - name: a\n' },
        { path: 'cubes/orders_x.yml', content: 'cubes:\n  - name: b\n' },
        { path: 'cubes/Zeta.yml', content: 'cubes:\n  - name: c\n' },
      ],
    });
    expect(rowsOf(table).map((row) => cellsOf(row)[0])).toEqual([
      'cubes/Zeta.yml',
      'cubes/orders.yml',
      'cubes/orders_x.yml',
    ]);
  });

  it('says a file defines nothing, rather than leaving it out', () => {
    const { table } = list({ files: [{ path: 'cubes/empty.yml', content: 'cubes: []\n' }] });
    expect(cellsOf(rowsOf(table)[0] as HTMLElement)).toEqual([
      'cubes/empty.yml',
      'Defines no cube or view',
    ]);
  });

  it('sorts by file, the other way when its header is pressed', async () => {
    const { table } = list();
    const header = within(table).getByRole('columnheader', { name: /File/ });
    expect(header.getAttribute('aria-sort')).toBe('ascending');
    await userEvent.click(within(header).getByRole('button', { name: /File/ }));
    expect(header.getAttribute('aria-sort')).toBe('descending');
    expect(rowsOf(table).map((row) => cellsOf(row)[0])[0]).toBe('views/summary.yml');
  });

  it('says there are none, and offers the three ways to add one', async () => {
    const handlers = { onOpen: vi.fn(), onNew: vi.fn(), onGenerate: vi.fn() };
    render(<FileList files={[]} unpublished={new Set()} {...handlers} />);
    expect(screen.getByText('There are no model files.').isConnected).toBe(true);
    expect(
      screen.getByText(
        'Generate cubes from a data source’s tables, or start a cube or a view by hand.',
      ).isConnected,
    ).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Generate from a data source…' }));
    await userEvent.click(screen.getByRole('button', { name: 'New cube' }));
    await userEvent.click(screen.getByRole('button', { name: 'New view' }));
    expect(handlers.onGenerate).toHaveBeenCalledTimes(1);
    expect(handlers.onNew.mock.calls).toEqual([['cube'], ['view']]);
  });
});
