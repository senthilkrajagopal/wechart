import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

/** Who `/api/me` says is signed in; anything else is not there. */
const answering = (me: Record<string, unknown>) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url === '/api/me' ? Response.json(me) : new Response(null, { status: 404 }),
    ),
  );
};
/** Sign-in off: the one user, with every permission (AC-254). */
const SINGLE_USER = {
  name: 'admin',
  groups: [],
  superAdmin: true,
  readWrite: true,
  security: 'off',
};
afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * AC-001: WHEN the application loads, THE SYSTEM SHALL show a top bar whose
 * workspace switcher lists Explore to every user; Data sources, Jobs and
 * Schedules to Super-Admins and read-write members; and Security to
 * Super-Admins. It SHALL list no Model workspace.
 */
describe('app shell (AC-001)', () => {
  it('shows a top bar carrying the workspace switcher, with no Model entry', async () => {
    answering(SINGLE_USER);
    renderShell(<AppShell workspace="explore" />);

    const bar = screen.getByRole('banner');
    const switcher = within(bar).getByRole('navigation', { name: /workspace/i });

    // The single user holds every permission: every entry but Model (T331).
    await waitFor(() => {
      expect(within(switcher).getAllByRole('link')).toHaveLength(5);
    });
    expect(within(switcher).queryByRole('link', { name: 'Model' })).toBeNull();
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
    answering(SINGLE_USER);
    renderShell(<AppShell workspace="jobs" />);
    // Once who is signed in is known, the menu holds what they may open.
    await waitFor(() => {
      expect(
        within(screen.getByTestId('narrow-menu')).getAllByRole('link', { hidden: true }),
      ).toHaveLength(5);
    });
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

/**
 * T500 (AC-295, AC-265; design 08 of 2026-09-27, state D): Security is the
 * Super-Admins'; anyone else signed in has no Security in the bar.
 */
describe('Security in the bar (T500)', () => {
  const signedIn = (superAdmin: boolean) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/me'
          ? Response.json({ name: 'Wren Writer', groups: [], superAdmin, security: 'oidc' })
          : new Response(null, { status: 404 }),
      ),
    );
  };
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const bar = () =>
    within(
      within(screen.getByRole('banner')).getAllByRole('navigation', { name: /workspace/i })[0]!,
    );

  /** The shell, with its query client at hand: to know when who is signed in is known. */
  const shell = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ThemeProvider initial="light">
          <AppShell workspace="explore" />
        </ThemeProvider>
      </QueryClientProvider>,
    );
    return client;
  };
  const narrow = () => within(screen.getByTestId('narrow-menu'));

  it('has none for anyone signed in who isn’t a Super-Admin, in the bar or its narrow menu', async () => {
    signedIn(false);
    const client = shell();

    await waitFor(() => {
      expect(client.getQueryData(['me'])).toBeDefined();
    });
    expect(bar().queryByRole('link', { name: 'Security' })).toBeNull();
    expect(bar().getByRole('link', { name: 'Explore' })).toBeTruthy();
    // The menu below 1,024 px: hidden until opened, the same entries.
    expect(narrow().queryByRole('link', { name: 'Security', hidden: true })).toBeNull();
    expect(narrow().getByRole('link', { name: 'Explore', hidden: true })).toBeTruthy();
  });

  it('has it for a Super-Admin, once who they are is known', async () => {
    signedIn(true);
    const client = shell();

    await waitFor(() => {
      expect(client.getQueryData(['me'])).toBeDefined();
    });
    expect(bar().getByRole('link', { name: 'Security' })).toBeTruthy();
    expect(narrow().getByRole('link', { name: 'Security', hidden: true })).toBeTruthy();
  });
});

/**
 * T331 (AC-001; design 09, state A): the bar, and its narrow menu, list what
 * each role may use, and never Model.
 */
describe('the bar by role (T331, AC-001)', () => {
  const entries = (where: HTMLElement) =>
    within(where)
      .getAllByRole('link', { hidden: true })
      .map((link) => link.textContent);
  const bar = () =>
    within(screen.getByRole('banner')).getAllByRole('navigation', { name: /workspace/i })[0]!;

  it('gives a read-write member Explore, Data sources, Jobs and Schedules', async () => {
    answering({
      name: 'Wren Writer',
      groups: ['sales-rw'],
      superAdmin: false,
      readWrite: true,
      security: 'oidc',
    });
    renderShell(<AppShell workspace="explore" />);

    const expected = ['Explore', 'Data sources', 'Jobs', 'Schedules'];
    await waitFor(() => {
      expect(entries(bar())).toEqual(expected);
    });
    expect(entries(screen.getByTestId('narrow-menu'))).toEqual(expected);
  });

  it('gives a read-only user Explore alone', async () => {
    answering({
      name: 'Rae Reader',
      groups: ['sales-ro'],
      superAdmin: false,
      readWrite: false,
      security: 'oidc',
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ThemeProvider initial="light">
          <AppShell workspace="explore" />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(client.getQueryData(['me'])).toBeDefined();
    });
    expect(entries(bar())).toEqual(['Explore']);
    expect(entries(screen.getByTestId('narrow-menu'))).toEqual(['Explore']);
  });
});
