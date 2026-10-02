import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UseInWorkspaceDialog } from './UseInWorkspaceDialog';

/**
 * T543 (AC-283; R53, "Yes, use-only copy"): a model of a folder the user may
 * only read is copied into My workspace to use. It can't go back to that
 * folder, so they choose one they write, where it goes as a new model.
 */
const TARGETS = [
  { id: 'sales', path: ['Viewing', 'Sales'] },
  { id: 'ops', path: ['Ops'] },
];

function shown(over: Partial<Parameters<typeof UseInWorkspaceDialog>[0]> = {}) {
  const onCopy = vi.fn();
  const onClose = vi.fn();
  render(
    <UseInWorkspaceDialog
      path="cubes/regions.yml"
      folderWords="Viewing"
      targets={TARGETS}
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

describe('Use in my workspace (T543, AC-283)', () => {
  it('says the copy can’t go back, and asks which folder it goes to as a new model', async () => {
    const { dialog, onCopy } = shown();
    expect(within(dialog).getByTestId('use-note').textContent).toBe(
      'You may only read Viewing, so this copy can’t be proposed back there. Choose a folder you may write: it goes there as a new model when you propose it.',
    );
    const copy = within(dialog).getByRole('button', { name: 'Copy to My workspace' });
    expect(copy.hasAttribute('disabled')).toBe(true);
    await userEvent.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Target folder' }),
      'ops',
    );
    await userEvent.click(copy);
    expect(onCopy).toHaveBeenCalledWith('ops');
  });

  it('chooses the one folder there is, and says where there is none', () => {
    const { dialog } = shown({ targets: [TARGETS[1]!] });
    expect(
      (within(dialog).getByRole('combobox', { name: 'Target folder' }) as HTMLSelectElement).value,
    ).toBe('ops');
    expect(
      within(dialog).getByRole('button', { name: 'Copy to My workspace' }).hasAttribute('disabled'),
    ).toBe(false);
  });

  it('says there is nowhere for it to go without a folder to write, and why a copy was refused', () => {
    const { dialog } = shown({
      targets: [],
      failure: 'Ops has a cube or view named “regions” already.',
    });
    expect(within(dialog).queryByRole('combobox')).toBeNull();
    expect(
      within(dialog).getByText(
        'You have read-write access to no shared folder, so there is nowhere for it to go.',
      ),
    ).toBeTruthy();
    expect(within(dialog).getByRole('alert').textContent).toBe(
      'Ops has a cube or view named “regions” already.',
    );
  });

  it('closes with Cancel and with Escape', async () => {
    const { dialog, onClose } = shown();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
