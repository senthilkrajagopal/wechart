import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PageTabsMore } from './PageTabsMore';

/**
 * T837 (AC-492; design 19 state D1): "More ▾" after the inline page tabs, a
 * menu button listing the pages that don't fit, in order; choosing one opens
 * that page.
 */
describe('PageTabsMore', () => {
  const pages = [
    { id: 'p4', title: 'Returns' },
    { id: 'p5', title: 'Shipping' },
    { id: 'p8', title: 'Appendix' },
  ];

  it('reads "More" with its chevron, a menu button named for the pages', () => {
    render(<PageTabsMore pages={pages} onOpen={vi.fn()} />);

    const more = screen.getByRole('button', { name: 'More pages' });
    expect(more.getAttribute('aria-haspopup')).toBe('menu');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(more.textContent).toBe('More');
    expect(more.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('lists the rest in order, and choosing one opens that page', async () => {
    const onOpen = vi.fn();
    render(<PageTabsMore pages={pages} onOpen={onOpen} />);

    await userEvent.click(screen.getByRole('button', { name: 'More pages' }));
    const menu = screen.getByRole('menu', { name: 'More pages' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Returns', 'Shipping', 'Appendix']);

    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Shipping' }));

    expect(onOpen).toHaveBeenCalledExactlyOnceWith('p5');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
