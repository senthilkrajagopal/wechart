import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccountMenu, initialsOf } from './AccountMenu';

/**
 * T319 (AC-252, AC-254; direction.md rule 59, references.md › Phase 2 ›
 * Surface 1): signed in, the top bar shows the user's name beside a 28 px
 * avatar, and the account menu holds the identity, a Super-Admin label for
 * Super-Admins, and Sign out. With security off, the same place shows a
 * "Single-user mode" chip and there is no Sign out.
 */
interface Me {
  name: string;
  identity?: string;
  groups: string[];
  superAdmin: boolean;
  security: 'off' | 'oidc';
}

const answer = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function serve(me: Me, logout: unknown = { redirectTo: 'http://localhost:5373/' }) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/me') return answer(200, me);
    if (url === '/api/auth/logout' && init?.method === 'POST') return answer(200, logout);
    return answer(404, {});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const writer: Me = {
  name: 'Wren Writer',
  identity: 'writer@example.com',
  groups: ['sales-rw'],
  superAdmin: false,
  security: 'oidc',
};

describe('the account button, signed in (AC-252)', () => {
  it('shows the name beside an avatar of the initials, named "Account: <name>"', async () => {
    serve(writer);
    render(<AccountMenu />);
    const button = await screen.findByRole('button', { name: 'Account: Wren Writer' });
    expect(within(button).getByTestId('account-avatar').textContent).toBe('WW');
    expect(within(button).getByTestId('account-name').textContent).toBe('Wren Writer');
    // Truncated names keep the whole name as a tooltip.
    expect(within(button).getByTestId('account-name').getAttribute('title')).toBe('Wren Writer');
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens a menu with the name, the identity and Sign out, and no Super-Admin label', async () => {
    serve(writer);
    render(<AccountMenu />);
    await userEvent.click(await screen.findByRole('button', { name: 'Account: Wren Writer' }));
    const panel = screen.getByTestId('account-panel');
    expect(within(panel).getByText('Wren Writer')).toBeTruthy();
    expect(within(panel).getByText('writer@example.com')).toBeTruthy();
    expect(within(panel).queryByText('Super-Admin')).toBeNull();
    // The menu is named by who it is for, so a screen reader entering it
    // hears the identity before Sign out (T319's review).
    const menu = within(panel).getByRole('menu', { name: /^Wren Writer\s+writer@example\.com$/ });
    const signOut = within(menu).getByRole('menuitem', { name: 'Sign out' });
    // Opening moves focus into the menu (APG menu button).
    expect(document.activeElement).toBe(signOut);
  });

  it('labels a Super-Admin as one, in the menu’s name too', async () => {
    serve({ ...writer, name: 'Sam Super', superAdmin: true });
    render(<AccountMenu />);
    await userEvent.click(await screen.findByRole('button', { name: 'Account: Sam Super' }));
    expect(within(screen.getByTestId('account-panel')).getByText('Super-Admin')).toBeTruthy();
    expect(
      screen.getByRole('menu', { name: /^Sam Super\s+writer@example\.com\s+Super-Admin$/ }),
    ).toBeTruthy();
  });

  it('shows an identity that is the name only once', async () => {
    serve({ ...writer, name: 'writer@example.com' });
    render(<AccountMenu />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Account: writer@example.com' }),
    );
    expect(
      within(screen.getByTestId('account-panel')).getAllByText('writer@example.com'),
    ).toHaveLength(1);
  });

  it('closes when a pointer goes down outside it', async () => {
    serve(writer);
    render(
      <>
        <AccountMenu />
        <p>elsewhere</p>
      </>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Account: Wren Writer' }));
    expect(screen.getByTestId('account-panel')).toBeTruthy();
    await userEvent.click(screen.getByText('elsewhere'));
    expect(screen.queryByTestId('account-panel')).toBeNull();
  });

  it('signs out through the API, then goes where it says', async () => {
    const fetchMock = serve(writer, { redirectTo: 'http://localhost:5373/' });
    const go = vi.fn();
    render(<AccountMenu navigate={go} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Account: Wren Writer' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => {
      expect(go).toHaveBeenCalledWith('http://localhost:5373/');
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
  });

  it('closes on Escape and gives focus back to the button', async () => {
    serve(writer);
    render(<AccountMenu />);
    const button = await screen.findByRole('button', { name: 'Account: Wren Writer' });
    await userEvent.click(button);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('account-panel')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});

describe('with security off (AC-254)', () => {
  const single: Me = { name: 'admin', groups: [], superAdmin: true, security: 'off' };

  it('shows a "Single-user mode" chip, whose menu explains it and has no Sign out', async () => {
    serve(single);
    render(<AccountMenu />);
    const chip = await screen.findByRole('button', { name: 'Single-user mode' });
    expect(within(chip).getByTestId('single-user-icon')).toBeTruthy();
    // Icon and words (rule 59), the words its tooltip too.
    expect(chip.getAttribute('title')).toBe('Single-user mode');
    expect(within(chip).getByText('Single-user mode')).toBeTruthy();
    // Phase 1's identity avatar stays at the far right, after the chip (AC-190).
    const avatar = screen.getByRole('img', { name: 'Signed in as admin' });
    expect(avatar.textContent).toBe('AD');
    expect(chip.compareDocumentPosition(avatar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await userEvent.click(chip);
    const panel = screen.getByTestId('account-panel');
    // Its second sentence once proposals and Reviews are there (T359, AC-254;
    // references.md, Surface 1).
    expect(panel.textContent).toContain(
      'Sign-in is off, so wechart runs as one user with every permission. Your proposals still wait for your approval in Reviews.',
    );
    expect(screen.queryByRole('menuitem', { name: 'Sign out' })).toBeNull();
    expect(screen.queryByText('Sign out')).toBeNull();
  });
});

describe('initials', () => {
  it('takes the first letters of the first and last words, or two of a single word', () => {
    expect(initialsOf('Wren Writer')).toBe('WW');
    expect(initialsOf('Ada María de la Cruz')).toBe('AC');
    expect(initialsOf('admin')).toBe('AD');
    expect(initialsOf('  ')).toBe('');
  });
});
