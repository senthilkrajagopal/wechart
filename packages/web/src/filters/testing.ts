import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { openHeaderSheet } from '../dashboard/header/testing';

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
  // The bar is in the header sheet, opened first (T828).
  await openHeaderSheet();
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
  await openHeaderSheet();
  await userEvent.click(await summaryOf(filter));
}

/** The edit sidebar's Properties panel, where a selected filter's settings are (T468). */
export const properties = () => screen.getByRole('tabpanel', { name: 'Properties' });

/** A filter's "Filter on" button, design 10's grouped picker (T633), in `scope`. */
export const fieldButton = (scope: HTMLElement) =>
  within(scope).getByRole('button', { name: /^Filter on\b/ });

/** The fields "Filter on" offers, by name, its list opened; closed again after. */
export async function fieldsOffered(scope: HTMLElement): Promise<string[]> {
  await userEvent.click(fieldButton(scope));
  const list = await screen.findByRole('listbox', { name: 'Fields' });
  const names = [...list.querySelectorAll<HTMLElement>('[role="option"][data-member]')].map(
    (option) => option.dataset['member'] ?? '',
  );
  await userEvent.keyboard('{Escape}');
  return names;
}

/** Picks `member` as the filter's field from "Filter on", or none with ''. */
export async function pickField(scope: HTMLElement, member: string): Promise<void> {
  await userEvent.click(fieldButton(scope));
  const list = await screen.findByRole('listbox', { name: 'Fields' });
  const option = await waitFor(() => {
    const found = list.querySelector<HTMLElement>(
      member === '' ? '[data-none]' : `[data-member="${CSS.escape(member)}"]`,
    );
    if (found === null) throw new Error(`No field ${member} offered`);
    return found;
  });
  await userEvent.click(option);
}
