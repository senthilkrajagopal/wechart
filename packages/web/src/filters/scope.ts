import {
  isSection,
  isTabGroup,
  type DashboardDocument,
  type Element_,
} from '../dashboard/model/document';
import type { DashboardFilter, FilterScope } from './model';

/**
 * A filter's scope (AC-077): the tiles it reaches — the whole dashboard, one
 * page tab, or tiles named one by one — and how its widget says so
 * (direction.md rule 14: "Each filter widget shows its scope (dashboard, tab,
 * or tile)").
 */

/** A chart tile, and the page tab it is on. */
export interface ChartTileRef {
  readonly tileId: string;
  readonly chartId: string | undefined;
  readonly pageId: string;
}

/** A filter reaches the whole dashboard until it is given another scope. */
export function scopeOf(filter: DashboardFilter): FilterScope {
  return filter.scope ?? { kind: 'dashboard' };
}

/**
 * Every chart tile on the dashboard, in document order: every page, and
 * inside sections every tab of every tab group — not only the open one, since
 * which inner tab is open is the reader's, and a filter on a page reaches all
 * of that page.
 */
export function chartTilesOf(document: DashboardDocument): ChartTileRef[] {
  const found: ChartTileRef[] = [];
  const walk = (items: readonly Element_[], pageId: string) => {
    for (const element of items) {
      if (isSection(element)) walk(element.items, pageId);
      else if (isTabGroup(element)) for (const tab of element.tabs) walk(tab.items, pageId);
      else if (element.kind === 'chart')
        found.push({ tileId: element.id, chartId: element.chartId, pageId });
    }
  };
  for (const page of document.pages) walk(page.items, page.id);
  return found;
}

export function inScope(filter: DashboardFilter, tile: ChartTileRef): boolean {
  const scope = scopeOf(filter);
  switch (scope.kind) {
    case 'dashboard':
      return true;
    case 'page':
      return tile.pageId === scope.pageId;
    case 'tiles':
      return scope.tileIds.includes(tile.tileId);
  }
}

/** A Text tile, and the page tab it is on: a cross-filter target, never a source (AC-523). */
export interface TextTileRef {
  readonly tileId: string;
  readonly pageId: string;
}

/** Every Text tile on the dashboard, in document order, as `chartTilesOf` walks it. */
export function textTilesOf(document: DashboardDocument): TextTileRef[] {
  const found: TextTileRef[] = [];
  const walk = (items: readonly Element_[], pageId: string) => {
    for (const element of items) {
      if (isSection(element)) walk(element.items, pageId);
      else if (isTabGroup(element)) for (const tab of element.tabs) walk(tab.items, pageId);
      else if (element.kind === 'text') found.push({ tileId: element.id, pageId });
    }
  };
  for (const page of document.pages) walk(page.items, page.id);
  return found;
}

/** A chart tile's name: its chart's title. */
export function tileName(
  tile: ChartTileRef,
  titleOf: (chartId: string) => string | undefined,
): string {
  const title = tile.chartId === undefined ? undefined : titleOf(tile.chartId);
  return title === undefined || title.trim() === '' ? 'Untitled chart' : title;
}

/**
 * The scope as the widget shows it. What it names that is gone — a deleted
 * tab, a deleted tile — is said or left out, never shown as if it were there.
 */
export function scopeLabel(
  filter: DashboardFilter,
  document: DashboardDocument,
  titleOf: (chartId: string) => string | undefined,
): string {
  const scope = scopeOf(filter);
  switch (scope.kind) {
    case 'dashboard':
      return 'Dashboard';
    case 'page': {
      const page = document.pages.find((each) => each.id === scope.pageId);
      return `Tab: ${page?.title ?? 'no longer on the dashboard'}`;
    }
    case 'tiles': {
      const names = chartTilesOf(document)
        .filter((tile) => scope.tileIds.includes(tile.tileId))
        .map((tile) => tileName(tile, titleOf));
      if (names.length === 0) return 'No tiles chosen';
      return `${names.length === 1 ? 'Tile' : 'Tiles'}: ${names.join(', ')}`;
    }
  }
}
