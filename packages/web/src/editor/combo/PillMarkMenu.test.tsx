import { emptySpec } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Wells } from '../Wells';
import type { Member } from '../fields';
import { SeriesRows } from './SeriesRows';

/**
 * T856 (AC-497; design 20 screen 2 pin 2): a combo's Metrics pill starts with
 * its mark's glyph, a button opening its menu, and ends with an L or R tag
 * before ×. The menu holds Draw as (Bar, Line, Area, Point) and Axis (Left,
 * Right) as groups of `menuitemradio`, the current ones checked, then Back to
 * Auto, Format… and Remove. It writes the options Customize › Series reads,
 * so the two always agree; Esc returns focus to the pill.
 */
const REVENUE = 'orders.revenue';
const MARGIN = 'orders.margin_pct';

const member = (name: string, title: string): Member => ({
  name,
  title: `Orders ${title}`,
  shortTitle: title,
  kind: 'measure',
  type: 'number',
  cube: 'orders',
  aggType: 'sum',
});
const available = [member(REVENUE, 'Revenue'), member(MARGIN, 'Margin %')];
const measures = [
  { measure: REVENUE, title: 'Revenue' },
  { measure: MARGIN, title: 'Margin %' },
];

/** The wells and Customize › Series over one set of options, as the editor holds them. */
function Editor({
  start = {},
  split,
  onFormat = vi.fn(),
  onRemove = vi.fn(),
}: {
  start?: Record<string, unknown>;
  split?: boolean;
  onFormat?: (member: string) => void;
  onRemove?: (well: string, member: string) => void;
}) {
  const [options, setOptions] = useState<Record<string, unknown>>(start);
  const onOptions = (patch: Readonly<Record<string, unknown>>) =>
    setOptions((current) => {
      const next: Record<string, unknown> = { ...current, ...patch };
      for (const [key, value] of Object.entries(patch)) if (value === undefined) delete next[key];
      return next;
    });
  // Split by Region as the editor says it (`combo.split`); the wells
  // themselves don't read the split from the spec.
  const spec = { ...emptySpec('orders'), measures: [REVENUE, MARGIN] };
  return (
    <>
      <Wells
        spec={spec}
        available={available}
        onAdd={vi.fn()}
        onRemove={onRemove}
        combo={{
          options,
          onOptions,
          onFormat,
          ...(split === true ? { split: { dimension: 'Region' } } : {}),
        }}
      />
      <SeriesRows
        measures={measures}
        options={options}
        onOptions={onOptions}
        colourOf={() => '#123456'}
        {...(split === true ? { split: { dimension: 'Region', members: [] } } : {})}
      />
    </>
  );
}

const pill = (measure: string) => screen.getByTestId(`in-measures-${measure}`);
const opener = (measure: string) =>
  within(pill(measure)).getByRole('button', { name: /Change mark or axis$/ });

describe('a combo’s Metrics pill (AC-497)', () => {
  it('starts with its mark’s glyph, a button named for its mark and axis, and ends with L before ×', () => {
    render(<Editor />);

    const button = opener(MARGIN);
    expect(button.getAttribute('aria-label')).toBe(
      'Margin %: line, left axis. Change mark or axis',
    );
    expect(button.querySelector('svg')).not.toBeNull();
    // First in the pill, before its name.
    expect(pill(MARGIN).firstElementChild?.contains(button)).toBe(true);
    const tag = within(pill(MARGIN)).getByTestId('pill-axis');
    expect(tag.textContent).toBe('L');
    expect(tag.nextElementSibling?.textContent).toBe('×');
  });

  it('opens a menu of Draw as and Axis radio groups, the current ones checked, then Back to Auto, Format… and Remove', async () => {
    render(<Editor />);
    await userEvent.click(opener(MARGIN));

    const menu = screen.getByRole('menu');
    const drawAs = within(menu).getByRole('group', { name: 'Draw as' });
    const axis = within(menu).getByRole('group', { name: 'Axis' });
    const radios = (group: HTMLElement) =>
      within(group)
        .getAllByRole('menuitemradio')
        .map((one) => [one.textContent?.replace('✓', ''), one.getAttribute('aria-checked')]);
    expect(radios(drawAs)).toEqual([
      ['Bar', 'false'],
      ['Line', 'true'],
      ['Area', 'false'],
      ['Point', 'false'],
    ]);
    expect(radios(axis)).toEqual([
      ['Left', 'true'],
      ['Right', 'false'],
    ]);
    // Then the three actions, in order, outside the groups.
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((one) => one.textContent),
    ).toEqual(['Back to Auto (line, left)', 'Format…', 'Remove']);
  });

  it('puts Margin % on the right from the menu: an R tag before ×, and Customize › Series shows Right', async () => {
    render(<Editor />);
    await userEvent.click(opener(MARGIN));
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Right' }));

    const tag = within(pill(MARGIN)).getByTestId('pill-axis');
    expect(tag.textContent).toBe('R');
    expect(tag.nextElementSibling?.textContent).toBe('×');
    const rowAxis = screen.getByRole('radiogroup', { name: 'Margin % axis' });
    expect(
      (within(rowAxis).getByRole('radio', { name: 'Right' }) as HTMLInputElement).checked,
    ).toBe(true);
    // And back: focus is on the pill's button once the menu closes.
    expect(document.activeElement).toBe(opener(MARGIN));
    expect(opener(MARGIN).getAttribute('aria-label')).toBe(
      'Margin %: line, right axis. Change mark or axis',
    );
  });

  it('shows a mark chosen in Customize › Series on the pill, and Back to Auto restores both', async () => {
    render(<Editor />);
    const rowMark = screen.getByRole('radiogroup', { name: 'Margin % mark' });
    await userEvent.click(within(rowMark).getByRole('radio', { name: 'Point' }));

    expect(opener(MARGIN).getAttribute('aria-label')).toBe(
      'Margin %: point, left axis. Change mark or axis',
    );
    await userEvent.click(opener(MARGIN));
    expect(screen.getByRole('menuitemradio', { name: 'Point' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Back to Auto (line, left)' }));

    expect(opener(MARGIN).getAttribute('aria-label')).toBe(
      'Margin %: line, left axis. Change mark or axis',
    );
    expect((within(rowMark).getByRole('radio', { name: 'Line' }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it('offers Back to Auto disabled while the series is on Auto', async () => {
    render(<Editor />);
    await userEvent.click(opener(REVENUE));

    const back = screen.getByRole('menuitem', { name: 'Back to Auto (bar, left)' });
    expect(back.getAttribute('aria-disabled')).toBe('true');
    expect(back.getAttribute('title')).toBe('Revenue is on Auto.');
  });

  it('opens Format… for that measure, and Remove takes it out of Metrics', async () => {
    const onFormat = vi.fn();
    const onRemove = vi.fn();
    render(<Editor onFormat={onFormat} onRemove={onRemove} />);

    await userEvent.click(opener(MARGIN));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Format…' }));
    expect(onFormat).toHaveBeenCalledWith(MARGIN);

    await userEvent.click(opener(MARGIN));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledWith('measures', MARGIN);
  });

  it('returns focus to the pill on Esc', async () => {
    render(<Editor />);
    await userEvent.click(opener(MARGIN));
    expect(screen.getByRole('menu')).toBeTruthy();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(opener(MARGIN));
  });

  it('while split, disables a mark another measure draws, saying why', async () => {
    render(<Editor split />);
    await userEvent.click(opener(MARGIN));

    const bar = screen.getByRole('menuitemradio', { name: /^Bar/ });
    expect(bar.getAttribute('aria-disabled')).toBe('true');
    expect(bar.getAttribute('title')).toBe(
      'Revenue draws bars. While the chart is split by Region, each measure needs its own mark.',
    );
    await userEvent.click(bar);
    expect(opener(MARGIN).getAttribute('aria-label')).toBe(
      'Margin %: line, left axis. Change mark or axis',
    );
  });

  it('gives a pill no glyph or axis tag outside a combo', () => {
    render(
      <Wells
        spec={{ ...emptySpec('orders'), measures: [REVENUE, MARGIN] }}
        available={available}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(within(pill(MARGIN)).queryByRole('button', { name: /Change mark or axis$/ })).toBeNull();
    expect(within(pill(MARGIN)).queryByTestId('pill-axis')).toBeNull();
  });
});
