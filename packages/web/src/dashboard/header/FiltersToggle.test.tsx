import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FiltersToggle } from './FiltersToggle';

/**
 * T828 (AC-486; design 19 pin 6): the Filters toggle is a disclosure button —
 * the funnel, "Filters" and a chevron, `aria-expanded` saying whether the
 * sheet is open and `aria-controls` naming it. The count is T831's.
 */
describe('the Filters toggle', () => {
  it('is a disclosure button naming the sheet it controls', () => {
    render(<FiltersToggle open={false} controls="sheet-1" onToggle={vi.fn()} />);

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
    render(<FiltersToggle open controls="sheet-1" onToggle={vi.fn()} />);

    const button = screen.getByRole('button', { name: /^Filters\b/ });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    // Drawn pressed on bg-subtle, its chevron turned up (design 19 screen 2
    // pin 1) — not `.pressed`, whose accent-soft is the change highlight's.
    expect(button.classList.contains('header-toggle--open')).toBe(true);
    expect(button.classList.contains('pressed')).toBe(false);
  });

  it('asks for the sheet to open or close when pressed', async () => {
    const onToggle = vi.fn();
    render(<FiltersToggle open={false} controls="sheet-1" onToggle={onToggle} />);

    await userEvent.click(screen.getByRole('button', { name: /^Filters\b/ }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
