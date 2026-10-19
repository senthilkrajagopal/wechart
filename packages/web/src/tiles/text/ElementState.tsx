import { createContext, useContext, useEffect, useId } from 'react';

import { StatusIcon } from '../../shell/StatusIcon';
import { TileLoadError } from '../../query/loadTile';
import { hiddenMemberOf } from '../TileUnavailable';
import { ElementTooltip } from './ElementTooltip';

/**
 * A live element's states (T889, AC-525; design 21 state G, rules 3, 18 and
 * 134), drawn where its value would be, keeping the sentence's shape.
 */

/** Where an element's answer is: on its way, failed, or in. */
export type ElementPhase = 'loading' | 'error' | 'ready';

/** What a Text tile is told of its elements' phases, each by its own id. */
export interface ElementPhases {
  readonly report: (id: string, phase: ElementPhase | undefined) => void;
}

export const ElementPhasesContext = createContext<ElementPhases | undefined>(undefined);

/** Tells the tile this element's phase, so it is `aria-busy` while any loads and offers Retry. */
export function useElementPhase(phase: ElementPhase) {
  const id = useId();
  const phases = useContext(ElementPhasesContext);
  useEffect(() => {
    phases?.report(id, phase);
  }, [phases, id, phase]);
  useEffect(
    () => () => {
      phases?.report(id, undefined);
    },
    [phases, id],
  );
}

/**
 * A value on its way: a skeleton the width of its last value, in characters,
 * or 4ch with none; a word-sized graphic's in its own pixels.
 */
export function ElementSkeleton({
  width,
  pixels,
}: {
  readonly width?: number | undefined;
  readonly pixels?: number | undefined;
}) {
  const ch = width === undefined || width < 1 ? 4 : width;
  return (
    <span
      className="text-element-skeleton"
      data-state="loading"
      aria-hidden="true"
      style={{ width: pixels === undefined ? `${String(ch)}ch` : `${String(pixels)}px` }}
    />
  );
}

/**
 * Why an element failed: a member the viewer may not query, or a folder
 * their groups can't reach — Cube's hidden member, xcube's folder gate or a
 * 403 — said the same way and naming nothing; else Cube's error.
 */
export function failureOf(error: unknown): 'forbidden' | { readonly message: string } {
  if (hiddenMemberOf(error) !== undefined) return 'forbidden';
  if (error instanceof TileLoadError && error.status === 403) return 'forbidden';
  return { message: error instanceof Error ? error.message : String(error) };
}

/**
 * "Unavailable" where a value would be. On an error, the warning icon, and
 * Details — the measure and Cube's error — on focus or hover; for a member
 * the viewer may not query, or one no longer in the model, nothing that
 * names it or why.
 */
export function ElementUnavailable({
  measure,
  error,
}: {
  /** The measure's title, said only in an error's Details. */
  readonly measure?: string | undefined;
  readonly error?: unknown;
}) {
  const failure = error === undefined ? 'forbidden' : failureOf(error);
  if (failure === 'forbidden')
    return <span className="text-value text-value--unavailable">Unavailable</span>;
  return (
    <ElementTooltip
      lines={['Details', `${measure === undefined ? '' : `${measure}: `}${failure.message}`]}
    >
      <span className="text-value text-value--unavailable text-value--failed">
        <StatusIcon kind="warn" /> Unavailable
      </span>
    </ElementTooltip>
  );
}
