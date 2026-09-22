import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { yaml } from '@codemirror/lang-yaml';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { Annotation, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useEffect, useRef } from 'react';

import type { Problem } from './problems';

/**
 * The YAML's colours, from the tokens, so each theme's own values apply and
 * the contrast audit covers them (AC-005; direction.md rules 2 and 24). The
 * prototype's --cm-* roles on the tags the YAML grammar gives
 * (research/code-editor.md, "Highlighting from tokens"). Not
 * `defaultHighlightStyle`: a light style, it put dark blue on dark.
 */
const TOKEN_HIGHLIGHT = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--wc-code-key)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--wc-code-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--wc-code-number)' },
  { tag: [tags.lineComment, tags.comment], color: 'var(--wc-code-comment)', fontStyle: 'italic' },
  {
    tag: [tags.labelName, tags.typeName, tags.keyword, tags.meta],
    color: 'var(--wc-code-atom)',
  },
]);

/**
 * The caret and the selection in the tokens too: CodeMirror's base theme
 * draws a black caret and a light selection, lost on the dark ground.
 */
const TOKEN_THEME = EditorView.theme({
  '.cm-content': { caretColor: 'var(--wc-text-primary)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--wc-text-primary)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'color-mix(in srgb, var(--wc-accent) 28%, transparent)' },
});

/** No problems: one array, so leaving out `problems` does not redo the marks each render. */
const NONE: readonly Problem[] = [];

/**
 * The part of `before` that `after` changes: the text between their shared
 * start and their shared end. Dispatched as the change, so the editor maps
 * the cursor through it rather than to the edge of a whole-text replace.
 */
export function changeBetween(
  before: string,
  after: string,
): { from: number; to: number; insert: string } {
  const shorter = Math.min(before.length, after.length);
  let start = 0;
  while (start < shorter && before.charCodeAt(start) === after.charCodeAt(start)) start += 1;
  // The end may not reach back into the start: "aa" → "aaa" is one "a" added.
  let end = 0;
  while (
    end < shorter - start &&
    before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)
  )
    end += 1;
  return { from: start, to: before.length - end, insert: after.slice(start, after.length - end) };
}

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
  problems = NONE,
  goTo,
  readOnly = false,
  language = 'yaml',
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  /** What stops the text parsing, underlined where it is (T141, AC-135). */
  problems?: readonly Problem[];
  /** A place to put the cursor, and show: a new object each time it is asked for. */
  goTo?: { readonly at: number } | undefined;
  /**
   * Shown, selectable and read, but taking no edit (T146, AC-140):
   * `EditorState.readOnly` and `EditorView.editable` (research/code-editor.md,
   * "Read-only + decorations"). Fixed for the editor's life.
   */
  readOnly?: boolean;
  /** YAML is highlighted; code wechart has no grammar for is shown plain. */
  language?: 'yaml' | 'plain';
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
          lintGutter(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          language === 'yaml' ? yaml() : [],
          syntaxHighlighting(TOKEN_HIGHLIGHT),
          TOKEN_THEME,
          readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [],
          EditorView.contentAttributes.of({
            'aria-label': label,
            ...(readOnly ? { 'aria-readonly': 'true' } : {}),
          }),
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
    const change = changeBetween(current, value);
    editor.dispatch({
      changes: change,
      annotations: FROM_VALUE.of(true),
      // Shown where it is — the editor draws only the lines near its scroll
      // position — without moving the cursor (research/code-editor.md).
      effects: EditorView.scrollIntoView(change.from, { y: 'nearest' }),
    });
  }, [value]);

  /**
   * The problems as the editor's own diagnostics — a squiggle and a gutter
   * mark — from the same list the problems panel shows, so the two cannot
   * drift (research/code-editor.md, "Diagnostics").
   */
  useEffect(() => {
    const editor = view.current;
    if (editor === null) return;
    const length = editor.state.doc.length;
    editor.dispatch(
      setDiagnostics(
        editor.state,
        problems.map((problem) => ({
          from: Math.min(problem.from, length),
          to: Math.min(Math.max(problem.to, problem.from + 1), length),
          severity: 'error' as const,
          message: problem.message,
        })),
      ),
    );
  }, [problems]);

  useEffect(() => {
    const editor = view.current;
    if (editor === null || goTo === undefined) return;
    const at = Math.min(goTo.at, editor.state.doc.length);
    editor.dispatch({ selection: { anchor: at }, scrollIntoView: true });
    editor.focus();
  }, [goTo]);

  return <div ref={host} className="yaml-editor" data-testid="yaml-editor" />;
}
