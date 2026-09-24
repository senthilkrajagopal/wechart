import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EditChrome } from './EditChrome';

/**
 * T059 / AC-053: WHEN the user activates Edit on a dashboard, THE SYSTEM SHALL
 * show the edit bar with Undo, Redo, Discard and Save, and the edit sidebar
 * with Add, Outline and Properties.
 *
 * `Fails when: any of those controls is missing in edit mode` — so the tests
 * assert the whole set in one go rather than one control per test, which
 * catches a rename or a conditional that hides one of them. The assertion is
 * on the exact list, in order: when the bar legitimately grows a control
 * (T071's gear, say) this test is meant to be the thing that notices and be
 * updated deliberately, rather than letting the bar drift.
 *
 * What the controls *do* is not this task: Undo and Redo restore deletions at
 * T066, Discard at T072 and Save at T071. What is settled here is that edit
 * mode is a mode — off until the user asks for it (which AC-018 needs too, so
 * that a dashboard opens in view mode) — and that entering it reveals all
 * seven controls.
 *
 * The session's document is a type parameter: the dashboard document's shape
 * is the grid's business (T060 onwards), and the chrome does not read it.
 */

/** Stands in for a dashboard document. The chrome never looks inside it. */
interface Doc {
  readonly tiles: readonly string[];
}

const DOC: Doc = { tiles: ['a'] };

function Harness({ onSave = vi.fn() }: { onSave?: (document: Doc) => void }) {
  return (
    <EditChrome document={DOC} title={() => 'Revenue'} onSave={onSave}>
      {(session) => (
        <button type="button" onClick={() => session.change({ tiles: ['a', 'b'] })}>
          Add a tile
        </button>
      )}
    </EditChrome>
  );
}

const bar = () => screen.getByRole('toolbar', { name: 'Dashboard editing' });
const sidebar = () => screen.getByRole('complementary', { name: 'Edit sidebar' });

describe('activating Edit', () => {
  it('opens in view mode, with no edit bar and no sidebar', () => {
    render(<Harness />);

    // AC-018 rests on this: a dashboard that opened in edit mode would fail it.
    expect(screen.queryByRole('toolbar', { name: 'Dashboard editing' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Edit sidebar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('reveals the whole edit bar', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const controls = Array.from(bar().querySelectorAll('button')).map(
      (button) => button.getAttribute('aria-label') ?? button.textContent,
    );
    expect(controls).toEqual(['Undo', 'Redo', 'Discard', 'Save']);
  });

  it('reveals the sidebar with its three panels', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Add', 'Outline', 'Properties']);
    expect(sidebar().contains(screen.getByRole('tabpanel', { name: 'Add' }))).toBe(true);
  });

  it('keeps showing the dashboard itself while editing', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    // Edit is in place, not a separate screen (direction.md section 2: "An
    // explicit Edit switches the dashboard in place").
    expect(screen.getByRole('button', { name: 'Add a tile' })).toBeTruthy();
  });
});

describe('what the bar reports', () => {
  it('has nothing to undo or redo when editing has just begun, and Discard is the way out', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    for (const name of ['Undo', 'Redo']) {
      // aria-disabled rather than the disabled attribute: a toolbar item that
      // leaves the tab order when idle changes the bar's shape under the user,
      // and AC-053 asks that these controls be there.
      expect(screen.getByRole('button', { name }).getAttribute('aria-disabled')).toBe('true');
    }
    // Save and Discard stay available: saving an unchanged dashboard is
    // harmless, and Discard with nothing changed leaves edit mode (AC-204).
    for (const name of ['Save', 'Discard']) {
      expect(screen.getByRole('button', { name }).getAttribute('aria-disabled')).toBe('false');
    }
  });

  it('counts the changes made since editing began', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add a tile' }));

    // Queried by prefix: the count is part of the visible label, so it is part
    // of the accessible name too — an aria-label of plain "Discard" over a
    // visible "Discard (1 change)" would fail WCAG 2.5.3.
    expect(screen.getByRole('button', { name: /^Discard/ }).textContent).toBe('Discard (1 change)');
    expect(screen.getByRole('button', { name: 'Undo' }).getAttribute('aria-disabled')).toBe(
      'false',
    );
  });

  it('counts the changes still in effect, one fewer after an Undo', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add a tile' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add a tile' }));
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    // Two changes made and one undone: the count has to mean "changes still
    // in effect", which is one.
    expect(screen.getByRole('button', { name: /^Discard/ }).textContent).toBe('Discard (1 change)');
  });

  it('edits the dashboard as it stands now, not as it was when the page mounted', async () => {
    const onSave = vi.fn();
    const { rerender } = render(
      <EditChrome document={DOC} title={() => 'Revenue'} onSave={onSave}>
        {() => null}
      </EditChrome>,
    );

    // The dashboard arrives from the server after the first render, which is
    // the normal case once a route loads one (T023).
    const loaded: Doc = { tiles: ['loaded'] };
    rerender(
      <EditChrome document={loaded} title={() => 'Revenue'} onSave={onSave}>
        {() => null}
      </EditChrome>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith(loaded);
  });

  it('leaves edit mode once it is saved, with nothing left to discard', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add a tile' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    // AC-065's second half. And the session re-seeds from what was saved, or
    // "Discard (1 change)" would still be offering to undo work that is now
    // safely stored.
    expect(screen.queryByRole('toolbar', { name: 'Dashboard editing' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Discard' }).textContent).toBe('Discard');
  });

  it('hands the current document to Save', async () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add a tile' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith({ tiles: ['a', 'b'] });
  });
});

describe('the bar as a toolbar', () => {
  it('is one tab stop, with the arrow keys moving inside it', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    // Declaring role="toolbar" promises the APG pattern: someone who hears
    // "toolbar" and presses Tab expects to leave it, not to walk four buttons.
    const tabbable = Array.from(bar().querySelectorAll('button')).filter(
      (button) => button.tabIndex === 0,
    );
    expect(tabbable).toHaveLength(1);

    screen.getByRole('button', { name: 'Undo' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Redo' }));

    await userEvent.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' }));
  });

  it('keeps an idle control focusable, but refuses to act on it', async () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const undo = screen.getByRole('button', { name: 'Undo' });
    undo.focus();
    expect(document.activeElement).toBe(undo);

    // Nothing has been changed, so Undo has nothing to undo. Clicking it must
    // not throw or alter the session.
    await userEvent.click(undo);
    expect(screen.getByRole('button', { name: 'Discard' }).textContent).toBe('Discard');
  });
});

describe('the sidebar panels', () => {
  it('shows one panel at a time, and the chosen one', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Outline' }));

    expect(screen.getByRole('tab', { name: 'Outline' }).getAttribute('aria-selected')).toBe('true');
    // The panel takes its name from its tab, so "which panel is open" is a
    // question assistive technology can answer too.
    const panel = screen.getByRole('tabpanel', { name: 'Outline' });
    expect(panel.getAttribute('aria-labelledby')).toBe(
      screen.getByRole('tab', { name: 'Outline' }).id,
    );
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('moves between the tabs with the arrow keys', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    // One tab stop for the whole tablist, arrows within it: the APG tabs
    // pattern, and direction.md rule 39's "every edit-mode action without a
    // mouse".
    screen.getByRole('tab', { name: 'Add' }).focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Outline' }));
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(
      screen.getByRole('tab', { name: 'Outline' }).id,
    );
  });

  it('gives each panel the content its owner passes, and nothing invented', async () => {
    render(
      <EditChrome
        document={DOC}
        title={() => 'Revenue'}
        onSave={vi.fn()}
        panels={() => ({ outline: <p>Page 1</p> })}
      >
        {() => null}
      </EditChrome>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    // Add opens first and its owner passed nothing, so it holds nothing. An
    // invented placeholder would be content the product did not ask for.
    expect(screen.getByRole('tabpanel').textContent).toBe('');

    await userEvent.click(screen.getByRole('tab', { name: 'Outline' }));
    expect(screen.getByRole('tabpanel').textContent).toBe('Page 1');
  });
});
