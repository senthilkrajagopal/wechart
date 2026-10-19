import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { describeElement, ElementTooltip } from './ElementTooltip';

/**
 * T888 / AC-524: WHILE a dashboard is in view mode, … each value SHALL be
 * focusable and, on hover or focus, for every viewer, take a dotted
 * `text-muted` underline and show a tooltip naming its kind and measure,
 * what it compares, the filters in effect (the tile's and its own), the
 * marking it follows, and the data's age with whether a pre-aggregation
 * answered, which SHALL also be its accessible description.
 * `Fails when: … it can't take focus; or the tooltip, on hover or focus,
 * lacks one of its parts, or isn't the value's accessible description.`
 *
 * The sizes, the weight and the underline are the browser's to compute:
 * `e2e/text-tile.spec.ts`.
 */
const NOW = new Date(2026, 9, 18, 16, 30);
const AT = new Date(2026, 9, 18, 14, 5);

describe('what a value’s tooltip says (T888, AC-524)', () => {
  it('names a Change’s kind and measure, what it compares, its filters, marking and data', () => {
    expect(
      describeElement({
        kind: 'change',
        measure: 'Revenue',
        period: 'quarter',
        filters: ['Ordered at 2026', 'Country Germany, France', 'Category Beverages'],
        marking: undefined,
        data: { at: AT, preAggregation: 'orders_by_month' },
        now: NOW,
      }),
    ).toEqual([
      'Change · Revenue',
      'This quarter against the previous',
      'Filters: Ordered at 2026 · Country Germany, France · Category Beverages',
      'Marking: none',
      'Data: as of 14:05 · pre-aggregation',
    ]);
  });

  it('names a Value’s marking, no filters, and a database answer', () => {
    expect(
      describeElement({
        kind: 'value',
        measure: 'Revenue',
        filters: [],
        marking: 'Picks',
        data: { at: AT },
        now: NOW,
      }),
    ).toEqual([
      'Value · Revenue',
      'Filters: none',
      'Marking: Picks',
      'Data: as of 14:05 · database',
    ]);
  });

  it('says a Change compares months where it names no period, and data not yet in', () => {
    expect(describeElement({ kind: 'change', measure: 'Orders', filters: [], now: NOW })).toEqual([
      'Change · Orders',
      'This month against the previous',
      'Filters: none',
      'Marking: none',
      'Data: not yet answered',
    ]);
  });
});

describe('a value in view mode (T888, AC-524)', () => {
  const LINES = ['Change · Revenue', 'This quarter against the previous', 'Marking: none'];

  function shown() {
    render(
      <>
        <button type="button">Before</button>
        <p>
          Revenue{' '}
          <ElementTooltip lines={LINES}>
            <span className="text-change">▲ 4.2%</span>
          </ElementTooltip>
        </p>
      </>,
    );
    return screen.getByText('▲ 4.2%').closest('.text-element-read') as HTMLElement;
  }

  it('is reached by Tab, and on focus shows its tooltip, which is its description', async () => {
    const value = shown();
    const tooltip = screen.getByRole('tooltip', { hidden: true });
    expect(tooltip.hidden).toBe(true);
    screen.getByRole('button', { name: 'Before' }).focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(value);
    expect(tooltip.hidden).toBe(false);
    expect(tooltip.textContent).toBe(LINES.join(' '));
    expect(value.getAttribute('aria-describedby')).toBe(tooltip.id);
    expect([...tooltip.children].map((line) => line.textContent)).toEqual(LINES);
    await userEvent.tab();
    expect(tooltip.hidden).toBe(true);
  });

  it('shows it on hover, for every viewer, and Esc hides it', () => {
    const value = shown();
    const tooltip = screen.getByRole('tooltip', { hidden: true });
    fireEvent.mouseEnter(value);
    expect(tooltip.hidden).toBe(false);
    fireEvent.mouseLeave(value);
    expect(tooltip.hidden).toBe(true);
    act(() => {
      value.focus();
    });
    expect(tooltip.hidden).toBe(false);
    fireEvent.keyDown(value, { key: 'Escape' });
    expect(tooltip.hidden).toBe(true);
  });
});
