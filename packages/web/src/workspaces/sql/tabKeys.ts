/**
 * The SQL runner workspace's tab keys (T827, AC-480; R78-12, approved under
 * R75; research `keyboard-shortcuts-sql-runner.md`, "Recommended bindings"):
 * Ctrl+Q, and only Ctrl+Q, opens a new tab on the current data source.
 *
 * - **Control, on macOS too,** never ⌘: ⌘Q quits Chrome, Edge and Firefox
 *   there. Control alone, without Alt, ⌘ or Shift (Ctrl+Shift+Q quits
 *   Firefox on Windows).
 * - **The letter, not the place:** `event.key`, falling back to
 *   `code === 'KeyQ'` only when the key isn't a Latin letter, as on a
 *   Russian layout; on AZERTY the KeyQ place types "a".
 * - **Nothing else:** Ctrl+Alt+[ and ] were dropped (the user, 2026-10-17),
 *   so tabs are chosen with the tab bar; and no key closes a tab, which its
 *   × does.
 * - A key the editor already handled, or one typed in an IME composition,
 *   is left alone (the research's guard).
 */
export type TabKey = 'new';

const letter = (event: Pick<KeyboardEvent, 'key' | 'code'>, wanted: string, code: string) =>
  event.key.toLowerCase() === wanted || (!/^[a-z]$/i.test(event.key) && event.code === code);

export function tabKeyOf(
  event: Pick<
    KeyboardEvent,
    'key' | 'code' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey' | 'defaultPrevented' | 'isComposing'
  >,
): TabKey | null {
  if (event.defaultPrevented || event.isComposing) return null;
  const onlyControl = event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
  return onlyControl && letter(event, 'q', 'KeyQ') ? 'new' : null;
}
