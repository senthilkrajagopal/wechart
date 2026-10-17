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
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Access tokens', 'Sign out']);
    // Opening moves focus into the menu (APG menu button), onto its first
    // item: Access tokens, above Sign out since T769 (design 18, A1).
    const tokens = within(menu).getByRole('menuitem', { name: 'Access tokens' });
    expect(document.activeElement).toBe(tokens);
  });

  /** T769 (AC-430; design 18, A1 and A2): every signed-in user's own tokens, above Sign out. */
  it('offers Access tokens above Sign out, which opens /account/tokens', async () => {
    serve(writer);
    const go = vi.fn();
    render(<AccountMenu navigate={go} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Account: Wren Writer' }));
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual(['Access tokens', 'Sign out']);
    const tokens = screen.getByRole('menuitem', { name: 'Access tokens' });
    expect(tokens.querySelectorAll('.menu__icon svg[data-icon="key"]')).toHaveLength(1);
    await userEvent.click(tokens);
    expect(go).toHaveBeenCalledWith('/account/tokens');
    expect(screen.queryByTestId('account-panel')).toBeNull();
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

  /** T696 (EXP-17, EXP-18; design 09, pins 3–6). */
  it('draws design 09’s account button and menu: a chevron, the accent badge, Sign out with its icon', async () => {
    serve({ ...writer, name: 'Sam Super', superAdmin: true });
    render(<AccountMenu />);
    const button = await screen.findByRole('button', { name: 'Account: Sam Super' });
    expect(button.lastElementChild?.getAttribute('data-testid')).toBe('account-chevron');
    await userEvent.click(button);
    const panel = screen.getByTestId('account-panel');
    expect(within(panel).getByText('writer@example.com').className).toBe('account-panel__identity');
    expect(within(panel).getByText('Super-Admin').className).toBe(
      'badge badge--accent account-panel__badge',
    );
    const signOut = within(panel).getByRole('menuitem', { name: 'Sign out' });
    expect(signOut.querySelectorAll('.menu__icon svg[data-icon="sign-out"]')).toHaveLength(1);
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

  /**
   * T696 (AC-190 as amended, AC-254; design 09 state B; R76 explore-Q1): the
   * chip takes the avatar's place, with no avatar beside it; an open padlock,
   * its words and a chevron; its menu a heading and one sentence.
   */
  it('shows a "Single-user mode" chip in the avatar’s place, whose menu explains it and has no Sign out', async () => {
    serve(single);
    render(<AccountMenu />);
    const chip = await screen.findByRole('button', { name: 'Single-user mode' });
    expect(within(chip).getAllByTestId('single-user-icon')).toHaveLength(1);
    // Icon and words (rule 59), the words its tooltip too, then its chevron.
    expect(chip.getAttribute('title')).toBe('Single-user mode');
    expect(within(chip).getAllByText('Single-user mode')).toHaveLength(1);
    expect(chip.lastElementChild?.getAttribute('data-testid')).toBe('account-chevron');
    // No avatar beside it (AC-190, amended).
    expect(screen.queryByRole('img', { name: /^Signed in/ })).toBeNull();

    await userEvent.click(chip);
    const panel = screen.getByTestId('account-panel');
    expect(panel.classList).toContain('account-panel--single');
    // Its heading, then its sentence (design 09 state B; T359's second sentence).
    expect(panel.querySelector('.menu__main')?.textContent).toBe('Sign-in is off');
    expect(panel.querySelector('.menu__sub-line')?.textContent).toBe(
      'wechart runs as one user with every permission. Your proposals still wait for your approval in Reviews.',
    );
    expect(screen.queryByRole('menuitem', { name: 'Sign out' })).toBeNull();
    expect(screen.queryByText('Sign out')).toBeNull();
  });

  /** T769 (AC-479; design 18, A3): the chip's menu gains Access tokens. */
  it('offers Access tokens in the chip’s menu, which opens /account/tokens', async () => {
    serve(single);
    const go = vi.fn();
    render(<AccountMenu navigate={go} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Single-user mode' }));
    // After the heading and its sentence (design 18, A3).
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual([
      'Sign-in is off wechart runs as one user with every permission. Your proposals still wait for your approval in Reviews.',
      'Access tokens',
    ]);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Access tokens' }));
    expect(go).toHaveBeenCalledWith('/account/tokens');
  });

  it('holds a person in the avatar’s place until it knows who is asking', () => {
    serve(single);
    render(<AccountMenu />);
    expect(screen.getAllByRole('img', { name: 'Signed in' })).toHaveLength(1);
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
