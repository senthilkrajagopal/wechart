import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FiltersToggle } from './FiltersToggle';

/**
 * T828 (AC-486; design 19 pin 6): the Filters toggle is a disclosure button —
 * the funnel, "Filters" and a chevron, `aria-expanded` saying whether the
 * sheet is open and `aria-controls` naming it. T831: the number of filters
 * set, its name and description, and "Details" with no filters at all.
 */
const NONE_SET = { set: 0, of: 5, names: [] } as const;
const FOUR_SET = {
  set: 4,
  of: 5,
  names: ['Ordered at', 'Country', 'Category', 'Product'],
} as const;
const NO_FILTERS = { set: 0, of: 0, names: [] } as const;

describe('the Filters toggle', () => {
  it('is a disclosure button naming the sheet it controls', () => {
    render(<FiltersToggle open={false} controls="sheet-1" summary={NONE_SET} onToggle={vi.fn()} />);

    const button = screen.getByRole('button', { name: /^Filters\b/ });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('sheet-1');
    expect(button.textContent).toBe('Filters');
    // The funnel before the label and the chevron after it, both for the eye.
    const icons = button.querySelectorAll('svg');
    expect(icons).toHaveLength(2);
    for (const icon of icons) expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(button.querySelector('.header-toggle__funnel')).not.toBeNull();
    expect(button.querySelector('.header-toggle__chevron')).not.toBeNull();
  });

  it('says it is expanded while the sheet is open', () => {
    render(<FiltersToggle open controls="sheet-1" summary={NONE_SET} onToggle={vi.fn()} />);

    const button = screen.getByRole('button', { name: /^Filters\b/ });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    // Drawn pressed on bg-subtle, its chevron turned up (design 19 screen 2
    // pin 1) — not `.pressed`, whose accent-soft is the change highlight's.
    expect(button.classList.contains('header-toggle--open')).toBe(true);
    expect(button.classList.contains('pressed')).toBe(false);
  });

  it('asks for the sheet to open or close when pressed', async () => {
    const onToggle = vi.fn();
    render(
      <FiltersToggle open={false} controls="sheet-1" summary={NONE_SET} onToggle={onToggle} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /^Filters\b/ }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows the number set, named "Filters, 4 set", with the set ones in its description and tooltip', () => {
    render(<FiltersToggle open={false} controls="sheet-1" summary={FOUR_SET} onToggle={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Filters, 4 set' });
    const said = '4 of 5 filters set: Ordered at, Country, Category, Product';
    expect(button).toHaveProperty('title', said);
    // Its description, read after its name and state (design 19 B3).
    const described = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(described?.textContent).toBe(said);
    // "Filters", then the count in its pill.
    expect(button.querySelector('.header-toggle__label')?.textContent).toBe('Filters');
    expect(button.querySelector('.header-toggle__count')?.textContent).toBe('4');
    expect(button.querySelector('.header-toggle__funnel')).not.toBeNull();
  });

  it('reads "Filters, none set" with no count while none is set', () => {
    render(<FiltersToggle open={false} controls="sheet-1" summary={NONE_SET} onToggle={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Filters, none set' });
    expect(button.querySelector('.header-toggle__count')).toBeNull();
    expect(button).toHaveProperty('title', '0 of 5 filters set');
    const described = document.getElementById(button.getAttribute('aria-describedby') ?? '');
    expect(described?.textContent).toBe('0 of 5 filters set');
  });

  it('reads "Details", with the info icon and no count, on a dashboard with no filters', () => {
    render(
      <FiltersToggle open={false} controls="sheet-1" summary={NO_FILTERS} onToggle={vi.fn()} />,
    );

    const button = screen.getByRole('button', { name: 'Details' });
    expect(button.textContent).toBe('Details');
    expect(button.querySelector('.header-toggle__info')).not.toBeNull();
    expect(button.querySelector('.header-toggle__funnel')).toBeNull();
    expect(button.querySelector('.header-toggle__count')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('sheet-1');
    expect(screen.queryByRole('button', { name: /^Filters/ })).toBeNull();
  });
});

/**
 * T839 (AC-493; design 19 states B2 and I; 19-Q6 "Highlight + announce
 * (Recommended)"; decision T8xx-1): when the number of filters set changes
 * while the sheet is closed, the toggle takes its changed state — the
 * `accent-soft` ground and a 1 px `accent` border — for 2 s, with reduced
 * motion too, since nothing moves.
 */
describe('the Filters toggle when its number changes', () => {
  const THREE = { set: 3, of: 5, names: ['Ordered at', 'Country', 'Category'] } as const;

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const toggleWith = (open: boolean, summary: typeof THREE | typeof FOUR_SET) => (
    <FiltersToggle open={open} controls="sheet-1" summary={summary} onToggle={vi.fn()} />
  );
  const changed = () =>
    screen.getByRole('button', { name: /^Filters\b/ }).classList.contains('header-toggle--changed');

  // The toggle reads no motion preference: these hold that nothing gates the
  // highlight on one. Its look under reduced motion is the CSS's, with no
  // transition to drop.
  for (const reduce of [false, true]) {
    it(`is highlighted for 2 s when the number goes from 3 to 4 with the sheet closed${reduce ? ', with reduced motion' : ''}`, () => {
      vi.useFakeTimers();
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('reduce') ? reduce : !reduce,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
      const view = render(toggleWith(false, THREE));
      expect(changed()).toBe(false);

      view.rerender(toggleWith(false, FOUR_SET));
      expect(changed()).toBe(true);
      expect(screen.getByRole('button', { name: 'Filters, 4 set' })).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(1800);
      });
      expect(changed()).toBe(true);
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(changed()).toBe(false);
    });
  }

  it('starts its 2 s again on a second change', () => {
    vi.useFakeTimers();
    const view = render(toggleWith(false, THREE));
    view.rerender(toggleWith(false, FOUR_SET));
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    view.rerender(toggleWith(false, THREE));
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(changed()).toBe(true);
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(changed()).toBe(false);
  });

  it('ends when the sheet opens, where the bar shows the change itself (T839-1)', () => {
    vi.useFakeTimers();
    const view = render(toggleWith(false, THREE));
    view.rerender(toggleWith(false, FOUR_SET));
    expect(changed()).toBe(true);
    view.rerender(toggleWith(true, FOUR_SET));
    expect(changed()).toBe(false);
    view.rerender(toggleWith(false, FOUR_SET));
    expect(changed()).toBe(false);
  });

  it('is not highlighted by a render with the same number, nor by a change with the sheet open', () => {
    vi.useFakeTimers();
    const view = render(toggleWith(false, THREE));
    view.rerender(toggleWith(false, { ...THREE, names: [...THREE.names] }));
    expect(changed()).toBe(false);

    view.rerender(toggleWith(true, THREE));
    view.rerender(toggleWith(true, FOUR_SET));
    expect(changed()).toBe(false);
    // Closed again with the same number: nothing changed while it was closed.
    view.rerender(toggleWith(false, FOUR_SET));
    expect(changed()).toBe(false);
  });
});
