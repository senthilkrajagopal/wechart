import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CustomizeTab } from './CustomizeTab';

/**
 * T231 / AC-219: THE SYSTEM SHALL offer in the chart editor's Customize tab
 * the axis settings — title, label rotation, include zero, logarithmic scale,
 * gridlines, minimum and maximum — the legend's visibility and position, each
 * series' colour and visibility and whether series stack, data labels, and
 * the number format.
 * `Fails when: the legend's position, data labels or "include zero" cannot be
 * set.`
 *
 * The setting half: each control writes its sparse option. That the drawing
 * changes is `packages/charts/src/customize.test.ts`'s and the editor's e2e.
 */
const series = [
  { name: 'orders.count', title: 'Orders Count' },
  { name: 'orders.amount', title: 'Orders Amount' },
];

const tab = (options: Record<string, unknown> = {}) => {
  const onOptions = vi.fn();
  render(
    <CustomizeTab
      options={options}
      onOptions={onOptions}
      cartesian
      valueAxes={['y']}
      drawn
      stackable
      series={series}
      colourOf={() => '#123456'}
    />,
  );
  return onOptions;
};

describe('the Customize tab (AC-219)', () => {
  it('offers every axis setting the criterion names, include zero on the axis of values', () => {
    tab();
    for (const axis of ['X axis', 'Y axis']) {
      const panel = screen.getByRole('group', { name: axis });
      for (const label of [
        'Title',
        'Label rotation',
        'Logarithmic scale',
        'Gridlines',
        'Minimum',
        'Maximum',
        'Number format',
      ])
        expect(within(panel).getByLabelText(label)).toBeTruthy();
    }
    // A category axis has no zero to include.
    expect(
      within(screen.getByRole('group', { name: 'Y axis' })).getByLabelText('Include zero'),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('group', { name: 'X axis' })).queryByLabelText('Include zero'),
    ).toBeNull();
  });

  it('turns off "include zero" on the value axis', async () => {
    const onOptions = tab();
    await userEvent.click(screen.getByLabelText('Include zero'));
    expect(onOptions).toHaveBeenLastCalledWith({ axes: { y: { includeZero: false } } });
  });

  it('sets a series’ colour down once, and puts it back to automatic', async () => {
    const onOptions = tab({ series: { 'orders.amount': { colour: '#ff00aa' } } });
    const picker = screen.getByLabelText('Colour of Orders Count');
    fireEvent.change(picker, { target: { value: '#111111' } });
    fireEvent.change(picker, { target: { value: '#222222' } });
    expect(onOptions).not.toHaveBeenCalled();
    fireEvent.blur(picker);
    expect(onOptions).toHaveBeenCalledTimes(1);
    expect(onOptions).toHaveBeenLastCalledWith({
      series: { 'orders.amount': { colour: '#ff00aa' }, 'orders.count': { colour: '#222222' } },
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Automatic colour for Orders Amount' }),
    );
    expect(onOptions).toHaveBeenLastCalledWith({ series: undefined });
  });

  it('chooses a number format for the values', async () => {
    const onOptions = tab();
    await userEvent.selectOptions(
      within(screen.getByRole('region', { name: 'Values' })).getByLabelText('Number format'),
      'compact',
    );
    expect(onOptions).toHaveBeenLastCalledWith({ valueFormat: 'compact' });
  });

  it('offers only what a type can use: nothing but its axes for a table-like chart', () => {
    render(
      <CustomizeTab
        options={{}}
        onOptions={vi.fn()}
        cartesian={false}
        valueAxes={[]}
        drawn={false}
        stackable={false}
        series={[]}
        colourOf={() => '#123456'}
      />,
    );
    expect(screen.queryByLabelText('Legend position')).toBeNull();
    expect(screen.queryByLabelText('Data labels')).toBeNull();
    expect(screen.getByText('This chart type has nothing to customize here.')).toBeTruthy();
  });

  it('moves the legend, and hides it', async () => {
    const onOptions = tab();
    await userEvent.selectOptions(screen.getByLabelText('Legend position'), 'right');
    expect(onOptions).toHaveBeenLastCalledWith({ legend: { position: 'right' } });
    await userEvent.click(screen.getByLabelText('Show the legend'));
    expect(onOptions).toHaveBeenLastCalledWith({ legend: { show: false } });
  });

  it('colours, hides and stacks series, and writes data labels', async () => {
    const onOptions = tab({ series: { 'orders.count': { hidden: true } } });
    expect((screen.getByLabelText('Orders Count') as HTMLInputElement).checked).toBe(false);
    await userEvent.click(screen.getByLabelText('Orders Count'));
    // Shown again: the setting cleared, not stored as a default.
    expect(onOptions).toHaveBeenLastCalledWith({ series: undefined });
    await userEvent.click(screen.getByLabelText('Orders Amount'));
    expect(onOptions).toHaveBeenLastCalledWith({
      series: { 'orders.count': { hidden: true }, 'orders.amount': { hidden: true } },
    });
    await userEvent.click(screen.getByLabelText('Stack the series'));
    expect(onOptions).toHaveBeenLastCalledWith({ stacked: true });
    await userEvent.click(screen.getByLabelText('Data labels'));
    expect(onOptions).toHaveBeenLastCalledWith({ dataLabels: true });
    expect(screen.getByLabelText('Colour of Orders Amount')).toBeTruthy();
  });
});

/**
 * T399 (AC-306): a box plot's whiskers follow a chart option — by default
 * Tukey's 1.5 × IQR with values beyond as dots, or else the minimum and
 * maximum.
 */
describe('a box plot’s whiskers (AC-306)', () => {
  // As the editor passes a box plot's: no legend or labels to set (T399's review).
  const boxplotTab = (options: Record<string, unknown> = {}) => {
    const onOptions = vi.fn();
    render(
      <CustomizeTab
        options={options}
        onOptions={onOptions}
        cartesian={false}
        valueAxes={['y']}
        drawn={false}
        stackable={false}
        series={[]}
        colourOf={() => '#123456'}
        whiskers
      />,
    );
    return onOptions;
  };

  it('offers only what a box plot can change: its whiskers, not a legend or labels', () => {
    boxplotTab();
    expect(screen.getByRole('radiogroup', { name: 'Whiskers' })).toBeTruthy();
    expect(screen.queryByText('This chart type has nothing to customize here.')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Legend' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Data labels' })).toBeNull();
  });

  it('offers Tukey’s whiskers, chosen by default, or the minimum and maximum', async () => {
    const onOptions = boxplotTab();
    const group = screen.getByRole('radiogroup', { name: 'Whiskers' });
    const tukey = within(group).getByRole('radio', { name: /1\.5 × IQR/ });
    const minmax = within(group).getByRole('radio', { name: 'Minimum and maximum' });
    expect((tukey as HTMLInputElement).checked).toBe(true);

    await userEvent.click(minmax);
    expect(onOptions).toHaveBeenLastCalledWith({ whiskers: 'minmax' });
  });

  it('clears the option back to Tukey’s, keeping the saved options sparse', async () => {
    const onOptions = boxplotTab({ whiskers: 'minmax' });
    await userEvent.click(screen.getByRole('radio', { name: /1\.5 × IQR/ }));
    expect(onOptions).toHaveBeenLastCalledWith({ whiskers: undefined });
  });

  it('isn’t offered for any other chart', () => {
    tab();
    expect(screen.queryByRole('radiogroup', { name: 'Whiskers' })).toBeNull();
  });
});
