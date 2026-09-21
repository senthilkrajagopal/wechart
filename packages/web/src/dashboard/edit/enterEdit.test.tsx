import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EditChrome } from './EditChrome';

/**
 * T032 needs something other than the Edit button to be able to enter edit
 * mode. direction.md §2: "A tile's ✎ pencil opens the chart editor as a
 * full-viewport overlay … From view mode, the pencil switches the dashboard
 * into edit mode first."
 *
 * The session could change, undo and report its state, but only `EditChrome`
 * itself could start editing. This adds `session.edit()`.
 */
interface Doc {
  readonly tiles: readonly string[];
}

const DOC: Doc = { tiles: ['a'] };

function Harness() {
  return (
    <EditChrome document={DOC} title={() => 'Revenue'} onSave={vi.fn()}>
      {(session) => (
        <>
          <button type="button" onClick={() => session.edit()}>
            Pencil
          </button>
          <button
            type="button"
            onClick={() => session.change({ tiles: [...session.document.tiles, 'b'] })}
          >
            Add a tile
          </button>
          <p data-testid="tiles">{session.document.tiles.join(',')}</p>
        </>
      )}
    </EditChrome>
  );
}

const bar = () => screen.queryByRole('toolbar', { name: 'Dashboard editing' });

describe('entering edit mode from inside the dashboard', () => {
  it('shows the edit bar, as the Edit button does', async () => {
    render(<Harness />);
    expect(bar()).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Pencil' }));

    expect(bar()).not.toBeNull();
  });

  it('does nothing while already editing, so every change stays discardable', async () => {
    /**
     * Entering edit mode starts a fresh history — that is what makes Discard
     * return to where editing began (AC-066). A pencil pressed while editing
     * must not enter again. Doing so keeps the document as it is, so nothing
     * *looks* lost, but it moves the baseline to here: the user's changes
     * stay applied and can no longer be discarded, and the bar reports none.
     * Quieter than losing them, and worse for it.
     */
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Pencil' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add a tile' }));
    expect(screen.getByTestId('tiles').textContent).toBe('a,b');

    await userEvent.click(screen.getByRole('button', { name: 'Pencil' }));

    expect(screen.getByTestId('tiles').textContent).toBe('a,b');
    // And the change is still one Discard would undo.
    expect(screen.getByRole('button', { name: /Discard/ }).textContent).toBe('Discard (1 change)');
  });
});
