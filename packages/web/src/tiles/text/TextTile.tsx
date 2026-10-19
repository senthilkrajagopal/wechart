import { renderJSONContentToReactElement } from '@tiptap/static-renderer/json/react';

import { useId, useMemo, useState } from 'react';

import type { TextDocument } from '@wechart/core';

import { ElementPhasesContext, type ElementPhase, type ElementPhases } from './ElementState';
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
  onRetry,
}: {
  readonly document: TextDocument;
  /** Draws a live element or control in place; without it, elements draw nothing. */
  readonly renderElement?: ElementRender | undefined;
  /** Asks its failed elements again: the tile's ⋯ offers it while one has failed (AC-525). */
  readonly onRetry?: (() => void) | undefined;
}) {
  const root = readableNode((document as { doc?: unknown } | undefined)?.doc);
  /** Each element's phase, by its id (T889, AC-525). */
  const [phases, setPhases] = useState<Readonly<Record<string, ElementPhase>>>({});
  const reporter = useMemo<ElementPhases>(
    () => ({
      report: (id, phase) => {
        setPhases((was) => {
          if (was[id] === phase) return was;
          const next = { ...was };
          if (phase === undefined) delete next[id];
          else next[id] = phase;
          return next;
        });
      },
    }),
    [],
  );
  const said = Object.values(phases);
  const busy = said.includes('loading');
  const failed = said.includes('error');
  const [menu, setMenu] = useState(false);
  const menuId = useId();
  return (
    <div className="text-tile" aria-busy={busy ? true : undefined}>
      {failed && onRetry !== undefined ? (
        <div className="text-tile__more">
          <button
            type="button"
            className="icon-button text-tile__more-button"
            aria-label="More for this text"
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-controls={menu ? menuId : undefined}
            onClick={() => {
              setMenu(!menu);
            }}
          >
            ⋯
          </button>
          {menu ? (
            <div
              id={menuId}
              role="menu"
              aria-label="More for this text"
              className="text-tile__menu"
            >
              <button
                type="button"
                role="menuitem"
                className="text-tile__menu-item"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                onClick={() => {
                  setMenu(false);
                  onRetry();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    setMenu(false);
                  }
                }}
              >
                Retry
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {root?.type === 'doc' ? (
        <ElementPhasesContext value={reporter}>
          <TextElementsContext value={renderElement}>
            {rendererOf()({ content: root as Content })}
          </TextElementsContext>
        </ElementPhasesContext>
      ) : null}
    </div>
  );
}
