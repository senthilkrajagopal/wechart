import type { Editor, JSONContent, Range } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import type { TextDocument } from '@wechart/core';

import {
  insertMenuOpen,
  storedDocumentOf,
  textEditorExtensions,
  type InsertBridge,
} from './editorExtensions';
import {
  insertGroups,
  InsertMenu,
  rowId,
  type CopilotOffer,
  type InsertRow,
  type InsertSources,
  type InsertStep,
} from './InsertMenu';
import { TextToolbar } from './TextToolbar';

interface MenuState {
  readonly query: string;
  readonly range: Range;
  readonly rect: DOMRect | null;
  readonly step: InsertStep;
  readonly active: number;
}

const NO_SOURCES: InsertSources = { cubes: [], markings: [], filters: [] };

/**
 * How the text was left (AC-302): by Esc; by focus going to another control
 * — Tab, or a click on one; or by a click on nothing that takes focus. The
 * host puts focus back on the tile for Esc and for "nowhere".
 */
export type LeftBy = 'escape' | 'away' | 'nowhere';

export interface TextEditorProps {
  readonly document: TextDocument;
  /** The tile's name, which names the text (AC-515). */
  readonly name: string;
  /**
   * The text is left, once: the document as stored, or undefined when
   * nothing changed, so the dashboard records one change or none (AC-302).
   */
  readonly onLeave: (document: TextDocument | undefined, how: LeftBy) => void;
  /** What the insert menu offers elements of: the dashboard's measures, markings, filters (AC-517). */
  readonly sources?: InsertSources | undefined;
  /** The insert menu's Copilot group (AC-535). */
  readonly copilot?: CopilotOffer;
}

/**
 * A Text tile's text, editable in place on the canvas (T876, AC-302; design
 * 21 screen 1 pin 1). Loaded with `React.lazy`, so view mode never loads it
 * (AC-514; research `rich-tiles-and-combo-tech.md` §1: "The editor belongs in
 * a lazily loaded chunk that only edit mode imports").
 *
 * While the text is edited, its own history takes ⌘Z; once it's left, the
 * whole edit is handed back as one document, which the dashboard records as
 * one change, so its Undo reverses it whole.
 */
export default function TextEditor({
  document,
  name,
  onLeave,
  sources = NO_SOURCES,
  copilot,
}: TextEditorProps) {
  /** The insert menu, while open: what's typed, where, and which row (AC-517). */
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuId = useId();
  /** Opened by Insert, which typed its `{{` for it: Esc takes that back. */
  const byInsert = useRef(false);
  const groups = menu === null ? [] : insertGroups(menu.query, menu.step, sources, copilot);
  const rows = groups.flatMap((group) => group.rows);

  const choose = (now: MenuState, row: InsertRow | undefined, range: Range) => {
    if (row?.run === undefined || row.disabled !== undefined) return;
    if (row.run.type === 'step') {
      setMenu({ ...now, step: row.run.step, active: 0 });
      return;
    }
    // In place of the trigger and what's typed after it.
    editorOf.current?.chain().focus().insertContentAt(range, row.run.node).run();
  };

  /** The menu's keys, the APG combobox's: ↑ ↓, Enter, → on a measure, ← back, Esc. */
  const onMenuKey = (event: KeyboardEvent, range: Range): boolean => {
    const now = menu;
    if (now === null) return false;
    const count = rows.length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (count === 0) return true;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setMenu({ ...now, active: (now.active + step + count) % count });
        return true;
      }
      case 'Enter':
        if (count === 0) return false;
        choose(now, rows[now.active], range);
        return true;
      case 'ArrowRight': {
        const measure = rows[now.active]?.measure;
        if (measure === undefined || now.step.kind !== 'search') return false;
        setMenu({ ...now, step: { kind: 'measure', measure }, active: 0 });
        return true;
      }
      case 'ArrowLeft':
        if (now.step.kind === 'search') return false;
        setMenu({ ...now, step: { kind: 'search' }, active: 0 });
        return true;
      case 'Escape':
        // What's typed stays as text; only Insert's own `{{` goes.
        if (byInsert.current && now.query === '')
          editorOf.current?.chain().deleteRange(range).run();
        return true;
      default:
        return false;
    }
  };
  const menuKey = useRef(onMenuKey);
  useEffect(() => {
    menuKey.current = onMenuKey;
  });
  const bridge = useMemo<InsertBridge>(
    () => ({
      open: ({ query, range, rect, started }) => {
        setMenu((was) =>
          started || was === null
            ? { query, range, rect, step: { kind: 'search' }, active: 0 }
            : { ...was, query, range, rect, active: was.query === query ? was.active : 0 },
        );
      },
      close: () => {
        byInsert.current = false;
        setMenu(null);
      },
      key: (event, range) => menuKey.current(event, range),
    }),
    [],
  );
  // The bridge's refs are read only when ProseMirror calls it, after render.
  // eslint-disable-next-line react-hooks/refs
  const extensions = useMemo(() => textEditorExtensions(bridge), [bridge]);
  const leaveWith = useRef(onLeave);
  useEffect(() => {
    leaveWith.current = onLeave;
  }, [onLeave]);
  const editorOf = useRef<Editor | null>(null);
  /** The text as it opened, in the stored shape, to tell a change from none. */
  const opening = useRef('');
  const left = useRef(false);

  const leave = (how: LeftBy) => {
    const editor = editorOf.current;
    if (left.current || editor === null) return;
    left.current = true;
    const now = storedDocumentOf(editor.getJSON());
    leaveWith.current(JSON.stringify(now) === opening.current ? undefined : now, how);
  };

  const editor = useEditor({
    extensions,
    content: document.doc as JSONContent,
    immediatelyRender: true,
    // Focus in the text, at its end (AC-302).
    autofocus: 'end',
    editorProps: {
      // Tiptap sets no role; the accessibility guide asks for `textbox`
      // (research §1, Gotchas: "The ARIA role must be set by us").
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': name,
        class: 'text-tile text-editor__text',
        // While the insert menu is open, the text is its combobox: focus
        // stays here and the active row is named (AC-517). Not
        // aria-expanded, which a textbox doesn't take.
        ...(menu === null
          ? {}
          : {
              'aria-autocomplete': 'list',
              'aria-controls': menuId,
              ...(rows.length === 0 ? {} : { 'aria-activedescendant': rowId(menuId, menu.active) }),
            }),
      },
      handleKeyDown: (view, event) => {
        // The insert menu's Esc closes only the menu.
        if (event.key !== 'Escape' || insertMenuOpen(view.state)) return false;
        leave('escape');
        return true;
      },
    },
    // Tiptap calls it once the editor exists, never during render.
    onCreate: ({ editor: created }) => {
      // eslint-disable-next-line react-hooks/immutability
      editorOf.current = created;
      opening.current = JSON.stringify(storedDocumentOf(created.getJSON()));
    },
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    editorOf.current = editor;
  }, [editor]);

  return (
    // Not a control: its handlers only see keys and focus leave the text,
    // the toolbar and the editor's menus inside it, which are the controls.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="text-editor"
      /**
       * Tab leaves the text for the next control (AC-302): stopped here, on
       * its way down, so the editor's list keys never nest an item with it
       * and the browser moves focus as it does anywhere else.
       */
      onKeyDownCapture={(event) => {
        if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey)
          event.stopPropagation();
      }}
      /**
       * A press on a part of it that takes no focus — the toolbar's strip,
       * the count, a gap — keeps focus where it is; otherwise the tile around
       * it, which takes focus, would, and the text would be left (T878's
       * review).
       */
      onMouseDown={(event) => {
        const target = event.target as Element;
        if (
          target.closest(
            'button, input, label, [contenteditable="true"], [role="menuitemradio"], [role="option"]',
          ) === null
        )
          event.preventDefault();
      }}
      // Esc from the toolbar leaves the text too; the text's own Esc, and a
      // menu's or the link field's, is handled where it's pressed.
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        leave('escape');
      }}
      onBlur={(event) => {
        const to = event.relatedTarget;
        if (to !== null && event.currentTarget.contains(to)) return;
        // The window losing focus — another app, another tab — isn't leaving
        // the text: it's still being edited when the author comes back.
        if (to === null && !window.document.hasFocus()) return;
        leave(to === null ? 'nowhere' : 'away');
      }}
    >
      {/* Above the text (AC-515). */}
      <TextToolbar
        editor={editor}
        // Insert opens the menu at the cursor as `{{` does, by typing it.
        onInsert={() => {
          byInsert.current = true;
          editor.chain().focus().insertContent('{{').run();
        }}
      />
      <EditorContent editor={editor} className="text-editor__content" />
      {menu === null ? null : (
        <InsertMenu
          id={menuId}
          groups={groups}
          active={menu.active}
          at={menu.rect === null ? null : { left: menu.rect.left, bottom: menu.rect.bottom }}
          onChoose={(row) => {
            choose(menu, row, menu.range);
          }}
        />
      )}
    </div>
  );
}
