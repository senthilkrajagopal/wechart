import { describe, expect, it } from 'vitest';

import { tabKeyOf } from './tabKeys';

/**
 * T827 (AC-480; research `keyboard-shortcuts-sql-runner.md`, "Recommended
 * bindings"): WHILE focus is in the SQL runner workspace, Ctrl+Q opens a new
 * tab on the current data source, on macOS too, with Control rather than ⌘;
 * tabs are chosen with the tab bar, by no other key; and no key closes a tab.
 */
const key = (over: Partial<KeyboardEvent>) =>
  ({
    key: '',
    code: '',
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    defaultPrevented: false,
    isComposing: false,
    ...over,
  }) as KeyboardEvent;

describe('the SQL runner workspace’s tab keys (T827, AC-480)', () => {
  it('opens a new tab on Ctrl+Q, Control alone, on every platform', () => {
    expect(tabKeyOf(key({ key: 'q', code: 'KeyQ', ctrlKey: true }))).toBe('new');
    expect(tabKeyOf(key({ key: 'Q', code: 'KeyQ', ctrlKey: true }))).toBe('new');
  });

  it('never takes ⌘Q, which quits the browser on macOS, nor Ctrl with Shift, Alt or ⌘ beside it', () => {
    expect(tabKeyOf(key({ key: 'q', code: 'KeyQ', metaKey: true }))).toBeNull();
    expect(tabKeyOf(key({ key: 'Q', code: 'KeyQ', ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(tabKeyOf(key({ key: 'q', code: 'KeyQ', ctrlKey: true, altKey: true }))).toBeNull();
    expect(tabKeyOf(key({ key: 'q', code: 'KeyQ', ctrlKey: true, metaKey: true }))).toBeNull();
    expect(tabKeyOf(key({ key: 'q', code: 'KeyQ' }))).toBeNull();
  });

  it('reads the letter, not the place: Q where AZERTY puts it, and KeyQ only for a non-Latin layout', () => {
    // AZERTY: the letter Q is on the A key's place.
    expect(tabKeyOf(key({ key: 'q', code: 'KeyA', ctrlKey: true }))).toBe('new');
    expect(tabKeyOf(key({ key: 'a', code: 'KeyQ', ctrlKey: true }))).toBeNull();
    // Russian: KeyQ types й.
    expect(tabKeyOf(key({ key: 'й', code: 'KeyQ', ctrlKey: true }))).toBe('new');
  });

  it('selects no tab on Ctrl+Alt+[ or ], and closes none on any key', () => {
    for (const code of ['BracketLeft', 'BracketRight'])
      expect(tabKeyOf(key({ key: code === 'BracketLeft' ? '[' : ']', code, ctrlKey: true, altKey: true }))).toBeNull();
    for (const [letter, code] of [
      ['w', 'KeyW'],
      ['F4', 'F4'],
      ['Delete', 'Delete'],
    ] as const)
      expect(tabKeyOf(key({ key: letter, code, ctrlKey: true }))).toBeNull();
  });

  it('leaves a key already handled, or typed in a composition, alone', () => {
    expect(tabKeyOf(key({ key: 'q', code: 'KeyQ', ctrlKey: true, defaultPrevented: true }))).toBeNull();
    expect(tabKeyOf(key({ key: 'q', code: 'KeyQ', ctrlKey: true, isComposing: true }))).toBeNull();
  });
});
