import { CHART_TYPES, textDocumentFromMarkdown, type ChartType } from '@wechart/core';
import { describeMissing } from '@wechart/recommender';

import type { Element_ } from '../model/document';

/**
 * Section templates for the Add panel (AC-068).
 *
 * The idea is Metabase's — "templates with headings and pre-arranged cards"
 * (`docs/design/references-dashboard-authoring.md` line 306) — and
 * `direction.md` section 2 takes it from there. The specific three, their
 * labels, their hints and their sizes are the dashboard prototype's
 * `TEMPLATES` and `templateItems` (`docs/design/prototype/dashboard.js`),
 * the same source `insert.ts` takes the element palette from.
 *
 * **Two places this deliberately differs from its sources, because a silent
 * divergence is the kind that later reads as a bug:**
 *
 * - Metabase's templates carry a heading and ours do not, and they insert no
 *   section either. The prototype pushes the tiles straight into whichever
 *   container the user aimed at, which is also what AC-068 describes — "its
 *   tiles", not a section wrapping them. A template that inserted a section
 *   would fight the "+ Add" slot the user chose.
 * - The prototype's chart tiles are bound to freshly minted empty local
 *   charts. Dashboard-local charts do not exist yet (T068, blocked on T132),
 *   so these tiles carry an intended type and no chart. That is the same thing
 *   from the user's side — an empty chart to fill in — and it is what AC-068
 *   asks for either way: a tile bound to no fields the user did not choose.
 */
export type TemplateId = 'kpis' | 'two' | 'notes';

export interface TemplateEntry {
  readonly id: TemplateId;
  readonly label: string;
  readonly hint: string;
}

export const SECTION_TEMPLATES: readonly TemplateEntry[] = [
  { id: 'kpis', label: 'KPI row', hint: 'Four empty KPI tiles, 3 columns each' },
  { id: 'two', label: 'Two charts', hint: 'Two empty charts side by side, 6 + 6' },
  { id: 'notes', label: 'Chart with notes', hint: 'Empty chart 8 + text 4' },
];

/**
 * What a chart with nothing in it yet has to say for itself.
 *
 * Distinct from "This chart is no longer available", which is what a tile
 * whose chart has gone says. An empty chart is not a broken one, and telling a
 * user their brand-new tile is missing would send them looking for a fault
 * that is not there.
 *
 * It states the situation and stops there, deliberately. It said "Open it with
 * ✎ to choose them" first, and that was a promise the build does not keep:
 * there is no pencil on a dashboard tile yet, and E does not open a tile with
 * no chart either — `DashboardView` only offers it where a chartId exists, and
 * leaves " E edits." out of the key hints for exactly this case. Naming a way
 * in that has no way in is worse than naming none. The instruction belongs
 * here the day the pencil does (T068 / T132).
 */
export const NOTHING_CHOSEN = 'This chart has no fields yet.';

/**
 * The sentences an empty chart tile shows: AC-068's "state what they need".
 *
 * With an intended type this is AC-033's wording, which names the well and the
 * member type rather than saying "not enough fields" — the same sentences the
 * chart editor shows, so the tile and the editor do not describe the same gap
 * two different ways.
 *
 * Without one — a template may leave the type to the recommender — or for a
 * type that requires nothing at all, such as `table`, there is nothing for
 * `describeMissing` to say, and a tile that says nothing is a blank rectangle
 * with no way in.
 */
export function needsOf(chartType: ChartType | undefined): readonly string[] {
  /**
   * Checked rather than trusted, because this value is persisted and so
   * arrives from the database: `dashboardOf` checks a dashboard's shape, not
   * every value inside it, and `describeMissing` indexes its table directly,
   * so a type this build does not know — hand-edited, seeded, or written by a
   * later version — threw inside render with no boundary above it. A tile
   * whose type means nothing here has nothing chosen, as far as this can tell.
   */
  if (chartType === undefined || !CHART_TYPES.includes(chartType)) return [NOTHING_CHOSEN];

  const missing = describeMissing(chartType, { measures: 0, dimensions: 0, timeDimensions: 0 });
  return missing.length > 0 ? missing : [NOTHING_CHOSEN];
}

/** A chart tile bound to nothing, sized as the prototype sizes it. */
const emptyChart = (id: string, w: number, h: number, chartType?: ChartType): Element_ => ({
  id,
  kind: 'chart',
  w,
  h,
  ...(chartType === undefined ? {} : { chartType }),
});

/** The elements a template lays out, in order, with fresh ids. */
export function templateElements(id: TemplateId, mintId: () => string): readonly Element_[] {
  switch (id) {
    case 'kpis':
      return [1, 2, 3, 4].map(() => emptyChart(mintId(), 3, 13, 'kpi'));
    case 'two':
      // No type: with no fields the recommender has nothing to go on, and
      // naming one here would be choosing for the user (AC-068's whole point).
      return [emptyChart(mintId(), 6, 40), emptyChart(mintId(), 6, 40)];
    default:
      return [
        emptyChart(mintId(), 8, 40),
        // A Text tile (R80), with the prompting text the markdown one had,
        // read by the same conversion an old markdown tile is (T869).
        {
          id: mintId(),
          kind: 'text',
          w: 4,
          h: 40,
          document: textDocumentFromMarkdown('## Notes\n\nDescribe what this chart shows.'),
        },
      ];
  }
}
