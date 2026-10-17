import { act, render, screen, within } from '@testing-library/react';
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
  render(<DashboardView dashboardId="d1" document={DOC} specs={{}} onSave={onSave} />);
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

  it('leaves a failed view-mode save to the page to report, rather than throwing it', async () => {
    /**
     * The page's save now returns its outcome (AC-184, T197), and it rejects
     * when the save fails. Through the session that rejection is handled;
     * from the settings page in view mode it went nowhere — an unhandled
     * rejection. The page says why the save failed; nothing more is owed here.
     */
    /**
     * Watched for directly. Vitest does report an unhandled rejection, but as
     * an error of the whole run, with this test itself marked passed
     * (observed at T197: "Errors 1", exit 1); the listener pins the failure
     * on the test it belongs to. And a plain function, not `vi.fn`: with a
     * `vi.fn` returning the rejected promise, nothing was reported at all
     * (observed at T197), so the mock hides the very thing under test.
     */
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', record);
    try {
      let calls = 0;
      render(
        <DashboardView
          dashboardId="d1"
          document={DOC}
          specs={{}}
          onSave={() => {
            calls += 1;
            return Promise.reject(new Error('Could not save: 409'));
          }}
        />,
      );
      await openSettings();

      const name = screen.getByLabelText('Name');
      await userEvent.clear(name);
      await userEvent.type(name, 'Something else');
      await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Whether the page stays open meanwhile is AC-185's (T199), not this
      // test's: it asks only that the failure is not thrown.
      expect(calls).toBe(1);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', record);
    }
  });

  /**
   * T199 / AC-185: WHEN the user saves the dashboard settings page in view
   * mode, THE SYSTEM SHALL keep the page open until the save has gone
   * through, and IF the save fails, keep the settings as entered on the page
   * and show the reason.
   * `Fails when: the page closes before the save answers, or a failed save
   * loses what was entered.`
   *
   * The user's decision at T197's review: "Stay open until saved… or close if
   * cancelled." Closing first would leave someone looking at a dashboard that
   * does not show what they just typed, with no way back to it.
   */
  describe('a view-mode save', () => {
    const held = () => {
      let settle = (value: unknown) => {
        void value;
      };
      let fail = (reason: unknown) => {
        void reason;
      };
      const promise = new Promise((resolve, reject) => {
        settle = resolve;
        fail = reject;
      });
      return { promise, settle, fail };
    };

    const typeName = async (text: string) => {
      const name = screen.getByLabelText('Name');
      await userEvent.clear(name);
      await userEvent.type(name, text);
    };

    it('keeps the page open, saying so, until the save answers', async () => {
      const save = held();
      render(
        <DashboardView dashboardId="d1" document={DOC} specs={{}} onSave={() => save.promise} />,
      );
      await openSettings();
      await typeName('On its way');
      await userEvent.click(screen.getByRole('button', { name: /^Save settings|^Saving/ }));

      // Still open, and saying why it is still open.
      expect(screen.getByTestId('dashboard-settings')).toBeTruthy();
      expect(screen.getByTestId('settings-saving').textContent).toMatch(/saving/i);

      await act(async () => {
        save.settle(undefined);
        await save.promise;
      });

      await vi.waitFor(() => {
        expect(screen.queryByTestId('dashboard-settings')).toBeNull();
      });
    });

    it('stays open with what was entered, and says why, when the save fails', async () => {
      const save = held();
      render(
        <DashboardView dashboardId="d1" document={DOC} specs={{}} onSave={() => save.promise} />,
      );
      await openSettings();
      await typeName('Half-finished');
      await userEvent.click(screen.getByRole('button', { name: /^Save settings|^Saving/ }));

      await act(async () => {
        save.fail(new Error('Could not save: 409'));
        await save.promise.catch(() => undefined);
      });

      expect(screen.getByTestId('dashboard-settings')).toBeTruthy();
      // What was entered is still on the page, not thrown away.
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Half-finished');
      expect(screen.getByTestId('settings-save-failed').textContent).toContain('409');
    });

    it('can be left by Cancel while a save is failing, losing nothing else', async () => {
      const save = held();
      render(
        <DashboardView dashboardId="d1" document={DOC} specs={{}} onSave={() => save.promise} />,
      );
      await openSettings();
      await typeName('Half-finished');
      await userEvent.click(screen.getByRole('button', { name: /^Save settings|^Saving/ }));
      await act(async () => {
        save.fail(new Error('Could not save: 409'));
        await save.promise.catch(() => undefined);
      });

      // The way out the user decided on: Cancel closes, and asks first,
      // because what is on the page is unsaved (AC-073).
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

      expect(screen.queryByTestId('dashboard-settings')).toBeNull();
    });
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
        dashboardId="d1"
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
    expect(screen.getByRole('heading', { name: 'Discard your changes to settings?' })).toBeTruthy();

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

  it('offers both page widths in Layout, with the saved one chosen', async () => {
    // T081 / AC-075. direction.md: "Layout: page width, either fixed
    // (1,440 px) or full width."
    show();
    await openSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Layout' }));

    const widths = screen.getAllByRole('radio');
    expect(widths.map((width) => width.getAttribute('value'))).toEqual(['fixed', 'full']);
    expect(widths.filter((width) => (width as HTMLInputElement).checked)).toHaveLength(1);
    expect((screen.getByRole('radio', { name: /Fixed/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('carries a width change through the save onto the page', async () => {
    /**
     * The rendered width is a CSS fact and jsdom has no layout, so
     * `e2e/dashboard.spec.ts` measures it. What this holds is the half jsdom
     * can: the setting the user chose reaches the document and the attribute
     * the stylesheet keys off.
     *
     * **Applied on save, not as a live preview**, and that is deliberate.
     * T079 recorded the trap: `isDirty` compares the whole document, which is
     * only safe while the dashboard is unmounted behind the overlay. A live
     * preview written through `session.change` would move both sides of that
     * comparison together, `isDirty` would go false, and Cancel would discard
     * silently — breaking AC-073 and AC-074 at once.
     */
    const onSave = show();
    await openSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Layout' }));
    await userEvent.click(screen.getByRole('radio', { name: /Full width/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    // In view mode the save goes up to whoever owns the document; the page
    // repaints once that comes back, which is the page above's business.
    expect((onSave.mock.calls[0] as [DashboardDocument])[0].settings.width).toBe('full');
  });

  it('repaints the page at the new width when the change is made while editing', async () => {
    // Editing is the mode where the change lands in the session and the
    // dashboard is right there to repaint, so the attribute the stylesheet
    // keys off has to follow immediately.
    show();
    await edit();
    await openSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Layout' }));
    await userEvent.click(screen.getByRole('radio', { name: /Full width/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(screen.getByTestId('dashboard-page').getAttribute('data-width')).toBe('full');
  });

  it('still asks before dropping a width change, like any other setting', async () => {
    // The guard is about the document, not about the name field — this is the
    // third setting to prove that, after the mode.
    show();
    await openSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Layout' }));
    await userEvent.click(screen.getByRole('radio', { name: /Full width/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('keeps the dashboard underneath it out of the way', async () => {
    /**
     * Full-viewport, like the chart editor: the dashboard is not a backdrop to
     * click through by accident.
     *
     * Changed at T032, deliberately. This used to assert that the tiles were
     * gone from the document, because the overlay replaced the dashboard. That
     * unmounted it, so every tab group reopened on its first tab and both
     * panes returned to the top when the overlay closed (AC-067's failing
     * state). The dashboard now stays mounted beneath, and what this test is
     * for is asserted directly instead: nothing under the overlay can be
     * clicked or focused, or is presented to assistive technology.
     */
    show();
    // A positive control first: asserting an absence with nothing to compare
    // against would stay green if the fixture simply stopped making tiles.
    const tiles = screen.queryAllByTestId('grid-item');
    expect(tiles.length).toBeGreaterThan(0);

    await openSettings();

    const covered = screen.queryAllByTestId('grid-item');
    // Still there, beneath — which is the point of the change.
    expect(covered).toHaveLength(tiles.length);
    for (const tile of covered) {
      // Inert: it cannot be clicked or focused.
      expect(tile.closest('[inert]')?.hasAttribute('inert')).toBe(true);
      // Hidden from assistive technology.
      expect(tile.closest('[inert]')?.getAttribute('aria-hidden')).toBe('true');
    }
    // And none of them is reachable by role, which is how people using
    // assistive technology find things.
    expect(screen.queryAllByRole('button', { name: 'Edit' })).toHaveLength(0);
  });
});

/**
 * T182 / AC-176: the page from the keyboard. The gear it opens from goes away
 * while it is open, so focus has to be put somewhere on the way in and on the
 * way out, or it falls to the document and the next Tab starts from the top.
 */
describe('the settings page’s focus', () => {
  it('lands on the open section’s heading as the page opens', async () => {
    show();
    screen.getByRole('button', { name: 'Dashboard settings' }).focus();
    await userEvent.keyboard('{Enter}');

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'General' }));
  });

  it('goes back to the gear on the way out', async () => {
    show();
    screen.getByRole('button', { name: 'Dashboard settings' }).focus();
    await userEvent.keyboard('{Enter}');
    screen.getByTestId('settings-back').focus();
    await userEvent.keyboard('{Enter}');

    expect(screen.queryByTestId('dashboard-settings')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dashboard settings' }));
  });

  it('goes back to what asked when the answer is to keep editing', async () => {
    show();
    await openSettings();
    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Half-finished');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    cancel.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('alertdialog')).toBeTruthy();

    await userEvent.keyboard('{Enter}');

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(cancel);
  });

  it('keeps Tab inside the discard question, off the page behind it', async () => {
    show();
    await openSettings();
    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Half-finished');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const dialog = screen.getByRole('alertdialog');

    for (const shift of [false, false, true, true, true]) {
      await userEvent.tab({ shift });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    // Nothing typed into the field behind it on the way.
    expect((name as HTMLInputElement).value).toBe('Half-finished');
  });
});

/**
 * T685 (AC-352, AC-070, AC-073; design 05 pins 1–6 and state C; DSH-07,
 * DSH-08, DSH-10): the settings page as design 05 draws it. The count and
 * the discard sentence follow the coordinator's call of 2026-10-17
 * (`dirtyGuard.ts`, `changesOf`).
 */
describe('the settings page as design 05 draws it (T685)', () => {
  const bar = () => screen.getByTestId('dashboard-settings').querySelector('header')!;

  it('counts the unsaved changes beside the title, and says Esc cancels before Cancel', async () => {
    show();
    await openSettings();
    const title = screen.getByRole('heading', { name: 'Dashboard settings', level: 1 });
    expect(bar().textContent).not.toMatch(/unsaved/);
    const hint = within(bar()).getByText('Esc cancels');
    // Before Cancel and Save, after the spacer.
    expect(
      hint.compareDocumentPosition(screen.getByRole('button', { name: 'Cancel' })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await userEvent.type(screen.getByLabelText('Name'), ' 2');
    const unsaved = title.nextElementSibling as HTMLElement;
    expect(unsaved.textContent).toBe('· 1 unsaved change');
    // A state, with its icon (AC-177).
    expect(unsaved.querySelector('[data-icon]')).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Interactions' }));
    await userEvent.click(screen.getByRole('radio', { name: /Cross-filtering/ }));
    expect((title.nextElementSibling as HTMLElement).textContent).toBe('· 2 unsaved changes');
  });

  it('introduces the modes, and says what switching does below them', async () => {
    show();
    await openSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Interactions' }));
    expect(
      screen.getByText(
        'How readers explore this dashboard by clicking its charts. One mode is active at a time; the other mode’s settings are kept, not cleared.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Switching mode clears readers’ current marks and cross-filters. Saving here while the dashboard is in edit mode is one change you can undo, and Discard reverts it.',
      ),
    ).toBeTruthy();
  });

  it('gives each mode card design 05’s words, a picture, its gestures as keycaps and its foot', async () => {
    show();
    await openSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Interactions' }));
    const cards = [...document.querySelectorAll<HTMLElement>('.settings-modes__card')];
    expect(cards).toHaveLength(2);
    const [markings, crossFilter] = cards as [HTMLElement, HTMLElement];

    expect(markings.textContent).toContain(
      'Readers mark items in a named, coloured marking. Every tile that uses the marking highlights them, on every page tab, and details tiles can show only what is marked.',
    );
    expect(crossFilter.textContent).toContain(
      'Clicking a mark filters or highlights the other tiles on the same tab, set for each pair of tiles. The selection shows as a chip readers can clear.',
    );
    for (const card of cards) {
      const picture = card.querySelector('svg.settings-modes__picture');
      expect(picture?.getAttribute('aria-hidden')).toBe('true');
    }
    const keys = (card: HTMLElement) =>
      [...card.querySelectorAll('.settings-modes__gestures > span')].map((gesture) => [
        gesture.querySelector('kbd')?.textContent,
        gesture.textContent,
      ]);
    expect(keys(markings)).toEqual([
      ['Click', 'Click marks'],
      ['Ctrl/⌘', 'Ctrl/⌘ toggles'],
      ['Drag', 'Drag rectangle'],
      ['Alt+drag', 'Alt+drag lasso'],
      ['Esc', 'Esc unmarks'],
    ]);
    // Cross-filtering has no Ctrl/⌘ to add: one selection per tile, so its
    // keycap would promise what doesn't happen (accepted-differences.md).
    expect(keys(crossFilter)).toEqual([
      ['Click', 'Click filters'],
      ['Esc', 'Esc clears'],
    ]);

    // The one chart tile follows the default marking.
    expect(markings.querySelector('.settings-modes__foot')?.textContent).toBe(
      '1 marking · used by 1 tile · limits 0Manage markings ›',
    );
    expect(crossFilter.querySelector('.settings-modes__foot')?.textContent).toBe(
      'Default for tile pairs: Filter · 0 pairs changedSet tile pairs ›',
    );
  });

  // A dashboard stored with its mode alone, as older ones and the e2e's are:
  // cross-filtering's foot reads the default, rather than the page failing.
  it('reads a dashboard that stored its mode without cross-filtering’s settings', async () => {
    render(
      <DashboardView
        dashboardId="d1"
        document={
          {
            ...DOC,
            settings: { width: 'fixed', interactions: { mode: 'markings' } },
          } as unknown as DashboardDocument
        }
        specs={{}}
        onSave={vi.fn()}
      />,
    );
    await openSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Interactions' }));
    const crossFilter = document.querySelectorAll<HTMLElement>('.settings-modes__card')[1]!;
    expect(crossFilter.querySelector('.settings-modes__foot')?.textContent).toBe(
      'Default for tile pairs: Filter · 0 pairs changedSet tile pairs ›',
    );
  });

  // T685's review: a pair kept at what the default now is has not changed.
  it('counts only the tile pairs that differ from the default', async () => {
    render(
      <DashboardView
        dashboardId="d1"
        document={{
          ...DOC,
          settings: {
            width: 'fixed',
            interactions: {
              mode: 'markings',
              crossFilter: {
                defaultAction: 'highlight',
                pairs: { 'a→b': 'highlight', 'b→a': 'none' },
              },
            },
          },
        }}
        specs={{}}
        onSave={vi.fn()}
      />,
    );
    await openSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Interactions' }));
    const crossFilter = document.querySelectorAll<HTMLElement>('.settings-modes__card')[1]!;
    expect(crossFilter.querySelector('.settings-modes__foot')?.textContent).toBe(
      'Default for tile pairs: Highlight · 1 pair changedSet tile pairs ›',
    );
  });

  it('opens the mode’s own section from its foot, choosing nothing', async () => {
    show();
    await openSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Interactions' }));
    await userEvent.click(screen.getByRole('button', { name: 'Set tile pairs ›' }));
    expect(screen.getByRole('heading', { name: 'Cross-filtering', level: 2 })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Interactions' }));
    // Still Markings: the link chose no mode.
    expect((screen.getByRole('radio', { name: 'Markings' }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Manage markings ›' }));
    expect(screen.getByRole('heading', { name: 'Markings', level: 2 })).toBeTruthy();
    expect(bar().textContent).not.toMatch(/unsaved/);
  });

  it('names what changed in the discard question', async () => {
    show();
    await openSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Interactions' }));
    await userEvent.click(screen.getByRole('radio', { name: /Cross-filtering/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Discard your changes to settings?' });
    expect(within(dialog).getByText(/^You changed/).textContent).toBe(
      'You changed the interaction mode. Leaving now keeps the dashboard as it was.',
    );
  });
});
