import type { RenderSpec } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../DashboardView';
import type { DashboardDocument } from '../model/document';

/**
 * T073 / AC-067: WHEN the dashboard re-renders during editing, THE SYSTEM
 * SHALL keep the canvas and sidebar scroll positions (direction.md rule 40).
 * `Fails when: either scroll position resets after a re-render.`
 *
 * These tests cover exactly one of the two ways a position can be lost, and it
 * is worth being plain about which. jsdom has no layout: `scrollTop` there is
 * an ordinary writable property on any element, never clamped to a scrollable
 * range, and nothing on the page has a height. So none of this can show that
 * the panes scroll at all — that the CSS makes them scroll containers, that
 * they overflow, or that the window does not take the scrollbar instead.
 * `e2e/dashboard.spec.ts` carries all of that, and AC-067 is ticked on it.
 *
 * What is left is still worth holding: React must not remount either pane. A
 * remounted pane is a new element with scrollTop 0, so keying one, or
 * re-creating it on a state change, would reset the position in every browser.
 * That is why each case re-queries the region *after* the change instead of
 * holding the node from before it — a test holding the old node would keep
 * reading the old node's position and never notice the swap.
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
  ],
};

const CANVAS_AT = 240;
const SIDEBAR_AT = 96;

const canvas = () => screen.getByTestId('canvas-scroll');
const sidebar = () => screen.getByTestId('sidebar-scroll');

/** Enter edit mode and scroll both panes away from the top. */
const scrolled = async () => {
  render(<DashboardView document={DOC} specs={{ c1: SPEC }} onSave={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

  canvas().scrollTop = CANVAS_AT;
  sidebar().scrollTop = SIDEBAR_AT;
};

const bothHeld = () => {
  expect(canvas().scrollTop).toBe(CANVAS_AT);
  expect(sidebar().scrollTop).toBe(SIDEBAR_AT);
};

describe('scroll positions during an edit session', () => {
  it('scrolls the sidebar panel and not the tab row, so the panels stay reachable', async () => {
    await scrolled();

    /**
     * Which element scrolls is a design decision, not an accident: the tab row
     * is how the user moves between Add, Outline and Properties, so a sidebar
     * that scrolled as one piece would carry that row out of reach. jsdom
     * cannot say whether either really scrolls — `e2e/dashboard.spec.ts` does
     * that — but it can hold the structure the decision rests on.
     */
    expect(sidebar().getAttribute('role')).toBe('tabpanel');
    expect(sidebar().querySelector('[role="tablist"]')).toBeNull();
    expect(screen.getByRole('tablist', { name: 'Edit sidebar panels' })).toBeTruthy();
  });

  it('holds both when an element is added', async () => {
    await scrolled();
    await userEvent.click(screen.getByTestId('add-divider'));

    bothHeld();
  });

  it('holds both when a tile is moved', async () => {
    await scrolled();
    const first = screen.getAllByTestId('grid-item')[0] as HTMLElement;
    first.focus();
    await userEvent.keyboard('{ArrowRight}');

    bothHeld();
  });

  it('holds both when a tile is resized', async () => {
    await scrolled();
    const first = screen.getAllByTestId('grid-item')[0] as HTMLElement;
    first.focus();
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');

    bothHeld();
  });

  it('holds both when a tile is deleted, and again when the delete is undone', async () => {
    await scrolled();
    await userEvent.click(screen.getByTestId('tile-menu-b'));
    await userEvent.click(screen.getByTestId('delete-b'));
    bothHeld();

    // The toast's Undo rather than the edit bar's, because that is the one a
    // user reaches for straight after a delete — and taking it also removes
    // the toast, so the body re-renders around the panes as well as inside
    // them.
    await userEvent.click(
      within(screen.getByTestId('undo-toast')).getByRole('button', { name: 'Undo' }),
    );
    bothHeld();
  });
});
