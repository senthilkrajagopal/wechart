import {
  CHART_TYPES,
  ChartDocumentError,
  emptySpec,
  readChartDocument,
  toChartSpec,
  type ChartDocument,
  type ChartSpec,
} from '@wechart/core';

import { chooseType, FOLLOWING_RECOMMENDATION, type ChartTypeState } from './chartTypeState';

/**
 * Everything a change can touch, in one place. AC-035 asks that *every* change
 * is undoable, so the undoable state is one value rather than several pieces
 * that each would have to remember to record themselves.
 */
export interface EditorState {
  readonly cubeName: string;
  readonly spec: ChartSpec;
  readonly chartType: ChartTypeState;
  /**
   * How this chart is drawn, over and above its fields — axis settings today
   * (AC-040). Part of the undoable state, because AC-035 asks that *every*
   * change is undoable and an axis edit is a change like any other.
   */
  readonly options: Record<string, unknown>;
}

/** A new chart: nothing to load. */
export const OPENED_WITH: EditorState = {
  cubeName: '',
  spec: emptySpec(),
  chartType: FOLLOWING_RECOMMENDATION,
  options: {},
};

export type EditorView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'editor'; readonly initial: EditorState };

/**
 * What the editor route shows for the state of its chart query.
 *
 * **A chart in hand wins over an error.** Once the chart has loaded, the
 * editor holds the user's edits. TanStack Query keeps the last good data when
 * a later refetch fails and sets the error beside it, so checking the error
 * first — as the route first did — would swap a working editor for an error
 * paragraph on a network blip, and unmounting the editor discards everything
 * in it. The error is shown only when there is no chart to show.
 */
export function editorViewOf(query: {
  readonly data: EditorState | undefined;
  readonly error: Error | null;
}): EditorView {
  if (query.data !== undefined) return { kind: 'editor', initial: query.data };
  if (query.error) return { kind: 'error', message: query.error.message };
  return { kind: 'loading' };
}

/**
 * Worded as the dashboard's missing-chart tile words it (AC-017), so the same
 * condition reads the same way wherever it is met.
 */
const MISSING = 'This chart is no longer available.';

/**
 * Fetch a chart by id and open it (AC-182).
 *
 * **Refuses rather than opening blank.** Every failure rejects, and nothing
 * here falls back to `OPENED_WITH`. The chart named in the URL is the one the
 * user asked for; offering an empty editor in its place would let them build a
 * new chart believing they were editing the old one — and a later save would
 * then overwrite it with that.
 *
 * **Passes the server's reason on.** A chart from a newer format is refused by
 * the server with a 422 carrying the sentence that explains it (AC-181,
 * "saying so"). Reducing that to a status code here would throw the reason
 * away a second time, after the server has been fixed to stop doing so.
 *
 * A freshly created chart needs nothing special. The server stores it without
 * a definition and upgrades it on every read into a well-formed empty chart
 * (`UPGRADES[0]`), so it arrives here as an ordinary document and loads blank
 * through the same path as any other.
 */
export async function loadEditorState(
  chartId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<EditorState> {
  return (await loadChart(chartId, fetchImpl)).state;
}

/**
 * The chart as stored, and the editor state it opens with. For a caller that
 * will write the edit back (T032's overlay): the state alone cannot be, since
 * it holds only what the editor edits — see `chartDocumentWith`.
 *
 * Refuses exactly as `loadEditorState` does, which is a thin wrapper over it.
 */
export async function loadChart(
  chartId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ readonly document: ChartDocument; readonly state: EditorState }> {
  const response = await fetchImpl(`/api/documents/chart/${encodeURIComponent(chartId)}`);

  if (!response.ok) {
    if (response.status === 404) throw new Error(MISSING);

    throw new Error(
      (await reasonFrom(response)) ??
        `This chart could not be opened (${String(response.status)}).`,
    );
  }

  const stored = (await response.json()) as { readonly body?: unknown };
  const document = readChartDocument(stored.body);
  return { document, state: editorStateOf(document) };
}

/** The server's own explanation, when its error body carries one. */
async function reasonFrom(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { readonly error?: unknown };
    return typeof body.error === 'string' ? body.error : undefined;
  } catch {
    // Not JSON, or empty: there is no reason to pass on.
    return undefined;
  }
}

/**
 * The editor's state written back onto the chart it was loaded from — the
 * inverse of `editorStateOf` (T032; T192 saves what this returns).
 *
 * **Merged, never rebuilt.** `EditorState` holds only what the editor edits;
 * the document also carries `encoding`, its title, owner, folder and the
 * dashboard it belongs to. Built fresh from the state, those would all be
 * dropped — a chart leaving its folder or its dashboard on save, the shape of
 * the `dashboardOf` data loss at T075. So every field is the loaded one unless
 * the editor edits it, and loading then writing back unchanged gives back the
 * identical document.
 *
 * **A type only if the user chose one.** A present type *means* a choice, and
 * `editorStateOf` loads one as manual. A chart following the recommendation is
 * written with none — including one that had a type and was put back to
 * recommended, which must not reopen pinned to the type it left.
 */
export function chartDocumentWith(loaded: ChartDocument, state: EditorState): ChartDocument {
  // Every field of the loaded chart first, known to this build or not.
  const chart: Record<string, unknown> = {
    ...loaded.chart,
    source: { ...loaded.chart.source, cube: state.spec.cube },
    wells: {
      measures: [...state.spec.measures],
      dimensions: [...state.spec.dimensions],
      timeDimensions: [...state.spec.timeDimensions],
    },
    options: state.options,
  };

  const chosen = state.chartType.manual;
  if (chosen === null) delete chart['chartType'];
  else chart['chartType'] = chosen;

  // The editor holds "no settings" as {}; a chart that had none keeps none,
  // so writing an unchanged chart back really does give the same document.
  if (Object.keys(state.options).length === 0 && loaded.chart.options === undefined) {
    delete chart['options'];
  }

  return { ...loaded, chart: chart as unknown as ChartDocument['chart'] };
}

/**
 * Whether going from `opened` to `now` changes what would be written for this
 * chart (T032).
 *
 * By content, not identity. Changing a chart and changing it back — choosing
 * another type, then the original — gives a new state object with the same
 * content, and the editor's history rightly treats that as a change. Going
 * back to the dashboard should not: it would put "Discard (1 change)" on a
 * dashboard exactly as it was, and that count is what tells an editor they
 * have unsaved work. The settings page draws the same line, structurally.
 *
 * Both sides are written through `chartDocumentWith` and compared in a
 * canonical form. Plain JSON was not exact, as an earlier version of this
 * comment claimed: key order inside the options follows the order settings
 * were made, so the same settings made in another order read as a change.
 */
export function changesChart(
  document: ChartDocument,
  opened: EditorState,
  now: EditorState,
): boolean {
  if (Object.is(opened, now)) return false;

  return (
    canonical(chartDocumentWith(document, opened)) !== canonical(chartDocumentWith(document, now))
  );
}

/**
 * A value as JSON with every object's keys in sorted order, so two objects
 * with the same content compare equal however their keys were added. Arrays
 * keep their order: the order of fields in a well is meaningful, and changing
 * it is a change.
 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, part: unknown) =>
    part !== null && typeof part === 'object' && !Array.isArray(part)
      ? Object.fromEntries(
          Object.entries(part as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : part,
  );
}

/**
 * A saved chart as the editor state it opens with (AC-182).
 *
 * **A saved chart type is the user's own choice.** The document's rule is that
 * `chartType` is present only when someone chose one — "Absent means the
 * recommender's pick is followed" — so a present type loads as manual. Loading
 * it as the recommendation would let the next field change re-recommend over
 * a decision the user made, which is exactly what AC-032 forbids.
 *
 * **The type lives in `chartType` and nowhere else — and that is load-bearing.**
 * `toChartSpec` copies it onto the spec, and it is taken off again here. The
 * preview is built by `chartDocumentOf({ spec, options })`, which copies
 * `spec.chartType` into the document, and `compile` takes the *document's*
 * type in preference to the one the editor passes it (`chart.chartType ??
 * options.chartType`). A saved type left on the spec would therefore override
 * every type the user picked, in the preview, at once: the chart would refuse
 * to change.
 *
 * **A type this build does not know is refused.** `readChartDocument` accepts
 * any string as a type, and the editor indexes a table by it, so an unknown
 * one threw during render and took the route down to the router's generic
 * error. Treating it as "nothing chosen", as a dashboard tile does, would open
 * the chart with a type other than the one saved — AC-182's failing state —
 * and a save would then erase it. Declining, with the reason, is the same
 * answer AC-181 gives a chart from a newer format.
 *
 * Not loaded, because `EditorState` has nowhere to hold them: the document's
 * `encoding` overrides, and its title, owner, folder and dashboard ownership.
 * Harmless while the editor only reads. Whatever writes a chart back (T192)
 * must merge onto the loaded document rather than rebuild one from this state,
 * or it drops them — the same shape as the `dashboardOf` data loss at T075.
 */
export function editorStateOf(document: ChartDocument): EditorState {
  const { chartType, ...spec } = toChartSpec(document);

  if (chartType !== undefined && !CHART_TYPES.includes(chartType)) {
    throw new ChartDocumentError(
      `This chart's type "${String(chartType)}" is not one this wechart knows. It may have been saved by a newer version.`,
    );
  }

  return {
    cubeName: document.chart.source.cube,
    spec,
    chartType: chartType === undefined ? FOLLOWING_RECOMMENDATION : chooseType(chartType),
    options: document.chart.options ?? {},
  };
}
