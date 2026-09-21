import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { EditChrome } from './EditChrome';

/**
 * T197 / AC-184: IF a dashboard save fails, THEN THE SYSTEM SHALL stay in edit
 * mode with every change made in the session kept, including charts edited
 * from its tiles, and show why the save failed.
 *
 * `EditChrome` left edit mode and re-seeded its session the moment Save was
 * pressed, before anyone knew whether the save went through — so a failed
 * save took every change with it. A caller that returns a promise from
 * `onSave` now decides that: edit mode is left when it resolves, and the
 * session is kept when it rejects. (Showing why is the caller's; the
 * dashboard page does, beside the dashboard.)
 */
interface Doc {
  readonly tiles: readonly string[];
}

/** An `onSave` whose outcome the test decides, and the documents it was asked to save. */
function pendingSave() {
  const saved: Doc[] = [];
  let settle: { resolve: () => void; reject: (reason: Error) => void } | undefined;
  const onSave = (document: Doc) => {
    saved.push(document);
    return new Promise<void>((resolve, reject) => {
      settle = { resolve, reject };
    });
  };
  // Settling a save that was never sent is a broken test, not a pass.
  const sent = () => {
    if (settle === undefined) throw new Error('No save was sent to settle.');
    return settle;
  };
  return {
    saved,
    onSave,
    succeed: () => act(async () => sent().resolve()),
    fail: () => act(async () => sent().reject(new Error('Could not save: 409'))),
  };
}

function Harness({ onSave }: { onSave: (document: Doc) => Promise<void> }) {
  return (
    <EditChrome<Doc> document={{ tiles: ['a'] }} title={() => 'Revenue'} onSave={onSave}>
      {(session) => (
        <>
          <p data-testid="tiles">{session.document.tiles.join(',')}</p>
          <button
            type="button"
            onClick={() => session.change({ tiles: [...session.document.tiles, 'b'] })}
          >
            Add a tile
          </button>
          <button
            type="button"
            onClick={() => {
              session.save({ tiles: [...session.document.tiles, 'c'] });
            }}
          >
            Add a tile and save
          </button>
          {/* The session's own Undo, as a deletion toast offers it (AC-060). */}
          <button type="button" onClick={() => session.undo()}>
            Undo from the toast
          </button>
        </>
      )}
    </EditChrome>
  );
}

const bar = () => screen.queryByRole('toolbar', { name: 'Dashboard editing' });
const barButtons = () =>
  within(bar() as HTMLElement)
    .getAllByRole('button')
    .map((button) => button.textContent);

async function editAndAddATile(onSave: (document: Doc) => Promise<void>) {
  render(<Harness onSave={onSave} />);
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add a tile' }));
}

describe('saving, while the save is under way', () => {
  it('stays in edit mode and says it is saving, with Save not pressable again', async () => {
    const save = pendingSave();
    await editAndAddATile(save.onSave);

    await userEvent.click(within(bar() as HTMLElement).getByRole('button', { name: 'Save' }));

    expect(bar()).toBeTruthy();
    const saving = within(bar() as HTMLElement).getByRole('button', { name: 'Saving…' });
    expect(saving.getAttribute('aria-disabled')).toBe('true');
    // Pressed again: no second save of the same session.
    await userEvent.click(saving);
    expect(save.saved).toHaveLength(1);
  });

  it('keeps focus on Save as it becomes "Saving…"', async () => {
    // The same button relabelled, not a new one put in its place: a keyboard
    // user who pressed Save stays where they were.
    const save = pendingSave();
    await editAndAddATile(save.onSave);
    within(bar() as HTMLElement)
      .getByRole('button', { name: 'Save' })
      .focus();

    await userEvent.keyboard('{Enter}');

    expect(document.activeElement?.textContent).toBe('Saving…');
    expect(save.saved).toHaveLength(1);
  });

  it('takes no further change while it is saving', async () => {
    /**
     * A change made now would be dropped by a save that then succeeds — the
     * session is re-seeded from what was saved — with nothing said.
     */
    const save = pendingSave();
    await editAndAddATile(save.onSave);
    await userEvent.click(within(bar() as HTMLElement).getByRole('button', { name: 'Save' }));

    await userEvent.click(screen.getByRole('button', { name: 'Add a tile' }));

    expect(screen.getByTestId('tiles').textContent).toBe('a,b');
  });

  it('holds every control on the bar back, and undoes nothing from elsewhere', async () => {
    // Undo, Redo and Discard now would change a document the save has
    // already taken — and so would the session's Undo reached from a toast.
    const save = pendingSave();
    await editAndAddATile(save.onSave);
    await userEvent.click(within(bar() as HTMLElement).getByRole('button', { name: 'Save' }));

    const disabled = within(bar() as HTMLElement)
      .getAllByRole('button')
      .map((button) => [button.textContent, button.getAttribute('aria-disabled')]);
    expect(disabled).toEqual([
      ['Undo', 'true'],
      ['Redo', 'true'],
      ['Discard (1 change)', 'true'],
      ['Saving…', 'true'],
    ]);

    await userEvent.click(
      within(bar() as HTMLElement).getByRole('button', { name: 'Discard (1 change)' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Undo from the toast' }));
    expect(screen.getByTestId('tiles').textContent).toBe('a,b');
  });
});

describe('saving, once the save has gone through', () => {
  it('leaves edit mode', async () => {
    const save = pendingSave();
    await editAndAddATile(save.onSave);
    await userEvent.click(within(bar() as HTMLElement).getByRole('button', { name: 'Save' }));

    await save.succeed();

    expect(bar()).toBeNull();
    expect(save.saved).toEqual([{ tiles: ['a', 'b'] }]);
  });
});

describe('saving, when the save fails (AC-184)', () => {
  it('stays in edit mode with every change kept, and Save can be pressed again', async () => {
    const save = pendingSave();
    await editAndAddATile(save.onSave);
    await userEvent.click(within(bar() as HTMLElement).getByRole('button', { name: 'Save' }));

    await save.fail();

    expect(save.saved).toEqual([{ tiles: ['a', 'b'] }]);
    expect(bar()).toBeTruthy();
    expect(screen.getByTestId('tiles').textContent).toBe('a,b');
    expect(barButtons()).toContain('Discard (1 change)');
    expect(
      within(bar() as HTMLElement)
        .getByRole('button', { name: 'Save' })
        .getAttribute('aria-disabled'),
    ).toBe('false');

    // And the change is still undoable, as any other.
    await userEvent.click(within(bar() as HTMLElement).getByRole('button', { name: 'Undo' }));
    expect(screen.getByTestId('tiles').textContent).toBe('a');
  });

  it('keeps the change a save from inside the session was made with', async () => {
    // The chart editor's Save dashboard hands over the document with its own
    // last change in it — the chart it applies. A failed save must not drop it.
    const save = pendingSave();
    await editAndAddATile(save.onSave);

    await userEvent.click(screen.getByRole('button', { name: 'Add a tile and save' }));
    await save.fail();

    expect(bar()).toBeTruthy();
    expect(screen.getByTestId('tiles').textContent).toBe('a,b,c');
    expect(barButtons()).toContain('Discard (2 changes)');
  });
});
