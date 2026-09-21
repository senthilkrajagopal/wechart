import {
  chartDocumentOf,
  emptySpec,
  migrateChartDocument,
  readChartDocument,
  type ChartDocument,
} from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { FOLLOWING_RECOMMENDATION } from './chartTypeState';
import { editorStateOf, editorViewOf, loadEditorState, OPENED_WITH } from './openChart';

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
      schemaVersion: 1,
      title: 'From a later build',
      chart: {
        source: { cube: 'orders' },
        wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
        chartType: 'sankey',
      },
    });

    expect(() => editorStateOf(unknown)).toThrow(/sankey/);
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

    expect(state).toEqual(OPENED_WITH);
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
