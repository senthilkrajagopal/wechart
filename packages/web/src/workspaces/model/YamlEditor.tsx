import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { yaml } from '@codemirror/lang-yaml';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Annotation, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { useEffect, useRef } from 'react';

/** Marks a change that came in through `value`, so it is not handed back out. */
const FROM_VALUE = Annotation.define<boolean>();

/**
 * A model file's YAML (T139; direction.md §7b: syntax highlighting and line
 * numbers), in CodeMirror 6 driven as a controlled editor
 * (research/code-editor.md): the text comes in as `value`, and a change the
 * user types goes out through `onChange`. A `value` from elsewhere — a form
 * edit — is dispatched into the editor as a change, not a new state, so the
 * cursor is mapped through it rather than lost.
 */
export function YamlEditor({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // The latest handler, read by the editor's listener without rebuilding it.
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (host.current === null) return undefined;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          yaml(),
          syntaxHighlighting(defaultHighlightStyle),
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.updateListener.of((update) => {
            // Only what the user typed: a change dispatched from `value` is
            // marked, and not handed back.
            if (!update.docChanged) return;
            if (update.transactions.every((each) => each.annotation(FROM_VALUE) === true)) return;
            changed.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // Built once; `value` reaches it through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (editor === null) return;
    const current = editor.state.doc.toString();
    if (current === value) return;
    editor.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      annotations: FROM_VALUE.of(true),
    });
  }, [value]);

  return <div ref={host} className="yaml-editor" data-testid="yaml-editor" />;
}
