import type { RenderSpec } from '@wechart/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DashboardView } from '../DashboardView';
import type { DashboardDocument } from '../model/document';

/**
 * T197 / AC-184, on the dashboard: while a save is under way, nothing the
 * dashboard offers may change the session — the save will re-seed the session
 * from what it took, so a change made meanwhile is lost with nothing said, or
 * made against a session that is about to end.
 *
 * `EditChrome` refuses changes to the history itself (`saveOutcome.test.tsx`);
 * these are the routes around it that the dashboard owns: the settings page,
 * opened from the header, which is outside the saving body, and the chart
 * editor, opened from a pencil or with E.
 */
const SPEC: RenderSpec = {
  chartType: 'table',
  encoding: { x: ['orders.status'], y: ['orders.count'] },
  rows: [{ 'orders.status': 'paid', 'orders.count': 3 }],
};

const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Revenue',
  settings: { width: 'full' },
  pages: [
    {
      id: 'p1',
      title: 'Overview',
      items: [{ id: 't1', kind: 'chart', w: 6, h: 40, chartId: 'c1' }],
    },
  ],
};

/** A dashboard whose save the test settles, in edit mode, with Save pressed. */
async function savingDashboard() {
  let settle: { resolve: () => void; reject: (reason: Error) => void } | undefined;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DashboardView
        dashboardId="d1"
        document={DOC}
        specs={{ c1: SPEC }}
        onSave={() =>
          new Promise<void>((resolve, reject) => {
            settle = { resolve, reject };
          })
        }
      />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
  const bar = screen.getByRole('toolbar', { name: 'Dashboard editing' });
  await userEvent.click(within(bar).getByRole('button', { name: 'Save' }));
  expect(within(bar).getByRole('button', { name: 'Saving…' })).toBeTruthy();

  return {
    fail: () =>
      act(async () => {
        // Settling a save that was never sent is a broken test, not a pass.
        if (settle === undefined) throw new Error('No save was sent to settle.');
        settle.reject(new Error('Could not save: 409'));
      }),
  };
}

const gear = () => screen.getByRole('button', { name: 'Dashboard settings' }) as HTMLButtonElement;

describe('while a save is under way', () => {
  it('does not open the settings page, whose save would be dropped', async () => {
    const save = await savingDashboard();

    expect(gear().disabled).toBe(true);
    await userEvent.click(gear());
    expect(screen.queryByTestId('dashboard-settings')).toBeNull();

    // And once the save has failed and the session is back, it opens again.
    await save.fail();
    expect(gear().disabled).toBe(false);
  });

  it('does not open the chart editor, from the pencil or with E', async () => {
    await savingDashboard();

    await userEvent.click(screen.getByTestId('edit-chart-t1'));
    expect(screen.queryByTestId('chart-editor-overlay')).toBeNull();

    fireEvent.keyDown(screen.getByTestId('edit-chart-t1').closest('[data-tile]') as HTMLElement, {
      key: 'e',
    });
    expect(screen.queryByTestId('chart-editor-overlay')).toBeNull();
  });
});
