/**
 * T861 (AC-218): a combo's two-scales warning in Customize › Axes, worked
 * out from the chart as drawn (`comboWarningOf`), with its offers: One axis
 * puts every series on the left, Synchronize turns it on or says why not,
 * Small multiples and Table change the type.
 */
import type { RenderSpec } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ComboWarning, comboWarningOf } from './ComboWarning';

const MONTH = 'orders.month';
const REVENUE = 'orders.revenue';
const COST = 'orders.cost';
const MARGIN = 'orders.margin_pct';
const spec = (options: Record<string, unknown>, rows?: RenderSpec['rows']): RenderSpec => ({
  chartType: 'combo',
  encoding: { x: [MONTH], y: [REVENUE, COST, MARGIN] },
  measures: [REVENUE, COST, MARGIN],
  rows: rows ?? [
    { [MONTH]: 'Jan', [REVENUE]: 120, [COST]: 80, [MARGIN]: 0.2 },
    { [MONTH]: 'Feb', [REVENUE]: 150, [COST]: 90, [MARGIN]: 0.3 },
  ],
  formats: { [REVENUE]: 'currency', [COST]: 'currency', [MARGIN]: 'percent' },
  titles: { [REVENUE]: 'Revenue', [COST]: 'Cost', [MARGIN]: 'Margin %' },
  options,
});
const MARGIN_RIGHT = { series: { [MARGIN]: { mark: 'line', axis: 'right' } } };

describe('the warning, from the chart as drawn (T861)', () => {
  it('warns of Revenue ($) and Margin % (%) on two axes', () => {
    expect(comboWarningOf(spec(MARGIN_RIGHT))?.text).toBe(
      'Two scales: Revenue ($) and Margin % (%) can be made to look related.',
    );
  });

  it('says nothing on one axis, or two synchronized', () => {
    expect(comboWarningOf(spec({}))).toBeUndefined();
    const costRight = { series: { [COST]: { axis: 'right' } }, combo: { synchronize: true } };
    expect(comboWarningOf(spec(costRight))).toBeUndefined();
  });

  it('says the right axis doesn’t start at zero, lines only and include zero off', () => {
    const lines = {
      series: { [REVENUE]: { mark: 'line' }, [MARGIN]: { mark: 'line', axis: 'right' } },
      axes: { right: { includeZero: false } },
    };
    const rows = [
      { [MONTH]: 'Jan', [REVENUE]: 120, [COST]: 80, [MARGIN]: 0.62 },
      { [MONTH]: 'Feb', [REVENUE]: 150, [COST]: 90, [MARGIN]: 0.71 },
    ];

    expect(comboWarningOf(spec(lines, rows))?.text).toContain(
      "The right axis doesn't start at zero.",
    );
  });
});

function Held({ start }: { start: Record<string, unknown> }) {
  const [options, setOptions] = useState<Record<string, unknown>>(start);
  const warning = comboWarningOf(spec(options));
  return (
    <>
      {warning === undefined ? null : (
        <ComboWarning
          warning={warning}
          options={options}
          onOptions={(patch) => setOptions((current) => ({ ...current, ...patch }))}
          onSmallMultiples={vi.fn()}
          onTable={vi.fn()}
        />
      )}
      <pre data-testid="options">{JSON.stringify(options)}</pre>
    </>
  );
}

describe('the warning’s row and offers (T861)', () => {
  it('shows the warning with its icon and its four offers, Synchronize disabled with why', () => {
    render(<Held start={MARGIN_RIGHT} />);
    const row = screen.getByTestId('combo-warning');

    expect(row.className).toContain('status-warning');
    expect(row.querySelector('[data-icon="warn"]')).not.toBeNull();
    expect(
      within(row)
        .getAllByRole('button')
        .map((one) => one.textContent),
    ).toEqual(['One axis', 'Synchronize', 'Small multiples', 'Table']);
    const synchronize = within(row).getByRole('button', { name: 'Synchronize' }) as HTMLButtonElement;
    expect(synchronize.disabled).toBe(true);
    expect(synchronize.title).toBe('Revenue is in $ and Margin % in %');
  });

  it('One axis puts every series on the left, and the warning goes', async () => {
    render(<Held start={MARGIN_RIGHT} />);

    await userEvent.click(screen.getByRole('button', { name: 'One axis' }));

    expect(JSON.parse(screen.getByTestId('options').textContent ?? '{}')).toEqual({
      series: { [MARGIN]: { mark: 'line' } },
    });
    expect(screen.queryByTestId('combo-warning')).toBeNull();
  });

  it('Synchronize, first for $ and $, turns it on, and the warning goes', async () => {
    render(<Held start={{ series: { [COST]: { axis: 'right' } } }} />);
    const row = screen.getByTestId('combo-warning');

    expect(row.textContent).toContain('Revenue and Cost are both in $.');
    expect(within(row).getAllByRole('button')[0]?.textContent).toBe('Synchronize');
    await userEvent.click(within(row).getByRole('button', { name: 'Synchronize' }));

    expect(JSON.parse(screen.getByTestId('options').textContent ?? '{}')).toEqual({
      series: { [COST]: { axis: 'right' } },
      combo: { synchronize: true },
    });
    expect(screen.queryByTestId('combo-warning')).toBeNull();
  });
});
