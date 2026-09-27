import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NewItemDialog } from './NewItemDialog';

/**
 * T345 (AC-282; direction.md rule 74; references.md "New in My workspace"):
 * a dashboard or chart made in the workspace takes its name and the shared
 * folder it is to go to, from the folders where its author has read-write
 * access (`GET /api/folders/targets`), chosen for them when there is one.
 */
const targets = [
  { id: 'root', path: [] },
  { id: 'f-sales', path: ['Finance', 'Sales'] },
];

describe('the folder a new workspace item is to go to (T345, AC-282)', () => {
  it('lists the folders its author writes, by path, and makes nothing until one is chosen', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <NewItemDialog
        kind="dashboard"
        defaultTitle="Untitled dashboard"
        targets={targets}
        onCreate={onCreate}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'New dashboard in My workspace' })).toBeDefined();
    const picker = screen.getByRole('combobox', { name: 'Target folder' });
    expect([...picker.querySelectorAll('option')].map((option) => option.textContent)).toEqual([
      'Choose a folder…',
      'Shared',
      'Finance / Sales',
    ]);
    expect(
      screen.getByText('It stays private in My workspace until you propose it to this folder.'),
    ).toBeDefined();
    const make = screen.getByRole('button', { name: 'Create' });
    expect(make).toHaveProperty('disabled', true);

    const name = screen.getByRole('textbox', { name: 'Name' });
    expect(name).toHaveProperty('value', 'Untitled dashboard');
    await user.clear(name);
    await user.type(name, 'EMEA revenue');
    await user.selectOptions(picker, 'f-sales');
    await user.click(make);
    expect(onCreate).toHaveBeenCalledWith('EMEA revenue', 'f-sales');
  });

  it('chooses the one there is, needs a name, and says so where there is no folder', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const { unmount } = render(
      <NewItemDialog
        kind="chart"
        defaultTitle="Untitled chart"
        targets={[targets[1]!]}
        onCreate={onCreate}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Target folder' })).toHaveProperty(
      'value',
      'f-sales',
    );
    const make = screen.getByRole('button', { name: 'Create' });
    await user.clear(screen.getByRole('textbox', { name: 'Name' }));
    expect(make).toHaveProperty('disabled', true);
    await user.type(screen.getByRole('textbox', { name: 'Name' }), '  Margin  ');
    await user.click(make);
    expect(onCreate).toHaveBeenCalledWith('Margin', 'f-sales');
    unmount();

    render(
      <NewItemDialog
        kind="chart"
        defaultTitle="Untitled chart"
        targets={[]}
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('note').textContent).toBe(
      'You have read-write access to no shared folder, so there is nowhere for it to go.',
    );
    expect(screen.getByRole('button', { name: 'Create' })).toHaveProperty('disabled', true);
  });

  it('closes on Cancel and Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <NewItemDialog
        kind="dashboard"
        defaultTitle="Untitled dashboard"
        targets={targets}
        onCreate={vi.fn()}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
