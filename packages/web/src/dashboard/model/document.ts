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
/**
 * From core, not from the recommender that re-exports it: the vocabulary is
 * the render spec's, and this is a persisted document model, so it should name
 * the same owner `chart-document.ts` does.
 */
import type {
  ChartDocument,
  ChartType,
  DashboardParameter,
  LimitCombination,
  Marking,
  RenderSpec,
  TextDocument,
} from '@wechart/core';

import type { DashboardFilter } from '../../filters/model';
import { firstReadingOfDocument } from '../../tiles/text/documents';
import type { GridTile } from '../grid/geometry';
import type { Interactions } from '../settings/interactionMode';
import type { NothingMarkedState } from '../tiles/NothingMarked';

export const DASHBOARD_DOCUMENT_VERSION = 1;

/**
 * The tile kinds a dashboard holds (AC-058). `text` is the Text tile (F45),
 * which replaces the markdown tile; a `markdown` tile is one saved before R80,
 * which Add never makes.
 */
export const TILE_KINDS = [
  'chart',
  'text',
  'markdown',
  'header',
  'divider',
  'image',
  'link',
  'filter',
] as const;

export type TileKind = (typeof TILE_KINDS)[number];

/**
 * The kinds that carry a size of their own and can be dragged or Shift-arrowed
 * to a new one. A header, a divider and a filter are as tall as their content,
 * exactly as a section is — taken from the prototype's `SIZED` list in
 * `docs/design/prototype/dashboard.js`, which is where this was decided.
 */
export const SIZED_KINDS: readonly TileKind[] = ['chart', 'text', 'markdown', 'image', 'link'];

export const isSized = (element: Element_): boolean =>
  isTile(element) && SIZED_KINDS.includes(element.kind);

export interface Tile extends GridTile {
  readonly kind: TileKind;
  /** For a chart tile: the chart document this tile shows. */
  readonly chartId?: string;
  /**
   * For a chart tile with no chartId: the type it is meant to become, so an
   * empty tile can name what it still needs rather than sit blank (AC-068).
   * A template may leave it out, which means the recommender chooses once the
   * tile has fields.
   */
  readonly chartType?: ChartType;
  /** For markdown, header and link tiles. */
  readonly text?: string;
  /**
   * For a Text tile (F45, AC-513): its document, in wechart's schema, checked
   * by the API on every save (T871).
   */
  readonly document?: TextDocument;
  /**
   * For an image tile (AC-063): the stored image (`/api/images/<id>`), its
   * alternative text — flagged on the tile in edit mode until set — and how
   * it fits the tile: inside it whole, or filling it and cropped
   * (direction.md §2, "Fit inside or Fill and crop"). Absent fit is inside.
   */
  readonly imageId?: string;
  readonly alt?: string;
  readonly fit?: 'contain' | 'cover';
  /** For a link tile (AC-064): where it goes and how it looks; its label is `text`. */
  readonly link?: LinkSettings;
  /**
   * Which marking a chart tile marks with, or absent for "(None)" — a tile
   * that cannot be marked at all (direction.md rule 44). The control that sets
   * it is AC-085's (T091); the field is here because AC-095 has to know which
   * tiles a marking change reaches.
   */
  readonly marksWith?: string;
  /**
   * Markings that limit what this tile shows — how a details tile follows its
   * master (direction.md: "Details tiles are limited by markings"). Several,
   * because AC-098 combines them with AND/OR.
   */
  readonly limitedBy?: readonly string[];
  /**
   * How several limiting markings combine (AC-107): All markings (AND) or Any
   * marking (OR). Absent is `'all'`, the narrower of the two — a tile that
   * shows too little is a question the user asks, and one that shows too much
   * is a wrong answer they may not notice.
   */
  readonly limitCombination?: LimitCombination;
  /**
   * What the tile shows when every marking limiting it is empty (AC-109), and
   * the message it shows in the `'message'` state.
   *
   * Absent is `'message'` for a limited tile — direction.md rule 58, the
   * user's decision of 2026-09-19 — but the field is written explicitly the
   * moment a tile is first limited (AC-110), together with a message naming
   * the master tiles, so that what the user then edits is a stored value and
   * not a default that would overwrite them.
   */
  readonly nothingMarked?: NothingMarkedState;
  readonly nothingMarkedMessage?: string;
  /**
   * Dashboard parameters this tile followed that have since been deleted
   * (T897, AC-532): each use now holds the choice it stood for then as a
   * fixed field, and the tile says so in edit mode until dismissed.
   */
  readonly parameterFixed?: readonly ParameterFixed[];
}

/** A deleted parameter, by its name, and the label of the choice a tile kept. */
export interface ParameterFixed {
  readonly parameter: string;
  readonly label: string;
}

/**
 * A link tile's settings (direction.md §2: "a label; a style of Button,
 * Primary or Text link; and a target that is either another dashboard
 * (optionally passing the current filters) or an http(s) URL opened in a new
 * tab"). No target yet goes nowhere.
 */
export interface LinkSettings {
  readonly style?: 'button' | 'primary' | 'text';
  readonly target?:
    | {
        readonly kind: 'dashboard';
        readonly dashboardId: string;
        /** Its title when chosen, to name it in Properties without a lookup. */
        readonly title?: string;
        readonly passFilters?: boolean;
      }
    | { readonly kind: 'url'; readonly url: string };
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
  /**
   * Which interaction mode is in effect and the configuration of *both*
   * (AC-070). Optional because every dashboard stored so far predates it;
   * `interactionsOf` supplies the default rather than a migration.
   */
  readonly interactions?: Interactions;
}

export interface DashboardDocument {
  readonly schemaVersion: number;
  readonly title: string;
  readonly folderId?: string;
  /** What the dashboard is for, shown beneath its name in Explore (AC-197). */
  readonly description?: string;
  readonly owner?: string;
  readonly pages: readonly Page[];
  readonly settings: DashboardSettings;
  /**
   * Marking definitions, beside the settings rather than inside them: AC-065
   * names "dashboard settings **and** marking definitions" as peers, and
   * direction.md rule 54 says a saved dashboard stores the definitions (never
   * the current marks, which a link or a bookmark carries).
   *
   * Optional because every dashboard stored so far predates them;
   * `markingsFrom` in @wechart/core supplies and repairs, so a dashboard is
   * never read without a default marking (AC-084).
   */
  readonly markings?: readonly Marking[];
  /**
   * The filter bar's filters, in order (F9, AC-076): each a widget on a
   * field. Saved with the dashboard; the values they hold are the reader's,
   * not the dashboard's.
   */
  readonly filters?: readonly DashboardFilter[];
  /**
   * The dashboard's parameters (F46, AC-531), in order: each a field switch
   * a Text tile's control sets and a local chart's well or a Value follows.
   * Saved with the dashboard; the value each holds is the reader's, starting
   * at its default (AC-534), as a filter's is.
   */
  readonly parameters?: readonly DashboardParameter[];
  /**
   * Charts edited from a tile during this edit session, by chart id, not yet
   * written (T032). **Never saved as part of the dashboard.** `withoutDrafts`
   * strips them before any save, and a stored dashboard never carries them;
   * a save writes each as the chart document it is, beside the dashboard, in
   * the same transaction (T192, AC-183).
   *
   * On the document rather than beside it because the session's history
   * stores whole documents, so a draft is undone, redone and discarded with
   * everything else — which AC-066 needs.
   */
  readonly chartDrafts?: Readonly<Record<string, ChartDraft>>;
}

/**
 * A chart edited from a tile and not yet written (T032): the chart document
 * as edited, which saving the dashboard will write (AC-183, T192), and what
 * the tile draws for it.
 *
 * `drawn` is exactly what `tileChartOf` gives any tile — a spec, or the reason
 * there is none — because a draft is drawn by the same function as every
 * saved chart. So an emptied chart reads "no fields yet" and one that cannot
 * be placed "no chart type yet", rather than the tile keeping its old chart.
 */
export interface ChartDraft {
  readonly document: ChartDocument;
  readonly drawn: { readonly spec: RenderSpec } | { readonly error: unknown };
  /**
   * Its rows in all, where its query asked Cube for them — a box plot's does
   * — so its tile can say its boxes were drawn from fewer (T401's review).
   */
  readonly total?: number;
  /**
   * The version the chart was read at from the server — kept through every
   * reopening of the draft, because it is what the write is checked against
   * (T192): a chart changed by someone else meanwhile is refused, not
   * overwritten. Undefined when the server sent none; such a draft cannot be
   * written safely. 0 for a chart made in this session and not yet stored —
   * a new tile's local chart (T132) — which the save creates.
   */
  readonly version: number | undefined;
  /**
   * The dashboard this chart was local to when it was saved to a folder in
   * this session (T133, AC-127): its document is a library chart's now, and
   * this dashboard's save writes it so. Said so on its Ownership panel and
   * after the save, and no shared-chart notice is shown for it until then.
   */
  readonly wasLocalTo?: string;
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
 * A dashboard with one tile changed — its settings, say (AC-063's image and
 * alternative text). Like `resizeTile`, only the branch down to the tile is
 * rebuilt, and the document comes back by identity when no tile matched.
 */
export function changeTile(
  document: DashboardDocument,
  tileId: string,
  change: (tile: Tile) => Tile,
): DashboardDocument {
  const inItems = (items: readonly Element_[]): readonly Element_[] => {
    let touched = false;
    const next = items.map((element): Element_ => {
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
      return change(element);
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

  // A Text tile by its first line (T875's review), as a markdown tile was.
  const text = found.kind === 'text' ? firstReadingOfDocument(found.document) : found.text?.trim();
  return text === undefined || text === ''
    ? `${found.kind} tile`
    : `${found.kind}: ${text.slice(0, 40)}`;
}

/** Where an element sits: its container and its position among that container's items. */
export function placeOf(
  document: DashboardDocument,
  id: string,
): { key: ContainerKey; index: number; of: number } | null {
  let found: { key: ContainerKey; index: number; of: number } | null = null;

  const look = (key: ContainerKey, items: readonly Element_[]) => {
    const index = items.findIndex((element) => element.id === id);
    if (index !== -1) found = { key, index, of: items.length };

    for (const element of items) {
      if (isSection(element)) look(sectionKey(element.id), element.items);
      else if (isTabGroup(element))
        for (const tab of element.tabs) look(tabKey(element.id, tab.id), tab.items);
    }
  };

  for (const page of document.pages) look(pageKey(page.id), page.items);
  return found;
}

/**
 * Move an element one place earlier or later within its own container
 * (AC-057's arrow keys).
 *
 * The index `moveTile` takes counts positions *without* the element, so a step
 * of +1 from position i is an insertion at i + 1 and a step of −1 is an
 * insertion at i − 1 — which happens to read the same either way, but only
 * because the element is removed first. At either end nothing happens, rather
 * than wrapping round: a tile that jumped from the end of a page to its start
 * because someone pressed Right once too often would be a surprise.
 */
export function moveBy(document: DashboardDocument, id: string, by: -1 | 1): DashboardDocument {
  const place = placeOf(document, id);
  if (place === null) return document;

  const next = place.index + by;
  if (next < 0 || next >= place.of) return document;

  return moveTile(document, id, { key: place.key, index: next });
}

/**
 * A dashboard without one element (AC-057's Delete).
 *
 * The toast that offers the undo is AC-060's, at T066. What makes the delete
 * recoverable today is that it goes through the edit session like every other
 * change, so Undo already restores it — and because the element is removed
 * whole, it comes back with everything inside it.
 */
export function removeElement(document: DashboardDocument, id: string): DashboardDocument {
  if (placeOf(document, id) === null) return document;

  const without = (items: readonly Element_[]): readonly Element_[] => {
    const kept = items.filter((element) => element.id !== id);
    if (kept.length !== items.length) return kept;

    // The same array back when nothing beneath it changed, so an untouched
    // page or section keeps its identity and the edit history can tell what
    // this edit actually touched.
    let touched = false;
    const next = items.map((element) => {
      if (isSection(element)) {
        const inside = without(element.items);
        if (inside === element.items) return element;
        touched = true;
        return { ...element, items: inside };
      }
      if (isTabGroup(element)) {
        let changed = false;
        const tabs = element.tabs.map((tab) => {
          const inside = without(tab.items);
          if (inside === tab.items) return tab;
          changed = true;
          return { ...tab, items: inside };
        });
        if (!changed) return element;
        touched = true;
        return { ...element, tabs };
      }
      return element;
    });

    return touched ? next : items;
  };

  return {
    ...document,
    pages: document.pages.map((page) => {
      const items = without(page.items);
      return items === page.items ? page : { ...page, items };
    }),
  };
}

/** The chart a tile shows, if it is a chart tile that has one. */
export function chartIdOf(document: DashboardDocument, tileId: string): string | undefined {
  const found = tileAt(document, tileId);
  return found !== null && isTile(found) ? found.chartId : undefined;
}

/**
 * The first tile, in document order, that shows this chart (T463): where a
 * local chart's page sends "Edit on ‹dashboard›", on any page, section or tab.
 */
export function tileShowing(document: DashboardDocument, chartId: string): string | undefined {
  const walk = (items: readonly Element_[]): string | undefined => {
    for (const element of items) {
      const found = isSection(element)
        ? walk(element.items)
        : isTabGroup(element)
          ? element.tabs.map((tab) => walk(tab.items)).find((id) => id !== undefined)
          : isTile(element) && element.chartId === chartId
            ? element.id
            : undefined;
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return document.pages.map((page) => walk(page.items)).find((id) => id !== undefined);
}

/** Whether this id belongs to a tile rather than to a section or tab group. */
export function isTileId(document: DashboardDocument, id: string): boolean {
  const found = tileAt(document, id);
  return found !== null && isTile(found);
}

/** The element with this id, wherever it is. */
export function elementAt(document: DashboardDocument, id: string): Element_ | null {
  return tileAt(document, id);
}

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

/**
 * The charts the dashboard's tiles show, on every page and inside every
 * section and tab: the charts the page loads, and the only charts a save may
 * write (T192) — a chart no tile shows any more is not the dashboard's to
 * write.
 */
export function chartIdsOf(document: DashboardDocument): string[] {
  const ids: string[] = [];
  const walk = (items: readonly Element_[]) => {
    for (const element of items) {
      if (isSection(element)) walk(element.items);
      else if (isTabGroup(element)) for (const tab of element.tabs) walk(tab.items);
      else if (element.kind === 'chart' && element.chartId !== undefined) ids.push(element.chartId);
    }
  };
  for (const page of document.pages) walk(page.items);
  return ids;
}
