import type { RenderSpec } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../DashboardView';
import type { DashboardDocument } from '../model/document';

/**
 * T072 / AC-066: WHEN the user discards an edit session, THE SYSTEM SHALL
 * restore the dashboard, its chart specs and its settings to their state when
 * editing began.
 * `Fails when: any change made during the session survives the discard.`
 *
 * "Any change" is the whole of it, so this works through the *interface*
 * rather than over the history module: what matters is not that
 * `discard(history)` returns the initial state — `editor/history.test.ts`
 * already proves that — but that every way a user can change a dashboard
 * goes through the session and is therefore covered. A change made outside
 * the session would pass a history test and survive a discard.
 *
 * So each of the ways in gets its own case, and one asserts all of them at
 * once: add, move, resize, delete, and a page tab.
 */
const SPEC: RenderSpec = {
  chartType: 'table',
  encoding: { x: ['orders.status'], y: ['orders.count'] },
  rows: [{ 'orders.status': 'paid', 'orders.count': 3 }],
};

const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Revenue',
  settings: { width: 'fixed' },
  pages: [
    {
      id: 'p1',
      title: 'Overview',
      items: [
        { id: 'a', kind: 'chart', w: 6, h: 40, chartId: 'c1' },
        { id: 'b', kind: 'markdown', w: 6, h: 16, text: 'Notes' },
        {
          id: 's1',
          kind: 'section',
          title: 'Detail',
          items: [{ id: 'c', kind: 'chart', w: 12, h: 40, chartId: 'c1' }],
        },
      ],
    },
    { id: 'p2', title: 'Appendix', items: [] },
  ],
};

const shape = () =>
  screen.getAllByTestId('grid-item').map((item) => ({
    id: item.dataset['tile'],
    columns: (item as HTMLElement).style.gridColumn,
    height: (item as HTMLElement).style.height,
  }));

const edit = async () => {
  render(<DashboardView dashboardId="d1" document={DOC} specs={{ c1: SPEC }} onSave={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  return shape();
};

const discard = async () => {
  await userEvent.click(screen.getByRole('button', { name: /^Discard/ }));
};

/** A page tab is deleted from Properties, as the prototype has it (AC-187). */
const deletePage = async (id: string) => {
  await userEvent.click(
    within(screen.getByRole('complementary', { name: 'Edit sidebar' })).getByRole('tab', {
      name: 'Properties',
    }),
  );
  await userEvent.click(screen.getByTestId(`delete-page-${id}`));
};

describe('discarding a session', () => {
  it('undoes an element that was added', async () => {
    const before = await edit();
    await userEvent.click(screen.getByTestId('add-divider'));
    expect(shape()).not.toEqual(before);

    await discard();
    expect(shape()).toEqual(before);
  });

  it('undoes a tile that was moved', async () => {
    const before = await edit();
    const first = screen.getAllByTestId('grid-item')[0] as HTMLElement;
    first.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(shape()).not.toEqual(before);

    await discard();
    expect(shape()).toEqual(before);
  });

  it('undoes a tile that was resized', async () => {
    const before = await edit();
    const first = screen.getAllByTestId('grid-item')[0] as HTMLElement;
    first.focus();
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(shape()).not.toEqual(before);

    await discard();
    expect(shape()).toEqual(before);
  });

  it('undoes a tile that was deleted, and everything that went with it', async () => {
    const before = await edit();
    await userEvent.click(screen.getByTestId('tile-menu-s1'));
    await userEvent.click(screen.getByTestId('delete-s1'));
    await userEvent.click(screen.getByTestId('delete-contents'));
    expect(shape().map((item) => item.id)).not.toContain('c');

    await discard();
    expect(shape()).toEqual(before);
  });

  it('undoes a page tab that was deleted', async () => {
    await edit();
    await deletePage('p2');
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).not.toContain('Appendix');

    await discard();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toContain('Appendix');
  });

  it('undoes a settings change, which T072 could not test and recorded here', async () => {
    /**
     * AC-066 names three things a discard restores: "the dashboard, its chart
     * specs and its **settings**". At T072 the first was covered and the other
     * two could not be exercised at all — nothing could change a setting yet —
     * so a hard check was recorded on this task rather than left to memory.
     *
     * This is that check. A settings save made while editing goes through the
     * session (direction.md: "While editing, a save is one undoable change,
     * and Discard reverts it"), so a discard has to take it back with
     * everything else. Routed around the session instead it would survive the
     * discard, and nothing else here would have noticed.
     */
    await edit();
    await userEvent.click(screen.getByRole('button', { name: 'Dashboard settings' }));

    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Renamed in settings');
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(screen.getByRole('heading', { name: 'Renamed in settings' })).toBeTruthy();

    await discard();

    expect(screen.getByRole('heading', { name: 'Revenue' })).toBeTruthy();
  });

  it('undoes all of them at once, which is what a real session looks like', async () => {
    const before = await edit();

    await userEvent.click(screen.getByTestId('add-header'));
    const first = screen.getAllByTestId('grid-item')[0] as HTMLElement;
    first.focus();
    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}');
    await userEvent.keyboard('{ArrowRight}');
    // The page tabs are the dashboard's properties, shown with nothing
    // selected (T248): Escape lets go of the tile first.
    await userEvent.keyboard('{Escape}');
    await deletePage('p2');

    await discard();

    expect(shape()).toEqual(before);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toContain('Appendix');
  });

  it('leaves nothing to discard afterwards', async () => {
    await edit();
    await userEvent.click(screen.getByTestId('add-divider'));
    expect(screen.getByRole('button', { name: /^Discard/ }).textContent).toBe('Discard (1 change)');

    await discard();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    // The count is what tells the user there is unsaved work; one that stayed
    // up after a discard would be claiming work that no longer exists.
    expect(screen.getByRole('button', { name: /^Discard/ }).textContent).toBe('Discard');
  });

  /**
   * T223 / AC-204: WHEN the user chooses Discard in edit mode, THE SYSTEM
   * SHALL restore the dashboard as it was when editing began and return to
   * view mode, whether or not anything was changed.
   * `Fails when: Discard leaves the dashboard in edit mode, or is unavailable
   * with no changes.`
   *
   * This replaces T072's "stays in edit mode" and "is itself undoable": the
   * prototype's Discard puts the snapshot back and leaves edit mode, and the
   * spec now says so.
   */
  it('returns to view mode with the dashboard as it was (AC-204)', async () => {
    const before = await edit();
    await userEvent.click(screen.getByTestId('add-divider'));
    await discard();

    expect(screen.queryByRole('toolbar', { name: 'Dashboard editing' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit' }).textContent).toBe('Edit');
    expect(shape()).toEqual(before);
  });

  it('returns to view mode with nothing changed too (AC-204)', async () => {
    await edit();
    const discardButton = screen.getByRole('button', { name: /^Discard/ });
    expect(discardButton.getAttribute('aria-disabled')).toBe('false');

    await discard();

    expect(screen.queryByRole('toolbar', { name: 'Dashboard editing' })).toBeNull();
  });
});
