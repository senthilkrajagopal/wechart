import { comboSeriesOf } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { SeriesRows } from './SeriesRows';
import { StackingRows } from './StackingRows';

/**
 * T859 (AC-503; design 20 screen 1 pin 4): a combo's stacking, set once for
 * the whole chart under Customize › Series: "Bars: Side by side | Stacked"
 * always, and "Areas: Overlap | Stacked" only while a series is an area.
 */
const REVENUE = 'orders.revenue';
const COST = 'orders.cost';
const MARGIN = 'orders.margin_pct';
const measures = [
  { measure: REVENUE, title: 'Revenue' },
  { measure: COST, title: 'Cost' },
  { measure: MARGIN, title: 'Margin %' },
];

/** The Series rows and the stacking rows over options held as the editor holds them. */
function Held({ start = {} }: { start?: Record<string, unknown> }) {
  const [options, setOptions] = useState<Record<string, unknown>>(start);
  const onOptions = (patch: Readonly<Record<string, unknown>>) =>
    setOptions((current) => {
      const next: Record<string, unknown> = { ...current, ...patch };
      for (const [key, value] of Object.entries(patch)) if (value === undefined) delete next[key];
      return next;
    });
  return (
    <>
      <SeriesRows
        measures={measures}
        options={options}
        onOptions={onOptions}
        colourOf={() => '#123456'}
      />
      <StackingRows
        series={comboSeriesOf(
          measures.map((one) => one.measure),
          options,
        )}
        options={options}
        onOptions={onOptions}
      />
      <output data-testid="options">{JSON.stringify(options)}</output>
    </>
  );
}

const optionsNow = () =>
  JSON.parse(screen.getByTestId('options').textContent ?? '{}') as Record<string, unknown>;
const radios = (group: string) =>
  within(screen.getByRole('radiogroup', { name: group }))
    .getAllByRole('radio')
    .map((one) => [one.getAttribute('aria-label'), (one as HTMLInputElement).checked]);

describe('stacking rows (AC-503)', () => {
  it('offers Bars side by side, checked, or stacked', () => {
    render(<Held />);

    expect(radios('Bars')).toEqual([
      ['Side by side', true],
      ['Stacked', false],
    ]);
  });

  it('shows Areas only once Cost is drawn as an area', async () => {
    render(<Held />);
    expect(screen.queryByRole('radiogroup', { name: 'Areas' })).toBeNull();

    const costMark = screen.getByRole('radiogroup', { name: 'Cost mark' });
    await userEvent.click(within(costMark).getByRole('radio', { name: 'Area' }));

    expect(radios('Areas')).toEqual([
      ['Overlap', true],
      ['Stacked', false],
    ]);
  });

  it('stacks every bar series at once, by one chart-wide setting', async () => {
    render(<Held />);
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Bars' })).getByRole('radio', {
        name: 'Stacked',
      }),
    );

    expect(optionsNow()['combo']).toEqual({ bars: 'stacked' });
    expect(radios('Bars')).toEqual([
      ['Side by side', false],
      ['Stacked', true],
    ]);
    // And back: nothing left stored.
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Bars' })).getByRole('radio', {
        name: 'Side by side',
      }),
    );
    expect(optionsNow()['combo']).toBeUndefined();
  });

  it('stacks the areas, keeping the bars’ setting and Synchronize', async () => {
    render(
      <Held
        start={{
          series: { [COST]: { mark: 'area' } },
          combo: { synchronize: true, bars: 'stacked' },
        }}
      />,
    );
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Areas' })).getByRole('radio', {
        name: 'Stacked',
      }),
    );

    expect(optionsNow()['combo']).toEqual({ synchronize: true, bars: 'stacked', areas: 'stacked' });
  });
});
