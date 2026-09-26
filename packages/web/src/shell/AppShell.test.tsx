import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AppShell } from './AppShell';
import { ThemeProvider } from './ThemeProvider';

/**
 * The shell carries a theme control and a search palette, so it renders inside
 * both providers — the same pair main.tsx wraps the app in.
 */
const renderShell = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider initial="light">{ui}</ThemeProvider>
    </QueryClientProvider>,
  );
};

/**
 * AC-001: WHEN the application loads, THE SYSTEM SHALL show a top bar whose
 * workspace switcher lists exactly Explore, Model, Data sources, Jobs,
 * Schedules and Security.
 */
describe('app shell (AC-001)', () => {
  it('shows a top bar carrying the workspace switcher', () => {
    renderShell(<AppShell workspace="explore" />);

    const bar = screen.getByRole('banner');
    const switcher = within(bar).getByRole('navigation', { name: /workspace/i });

    expect(within(switcher).getAllByRole('link')).toHaveLength(6);
  });

  it('renders the workspace content in a main landmark', () => {
    renderShell(
      <AppShell workspace="model">
        <p>model workspace</p>
      </AppShell>,
    );

    expect(within(screen.getByRole('main')).getByText('model workspace')).toBeTruthy();
  });
});

/**
 * T396, AC-304: below 1,024 px the bar's navigation and search are folded
 * into a menu (the stylesheet hides the bar's own and shows the menu's
 * button; `e2e/shell.spec.ts` checks the widths). The menu itself: a button
 * that says whether it is open, holding the workspaces and search, and
 * closing on a choice, on Escape, or on a press outside it.
 */
describe('the narrow menu (T396, AC-304)', () => {
  it('opens on its button to the workspaces and search, and closes on a choice', async () => {
    renderShell(<AppShell workspace="jobs" />);
    const button = within(screen.getByRole('banner')).getByRole('button', { name: 'Menu' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('narrow-menu').hidden).toBe(true);
    // What it controls is in the page while closed too (T396's review).
    expect(document.getElementById(button.getAttribute('aria-controls') ?? '')).toBe(
      screen.getByTestId('narrow-menu'),
    );

    await userEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByTestId('narrow-menu');
    expect(panel.hidden).toBe(false);
    expect(button.getAttribute('aria-controls')).toBe(panel.id);
    const links = within(panel).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Explore',
      'Model',
      'Data sources',
      'Jobs',
      'Schedules',
      'Security',
    ]);
    expect(within(panel).getByRole('link', { name: 'Jobs' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(within(panel).getByRole('button', { name: /Search wechart/ })).toBeTruthy();

    // Search, chosen: the palette opens and the menu closes.
    await userEvent.click(within(panel).getByRole('button', { name: /Search wechart/ }));
    expect(screen.getByTestId('narrow-menu').hidden).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(await screen.findByRole('dialog', { name: 'Search' })).toBeTruthy();
  });

  it('closes on Escape, handing focus back to its button, and on a press outside it', async () => {
    renderShell(
      <AppShell workspace="explore">
        <p>elsewhere</p>
      </AppShell>,
    );
    const button = within(screen.getByRole('banner')).getByRole('button', { name: 'Menu' });

    await userEvent.click(button);
    await userEvent.tab();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByTestId('narrow-menu').hidden).toBe(true);
    expect(document.activeElement).toBe(button);

    await userEvent.click(button);
    await userEvent.click(screen.getByText('elsewhere'));
    expect(screen.getByTestId('narrow-menu').hidden).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
