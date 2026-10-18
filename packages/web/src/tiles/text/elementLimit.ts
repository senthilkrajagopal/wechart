import { elementsOf, TEXT_ELEMENT_LIMIT, type TextDocument } from '@wechart/core';

import {
  isSection,
  isTabGroup,
  type DashboardDocument,
  type Element_,
} from '../../dashboard/model/document';

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
