import { markingsFrom, removeMarking, setDefaultMarking, type Marking } from '@wechart/core';

import { chartTilesOf } from '../../filters/scope';
import { changeTile, elementAt, isTile, type DashboardDocument } from '../model/document';
import { allowedLimits } from './TileLimits';

/**
 * The draft changes behind Settings › Markings (AC-198), as functions of the
 * dashboard: its markings and the chart tiles that mark with and are limited
 * by them — on every page and in every tab, since a marking is shared across
 * all of them (direction.md rule 44).
 */
export interface TileMarkings {
  readonly tileId: string;
  readonly chartId: string | undefined;
  /** What it marks with in effect: a marking's id, or `''` for none. */
  readonly marksWith: string;
  readonly limitedBy: readonly string[];
}

const markingsOf = (document: DashboardDocument): readonly Marking[] =>
  markingsFrom(document.markings);

/**
 * Every chart tile with its marking in effect — a tile that names none
 * follows the default (`TileMarking`'s three answers) — and its limits.
 */
export function chartTileMarkings(document: DashboardDocument): TileMarkings[] {
  const fallback = markingsOf(document).find((marking) => marking.isDefault)?.id ?? '';
  return chartTilesOf(document).map(({ tileId, chartId }) => {
    const element = elementAt(document, tileId);
    const tile = element !== null && isTile(element) ? element : undefined;
    return {
      tileId,
      chartId,
      marksWith: tile?.marksWith ?? fallback,
      limitedBy: tile?.limitedBy ?? [],
    };
  });
}

/** How many chart tiles mark with each marking, and how many it limits. */
export function usageOf(
  document: DashboardDocument,
): Map<string, { usedBy: number; limits: number }> {
  const tiles = chartTileMarkings(document);
  return new Map(
    markingsOf(document).map((marking) => [
      marking.id,
      {
        usedBy: tiles.filter((tile) => tile.marksWith === marking.id).length,
        limits: tiles.filter((tile) => tile.limitedBy.includes(marking.id)).length,
      },
    ]),
  );
}

/**
 * One marking fewer. Its tiles mark with nothing and no tile is limited by it
 * any more, as Spotfire does (the prototype's `mkdel`); the default moves if
 * it was the one deleted, and the tiles that followed it follow the new one.
 * The last marking is never deleted (AC-084).
 */
export function deleteMarking(document: DashboardDocument, id: string): DashboardDocument {
  const before = markingsOf(document);
  const after = removeMarking(before, id);
  if (after === before) return document;

  let next: DashboardDocument = { ...document, markings: after };
  for (const tile of chartTileMarkings(document)) {
    // (A tile that followed a deleted default follows the new one; its limits
    // are tidied below.)
    const element = elementAt(document, tile.tileId);
    const own = element !== null && isTile(element) ? element.marksWith : undefined;
    if (own !== id && !tile.limitedBy.includes(id)) continue;
    next = changeTile(next, tile.tileId, (current) => ({
      ...current,
      ...(current.marksWith === id ? { marksWith: '' } : {}),
      // Empty is no limit, as absent is.
      ...(current.limitedBy === undefined
        ? {}
        : { limitedBy: current.limitedBy.filter((each) => each !== id) }),
    }));
  }
  return withoutOwnLimits(next);
}

/**
 * Another marking as the default. The tiles that follow the default now mark
 * with it, so none of them is left limited by the marking it marks with — a
 * limit the page would show checked and disabled, beyond undoing (T218's
 * review).
 */
export function makeDefault(document: DashboardDocument, id: string): DashboardDocument {
  const before = markingsOf(document);
  const after = setDefaultMarking(before, id);
  if (after === before) return document;
  return withoutOwnLimits({ ...document, markings: after });
}

/** Every chart tile's limits, less the marking it marks with in effect. */
function withoutOwnLimits(document: DashboardDocument): DashboardDocument {
  let next = document;
  for (const tile of chartTileMarkings(document)) {
    if (tile.marksWith === '' || !tile.limitedBy.includes(tile.marksWith)) continue;
    next = changeTile(next, tile.tileId, (current) => ({
      ...current,
      limitedBy: tile.limitedBy.filter((each) => each !== tile.marksWith),
    }));
  }
  return next;
}

/**
 * What is wrong with the markings' names, or nothing: each needs one, and one
 * no other marking has — the prototype's rule on save. A marking is chosen by
 * its name everywhere else (a tile's Marks with, a chip), so two alike, or
 * none, cannot be told apart.
 */
export function markingNameProblem(document: DashboardDocument): string | undefined {
  const names = markingsOf(document).map((marking) => marking.name.trim().toLowerCase());
  const bad = names.some((name) => name === '') || new Set(names).size !== names.length;
  return bad ? 'Each marking needs a name of its own.' : undefined;
}

/** What one tile marks with; never also limited by it (`allowedLimits`). */
export function setTileMarking(
  document: DashboardDocument,
  tileId: string,
  marksWith: string,
): DashboardDocument {
  return changeTile(document, tileId, (tile) => ({
    ...tile,
    marksWith,
    ...(tile.limitedBy === undefined
      ? {}
      : { limitedBy: allowedLimits(tile.limitedBy, marksWith === '' ? undefined : marksWith) }),
  }));
}

/**
 * One tile limited by a marking, or no longer — in the markings' own order,
 * so the same limits read the same. Refused for the marking the tile marks
 * with: a tile cannot be limited by its own marking.
 */
export function setTileLimit(
  document: DashboardDocument,
  tileId: string,
  markingId: string,
  on: boolean,
): DashboardDocument {
  const tile = chartTileMarkings(document).find((each) => each.tileId === tileId);
  if (tile === undefined) return document;
  if (on && tile.marksWith === markingId) return document;
  const wanted = new Set(tile.limitedBy);
  if (on) wanted.add(markingId);
  else wanted.delete(markingId);
  const order = markingsOf(document).map((marking) => marking.id);
  const limitedBy = [...wanted].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return changeTile(document, tileId, (current) => ({ ...current, limitedBy }));
}
