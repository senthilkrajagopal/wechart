import { renderJSONContentToReactElement } from '@tiptap/static-renderer/json/react';

import type { TextDocument } from '@wechart/core';

import {
  markMapping,
  nodeMapping,
  readableNode,
  TextElementsContext,
  type ElementRender,
} from './readMapping';

/**
 * A Text tile in view mode (T873, AC-208, AC-513; design 21, rules 127 and
 * 132).
 *
 * Drawn through Tiptap's JSON static renderer, which builds React elements
 * "without ProseMirror runtime dependencies" — so a dashboard in view mode
 * loads no editor (AC-514) — and never sets HTML (research
 * `rich-tiles-and-combo-tech.md` §1). Its mappings are wechart's own
 * (`readMapping.tsx`), its links checked by wechart (`SafeLink.tsx`).
 */
/**
 * A renderer per drawing, never one shared: it keys each node from a counter
 * it keeps for its life, so a shared one gave every node new keys on every
 * render, and React remounted the tile's elements each time (T873's review).
 * Made afresh, its keys run from 0 by position, the same each time.
 */
const rendererOf = () =>
  renderJSONContentToReactElement({
    nodeMapping,
    markMapping,
    // `readableNode` leaves only what the mappings know; these are the floor
    // under it, never reached by a tree it has read.
    unhandledNode: () => null,
    unhandledMark: ({ children }) => children,
  });

type Content = Parameters<ReturnType<typeof rendererOf>>[0]['content'];

export function TextTile({
  document,
  renderElement,
}: {
  readonly document: TextDocument;
  /** Draws a live element or control in place; without it, elements draw nothing. */
  readonly renderElement?: ElementRender | undefined;
}) {
  const root = readableNode((document as { doc?: unknown } | undefined)?.doc);
  return (
    <div className="text-tile">
      {root?.type === 'doc' ? (
        <TextElementsContext value={renderElement}>
          {rendererOf()({ content: root as Content })}
        </TextElementsContext>
      ) : null}
    </div>
  );
}
