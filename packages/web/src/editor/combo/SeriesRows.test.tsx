import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { SeriesRows, type SeriesRowsProps } from './SeriesRows';

/**
 * T855 (AC-497, AC-498, AC-504, AC-219): Customize › Series for a combo, one
 * row per series with its Mark and Axis radio groups and, once the author
 * changed either, Back to Auto; split, rows grouped by measure, each
 * member's row its swatch, name and visibility, and a mark another measure
 * draws disabled with its reason (design 20 screen 1 pin 2, state A).
 */
const REVENUE = 'orders.revenue';
const TARGET = 'orders.target';
const MARGIN = 'orders.margin_pct';
const measures = [
  { measure: REVENUE, title: 'Revenue' },
  { measure: TARGET, title: 'Revenue target' },
  { measure: MARGIN, title: 'Margin %' },
];

/** The rows over options held as the editor holds them, patch by patch. */
function Held(props: Omit<SeriesRowsProps, 'options' | 'onOptions'> & { start?: object }) {
  const [options, setOptions] = useState<Record<string, unknown>>({ ...props.start });
  return (
    <>
      <SeriesRows
        {...props}
        options={options}
        onOptions={(patch) => {
          setOptions((current) => {
            const next: Record<string, unknown> = { ...current, ...patch };
            for (const [key, value] of Object.entries(patch)) {
              if (value === undefined) delete next[key];
            }
            return next;
          });
        }}
      />
      <output data-testid="options">{JSON.stringify(options)}</output>
    </>
  );
}

const optionsNow = () =>
  JSON.parse(screen.getByTestId('options').textContent ?? '{}') as Record<string, unknown>;
/** Whether a radio or checkbox is checked. */
const checked = (element: HTMLElement) => (element as HTMLInputElement).checked;

describe('a row per series (AC-497)', () => {
  it('gives each series a Mark and an Axis radio group, named by its measure', () => {
    render(<Held measures={measures} colourOf={() => '#123456'} />);

    expect(screen.getAllByRole('radiogroup')).toHaveLength(6);
    const mark = screen.getByRole('radiogroup', { name: 'Revenue mark' });
    const marks = within(mark).getAllByRole('radio');
    expect(marks.map((one) => one.getAttribute('aria-label'))).toEqual([
      'Bar',
      'Line',
      'Area',
      'Point',
    ]);
    // Each named in its tooltip as well.
    expect(marks.map((one) => one.closest('label')?.getAttribute('title'))).toEqual([
      'Bar',
      'Line',
      'Area',
      'Point',
    ]);
    expect(checked(within(mark).getByRole('radio', { name: 'Bar' }))).toBe(true);
    const axis = screen.getByRole('radiogroup', { name: 'Revenue axis' });
    expect(
      within(axis)
        .getAllByRole('radio')
        .map((one) => one.getAttribute('aria-label')),
    ).toEqual(['Left', 'Right']);
    expect(checked(within(axis).getByRole('radio', { name: 'Left' }))).toBe(true);
  });

  it('moves along a group with → and ←, choosing as it goes', async () => {
    const user = userEvent.setup();
    render(<Held measures={measures} colourOf={() => '#123456'} />);
    const mark = screen.getByRole('radiogroup', { name: 'Margin % mark' });

    within(mark).getByRole('radio', { name: 'Line' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(checked(within(mark).getByRole('radio', { name: 'Area' }))).toBe(true);
    expect(document.activeElement).toBe(within(mark).getByRole('radio', { name: 'Area' }));
    await user.keyboard('{ArrowLeft}');
    expect(checked(within(mark).getByRole('radio', { name: 'Line' }))).toBe(true);
  });

  it('sets Point and Right for Margin %, then Back to Auto restores line, left', async () => {
    const user = userEvent.setup();
    render(<Held measures={measures} colourOf={() => '#123456'} />);
    const mark = screen.getByRole('radiogroup', { name: 'Margin % mark' });
    const axis = screen.getByRole('radiogroup', { name: 'Margin % axis' });

    expect(screen.queryByRole('button', { name: /Back to Auto for Margin %/ })).toBeNull();
    await user.click(within(mark).getByRole('radio', { name: 'Point' }));
    await user.click(within(axis).getByRole('radio', { name: 'Right' }));

    expect(optionsNow()).toEqual({ series: { [MARGIN]: { mark: 'point', axis: 'right' } } });
    const back = screen.getByRole('button', { name: 'Back to Auto for Margin %: line, left' });
    await user.click(back);
    expect(optionsNow()).toEqual({});
    expect(checked(within(mark).getByRole('radio', { name: 'Line' }))).toBe(true);
    expect(checked(within(axis).getByRole('radio', { name: 'Left' }))).toBe(true);
  });

  it('shows or hides each series, unsplit too (T855’s review)', async () => {
    const user = userEvent.setup();
    render(
      <Held
        measures={measures}
        colourOf={() => '#123456'}
        start={{ series: { [TARGET]: { hidden: true } } }}
      />,
    );
    const target = screen.getByRole('checkbox', { name: 'Show Revenue target' });

    expect(checked(target)).toBe(false);
    await user.click(target);
    expect(optionsNow()).toEqual({});
  });

  it("keeps a series' colour when its mark is set", async () => {
    const user = userEvent.setup();
    render(
      <Held
        measures={measures}
        colourOf={() => '#123456'}
        start={{ series: { [REVENUE]: { colour: '#aa0000' } } }}
      />,
    );

    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Revenue mark' })).getByRole('radio', {
        name: 'Area',
      }),
    );
    expect(optionsNow()).toEqual({
      series: { [REVENUE]: { colour: '#aa0000', mark: 'area' } },
    });
  });
});

describe('split by Region (AC-504)', () => {
  const two = [measures[0]!, measures[2]!];
  const split = {
    dimension: 'Region',
    members: ['EMEA', 'APAC', 'AMER', 'LATAM'].map((name) => ({ name, title: name })),
  };

  it('groups rows under each measure, its members with swatch, name and visibility', async () => {
    const user = userEvent.setup();
    render(<Held measures={two} colourOf={() => '#123456'} split={split} />);

    const revenue = screen.getByRole('group', { name: 'Revenue' });
    expect(
      within(revenue)
        .getAllByRole('radiogroup')
        .map((one) => one.ariaLabel),
    ).toEqual(['Revenue mark', 'Revenue axis']);
    const emea = within(revenue).getByRole('checkbox', { name: 'Show EMEA' });
    expect(checked(emea)).toBe(true);
    expect(within(revenue).getAllByRole('checkbox')).toHaveLength(4);
    // Its swatch is its colour, set as any series' is (AC-219).
    expect(within(revenue).getByLabelText('Colour of EMEA').getAttribute('type')).toBe('color');
    // The other measure shares them.
    expect(
      within(screen.getByRole('group', { name: 'Margin %' })).queryAllByRole('checkbox'),
    ).toHaveLength(0);

    await user.click(emea);
    expect(optionsNow()).toEqual({ series: { EMEA: { hidden: true } } });
  });

  it("disables Margin %'s Bar, which Revenue draws, saying why", () => {
    render(<Held measures={two} colourOf={() => '#123456'} split={split} />);
    const bar = within(screen.getByRole('radiogroup', { name: 'Margin % mark' })).getByRole(
      'radio',
      { name: 'Bar' },
    );

    expect((bar as HTMLInputElement).disabled).toBe(true);
    const described = bar.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(described)?.textContent).toBe(
      'Revenue draws bars. While the chart is split by Region, each measure needs its own mark.',
    );
    expect(bar.closest('label')?.getAttribute('title')).toBe(
      'Revenue draws bars. While the chart is split by Region, each measure needs its own mark.',
    );
  });

  it('never disables the mark a measure draws, though another chose it too (T855’s review)', () => {
    const both = { series: { [REVENUE]: { mark: 'line' }, [MARGIN]: { mark: 'line' } } };
    render(<Held measures={two} colourOf={() => '#123456'} split={split} start={both} />);
    const line = within(screen.getByRole('radiogroup', { name: 'Margin % mark' })).getByRole(
      'radio',
      { name: 'Line' },
    );

    expect(checked(line)).toBe(true);
    expect((line as HTMLInputElement).disabled).toBe(false);
  });

  it('enables every mark unsplit', () => {
    render(<Held measures={two} colourOf={() => '#123456'} />);
    const marks = within(screen.getByRole('radiogroup', { name: 'Margin % mark' })).getAllByRole(
      'radio',
    );

    expect(marks.every((one) => !(one as HTMLInputElement).disabled)).toBe(true);
  });
});
