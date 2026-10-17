import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RevokeTokenDialog } from './RevokeTokenDialog';

/**
 * T771 (AC-431; design 18, state E): Revoke asks first, naming the token,
 * in an alert dialog whose focus starts on Cancel. Revoke token revokes it;
 * there's no Undo, since a revoked token can't work again.
 */
function open(revoke: () => Promise<void> = vi.fn(async () => {})) {
  const onRevoked = vi.fn();
  const onClose = vi.fn();
  render(
    <RevokeTokenDialog
      title="Revoke “Claude Code · laptop”?"
      revoke={revoke}
      onRevoked={onRevoked}
      onClose={onClose}
    />,
  );
  return { revoke, onRevoked, onClose };
}

describe('Revoke a token (T771, AC-431; design 18, state E)', () => {
  it('asks first, naming it, with focus on Cancel', () => {
    open();
    const dialog = screen.getByRole('alertdialog', { name: 'Revoke “Claude Code · laptop”?' });
    expect(dialog.className).toContain('revoke-token');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('alertdialog').textContent).toContain(
      'Every client using it stops working at once. It can’t be turned back on; you can make a new one.',
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull();
  });

  it('Cancel and Esc revoke nothing', async () => {
    const { revoke, onClose } = open();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('Revoke token revokes it, and says it’s done', async () => {
    const { revoke, onRevoked, onClose } = open();
    await userEvent.click(screen.getByRole('button', { name: 'Revoke token' }));
    await waitFor(() => expect(onRevoked).toHaveBeenCalledTimes(1));
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('says so, in the dialog, when it wasn’t revoked', async () => {
    const { onRevoked } = open(async () => {
      throw new Error('The token wasn’t revoked (500).');
    });
    await userEvent.click(screen.getByRole('button', { name: 'Revoke token' }));
    expect((await screen.findByRole('alert')).textContent).toBe('The token wasn’t revoked (500).');
    expect(onRevoked).not.toHaveBeenCalled();
  });
});
