import type { Editor, JSONContent, Range } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { ELEMENT_KINDS, type TextDocument, type TextNode } from '@wechart/core';

import {
  insertMenuOpen,
  storedDocumentOf,
  storedNodeOf,
  textEditorExtensions,
  type InsertBridge,
} from './editorExtensions';
import { elementCountOf, insertRefusal, limitedGroups } from './elementLimit';
import { namesFrom } from './elementName';
import { ElementNamesContext } from './nodes/ElementView';
import {
  insertGroups,
  InsertMenu,
  noteId,
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
  /**
   * The text's elements in order, as stored, and the selected one's place,
   * or null — told whenever either changes, for Properties' Elements list
   * (AC-519).
   */
  readonly onElements?: ((elements: TextNode[], selected: number | null) => void) | undefined;
  /** Select the element at this place, asked anew by `ask` (a row of the Elements list). */
  readonly selectElement?: { readonly index: number; readonly ask: number } | undefined;
  /**
   * Settings for the element at this place, set in Properties while the text
   * is edited (T884, AC-520); a null takes one away. Asked anew by `ask`.
   */
  readonly changeElement?:
    | {
        readonly index: number;
        readonly settings: Readonly<Record<string, unknown>>;
        readonly ask: number;
      }
    | undefined;
}

const ELEMENT_TYPES = new Set<string>(ELEMENT_KINDS);

/** The editor's elements in text order, as stored, and the selected one's place. */
function elementsIn(editor: Editor): { elements: TextNode[]; selected: number | null } {
  const elements: TextNode[] = [];
  let selected: number | null = null;
  const { selection } = editor.state;
  editor.state.doc.descendants((node, pos) => {
    if (!ELEMENT_TYPES.has(node.type.name)) return;
    if (selection instanceof NodeSelection && selection.from === pos) selected = elements.length;
    elements.push(storedNodeOf(node.toJSON() as JSONContent));
  });
  return { elements, selected };
}

/** Where the element at this place starts, or undefined. */
function elementAt(editor: Editor, index: number): number | undefined {
  let seen = 0;
  let found: number | undefined;
  editor.state.doc.descendants((node, pos) => {
    if (found !== undefined) return false;
    if (!ELEMENT_TYPES.has(node.type.name)) return undefined;
    if (seen === index) found = pos;
    seen += 1;
    return undefined;
  });
  return found;
}

/**
 * Where focus may go without leaving the text: Properties' Elements list and
 * its element's settings, which work on the text being edited (AC-519).
 */
const KEEPS_EDITING = '[data-keeps-text-editing]';

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
  onElements,
  selectElement,
  changeElement,
}: TextEditorProps) {
  const names = useMemo(() => namesFrom(sources), [sources]);
  /** The insert menu, while open: what's typed, where, and which row (AC-517). */
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuId = useId();
  /** Opened by Insert, which typed its `{{` for it: Esc takes that back. */
  const byInsert = useRef(false);
  /** How many elements the text holds, kept as it changes: at 10, nothing more goes in (AC-518). */
  const [count, setCount] = useState(() => elementCountOf(document));
  /** Why the last paste or drop was refused, until the text next changes (AC-518). */
  const [refused, setRefused] = useState<string | null>(null);
  const full = insertRefusal(count);
  const groups =
    menu === null
      ? []
      : limitedGroups(insertGroups(menu.query, menu.step, sources, copilot), count);
  const rows = groups.flatMap((group) => group.rows);
  /** The active row, held to the rows there are: they change under it as sources load. */
  const at = menu === null ? 0 : Math.max(0, Math.min(menu.active, rows.length - 1));

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
        setMenu({ ...now, active: (at + step + count) % count });
        return true;
      }
      case 'Enter':
        if (count === 0) return false;
        choose(now, rows[at], range);
        return true;
      case 'ArrowRight': {
        const measure = rows[at]?.measure;
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
  const extensions = useMemo(() => textEditorExtensions(bridge, setRefused), [bridge]);
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

  /**
   * The view's props, made anew only when what they say changes: Tiptap
   * hands any new object to ProseMirror on the next render, and a render
   * from the dashboard around the text — the Elements list it tells, a
   * refresh — then reset ProseMirror's selection, dropping a selected
   * element.
   */
  const leaveRef = useRef(leave);
  useEffect(() => {
    leaveRef.current = leave;
  });
  /**
   * Focus in the text, at its end (AC-302) — unless it's opened to select an
   * element from the Elements list, where focus stays (AC-519). As it opened.
   */
  const [autofocus] = useState<'end' | false>(selectElement === undefined ? 'end' : false);
  const active = menu === null || rows.length === 0 ? undefined : rowId(menuId, at);
  const open = menu !== null;
  const editorProps = useMemo(
    () => ({
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
        ...(open
          ? {
              'aria-autocomplete': 'list',
              'aria-controls': menuId,
              ...(active === undefined ? {} : { 'aria-activedescendant': active }),
              // Why every row is disabled, at 10 elements (AC-518).
              ...(full === undefined ? {} : { 'aria-describedby': noteId(menuId) }),
            }
          : {}),
      },
      handleKeyDown: (view: EditorView, event: KeyboardEvent) => {
        // The insert menu's Esc closes only the menu.
        if (event.key !== 'Escape' || insertMenuOpen(view.state)) return false;
        leaveRef.current('escape');
        return true;
      },
    }),
    [name, open, menuId, active, full],
  );
  const editor = useEditor({
    extensions,
    content: document.doc as JSONContent,
    immediatelyRender: true,
    autofocus,
    editorProps,
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

  /** The count kept, and a refusal's reason cleared, as the text changes (AC-518). */
  useEffect(() => {
    const changed = () => {
      setCount(elementCountOf(storedDocumentOf(editor.getJSON())));
      setRefused(null);
    };
    editor.on('update', changed);
    return () => {
      editor.off('update', changed);
    };
  }, [editor]);

  /** The elements and the selected one, told to Properties as they change (AC-519). */
  const reported = useRef('');
  useEffect(() => {
    if (onElements === undefined) return undefined;
    const report = () => {
      const now = elementsIn(editor);
      const said = JSON.stringify(now);
      if (said === reported.current) return;
      reported.current = said;
      onElements(now.elements, now.selected);
    };
    /**
     * Told once ProseMirror has finished with the transaction: told during
     * it, the dashboard's render ran inside ProseMirror's own update, as an
     * element's node view was selected, and the selection was lost.
     */
    let pending = false;
    const later = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        if (!editor.isDestroyed) report();
      });
    };
    report();
    editor.on('transaction', later);
    return () => {
      editor.off('transaction', later);
    };
  }, [editor, onElements]);

  /** A row of the Elements list selects its element in the text (AC-519). */
  useEffect(() => {
    if (selectElement === undefined) return;
    const at = elementAt(editor, selectElement.index);
    // Focus in the text with it, so the keys and the leave rules are the
    // text's however it was opened (T882's review).
    if (at !== undefined) editor.chain().setNodeSelection(at).focus().run();
  }, [editor, selectElement]);

  /**
   * Settings set in Properties reach the element in the text, one step of
   * its history, and it stays selected (T884, AC-520).
   */
  useEffect(() => {
    if (changeElement === undefined) return;
    const at = elementAt(editor, changeElement.index);
    if (at === undefined) return;
    editor
      .chain()
      .command(({ tr }) => {
        const node = tr.doc.nodeAt(at);
        if (node === null) return false;
        tr.setNodeMarkup(at, undefined, { ...node.attrs, ...changeElement.settings });
        return true;
      })
      .setNodeSelection(at)
      .run();
  }, [editor, changeElement]);

  /**
   * Leaving the text (AC-302): focus going anywhere but the text, its toolbar
   * and menus, or Properties' Elements list and settings, which work on the
   * text (AC-519). Tab from the text always leaves it, wherever it lands.
   * The window losing focus — another app, another tab — isn't leaving: the
   * text is still being edited when the author comes back.
   */
  const box = useRef<HTMLDivElement>(null);
  const tabbing = useRef(false);
  useEffect(() => {
    const inBox = (node: EventTarget | null) =>
      node instanceof Node && box.current?.contains(node) === true;
    const ours = (node: EventTarget | null) =>
      inBox(node) || (node instanceof Element && node.closest(KEEPS_EDITING) !== null);
    const onFocusOut = (event: FocusEvent) => {
      if (!ours(event.target)) return;
      const to = event.relatedTarget;
      const byTab = tabbing.current;
      tabbing.current = false;
      if (inBox(to)) return;
      if (!byTab && ours(to)) return;
      if (to !== null) {
        leave('away');
        return;
      }
      if (!window.document.hasFocus()) return;
      /**
       * Focus going nowhere: a click on something that takes none — or the
       * element that had it being removed, as a closing menu's row is, while
       * the editor takes focus back, which isn't leaving. Judged once the
       * removal is done.
       */
      const from = event.target;
      setTimeout(() => {
        if (from instanceof Node && !from.isConnected) return;
        if (ours(window.document.activeElement)) return;
        leave('nowhere');
      }, 0);
    };
    window.document.addEventListener('focusout', onFocusOut);
    return () => {
      window.document.removeEventListener('focusout', onFocusOut);
    };
  });

  return (
    // Not a control: its handlers only see keys and focus leave the text,
    // the toolbar and the editor's menus inside it, which are the controls.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={box}
      className="text-editor"
      /**
       * Tab leaves the text for the next control (AC-302): stopped here, on
       * its way down, so the editor's list keys never nest an item with it
       * and the browser moves focus as it does anywhere else.
       */
      onKeyDownCapture={(event) => {
        if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.stopPropagation();
          tabbing.current = true;
        }
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
    >
      {/* Above the text (AC-515). */}
      <TextToolbar
        editor={editor}
        // Insert opens the menu at the cursor as `{{` does, by typing it.
        onInsert={() => {
          // At the selection's end, so nothing selected is typed over.
          byInsert.current = true;
          editor
            .chain()
            .focus()
            .setTextSelection(editor.state.selection.to)
            .insertContent('{{')
            .run();
          // Where `{{` opens nothing — straight after a `{` — there's nothing to take back.
          if (!insertMenuOpen(editor.state)) byInsert.current = false;
        }}
      />
      {/* Its elements' names, for their node views, which are portals in it. */}
      <ElementNamesContext value={names}>
        <EditorContent editor={editor} className="text-editor__content" />
      </ElementNamesContext>
      {refused === null ? null : (
        <p role="alert" className="text-editor__refused">
          {refused}
        </p>
      )}
      {menu === null ? null : (
        <InsertMenu
          id={menuId}
          groups={groups}
          active={at}
          note={full}
          at={menu.rect === null ? null : { left: menu.rect.left, bottom: menu.rect.bottom }}
          onChoose={(row) => {
            choose(menu, row, menu.range);
          }}
        />
      )}
    </div>
  );
}
