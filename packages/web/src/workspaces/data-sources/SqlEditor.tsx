import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { sql } from '@codemirror/lang-sql';
import { syntaxHighlighting } from '@codemirror/language';
import { Annotation, EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, placeholder } from '@codemirror/view';
import { useEffect, useRef } from 'react';

import { changeBetween, TOKEN_HIGHLIGHT, TOKEN_THEME } from '../model/YamlEditor';

/** Marks a change that came in through `value`, so it is not handed back out. */
const FROM_VALUE = Annotation.define<boolean>();

/** What's selected now: its text, or none. */
const selectedIn = (state: EditorState) => {
  const range = state.selection.main;
  return range.empty ? '' : state.sliceDoc(range.from, range.to);
};

/**
 * The SQL tab's editor (T535; design 15's P2): the app's CodeMirror, as the
 * model's YAML has it, in SQL mode (`@codemirror/lang-sql`,
 * research/code-editor.md), driven as a controlled editor.
 *
 * - ⌘/Ctrl+Enter runs the selection where there is one, else the whole text
 *   (design 15's Q1, AC-387).
 * - What is selected is said as it changes, so Run can read "Run selection".
 * - A name chosen in the schema browser goes in at the cursor (T539).
 */
export function SqlEditor({
  value,
  onChange,
  onRun,
  onSelection,
  label,
  describedBy,
  insertion,
  focusing,
}: {
  value: string;
  onChange: (next: string) => void;
  /** The text to run: the selection, or the whole. */
  onRun: (text: string) => void;
  /** The selection's text, or '' for none, each time it changes. */
  onSelection: (selected: string) => void;
  label: string;
  /** The ids of what a screen reader reads on focus: the warning and the limits (design 15, keyboard). */
  describedBy?: string;
  /** Text to put in at the cursor: a new object each time it is asked for. */
  insertion?: { readonly text: string } | undefined;
  /** Focus asked for: a new object each time (a run's end, a run picked, the runner turned on). */
  focusing?: object | undefined;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // The latest handlers, read by the editor without rebuilding it.
  const handlers = useRef({ onChange, onRun, onSelection });
  useEffect(() => {
    handlers.current = { onChange, onRun, onSelection };
  }, [onChange, onRun, onSelection]);

  useEffect(() => {
    if (host.current === null) return undefined;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          // Before the default keymap, whose Mod-Enter inserts a blank line.
          Prec.highest(
            keymap.of([
              {
                key: 'Mod-Enter',
                run: (target) => {
                  const selected = selectedIn(target.state);
                  handlers.current.onRun(selected === '' ? target.state.doc.toString() : selected);
                  return true;
                },
              },
            ]),
          ),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          sql(),
          syntaxHighlighting(TOKEN_HIGHLIGHT),
          TOKEN_THEME,
          EditorView.lineWrapping,
          placeholder('SELECT … or EXPLAIN SELECT …'),
          EditorView.contentAttributes.of({
            'aria-label': label,
            ...(describedBy === undefined ? {} : { 'aria-describedby': describedBy }),
          }),
          EditorView.updateListener.of((update) => {
            if (update.selectionSet || update.docChanged)
              handlers.current.onSelection(selectedIn(update.state));
            if (!update.docChanged) return;
            if (update.transactions.every((each) => each.annotation(FROM_VALUE) === true)) return;
            handlers.current.onChange(update.state.doc.toString());
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
    editor.dispatch({ changes: changeBetween(current, value), annotations: FROM_VALUE.of(true) });
  }, [value]);

  useEffect(() => {
    const editor = view.current;
    if (editor === null || insertion === undefined) return;
    editor.dispatch(editor.state.replaceSelection(insertion.text));
    editor.focus();
  }, [insertion]);

  useEffect(() => {
    if (focusing !== undefined) view.current?.focus();
  }, [focusing]);

  return <div ref={host} className="yaml-editor sql-editor" data-testid="sql-editor" />;
}
