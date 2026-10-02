import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProposeDialog, type ProposalCheck } from './ProposeDialog';

/**
 * T358 (AC-284; design 05 of 2026-09-27, states A, B and F; rule 75): the
 * Propose dialog. It names the target and what the item does there, new or
 * "replaces version n", and lists what goes with it with the reason, with no
 * way to take any out. The description is optional, counted in characters as
 * the API counts them, and never cut: past 1,000, Propose waits. What
 * proposing would do is checked as the dialog opens, so a refusal is said
 * before anything is typed.
 */
const READY: ProposalCheck = {
  state: 'ready',
  targetPath: ['Shared', 'Sales', 'EMEA'],
  items: [
    {
      kind: 'dashboard',
      id: 'd1',
      title: 'Revenue overview',
      landsInPath: ['Shared', 'Sales', 'EMEA'],
      replaces: { id: 'd0', version: 7, copiedFrom: true },
    },
    {
      kind: 'chart',
      id: 'c1',
      title: 'Margin by month',
      landsInPath: ['Shared', 'Finance'],
      replaces: null,
    },
  ],
};

function shown(check: ProposalCheck = READY) {
  const onPropose = vi.fn();
  const onClose = vi.fn();
  render(<ProposeDialog check={check} onPropose={onPropose} onClose={onClose} />);
  return {
    onPropose,
    onClose,
    dialog: screen.getByRole('dialog', { name: 'Propose to Sales / EMEA' }),
  };
}

describe('the Propose dialog (T358, AC-284)', () => {
  it('names the target, what it replaces, and what goes with it, with no way to take any out', () => {
    const { dialog } = shown();
    expect(within(dialog).getByTestId('propose-item').textContent).toBe(
      'Dashboard · Revenue overview — replaces version 7',
    );
    const goes = within(dialog).getByRole('list', { name: 'Goes with it' });
    expect(
      within(goes)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual(['Chart · Margin by month — new in Finance']);
    expect(within(dialog).getByText(/They’re approved or rejected together\./)).not.toBeNull();
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /Remove/ })).toBeNull();
    expect(
      within(dialog).getByText(
        'It lands when someone approves it. You may approve your own; the step is never skipped.',
      ),
    ).not.toBeNull();
  });

  // T350 (AC-285; design 05, state A): the models its cubes resolve through, and why.
  it('lists the workspace models a dashboard resolves through, saying why they go with it', () => {
    const { dialog } = shown({
      ...READY,
      items: [
        ...READY.items,
        {
          kind: 'model',
          id: 'm1',
          title: 'cubes/sales.yml',
          landsInPath: ['Shared', 'Sales', 'EMEA'],
          replaces: { id: 'm0', version: 3, copiedFrom: true },
        },
      ],
    });
    const goes = within(dialog).getByRole('list', { name: 'Goes with it' });
    expect(
      within(goes)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual([
      'Chart · Margin by month — new in Finance',
      'Model · cubes/sales.yml — replaces version 3',
    ]);
    expect(within(dialog).getByTestId('propose-goes').textContent).toBe(
      'The dashboard shows this chart from your workspace, and its cubes resolve through this model only your workspace has. They’re approved or rejected together.',
    );
  });

  it('says a new one is new, and warns when it replaces an item it wasn’t copied from', () => {
    shown({
      ...READY,
      items: [
        {
          kind: 'dashboard',
          id: 'd2',
          title: 'Pipeline by stage',
          landsInPath: ['Shared', 'Sales', 'EMEA'],
          replaces: { id: 'd3', version: 4, copiedFrom: false },
        },
      ],
    });
    const dialog = screen.getByRole('dialog', { name: 'Propose to Sales / EMEA' });
    expect(within(dialog).getByTestId('propose-item').textContent).toBe(
      'Dashboard · Pipeline by stage — replaces version 4',
    );
    expect(within(dialog).getByRole('note').textContent).toBe(
      'Replaces “Pipeline by stage” (version 4), which this item wasn’t copied from. It was made new in your workspace.',
    );
    expect(within(dialog).queryByRole('list', { name: 'Goes with it' })).toBeNull();
  });

  it('counts the description in characters, as the API does, and never cuts it', async () => {
    const { dialog, onPropose } = shown();
    const text = within(dialog).getByRole('textbox', { name: /What changed/ });
    await userEvent.type(text, 'Adds 🌍');
    // An emoji of one code point counts once.
    expect(within(dialog).getByTestId('propose-counter').textContent).toBe('6 / 1,000');
    fireEvent.change(text, { target: { value: 'x'.repeat(1001) } });
    expect(within(dialog).getByTestId('propose-counter').textContent).toBe('1,001 / 1,000');
    expect(within(dialog).getByText('Shorten to 1,000 characters.')).not.toBeNull();
    const propose = within(dialog).getByRole('button', { name: 'Propose' });
    expect((propose as HTMLButtonElement).disabled).toBe(true);
    expect((text as HTMLTextAreaElement).value).toHaveLength(1001);
    fireEvent.change(text, { target: { value: 'x'.repeat(1000) } });
    expect((propose as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(propose);
    expect(onPropose).toHaveBeenCalledWith('x'.repeat(1000));
  });

  it('proposes with ⌘Enter or Ctrl+Enter from the description, and closes with Escape', async () => {
    const { dialog, onPropose, onClose } = shown();
    const text = within(dialog).getByRole('textbox', { name: /What changed/ });
    await userEvent.type(text, 'Monthly view');
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
    expect(onPropose).toHaveBeenLastCalledWith('Monthly view');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(onPropose).toHaveBeenCalledTimes(2);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('says why it can’t be proposed, before anything is typed', () => {
    render(
      <ProposeDialog
        check={{
          state: 'refused',
          targetPath: ['Shared', 'Sales', 'EMEA'],
          error: 'It is waiting for review already: its proposal must be decided first.',
        }}
        onPropose={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Propose to Sales / EMEA' });
    expect(within(dialog).getByRole('alert').textContent).toBe(
      'Can’t propose: It is waiting for review already: its proposal must be decided first.',
    );
    expect(
      (within(dialog).getByRole('button', { name: 'Propose' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(within(dialog).getByRole('button', { name: 'Close' })).not.toBeNull();
  });

  it('waits for the check, and shows a failed proposal’s reason', () => {
    const { rerender } = render(
      <ProposeDialog
        check={{ state: 'checking', targetPath: ['Shared', 'Sales'] }}
        onPropose={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Propose to Sales' });
    expect(within(dialog).getByRole('status').textContent).toBe('Checking what it would replace…');
    expect(
      (within(dialog).getByRole('button', { name: 'Propose' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    rerender(
      <ProposeDialog
        check={READY}
        onPropose={vi.fn()}
        onClose={vi.fn()}
        failure="It changed since you opened it. Try again."
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe(
      'It changed since you opened it. Try again.',
    );
  });
});

describe('proposing a restore (T357, AC-289; design 06, state C)', () => {
  it('is titled for the version, says whose content replaces what, and is filled in, editable', async () => {
    const onPropose = vi.fn();
    render(
      <ProposeDialog
        check={READY}
        onPropose={onPropose}
        onClose={vi.fn()}
        restoring={{ version: 5, description: 'Restore version 5 (approved 22 Sep by Ada Admin).' }}
      />,
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Propose restoring version 5 to Sales / EMEA',
    });
    expect(within(dialog).getByTestId('propose-item').textContent).toBe(
      'Dashboard · Revenue overview — replaces version 7 with version 5’s content',
    );
    const text = within(dialog).getByLabelText(/What changed/) as HTMLTextAreaElement;
    expect(text.value).toBe('Restore version 5 (approved 22 Sep by Ada Admin).');
    expect(within(dialog).getByTestId('propose-counter').textContent).toBe('49 / 1,000');
    expect(dialog.textContent).toContain('Nothing changes until it’s approved.');
    await userEvent.type(text, ' Again.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Propose' }));
    expect(onPropose).toHaveBeenCalledWith(
      'Restore version 5 (approved 22 Sep by Ada Admin). Again.',
    );
  });
});
