import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/** A filter pill's summary button: `filter` is its group; left out, the bar's only filter. */
async function summaryOf(filter?: HTMLElement): Promise<HTMLElement> {
  return waitFor(() => {
    const scope = filter ?? screen.getByRole('region', { name: 'Filters' });
    const found = within(scope)
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('aria-expanded'));
    if (found.length !== 1 || found[0] === undefined)
      throw new Error(`Expected one filter, found ${String(found.length)}`);
    return found[0];
  });
}

/**
 * Opens a filter pill's popover, where its value control is (AC-187). A
 * popover already open is left open. While editing, a filter not yet
 * selected takes two presses: the first selects it (T468).
 */
export async function openFilter(filter?: HTMLElement): Promise<void> {
  const summary = await summaryOf(filter);
  if (summary.getAttribute('aria-expanded') === 'true') return;
  await userEvent.click(summary);
  if (summary.getAttribute('aria-expanded') !== 'true') await userEvent.click(summary);
}

/**
 * Selects a filter while editing, by a press on its pill: its field, scope
 * and Remove are then in the sidebar's Properties (T468, UX-031).
 */
export async function selectFilter(filter?: HTMLElement): Promise<void> {
  await userEvent.click(await summaryOf(filter));
}

/** The edit sidebar's Properties panel, where a selected filter's settings are (T468). */
export const properties = () => screen.getByRole('tabpanel', { name: 'Properties' });
