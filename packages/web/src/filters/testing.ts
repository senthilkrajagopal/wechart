import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Opens a filter pill's popover, where its control — and, while editing, its
 * field and scope — are (AC-187). `filter` is the filter's group; left out,
 * the filter bar's only filter. A popover already open is left open.
 */
export async function openFilter(filter?: HTMLElement): Promise<void> {
  const summary = await waitFor(() => {
    const scope = filter ?? screen.getByRole('region', { name: 'Filters' });
    const found = within(scope)
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('aria-expanded'));
    if (found.length !== 1 || found[0] === undefined)
      throw new Error(`Expected one filter, found ${String(found.length)}`);
    return found[0];
  });
  if (summary.getAttribute('aria-expanded') !== 'true') await userEvent.click(summary);
}
