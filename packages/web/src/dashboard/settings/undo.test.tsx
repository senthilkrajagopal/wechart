import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../DashboardView';
import type { DashboardDocument } from '../model/document';

/**
 * T080 / AC-074: WHEN settings are saved while the dashboard is being edited,
 * THE SYSTEM SHALL record them as one undoable change.
 * `Fails when: Undo after saving settings leaves any of them applied, or
 * requires more than one Undo.`
 *
 * Both halves of that failing state are asserted, and they pull against each
 * other — which is the point. Saving each changed setting through the session
 * separately satisfies "nothing is left applied" and fails "one Undo"; folding
 * them into one change but dropping one of them satisfies "one Undo" and fails
 * the rest. So every case here changes **two** settings and then presses Undo
 * exactly once.
 *
 * direction.md says the same thing from the other side: "While editing, a save
 * is one undoable change, and Discard reverts it."
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Revenue',
  settings: { width: 'fixed' },
  pages: [{ id: 'p1', title: 'Overview', items: [{ id: 'a', kind: 'chart', w: 6, h: 40 }] }],
};

const openEditing = async () => {
  render(<DashboardView dashboardId="d1" document={DOC} specs={{}} onSave={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  await userEvent.click(screen.getByRole('button', { name: 'Dashboard settings' }));
};

const bar = () => screen.getByRole('toolbar', { name: 'Dashboard editing' });
const undo = async () => {
  await userEvent.click(within(bar()).getByRole('button', { name: 'Undo' }));
};

/** Change both of the things the page can change, then save. */
const changeTwoSettings = async () => {
  const name = screen.getByLabelText('Name');
  await userEvent.clear(name);
  await userEvent.type(name, 'Renamed');

  await userEvent.click(screen.getByRole('button', { name: 'Interactions' }));
  await userEvent.click(screen.getByRole('radio', { name: /Cross-filtering/ }));

  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
};

describe('undoing a settings save made while editing', () => {
  it('counts a save of several settings as one change', async () => {
    await openEditing();
    await changeTwoSettings();

    expect(screen.getByRole('button', { name: /^Discard/ }).textContent).toBe('Discard (1 change)');
  });

  it('takes both settings back with a single Undo', async () => {
    await openEditing();
    await changeTwoSettings();
    expect(screen.getByRole('heading', { name: 'Renamed' })).toBeTruthy();

    await undo();

    // Both, after one Undo. The title is visible on the dashboard; the mode
    // is read back through the settings page, which is the only place it
    // shows.
    expect(screen.getByRole('heading', { name: 'Revenue' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Dashboard settings' }));
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(nav.querySelector('[data-section="Markings"]')?.textContent).toContain('Active');
  });

  it('leaves nothing to undo afterwards, so the save really was one entry', async () => {
    await openEditing();
    await changeTwoSettings();

    await undo();

    // A second Undo would mean the save had been recorded as several. The
    // session was seeded when Edit was pressed, so there is nothing before it.
    expect(within(bar()).getByRole('button', { name: 'Undo' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: /^Discard/ }).textContent).toBe('Discard');
  });

  it('is redoable, because one change undone is one change to put back', async () => {
    await openEditing();
    await changeTwoSettings();
    await undo();

    await userEvent.click(within(bar()).getByRole('button', { name: 'Redo' }));

    expect(screen.getByRole('heading', { name: 'Renamed' })).toBeTruthy();
  });

  it('is reverted by Discard as well as by Undo', async () => {
    // direction.md names both in the same breath, and AC-066 already asks
    // that a discard restore the settings. This is the same guarantee reached
    // the other way, now that a save can change two at once.
    await openEditing();
    await changeTwoSettings();

    await userEvent.click(screen.getByRole('button', { name: /^Discard/ }));

    expect(screen.getByRole('heading', { name: 'Revenue' })).toBeTruthy();
  });

  it('does not record a change when the settings were saved unaltered', async () => {
    /**
     * Save with nothing touched. Recording that as an undoable change would
     * put "Discard (1 change)" on a dashboard nobody changed, and the count is
     * what tells an editor whether they have unsaved work.
     */
    await openEditing();
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(screen.getByRole('button', { name: /^Discard/ }).textContent).toBe('Discard');
  });
});
