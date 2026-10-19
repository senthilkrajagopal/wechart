/**
 * T857 (AC-497, AC-500): in the chart editor only, each combo legend entry's
 * glyph is a 20 px button, named as the Metrics pill's is, opening the same
 * menu; a pointer over it emphasises its series' axis.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { LegendGlyphButtons } from './LegendGlyphButtons';

const REVENUE = 'orders.revenue';
const TARGET = 'orders.target';
const MARGIN = 'orders.margin_pct';
const measures = [
  { measure: REVENUE, title: 'Revenue' },
  { measure: TARGET, title: 'Revenue target' },
  { measure: MARGIN, title: 'Margin %' },
];
/** A glyph centred at x, y, its entry running 60 px right of it. */
const glyph = (name: string, x: number, y: number) => ({
  name,
  x,
  y,
  entry: { left: x - 6, top: y - 6, right: x + 60, bottom: y + 6 },
});
const glyphs = [glyph(REVENUE, 9, 12.5), glyph(TARGET, 82, 12.5), glyph(MARGIN, 140, 12.5)];

function Legend({
  emphasise = vi.fn(),
  onFormat = vi.fn(),
  onRemove = vi.fn(),
}: {
  emphasise?: (name: string | undefined) => void;
  onFormat?: (measure: string) => void;
  onRemove?: (measure: string) => void;
}) {
  const [options, setOptions] = useState<Record<string, unknown>>({
    series: { [MARGIN]: { mark: 'point', axis: 'right' } },
  });
  return (
    <>
      <LegendGlyphButtons
        glyphs={glyphs}
        emphasise={emphasise}
        measures={measures}
        options={options}
        onOptions={(patch) => setOptions((current) => ({ ...current, ...patch }))}
        onFormat={onFormat}
        onRemove={onRemove}
      />
      <output data-testid="options">{JSON.stringify(options)}</output>
    </>
  );
}

describe("the combo legend's glyph buttons (T857)", () => {
  it('names each entry’s button by its series’ mark and axis', () => {
    render(<Legend />);

    expect(
      screen
        .getAllByRole('button')
        .filter((button) => button.closest('[data-testid="legend-glyph"]') !== null)
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      'Revenue: bar, left axis. Change mark or axis',
      'Revenue target: line, left axis. Change mark or axis',
      'Margin %: point, right axis. Change mark or axis',
    ]);
    for (const name of [
      'Revenue: bar, left axis. Change mark or axis',
      'Revenue target: line, left axis. Change mark or axis',
      'Margin %: point, right axis. Change mark or axis',
    ]) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-haspopup')).toBe('menu');
    }
  });

  it('centres a 20 px button on each glyph', () => {
    render(<Legend />);
    const button = screen.getByRole('button', {
      name: 'Revenue target: line, left axis. Change mark or axis',
    });
    const place = button.closest<HTMLElement>('[data-testid="legend-glyph"]');

    expect(place?.style.left).toBe('72px');
    expect(place?.style.top).toBe('2.5px');
    expect(place?.style.width).toBe('20px');
    expect(place?.style.height).toBe('20px');
  });

  it('opens the pill’s menu: choosing Point draws Revenue target as points, and renames its button', async () => {
    const user = userEvent.setup();
    render(<Legend />);

    await user.click(
      screen.getByRole('button', { name: 'Revenue target: line, left axis. Change mark or axis' }),
    );
    expect(
      screen.getByRole('menuitemradio', { name: 'Line' }).getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent?.trim() ?? ''),
    ).toEqual(['Back to Auto (line, left)', 'Format…', 'Remove']);
    expect(screen.getByRole('menuitem', { name: 'Format…' }).tagName).toBe('BUTTON');
    expect(screen.getByRole('menuitem', { name: 'Remove' }).tagName).toBe('BUTTON');
    await user.click(screen.getByRole('menuitemradio', { name: 'Point' }));

    expect(JSON.parse(screen.getByTestId('options').textContent ?? '{}')).toEqual({
      series: { [MARGIN]: { mark: 'point', axis: 'right' }, [TARGET]: { mark: 'point' } },
    });
    expect(
      screen
        .getByRole('button', { name: 'Revenue target: point, left axis. Change mark or axis' })
        .closest('[data-testid="legend-glyph"]')
        ?.getAttribute('class'),
    ).toBe('legend-glyph');
  });

  it('Format… and Remove act on the entry’s measure', async () => {
    const user = userEvent.setup();
    const onFormat = vi.fn();
    const onRemove = vi.fn();
    render(<Legend onFormat={onFormat} onRemove={onRemove} />);
    const open = () =>
      user.click(
        screen.getByRole('button', { name: 'Margin %: point, right axis. Change mark or axis' }),
      );

    await open();
    await user.click(screen.getByRole('menuitem', { name: 'Format…' }));
    expect(onFormat).toHaveBeenCalledWith(MARGIN);
    await open();
    await user.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledWith(MARGIN);
  });

  it('emphasises the series’ axis while the pointer is over its glyph (AC-500)', async () => {
    const user = userEvent.setup();
    const emphasise = vi.fn();
    render(<Legend emphasise={emphasise} />);
    const button = screen.getByRole('button', {
      name: 'Margin %: point, right axis. Change mark or axis',
    });

    await user.hover(button);
    expect(emphasise).toHaveBeenLastCalledWith(MARGIN);
    await user.unhover(button);
    expect(emphasise).toHaveBeenLastCalledWith(undefined);
  });

  it('gives an entry that is no measure, a split’s member, no button', () => {
    render(
      <LegendGlyphButtons
        glyphs={[glyph('North', 9, 12)]}
        emphasise={vi.fn()}
        measures={measures}
        options={{}}
        onOptions={vi.fn()}
        onFormat={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });
});
