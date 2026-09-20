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
  /**
   * Required here though optional on the grid: a tile is dragged to a height
   * of its own, where a section or a tab group is as tall as what it holds.
   */
  readonly h: number;
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

/**
 * Where a container lives, as a key a drop target can name: `page:<id>` for a
 * page tab, `sec:<id>` for a section, `tabs:<group>:<tab>` for one tab of a
 * tab group. The same vocabulary the prototype uses.
 */
export type ContainerKey = string;

export const pageKey = (pageId: string): ContainerKey => `page:${pageId}`;
export const sectionKey = (sectionId: string): ContainerKey => `sec:${sectionId}`;
export const tabKey = (groupId: string, tabId: string): ContainerKey => `tabs:${groupId}:${tabId}`;

/** Every container a tile could be moved into, with a name to show for it. */
export function containersOf(document: DashboardDocument): { key: ContainerKey; title: string }[] {
  const found: { key: ContainerKey; title: string }[] = [];

  const walk = (items: readonly Element_[], within: string) => {
    for (const element of items) {
      if (isSection(element)) {
        found.push({ key: sectionKey(element.id), title: `${within} › ${element.title}` });
        walk(element.items, `${within} › ${element.title}`);
      } else if (isTabGroup(element)) {
        for (const tab of element.tabs) {
          found.push({ key: tabKey(element.id, tab.id), title: `${within} › ${tab.title}` });
          walk(tab.items, `${within} › ${tab.title}`);
        }
      }
    }
  };

  for (const page of document.pages) {
    found.push({ key: pageKey(page.id), title: page.title });
    walk(page.items, page.title);
  }
  return found;
}

/**
 * Move a tile into a container, at a position or at the end (AC-056).
 *
 * The index counts positions in the target container **without** this tile,
 * which is exactly what `dropTargetAt` produces: it skips the tile in hand
 * when working out what the pointer is between. Both ends have to agree on
 * that convention or every same-container reorder is out by one — the classic
 * off-by-one of every drag reorder — so the tile is taken out and put back in
 * one pass rather than removed by one step and inserted by another.
 */
export function moveTile(
  document: DashboardDocument,
  tileId: string,
  to: { readonly key: ContainerKey; readonly index: number | null },
): DashboardDocument {
  const moving = tileAt(document, tileId);
  if (moving === null) return document;

  /**
   * Nothing may be moved inside itself.
   *
   * A section is a grid item, so it can be picked up, and its own body is a
   * drop container — and the move is one pass that inserts where the key
   * matches and removes where it does not. Dropping a section into itself
   * therefore rebuilds the subtree and then discards the very branch that was
   * rebuilt: the section and everything in it vanish from the document. Silent
   * loss from a plausible gesture, with Undo the only way back.
   */
  if (containersWithin(moving).includes(to.key)) return document;

  const withoutIt = (items: readonly Element_[]): readonly Element_[] => {
    const kept = items.filter((element) => element.id !== tileId);
    return kept.length === items.length ? items : kept;
  };

  const place = (items: readonly Element_[]): readonly Element_[] => {
    const without = withoutIt(items);
    // A drop on a tab label has no position to aim at, so the tile goes to the
    // end — which is what direction.md says a label drop does.
    const at = to.index === null ? without.length : Math.min(to.index, without.length);
    return [...without.slice(0, at), moving, ...without.slice(at)];
  };

  return mapContainers(document, (key, items) =>
    key === to.key ? place(items) : withoutIt(items),
  );
}

/**
 * Every container key at or inside this element — the places it must not be
 * moved into, itself included.
 */
function containersWithin(element: Element_): ContainerKey[] {
  if (isSection(element))
    return [sectionKey(element.id), ...element.items.flatMap(containersWithin)];

  if (isTabGroup(element))
    return element.tabs.flatMap((tab) => [
      tabKey(element.id, tab.id),
      ...tab.items.flatMap(containersWithin),
    ]);

  return [];
}

/**
 * A readable name for an element, for an accessible name or an announcement.
 *
 * A tile has no title of its own yet — direction.md gives one to a header and
 * a markdown tile through their text, and a chart tile through the chart it
 * shows. Until the Properties inspector can set one (AC-058 onwards), the
 * kind plus a short piece of the text is the most honest thing to say, and it
 * is still better to hear "markdown tile" than "t2".
 */
export function nameOfTile(document: DashboardDocument, id: string): string {
  const found = tileAt(document, id);
  if (found === null) return id;
  if (isSection(found)) return found.title;
  if (isTabGroup(found)) return 'tab group';

  const text = found.text?.trim();
  return text === undefined || text === ''
    ? `${found.kind} tile`
    : `${found.kind}: ${text.slice(0, 40)}`;
}

/** Whether this id belongs to a tile rather than to a section or tab group. */
export function isTileId(document: DashboardDocument, id: string): boolean {
  const found = tileAt(document, id);
  return found !== null && isTile(found);
}

/** The element with this id, wherever it is. */
function tileAt(document: DashboardDocument, tileId: string): Element_ | null {
  let found: Element_ | null = null;
  const walk = (items: readonly Element_[]) => {
    for (const element of items) {
      if (element.id === tileId) found = element;
      else if (isSection(element)) walk(element.items);
      else if (isTabGroup(element)) for (const tab of element.tabs) walk(tab.items);
    }
  };
  for (const page of document.pages) walk(page.items);
  return found;
}

/**
 * Rebuild the document, giving each container's items to `change`.
 *
 * Every container is visited exactly once and named by the same key the drop
 * target uses, so "move out of here" and "move into there" are the same walk
 * rather than two that could disagree about what a container is.
 */
function mapContainers(
  document: DashboardDocument,
  change: (key: ContainerKey, items: readonly Element_[]) => readonly Element_[],
): DashboardDocument {
  const inItems = (items: readonly Element_[]): readonly Element_[] =>
    items.map((element) => {
      if (isSection(element))
        return { ...element, items: change(sectionKey(element.id), inItems(element.items)) };
      if (isTabGroup(element))
        return {
          ...element,
          tabs: element.tabs.map((tab) => ({
            ...tab,
            items: change(tabKey(element.id, tab.id), inItems(tab.items)),
          })),
        };
      return element;
    });

  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      items: change(pageKey(page.id), inItems(page.items)),
    })),
  };
}

/** The first tab of a group: what a dashboard shows before anyone clicks. */
export const firstTab = (group: TabGroup): Tab | undefined => group.tabs[0];
