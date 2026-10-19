import {
  EMPTY_PREDICATE,
  withColumns,
  type GraphicalTableColumn,
  type RenderSpec,
} from '@wechart/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { clickedValue } from '../dashboard/crossfilter/clicked';
import { GraphicalTableView } from './GraphicalTable';
import { GT_CSS } from './graphicalTableStyles';

/**
 * T946 / AC-573: THE SYSTEM SHALL make a graphical table's row its member for
 * marking: a click marks it, Ctrl/⌘+click toggles it, and Shift+click marks
 * the range from the anchor row, as table tiles do; sorting by a header SHALL
 * never change the marking; marked rows SHALL be bold with a left rule, other
 * rows dimming their text to `text-secondary` and their micro-charts to 0.28
 * while Change and Icon cells keep their colours; WHILE another tile's
 * marking partly covers a row, an additive Value cell SHALL add "· ‹$X›
 * marked" in `text-secondary`, and a non-additive one show "Marked: ‹X›" in
 * its tooltip only; and as a cross-filter source a row SHALL filter the other
 * tiles to its member.
 * `Fails when: a gesture marks otherwise than table tiles do; sorting changes
 * what's marked; a status or change cell loses its colour on an unmarked row;
 * a partly marked additive cell lacks its marked amount, or a non-additive
 * cell shows one; or a row doesn't filter the others.`
 */
const CATEGORY = 'products.category';
const REGION = 'customers.region';
const REVENUE = 'orders.revenue';
const MARGIN = 'orders.margin';
const TARGET = 'orders.margin_target';
const AT = 'orders.ordered_at';

const COLUMNS: readonly GraphicalTableColumn[] = [
  { kind: 'value', settings: { measure: REVENUE } },
  { kind: 'value', settings: { measure: MARGIN } },
  { kind: 'sparkline', settings: { measure: REVENUE, time: AT, granularity: 'month', last: 3 } },
  {
    kind: 'bullet',
    settings: {
      measure: MARGIN,
      target: { kind: 'measure', measure: TARGET },
      ranges: [0.2, 0.25],
    },
  },
  {
    kind: 'icon',
    settings: {
      measure: MARGIN,
      of: TARGET,
      rules: [
        { op: '>=', value: 1, state: 'success', label: 'On track' },
        { op: 'otherwise', state: 'error', label: 'Off track' },
      ],
    },
  },
  { kind: 'change', settings: { measure: REVENUE, time: AT, period: 'month' } },
];

const CATEGORIES: readonly (readonly [string, number, number])[] = [
  ['Beverages', 1_210_000, 0.231],
  ['Seafood', 840_000, 0.264],
  ['Dairy', 720_000, 0.198],
  ['Produce', 550_000, 0.242],
];

const now = new Date('2026-10-18T09:00:00Z');
const months = {
  time: { member: AT, granularity: 'month' as const },
  periods: 3,
  rows: CATEGORIES.flatMap(([category], at) =>
    ['2026-08-01', '2026-09-01', '2026-10-01'].map((month, step) => ({
      [CATEGORY]: category,
      [`${AT}.month`]: `${month}T00:00:00.000`,
      [REVENUE]: String((at + 1) * 1000 * (step + 1)),
    })),
  ),
};

const spec = (more: Partial<RenderSpec> = {}): RenderSpec =>
  ({
    chartType: 'graphicalTable',
    encoding: { x: [CATEGORY], y: [REVENUE] },
    rows: CATEGORIES.map(([category, revenue, margin]) => ({
      [CATEGORY]: category,
      [REVENUE]: String(revenue),
      [MARGIN]: String(margin),
      [TARGET]: '0.25',
    })),
    formats: { [REVENUE]: 'currency', [MARGIN]: 'percent', [TARGET]: 'percent' },
    titles: { [CATEGORY]: 'Category', [REVENUE]: 'Revenue', [MARGIN]: 'Margin' },
    options: withColumns({}, COLUMNS),
    ...more,
  }) as unknown as RenderSpec;

const marking = (...categories: string[]) => ({
  predicate: {
    ...EMPTY_PREDICATE,
    items: categories.map((value) => [{ member: CATEGORY, value }]),
  },
  colour: '#7c3aed',
});

const row = (name: string) => screen.getByRole('row', { name: new RegExp(`^${name}`) });

describe('a graphical table’s rows marked (T946, AC-573)', () => {
  it('marks a row by a click, toggles by Ctrl/⌘, and marks the range from the anchor by Shift', () => {
    const onItemClick = vi.fn();
    const onShapeMark = vi.fn();
    render(
      <GraphicalTableView
        spec={spec()}
        trends={[months]}
        now={now}
        onItemClick={onItemClick}
        onShapeMark={onShapeMark}
      />,
    );
    const item = (value: string) => ({ name: value, marks: [{ member: CATEGORY, value }] });
    fireEvent.click(row('Seafood'));
    expect(onItemClick).toHaveBeenLastCalledWith(item('Seafood'), false);
    fireEvent.click(row('Dairy'), { ctrlKey: true });
    expect(onItemClick).toHaveBeenLastCalledWith(item('Dairy'), true);
    fireEvent.click(row('Beverages'), { metaKey: true });
    expect(onItemClick).toHaveBeenLastCalledWith(item('Beverages'), true);
    // Shift: every row from the anchor, Seafood (the last plain click), here, as drawn.
    fireEvent.click(row('Produce'), { shiftKey: true });
    expect(onShapeMark).toHaveBeenLastCalledWith(
      [item('Seafood'), item('Dairy'), item('Produce')],
      false,
    );
    // The anchor holds: a second Shift-click grows or shrinks the same range.
    fireEvent.click(row('Beverages'), { shiftKey: true });
    expect(onShapeMark).toHaveBeenLastCalledWith([item('Beverages'), item('Seafood')], false);
    expect(onItemClick).toHaveBeenCalledTimes(3);
  });

  it('draws marked rows bold with a left rule, the others dimmed but Change and Icon in colour', () => {
    render(
      <GraphicalTableView
        spec={spec({ marking: marking('Seafood') } as Partial<RenderSpec>)}
        trends={[months]}
        now={now}
      />,
    );
    expect(row('Seafood').getAttribute('data-marked')).toBe('whole');
    expect(row('Dairy').getAttribute('data-marked')).toBe('none');
    // Bold with a left rule in the marking's colour.
    expect(GT_CSS).toMatch(/\.gt tr\[data-marked='whole'\] > \* \{[^}]*font-weight: 600;[^}]*\}/);
    expect(GT_CSS).toMatch(
      /\.gt tr\[data-marked='whole'\] > th\[scope='row'\] \{[^}]*box-shadow: inset 3px 0 0 var\(--gt-mark/,
    );
    // The others' text in text-secondary, their micro-charts at 0.28 …
    expect(GT_CSS).toMatch(
      /\.gt tr\[data-marked='none'\] > :not\(\.gt__change\):not\(\.gt__icon\) \{[^}]*color: var\(--wc-text-secondary\);[^}]*\}/,
    );
    expect(GT_CSS).toMatch(
      /\.gt tr\[data-marked='none'\] > :not\(\.gt__icon\) svg \{[^}]*opacity: 0\.28;[^}]*\}/,
    );
    // … and Change and Icon cells are not among them: they keep their colours.
    const cells = within(row('Dairy')).getAllByRole('cell');
    expect(cells[4]?.className).toContain('gt__icon');
    expect(cells[5]?.className).toContain('gt__change');
    // No rule styles them but to leave them out.
    expect(GT_CSS.replace(/:not\([^)]*\)/g, '')).not.toMatch(/\.gt__(change|icon)/);
  });

  it('keeps the marking when the rows are sorted otherwise, a row being its member', () => {
    const marked = marking('Seafood', 'Dairy');
    const { rerender } = render(
      <GraphicalTableView
        spec={spec({ marking: marked } as Partial<RenderSpec>)}
        trends={[]}
        now={now}
      />,
    );
    const markedNames = () =>
      screen
        .getAllByRole('row')
        .filter((one) => one.getAttribute('data-marked') === 'whole')
        .map((one) => one.querySelector('th')?.textContent);
    expect(markedNames()).toEqual(['Seafood', 'Dairy']);
    // By Revenue, lowest first, as the chart's Sort draws it.
    const sorted = spec({ marking: marked } as Partial<RenderSpec>);
    rerender(
      <GraphicalTableView
        spec={{ ...sorted, rows: [...sorted.rows].reverse() }}
        trends={[]}
        now={now}
      />,
    );
    expect(markedNames()).toEqual(['Dairy', 'Seafood']);
  });

  it('says another tile’s marked part: "· $X marked" in an additive cell, "Marked: X" only in a non-additive one’s tooltip', () => {
    // Region = EMEA marked elsewhere: each category's EMEA share answered apart.
    const share = [
      { [CATEGORY]: 'Beverages', [REVENUE]: '310000', [MARGIN]: '0.228', [TARGET]: '0.25' },
      { [CATEGORY]: 'Seafood', [REVENUE]: '205000', [MARGIN]: '0.25', [TARGET]: '0.25' },
    ];
    render(
      <GraphicalTableView
        spec={spec({
          marking: {
            predicate: { ...EMPTY_PREDICATE, items: [[{ member: REGION, value: 'EMEA' }]] },
            colour: '#7c3aed',
            share,
            aggTypes: { [REVENUE]: 'sum', [MARGIN]: 'avg', [TARGET]: 'avg' },
          },
        } as Partial<RenderSpec>)}
        trends={[]}
        now={now}
      />,
    );
    const beverages = within(row('Beverages')).getAllByRole('cell');
    expect(row('Beverages').getAttribute('data-marked')).toBe('partly');
    expect(beverages[0]?.textContent).toBe('$1,210,000 · $310,000 marked');
    expect(beverages[0]?.querySelector('.gt__marked')?.textContent).toBe(' · $310,000 marked');
    expect(GT_CSS).toMatch(/\.gt__marked \{[^}]*color: var\(--wc-text-secondary\);[^}]*\}/);
    // Margin, an average: nothing in the cell, its marked value in the tooltip.
    expect(beverages[1]?.textContent).toBe('23.1%');
    expect(beverages[1]?.getAttribute('title')).toBe('Marked: 22.8%');
    expect(beverages[0]?.getAttribute('title')).toBeNull();
    // No EMEA part: not marked, so dimmed.
    expect(row('Dairy').getAttribute('data-marked')).toBe('none');
    expect(within(row('Dairy')).getAllByRole('cell')[0]?.textContent).toBe('$720,000');
  });

  /**
   * AC-563: … graphical-table rows as table tiles' rows …, with §7a's keys:
   * the arrows move focus without marking, Space marks, Ctrl/⌘+Space
   * toggles, Shift extends, and Esc unmarks; no other key acts.
   */
  it('marks its rows from the keyboard, as a table tile’s rows (AC-563)', () => {
    const onItemClick = vi.fn();
    const onShapeMark = vi.fn();
    render(
      <GraphicalTableView
        spec={spec()}
        trends={[]}
        now={now}
        onItemClick={onItemClick}
        onShapeMark={onShapeMark}
      />,
    );
    const region = screen.getByRole('region', { name: 'Categories at a glance' });
    const item = (value: string) => ({ name: value, marks: [{ member: CATEGORY, value }] });
    const press = (key: string, more: Record<string, boolean> = {}) => {
      fireEvent.keyDown(document.activeElement ?? region, { key, ...more });
    };
    region.focus();
    // The arrows move focus between rows, marking nothing.
    press('ArrowDown');
    expect(document.activeElement).toBe(row('Beverages'));
    press('ArrowDown');
    expect(document.activeElement).toBe(row('Seafood'));
    expect(onItemClick).not.toHaveBeenCalled();
    // Space marks; Ctrl/⌘+Space toggles.
    press(' ');
    expect(onItemClick).toHaveBeenLastCalledWith(item('Seafood'), false);
    press('ArrowDown');
    press(' ', { ctrlKey: true });
    expect(onItemClick).toHaveBeenLastCalledWith(item('Dairy'), true);
    // Shift extends from the anchor, Seafood: by Space, and by an arrow.
    press('ArrowDown');
    press(' ', { shiftKey: true });
    expect(onShapeMark).toHaveBeenLastCalledWith(
      [item('Seafood'), item('Dairy'), item('Produce')],
      false,
    );
    press('ArrowUp', { shiftKey: true });
    expect(document.activeElement).toBe(row('Dairy'));
    expect(onShapeMark).toHaveBeenLastCalledWith([item('Seafood'), item('Dairy')], false);
    // Home and End, as a table tile's.
    press('Home');
    expect(document.activeElement).toBe(row('Beverages'));
    press('End');
    expect(document.activeElement).toBe(row('Produce'));
    // Esc unmarks the tile: a click on nothing.
    press('Escape');
    expect(onItemClick).toHaveBeenLastCalledWith({}, false);
    // No other key acts.
    const calls = onItemClick.mock.calls.length + onShapeMark.mock.calls.length;
    for (const key of ['Enter', 'm', 'Delete', 'PageDown']) press(key);
    expect(onItemClick.mock.calls.length + onShapeMark.mock.calls.length).toBe(calls);
    expect(document.activeElement).toBe(row('Produce'));
  });

  it('filters the others to its member as a cross-filter source', () => {
    const onItemClick = vi.fn();
    const drawn = spec();
    render(<GraphicalTableView spec={drawn} trends={[]} now={now} onItemClick={onItemClick} />);
    fireEvent.click(row('Dairy'));
    const [item] = onItemClick.mock.lastCall ?? [];
    expect(clickedValue(drawn, item)).toEqual({ member: CATEGORY, value: 'Dairy' });
  });
});
