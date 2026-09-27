import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TargetTree } from './TargetTree';

/**
 * T471's review (design 01, state G; AC-282): the target folders as a tree —
 * each under its own parent, however their names sort; two folders of one
 * name each their own; the shared root, where it is a target, over the rest.
 */
const rows = () =>
  within(screen.getByRole('tree', { name: 'Target folder' }))
    .getAllByRole('treeitem')
    .map((item) => `${item.getAttribute('aria-level') ?? ''}:${item.textContent ?? ''}`);

describe('the target folders as a tree', () => {
  it('puts a folder under its own parent, not after whatever sorts beside it', () => {
    render(
      <TargetTree
        targets={[
          { id: 'f-sales-2', path: ['Sales-2'] },
          { id: 'f-emea', path: ['Sales', 'EMEA'] },
          { id: 'f-ops', path: ['Sales Ops'] },
          { id: 'f-sales', path: ['Sales'] },
        ]}
        chosen=""
        onChoose={vi.fn()}
      />,
    );
    expect(rows()).toEqual(['1:Sales', '2:EMEA', '1:Sales Ops', '1:Sales-2']);
  });

  it('keeps two folders of one name apart, each one chosen by itself', async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(
      <TargetTree
        targets={[
          { id: 'f-new-1', path: ['New folder'] },
          { id: 'f-new-2', path: ['New folder'] },
        ]}
        chosen=""
        onChoose={onChoose}
      />,
    );
    const items = screen.getAllByRole('treeitem', { name: 'New folder' });
    expect(items).toHaveLength(2);
    await user.click(items[1]!);
    expect(onChoose).toHaveBeenCalledWith('f-new-2');
  });

  it('holds the others under the shared root where it is a target, and shows a parent it can’t be chosen as', () => {
    render(
      <TargetTree
        targets={[
          { id: 'root', path: [] },
          { id: 'f-emea', path: ['Sales', 'EMEA'] },
        ]}
        chosen="root"
        onChoose={vi.fn()}
      />,
    );
    expect(rows()).toEqual(['1:Shared', '2:Sales', '3:EMEA']);
    const sales = screen.getByRole('treeitem', { name: 'Sales' });
    expect(sales.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('treeitem', { name: 'Shared' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});
