import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { shortDay } from '../../shell/relativeAge';
import { DeleteDialog, type Checked, type Refusal } from './DeleteDialog';

/**
 * Design 14 (R48), states A–E: every delete first asks what depends on the
 * item, then shows either "Can't delete", with Close alone, or a
 * confirmation ending "You can't undo this.", with Cancel focused and one
 * filled destructive button.
 */
const REFUSED: Refusal = {
  kind: 'refused',
  lead: '3 dashboards use it. Remove it from each of them, then delete it.',
  groups: [
    {
      heading: 'Dashboards that use it',
      rows: [
        {
          key: 'd1',
          icon: 'dashboard',
          name: 'Revenue overview',
          href: '/explore/dashboards/d1',
          where: 'Sales / EMEA',
        },
      ],
    },
  ],
  hidden: 2,
  help: 'A shared dashboard changes through Edit in my workspace and a proposal.',
};

function shown(
  check: () => Promise<Checked>,
  remove = vi.fn(async (): Promise<Refusal | undefined> => undefined),
) {
  const onDeleted = vi.fn();
  const onClose = vi.fn();
  render(
    <DeleteDialog
      name="Top products"
      action="Delete chart"
      check={check}
      remove={remove}
      onDeleted={onDeleted}
      onClose={onClose}
    />,
  );
  return { onDeleted, onClose, remove };
}

describe('the delete dialog (design 14, states A–E)', () => {
  it('asks first, titled as the confirmation, with Delete waiting and Cancel focused', () => {
    shown(() => new Promise(() => undefined));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete “Top products”?' });
    expect(within(dialog).getByText('Checking what uses it…')).not.toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Delete chart' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
  });

  it('refuses with what it may name, each a link in a new tab, counts the rest, and offers Close alone', async () => {
    const { onClose, remove } = shown(async () => REFUSED);
    const dialog = await screen.findByRole('alertdialog', { name: 'Can’t delete “Top products”' });
    expect(dialog.getAttribute('aria-describedby')).not.toBeNull();
    expect(
      document.getElementById(dialog.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('3 dashboards use it. Remove it from each of them, then delete it.');
    const list = within(dialog).getByRole('list', { name: 'Dashboards that use it, 1' });
    const link = within(list).getByRole('link', { name: /Revenue overview/ });
    expect(link.getAttribute('href')).toBe('/explore/dashboards/d1');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(within(list).getByText('Sales / EMEA')).not.toBeNull();
    expect(within(dialog).getByText('…and 2 more in folders you can’t see.')).not.toBeNull();
    expect(
      within(dialog).getByText(
        'A shared dashboard changes through Edit in my workspace and a proposal.',
      ),
    ).not.toBeNull();
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Close']);
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Close' }));
    // What it became, said politely.
    expect(screen.getByRole('status').textContent).toBe(
      'Can’t delete: 3 dashboards use it. Remove it from each of them, then delete it.',
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it('confirms once nothing uses it, ending “You can’t undo this.”, then deletes', async () => {
    const { onDeleted, remove } = shown(async () => ({
      kind: 'confirm',
      text: 'No dashboard uses it.',
    }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete “Top products”?' });
    await waitFor(() => {
      expect(within(dialog).getByText('No dashboard uses it. You can’t undo this.')).not.toBeNull();
    });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    const destroy = within(dialog).getByRole('button', { name: 'Delete chart' });
    expect(destroy.className).toContain('dialog__destructive');
    expect(destroy.className).toContain('btn-primary');
    await userEvent.click(destroy);
    expect(remove).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalledTimes(1);
    });
  });

  it('says so, and deletes nothing, when something took it up after the confirmation opened (A4)', async () => {
    const { onDeleted } = shown(
      async () => ({ kind: 'confirm', text: 'No dashboard uses it.' }),
      vi.fn(async () => ({
        ...REFUSED,
        lead: 'A dashboard started using it just now. Nothing was deleted.',
        hidden: 0,
      })),
    );
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete “Top products”?' });
    await act(async () => {
      await userEvent.click(within(dialog).getByRole('button', { name: 'Delete chart' }));
    });
    const refused = await screen.findByRole('alertdialog', {
      name: 'Can’t delete “Top products”',
    });
    expect(
      within(refused).getByText('A dashboard started using it just now. Nothing was deleted.'),
    ).not.toBeNull();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('can’t be cancelled while the delete is under way, which goes on to its end', async () => {
    let finish: (value: Refusal | undefined) => void = () => undefined;
    const { onClose, onDeleted } = shown(
      async () => ({ kind: 'confirm', text: 'Nothing uses it.' }),
      vi.fn(
        () =>
          new Promise<Refusal | undefined>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete “Top products”?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete chart' }));
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveProperty('disabled', true);
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      finish(undefined);
      await Promise.resolve();
    });
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it('lists what goes with it, and names each open proposal it withdraws (B3; T528, AC-372)', async () => {
    shown(async () => ({
      kind: 'confirm',
      text: 'These go with it:',
      goes: [
        { key: 'own', icon: 'chart', text: 'Its 2 own charts', aside: 'on no other dashboard' },
      ],
      note: 'The 1 library chart it shows stays in its folder.',
      withdraws: [
        {
          id: 'p1',
          title: 'Revenue overview',
          targetPath: 'Sales / EMEA',
          proposedAt: '2026-09-29T10:00:00.000Z',
        },
      ],
    }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete “Top products”?' });
    const goes = await within(dialog).findByRole('list', { name: 'These go with it:' });
    expect(
      within(goes)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual(['Its 2 own charts on no other dashboard']);
    const proposals = within(dialog).getByRole('list', {
      name: 'It withdraws its open proposal',
    });
    expect(
      within(proposals)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual([
      // The day as Reviews says it: with its year once that isn't this one.
      `Waiting for review Revenue overview → Sales / EMEA · ${shortDay(new Date('2026-09-29T10:00:00.000Z'), new Date())}`,
    ]);
    expect(
      within(dialog).getByText(
        'The 1 library chart it shows stays in its folder. You can’t undo this.',
      ),
    ).not.toBeNull();
  });

  it('cancels on Escape from the confirmation', async () => {
    const { onClose, remove } = shown(async () => ({ kind: 'confirm', text: 'Nothing uses it.' }));
    await screen.findByText('Nothing uses it. You can’t undo this.');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });
});
