import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EditChrome } from './EditChrome';

/**
 * T032. A chart edited from a tile is held in the session and not yet written
 * by a save (that is AC-183, T192). Saving the dashboard regardless dropped the
 * edit in silence: the bar counted it as a change, Save cleared the count, and
 * the tile went back to the saved chart — AC-034's own failing state, reached
 * through Save, with nothing said.
 *
 * So Save can be held back, with the reason beside it, while the document has
 * something a save cannot keep. Nothing is lost that way; the user can Undo the
 * edit, or keep it and keep editing.
 */
interface Doc {
  readonly tiles: readonly string[];
  readonly unsaveable?: boolean;
}

function Harness({ onSave }: { onSave: (document: Doc) => void }) {
  return (
    <EditChrome<Doc>
      document={{ tiles: ['a'] }}
      title={() => 'Revenue'}
      onSave={onSave}
      saveBlocked={(document) =>
        document.unsaveable === true
          ? 'A chart edited from its tile cannot be saved yet.'
          : undefined
      }
    >
      {(session) => (
        <button
          type="button"
          onClick={() => session.change({ ...session.document, unsaveable: true })}
        >
          Edit a chart
        </button>
      )}
    </EditChrome>
  );
}

const save = () =>
  screen.getByRole('toolbar', { name: 'Dashboard editing' }).querySelector('.edit-bar__save');

describe('holding Save back', () => {
  it('leaves Save as it was when nothing blocks it', async () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(save()?.getAttribute('aria-disabled')).toBe('false');
  });

  it('holds Save back, and says why, while the document cannot be saved whole', async () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit a chart' }));

    expect(save()?.getAttribute('aria-disabled')).toBe('true');
    // The reason beside the control, and tied to it for assistive technology.
    const reason = screen.getByTestId('save-blocked');
    expect(reason.textContent).toBe('A chart edited from its tile cannot be saved yet.');
    expect(save()?.getAttribute('aria-describedby')).toBe(reason.id);
  });

  it('does not save, and stays in edit mode, when Save is pressed anyway', async () => {
    /**
     * The point: pressing it must not do what it used to — save without the
     * edit and leave edit mode, which is what put the old chart back on the
     * tile and lost the edit.
     */
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit a chart' }));

    await userEvent.click(save() as HTMLElement);

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('toolbar', { name: 'Dashboard editing' })).toBeTruthy();
  });
});
