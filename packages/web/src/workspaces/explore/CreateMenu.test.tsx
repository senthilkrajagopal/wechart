import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CreateMenu } from './CreateMenu';

/**
 * AC-192 (T331): the open folder's single "New" menu. In a shared folder it
 * offers Folder to the folder's read-write members; in the user's workspace
 * Dashboard, Chart, (Model,) Data source and Folder, and, under a divider,
 * Import a dashboard… (AC-356).
 * Fails when: … a shared folder's New menu offers anything but Folder.
 */
const offered = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'New' }));
  const menu = screen.getByRole('menu', { name: 'New' });
  return within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent);
};

describe('the New menu (AC-192, T331)', () => {
  it('offers Folder alone in a shared folder', async () => {
    render(<CreateMenu offers={['folder']} onCreate={vi.fn()} />);

    expect(await offered()).toEqual(['▣Folder']);
  });

  it('makes a folder when Folder is chosen there', async () => {
    const onCreate = vi.fn();
    render(<CreateMenu offers={['folder']} onCreate={onCreate} />);
    await userEvent.click(screen.getByRole('button', { name: 'New' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Folder/ }));

    expect(onCreate).toHaveBeenCalledWith('folder');
  });

  it('is not there at all when there is nothing to offer: a reader’s', () => {
    render(<CreateMenu offers={[]} onCreate={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'New' })).toBeNull();
  });

  it('offers every kind in the workspace, with Import a dashboard… under a divider', async () => {
    render(
      <CreateMenu
        offers={['dashboard', 'chart', 'folder']}
        onCreate={vi.fn()}
        onNewSource={vi.fn()}
        onImport={vi.fn()}
      />,
    );

    expect(await offered()).toEqual([
      '▦Dashboard',
      '◢Chart',
      '◍Data source',
      '▣Folder',
      '⤒Import a dashboard…from a file',
    ]);
    const menu = screen.getByRole('menu', { name: 'New' });
    const separator = within(menu).getByRole('separator');
    // The divider sits between the kinds and the import.
    expect(
      separator.compareDocumentPosition(within(menu).getByRole('menuitem', { name: /Folder/ })) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    expect(
      separator.compareDocumentPosition(
        within(menu).getByRole('menuitem', { name: /Import a dashboard/ }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  /**
   * T692 (design 13, state G; design 04, pin 5): the workspace's menu headed
   * "New in My workspace", the four kinds that ask for a target, then Folder,
   * which doesn't ("no target"), then Import, each group under a divider.
   */
  it('is headed and grouped in the workspace as design 13 state G draws it', async () => {
    render(
      <CreateMenu
        offers={['dashboard', 'chart', 'folder']}
        onCreate={vi.fn()}
        onNewModel={vi.fn()}
        onNewSource={vi.fn()}
        onImport={vi.fn()}
        heading="New in My workspace"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'New' }));
    const menu = screen.getByRole('menu', { name: 'New' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual([
      '▦Dashboard',
      '◢Chart',
      '◇Model',
      '◍Data source',
      '▣Folderno target',
      '⤒Import a dashboard…from a file',
    ]);
    expect(menu.querySelector('.menu-button__head')?.textContent).toBe('New in My workspace');
    // Two dividers: before Folder, and before Import.
    const order = [...menu.children].map((child) =>
      child.getAttribute('role') === 'separator' ? '—' : (child.textContent ?? ''),
    );
    expect(order).toEqual([
      'New in My workspace',
      '▦Dashboard',
      '◢Chart',
      '◇Model',
      '◍Data source',
      '—',
      '▣Folderno target',
      '—',
      '⤒Import a dashboard…from a file',
    ]);
  });

  // T347 (AC-192's Model entry, AC-282's model half): between Chart and Data source.
  it('offers Model in the workspace, after Chart, and calls for one when chosen', async () => {
    const onNewModel = vi.fn();
    render(
      <CreateMenu
        offers={['dashboard', 'chart', 'folder']}
        onCreate={vi.fn()}
        onNewModel={onNewModel}
        onNewSource={vi.fn()}
      />,
    );

    expect(await offered()).toEqual(['▦Dashboard', '◢Chart', '◇Model', '◍Data source', '▣Folder']);
    await userEvent.click(screen.getByRole('menuitem', { name: /Model/ }));
    expect(onNewModel).toHaveBeenCalledTimes(1);
  });

  it('offers every kind when none is named, as phase 1 did', async () => {
    render(<CreateMenu onCreate={vi.fn()} />);

    expect(await offered()).toEqual(['▦Dashboard', '◢Chart', '▣Folder']);
  });
});
