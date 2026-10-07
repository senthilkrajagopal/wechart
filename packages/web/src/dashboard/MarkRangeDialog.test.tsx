import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MarkRangeDialog } from './MarkRangeDialog';

/**
 * T636 (AC-176, AC-093; R66, the user: ""Mark range…" in tile menu"): a
 * range marked from the keyboard. "Mark range…", in the tile's ⋯ menu, asks
 * a from and a to among the axis' buckets as drawn, each by its words (a
 * month as "Feb 2026"), and marks that range as a drag over it does — or
 * adds it, as a Ctrl-drag does. Esc and Cancel close it, asking first once
 * something was changed (rule 85).
 */
const BUCKETS = [
  { value: '2026-01-01T00:00:00.000', label: 'Jan 2026' },
  { value: '2026-02-01T00:00:00.000', label: 'Feb 2026' },
  { value: '2026-03-01T00:00:00.000', label: 'Mar 2026' },
  { value: '2026-04-01T00:00:00.000', label: 'Apr 2026' },
];

function shown() {
  const onMark = vi.fn();
  const onClose = vi.fn();
  render(<MarkRangeDialog axis="Ordered at" buckets={BUCKETS} onMark={onMark} onClose={onClose} />);
  return { onMark, onClose, dialog: screen.getByRole('dialog', { name: 'Mark a range' }) };
}

describe('Mark range… (T636)', () => {
  it('asks a from and a to among the buckets, by their words, the whole axis to start', () => {
    const { dialog } = shown();
    expect(dialog.textContent).toContain('Along Ordered at');
    const from = within(dialog).getByRole('combobox', { name: 'From' });
    const to = within(dialog).getByRole('combobox', { name: 'To' });
    expect(document.activeElement).toBe(from);
    expect(
      within(from)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026']);
    expect((from as HTMLSelectElement).value).toBe(BUCKETS[0]!.value);
    expect((to as HTMLSelectElement).value).toBe(BUCKETS[3]!.value);
  });

  it('marks the range chosen, its ends the right way round, or adds it', async () => {
    const { dialog, onMark, onClose } = shown();
    await userEvent.selectOptions(
      within(dialog).getByRole('combobox', { name: 'From' }),
      BUCKETS[2]!.value,
    );
    await userEvent.selectOptions(
      within(dialog).getByRole('combobox', { name: 'To' }),
      BUCKETS[1]!.value,
    );
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Add to what’s marked' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark' }));
    expect(onMark).toHaveBeenCalledWith({ from: BUCKETS[1]!.value, to: BUCKETS[2]!.value }, true);
    expect(onClose).toHaveBeenCalled();
  });

  // T636's review: an axis the filters left empty has no range to mark.
  it('marks nothing on an axis with no buckets, and says so', async () => {
    const onMark = vi.fn();
    render(<MarkRangeDialog axis="Ordered at" buckets={[]} onMark={onMark} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Mark a range' });
    expect(dialog.textContent).toContain('Nothing is on the axis to mark.');
    const mark = within(dialog).getByRole('button', { name: 'Mark' });
    expect(mark).toHaveProperty('disabled', true);
    await userEvent.click(mark);
    expect(onMark).not.toHaveBeenCalled();
  });

  it('closes on Esc at once while untouched', async () => {
    const first = shown();
    await userEvent.keyboard('{Escape}');
    expect(first.onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('asks before Esc or Cancel discards a changed range, Esc over the question keeping it', async () => {
    const { dialog, onClose, onMark } = shown();
    const from = within(dialog).getByRole('combobox', { name: 'From' });
    await userEvent.selectOptions(from, BUCKETS[1]!.value);
    from.focus();
    await userEvent.keyboard('{Escape}');
    const question = screen.getByRole('alertdialog', { name: 'Discard your changes?' });
    expect(document.activeElement).toBe(
      within(question).getByRole('button', { name: 'Keep editing' }),
    );
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((from as HTMLSelectElement).value).toBe(BUCKETS[1]!.value);
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onMark).not.toHaveBeenCalled();
  });
});
