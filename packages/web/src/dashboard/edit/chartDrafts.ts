import type { ChartDocument, RenderSpec } from '@wechart/core';

import { chartIdsOf, type ChartDraft, type DashboardDocument } from '../model/document';
import type { AnswerMeta } from '../../query/answerMeta';
import type { ChartWrite } from './save';

export type { ChartDraft };

/**
 * Charts edited from a tile, held in the dashboard's edit session until the
 * dashboard is saved (T032; AC-183 writes them, at T192).
 *
 * **Why in the session, and not written when the editor closes.** A chart
 * written on return would survive a Discard, and AC-066 — ticked — says
 * Discard restores "the dashboard, its chart specs and its settings". Held on
 * the session's document instead, a draft is undone, redone and discarded
 * with everything else, because the history stores whole documents. Nothing
 * here has to write old specs back to the server, which would race anyone
 * else editing a shared chart.
 */

/**
 * The dashboard with this chart's edit held as a draft, replacing any earlier
 * one. A chart saved to a folder in the session stays so through a later edit
 * (T133): the chart editor hands back a draft that knows nothing of it.
 */
export function withDraft(
  dashboard: DashboardDocument,
  chartId: string,
  draft: ChartDraft,
): DashboardDocument {
  const wasLocalTo = draft.wasLocalTo ?? dashboard.chartDrafts?.[chartId]?.wasLocalTo;
  const held =
    wasLocalTo === undefined || draft.document.localToDashboardId !== undefined
      ? draft
      : { ...draft, wasLocalTo };
  return { ...dashboard, chartDrafts: { ...dashboard.chartDrafts, [chartId]: held } };
}

export interface Drawn {
  readonly specs: Readonly<Record<string, RenderSpec>>;
  readonly errors: Readonly<Record<string, unknown>>;
  /**
   * The chart documents the tiles show, by chart id — a drafted chart's as
   * edited. What filters re-query (F9), and what names a tile.
   */
  readonly documents?: Readonly<Record<string, ChartDocument>> | undefined;
  /** What Cube said of each chart's answer: when from, and from what (T154, T014). */
  readonly answered?: Readonly<Record<string, AnswerMeta>> | undefined;
  /**
   * Each drafted chart's rows in all, where its draft's query asked Cube for
   * them (T401's review, AC-315): of its answer, only that is known here.
   */
  readonly totals?: Readonly<Record<string, number>> | undefined;
}

/**
 * What each tile draws: a drafted chart from its draft — its spec, or the
 * reason it has none — and every other chart as saved. AC-034 fails when "the
 * dashboard tile does not reflect the applied changes", and the draft is what
 * was applied.
 *
 * A draft replaces the saved chart on *both* sides. A drafted chart that no
 * longer draws must not keep its saved spec — the tile would show the old
 * chart the user has just emptied — and one that now draws must not keep a
 * saved error.
 *
 * Returned as it is when nothing is drafted, so a dashboard with no drafts
 * does not hand its tiles new objects on every render.
 */
export function drawnWithDrafts(saved: Drawn, dashboard: DashboardDocument): Drawn {
  const drafts = dashboard.chartDrafts;
  if (drafts === undefined || Object.keys(drafts).length === 0) return saved;

  const specs: Record<string, RenderSpec> = { ...saved.specs };
  const errors: Record<string, unknown> = { ...saved.errors };
  const documents: Record<string, ChartDocument> = { ...saved.documents };
  // A drafted chart's answer came from the editor: what Cube said of it is
  // not known here.
  const answered: Record<string, AnswerMeta> = { ...saved.answered };
  const totals: Record<string, number> = {};
  for (const [chartId, draft] of Object.entries(drafts)) {
    documents[chartId] = draft.document;
    delete answered[chartId];
    if (draft.total !== undefined) totals[chartId] = draft.total;
    if ('spec' in draft.drawn) {
      specs[chartId] = draft.drawn.spec;
      delete errors[chartId];
    } else {
      errors[chartId] = draft.drawn.error;
      delete specs[chartId];
    }
  }
  return { specs, errors, documents, answered, totals };
}

/**
 * The drafts a save acts on: those of charts a tile still shows. A draft
 * outlives its tile — the session keeps whole documents, so undoing the
 * deletion brings both back — but a chart no tile shows is not the
 * dashboard's to write, and its draft must not hold Save back: deleting the
 * tile is how a user gets rid of a chart edit they cannot save.
 */
function draftsInUse(dashboard: DashboardDocument): [string, ChartDraft][] {
  const shown = new Set(chartIdsOf(dashboard));
  return Object.entries(dashboard.chartDrafts ?? {}).filter(([id]) => shown.has(id));
}

/**
 * Why this chart could not be written with dashboard `dashboardId`, or
 * undefined when it could — the rule `PUT /api/dashboards/:id` applies too, so
 * the two agree on what may be written.
 *
 * - **A library chart** (local to no dashboard) is written, and so changes
 *   every dashboard that uses it: the editor has said it is shared, and on
 *   how many, and offered a local copy first (T134, AC-128) — saved
 *   everywhere, at the user's decision (2026-09-22). So is this dashboard's
 *   own chart saved to a folder in the session (T133).
 * - **A chart local to another dashboard** is that dashboard's to save.
 * - **No version**: it could only be written blind, overwriting whatever
 *   anyone else saved meanwhile.
 */
type Refusal = 'elsewhere' | 'blind';

function refusalOf(
  draft: Pick<ChartDraft, 'document' | 'version' | 'wasLocalTo'>,
  dashboardId: string,
): Refusal | undefined {
  const owner = draft.document.localToDashboardId;
  if (owner !== undefined && owner !== dashboardId) return 'elsewhere';
  if (draft.version === undefined) return 'blind';
  return undefined;
}

/**
 * Why a dashboard holding chart drafts cannot be saved as it stands, or
 * undefined when it can (T192; used for `EditChrome`'s `saveBlocked`). Only
 * the drafts of charts a tile still shows count (`draftsInUse`).
 *
 * The way out is stated truly: undo is linear, and every change made after a
 * draft carries it, so undoing back past it undoes those too. Discard is not
 * offered — it throws away every change in the session.
 */
export function whyUnsaveable(
  dashboard: DashboardDocument,
  dashboardId: string,
): string | undefined {
  switch (
    worstOf(
      draftsInUse(dashboard).map(([, draft]) => draft),
      dashboardId,
    )
  ) {
    case 'elsewhere':
      return 'A chart that belongs to another dashboard was changed from its tile, and can only be saved with that dashboard. To save, undo back past that change; anything changed after it is undone too.';
    case 'blind':
      return 'A chart changed from its tile can’t be saved safely: its version is unknown, so saving could overwrite someone else’s change. To save, undo back past it; anything changed after it is undone too.';
    case undefined:
      return undefined;
  }
}

/** The refusal to report when several drafts are refused: the one that matters most. */
const REFUSALS_IN_ORDER: readonly Refusal[] = ['elsewhere', 'blind'];

function worstOf(
  drafts: readonly Pick<ChartDraft, 'document' | 'version' | 'wasLocalTo'>[],
  dashboardId: string,
): Refusal | undefined {
  const found = new Set(drafts.map((draft) => refusalOf(draft, dashboardId)));
  return REFUSALS_IN_ORDER.find((refusal) => found.has(refusal));
}

/**
 * Whether the dashboard could be saved with this chart's edit applied, asked
 * while the edit is still in the editor — for its "Save dashboard", which
 * "applies the chart and saves the dashboard" (direction.md §2). `pending` is
 * undefined when the chart is unchanged, which applies nothing.
 *
 * Judged on the same rules as `whyUnsaveable`, with the edit in place of this
 * chart's earlier draft: the edit replaces it on applying, and carries the
 * version that draft was read at.
 *
 * The reasons for this chart are its own, not `whyUnsaveable`'s. Those tell
 * someone on the dashboard to undo back past a change; here the change has not
 * been made yet, and Back keeps it on the dashboard unsaved.
 */
export function whyUnsaveableWith(
  dashboard: DashboardDocument,
  dashboardId: string,
  chartId: string,
  pending: Pick<ChartDraft, 'document' | 'version' | 'wasLocalTo'> | undefined,
): string | undefined {
  const inUse = new Map<string, Pick<ChartDraft, 'document' | 'version' | 'wasLocalTo'>>(
    draftsInUse(dashboard),
  );
  // This chart as Save dashboard would save it: the edit, or with none, the
  // change made to it earlier in the session — still saved to a folder, if it
  // was (T133), as `withDraft` keeps it on applying.
  const earlier = inUse.get(chartId);
  const wasLocalTo = pending?.wasLocalTo ?? earlier?.wasLocalTo;
  const own =
    pending === undefined
      ? earlier
      : wasLocalTo === undefined
        ? pending
        : { ...pending, wasLocalTo };
  inUse.delete(chartId);

  switch (worstOf(own === undefined ? [] : [own], dashboardId)) {
    case 'elsewhere':
      return 'This chart belongs to another dashboard, so a change to it can only be saved with that dashboard. Back keeps the change on this one, unsaved.';
    case 'blind':
      return 'This chart can’t be saved safely: its version is unknown, so saving could overwrite someone else’s change. Back keeps the change on the dashboard, unsaved.';
    case undefined:
      break;
  }

  // Held back by another tile's chart instead: said so, in words that can be
  // acted on from here — the dashboard's own reason says to undo back past a
  // change, and the dashboard's Undo cannot be reached under the editor.
  switch (worstOf([...inUse.values()], dashboardId)) {
    case 'elsewhere':
      return 'Another tile’s chart was changed, and it belongs to another dashboard, so this one can’t be saved with it. Back keeps this change on the dashboard, unsaved.';
    case 'blind':
      return 'Another tile’s chart was changed, and its version is unknown, so the dashboard can’t be saved safely. Back keeps this change on the dashboard, unsaved.';
    case undefined:
      return undefined;
  }
}

/**
 * The charts a dashboard save writes along with it (T192, AC-183): each
 * drafted chart a tile still shows (`draftsInUse`), with the version it was
 * read at so a chart changed elsewhere meanwhile is refused rather than
 * overwritten.
 *
 * A draft that cannot be written with dashboard `dashboardId` throws. Save is
 * already held back for one (`whyUnsaveable`, by the same rule); this is the
 * second guard, because if the two ever disagreed the failure would be a
 * silent overwrite of someone else's chart, or a change spread to other
 * dashboards unannounced.
 */
export function chartWritesOf(
  dashboard: DashboardDocument,
  dashboardId: string,
): readonly ChartWrite[] {
  return draftsInUse(dashboard).map(([id, draft]) => {
    const refusal = refusalOf(draft, dashboardId);
    if (refusal === 'elsewhere') {
      throw new Error(
        `Chart ${id} belongs to another dashboard, so it cannot be saved with this one.`,
      );
    }
    if (draft.version === undefined) {
      throw new Error(
        `Chart ${id} has no version to be checked against, so it cannot be saved safely.`,
      );
    }
    return { id, document: draft.document, version: draft.version };
  });
}

/**
 * The dashboard as it may be saved: with no drafts on it.
 *
 * The save sends the whole document, by design (T071), so a draft left on it
 * would be written into the dashboard's own row — query rows and all — and
 * read back as though it belonged to the dashboard. Writing the chart itself
 * is AC-183's (T192).
 *
 * Returned as it is when there are none: a copy of an unchanged document
 * would read as a change to anything that compares by identity.
 */
export function withoutDrafts(dashboard: DashboardDocument): DashboardDocument {
  if (!('chartDrafts' in dashboard)) return dashboard;

  // Every other key kept, including any this build does not know: naming the
  // fields to keep instead is how `dashboardOf` once dropped a dashboard's
  // folder on save (T075).
  return Object.fromEntries(
    Object.entries(dashboard).filter(([key]) => key !== 'chartDrafts'),
  ) as unknown as DashboardDocument;
}
