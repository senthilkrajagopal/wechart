import {
  acceptCompletion,
  autocompletion,
  closeCompletion,
  moveCompletionSelection,
  type CompletionSource,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { sql, StandardSQL, type SQLDialect } from '@codemirror/lang-sql';
import { syntaxHighlighting } from '@codemirror/language';
import { Annotation, EditorState, Facet, Prec, StateField } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  keymap,
  lineNumbers,
  placeholder,
  type DecorationSet,
} from '@codemirror/view';
import { useEffect, useRef } from 'react';

import { changeBetween, TOKEN_HIGHLIGHT, TOKEN_THEME } from '../model/YamlEditor';
import { statementAt } from '../sql/statementAt';

/** Marks a change that came in through `value`, so it is not handed back out. */
const FROM_VALUE = Annotation.define<boolean>();

/** What's selected now: its text, or none. */
const selectedIn = (state: EditorState) => {
  const range = state.selection.main;
  return range.empty ? '' : state.sliceDoc(range.from, range.to);
};

/** The dialect the statement at the cursor is read in: the tab's source's (T803's review). */
const STATEMENT_DIALECT = Facet.define<SQLDialect, SQLDialect>({
  combine: (values) => values[0] ?? StandardSQL,
});

/** The statement at the cursor, with nothing selected (T803, AC-387); none otherwise. */
const statementIn = (state: EditorState) => {
  const range = state.selection.main;
  return range.empty
    ? statementAt(state.doc.toString(), range.head, state.facet(STATEMENT_DIALECT))
    : null;
};

/**
 * The statement at the cursor, marked (T803; design 17, pin 11), as the
 * model's editor marks its lines (`YamlEditor.tsx`): a field of decorations
 * derived from the text and the selection.
 */
const STATEMENT_MARK = Decoration.mark({ class: 'cm-sql-statement' });
const marksOf = (state: EditorState): DecorationSet => {
  const found = statementIn(state);
  return found === null || found.from === found.to
    ? Decoration.none
    : Decoration.set([STATEMENT_MARK.range(found.from, found.to)]);
};
const statementMark = StateField.define<DecorationSet>({
  create: marksOf,
  update: (marks, transaction) =>
    transaction.docChanged || transaction.selection !== undefined ? marksOf(transaction.state) : marks,
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * Autocomplete as AC-456 has it (T808): the list opens as the user types,
 * from `source` alone. Its keys are only those AC-456 names: ↑ and ↓ choose,
 * Enter accepts, Esc closes the list and goes no further; each acts only
 * while the list is open. `@codemirror/autocomplete`'s own keymap is off: it
 * also binds Ctrl-Space, Alt-` and Alt-i, and Page Up and Down, which no
 * criterion approves (R75). Tab is bound to nothing, so it leaves the editor
 * (research/code-editor.md, accessibility). The list takes its keys as soon
 * as it shows, not 75 ms later as the library would: Enter accepts whenever
 * the list is open (lane SQL's call, T808-2).
 */
const completionOf = (source: CompletionSource) => [
  autocompletion({ override: [source], defaultKeymap: false, icons: false, interactionDelay: 0 }),
  Prec.highest(
    keymap.of([
      { key: 'ArrowDown', run: moveCompletionSelection(true) },
      { key: 'ArrowUp', run: moveCompletionSelection(false) },
      { key: 'Enter', run: acceptCompletion },
      { key: 'Escape', run: closeCompletion, stopPropagation: true },
    ]),
  ),
];

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
  atCursor = false,
  onStatement,
  dialect = StandardSQL,
  completion,
}: {
  /** The SQL runner workspace's autocomplete (T808, AC-456): what to offer as the user types. Read once. */
  completion?: CompletionSource | undefined;
  /** The source's dialect, for the statement at the cursor's bounds (with `atCursor`). Read once. */
  dialect?: SQLDialect;
  /**
   * The SQL runner workspace's (T803, AC-387): with nothing selected,
   * ⌘/Ctrl+Enter runs the statement at the cursor, which is marked, rather
   * than the whole text. Read once, as the editor is built.
   */
  atCursor?: boolean;
  /** The statement at the cursor's text, or '' for none, as it changes (with `atCursor`). */
  onStatement?: (statement: string) => void;
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
  const handlers = useRef({ onChange, onRun, onSelection, onStatement });
  useEffect(() => {
    handlers.current = { onChange, onRun, onSelection, onStatement };
  }, [onChange, onRun, onSelection, onStatement]);

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
                  handlers.current.onRun(
                    selected !== ''
                      ? selected
                      : atCursor
                        ? (statementIn(target.state)?.text ?? '')
                        : target.state.doc.toString(),
                  );
                  return true;
                },
              },
            ]),
          ),
          ...(atCursor ? [STATEMENT_DIALECT.of(dialect), statementMark] : []),
          ...(completion === undefined ? [] : completionOf(completion)),
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
            if (update.selectionSet || update.docChanged) {
              handlers.current.onSelection(selectedIn(update.state));
              if (atCursor) handlers.current.onStatement?.(statementIn(update.state)?.text ?? '');
            }
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
