import type { Editor, JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useMemo, useRef } from 'react';

import type { TextDocument } from '@wechart/core';

import { storedDocumentOf, textEditorExtensions } from './editorExtensions';

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
export default function TextEditor({ document, name, onLeave }: TextEditorProps) {
  const extensions = useMemo(() => textEditorExtensions(), []);
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
      },
      handleKeyDown: (_view, event) => {
        if (event.key !== 'Escape') return false;
        leave('escape');
        return true;
      },
    },
    onCreate: ({ editor: created }) => {
      editorOf.current = created;
      opening.current = JSON.stringify(storedDocumentOf(created.getJSON()));
    },
  });
  useEffect(() => {
    editorOf.current = editor;
  }, [editor]);

  return (
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
      onBlur={(event) => {
        const to = event.relatedTarget;
        if (to !== null && event.currentTarget.contains(to)) return;
        leave(to === null ? 'nowhere' : 'away');
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
