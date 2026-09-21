import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../DashboardView';
import type { DashboardDocument } from '../model/document';
import { NOTHING_CHOSEN } from './templates';

/**
 * T074 / AC-068, the half the model cannot show: the tile has to *say* it.
 *
 * `templates.test.ts` proves the tiles a template inserts are bound to
 * nothing and that a sentence exists for each. This proves the tile puts that
 * sentence on screen — and, just as much, that it stops claiming the chart is
 * missing.
 *
 * "This chart is no longer available" on a tile the user created seconds ago
 * is worse than saying nothing: it sends them looking for a fault that is not
 * there, and it is what every empty chart said before this task, including the
 * plain one the Add palette inserts.
 */
const docWith = (items: DashboardDocument['pages'][number]['items']): DashboardDocument => ({
  schemaVersion: 1,
  title: 'Revenue',
  settings: { width: 'fixed' },
  pages: [{ id: 'p1', title: 'Overview', items }],
});

const show = (document: DashboardDocument) => {
  render(<DashboardView dashboardId="d1" document={document} specs={{}} onSave={vi.fn()} />);
};

describe('a chart tile with nothing in it', () => {
  it('names the well and the member type when it knows its type', () => {
    show(docWith([{ id: 'a', kind: 'chart', w: 3, h: 13, chartType: 'kpi' }]));

    // AC-033's wording, reused: "A kpi needs a measure in Measures; add 1
    // more." The tile and the chart editor describe the same gap the same way.
    const said = screen.getByTestId('tile-empty-chart').textContent ?? '';
    expect(said).toMatch(/needs/);
    expect(said).toMatch(/measure/i);
    expect(said).toMatch(/Measures/);
  });

  it('still says something when no type has been chosen', () => {
    show(docWith([{ id: 'a', kind: 'chart', w: 6, h: 40 }]));

    expect(screen.getByTestId('tile-empty-chart').textContent).toBe(NOTHING_CHOSEN);
  });

  it('does not claim the chart is missing', () => {
    show(docWith([{ id: 'a', kind: 'chart', w: 6, h: 40, chartType: 'line' }]));

    expect(screen.queryByTestId('tile-missing-chart')).toBeNull();
  });

  it('still calls a bound chart whose spec has gone missing', () => {
    // The state the message was built for, which must survive: this tile names
    // a chart, and that chart is not there.
    show(docWith([{ id: 'a', kind: 'chart', w: 6, h: 40, chartId: 'gone' }]));

    expect(screen.getByTestId('tile-missing-chart')).toBeTruthy();
    expect(screen.queryByTestId('tile-empty-chart')).toBeNull();
  });
});
