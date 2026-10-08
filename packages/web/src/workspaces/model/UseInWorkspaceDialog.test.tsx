import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UseInWorkspaceDialog } from './UseInWorkspaceDialog';

/**
 * T543 (AC-283; R53, "Yes, use-only copy"), as T717 has it (R73): a model of
 * a folder the user may only read is copied into My workspace to use. It is
 * proposed to no folder, so the dialog asks for none: it says so, and that a
 * change to the shared cube is asked of its folder from the copy's page.
 */
function shown(over: Partial<Parameters<typeof UseInWorkspaceDialog>[0]> = {}) {
  const onCopy = vi.fn();
  const onClose = vi.fn();
  render(
    <UseInWorkspaceDialog
      path="cubes/regions.yml"
      folderWords="Viewing"
      onCopy={onCopy}
      onClose={onClose}
      {...over}
    />,
  );
  return {
    onCopy,
    onClose,
    dialog: screen.getByRole('dialog', { name: 'Use regions.yml in My workspace' }),
  };
}

describe('Use in my workspace (T543, T717, AC-283)', () => {
  it('says the copy is proposed to no folder, asks for none, and copies it', async () => {
    const { dialog, onCopy } = shown();
    expect(within(dialog).getByTestId('use-note').textContent).toBe(
      'You may only read Viewing, so this copy is for use in My workspace only: it can’t be proposed to any folder. To change the shared cube, send Viewing a request from the copy’s page.',
    );
    expect(within(dialog).queryByRole('combobox')).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy to My workspace' }));
    expect(onCopy).toHaveBeenCalledWith();
  });

  it('says why a copy was refused', () => {
    const { dialog } = shown({ failure: 'wechart could not be reached, so nothing was copied.' });
    expect(within(dialog).getByRole('alert').textContent).toBe(
      'wechart could not be reached, so nothing was copied.',
    );
  });

  it('is disabled while copying', () => {
    const { dialog } = shown({ busy: true });
    expect(within(dialog).getByRole('button', { name: 'Copying…' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('closes with Cancel and with Escape', async () => {
    const { dialog, onClose } = shown();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
