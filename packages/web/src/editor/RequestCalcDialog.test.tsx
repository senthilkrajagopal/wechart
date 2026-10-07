import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { RequestCalcDialog } from './RequestCalcDialog';

/**
 * T383 / AC-050: WHEN the user requests a calculation the menu cannot
 * express, THE SYSTEM SHALL record a request carrying the chart, the fields
 * in use and the user's description, and show it to the read-write members
 * of the folder whose model defines the chart's cube.
 * Fails when: the request is stored without the chart reference, or is not
 * shown to that folder's read-write members.
 *
 * The dialog: what the request carries, shown before it is sent, and the
 * description the user writes. Sending is its caller's (`calcRequests.ts`).
 */
const FIELDS = {
  measures: ['orders.total_amount'],
  dimensions: ['orders.status'],
  timeDimensions: ['orders.ordered_at'],
  filters: [],
};
const TITLES: Record<string, string> = {
  'orders.total_amount': 'Total amount',
  'orders.status': 'Status',
  'orders.ordered_at': 'Ordered at',
};

function shown(onSend = vi.fn(async () => {})) {
  const onClose = vi.fn();
  render(
    <RequestCalcDialog
      measureTitle="Total amount"
      cubeTitle="Orders"
      fields={FIELDS}
      titleOf={(member) => TITLES[member] ?? member}
      onSend={onSend}
      onClose={onClose}
    />,
  );
  return { onSend, onClose, dialog: screen.getByRole('dialog', { name: 'Request a calculation' }) };
}

describe('requesting a calculation the menu can’t express (T383, AC-050)', () => {
  it('shows the fields the request carries, by title', () => {
    const { dialog } = shown();

    expect(within(dialog).getByTestId('request-fields').textContent).toBe(
      'Metrics: Total amount · Dimensions: Status · Time: Ordered at',
    );
    expect(within(dialog).getByTestId('request-note').textContent).toBe(
      'Describe the calculation you need on Total amount. It goes, with this chart and its fields, to the people who may change the model that defines Orders.',
    );
  });

  it('sends the description written, once there is one, then says it was sent', async () => {
    const { dialog, onSend } = shown();
    const send = within(dialog).getByRole('button', { name: 'Send request' });
    expect(send.hasAttribute('disabled')).toBe(true);

    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'What should it calculate?' }),
      '  Margin: amount less cost  ',
    );
    await userEvent.click(send);

    expect(onSend).toHaveBeenCalledWith('Margin: amount less cost');
    expect((await within(dialog).findByRole('status')).textContent).toBe(
      'Sent. It’s listed for them under Reviews › Calculation requests.',
    );
  });

  it('says why a request was refused, and keeps what was written', async () => {
    const { dialog } = shown(
      vi.fn(async () => {
        throw new Error('No shared folder’s model defines orders, so there is no one to ask.');
      }),
    );
    const box = within(dialog).getByRole('textbox', { name: 'What should it calculate?' });
    await userEvent.type(box, 'Margin');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));

    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'No shared folder’s model defines orders, so there is no one to ask.',
    );
    expect((box as HTMLTextAreaElement).value).toBe('Margin');
  });

  /** As the Propose dialog's description (references.md): counted, and nothing silently cut. */
  it('counts what is written, and won’t send more than 1,000 characters', async () => {
    const { dialog, onSend } = shown();
    const box = within(dialog).getByRole('textbox', { name: 'What should it calculate?' });
    await userEvent.click(box);
    await userEvent.paste('x'.repeat(1001));

    expect(within(dialog).getByTestId('request-count').textContent).toBe('1,001 / 1,000');
    expect(within(dialog).getByText('Shorten to 1,000 characters')).toBeTruthy();
    const send = within(dialog).getByRole('button', { name: 'Send request' });
    expect(send.hasAttribute('disabled')).toBe(true);
    await userEvent.click(send);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('closes on Cancel and on Escape', async () => {
    const { dialog, onClose } = shown();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

/**
 * T639 (direction.md rule 85; T405's re-audit): Escape or Cancel asks before
 * a typed description is lost, Escape over the question keeps editing, and
 * focus goes back to what opened it. Once sent, nothing is lost: Close closes.
 */
describe('the request dialog from the keyboard (T639, rule 85)', () => {
  function Opener({ onSend = vi.fn(async () => {}) }: { onSend?: () => Promise<void> }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Calculations on Total amount
        </button>
        {open ? (
          <RequestCalcDialog
            measureTitle="Total amount"
            cubeTitle="Orders"
            fields={FIELDS}
            titleOf={(member) => TITLES[member] ?? member}
            onSend={onSend}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </>
    );
  }
  const describing = () => screen.getByRole('textbox', { name: 'What should it calculate?' });

  it('closes on Escape with nothing typed, giving focus back to its opener', async () => {
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Calculations on Total amount' });
    await userEvent.click(opener);
    expect(document.activeElement).toBe(describing());
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('asks before Escape or Cancel loses a typed description', async () => {
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Calculations on Total amount' });
    await userEvent.click(opener);
    await userEvent.type(describing(), 'Margin');
    await userEvent.keyboard('{Escape}');
    const asking = screen.getByRole('alertdialog', { name: 'Discard your changes?' });
    expect(asking.textContent).toContain('The description you typed isn’t kept.');
    expect(document.activeElement).toBe(
      within(asking).getByRole('button', { name: 'Keep editing' }),
    );
    // Escape answers it as Keep editing does: the dialog and its text stay.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((describing() as HTMLTextAreaElement).value).toBe('Margin');
    expect(document.activeElement).toBe(describing());

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Discard changes' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  /**
   * T639's review: in a dashboard's chart editor the overlay goes back on an
   * Escape it hears on the document, unless one was handled first, so the
   * dialog's own Escape has to come first and say it was handled.
   */
  it('takes its Escape before the editor it is opened over goes back', async () => {
    const back = vi.fn();
    const overlay = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) back();
    };
    document.addEventListener('keydown', overlay);
    try {
      render(<Opener />);
      await userEvent.click(screen.getByRole('button', { name: 'Calculations on Total amount' }));
      await userEvent.type(describing(), 'Margin');
      await userEvent.keyboard('{Escape}');
      expect(screen.getByRole('alertdialog', { name: 'Discard your changes?' })).toBeTruthy();
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect((describing() as HTMLTextAreaElement).value).toBe('Margin');
      expect(back).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', overlay);
    }
  });

  it('asks after a refusal too, the description still to be sent', async () => {
    render(
      <Opener
        onSend={vi.fn(async () => {
          throw new Error('No one to ask.');
        })}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Calculations on Total amount' }));
    await userEvent.type(describing(), 'Margin');
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await screen.findByRole('alert');
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog', { name: 'Discard your changes?' })).toBeTruthy();
  });

  it('closes at once once sent, nothing being lost', async () => {
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Calculations on Total amount' });
    await userEvent.click(opener);
    await userEvent.type(describing(), 'Margin');
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await screen.findByRole('status');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});
