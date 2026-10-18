import {
  applyQuickCalc,
  CHART_DOCUMENT_VERSION,
  chartDocumentOf,
  emptySpec,
  migrateChartDocument,
  readChartDocument,
  removeFromWell,
  type ChartDocument,
} from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { FOLLOWING_RECOMMENDATION } from './chartTypeState';
import {
  changesChart,
  chartDocumentWith,
  editorStateOf,
  editorViewOf,
  loadChart,
  loadEditorState,
  OPENED_WITH,
} from './openChart';

/**
 * T191 / AC-182: WHEN the chart editor is opened on an existing chart, THE
 * SYSTEM SHALL load that chart's cube, fields, chart type and axis settings
 * into the editor.
 * `Fails when: the editor opens with empty wells, or with a chart type other
 * than the one saved.`
 *
 * Until this task no criterion said the editor loads anything. `ChartEditor`
 * took no props and always started from an empty state, so every "edit this
 * chart" path opened a blank editor — and the e2e specs had quietly encoded
 * that by navigating to a fictitious id.
 */
const saved: ChartDocument = chartDocumentOf({
  title: 'Orders by category and status',
  spec: {
    ...emptySpec('orders'),
    measures: ['orders.count'],
    dimensions: ['products.category', 'orders.status'],
    timeDimensions: ['orders.createdAt'],
    chartType: 'bar',
  },
  options: { axes: { y: { title: 'Orders', min: 0 } } },
});

describe('loading a saved chart into the editor', () => {
  it('loads the cube into both the picker and the query', () => {
    /**
     * The editor holds the cube twice — `cubeName` drives the picker and
     * `spec.cube` drives the query. Loading only one would show the right
     * cube selected over a query against no cube, or the reverse.
     */
    const state = editorStateOf(saved);

    expect(state.cubeName).toBe('orders');
    expect(state.spec.cube).toBe('orders');
  });

  it('puts every field back in the well it was saved in', () => {
    // The criterion's first failing state is "the editor opens with empty
    // wells". Each well is checked by content and order, not by length.
    const state = editorStateOf(saved);

    expect(state.spec.measures).toEqual(['orders.count']);
    expect(state.spec.dimensions).toEqual(['products.category', 'orders.status']);
    expect(state.spec.timeDimensions).toEqual(['orders.createdAt']);
  });

  it('loads a saved chart type as the user’s own choice', () => {
    /**
     * The document's rule is that a chart type is present only when the user
     * chose one — "Absent means the recommender's pick is followed". So a
     * saved type is a *manual* choice, and loading it as the recommendation
     * would let the next field change silently re-recommend over it: the very
     * behaviour AC-032 forbids.
     */
    expect(editorStateOf(saved).chartType).toEqual({ manual: 'bar' });
  });

  it('follows the recommendation when no type was saved', () => {
    const recommended = chartDocumentOf({
      title: 'Follows the recommender',
      spec: { ...emptySpec('orders'), measures: ['orders.count'] },
    });

    expect(editorStateOf(recommended).chartType).toBe(FOLLOWING_RECOMMENDATION);
  });

  it('keeps the chart type in one place, not also on the spec', () => {
    /**
     * Load-bearing, not tidiness. The preview is built by `chartDocumentOf({
     * spec, options })`, which copies `spec.chartType` into the document, and
     * `compile` takes the *document's* type in preference to the one the
     * editor passes it (`chart.chartType ?? options.chartType`). So a saved
     * type left on the spec would override every type the user picked, in
     * the preview, immediately — the chart would refuse to change.
     */
    expect(editorStateOf(saved).spec.chartType).toBeUndefined();
  });

  it('loads the axis settings, under the key the editor reads them from', () => {
    /**
     * The editor reads axis settings only from `options.axes.{x,y}`. An
     * earlier version of this test used a key nothing reads, so it proved
     * that `options` passed through and not that any axis setting would
     * appear — the Axes panel would have shown nothing.
     */
    expect(editorStateOf(saved).options).toEqual({ axes: { y: { title: 'Orders', min: 0 } } });
  });

  it('refuses a chart type this build does not know, saying which', () => {
    /**
     * `readChartDocument` accepts any string as a chart type, and the editor
     * indexes a table by it, so an unknown type threw during render and took
     * the whole route down to the router's generic error. Treating it as
     * "nothing chosen" — as a dashboard tile does — would open the chart with
     * a type other than the one saved, which is AC-182's failing state, and a
     * save would then erase the type. So the editor declines to open it.
     */
    // Built the way it really arrives — a stored body through the same strict
    // reader the route uses — rather than cast past the type.
    const unknown = readChartDocument({
      schemaVersion: CHART_DOCUMENT_VERSION,
      title: 'From a later build',
      chart: {
        source: { cube: 'orders' },
        wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
        // A gauge: no wechart has one (R81, "No gauge"); a Sankey is R81's (T934).
        chartType: 'gauge',
      },
    });

    expect(() => editorStateOf(unknown)).toThrow(/gauge/);
  });

  it('loads no axis settings as an empty set, not as missing', () => {
    // `options` is always an object in the editor; the axis panel reads keys
    // off it without checking it exists.
    const plain = chartDocumentOf({ title: 'Plain', spec: emptySpec('orders') });

    expect(editorStateOf(plain).options).toEqual({});
  });
});

/** A `fetch` that answers one request with a fixed status and JSON body. */
function answering(status: number, body: unknown): typeof fetch {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
}

describe('opening a chart by id', () => {
  it('fetches the chart and loads it', async () => {
    const state = await loadEditorState('seed-chart-status', answering(200, { body: saved }));

    expect(state.spec.measures).toEqual(['orders.count']);
    expect(state.chartType).toEqual({ manual: 'bar' });
  });

  it('can give back the stored document as well, for a caller that will write the edit', async () => {
    // The overlay (T032) merges the edit onto this; the state alone would
    // lose everything the editor does not edit.
    const { document, state } = await loadChart(
      'seed-chart-status',
      answering(200, { body: saved }),
    );

    expect(document).toEqual(saved);
    expect(state).toEqual(editorStateOf(saved));
  });

  it('gives back the version the chart was read at', async () => {
    /**
     * T192 writes the edit back with this version, so a chart changed by
     * someone else in the meantime is refused rather than overwritten — as
     * the dashboard's own save refuses a stale dashboard (409).
     */
    const { version } = await loadChart(
      'seed-chart-status',
      answering(200, { body: saved, version: 4 }),
    );

    expect(version).toBe(4);
  });

  it('keeps every field this build does not know, so writing an edit back loses none', async () => {
    /**
     * The server replaces a chart's body whole, and `readChartDocument` keeps
     * only the fields it knows. Written from that, anything this build does not
     * model — a field a newer build added, say — would be gone after the first
     * save from a tile (T192): the `dashboardOf` data loss of T075, one level
     * down. At every level the document nests: the chart, its source, its
     * wells.
     */
    const stored = {
      ...saved,
      futureTop: { kept: true },
      chart: {
        ...saved.chart,
        futureChart: 2,
        source: { ...saved.chart.source, futureSource: 'x' },
        wells: { ...saved.chart.wells, futureWell: ['orders.total'] },
      },
    };
    const { document, state } = await loadChart('c1', answering(200, { body: stored }));

    const written = chartDocumentWith(document, { ...state, chartType: { manual: 'pie' } });

    expect(written).toEqual({ ...stored, chart: { ...stored.chart, chartType: 'pie' } });
  });

  it('does not bring back a known field the reader rejected', () => {
    /**
     * Only fields the reader does not model ride along. One it models and
     * left out — a type that is not a string, an owner that is not a string —
     * was rejected, and bringing the stored value back undoes the check: a
     * `chartType: null` made the editor refuse a chart that opened, and drew,
     * following its recommendation.
     */
    const stored = {
      ...saved,
      owner: 42,
      localToDashboardId: null,
      chart: { ...saved.chart, chartType: null },
    };

    return loadChart('c1', answering(200, { body: stored })).then(({ document, state }) => {
      expect('owner' in document).toBe(false);
      expect('localToDashboardId' in document).toBe(false);
      expect('chartType' in document.chart).toBe(false);
      expect(state.chartType).toEqual(FOLLOWING_RECOMMENDATION);
    });
  });

  it('asks for the chart it was given, escaped', async () => {
    // An id is interpolated into a path, so one containing a slash must not
    // reach a different resource.
    let asked = '';
    const recording: typeof fetch = async (input) => {
      asked = String(input);
      return new Response(JSON.stringify({ body: saved }), { status: 200 });
    };

    await loadEditorState('a/b', recording);

    expect(asked).toBe('/api/documents/chart/a%2Fb');
  });

  it('says a missing chart is no longer available', async () => {
    /**
     * Rather than opening an empty editor. The chart named in the URL is the
     * one the user asked for, and silently offering a blank one in its place
     * would let them build a new chart believing they were editing the old.
     * Worded as the dashboard's missing-chart tile words it (AC-017), so the
     * same condition reads the same way wherever it is met.
     */
    await expect(loadEditorState('gone', answering(404, { error: 'Not found' }))).rejects.toThrow(
      'This chart is no longer available.',
    );
  });

  it('passes on the server’s reason for refusing a newer format', async () => {
    /**
     * AC-181: "SHALL refuse to open one whose format is newer than it
     * understands, saying so". The server now sends that sentence with a 422;
     * a generic message here would throw it away a second time.
     */
    const newer =
      'The stored chart is version 9, but this wechart understands only up to 1. It was saved by a newer version.';

    await expect(loadEditorState('c1', answering(422, { error: newer }))).rejects.toThrow(newer);
  });
});

/**
 * T032: the inverse — the editor's state, written back onto the chart it was
 * loaded from, for a tile's draft (and, at T192, for saving).
 *
 * `EditorState` holds only what the editor edits. The chart document also
 * carries `encoding`, a title, an owner, a folder and the dashboard it belongs
 * to. Rebuilding the document from the state would drop all of them — a chart
 * leaving its folder or its dashboard on save, the shape of the `dashboardOf`
 * data loss at T075 — so the state is merged onto the loaded document.
 */
describe('writing the editor’s state back onto the chart', () => {
  const everything = {
    ...chartDocumentOf({
      title: 'Orders by status',
      owner: 'admin',
      folderId: 'f1',
      localToDashboardId: 'd1',
      encoding: { color: ['orders.status'] },
      spec: {
        ...emptySpec('orders'),
        measures: ['orders.count'],
        dimensions: ['orders.status'],
        chartType: 'bar',
      },
      options: { axes: { y: { title: 'Orders' } } },
    }),
  } as ChartDocument;

  it('gives back the same chart when nothing was edited', () => {
    // The whole round trip: every field survives, edited or not.
    expect(chartDocumentWith(everything, editorStateOf(everything))).toEqual(everything);
  });

  it('gives back the same chart for one with no axis settings, as every seeded chart is', () => {
    /**
     * The editor holds "no settings" as `{}`, so writing that back verbatim
     * added `options: {}` to a chart that had none — not the identical
     * document the round trip promises. An earlier version of this file
     * tested only a chart that had options, and so could not see it.
     */
    const plain = chartDocumentOf({
      title: 'Plain',
      spec: { ...emptySpec('orders'), measures: ['orders.count'], chartType: 'bar' },
    });

    expect(chartDocumentWith(plain, editorStateOf(plain))).toEqual(plain);
  });

  /** T228 / AC-214: the title is edited in the editor's header, and saved. */
  it('takes a title changed in the header, and keeps it otherwise', () => {
    const renamed = chartDocumentWith(everything, {
      ...editorStateOf(everything),
      title: 'Renamed in the header',
    });
    expect(renamed.title).toBe('Renamed in the header');
    expect(renamed.chart).toEqual(everything.chart);

    // A state with no title — a chart opened with none to load — keeps the stored one.
    const { cubeName, spec, chartType, options } = editorStateOf(everything);
    expect(chartDocumentWith(everything, { cubeName, spec, chartType, options }).title).toBe(
      everything.title,
    );
    // Nor one cleared to nothing: a chart always has a name (T228's review).
    const cleared = { ...editorStateOf(everything), title: '   ' };
    expect(chartDocumentWith(everything, cleared).title).toBe(everything.title);
  });

  it('takes a changed cube', () => {
    const written = chartDocumentWith(everything, {
      ...editorStateOf(everything),
      cubeName: 'customers',
      spec: { ...emptySpec('customers'), measures: ['customers.count'] },
    });

    expect(written.chart.source.cube).toBe('customers');
  });

  // The cube has a test of its own below; this one never changes it.
  it('takes the edited fields and axis settings', () => {
    const state = {
      ...editorStateOf(everything),
      cubeName: 'orders',
      spec: {
        ...emptySpec('orders'),
        measures: ['orders.total_amount'],
        dimensions: ['orders.status'],
        timeDimensions: ['orders.ordered_at'],
      },
      options: { axes: { y: { title: 'Revenue' } } },
    };

    const written = chartDocumentWith(everything, state);

    expect(written.chart.wells).toEqual({
      measures: ['orders.total_amount'],
      dimensions: ['orders.status'],
      timeDimensions: ['orders.ordered_at'],
    });
    expect(written.chart.options).toEqual({ axes: { y: { title: 'Revenue' } } });
  });

  it('keeps what the editor does not edit: title, owner, folder, dashboard and encoding', () => {
    const written = chartDocumentWith(everything, {
      ...editorStateOf(everything),
      options: {},
    });

    expect(written.title).toBe('Orders by status');
    expect(written.owner).toBe('admin');
    expect(written.folderId).toBe('f1');
    expect(written.localToDashboardId).toBe('d1');
    expect(written.chart.encoding).toEqual({ color: ['orders.status'] });
  });

  it('writes a type the user chose', () => {
    const written = chartDocumentWith(everything, {
      ...editorStateOf(everything),
      chartType: { manual: 'pie' },
    });

    expect(written.chart.chartType).toBe('pie');
  });

  it('writes no type when the chart follows the recommendation, even if it had one', () => {
    /**
     * A present type means the user chose it, and T191 loads it as manual. A
     * user who went "back to recommended" on a chart that had a type must not
     * have the old type written back — the chart would reopen pinned to it.
     */
    const written = chartDocumentWith(everything, {
      ...editorStateOf(everything),
      chartType: FOLLOWING_RECOMMENDATION,
    });

    expect('chartType' in written.chart).toBe(false);
  });

  it('writes a box plot’s "Each point is", and none once it is cleared (T400, AC-314)', () => {
    const boxplot = chartDocumentOf({
      title: 'Amounts by status',
      spec: {
        ...emptySpec('orders'),
        measures: ['orders.total_amount'],
        dimensions: ['orders.status'],
        chartType: 'boxplot',
        eachPointIs: 'customers.name',
      },
    });
    const opened = editorStateOf(boxplot);
    // Opened, it is in the editor's spec, and written back as it was.
    expect(opened.spec.eachPointIs).toBe('customers.name');
    expect(chartDocumentWith(boxplot, opened)).toEqual(boxplot);

    const changed = chartDocumentWith(boxplot, {
      ...opened,
      spec: { ...opened.spec, eachPointIs: 'orders.id' },
    });
    expect(changed.chart.wells.eachPointIs).toBe('orders.id');

    // Made another type, it isn't written: a bar has no such well to show or clear it.
    const bar = chartDocumentWith(boxplot, { ...opened, chartType: { manual: 'bar' } });
    expect('eachPointIs' in bar.chart.wells).toBe(false);

    // Cleared, it isn't brought back from the stored chart.
    const { eachPointIs: _cleared, ...rest } = opened.spec;
    void _cleared;
    const written = chartDocumentWith(boxplot, { ...opened, spec: rest });
    expect(written.chart.wells).toEqual({
      measures: ['orders.total_amount'],
      dimensions: ['orders.status'],
      timeDimensions: [],
    });
  });

  /** T380 / AC-047: a quick calculation chosen on a measure is what is saved. */
  it('writes the quick calculations as the editor has them, and none once taken off', () => {
    const opened = editorStateOf(everything);
    const ranked = {
      ...opened,
      spec: applyQuickCalc(opened.spec, 'orders.count', { kind: 'rank' as const }),
    };

    // Chosen, it is written, and reads back into the editor.
    const written = chartDocumentWith(everything, ranked);
    expect(written.chart.calculations).toEqual({ 'orders.count': { kind: 'rank' } });
    expect(
      editorStateOf(readChartDocument(JSON.parse(JSON.stringify(written)))).spec.calculations,
    ).toEqual({ 'orders.count': { kind: 'rank' } });
    // A change to a calculation alone is a change (T032).
    expect(changesChart(everything, opened, ranked)).toBe(true);

    // Taken off, it isn't brought back from the stored chart.
    const stored = chartDocumentWith(everything, ranked);
    const reopened = editorStateOf(stored);
    const takenOff = {
      ...reopened,
      spec: applyQuickCalc(reopened.spec, 'orders.count', undefined),
    };
    expect('calculations' in chartDocumentWith(stored, takenOff).chart).toBe(false);

    // Its measure removed, it goes too.
    const removed = {
      ...reopened,
      spec: removeFromWell(reopened.spec, 'measures', 'orders.count'),
    };
    expect('calculations' in chartDocumentWith(stored, removed).chart).toBe(false);
  });
});

/**
 * T032: whether going back from the editor changed anything. Decided by what
 * would be written, not by object identity — changing a chart and changing it
 * back yields a new state object with the same content, and recording that as
 * a change would put "Discard (1 change)" on a dashboard exactly as it was.
 */
describe('whether the chart was changed', () => {
  const opened = editorStateOf(saved);

  it('is unchanged when the state is the one it opened with', () => {
    expect(changesChart(saved, opened, opened)).toBe(false);
  });

  it('is unchanged when a change was made and then undone by hand', () => {
    // A different object — made by choosing another type and then the
    // original again — with the same content.
    const roundabout = { ...opened, chartType: { manual: 'bar' as const } };

    expect(roundabout).not.toBe(opened);
    expect(changesChart(saved, opened, roundabout)).toBe(false);
  });

  it('is unchanged when the same settings were made in a different order', () => {
    /**
     * Key order in the options depends on the order settings were made:
     * clearing a sort and setting the same sort again moves its key. Compared
     * as written JSON, that read as a change. The content is the same.
     */
    const inOrder = {
      ...opened,
      options: { axes: { y: { title: 'Orders' } }, sort: { by: 'value' } },
    };
    const reordered = {
      ...opened,
      options: { sort: { by: 'value' }, axes: { y: { title: 'Orders' } } },
    };

    expect(changesChart(saved, inOrder, reordered)).toBe(false);
  });

  it('is changed when the fields in a well are put in another order', () => {
    // Keys are compared in any order; the order of fields is not — it decides
    // how the chart is drawn, so changing it is a change.
    const flipped = {
      ...opened,
      spec: { ...opened.spec, dimensions: [...opened.spec.dimensions].reverse() },
    };

    expect(changesChart(saved, opened, flipped)).toBe(true);
  });

  it('is changed when what would be written differs', () => {
    const changed = { ...opened, chartType: { manual: 'stackedBar' as const } };

    expect(changesChart(saved, opened, changed)).toBe(true);
  });
});

describe('a new chart', () => {
  it('opens exactly as an empty editor does, through the path it really takes', () => {
    /**
     * A brand-new chart is stored by the create endpoint as a title and an
     * owner, with no format version and no definition, and is upgraded on
     * read. That whole path — upgrade, parse, load — is what runs when a new
     * chart is opened, so it is what is tested. An earlier version of this
     * test compared `OPENED_WITH` with its own literal, which the route no
     * longer even uses for this case.
     */
    const stub = { title: 'Untitled chart', owner: 'admin' };

    const state = editorStateOf(readChartDocument(migrateChartDocument(stub)));

    // Empty, with the title it was made with, which the header edits (AC-214).
    expect(state).toEqual({ ...OPENED_WITH, title: 'Untitled chart' });
  });
});

describe('what the route shows', () => {
  it('shows the editor while it has a chart, even if a later refetch failed', () => {
    /**
     * Once the chart has loaded, the editor holds the user's edits. A failed
     * background refetch — a network blip, say — must not swap it for an
     * error paragraph, because unmounting the editor throws those edits away.
     */
    const view = editorViewOf({ data: OPENED_WITH, error: new Error('offline') });

    expect(view).toEqual({ kind: 'editor', initial: OPENED_WITH });
  });

  it('shows the error only when there is no chart to show', () => {
    expect(
      editorViewOf({ data: undefined, error: new Error('This chart is no longer available.') }),
    ).toEqual({ kind: 'error', message: 'This chart is no longer available.' });
  });

  it('shows loading while there is neither', () => {
    expect(editorViewOf({ data: undefined, error: null })).toEqual({ kind: 'loading' });
  });
});
