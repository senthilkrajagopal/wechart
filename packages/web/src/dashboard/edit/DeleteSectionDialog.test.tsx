import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DeleteSectionDialog } from './DeleteSectionDialog';

/**
 * T182 / AC-176: the section question from the keyboard. Its owner hands it a
 * fresh `onCancel` on every render — the dashboard re-renders when a chart's
 * answer arrives or the undo toast times out — and none of those may pull
 * focus back onto "Keep the items" from wherever the user has Tabbed to, where
 * the next Enter would ungroup the section.
 */
const ask = (onCancel: () => void) => (
  <DeleteSectionDialog
    title="Detail"
    count={2}
    onDeleteContents={vi.fn()}
    onKeepContents={vi.fn()}
    onCancel={onCancel}
  />
);

describe('the section delete question', () => {
  it('opens on the answer that loses nothing', () => {
    render(ask(vi.fn()));

    expect(document.activeElement).toBe(screen.getByTestId('keep-contents'));
  });

  it('leaves focus where the user moved it when its owner re-renders', async () => {
    const { rerender } = render(ask(() => undefined));
    // Back from Keep, past Delete, to Cancel: the foot reads Cancel · Delete ·
    // Keep since T466's dialog pattern.
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    const cancel = screen.getByTestId('cancel-delete-section');
    expect(document.activeElement).toBe(cancel);

    rerender(ask(() => undefined));

    expect(document.activeElement).toBe(cancel);
  });

  it('answers Escape with the latest Cancel it was given', async () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(ask(first));
    rerender(ask(latest));

    await userEvent.keyboard('{Escape}');

    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
