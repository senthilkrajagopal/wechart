import { createContext, lazy } from 'react';

import type { TextDocument } from '@wechart/core';

import type { LeftBy } from './TextEditor';

/**
 * Which Text tile's text is being edited on the canvas, and how to start and
 * leave (T876, AC-302): held by the dashboard, which records the edit as one
 * change, and reached by the tiles through context, however deep a section
 * or a tab nests them.
 */
export interface TextEditing {
  /** The tile whose text is editable now, or null. */
  readonly tileId: string | null;
  readonly start: (tileId: string) => void;
  /** The text is left: its document when it changed, and how (`LeftBy`). */
  readonly leave: (tileId: string, document: TextDocument | undefined, how: LeftBy) => void;
  /** A tile's name, which names its text (AC-515). */
  readonly nameOf: (tileId: string) => string;
}

export const TextEditingContext = createContext<TextEditing | undefined>(undefined);

/** The editor, in a chunk of its own that only editing a text loads (AC-514). */
export const LazyTextEditor = lazy(() => import('./TextEditor'));
