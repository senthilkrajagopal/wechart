import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SaveDialog } from './SaveDialog';

/**
 * T812 (AC-457, AC-483; design 17, I2): Save… asks for a name and a
 * description, says what the save keeps, and shows a refusal's reason.
 */
describe('Save… (T812, AC-457, AC-483)', () => {
  const dialog = (over: Partial<Parameters<typeof SaveDialog>[0]> = {}) => {
    const onSave = vi.fn(async () => null as string | null);
    const onCancel = vi.fn();
    render(
      <SaveDialog
        sourceName="emea_replica"
        parameters={['region', 'since']}
        onSave={onSave}
        onCancel={onCancel}
        {...over}
      />,
    );
    return { onSave, onCancel };
  };

  it('asks for a name, focused first, and an optional description, and says what it keeps', () => {
    dialog();
    const box = screen.getByRole('dialog', { name: 'Save query' });
    const name = screen.getByRole('textbox', { name: 'Name' });
    expect(document.activeElement).toBe(name);
    expect(screen.getByRole('textbox', { name: 'Description · optional' })).toBeTruthy();
    expect(box.textContent).toContain(
      'Keeps the SQL, emea_replica, and region and since with their types and values. Only you can see it.',
    );
    expect(box.textContent).toContain('0 / 1,000');
  });

  it('saves the name and the description given', async () => {
    const { onSave } = dialog();
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Top EMEA orders');
    await userEvent.type(screen.getByRole('textbox', { name: 'Description · optional' }), 'Month end');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith('Top EMEA orders', 'Month end');
  });

  it('starts from a name it is given: Save as new…’s copy', () => {
    dialog({ name: 'Top EMEA orders (copy)', description: 'Month end' });
    expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Top EMEA orders (copy)');
    expect((screen.getByRole('textbox', { name: 'Description · optional' }) as HTMLTextAreaElement).value).toBe(
      'Month end',
    );
  });

  it('shows a refusal’s reason, on the name, and stays open', async () => {
    const reason = 'You already have a saved query named “Top EMEA orders”.';
    const { onCancel } = dialog({ onSave: vi.fn(async () => reason) });
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Top EMEA orders');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect((await screen.findByRole('alert')).textContent).toBe(reason);
    expect(screen.getByRole('textbox', { name: 'Name' }).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('dialog', { name: 'Save query' })).toBeTruthy();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Cancel and Esc close it unsaved', async () => {
    const { onSave, onCancel } = dialog();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onSave).not.toHaveBeenCalled();
  });
});
