import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TableScroll } from './TableScroll';

/**
 * T396, AC-304: below 1,024 px a workspace's table wider than the screen
 * scrolls sideways in its own box, and the page doesn't (the stylesheet
 * gives the box its scroll there; `e2e/shell.spec.ts` measures it). Where it
 * can scroll it is a named region the keyboard reaches, as a scrolling box
 * must be; wider it is a plain box, no extra tab stop or landmark.
 */
function narrow(is: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: is && query.includes('max-width: 1023.98px'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a table’s own sideways scroll (T396, AC-304)', () => {
  it('is a named region the keyboard reaches below 1,024 px', () => {
    narrow(true);
    render(
      <TableScroll label="Access policies">
        <table aria-label="Access policies">
          <tbody>
            <tr>
              <td>orders</td>
            </tr>
          </tbody>
        </table>
      </TableScroll>,
    );

    const region = screen.getByRole('region', { name: 'Access policies' });
    expect(region.tabIndex).toBe(0);
    expect(region.className).toBe('table-scroll-narrow');
    // The table keeps its own role inside it.
    expect(screen.getByRole('table', { name: 'Access policies' })).toBeTruthy();
  });

  it('is a plain box, no tab stop or landmark, when the window is wider', () => {
    narrow(false);
    const { container } = render(
      <TableScroll label="Access policies">
        <table aria-label="Access policies" />
      </TableScroll>,
    );

    expect(screen.queryByRole('region')).toBeNull();
    const box = container.querySelector('.table-scroll-narrow');
    expect(box?.hasAttribute('tabindex')).toBe(false);
  });
});
