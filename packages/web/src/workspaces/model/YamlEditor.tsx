import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { sql } from '@codemirror/lang-sql';
import { yaml } from '@codemirror/lang-yaml';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import {
  Annotation,
  Compartment,
  EditorState,
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Text,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutterLineClass,
  keymap,
  lineNumbers,
  type DecorationSet,
} from '@codemirror/view';
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
 * Lines tinted and lines flagged (T482; design 03 note 9), as the research
 * sets them (research/code-editor.md, "Addendum 2026-09-27"): a field each,
 * set by an effect from the props and mapped through edits between them.
 */
const NO_LINES: readonly number[] = [];

/** Valid, unique, sorted 1-based line numbers, as where each line starts: a stale one is dropped. */
function lineStarts(doc: Text, lines: readonly number[]): number[] {
  return [...new Set(lines)]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= doc.lines)
    .sort((a, b) => a - b)
    .map((n) => doc.line(n).from);
}

const setTinted = StateEffect.define<readonly number[]>();
const TINT = Decoration.line({ class: 'yaml-editor__tint' });
const tintField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(tints, transaction) {
    let next = tints.map(transaction.changes);
    for (const effect of transaction.effects)
      if (effect.is(setTinted)) {
        const built = new RangeSetBuilder<Decoration>();
        for (const at of lineStarts(transaction.newDoc, effect.value)) built.add(at, at, TINT);
        next = built.finish();
      }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** A flag is a class on the line's gutter elements, drawn in CSS: no DOM of its own. */
class Flag extends GutterMarker {
  override elementClass = 'yaml-editor__flag';
}
const FLAG = new Flag();
const setFlagged = StateEffect.define<readonly number[]>();
const flagField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(flags, transaction) {
    let next = flags.map(transaction.changes);
    for (const effect of transaction.effects)
      if (effect.is(setFlagged))
        next = RangeSet.of(
          lineStarts(transaction.newDoc, effect.value).map((at) => FLAG.range(at)),
        );
    return next;
  },
  provide: (field) => gutterLineClass.from(field),
});

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
  wrap = false,
  tinted = NO_LINES,
  flagged = NO_LINES,
  reveal,
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
  language?: 'yaml' | 'sql' | 'plain';
  /** Long lines wrap under their indent rather than run off the pane (design 03 note 8). */
  wrap?: boolean;
  /** 1-based lines tinted: the open member's, or those a note points at (note 9). */
  tinted?: readonly number[];
  /** 1-based lines flagged in the gutter: comments a form edit could drop (note 9). */
  flagged?: readonly number[];
  /** A line to bring to the top of the view: a new object each time it is asked for. */
  reveal?: { readonly line: number } | undefined;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  /** Wrapping switched in place, the editor kept (research, "Compartment"). */
  const wrapping = useRef(new Compartment());
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
          // SQL as Cube generates it, read only (T174): highlighted, no completion.
          language === 'yaml' ? yaml() : language === 'sql' ? sql() : [],
          syntaxHighlighting(TOKEN_HIGHLIGHT),
          TOKEN_THEME,
          wrapping.current.of(wrap ? EditorView.lineWrapping : []),
          tintField,
          flagField,
          readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [],
          EditorView.contentAttributes.of({
            'aria-label': label,
            // Not editable is out of the tab order: back in, to be read and scrolled.
            ...(readOnly ? { 'aria-readonly': 'true', tabindex: '0' } : {}),
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

  useEffect(() => {
    view.current?.dispatch({
      effects: wrapping.current.reconfigure(wrap ? EditorView.lineWrapping : []),
    });
  }, [wrap]);

  // By their numbers, so a new array of the same lines dispatches nothing.
  const tints = tinted.join(',');
  useEffect(() => {
    view.current?.dispatch({ effects: setTinted.of(tinted) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tints]);
  const flags = flagged.join(',');
  useEffect(() => {
    view.current?.dispatch({ effects: setFlagged.of(flagged) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flags]);

  /** A line brought to the top of the view (research, "Scrolling a line to the top"). */
  useEffect(() => {
    const editor = view.current;
    if (editor === null || reveal === undefined) return;
    const doc = editor.state.doc;
    if (reveal.line < 1 || reveal.line > doc.lines) return;
    editor.dispatch({
      effects: EditorView.scrollIntoView(doc.line(reveal.line).from, { y: 'start', yMargin: 0 }),
    });
  }, [reveal]);

  return <div ref={host} className="yaml-editor" data-testid="yaml-editor" />;
}
