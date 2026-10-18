import { createContext, useCallback, useRef, type MutableRefObject } from 'react';

/**
 * ⌘/Ctrl+S in the SQL runner workspace (T816, AC-455; R78 "Save and Find",
 * approved under R75): wherever focus is in the workspace, it saves the open
 * tab's query, as its Save or Save… does, instead of the browser's saving the
 * page (research/keyboard-shortcuts-sql-runner.md: the page hears ⌘/Ctrl+S
 * first and may prevent it). Nowhere else does the key do anything new.
 *
 * The workspace holds the key; the open tab says what saving is, through
 * this context, as it renders.
 */
export type SaveNow = () => void;
export const SaveKeyContext = createContext<MutableRefObject<SaveNow | null> | null>(null);

/**
 * ⌘S on a Mac, Ctrl+S elsewhere: S with ⌘ or Ctrl, and neither Shift nor
 * Alt, outside a composition. By the letter; on a layout whose key there
 * types no Latin letter (Cyrillic, Greek), by the key's place, `KeyS`, as
 * research/keyboard-shortcuts-sql-runner.md has it for Ctrl+Q (T816's review).
 */
export const isSaveKey = (event: KeyboardEvent): boolean =>
  (event.metaKey || event.ctrlKey) &&
  !event.shiftKey &&
  !event.altKey &&
  !event.isComposing &&
  (event.key.toLowerCase() === 's' || (!/^[a-z]$/i.test(event.key) && event.code === 'KeyS'));

/**
 * The workspace's side: the slot the open tab fills, and the key handler for
 * the workspace's element. With no tab to save (none on a source), the key
 * still does nothing but keep the browser from saving the page.
 */
export function useSaveKeyScope(): {
  readonly slot: MutableRefObject<SaveNow | null>;
  readonly onKeyDown: (event: KeyboardEvent) => void;
} {
  const slot = useRef<SaveNow | null>(null);
  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isSaveKey(event)) return;
    event.preventDefault();
    slot.current?.();
  }, []);
  return { slot, onKeyDown };
}
