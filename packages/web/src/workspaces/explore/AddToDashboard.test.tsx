import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AddToDashboard } from './AddToDashboard';

/**
 * T686 (AC-022, DSH-16; design 06 pin 4 and state B): "＋ Add to a
 * dashboard…" opens a picker that finds a dashboard by name; choosing one adds
 * the chart there. Tab and Escape as every popover here (R75).
 */
const DASHBOARDS = [
  { id: 'd1', title: 'Company dashboard 01', folder: 'My workspace' },
  { id: 'd2', title: 'Finance dashboard 1', folder: 'Finance' },
];

describe('the Add to a dashboard picker (T686)', () => {
  it('finds a dashboard by name, each row with its folder, and adds the chart there', async () => {
    const onPick = vi.fn();
    render(<AddToDashboard dashboards={DASHBOARDS} busy={false} onPick={onPick} />);
    const button = screen.getByRole('button', { name: '＋ Add to a dashboard…' });
    await userEvent.click(button);
    const picker = screen.getByRole('dialog', { name: 'Add to a dashboard' });
    const find = within(picker).getByRole('searchbox', { name: 'Find a dashboard' });
    expect(document.activeElement).toBe(find);
    expect(within(picker).getAllByRole('button')).toHaveLength(2);

    await userEvent.type(find, 'finance');
    const rows = within(picker).getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual(['Finance dashboard 1Finance']);

    await userEvent.click(rows[0]!);
    expect(onPick).toHaveBeenCalledWith('d2');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('puts the picker away on Escape, with focus back on its button, adding nothing', async () => {
    const onPick = vi.fn();
    render(<AddToDashboard dashboards={DASHBOARDS} busy={false} onPick={onPick} />);
    const button = screen.getByRole('button', { name: '＋ Add to a dashboard…' });
    await userEvent.click(button);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(onPick).not.toHaveBeenCalled();
  });

  // T686's review: while the add runs, focus stays on its button, which says
  // it is busy rather than being disabled out from under the focus.
  it('keeps focus on its button while the add it chose runs', async () => {
    const { rerender } = render(
      <AddToDashboard dashboards={DASHBOARDS} busy={false} onPick={vi.fn()} />,
    );
    const button = screen.getByRole('button', { name: '＋ Add to a dashboard…' });
    await userEvent.click(button);
    await userEvent.click(screen.getAllByRole('button', { name: /^Company dashboard 01/ })[0]!);
    rerender(<AddToDashboard dashboards={DASHBOARDS} busy onPick={vi.fn()} />);
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    // And it opens nothing while busy.
    await userEvent.click(button);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // T686's review: as the shell's popover, it goes when focus leaves it.
  it('puts the picker away when focus leaves it', async () => {
    render(
      <>
        <AddToDashboard dashboards={DASHBOARDS} busy={false} onPick={vi.fn()} />
        <button type="button">After</button>
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: '＋ Add to a dashboard…' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    act(() => {
      screen.getByRole('button', { name: 'After' }).focus();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says so when no dashboard has that name', async () => {
    render(<AddToDashboard dashboards={DASHBOARDS} busy={false} onPick={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '＋ Add to a dashboard…' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a dashboard' }), 'nothing');
    expect(screen.getByText('No dashboard by that name.')).toBeTruthy();
  });
});
