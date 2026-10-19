import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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

/**
 * T688 (chart-editor-Q8, answered 2026-10-08: fold as the prototype draws it,
 * editor.js:316): each section a native disclosure, its heading the summary,
 * Axes and Legend open at first and Series and Values closed, and Series
 * counted in its heading.
 */
describe('the Customize tab’s sections, folded as the prototype draws them (T688, chart-editor-Q8)', () => {
  it('folds each section, Axes and Legend open and Series and Values closed, Series counted', () => {
    tab();
    const sections = [...document.querySelectorAll('.customize-tab__section')];
    expect(sections.map((section) => section.tagName)).toEqual([
      'DETAILS',
      'DETAILS',
      'DETAILS',
      'DETAILS',
    ]);
    expect(
      sections.map((section) => [
        section.querySelector(':scope > summary')?.textContent,
        (section as HTMLDetailsElement).open,
      ]),
    ).toEqual([
      ['Axes', true],
      ['Legend', true],
      ['Series (2)', false],
      ['Values', false],
    ]);
    // Each summary still a heading, for those who move by them.
    expect(screen.getByRole('heading', { name: 'Series (2)' }).closest('summary')).not.toBeNull();
  });
});

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

  /**
   * T467's review (AC-040): unset, a category axis's labels turn to fit
   * (UX-117), so unset is "Auto", said as that, and 0° is a choice stored as
   * 0 — stored as unset, it was turned back to fit and had no effect.
   */
  it('reads unset rotation as Auto, and keeps 0° as a choice of its own', async () => {
    const onOptions = tab();
    const rotation = within(screen.getByRole('group', { name: 'X axis' })).getByLabelText(
      'Label rotation',
    ) as HTMLSelectElement;
    expect(rotation.selectedOptions[0]?.textContent).toBe('Auto');

    await userEvent.selectOptions(rotation, '0°');
    expect(onOptions).toHaveBeenLastCalledWith({ axes: { x: { tickRotation: 0 } } });
  });

  it('puts rotation back to Auto', async () => {
    const onOptions = tab({ axes: { x: { tickRotation: 45 } } });
    const rotation = within(screen.getByRole('group', { name: 'X axis' })).getByLabelText(
      'Label rotation',
    );
    await userEvent.selectOptions(rotation, 'Auto');
    // Sparse, as every setting put back is: nothing left, no axes stored.
    expect(onOptions).toHaveBeenLastCalledWith({ axes: undefined });
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
      // A folded section, a disclosure's group, since T688 (chart-editor-Q8).
      within(screen.getByRole('group', { name: 'Values' })).getByLabelText('Number format'),
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

  /**
   * T392, AC-300: the series' order, set here, is saved with the chart as the
   * whole list of their names; the drawing follows it (`seriesOrder.test.ts`).
   */
  it('orders the series, and lists them in the order set', async () => {
    const onOptions = tab();
    const listed = () =>
      within(screen.getByRole('list', { name: 'Series order' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent?.match(/Orders (Count|Amount)/)?.[0]);
    expect(listed()).toEqual(['Orders Count', 'Orders Amount']);
    // The first can't go up, nor the last down.
    expect(
      (screen.getByRole('button', { name: 'Move Orders Count up' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Move Orders Amount down' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Move Orders Amount up' }));
    expect(onOptions).toHaveBeenLastCalledWith({ seriesOrder: ['orders.amount', 'orders.count'] });
  });

  it('shows an order set before, and puts it back to the data’s own', async () => {
    const onOptions = tab({ seriesOrder: ['orders.amount', 'orders.count'] });
    const items = within(screen.getByRole('list', { name: 'Series order' })).getAllByRole(
      'listitem',
    );
    expect(items.map((item) => item.textContent?.match(/Orders (Count|Amount)/)?.[0])).toEqual([
      'Orders Amount',
      'Orders Count',
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Move Orders Amount down' }));
    // Kept, even where it matches the data's order today: the data's order
    // can change on a refresh, and the order set must not (T392's review).
    expect(onOptions).toHaveBeenLastCalledWith({ seriesOrder: ['orders.count', 'orders.amount'] });

    // Only Reset puts it back to the data's own.
    await userEvent.click(screen.getByRole('button', { name: 'Reset the series order' }));
    expect(onOptions).toHaveBeenLastCalledWith({ seriesOrder: undefined });
  });

  it('offers no reset while no order is set', () => {
    tab();
    expect(screen.queryByRole('button', { name: 'Reset the series order' })).toBeNull();
  });

  it('keeps the place of a series not drawn today', async () => {
    const onOptions = tab({ seriesOrder: ['orders.region', 'orders.amount', 'orders.count'] });
    await userEvent.click(screen.getByRole('button', { name: 'Move Orders Count up' }));
    expect(onOptions).toHaveBeenLastCalledWith({
      seriesOrder: ['orders.region', 'orders.count', 'orders.amount'],
    });
  });

  it('follows the series moved with focus, and says where it went', async () => {
    function Stateful() {
      const [options, setOptions] = useState<Record<string, unknown>>({});
      return (
        <CustomizeTab
          options={options}
          onOptions={(patch) => {
            setOptions((current) => ({ ...current, ...patch }));
          }}
          cartesian
          valueAxes={['y']}
          drawn
          stackable
          series={series}
          colourOf={() => '#123456'}
        />
      );
    }
    render(<Stateful />);

    await userEvent.click(screen.getByRole('button', { name: 'Move Orders Amount up' }));
    // At the top now: its Up is closed, so focus goes to its Down.
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Move Orders Amount down' }),
    );
    expect(screen.getByRole('status').textContent).toBe('Orders Amount moved to position 1 of 2.');
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

  /** T990 (AC-591): Distribution sits beside the whiskers, a box plot's alone. */
  it('offers a box plot its Distribution, its points needing Each point is', () => {
    boxplotTab();
    expect(screen.getByRole('heading', { name: 'Distribution' })).toBeTruthy();
    const points = screen.getByRole('radiogroup', { name: 'Points' });
    expect(
      (within(points).getByRole('radio', { name: 'Outliers' }) as HTMLInputElement).checked,
    ).toBe(true);
    // Not told Each point is is set, the editor's box plot hasn't one.
    expect(
      (within(points).getByRole('radio', { name: 'Beeswarm' }) as HTMLInputElement).disabled,
    ).toBe(true);
  });

  it('offers no Distribution to any other chart', () => {
    tab();
    expect(screen.queryByRole('heading', { name: 'Distribution' })).toBeNull();
  });
});

/**
 * T855 (AC-497, AC-219): a combo's Series section is a row per series with
 * its mark and axis, in place of the plain list; any other chart keeps it.
 */
describe('a combo’s Series section (T855)', () => {
  const combo = {
    measures: [
      { measure: 'orders.count', title: 'Orders Count' },
      { measure: 'orders.amount', title: 'Orders Amount' },
    ],
  };

  it('gives each series its Mark and Axis groups, and no order list', () => {
    const onOptions = vi.fn();
    render(
      <CustomizeTab
        options={{}}
        onOptions={onOptions}
        cartesian
        valueAxes={['y']}
        drawn
        stackable
        series={series}
        colourOf={() => '#123456'}
        combo={combo}
      />,
    );

    expect(screen.getByRole('radiogroup', { name: 'Orders Amount mark' })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Orders Amount axis' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Series order' })).toBeNull();
    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Orders Amount axis' })).getByRole('radio', {
        name: 'Right',
      }),
    );
    expect(onOptions).toHaveBeenLastCalledWith({
      series: { 'orders.amount': { axis: 'right' } },
    });
  });

  it('keeps the order list for any other chart', () => {
    tab();
    expect(screen.queryByRole('radiogroup', { name: /mark$/ })).toBeNull();
    expect(screen.getByRole('list', { name: 'Series order', hidden: true })).toBeTruthy();
  });
});
