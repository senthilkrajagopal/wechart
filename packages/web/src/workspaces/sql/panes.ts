import { useSyncExternalStore } from 'react';

/**
 * The SQL runner's three panes, as direction §7f and rule 91 size them
 * (design 17, screen 1 and state O; T797):
 *
 * - the left pane, the data source picker and schema browser: 280 px to
 *   start, dragged between 220 and 400, a 40 px rail when folded;
 * - the right pane, Saved and History: 320 px, 280 to 480, a 40 px rail;
 * - the centre, the editor over the results, split 30 : 70 to start, the
 *   editor at least 200 px and the results at least 160 px.
 *
 * The two side panes fold to rails by width alone (design 17's Q1, (a)):
 * below 1,280 px the right one, as the inspector does, and below 1,024 px
 * the left one too. A folded pane opens over the centre from its rail.
 */
export const LEFT_PANE = { start: 280, min: 220, max: 400, rail: 40 } as const;
export const RIGHT_PANE = { start: 320, min: 280, max: 480, rail: 40 } as const;
/** The editor's width, too, is held: design 17's state O keeps it at 560 px or more. */
export const SPLIT = { editor: 0.3, editorMin: 200, resultsMin: 160, editorMinWidth: 560 } as const;

/** Below this the right pane is a rail (design 17, O1). */
export const RIGHT_RAIL_QUERY = '(max-width: 1279.98px)';
/** Below this the left pane is a rail too (design 17, O2; direction §2). */
export const LEFT_RAIL_QUERY = '(max-width: 1023.98px)';

type Pane = typeof LEFT_PANE | typeof RIGHT_PANE;

const matches = (query: string) => globalThis.matchMedia?.(query).matches ?? false;

/** Whether the window matches `query`, followed as it is resized. */
export function useWindowMatches(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = globalThis.matchMedia?.(query);
      if (list === undefined) return () => undefined;
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    () => matches(query),
    () => false,
  );
}

/**
 * A side pane's width, dragged to `wanted`, held within its range and within
 * `room`, what the other pane and the editor's 560 px leave it. Never below
 * its least, even where the window leaves less.
 */
export const paneWidth = (pane: Pane, wanted: number, room = Infinity): number =>
  Math.round(Math.max(pane.min, Math.min(pane.max, room, wanted)));

/** The room a side pane has in a workspace `width` px wide beside the other pane's `other`. */
export const roomFor = (width: number, other: number): number =>
  width - other - SPLIT.editorMinWidth;

/**
 * The editor's share of the centre's height, dragged to `editorPx` of
 * `height`, held so the editor keeps 200 px and the results 160. A centre
 * too short for both gives the editor its 200.
 */
export function editorShare(editorPx: number, height: number): number {
  if (height <= 0) return SPLIT.editor;
  const most = Math.max(SPLIT.editorMin, height - SPLIT.resultsMin);
  const px = Math.min(most, Math.max(SPLIT.editorMin, editorPx));
  return px / height;
}
