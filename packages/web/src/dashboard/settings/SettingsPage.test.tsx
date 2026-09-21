import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../DashboardView';
import type { DashboardDocument } from '../model/document';
import { SETTINGS_SECTIONS } from './SettingsPage';

/**
 * T075 / AC-069: WHEN the user activates the gear control on a dashboard, THE
 * SYSTEM SHALL open a settings page with General, Interactions, Markings,
 * Cross-filtering and Layout sections, and a way to return without saving.
 * `Fails when: a section is missing, or leaving the page applies changes that
 * were not saved.`
 *
 * The five sections are named in the criterion, so they are asserted by name
 * and in order rather than by counting five of something.
 *
 * The second half needs a change to actually make: "leaving applies nothing"
 * cannot fail on a page where nothing can be altered, and a test that opened
 * the page and closed it again would pass for the wrong reason forever. So
 * these go through General's name field, which direction.md puts there, and
 * check the dashboard itself afterwards.
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Revenue',
  settings: { width: 'fixed' },
  pages: [{ id: 'p1', title: 'Overview', items: [{ id: 'a', kind: 'chart', w: 6, h: 40 }] }],
};

const show = (onSave = vi.fn()) => {
  render(<DashboardView document={DOC} specs={{}} onSave={onSave} />);
  return onSave;
};

const openSettings = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Dashboard settings' }));
};

const edit = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
};

describe('the dashboard settings page', () => {
  it('opens from the gear in view mode', async () => {
    show();
    expect(screen.queryByTestId('dashboard-settings')).toBeNull();

    await openSettings();

    expect(screen.getByTestId('dashboard-settings')).toBeTruthy();
  });

  it('opens from the gear while editing too', async () => {
    // direction.md puts the gear in the header "in view and edit mode", and
    // settings are the kind of thing someone reaches for mid-edit.
    show();
    await edit();

    await openSettings();

    expect(screen.getByTestId('dashboard-settings')).toBeTruthy();
  });

  it('offers all five sections the criterion names, in order', async () => {
    show();
    await openSettings();

    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    const buttons = [...nav.querySelectorAll('button')];

    expect(buttons.map((button) => button.dataset['section'])).toEqual([
      'General',
      'Interactions',
      'Markings',
      'Cross-filtering',
      'Layout',
    ]);
    // And each one actually says its name. On the attribute alone a nav of
    // unlabelled buttons would satisfy the criterion.
    for (const button of buttons) {
      expect(button.textContent).toContain(button.dataset['section']);
    }
  });

  it('opens each of the five, not just the one', async () => {
    // Every section, because "a section is missing" is the criterion's failing
    // state and a nav entry that led nowhere would satisfy the list above
    // while failing the criterion.
    show();
    await openSettings();

    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    for (const section of SETTINGS_SECTIONS) {
      const button = nav.querySelector<HTMLButtonElement>(`[data-section="${section}"]`);
      if (button === null) throw new Error(`no nav entry for ${section}`);
      await userEvent.click(button);

      expect(screen.getByRole('heading', { name: section })).toBeTruthy();
      // And the nav says which one you are in, so the page is navigable
      // rather than merely reachable.
      expect(button.getAttribute('aria-current')).toBe('true');
      expect(screen.getByRole('region', { name: `${section} settings` })).toBeTruthy();
    }
  });

  it('names the dashboard on the way back, so the exit is not a guess', async () => {
    show();
    await openSettings();

    expect(screen.getByTestId('settings-back').textContent).toContain('Revenue');
  });

  it('applies nothing when the page is left without saving', async () => {
    const onSave = show();
    await openSettings();

    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Something else');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    // Since T079 leaving with changes asks first (AC-073). The change must
    // still not survive — that is AC-069's clause either way — so the
    // confirmation is answered rather than the assertion relaxed.
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    // Back on the dashboard, with the title it had. The criterion's failing
    // state is a change surviving the exit, so both are checked: the heading
    // the user reads, and that nothing was handed to the save.
    expect(screen.getByRole('heading', { name: 'Revenue' })).toBeTruthy();
    expect(screen.queryByTestId('dashboard-settings')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('applies nothing when the way back is the Back link rather than Cancel', async () => {
    // Two ways out of the page, and a change must not survive either. Cancel
    // is the obvious one; "← Back to Revenue" is the one someone reaches for
    // without thinking of it as cancelling.
    const onSave = show();
    await openSettings();

    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Something else');

    await userEvent.click(screen.getByTestId('settings-back'));
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(screen.getByRole('heading', { name: 'Revenue' })).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('applies nothing when the page is left without saving while editing', async () => {
    /**
     * The two cancel cases above run in view mode, where `EditChrome` takes
     * the prop as the truth — so a leak into the session is invisible there
     * and they can only catch one through `onSave`. Editing is a different
     * branch, and it is the branch where a leak is *possible*: a change
     * written to the session would show on the canvas and count on the bar.
     *
     * The change count is the assertion that really pins it. A future live
     * preview wired through `session.change` — AC-075's width setting is the
     * obvious candidate — would leave the heading right and the count wrong,
     * and would break AC-074's "one undoable change" at the same time.
     */
    show();
    await edit();
    await openSettings();

    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Should not survive');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(screen.getByRole('heading', { name: 'Revenue' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Discard/ }).textContent).toBe('Discard');
    // aria-disabled, not disabled: the edit bar is an APG toolbar and keeps
    // its items focusable so arrow keys still reach them.
    const undo = within(screen.getByRole('toolbar', { name: 'Dashboard editing' })).getByRole(
      'button',
      { name: 'Undo' },
    );
    expect(undo.getAttribute('aria-disabled')).toBe('true');
  });

  it('shows the saved value again when the page is reopened after a cancel', async () => {
    /**
     * The abandoned draft is gone because the page is unmounted while it is
     * closed, and nothing says it has to stay that way — keeping the overlay
     * mounted is an ordinary enough optimisation, and T079's prompt may want
     * the page alive to ask from. Either would bring the abandoned edit back
     * and apply it on the next Save: an unsaved change surviving the exit, in
     * slow motion, with nothing red.
     */
    show();
    await openSettings();

    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Abandoned');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    await openSettings();

    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Revenue');
  });

  it('does apply a change that was saved', async () => {
    /**
     * Not AC-069's own clause — but without it AC-069's clause is nearly
     * empty. "Leaving applies nothing" is trivially true of a page that
     * applies nothing ever, and the two cancel cases above pass just as
     * happily against a Save button wired to discard the draft. Checked by
     * deleting the draft from the Save handler: every other case here stayed
     * green.
     *
     * What a saved setting then does to the *document* is AC-074's and
     * AC-075's; this only holds that Save and Cancel are different.
     */
    const onSave = show();
    await openSettings();

    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Something else');
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    // In view mode a save is a save: direction.md says so, and there is no
    // session to fold it into. Persisting is the page above's job, so what is
    // checked here is what was handed up.
    expect(onSave).toHaveBeenCalledTimes(1);
    expect((onSave.mock.calls[0] as [DashboardDocument])[0].title).toBe('Something else');
  });

  it('folds a save made while editing into the session, where Discard can reach it', async () => {
    /**
     * The other half of the same rule: "While editing, a save is one undoable
     * change, and Discard reverts it." Routed to the session, the change shows
     * on the dashboard immediately and counts as one — which is also what
     * makes AC-074 reachable later rather than a rewrite.
     */
    const onSave = show();
    await edit();
    await openSettings();

    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Renamed while editing');
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(screen.getByRole('heading', { name: 'Renamed while editing' })).toBeTruthy();
    // Not persisted behind the editor's back: the edit session decides when
    // the dashboard is written, and that is its own Save.
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^Discard/ }).textContent).toBe('Discard (1 change)');
  });

  it('offers the two interaction modes as a choice of one', async () => {
    // T076 / AC-070. direction.md calls them radio cards; what the criterion
    // needs is that they are a single choice, which is what radios are.
    show();
    await openSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Interactions' }));

    const modes = screen.getAllByRole('radio');
    expect(modes.map((mode) => mode.getAttribute('value'))).toEqual(['markings', 'crossFilter']);
    expect(modes.filter((mode) => (mode as HTMLInputElement).checked)).toHaveLength(1);
  });

  it('labels the inactive mode in the nav, and moves the label when the mode changes', async () => {
    /**
     * direction.md rule 56: the nav "labels each section active or inactive".
     * Asserted as a pair and across a switch, because a nav that hard-coded
     * "Active" beside Markings would read correctly on a new dashboard and be
     * wrong the moment anyone changed anything.
     */
    show();
    await openSettings();

    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(nav).getByRole('button', { name: /^Markings/ }).textContent).toContain('Active');
    expect(within(nav).getByRole('button', { name: /^Cross-filtering/ }).textContent).toContain(
      'Inactive',
    );

    await userEvent.click(within(nav).getByRole('button', { name: /^Interactions/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Cross-filtering/ }));

    expect(within(nav).getByRole('button', { name: /^Markings/ }).textContent).toContain(
      'Inactive',
    );
    expect(within(nav).getByRole('button', { name: /^Cross-filtering/ }).textContent).toContain(
      'Active',
    );
  });

  it('keeps the configuration of the mode left behind, all the way through a save', async () => {
    /**
     * The model test proves `setMode` keeps both. This proves the page does
     * not undo that on its way to the document — the place a careful pure
     * function is most often wasted.
     */
    /**
     * The dashboard carries markings that are *not* the default ones. Against
     * the default fixture this test passed even with `setMode` rewritten to
     * return `{...DEFAULT_INTERACTIONS, mode}` — the classic discard-on-switch
     * bug — because the value kept and the value reset to were identical.
     * That is the same trap `interactionMode.test.ts` is built to avoid, fallen
     * into one layer up.
     */
    const onSave = vi.fn();
    render(
      <DashboardView
        document={{
          ...DOC,
          // Markings sit beside the settings, not inside the mode (AC-065
          // names them peers). Both sides are distinctive so that "kept" and
          // "reset to the default" are different values.
          markings: [
            { id: 'mk1', name: 'Q3 cohort', slot: 'mk1', isDefault: true },
            { id: 'mk2', name: 'Outliers', slot: 'mk2', isDefault: false },
          ],
          settings: {
            width: 'fixed',
            interactions: { mode: 'markings', crossFilter: { defaultAction: 'highlight' } },
          },
        }}
        specs={{}}
        onSave={onSave}
      />,
    );
    await openSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Interactions' }));
    await userEvent.click(screen.getByRole('radio', { name: /Cross-filtering/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    const saved = (onSave.mock.calls[0] as [DashboardDocument])[0];
    expect(saved.settings.interactions?.mode).toBe('crossFilter');
    expect(saved.markings?.map((marking) => marking.name)).toEqual(['Q3 cohort', 'Outliers']);
    expect(saved.settings.interactions?.crossFilter.defaultAction).toBe('highlight');
  });

  it('asks before discarding unsaved changes (AC-073)', async () => {
    /**
     * T079 / AC-073: WHEN the user leaves the settings page with unsaved
     * changes, THE SYSTEM SHALL ask before discarding them.
     * `Fails when: unsaved changes are discarded without asking.`
     *
     * Asserted as *still there*, not merely as "a dialog appeared": the point
     * of asking is that the answer can be no, and a prompt that appeared after
     * the page had already closed would satisfy a weaker test while losing the
     * work exactly as before.
     */
    show();
    await openSettings();

    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Half-finished');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    /**
     * By role, not by test id. Every one of these assertions used to key off
     * `data-testid`, which meant the role, `aria-modal`, `aria-labelledby` and
     * the focus placement could all be deleted with the suite staying green —
     * while the docstring on the component claimed them. Asserted the way
     * `DeleteSectionDialog`'s are, which is what this says it follows.
     */
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Discard your changes?' })).toBeTruthy();

    // Focus is on the answer that loses nothing, so a stray Enter cannot throw
    // the work away.
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: 'Keep editing' }),
    );

    // The page is still open behind the question, and the change is still in it.
    expect(screen.getByTestId('dashboard-settings')).toBeTruthy();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Half-finished');
  });

  it('treats Escape as keeping the work, not as discarding it', async () => {
    // The least destructive reading of "I did not mean that". Escape on a
    // question about losing work must never be the answer that loses it.
    show();
    await openSettings();

    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Half-finished');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByTestId('dashboard-settings')).toBeTruthy();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Half-finished');
  });

  it('asks about a mode change too, not only about the name', async () => {
    /**
     * The page can change exactly two things, and every other guard case here
     * drives the name. Replacing the whole-document comparison with
     * `document.title !== draft.title` leaves all 449 tests green while
     * someone who switches to Cross-filtering and presses Cancel loses it
     * without being asked — AC-073's failing state exactly, and invisible.
     *
     * Found by cold review, which is the second time a settings test has been
     * strong about the field it drives and silent about the other one.
     */
    show();
    await openSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Interactions' }));
    await userEvent.click(screen.getByRole('radio', { name: /Cross-filtering/ }));

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('keeps the work when the answer is to stay', async () => {
    show();
    await openSettings();

    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Half-finished');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));

    expect(screen.queryByTestId('discard-settings-dialog')).toBeNull();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Half-finished');
  });

  it('leaves without asking when there is nothing to lose', async () => {
    /**
     * The other half, and the half that decides whether the guard is worth
     * having. A page that asked every time would train people to dismiss it
     * without reading, and then it protects nothing.
     */
    show();
    await openSettings();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByTestId('discard-settings-dialog')).toBeNull();
    expect(screen.queryByTestId('dashboard-settings')).toBeNull();
  });

  it('leaves without asking when a change was typed and taken back', async () => {
    // Content, not keystrokes: the draft is a new object after any edit, so
    // identity would ask about a dashboard that is exactly as it was.
    show();
    await openSettings();

    const name = screen.getByLabelText('Name');
    await userEvent.type(name, '!');
    await userEvent.clear(name);
    await userEvent.type(name, 'Revenue');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByTestId('discard-settings-dialog')).toBeNull();
    expect(screen.queryByTestId('dashboard-settings')).toBeNull();
  });

  it('does not ask after saving, because there is nothing unsaved', async () => {
    // Save leaves the page itself, so this is really a guard against the page
    // asking on its way out of a save.
    show();
    await openSettings();

    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Saved properly');
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(screen.queryByTestId('discard-settings-dialog')).toBeNull();
    expect(screen.queryByTestId('dashboard-settings')).toBeNull();
  });

  it('keeps the dashboard underneath it out of the way', async () => {
    // Full-viewport, like the chart editor: the dashboard is not a backdrop to
    // click through by accident.
    show();
    // A positive control first: asserting an absence with nothing to compare
    // against would stay green if the fixture simply stopped making tiles.
    expect(screen.queryAllByTestId('grid-item').length).toBeGreaterThan(0);

    await openSettings();

    expect(screen.queryAllByTestId('grid-item')).toHaveLength(0);
  });
});
