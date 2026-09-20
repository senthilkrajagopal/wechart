/**
 * What a dashboard *is* (AC-018, direction.md section 2 "Dashboard").
 *
 * The grammar is Grafana 13's, recorded in
 * `docs/research/references-dashboard-authoring.md` and settled in
 * direction.md: page tabs at the top, sections inside page tabs, tab groups
 * only inside a section, and tiles inside any of them. There are deliberately
 * no row or column containers — the 12-column grid does that job.
 *
 * Every element carries `w` (whole columns) and `h` (whole 8-pixel row units)
 * rather than pixels, because that is what survives a different canvas width;
 * `grid/geometry.ts` owns the conversion.
 */
import type { GridTile } from '../grid/geometry';

export const DASHBOARD_DOCUMENT_VERSION = 1;

/** The element kinds the Add palette offers (AC-058). */
export const TILE_KINDS = [
  'chart',
  'markdown',
  'header',
  'divider',
  'image',
  'link',
  'filter',
] as const;

export type TileKind = (typeof TILE_KINDS)[number];

export interface Tile extends GridTile {
  readonly kind: TileKind;
  /** For a chart tile: the chart document this tile shows. */
  readonly chartId?: string;
  /** For markdown, header and link tiles. */
  readonly text?: string;
}

export interface Section {
  readonly id: string;
  readonly kind: 'section';
  readonly title: string;
  readonly collapsed?: boolean;
  readonly items: readonly Element_[];
}

/** A tab group. Legal only inside a section (AC-059, direction.md rule 37). */
export interface TabGroup {
  readonly id: string;
  readonly kind: 'tabs';
  readonly w: number;
  readonly tabs: readonly Tab[];
}

export interface Tab {
  readonly id: string;
  readonly title: string;
  readonly items: readonly Element_[];
}

/**
 * Named with a trailing underscore because `Element` is a DOM global, and a
 * type that shadows it in a file that also touches the DOM is a trap.
 */
export type Element_ = Tile | Section | TabGroup;

/** A page tab: the top level of the dashboard. */
export interface Page {
  readonly id: string;
  readonly title: string;
  readonly items: readonly Element_[];
}

export interface DashboardSettings {
  /** direction.md: fixed 1,440 px and centred, or full width. */
  readonly width: 'fixed' | 'full';
}

export interface DashboardDocument {
  readonly schemaVersion: number;
  readonly title: string;
  readonly folderId?: string;
  readonly owner?: string;
  readonly pages: readonly Page[];
  readonly settings: DashboardSettings;
}

export const DEFAULT_SETTINGS: DashboardSettings = { width: 'fixed' };

export function isSection(element: Element_): element is Section {
  return element.kind === 'section';
}

export function isTabGroup(element: Element_): element is TabGroup {
  return element.kind === 'tabs';
}

export function isTile(element: Element_): element is Tile {
  return !isSection(element) && !isTabGroup(element);
}

/**
 * Every tile on a page, in document order, descending through sections and
 * through each tab group's *selected* tab.
 *
 * The selected tab is a parameter rather than state on the document: which tab
 * is open is a view concern, and direction.md has tab groups load lazily, so
 * "the tiles on this page" is always a question about a particular tab
 * selection, never about the document alone.
 */
export function tilesOf(
  items: readonly Element_[],
  openTab: (group: TabGroup) => Tab | undefined,
): Tile[] {
  return items.flatMap((element) => {
    if (isSection(element)) return tilesOf(element.items, openTab);
    if (isTabGroup(element)) {
      const tab = openTab(element);
      return tab ? tilesOf(tab.items, openTab) : [];
    }
    return [element];
  });
}

/**
 * A dashboard with one element a different size (AC-055).
 *
 * Rebuilds only the branch down to that element, and hands every other branch
 * back by identity — including the document itself when nothing matched.
 *
 * The edit session keeps past states and tells them apart with `Object.is`, so
 * a version that rebuilt every page and every section on the way past would
 * make all of them look changed, and "what did this edit touch?" could only be
 * answered by walking the whole tree to discover it was one tile.
 */
export function resizeTile(
  document: DashboardDocument,
  tileId: string,
  size: { readonly w: number; readonly h: number },
): DashboardDocument {
  /** The same array back when nothing beneath it changed. */
  const inItems = (items: readonly Element_[]): readonly Element_[] => {
    let touched = false;

    const next = items.map((element) => {
      // A tab group carries a width of its own, so it can be the target. A
      // section cannot: it is a container, sized by what it holds.
      if (isTabGroup(element) && element.id === tileId) {
        touched = true;
        return { ...element, w: size.w };
      }
      if (isSection(element)) {
        const inside = inItems(element.items);
        if (inside === element.items) return element;
        touched = true;
        return { ...element, items: inside };
      }
      if (isTabGroup(element)) {
        let inAnyTab = false;
        const tabs = element.tabs.map((tab) => {
          const inside = inItems(tab.items);
          if (inside === tab.items) return tab;
          inAnyTab = true;
          return { ...tab, items: inside };
        });
        if (!inAnyTab) return element;
        touched = true;
        return { ...element, tabs };
      }
      if (element.id !== tileId) return element;
      touched = true;
      return { ...element, w: size.w, h: size.h };
    });

    return touched ? next : items;
  };

  let touched = false;
  const pages = document.pages.map((page) => {
    const items = inItems(page.items);
    if (items === page.items) return page;
    touched = true;
    return { ...page, items };
  });

  return touched ? { ...document, pages } : document;
}

/** The first tab of a group: what a dashboard shows before anyone clicks. */
export const firstTab = (group: TabGroup): Tab | undefined => group.tabs[0];
