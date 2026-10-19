/**
 * T858 (AC-219, AC-499, AC-502): a combo's Customize › Axes. The Left axis
 * group, and the Right axis group only while a series is on the right, each
 * headed with its measures and unit; the right has no gridlines of its own;
 * include zero locked with its reason while a series draws bars; and log
 * scale on both axes at once, or unavailable while bars are drawn.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { CustomizeTab } from './CustomizeTab';

const REVENUE = 'orders.revenue';
const TARGET = 'orders.target';
const MARGIN = 'orders.margin_pct';
const measures = [
  { measure: REVENUE, title: 'Revenue' },
  { measure: TARGET, title: 'Revenue target' },
  { measure: MARGIN, title: 'Margin %' },
];
const formats = { [REVENUE]: 'currency', [TARGET]: 'currency', [MARGIN]: 'percent' };
const MARGIN_RIGHT = { [MARGIN]: { mark: 'line', axis: 'right' } };
const LINES = { [REVENUE]: { mark: 'line' }, ...MARGIN_RIGHT };

/** Customize over options held as the editor holds them. */
function Held({ start }: { start: Record<string, unknown> }) {
  const [options, setOptions] = useState<Record<string, unknown>>(start);
  return (
    <>
      <CustomizeTab
        options={options}
        onOptions={(patch) =>
          setOptions((current) => {
            const next: Record<string, unknown> = { ...current, ...patch };
            for (const [key, value] of Object.entries(patch))
              if (value === undefined) delete next[key];
            return next;
          })
        }
        cartesian
        valueAxes={['y']}
        drawn
        stackable
        series={measures.map((one) => ({ name: one.measure, title: one.title }))}
        colourOf={() => '#123456'}
        combo={{ measures, formats }}
      />
      <output data-testid="options">{JSON.stringify(options)}</output>
    </>
  );
}

const group = (name: RegExp) => screen.getByRole('group', { name });
const options = () => JSON.parse(screen.getByTestId('options').textContent ?? '{}') as unknown;

describe("a combo's Customize › Axes (T858)", () => {
  it('has a Left axis group and no Right group or Synchronize while every series is on the left', () => {
    render(<Held start={{}} />);

    expect(within(group(/^Left axis/)).getByText('Revenue · Revenue target · Margin % · $')).toBeTruthy();
    expect(screen.queryByRole('group', { name: /^Right axis/ })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Synchronize axes' })).toBeNull();
  });

  it('adds the Right axis group, listing Margin % · %, with no gridlines field', () => {
    render(<Held start={{ series: MARGIN_RIGHT }} />);
    const right = group(/^Right axis/);

    expect(within(right).getByText('Margin % · %')).toBeTruthy();
    expect(within(group(/^Left axis/)).getByText('Revenue · Revenue target · $')).toBeTruthy();
    expect(within(right).queryByRole('checkbox', { name: 'Gridlines' })).toBeNull();
    expect(within(group(/^Left axis/)).getByRole('checkbox', { name: 'Gridlines' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Synchronize axes' })).toBeTruthy();
  });

  it('locks include zero on, saying why, while Revenue draws bars', () => {
    render(<Held start={{ series: MARGIN_RIGHT }} />);

    for (const side of [/^Left axis/, /^Right axis/]) {
      const zero = within(group(side)).getByRole('checkbox', {
        name: 'Include zero · on, because Revenue draws bars',
      }) as HTMLInputElement;
      expect(zero.checked).toBe(true);
      expect(zero.disabled).toBe(true);
    }
  });

  it('leaves include zero to the author with lines only', () => {
    render(<Held start={{ series: LINES }} />);

    const zero = within(group(/^Left axis/)).getByRole('checkbox', {
      name: 'Include zero',
    }) as HTMLInputElement;
    expect(zero.disabled).toBe(false);
  });

  it('turns log on for both axes from one, says so on both, and announces it', async () => {
    render(<Held start={{ series: LINES }} />);

    await userEvent.click(
      within(group(/^Right axis/)).getByRole('checkbox', { name: 'Logarithmic scale' }),
    );

    expect(options()).toEqual({
      series: LINES,
      axes: { y: { log: true }, right: { log: true } },
    });
    for (const side of [/^Left axis/, /^Right axis/]) {
      const log = within(group(side)).getByRole('checkbox', {
        name: 'Log scale · on for both axes, so their ticks align',
      }) as HTMLInputElement;
      expect(log.checked).toBe(true);
    }
    const said = screen.getByTestId('axes-announcement');
    expect(said.getAttribute('aria-live')).toBe('polite');
    expect(said.textContent).toBe('Log scale on for both axes');
  });

  it('makes log unavailable on both while Revenue draws bars, saying why', () => {
    render(<Held start={{ series: MARGIN_RIGHT }} />);

    for (const side of [/^Left axis/, /^Right axis/]) {
      const log = within(group(side)).getByRole('checkbox', {
        name: 'Log scale · unavailable: Revenue draws bars, which need a zero baseline',
      }) as HTMLInputElement;
      expect(log.disabled).toBe(true);
      expect(log.checked).toBe(false);
    }
  });

  it('makes the Right group’s Min, Max and Log follow the left’s while synchronized', () => {
    const synchronized = {
      series: { [TARGET]: { mark: 'line', axis: 'right' } },
      combo: { synchronize: true },
    };
    render(<Held start={synchronized} />);
    const right = group(/^Right axis/);

    expect((within(right).getByRole('spinbutton', { name: 'Minimum' }) as HTMLInputElement).disabled).toBe(true);
    expect((within(right).getByRole('spinbutton', { name: 'Maximum' }) as HTMLInputElement).disabled).toBe(true);
    expect(within(right).getByText('Min, Max and Log follow the left axis')).toBeTruthy();
    expect(
      (within(group(/^Left axis/)).getByRole('spinbutton', { name: 'Minimum' }) as HTMLInputElement)
        .disabled,
    ).toBe(false);
  });

  it('writes the Right group’s settings to the right axis', async () => {
    render(<Held start={{ series: MARGIN_RIGHT }} />);

    await userEvent.type(within(group(/^Right axis/)).getByRole('textbox', { name: 'Title' }), 'Share');

    expect(options()).toEqual({ series: MARGIN_RIGHT, axes: { right: { title: 'Share' } } });
  });
});
