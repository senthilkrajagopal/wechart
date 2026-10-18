import { emptyTextDocument } from '../../tiles/text/documents';
import {
  isSection,
  isTabGroup,
  pageKey,
  placeOf,
  sectionKey,
  tabKey,
  type ContainerKey,
  type DashboardDocument,
  type Element_,
} from './document';

/**
 * The Add palette, and where what it makes ends up (AC-058).
 *
 * The list and its order come from the dashboard prototype in
 * `docs/design/prototype/dashboard.js` — the same ten entries the criterion
 * names, which is not a coincidence: the criterion was written from it.
 *
 * Most defaults come from the prototype's `newItem` too, but **two do not**,
 * and saying which is the point of this note:
 *
 * - `filter` has no entry there at all. The prototype's palette offers it and
 *   then shows a toast instead of inserting anything, so the tile below is
 *   ours. AC-058 requires the type be offered and inserted somewhere, and
 *   what a filter tile *does* is F8's.
 * - the widths on `tabs`, `header` and `divider` are ours. The prototype
 *   gives those no width and renders them full width through a separate
 *   list; twelve columns is that rendering written down.
 */
export type PaletteId =
  | 'chart'
  | 'library'
  | 'section'
  | 'tabs'
  | 'text'
  | 'header'
  | 'divider'
  | 'image'
  | 'link'
  | 'filter';

export interface PaletteEntry {
  readonly id: PaletteId;
  readonly label: string;
  readonly hint: string;
}

export const PALETTE: readonly PaletteEntry[] = [
  { id: 'chart', label: 'Chart', hint: 'New chart, only on this dashboard' },
  { id: 'library', label: 'Chart from folders', hint: 'Reuse a shared chart' },
  { id: 'section', label: 'Section', hint: 'A titled, collapsible group' },
  { id: 'tabs', label: 'Tabs', hint: 'A tab group inside a section' },
  // The Text element, in Markdown's place (R80, design 21, rule 127).
  { id: 'text', label: 'Text', hint: 'Text with live values' },
  { id: 'header', label: 'Header', hint: 'A heading' },
  { id: 'divider', label: 'Divider', hint: 'A horizontal rule' },
  { id: 'image', label: 'Image', hint: 'A logo or picture' },
  { id: 'link', label: 'Link / button', hint: 'Go to a dashboard or URL' },
  { id: 'filter', label: 'Filter', hint: 'Adds to the filter bar' },
];

/**
 * A new element of the chosen kind.
 *
 * Sizes are the prototype's. Only chart, text, image and link carry one;
 * a header, a divider and a filter are as tall as their content, exactly as a
 * section is.
 *
 * Everything starts empty. A section and a tab group hold nothing, and a
 * chart is bound to no fields — AC-068 makes that explicit for templates
 * ("empty charts that state what they need, rather than charts bound to
 * sample data"), and the same reasoning holds for a single insert.
 */
export function newElement(id: PaletteId, mintId: () => string): Element_ {
  const key = mintId();

  switch (id) {
    case 'section':
      return { id: key, kind: 'section', title: 'New section', collapsed: false, items: [] };
    case 'tabs':
      // Two tabs, because a tab group with one tab is not a tab group.
      return {
        id: key,
        kind: 'tabs',
        w: 12,
        tabs: [
          { id: `${key}-a`, title: 'Tab 1', items: [] },
          { id: `${key}-b`, title: 'Tab 2', items: [] },
        ],
      };
    case 'text':
      // Empty, at the markdown tile's size: an empty Text tile shows its
      // placeholder in edit mode and nothing in view mode (design 21 G6).
      return { id: key, kind: 'text', w: 6, h: 18, document: emptyTextDocument() };
    case 'header':
      return { id: key, kind: 'header', w: 12, text: 'New heading' };
    case 'divider':
      return { id: key, kind: 'divider', w: 12 };
    case 'image':
      return { id: key, kind: 'image', w: 3, h: 12 };
    case 'link':
      return { id: key, kind: 'link', w: 3, h: 7, text: 'Open dashboard' };
    case 'filter':
      return { id: key, kind: 'filter', w: 3 };
    // A chart either way: "Chart from folders" is the same tile, bound to a
    // shared chart once one is chosen rather than to a new local one.
    default:
      return { id: key, kind: 'chart', w: 4, h: 40 };
  }
}

export interface InsertionContext {
  /** The element the user last selected, if it is still there. */
  readonly selected?: string | undefined;
  /** A "+ Add" slot the user aimed at, which wins over the selection. */
  readonly addTarget?: ContainerKey | undefined;
  /** The page currently open, where anything else goes. */
  readonly pageId: string;
}

export interface InsertionPoint {
  readonly key: ContainerKey;
  /** Where among that container's items, or null for the end. */
  readonly index: number | null;
}

/**
 * Where the next element goes: "after the selection or into the chosen
 * '+ Add' slot".
 *
 * The slot wins over the selection. A slot is a deliberate aim at one
 * container; a selection is only where the user last happened to be, and it
 * may be somewhere they are no longer looking.
 */
export function insertionPoint(
  document: DashboardDocument,
  context: InsertionContext,
): InsertionPoint {
  // A slot aimed at a container that has since been deleted is no position at
  // all, exactly as a deleted selection is not. Passing it through produced an
  // insert that landed nowhere, said nothing, and still counted as a change.
  if (context.addTarget !== undefined && hasContainer(document, context.addTarget)) {
    return { key: context.addTarget, index: null };
  }

  const place = context.selected === undefined ? null : placeOf(document, context.selected);
  // A selection that has since been deleted is no position at all.
  if (place !== null) return { key: place.key, index: place.index + 1 };

  return { key: pageKey(context.pageId), index: null };
}

/** Whether that container is still on the dashboard. */
function hasContainer(document: DashboardDocument, key: ContainerKey): boolean {
  if (document.pages.some((page) => pageKey(page.id) === key)) return true;

  const look = (items: readonly Element_[]): boolean =>
    items.some((element) => {
      if (isSection(element)) return sectionKey(element.id) === key || look(element.items);
      if (isTabGroup(element))
        return element.tabs.some((tab) => tabKey(element.id, tab.id) === key || look(tab.items));
      return false;
    });

  return document.pages.some((page) => look(page.items));
}

/** The document with one more element in it, at that point. */
export function insertElement(
  document: DashboardDocument,
  element: Element_,
  at: InsertionPoint,
): DashboardDocument {
  const put = (items: readonly Element_[]): readonly Element_[] => {
    const index = at.index === null ? items.length : Math.min(at.index, items.length);
    return [...items.slice(0, index), element, ...items.slice(index)];
  };

  const inItems = (key: ContainerKey, items: readonly Element_[]): readonly Element_[] => {
    const next = items.map((existing) => {
      if (isSection(existing))
        return { ...existing, items: inItems(sectionKey(existing.id), existing.items) };
      if (isTabGroup(existing))
        return {
          ...existing,
          tabs: existing.tabs.map((tab) => ({
            ...tab,
            items: inItems(tabKey(existing.id, tab.id), tab.items),
          })),
        };
      return existing;
    });

    return key === at.key ? put(next) : next;
  };

  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      items: inItems(pageKey(page.id), page.items),
    })),
  };
}
