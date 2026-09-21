import { chartDocumentOf, emptySpec, type RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, type DashboardDocument } from '../model/document';
import { drawnWithDrafts, withDraft, withoutDrafts, type ChartDraft } from './chartDrafts';

/**
 * T032: a chart edited from a tile is held **in the dashboard's edit session**
 * until the dashboard is saved, as a draft on the session's document.
 *
 * On the document because the session's history stores whole documents: a
 * draft there is undone, redone and discarded with everything else, for free —
 * which is what AC-066 ("restore the dashboard, its chart specs and its
 * settings") needs, and what writing the chart on return would have broken.
 */
const dashboard: DashboardDocument = {
  schemaVersion: 1,
  title: 'Revenue',
  pages: [],
  settings: DEFAULT_SETTINGS,
};

const spec = (chartType: RenderSpec['chartType']): RenderSpec => ({
  chartType,
  encoding: { x: ['orders.status'], y: ['orders.count'] },
  rows: [],
  palette: [],
});

const chart = chartDocumentOf({
  title: 'Orders',
  spec: { ...emptySpec('orders'), measures: ['orders.count'] },
});

const drawing = (chartType: RenderSpec['chartType']): ChartDraft => ({
  document: chart,
  drawn: { spec: spec(chartType) },
});

const failing = (error: unknown): ChartDraft => ({ document: chart, drawn: { error } });

describe('holding a draft', () => {
  it('adds the draft for that chart and leaves the rest of the dashboard alone', () => {
    const next = withDraft(dashboard, 'c1', drawing('hbar'));

    expect(next.chartDrafts?.['c1']).toEqual(drawing('hbar'));
    expect({ ...next, chartDrafts: undefined }).toEqual({ ...dashboard, chartDrafts: undefined });
  });

  it('replaces an earlier draft of the same chart rather than keeping both', () => {
    const next = withDraft(withDraft(dashboard, 'c1', drawing('hbar')), 'c1', drawing('pie'));

    expect(Object.keys(next.chartDrafts ?? {})).toEqual(['c1']);
    expect(next.chartDrafts?.['c1']).toEqual(drawing('pie'));
  });

  it('keeps drafts of other charts', () => {
    const next = withDraft(withDraft(dashboard, 'c1', drawing('hbar')), 'c2', drawing('pie'));

    expect(Object.keys(next.chartDrafts ?? {}).sort()).toEqual(['c1', 'c2']);
  });
});

describe('what the tiles draw', () => {
  const saved = { specs: { c1: spec('bar'), c2: spec('line') }, errors: {} };

  it('draws a drafted chart from its draft, and every other chart as saved', () => {
    /**
     * AC-034's failing state is a tile that "does not reflect the applied
     * changes". The draft is what was applied; the saved spec is what was
     * there before.
     */
    const drawn = drawnWithDrafts(saved, withDraft(dashboard, 'c1', drawing('hbar')));

    expect(drawn.specs['c1']?.chartType).toBe('hbar');
    expect(drawn.specs['c2']?.chartType).toBe('line');
  });

  it('shows why a draft no longer draws, instead of the chart it replaced', () => {
    /**
     * The case this shape exists for. A user who empties a chart and goes
     * back must see the tile say so — not the saved chart still sitting
     * there, which would read as though the edit had not been applied.
     */
    const drawn = drawnWithDrafts(
      saved,
      withDraft(dashboard, 'c1', failing('This chart has no fields yet.')),
    );

    expect(drawn.specs['c1']).toBeUndefined();
    expect(drawn.errors['c1']).toBe('This chart has no fields yet.');
  });

  it('draws a draft that now works, instead of the error it replaced', () => {
    const broken = { specs: {}, errors: { c1: 'This chart has no chart type yet.' } };

    const drawn = drawnWithDrafts(broken, withDraft(dashboard, 'c1', drawing('bar')));

    expect(drawn.specs['c1']?.chartType).toBe('bar');
    expect('c1' in drawn.errors).toBe(false);
  });

  it('draws everything as saved when nothing is drafted', () => {
    expect(drawnWithDrafts(saved, dashboard)).toBe(saved);
  });
});

describe('saving', () => {
  it('never sends a draft to the server', () => {
    /**
     * The dashboard's save sends its whole document, by design (T071), so a
     * draft left on it would be written into the dashboard's own row —
     * query rows and all — and read back as if it were part of the
     * dashboard. Writing the chart itself is AC-183's (T192).
     */
    const saved = withoutDrafts(withDraft(dashboard, 'c1', drawing('hbar')));

    expect('chartDrafts' in saved).toBe(false);
  });

  it('keeps every other field of the dashboard, known or not', () => {
    // Filtering keys, not naming the ones to keep: the T075 data-loss shape.
    const withExtras = { ...dashboard, folderId: 'f1', futureField: 42 } as DashboardDocument;

    const saved = withoutDrafts(withDraft(withExtras, 'c1', drawing('hbar')));

    expect(saved).toEqual(withExtras);
  });

  it('returns a dashboard with no drafts unchanged, not a copy', () => {
    // A copy of an unchanged document would read as a change to anything
    // that compares by identity.
    expect(withoutDrafts(dashboard)).toBe(dashboard);
  });
});
