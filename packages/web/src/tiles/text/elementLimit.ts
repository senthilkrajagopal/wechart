import { elementsOf, TEXT_ELEMENT_LIMIT, type TextDocument } from '@wechart/core';

import {
  isSection,
  isTabGroup,
  type DashboardDocument,
  type Element_,
} from '../../dashboard/model/document';

/** Why no element can be added to a tile at its limit (AC-518; design 21 state E). */
export const ELEMENT_LIMIT_REASON = `This tile holds ${String(TEXT_ELEMENT_LIMIT)} elements, the most a Text tile can. Remove one, or add another Text tile.`;

/** Why Insert is disabled for a text holding this many elements, or undefined (AC-518). */
export function insertRefusal(count: number): string | undefined {
  return count >= TEXT_ELEMENT_LIMIT ? ELEMENT_LIMIT_REASON : undefined;
}

/**
 * The insert menu's groups for a text holding this many elements: at the
 * limit, every row disabled with the reason (AC-518); otherwise the same.
 */
export function limitedGroups<Group extends { readonly rows: readonly object[] }>(
  groups: readonly Group[],
  count: number,
): readonly Group[] {
  const why = insertRefusal(count);
  if (why === undefined) return groups;
  return groups.map((group) => ({
    ...group,
    rows: group.rows.map((row) => ({ ...row, disabled: why })),
  }));
}

/**
 * Why a paste is refused, or undefined (AC-518): the text holds `count`
 * elements, the paste replaces a selection holding `removed` and brings
 * `added`. Refused when it would pass 10 and add to the count; a converted
 * tile already past 10 (decision T875-1) may still take a paste that adds
 * none.
 */
export function pasteRefusal(count: number, removed: number, added: number): string | undefined {
  const after = count - removed + added;
  return after > TEXT_ELEMENT_LIMIT && added > removed ? ELEMENT_LIMIT_REASON : undefined;
}

/** How many elements a Text tile holds: what counts toward its 10 (AC-518). */
export function elementCountOf(document: TextDocument | undefined): number {
  return document === undefined ? 0 : elementsOf(document).length;
}

/** Every tile of a dashboard, every tab of every tab group included. */
function everyTile(items: readonly Element_[]): Element_[] {
  return items.flatMap((element) =>
    isSection(element)
      ? everyTile(element.items)
      : isTabGroup(element)
        ? element.tabs.flatMap((tab) => everyTile(tab.items))
        : [element],
  );
}

/**
 * Why Save is held for a Text tile holding more than 10 elements, or
 * undefined (decision T875-1, AC-518): a markdown tile of more tokens
 * converts in full, so nothing is lost, but the API would refuse it (T871),
 * so Save says what to do instead. The first such tile is named by its count.
 */
export function whyTextUnsaveable(dashboard: DashboardDocument): string | undefined {
  for (const page of dashboard.pages)
    for (const tile of everyTile(page.items)) {
      if (tile.kind !== 'text') continue;
      const count = elementCountOf(tile.document);
      if (count <= TEXT_ELEMENT_LIMIT) continue;
      const over = count - TEXT_ELEMENT_LIMIT;
      return `A Text tile holds ${String(count)} elements, and holds at most ${String(TEXT_ELEMENT_LIMIT)}. Remove ${String(over)} live ${over === 1 ? 'value' : 'values'} to save.`;
    }
  return undefined;
}
