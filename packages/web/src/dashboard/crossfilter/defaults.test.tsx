import type { ChartDocument } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../DashboardView';
import type { DashboardDocument } from '../model/document';
import { actionFor, pairKey } from './apply';

/**
 * T124 / AC-118: THE SYSTEM SHALL apply the dashboard's default pair action
 * to pairs the author has not set, and show that default in the settings page
 * (direction.md rule 32).
 * `Fails when: an unset pair behaves differently from the stated default.`
 *
 * Both halves, and the join between them: what the page says the default is,
 * and what an unset pair then does. A page that showed "Filter" while unset
 * pairs highlighted would meet neither.
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Revenue',
  settings: { width: 'fixed' },
  pages: [
    {
      id: 'p1',
      title: 'Overview',
      items: [
        { id: 'tile-a', kind: 'chart', w: 6, h: 40, chartId: 'c-a' },
        { id: 'tile-b', kind: 'chart', w: 6, h: 40, chartId: 'c-b' },
      ],
    },
  ],
};

/** The matrix names tiles by the chart each draws, so the charts are here. */
const chart = (title: string): ChartDocument => ({
  schemaVersion: 1,
  title,
  chart: {
    source: { cube: 'orders' },
    wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
    chartType: 'bar',
  },
});

const show = (onSave = vi.fn()) => {
  render(
    <DashboardView
      dashboardId="d1"
      document={DOC}
      specs={{}}
      documents={{ 'c-a': chart('Tile A'), 'c-b': chart('Tile B') }}
      onSave={onSave}
    />,
  );
  return onSave;
};

const openCrossFiltering = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Dashboard settings' }));
  await userEvent.click(screen.getByRole('button', { name: /^Cross-filtering/ }));
};

/** The control that sets what an unset pair does. */
const defaultGroup = () => screen.getByRole('group', { name: 'Default for tile pairs' });

const pairCell = (source: string, target: string) =>
  screen.getByRole('combobox', { name: `${source} to ${target}` });

describe('the dashboard’s default pair action', () => {
  it('is shown on the settings page, starting at Filter', async () => {
    show();
    await openCrossFiltering();

    expect(
      within(defaultGroup()).getByRole('button', { name: 'Filter', pressed: true }),
    ).toBeTruthy();
    expect(
      within(defaultGroup()).getByRole('button', { name: 'Highlight', pressed: false }),
    ).toBeTruthy();
  });

  it('is what every pair the author has not set shows', async () => {
    show();
    await openCrossFiltering();

    expect((pairCell('Tile A', 'Tile B') as HTMLSelectElement).value).toBe('filter');

    await userEvent.click(within(defaultGroup()).getByRole('button', { name: 'Highlight' }));

    // Every unset pair moves with it: they are not stored, they follow.
    expect((pairCell('Tile A', 'Tile B') as HTMLSelectElement).value).toBe('highlight');
    expect((pairCell('Tile B', 'Tile A') as HTMLSelectElement).value).toBe('highlight');
  });

  it('leaves a pair the author set where it was set', async () => {
    show();
    await openCrossFiltering();
    await userEvent.selectOptions(pairCell('Tile A', 'Tile B'), 'none');

    await userEvent.click(within(defaultGroup()).getByRole('button', { name: 'Highlight' }));

    expect((pairCell('Tile A', 'Tile B') as HTMLSelectElement).value).toBe('none');
    expect((pairCell('Tile B', 'Tile A') as HTMLSelectElement).value).toBe('highlight');
  });

  it('saves the default and the pairs set by hand, and nothing else', async () => {
    const onSave = show();
    await openCrossFiltering();
    await userEvent.click(within(defaultGroup()).getByRole('button', { name: 'Highlight' }));
    await userEvent.selectOptions(pairCell('Tile A', 'Tile B'), 'none');
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    const saved = onSave.mock.calls[0]?.[0] as DashboardDocument;
    const crossFilter = saved.settings.interactions?.crossFilter;
    expect(crossFilter?.defaultAction).toBe('highlight');
    // Sparse: only what was set by hand, so changing the default still moves
    // every pair nobody has touched.
    expect(crossFilter?.pairs).toEqual({ [pairKey('tile-a', 'tile-b')]: 'none' });
  });

  it('is what an unset pair actually does, not only what the page says', async () => {
    const onSave = show();
    await openCrossFiltering();
    await userEvent.click(within(defaultGroup()).getByRole('button', { name: 'None' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    const saved = onSave.mock.calls[0]?.[0] as DashboardDocument;
    const crossFilter = saved.settings.interactions?.crossFilter;
    expect(crossFilter).toBeDefined();
    // The criterion's failing state: the page says one thing and the pair
    // does another.
    expect(actionFor(crossFilter!, 'tile-a', 'tile-b')).toBe('none');
  });
});
