import {
  elementAt,
  isSection,
  isTabGroup,
  nameOfTile,
  removeElement,
  type DashboardDocument,
  type Element_,
} from '../model/document';

/**
 * Deleting something from a dashboard, and saying what went (AC-060,
 * direction.md rule 38).
 *
 * The criterion names four things, and two of them are not elements on the
 * grid at all: a **page tab** is a page, and a **tab** belongs to a tab group.
 * They need their own removal, which is why this exists beside
 * `removeElement`.
 *
 * "Restoring the element **and its contents**" shapes the whole design. Each
 * deletion takes the subtree out in one step, and the edit session keeps whole
 * states rather than inverse operations — so an undo puts the whole subtree
 * back. A deletion that emptied a container first and removed it second would
 * restore an empty one, which is the criterion's own failing state.
 */
export type Deletion =
  | { readonly kind: 'element'; readonly id: string }
  | { readonly kind: 'page'; readonly id: string }
  | { readonly kind: 'tab'; readonly groupId: string; readonly id: string };

export function deleteFromDashboard(
  document: DashboardDocument,
  deletion: Deletion,
): DashboardDocument {
  if (deletion.kind === 'element') return removeElement(document, deletion.id);

  if (deletion.kind === 'page') {
    // A dashboard with no pages is not a dashboard. direction.md gives no
    // empty state for one, and the user would have nothing left to undo from.
    if (document.pages.length <= 1) return document;
    const kept = document.pages.filter((page) => page.id !== deletion.id);
    return kept.length === document.pages.length ? document : { ...document, pages: kept };
  }

  let removed = false;
  const inItems = (items: readonly Element_[]): readonly Element_[] =>
    items.map((element) => {
      if (isSection(element)) return { ...element, items: inItems(element.items) };
      if (!isTabGroup(element)) return element;

      const mine = element.id === deletion.groupId;
      // The same reasoning as a page: a tab group with no tabs has nothing to
      // show and no way back.
      if (mine && element.tabs.length > 1) {
        const kept = element.tabs.filter((tab) => tab.id !== deletion.id);
        if (kept.length !== element.tabs.length) {
          removed = true;
          return { ...element, tabs: kept };
        }
      }

      return {
        ...element,
        tabs: element.tabs.map((tab) => ({ ...tab, items: inItems(tab.items) })),
      };
    });

  const pages = document.pages.map((page) => ({ ...page, items: inItems(page.items) }));
  return removed ? { ...document, pages } : document;
}

/**
 * Take a section away but keep what was in it (AC-061's "keep them").
 *
 * The items move up into whatever held the section, in its place, so nothing
 * is lost and nothing jumps to the end of the page — the prototype calls this
 * ungrouping, which is what it is. The criterion's failing state is that
 * "keep" loses a tile, so the contents go in at the section's own position
 * rather than being appended anywhere convenient.
 */
export function ungroupSection(document: DashboardDocument, sectionId: string): DashboardDocument {
  let found = false;

  const inItems = (items: readonly Element_[]): readonly Element_[] => {
    const next = items.flatMap((element) => {
      if (isSection(element) && element.id === sectionId) {
        found = true;
        return element.items;
      }
      if (isSection(element)) return [{ ...element, items: inItems(element.items) }];
      if (isTabGroup(element))
        return [
          {
            ...element,
            tabs: element.tabs.map((tab) => ({ ...tab, items: inItems(tab.items) })),
          },
        ];
      return [element];
    });

    return next;
  };

  const pages = document.pages.map((page) => ({ ...page, items: inItems(page.items) }));
  return found ? { ...document, pages } : document;
}

/** Whether a section holds anything, which is what decides if we ask at all. */
export function sectionHasContents(document: DashboardDocument, sectionId: string): boolean {
  const element = elementAt(document, sectionId);
  return element !== null && isSection(element) && element.items.length > 0;
}

/**
 * What the toast says. Naming what went, and how much went with it, is what
 * makes an undo a decision rather than a guess — the criterion is explicit
 * that contents come back, and a reader has to know there were contents.
 */
export function describeDeletion(
  document: DashboardDocument,
  deletion: Deletion,
  /** How the dashboard names a tile — by its title (AC-209) — where it knows. */
  nameOf: (id: string) => string = (id) => nameOfTile(document, id),
): string {
  if (deletion.kind === 'page') {
    const page = document.pages.find((candidate) => candidate.id === deletion.id);
    return `Deleted page “${page?.title ?? deletion.id}”${withContents(countIn(page?.items ?? []))}`;
  }

  if (deletion.kind === 'tab') {
    const tab = tabAt(document, deletion.groupId, deletion.id);
    return `Deleted tab “${tab?.title ?? deletion.id}”${withContents(countIn(tab?.items ?? []))}`;
  }

  const element = elementAt(document, deletion.id);
  if (element === null) return 'Deleted nothing.';

  const inside = isSection(element)
    ? countIn(element.items)
    : isTabGroup(element)
      ? element.tabs.reduce((total, tab) => total + countIn(tab.items), 0)
      : 0;

  return `Deleted ${nameOf(deletion.id)}${withContents(inside)}`;
}

const withContents = (count: number) =>
  count === 0 ? '.' : ` and the ${String(count)} items in it.`;

/** Everything beneath these items, however deep. */
function countIn(items: readonly Element_[]): number {
  return items.reduce((total, element) => {
    if (isSection(element)) return total + 1 + countIn(element.items);
    if (isTabGroup(element))
      return total + 1 + element.tabs.reduce((sum, tab) => sum + countIn(tab.items), 0);
    return total + 1;
  }, 0);
}

function tabAt(document: DashboardDocument, groupId: string, tabId: string) {
  let found: { title: string; items: readonly Element_[] } | undefined;

  const walk = (items: readonly Element_[]) => {
    for (const element of items) {
      if (isSection(element)) walk(element.items);
      else if (isTabGroup(element)) {
        if (element.id === groupId) {
          const tab = element.tabs.find((candidate) => candidate.id === tabId);
          if (tab !== undefined) found = tab;
        }
        for (const tab of element.tabs) walk(tab.items);
      }
    }
  };

  for (const page of document.pages) walk(page.items);
  return found;
}
