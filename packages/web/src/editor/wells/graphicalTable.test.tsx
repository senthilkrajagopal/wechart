import { columnsOf, withColumns, type GraphicalTableColumn } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Member } from '../fields';
import { GraphicalTableWells } from './graphicalTable';
import { TYPE_WELLS } from './registry';

/**
 * T943 / AC-570: WHEN a graphical table is edited, THE SYSTEM SHALL take Rows
 * (one dimension), Group rows by (an optional second dimension, drawing a
 * section headed by each of its members), and Columns, an ordered list in
 * which each column is a Value, Change, Sparkline, Bullet or Icon, set with
 * R80's element settings for that kind (design 21 state C); each column row
 * SHALL open its settings, and its ⋯ menu SHALL hold Move up, Move down and
 * Remove, with Undo; and with no column, the tile SHALL say "Add a column:
 * Value, Change, Sparkline, Bullet or Icon." with + Column.
 * `Fails when: a column kind is missing or another is offered; a column's
 * settings differ from R80's element's; a column can't be moved or removed
 * without dragging, or Remove can't be undone; Group rows by doesn't section
 * the rows; or an empty table lacks the sentence or the action.`
 */
const member = (name: string, title: string, kind: Member['kind']): Member => ({
  name,
  title,
  shortTitle: title,
  kind,
  type: kind === 'measure' ? 'number' : kind === 'timeDimension' ? 'time' : 'string',
  cube: 'orders',
});

const AVAILABLE: readonly Member[] = [
  member('orders.revenue', 'Revenue', 'measure'),
  member('orders.margin', 'Margin %', 'measure'),
  member('orders.margin_target', 'Margin target', 'measure'),
  member('products.category', 'Category', 'dimension'),
  member('orders.region', 'Region', 'dimension'),
  member('orders.ordered_at', 'Ordered at', 'timeDimension'),
];
const titleOf = (name: string) => AVAILABLE.find((one) => one.name === name)?.title ?? name;
const valueOf = (element: HTMLElement) => (element as HTMLInputElement | HTMLSelectElement).value;
const checked = (element: HTMLElement) => (element as HTMLInputElement).checked;

const DESIGN_COLUMNS: readonly GraphicalTableColumn[] = [
  { kind: 'value', settings: { measure: 'orders.revenue' } },
  {
    kind: 'sparkline',
    settings: {
      measure: 'orders.revenue',
      time: 'orders.ordered_at',
      granularity: 'month',
      last: 12,
    },
  },
  {
    kind: 'bullet',
    settings: {
      measure: 'orders.margin',
      target: { kind: 'measure', measure: 'orders.margin_target' },
    },
  },
  { kind: 'icon', settings: { measure: 'orders.margin', of: 'orders.margin_target' } },
  {
    kind: 'change',
    settings: { measure: 'orders.revenue', compare: 'previous_period', period: 'quarter' },
  },
];

/** The wells over options that change as the editor's do, one undoable change at a time. */
function Harness({
  initial,
  dimensions,
  onChange,
}: {
  initial: Record<string, unknown>;
  dimensions: string[];
  onChange: (options: Record<string, unknown>) => void;
}) {
  const [options, setOptions] = useState(initial);
  return (
    <GraphicalTableWells
      chartType="graphicalTable"
      available={AVAILABLE}
      titleOf={titleOf}
      options={options}
      spec={{ measures: ['orders.revenue'], dimensions }}
      onOptions={(patch) => {
        const next = { ...options, ...patch };
        for (const [key, value] of Object.entries(patch)) if (value === undefined) delete next[key];
        setOptions(next);
        onChange(next);
      }}
    />
  );
}

const wells = ({
  columns = DESIGN_COLUMNS,
  dimensions = ['products.category'],
}: { columns?: readonly GraphicalTableColumn[]; dimensions?: string[] } = {}) => {
  const onChange = vi.fn<(options: Record<string, unknown>) => void>();
  render(
    <Harness initial={withColumns({}, columns)} dimensions={dimensions} onChange={onChange} />,
  );
  const list = () => screen.queryByRole('list', { name: 'Columns' });
  const last = () => columnsOf(onChange.mock.lastCall?.[0]);
  return { onChange, list, last };
};

describe('the graphical table’s wells (AC-570)', () => {
  it('is the graphical table’s entry in the wells registry', () => {
    expect(TYPE_WELLS.graphicalTable).toBe(GraphicalTableWells);
  });

  it('reads Rows and Group rows by from the chart’s dimensions, each member heading a section', () => {
    wells({ dimensions: ['products.category', 'orders.region'] });
    expect(screen.getByTestId('graphicalTable-rows').textContent).toBe('Category');
    expect(screen.getByTestId('graphicalTable-groupBy').textContent).toBe(
      'Region: a section headed by each of its members.',
    );
  });

  it('names Group rows by optional while there is no second dimension', () => {
    wells();
    expect(screen.getByTestId('graphicalTable-groupBy').textContent).toContain(
      'Optional: a second dimension in Dimensions',
    );
  });

  it('lists the columns in order, each by its kind and what it shows (design 23 sheet 2)', () => {
    const { list } = wells();
    const rows = within(list() as HTMLElement).getAllByRole('listitem');
    expect(rows.map((row) => within(row).getAllByRole('button')[0]?.textContent)).toEqual([
      'Value · Revenue',
      'Sparkline · Revenue by month, last 12',
      'Bullet · Margin % vs Margin target',
      'Icon · Margin % against Margin target',
      'Change · Revenue vs last quarter',
    ]);
  });

  it('+ Column offers exactly the five kinds, and adds one on the chart’s measure', async () => {
    const user = userEvent.setup();
    const { last } = wells({ columns: [] });
    await user.click(screen.getByRole('button', { name: 'Add a column' }));
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Value', 'Change', 'Sparkline', 'Bullet', 'Icon']);
    await user.click(within(menu).getByRole('menuitem', { name: 'Sparkline' }));
    expect(last()).toEqual([{ kind: 'sparkline', settings: { measure: 'orders.revenue' } }]);
  });

  it('with no column says so, with + Column as its action', () => {
    wells({ columns: [] });
    expect(
      screen.getByText('Add a column: Value, Change, Sparkline, Bullet or Icon.'),
    ).toBeTruthy();
    const add = screen.getByRole('button', { name: 'Add a column' }) as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    expect(add.textContent).toBe('+ Column');
    expect(screen.queryByRole('list', { name: 'Columns' })).toBeNull();
  });

  it('opens a column’s settings from its row: a Change’s are R80’s Change settings', async () => {
    const user = userEvent.setup();
    const { last } = wells();
    const row = screen.getByRole('button', { name: 'Change · Revenue vs last quarter' });
    expect(row.getAttribute('aria-expanded')).toBe('false');
    await user.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    const settings = screen.getByRole('group', { name: 'Change · Revenue vs last quarter' });
    // Design 21 C1: Measure, Compare with, Period, Show as, Direction.
    expect(valueOf(within(settings).getByRole('combobox', { name: 'Measure' }))).toBe(
      'orders.revenue',
    );
    expect(within(settings).getByText('The previous period')).toBeTruthy();
    expect(valueOf(within(settings).getByRole('combobox', { name: 'Period' }))).toBe('quarter');
    expect(checked(within(settings).getByRole('radio', { name: '%' }))).toBe(true);
    await user.click(within(settings).getByRole('radio', { name: 'Lower is better' }));
    expect(last()[4]).toEqual({
      kind: 'change',
      settings: {
        measure: 'orders.revenue',
        compare: 'previous_period',
        period: 'quarter',
        direction: 'lower',
      },
    });
  });

  it('gives a Sparkline column R80’s Sparkline settings', async () => {
    const user = userEvent.setup();
    const { last } = wells();
    await user.click(screen.getByRole('button', { name: 'Sparkline · Revenue by month, last 12' }));
    const settings = screen.getByRole('group', { name: 'Sparkline · Revenue by month, last 12' });
    // Design 21 C2: Measure, Over, By, Show the last, Mark the last point.
    expect(valueOf(within(settings).getByRole('combobox', { name: 'Over' }))).toBe(
      'orders.ordered_at',
    );
    expect(valueOf(within(settings).getByRole('combobox', { name: 'By' }))).toBe('month');
    expect(valueOf(within(settings).getByRole('spinbutton', { name: 'Show the last' }))).toBe('12');
    await user.click(within(settings).getByRole('checkbox', { name: 'Mark the last point' }));
    expect(last()[1]?.settings).toEqual({
      measure: 'orders.revenue',
      time: 'orders.ordered_at',
      granularity: 'month',
      last: 12,
      lastPoint: true,
    });
  });

  it('gives a Bullet column R80’s Bullet graph settings, refusing a fourth range', async () => {
    const user = userEvent.setup();
    const { last } = wells();
    await user.click(screen.getByRole('button', { name: 'Bullet · Margin % vs Margin target' }));
    const settings = screen.getByRole('group', { name: 'Bullet · Margin % vs Margin target' });
    // Design 21 C4: Measure, Target (Fixed or a measure), Ranges up to 3, Min, Max.
    expect(checked(within(settings).getByRole('radio', { name: 'A measure' }))).toBe(true);
    expect(valueOf(within(settings).getByRole('combobox', { name: 'Target measure' }))).toBe(
      'orders.margin_target',
    );
    const ranges = within(settings).getByRole('textbox', { name: 'Ranges, low to high' });
    await user.type(ranges, '0.15, 0.2, 0.25{Enter}');
    expect(last()[2]?.settings['ranges']).toEqual([0.15, 0.2, 0.25]);
    await user.clear(ranges);
    await user.type(ranges, '1, 2, 3, 4{Enter}');
    expect(within(settings).getByText('Up to 3 ranges, low to high.')).toBeTruthy();
    expect(last()[2]?.settings['ranges']).toEqual([0.15, 0.2, 0.25]);
    await user.type(within(settings).getByRole('spinbutton', { name: 'Min' }), '0{Enter}');
    expect(last()[2]?.settings['min']).toBe(0);
  });

  it('gives an Icon column R80’s Icon settings: rules top to bottom, a condition, a state and a label', async () => {
    const user = userEvent.setup();
    const { last } = wells();
    await user.click(screen.getByRole('button', { name: 'Icon · Margin % against Margin target' }));
    const settings = screen.getByRole('group', { name: 'Icon · Margin % against Margin target' });
    expect(valueOf(within(settings).getByRole('combobox', { name: 'As % of' }))).toBe(
      'orders.margin_target',
    );
    await user.click(within(settings).getByRole('button', { name: '+ rule' }));
    expect(last()[3]?.settings['rules']).toEqual([
      { op: 'otherwise', state: 'neutral', label: 'Otherwise' },
    ]);
    const rule = within(settings).getByRole('group', { name: 'Rule 1' });
    await user.selectOptions(within(rule).getByRole('combobox', { name: 'When' }), '>=');
    const value = within(rule).getByRole('spinbutton', { name: 'Value' });
    await user.clear(value);
    await user.type(value, '100{Enter}');
    await user.selectOptions(within(rule).getByRole('combobox', { name: 'State' }), 'success');
    const label = within(rule).getByRole('textbox', { name: 'Label' });
    await user.clear(label);
    await user.type(label, 'On track{Enter}');
    // With "As % of", a rule's value is a percentage, stored as R80 stores it: a ratio.
    expect(last()[3]?.settings['rules']).toEqual([
      { op: '>=', value: 1, state: 'success', label: 'On track' },
    ]);
  });

  it('gives a Value column its measure, the one setting R80’s Value has inside a chart', async () => {
    const user = userEvent.setup();
    const { last } = wells();
    await user.click(screen.getByRole('button', { name: 'Value · Revenue' }));
    const settings = screen.getByRole('group', { name: 'Value · Revenue' });
    await user.selectOptions(within(settings).getByRole('combobox', { name: 'Measure' }), [
      'orders.margin',
    ]);
    expect(last()[0]).toEqual({ kind: 'value', settings: { measure: 'orders.margin' } });
  });

  it('moves a column up and down from its ⋯ menu, with no drag', async () => {
    const user = userEvent.setup();
    const { last } = wells();
    const more = screen.getByRole('button', { name: 'Column 1, Value · Revenue: more' });
    await user.click(more);
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Move up', 'Move down', 'Remove']);
    expect(
      within(menu).getByRole('menuitem', { name: 'Move up' }).getAttribute('aria-disabled'),
    ).toBe('true');
    await user.click(within(menu).getByRole('menuitem', { name: 'Move down' }));
    expect(last().map((one) => one.kind)).toEqual([
      'sparkline',
      'value',
      'bullet',
      'icon',
      'change',
    ]);

    await user.click(
      screen.getByRole('button', { name: 'Column 5, Change · Revenue vs last quarter: more' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Move up' }));
    expect(last().map((one) => one.kind)).toEqual([
      'sparkline',
      'value',
      'bullet',
      'change',
      'icon',
    ]);
  });

  it('keeps focus on a moved column’s ⋯, so it can be moved again from the keyboard (T943’s review)', async () => {
    const user = userEvent.setup();
    const { last } = wells();
    const more = screen.getByRole('button', {
      name: 'Column 5, Change · Revenue vs last quarter: more',
    });
    more.focus();
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('menuitem', { name: 'Move up' }));
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Column 4, Change · Revenue vs last quarter: more',
    );
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('menuitem', { name: 'Move up' }));
    expect(last().map((one) => one.kind)).toEqual([
      'value',
      'sparkline',
      'change',
      'bullet',
      'icon',
    ]);
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Column 3, Change · Revenue vs last quarter: more',
    );
  });

  it('after a Remove, puts focus on the next column’s ⋯, or + Column when none is left', async () => {
    const user = userEvent.setup();
    wells({ columns: DESIGN_COLUMNS.slice(0, 2) });
    await user.click(screen.getByRole('button', { name: 'Column 1, Value · Revenue: more' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Column 1, Sparkline · Revenue by month, last 12: more',
    );
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Add a column');
  });

  it('drops the toast’s Undo once the columns change otherwise, so it never puts a column back twice', async () => {
    const user = userEvent.setup();
    const onOptions = vi.fn();
    const { rerender } = render(
      <GraphicalTableWells
        chartType="graphicalTable"
        available={AVAILABLE}
        titleOf={titleOf}
        options={withColumns({}, DESIGN_COLUMNS)}
        spec={{ measures: ['orders.revenue'], dimensions: ['products.category'] }}
        onOptions={onOptions}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Column 1, Value · Revenue: more' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }));
    // The editor applies the removal, then its own Undo puts the column back.
    rerender(
      <GraphicalTableWells
        chartType="graphicalTable"
        available={AVAILABLE}
        titleOf={titleOf}
        options={withColumns({}, DESIGN_COLUMNS)}
        spec={{ measures: ['orders.revenue'], dimensions: ['products.category'] }}
        onOptions={onOptions}
      />,
    );
    expect(screen.queryByTestId('undo-toast')).toBeNull();
    expect(onOptions).toHaveBeenCalledTimes(1);
  });

  it('removes a column from its ⋯ menu, and Undo puts it back where it was', async () => {
    const user = userEvent.setup();
    const { last } = wells();
    await user.click(
      screen.getByRole('button', { name: 'Column 3, Bullet · Margin % vs Margin target: more' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(last().map((one) => one.kind)).toEqual(['value', 'sparkline', 'icon', 'change']);
    const toast = screen.getByTestId('undo-toast');
    expect(toast.textContent).toContain('Removed the column Bullet · Margin % vs Margin target.');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(last()).toEqual(DESIGN_COLUMNS);
    expect(screen.queryByTestId('undo-toast')).toBeNull();
  });
});
