import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PageMenu } from './PageMenu';

/**
 * T842 (AC-495; design 19 states D2 and D3): below 1,024 px, the pages are a
 * "Page: ‹name› ▾" menu button, listing each page with the open one checked;
 * choosing another opens it. With one page there is no menu.
 */
describe('PageMenu', () => {
  const pages = [
    { id: 'p1', title: 'Overview' },
    { id: 'p2', title: 'By country' },
  ];

  it('reads "Page: ‹name›" with its chevron, a menu button', () => {
    render(<PageMenu pages={pages} openId="p1" onOpen={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Page: Overview' });
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.textContent).toBe('Page: Overview');
    expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('lists both pages, the open one checked, and choosing the other opens it', async () => {
    const onOpen = vi.fn();
    render(<PageMenu pages={pages} openId="p1" onOpen={onOpen} />);

    await userEvent.click(screen.getByRole('button', { name: 'Page: Overview' }));
    const menu = screen.getByRole('menu', { name: 'Page: Overview' });
    const items = within(menu).getAllByRole('menuitemradio');
    // In order, each by its page's title; the checked one drawn with the
    // menu's ✓ as well (T689).
    expect(items.map((item) => item.textContent)).toEqual(['✓Overview', 'By country']);
    expect(items.map((item) => item.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(within(menu).getByRole('menuitemradio', { name: 'Overview' })).toBe(items[0]);

    await userEvent.click(within(menu).getByRole('menuitemradio', { name: 'By country' }));

    expect(onOpen).toHaveBeenCalledExactlyOnceWith('p2');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('with one page, is nothing', () => {
    const { container } = render(
      <PageMenu pages={[{ id: 'p1', title: 'Overview' }]} openId="p1" onOpen={vi.fn()} />,
    );

    expect(container.innerHTML).toBe('');
  });
});
