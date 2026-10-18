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
const renderDocument = renderJSONContentToReactElement({
  nodeMapping,
  markMapping,
  // `readableNode` leaves only what the mappings know; these are the floor
  // under it, never reached by a tree it has read.
  unhandledNode: () => null,
  unhandledMark: ({ children }) => children,
});

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
          {renderDocument({ content: root as Parameters<typeof renderDocument>[0]['content'] })}
        </TextElementsContext>
      ) : null}
    </div>
  );
}
