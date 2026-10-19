import type { CrossFilterConfig, PairAction } from '../settings/interactionMode';

/**
 * What a click on one tile does to the others (AC-117, direction.md rules 13
 * and 32).
 *
 * A pure decision, apart from the components, for the same reason the tile
 * keyboard's is: the pointer and the keyboard have to reach the same result,
 * and a tile's query must not depend on how the selection was made.
 *
 * Filter and Highlight part ways here rather than in the renderer. A filtered
 * target asks Cube for the selection's rows and draws those; a highlighted
 * target keeps its own rows and draws the selection's share beside them, from
 * a second query (the user's decision, 2026-09-22, following Power BI —
 * `docs/research/cross-highlight.md` §1 and its option H2).
 */

/** What was clicked, and where: one member value, from one tile. */
export interface CrossSelection {
  /** The tile the click was on. */
  readonly from: string;
  /** The Cube member the clicked mark stands for. */
  readonly member: string;
  readonly value: string;
  /**
   * The rest of a tuple the mark stands for (a Sankey link's target, T988,
   * AC-612): each filters too, as one selection, said in one chip.
   */
  readonly also?: readonly { readonly member: string; readonly value: string }[];
  /**
   * Every value of its member it stands for, where it is more than one: the
   * members a parallel-coordinates brush passes (T983, AC-599), `value` being
   * the first. Said in one chip by `words`.
   */
  readonly values?: readonly string[];
  /** Its chip's words, where its values are too many to list ("Product: 6 brushed in Margin %"). */
  readonly words?: string;
}

/** A selection's members and values, its tuple's rest after its first. */
export function selectionParts(
  selection: Pick<CrossSelection, 'member' | 'value' | 'also'>,
): { member: string; value: string }[] {
  return [{ member: selection.member, value: selection.value }, ...(selection.also ?? [])];
}

/** Whether two selections are the same one: every member and value alike. */
export function sameSelection(
  a: Pick<CrossSelection, 'member' | 'value' | 'also' | 'values'>,
  b: Pick<CrossSelection, 'member' | 'value' | 'also' | 'values'>,
): boolean {
  return (
    JSON.stringify([selectionParts(a), a.values ?? []]) ===
    JSON.stringify([selectionParts(b), b.values ?? []])
  );
}

/**
 * A cross-filter in a chip's words: "Status = shipped"; a tuple's members
 * each with its value, "Channel: Web · Region: EMEA" (T988, AC-612).
 */
export function crossChipWords(
  selection: Pick<CrossSelection, 'member' | 'value' | 'also' | 'words'>,
  memberTitle?: (member: string) => string | undefined,
): string {
  if (selection.words !== undefined) return selection.words;
  const field = (member: string) => memberTitle?.(member) ?? member;
  if (selection.also === undefined || selection.also.length === 0)
    return `${field(selection.member)} = ${selection.value}`;
  return selectionParts(selection)
    .map((part) => `${field(part.member)}: ${part.value}`)
    .join(' · ');
}

/** The key a pair is written under, as the settings matrix writes it. */
export const pairKey = (source: string, target: string) => `${source}>${target}`;

/**
 * The action set for a pair: the author's, else the dashboard's default
 * (AC-118). A tile never acts on itself — its own selection is drawn on it,
 * not applied to it, and a tile that filtered itself would drop every mark
 * but the one just clicked.
 */
export function actionFor(config: CrossFilterConfig, source: string, target: string): PairAction {
  if (source === target) return 'none';
  return config.pairs?.[pairKey(source, target)] ?? config.defaultAction;
}

/**
 * How a tile of this type shows a highlight (the user's decision, 2026-09-22;
 * `docs/research/cross-highlight.md`).
 *
 * - `share`: the tile keeps its own values, faded, and draws the selection's
 *   value at full strength from the baseline beside them — Power BI's
 *   drawing (option H2), from a second query. Bar-like types only: the
 *   overlay is a second bar in the same slot, which a line or a slice has no
 *   room for.
 * - `fade`: the items that match stay at full strength and the rest fade
 *   (option H1). It needs no second query, and it can only be drawn where the
 *   tile groups by the clicked member — otherwise no item is "the" match.
 * - `filter`: neither drawing applies, so the tile is filtered instead, as
 *   Power BI does for lines, scatter and maps.
 */
export type HighlightKind = 'share' | 'fade' | 'filter';

/**
 * Where the share can be drawn: one bar per category, so the selection's
 * value has a slot of its own to be drawn in. `barGap: '-100%'` is a property
 * of the whole grid, not of one series, so on a grouped or stacked chart the
 * overlay would land on every series at once
 * (`docs/research/cross-highlight.md`, gotcha 4).
 */
const SHARE_TYPES = new Set(['bar', 'hbar']);

/** Where a fade is the honest drawing: whole items, matching or not. */
const FADE_TYPES = new Set([
  'groupedBar',
  'stackedBar',
  'combo',
  'pie',
  'donut',
  'treemap',
  'heatmap',
]);

export function highlightKind(
  chartType: string,
  groupsByMember: boolean,
  /**
   * How many series the tile draws. One bar per category is what the overlay
   * needs; a bar chart with two measures, or split by a dimension, draws
   * several — and a bar chart *is* simply a bar chart with as many series as
   * its wells produce (`charts/src/series/bar.ts`), so the type alone does
   * not say (T123's review).
   */
  seriesCount = 1,
): HighlightKind {
  if (SHARE_TYPES.has(chartType) && seriesCount === 1) return 'share';
  if ((SHARE_TYPES.has(chartType) || FADE_TYPES.has(chartType)) && groupsByMember) return 'fade';
  return 'filter';
}

export interface Highlight {
  readonly selection: CrossSelection;
  readonly kind: Exclude<HighlightKind, 'filter'>;
}

/** What the target tile draws, for deciding how a highlight on it can be shown. */
export interface TargetTile {
  readonly chartType: string;
  /** The members it groups by, so a fade knows whether it has the clicked one. */
  readonly members: readonly string[];
  /** How many series it draws; the share's overlay needs exactly one. */
  readonly seriesCount?: number | undefined;
}

export interface CrossEffects {
  /** Selections that filter this tile, ANDed as every filter on a tile is. */
  readonly filters: readonly CrossSelection[];
  /** The selection this tile shows, and how, where a pair asks for one. */
  readonly highlight?: Highlight | undefined;
}

/**
 * What the selections in effect do to one tile.
 *
 * One highlight at most: a share of a share is not something a chart can say,
 * and the prototype takes the first such selection
 * (`docs/design/prototype/dashboard.js`). Filters from other tiles still
 * apply alongside it, which is what AC-082's AND asks for.
 */
export function effectsOn(
  target: string,
  selections: readonly CrossSelection[],
  config: CrossFilterConfig,
  /**
   * What the target draws. Left out — before its chart has loaded — a
   * highlight is reported as a share, the drawing every bar-like tile gets,
   * and settles once the chart is known.
   */
  tile?: TargetTile,
): CrossEffects {
  const filters: CrossSelection[] = [];
  let highlight: Highlight | undefined;

  for (const selection of selections) {
    switch (actionFor(config, selection.from, target)) {
      case 'filter':
        filters.push(selection);
        break;
      case 'highlight': {
        const kind =
          tile === undefined
            ? 'share'
            : highlightKind(
                tile.chartType,
                tile.members.includes(selection.member),
                tile.seriesCount,
              );
        // A type that can show neither drawing is filtered instead, rather
        // than left unchanged: the pair asked for the selection to reach it.
        if (kind === 'filter') filters.push(selection);
        else highlight ??= { selection, kind };
        break;
      }
      case 'none':
        break;
    }
  }

  return highlight === undefined ? { filters } : { filters, highlight };
}
