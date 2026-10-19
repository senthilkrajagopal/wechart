import { useRef } from 'react';

import {
  csvOf,
  textDocumentProblems,
  type ButtonAction,
  type RenderSpec,
  type TextNode,
} from '@wechart/core';

import { BYTE_ORDER_MARK, csvFileName, saveFile } from '../../../dashboard/TileViewMenu';

/**
 * What a reader's press can do (AC-530; rule 136): the four declared kinds,
 * each done by the dashboard as its own control does it — a page tab opened,
 * a bookmark applied, the filters reset, tiles exported. Nothing else is
 * reachable from a button.
 */
export interface ActionRunner {
  readonly goToPage: (page: string) => void;
  /** Done before the next action runs: a bookmark is read first. */
  readonly applyBookmark: (bookmark: string) => void | Promise<void>;
  readonly resetFilters: () => void;
  readonly exportTiles: (tiles: readonly string[]) => void;
}

/**
 * A button's actions, in order, while the button is one the Text tile's
 * schema accepts (`textDocumentProblems`); none otherwise. A stored action of
 * any other kind — `{"kind":"script"}` — is refused by the schema, and a
 * button holding one runs nothing at all, not the rest of its list.
 */
export function actionsOf(element: TextNode): readonly ButtonAction[] {
  if (element.type !== 'actionButton') return [];
  const problems = textDocumentProblems({
    version: 1,
    doc: { type: 'doc', content: [{ type: 'paragraph', content: [element] }] },
  });
  if (problems.length > 0) return [];
  const actions = element.attrs?.['actions'];
  return Array.isArray(actions) ? (actions as ButtonAction[]) : [];
}

/** Runs the actions in their order, each finished before the next. */
export async function runActions(
  actions: readonly ButtonAction[],
  run: ActionRunner,
): Promise<void> {
  for (const action of actions) {
    switch (action.kind) {
      case 'page':
        run.goToPage(action.page);
        break;
      case 'bookmark':
        await run.applyBookmark(action.bookmark);
        break;
      case 'resetFilters':
        run.resetFilters();
        break;
      case 'export':
        run.exportTiles(action.tiles);
        break;
    }
  }
}

/**
 * What Reset filters leaves of a reader's view (AC-530; design 21 S3 pin 6,
 * 21-Q7 (a)): no filter values — the dashboard's saved state, since a
 * dashboard saves no filter values (F9) — no "Filter to marked" filters and
 * no cross-filters; every parameter, the page and anything else as it was.
 */
export function viewAfterReset<
  V extends {
    readonly filters: unknown;
    readonly markFilters: readonly unknown[];
    readonly crossFilters: readonly unknown[];
  },
>(view: V): V {
  return { ...view, filters: {}, markFilters: [], crossFilters: [] };
}

/**
 * Export (AC-530): one CSV per chosen tile, each exactly as its ⋯'s
 * Download CSV writes it (AC-171) — its table, with the byte-order mark — and
 * named by its title. A tile with nothing drawn yet is passed over.
 */
export function exportTilesAsCsv(
  tiles: readonly string[],
  drawnOf: (tile: string) => { readonly title: string; readonly spec: RenderSpec } | undefined,
  save: (name: string, data: string) => void = saveFile,
): void {
  for (const tile of tiles) {
    const drawn = drawnOf(tile);
    if (drawn !== undefined)
      save(csvFileName(drawn.title), `${BYTE_ORDER_MARK}${csvOf(drawn.spec)}`);
  }
}

const STYLE_CLASS: Readonly<Record<string, string>> = {
  primary: 'text-action text-action--primary',
  text: 'text-action text-action--text',
};

/**
 * An Action button in a Text tile, as a reader sees it (T894, AC-530; design
 * 21 pin 8, state E; rule 136): the Link/button tile's styles at 32 px, its
 * label, and on a press its declared actions in order, nothing else. A press
 * while its actions still run starts nothing new.
 */
export function ActionButton({ element, run }: { element: TextNode; run: ActionRunner }) {
  const running = useRef(false);
  const attrs = element.attrs ?? {};
  const label = typeof attrs['label'] === 'string' ? attrs['label'] : 'Button';
  const style = typeof attrs['style'] === 'string' ? attrs['style'] : 'button';
  return (
    <button
      type="button"
      className={STYLE_CLASS[style] ?? 'text-action text-action--button'}
      onClick={() => {
        if (running.current) return;
        running.current = true;
        void runActions(actionsOf(element), run).finally(() => {
          running.current = false;
        });
      }}
    >
      {label}
    </button>
  );
}
