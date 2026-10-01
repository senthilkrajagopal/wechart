import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FolderDescription } from './FolderDescription';

/**
 * T524 (AC-369; design 14, state H): a folder's description under its name in
 * Explore's header, edited in place by one who may change the folder, with
 * ProposeDialog's "n / 1,000" counter, never cut, Save waiting past 1,000.
 */
const TEXT = 'Revenue, pipeline and product mix for Europe, refreshed nightly.';

function shown(description: string | null, mayEdit: boolean) {
  const onSave = vi.fn<(text: string) => Promise<undefined>>(async () => undefined);
  render(
    <FolderDescription
      folderTitle="EMEA"
      description={description}
      mayEdit={mayEdit}
      onSave={onSave}
    />,
  );
  return { onSave };
}

describe('a folder’s description (T524, AC-369; design 14, state H)', () => {
  it('shows a reader the text alone, and nothing at all when there is none (H4)', () => {
    const { unmount } = render(
      <FolderDescription folderTitle="EMEA" description={TEXT} mayEdit={false} onSave={vi.fn()} />,
    );
    expect(screen.getByText(TEXT)).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Edit|Add a description/ })).toBeNull();
    unmount();
    const { container } = render(
      <FolderDescription folderTitle="EMEA" description={null} mayEdit={false} onSave={vi.fn()} />,
    );
    expect(container.textContent).toBe('');
  });

  it('offers a writer Add a description where there is none (H1)', () => {
    shown(null, true);
    expect(screen.getByRole('button', { name: 'Add a description' })).not.toBeNull();
  });

  it('edits in place with the counter, saving with Save or ⌘ Enter (H2)', async () => {
    const { onSave } = shown(TEXT, true);
    await userEvent.click(screen.getByRole('button', { name: 'Edit description' }));
    const field = screen.getByRole('textbox', { name: 'Description of EMEA' });
    expect(document.activeElement).toBe(field);
    expect(screen.getByText(`${String(TEXT.length)} / 1,000`)).not.toBeNull();
    await userEvent.type(field, ' Euros.');
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(`${TEXT} Euros.`);
    });
  });

  it('saves with Save, and with Ctrl Enter, counting characters as code points', async () => {
    const { onSave } = shown(null, true);
    await userEvent.click(screen.getByRole('button', { name: 'Add a description' }));
    const field = screen.getByRole('textbox', { name: 'Description of EMEA' });
    await userEvent.click(field);
    // 999 letters and one emoji of two UTF-16 units: 1,000 characters, as the API counts them.
    await userEvent.paste(`${'é'.repeat(999)}😀`);
    expect(screen.getByText('1,000 / 1,000')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(`${'é'.repeat(999)}😀`);
    });
    onSave.mockClear();
    // Its owner hasn't read it back here, so it is still to be added.
    await userEvent.click(screen.getByRole('button', { name: 'Add a description' }));
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
  });

  it('waits, never cutting, past 1,000 characters (H3)', async () => {
    const { onSave } = shown('', true);
    await userEvent.click(screen.getByRole('button', { name: 'Add a description' }));
    const field = screen.getByRole('textbox', { name: 'Description of EMEA' });
    await userEvent.click(field);
    await userEvent.paste('x'.repeat(1001));
    expect(screen.getByText('1,001 / 1,000')).not.toBeNull();
    expect(screen.getByText('Shorten to 1,000 characters.')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
    expect((field as HTMLTextAreaElement).value).toHaveLength(1001);
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('puts the text back on Escape, focus back on Edit', async () => {
    const { onSave } = shown(TEXT, true);
    await userEvent.click(screen.getByRole('button', { name: 'Edit description' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Description of EMEA' }), ' more');
    await userEvent.keyboard('{Escape}');
    expect(screen.getByText(TEXT)).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit description' }));
    expect(onSave).not.toHaveBeenCalled();
  });
});
