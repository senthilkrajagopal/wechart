import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EditChrome } from './EditChrome';

/**
 * T032, narrowed at T192. Save can be held back, with the reason beside it,
 * while the document has something a save cannot keep — since T192, a chart
 * edited from a tile that cannot be written with the dashboard (a library
 * chart, one local to another dashboard, one with no version). Saving
 * regardless once dropped such an edit in silence: the bar counted it as a
 * change, Save cleared the count, and the tile went back to the saved chart —
 * AC-034's own failing state, reached through Save, with nothing said.
 *
 * Nothing is lost this way; the user can Undo the edit, or keep it and keep
 * editing. These tests hold for any reason a caller gives; the reasons
 * themselves are `whyUnsaveable`'s, tested in `chartDrafts.test.ts`.
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
        <>
          <button
            type="button"
            onClick={() => session.change({ ...session.document, unsaveable: true })}
          >
            Edit a chart
          </button>
          {/* A save from inside the session — the chart editor's "Save
              dashboard" (direction.md §2) — handing over the document with
              its own last change in it. */}
          <button
            type="button"
            onClick={() => {
              session.save({ ...session.document, tiles: [...session.document.tiles, 'b'] });
            }}
          >
            Add a tile and save
          </button>
          <button
            type="button"
            onClick={() => {
              session.save({ ...session.document, unsaveable: true });
            }}
          >
            Edit a chart and save
          </button>
        </>
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

describe('saving from inside the session', () => {
  it('saves the document it is handed, and leaves edit mode as Save does', async () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add a tile and save' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({ tiles: ['a', 'b'] });
    expect(screen.queryByRole('toolbar', { name: 'Dashboard editing' })).toBeNull();
  });

  it('refuses a document that cannot be saved whole, and keeps it as a change', async () => {
    /**
     * The same refusal as the bar's Save — this is the other route to saving
     * that `EditChrome` refuses in its own handler for. And the document is
     * kept, not dropped: it carries the user's last change, which a refusal
     * must not lose.
     */
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    await userEvent.click(screen.getByRole('button', { name: 'Edit a chart and save' }));

    expect(onSave).not.toHaveBeenCalled();
    const bar = screen.getByRole('toolbar', { name: 'Dashboard editing' });
    expect(
      within(bar)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toContain('Discard (1 change)');
    expect(save()?.getAttribute('aria-disabled')).toBe('true');
  });
});
