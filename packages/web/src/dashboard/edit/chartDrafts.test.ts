import { chartDocumentOf, emptySpec, type RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, type DashboardDocument } from '../model/document';
import {
  chartWritesOf,
  drawnWithDrafts,
  whyUnsaveable,
  whyUnsaveableWith,
  withDraft,
  withoutDrafts,
  type ChartDraft,
} from './chartDrafts';

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
  version: 1,
});

const failing = (error: unknown): ChartDraft => ({ document: chart, drawn: { error }, version: 1 });

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

/** Dashboard `d1`, showing these charts on its tiles. */
const showing = (...chartIds: string[]): DashboardDocument => ({
  ...dashboard,
  pages: [
    {
      id: 'p1',
      title: 'Page 1',
      items: chartIds.map((chartId, index) => ({
        id: `t${String(index)}`,
        kind: 'chart' as const,
        w: 6,
        h: 40,
        chartId,
      })),
    },
  ],
});

/**
 * T192: which drafts a dashboard save can write — the rule the server applies
 * too (`PUT /api/dashboards/:id` refuses anything else with a 400), so the
 * two agree on what may be written.
 *
 * A chart local to this dashboard is written with it. A library chart can be
 * on other dashboards, and AC-128 requires the editor to say so, with the
 * count, and offer a local copy *before* changes spread — T134, not built yet
 * — so its draft keeps Save held back. So does a chart local to another
 * dashboard, and a draft with no version: it could only be written blind,
 * overwriting whatever anyone else saved meanwhile.
 */
describe('whether a dashboard with drafts can be saved', () => {
  const onTiles = showing('c1', 'c2');
  const local = { ...drawing('bar'), document: { ...chart, localToDashboardId: 'd1' } };
  const library = { ...drawing('bar'), document: { ...chart, folderId: 'f1' } };
  const elsewhere = { ...drawing('bar'), document: { ...chart, localToDashboardId: 'd2' } };

  it('can be saved when nothing is drafted', () => {
    expect(whyUnsaveable(onTiles, 'd1')).toBeUndefined();
  });

  it('can be saved when every draft is of a chart local to it', () => {
    expect(whyUnsaveable(withDraft(onTiles, 'c1', local), 'd1')).toBeUndefined();
  });

  it('cannot be saved while a library chart is drafted, and says so truly', () => {
    const reason = whyUnsaveable(withDraft(withDraft(onTiles, 'c1', local), 'c2', library), 'd1');

    expect(reason).toMatch(/library chart/);
    // "Can be", not "is": a library chart may be on this dashboard alone, and
    // the count is AC-128's to show (T134).
    expect(reason).toMatch(/other dashboards can use it too/);
    // Stated truly: undo is linear, so later changes go with it.
    expect(reason).toMatch(/undone too/);
  });

  it('cannot be saved while a chart local to another dashboard is drafted', () => {
    expect(whyUnsaveable(withDraft(onTiles, 'c1', elsewhere), 'd1')).toMatch(/another dashboard/);
  });

  it('cannot be saved while a draft has no version to be checked against', () => {
    const blind = { ...local, version: undefined };

    expect(whyUnsaveable(withDraft(onTiles, 'c1', blind), 'd1')).toMatch(/safely/);
  });

  it('pays no heed to the draft of a chart no tile shows any more', () => {
    /**
     * Deleting the tile is how a user gets rid of a chart edit they cannot
     * save. Its draft must not go on holding Save back — and the advice to
     * undo back past it would bring the tile back.
     */
    const tileDeleted = withDraft(showing('c1'), 'c2', library);

    expect(whyUnsaveable(tileDeleted, 'd1')).toBeUndefined();
  });

  it('counts a chart on a tile inside a section or a tab group', () => {
    const nested: DashboardDocument = {
      ...dashboard,
      pages: [
        {
          id: 'p1',
          title: 'Page 1',
          items: [
            {
              id: 's1',
              kind: 'section',
              title: 'Section',
              items: showing('c1').pages[0]?.items ?? [],
            },
            {
              id: 'g1',
              kind: 'tabs',
              w: 12,
              tabs: [{ id: 'tab1', title: 'Tab', items: showing('c2').pages[0]?.items ?? [] }],
            },
          ],
        },
      ],
    } as DashboardDocument;

    expect(whyUnsaveable(withDraft(nested, 'c1', library), 'd1')).toMatch(/library chart/);
    expect(whyUnsaveable(withDraft(nested, 'c2', library), 'd1')).toMatch(/library chart/);
  });
});

describe('whether the editor’s Save dashboard can save', () => {
  /**
   * direction.md §2: the editor's "Save dashboard" "applies the chart and
   * saves the dashboard". So it is asked *before* the edit is applied — with
   * the edit still in the editor, not yet a draft on the session.
   */
  const onTiles = showing('c1', 'c2');
  const local = { document: { ...chart, localToDashboardId: 'd1' }, version: 3 };
  const library = { document: { ...chart, folderId: 'f1' }, version: 3 };
  const elsewhere = { document: { ...chart, localToDashboardId: 'd2' }, version: 3 };

  it('is held back by an edit to a library chart, before it is applied', () => {
    const reason = whyUnsaveableWith(onTiles, 'd1', 'c1', library);

    expect(reason).toMatch(/library chart/);
    expect(reason).toMatch(/other dashboards can use it too/);
  });

  it('is held back by an edit to a chart local to another dashboard', () => {
    expect(whyUnsaveableWith(onTiles, 'd1', 'c1', elsewhere)).toMatch(/another dashboard/);
  });

  it('is not held back by an edit to a chart local to the dashboard', () => {
    expect(whyUnsaveableWith(onTiles, 'd1', 'c1', local)).toBeUndefined();
  });

  it('is held back by an edit with no version to be checked against', () => {
    expect(whyUnsaveableWith(onTiles, 'd1', 'c1', { ...local, version: undefined })).toMatch(
      /safely/,
    );
  });

  it('names another tile’s chart when that is what holds the save back', () => {
    /**
     * In words that can be acted on from the editor. The dashboard's reason
     * says to undo back past the change, and the dashboard's Undo cannot be
     * reached under the editor.
     */
    const holdingLibrary = withDraft(onTiles, 'c2', { ...drawing('bar'), ...library });

    const reason = whyUnsaveableWith(holdingLibrary, 'd1', 'c1', undefined);

    expect(reason).toMatch(/Another tile’s chart/);
    expect(reason).toMatch(/library chart/);
    expect(reason).toMatch(/Back keeps this change on the dashboard/);
    expect(whyUnsaveableWith(onTiles, 'd1', 'c1', undefined)).toBeUndefined();
  });

  it('names this chart when its own earlier change holds the save back', () => {
    // Unchanged now, but changed earlier in the session, as a library chart.
    const changedEarlier = withDraft(onTiles, 'c1', { ...drawing('bar'), ...library });

    expect(whyUnsaveableWith(changedEarlier, 'd1', 'c1', undefined)).toMatch(
      /This is a library chart/,
    );
  });

  it('judges this chart by the edit, not by its earlier draft', () => {
    // A blind earlier draft of this very chart — local to the dashboard, so
    // that its missing version is the only thing wrong with it — is replaced
    // by the edit, which carries the version the draft was first read at.
    const blindEarlier = withDraft(onTiles, 'c1', {
      ...drawing('bar'),
      document: local.document,
      version: undefined,
    });

    expect(whyUnsaveable(blindEarlier, 'd1')).toMatch(/safely/);
    expect(whyUnsaveableWith(blindEarlier, 'd1', 'c1', local)).toBeUndefined();
  });
});

describe('the chart writes a save sends', () => {
  const localChart = { ...chart, localToDashboardId: 'd1' };
  const localDrawing = (chartType: RenderSpec['chartType'], version: number | undefined) => ({
    ...drawing(chartType),
    document: localChart,
    version,
  });

  it('writes each drafted chart with the version it was read at', () => {
    const drafted = withDraft(
      withDraft(showing('c1', 'c2'), 'c1', localDrawing('bar', 4)),
      'c2',
      localDrawing('pie', 9),
    );

    expect(chartWritesOf(drafted, 'd1')).toEqual([
      { id: 'c1', document: localChart, version: 4 },
      { id: 'c2', document: localChart, version: 9 },
    ]);
  });

  it('writes nothing when nothing is drafted', () => {
    expect(chartWritesOf(showing('c1'), 'd1')).toEqual([]);
  });

  it('does not write the draft of a chart no tile shows any more', () => {
    // The tile was deleted after the edit. Written, the chart would change
    // for nothing on screen, in a save that says nothing of it.
    const tileDeleted = withDraft(showing('c1'), 'c2', localDrawing('pie', 9));

    expect(chartWritesOf(tileDeleted, 'd1')).toEqual([]);
  });

  /**
   * Save is held back for each of these already (`whyUnsaveable`). This is
   * the second guard, applying the same rule: if the two ever disagreed, the
   * failure would be a silent overwrite of someone else's chart, or a change
   * spread to other dashboards unannounced — so it fails loudly instead.
   */
  it('refuses to build a write it cannot check, rather than write blind', () => {
    const blind = withDraft(showing('c1'), 'c1', localDrawing('bar', undefined));

    expect(() => chartWritesOf(blind, 'd1')).toThrow(/version/);
  });

  it('refuses to build a write for a library chart or another dashboard’s', () => {
    const libraryDraft = withDraft(showing('c1'), 'c1', { ...drawing('bar'), version: 4 });
    const elsewhereDraft = withDraft(showing('c1'), 'c1', {
      ...drawing('bar'),
      document: { ...chart, localToDashboardId: 'd2' },
      version: 4,
    });

    expect(() => chartWritesOf(libraryDraft, 'd1')).toThrow(/library chart/);
    expect(() => chartWritesOf(elsewhereDraft, 'd1')).toThrow(/another dashboard/);
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
