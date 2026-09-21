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
    expect([...nav.querySelectorAll('button')].map((button) => button.textContent)).toEqual([
      'General',
      'Interactions',
      'Markings',
      'Cross-filtering',
      'Layout',
    ]);
  });

  it('opens each of the five, not just the one', async () => {
    // Every section, because "a section is missing" is the criterion's failing
    // state and a nav entry that led nowhere would satisfy the list above
    // while failing the criterion.
    show();
    await openSettings();

    for (const section of SETTINGS_SECTIONS) {
      const button = screen.getByRole('button', { name: section });
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
