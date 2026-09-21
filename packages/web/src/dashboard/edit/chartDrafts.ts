import type { RenderSpec } from '@wechart/core';

import type { ChartDraft, DashboardDocument } from '../model/document';

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

/** The dashboard with this chart's edit held as a draft, replacing any earlier one. */
export function withDraft(
  dashboard: DashboardDocument,
  chartId: string,
  draft: ChartDraft,
): DashboardDocument {
  return { ...dashboard, chartDrafts: { ...dashboard.chartDrafts, [chartId]: draft } };
}

export interface Drawn {
  readonly specs: Readonly<Record<string, RenderSpec>>;
  readonly errors: Readonly<Record<string, unknown>>;
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
  for (const [chartId, draft] of Object.entries(drafts)) {
    if ('spec' in draft.drawn) {
      specs[chartId] = draft.drawn.spec;
      delete errors[chartId];
    } else {
      errors[chartId] = draft.drawn.error;
      delete specs[chartId];
    }
  }
  return { specs, errors };
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
