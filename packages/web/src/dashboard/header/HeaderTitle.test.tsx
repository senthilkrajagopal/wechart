import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HeaderTitle } from './HeaderTitle';

/**
 * T830 (AC-485; design 19 pin 2, state G): the title is the page's `h1`, its
 * whole text in its tooltip and accessible name however the row cuts it, and
 * it says when the row has cut it, for the sheet to show it whole.
 */
const LONG =
  'Quarterly revenue, margin and fulfilment review for the EMEA regional leads, with returns';

/** The h1's widths as a browser would lay them out: jsdom lays out nothing. */
function laidOut(scrollWidth: number, clientWidth: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the title', () => {
  it('is the h1, its whole text its name and tooltip', () => {
    render(<HeaderTitle title={LONG} editing={false} onCut={vi.fn()} />);

    const heading = screen.getByRole('heading', { level: 1, name: LONG });
    expect(heading.getAttribute('title')).toBe(LONG);
  });

  it('says it is cut when the row has no room for it', () => {
    laidOut(900, 300);
    const onCut = vi.fn();
    render(<HeaderTitle title={LONG} editing={false} onCut={onCut} />);

    expect(onCut).toHaveBeenLastCalledWith(true);
  });

  it('says it is whole when it fits', () => {
    laidOut(120, 120);
    const onCut = vi.fn();
    render(<HeaderTitle title="Sales" editing={false} onCut={onCut} />);

    expect(onCut).toHaveBeenLastCalledWith(false);
  });

  it('reads "Editing" before its name for the eye only, while editing', () => {
    render(<HeaderTitle title="Sales" editing onCut={vi.fn()} />);

    const heading = screen.getByRole('heading', { level: 1, name: 'Sales' });
    expect(heading.textContent).toBe('Editing Sales');
    expect(heading.getAttribute('title')).toBe('Sales');
  });
});
