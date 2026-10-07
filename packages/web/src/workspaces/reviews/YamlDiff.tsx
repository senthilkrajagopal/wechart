import { yaml } from '@codemirror/lang-yaml';
import { syntaxHighlighting } from '@codemirror/language';
import { Chunk, unifiedMergeView } from '@codemirror/merge';
import { EditorState, Text } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { useEffect, useRef, useState } from 'react';

import { TOKEN_HIGHLIGHT, TOKEN_THEME } from '../model/YamlEditor';

/**
 * A proposed model file against its folder's current one (T350, AC-285;
 * design 05, state G; references.md surface 6; rule 77): a unified diff of
 * the YAML, read-only, in the code face with line numbers, the proposed file
 * as the text and the current one's removed lines shown where they were
 * (research `codemirror-merge.md`, `unifiedMergeView`). Every changed line is
 * marked + or − beside it as well as tinted: never by colour alone (rule 3).
 * Nothing in it can be accepted or rejected: that is the proposal's, whole.
 */

/** As the view diffs (the research: its `scanLimit` is 500, which isn't exported). */
const DIFF = { scanLimit: 500 } as const;

const linesOf = (text: string) => Text.of(text.split('\n'));

/** How many lines the proposed file adds and removes against the current one. */
export function changedLinesOf(
  current: string,
  proposed: string,
): { readonly added: number; readonly removed: number } {
  const a = linesOf(current);
  const b = linesOf(proposed);
  let added = 0;
  let removed = 0;
  for (const chunk of Chunk.build(a, b, DIFF)) {
    if (chunk.fromA < chunk.toA)
      removed += a.lineAt(chunk.endA).number - a.lineAt(chunk.fromA).number + 1;
    if (chunk.fromB < chunk.toB)
      added += b.lineAt(chunk.endB).number - b.lineAt(chunk.fromB).number + 1;
  }
  return { added, removed };
}

/**
 * The diff's marks from the tokens, in either theme: a tint behind each
 * changed line, and + or − in the change gutter and before each removed
 * line, so a line's change never rests on its colour (rules 2 and 3).
 */
const DIFF_THEME = EditorView.theme({
  '&.cm-merge-b .cm-changedLine': {
    backgroundColor: 'color-mix(in srgb, var(--wc-status-success) 12%, transparent)',
  },
  '&.cm-merge-b .cm-changedText': {
    background: 'color-mix(in srgb, var(--wc-status-success) 26%, transparent)',
  },
  '.cm-deletedChunk': {
    backgroundColor: 'color-mix(in srgb, var(--wc-status-error) 12%, transparent)',
    paddingLeft: '0',
  },
  '&.cm-merge-b .cm-deletedText': {
    background: 'color-mix(in srgb, var(--wc-status-error) 26%, transparent)',
  },
  '.cm-deletedLine::before': {
    content: '"−"',
    display: 'inline-block',
    width: '2ch',
    color: 'var(--wc-status-error)',
  },
  '.cm-changeGutter': { width: '2ch' },
  '.cm-changedLineGutter, .cm-deletedLineGutter': {
    background: 'none',
    textAlign: 'center',
  },
  '.cm-changedLineGutter::before': { content: '"+"', color: 'var(--wc-status-success)' },
  '.cm-deletedLineGutter::before': { content: '"−"', color: 'var(--wc-status-error)' },
  // The folded stretch's bar in the tokens, in either theme: the package
  // draws it light in both, and as a button (T637) its ring must show on it.
  '.cm-collapsedLines': {
    background: 'var(--wc-bg-subtle)',
    color: 'var(--wc-text-secondary)',
  },
});

export function YamlDiff({
  path,
  current,
  version,
  proposed,
  asProposed = false,
}: {
  readonly path: string;
  /** The folder's file now; none where the proposal adds a new one. */
  readonly current?: string | undefined;
  /** Its version now, which the proposal replaces. */
  readonly version?: number | undefined;
  readonly proposed: string;
  /**
   * Shown as proposed, alone: a decided proposal's, whose folder's file may
   * be what it landed as (as T356's review has a decided dashboard drawn).
   */
  readonly asProposed?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  /** Every line shown, the unchanged stretches unfolded (T637; R66). */
  const [all, setAll] = useState(false);
  const { added, removed } = changedLinesOf(current ?? '', proposed);
  const label = asProposed
    ? `${path}, as proposed`
    : `${path}: the proposed YAML against the current`;
  useEffect(() => {
    if (host.current === null) return undefined;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: proposed,
        extensions: [
          lineNumbers(),
          yaml(),
          syntaxHighlighting(TOKEN_HIGHLIGHT),
          TOKEN_THEME,
          DIFF_THEME,
          // Read-only, yet focusable to be read and scrolled (research, Gotchas).
          EditorState.readOnly.of(true),
          EditorView.contentAttributes.of({ 'aria-label': label, 'aria-readonly': 'true' }),
          asProposed
            ? []
            : unifiedMergeView({
                original: current ?? '',
                mergeControls: false,
                // Long unchanged stretches folded, 3 lines kept around each
                // change (design 05, state G; research, `collapseUnchanged`),
                // unless every line is asked for (T637).
                ...(all ? {} : { collapseUnchanged: { margin: 3, minSize: 4 } }),
              }),
        ],
      }),
    });
    /**
     * Each "N unchanged lines" bar as a button (T637; R66): the package draws
     * it as a div that only a click unfolds (research, Gotchas). So it is
     * given the button's role and a tab stop as it is drawn, and Enter or
     * Space on it clicks it, which is what unfolds it.
     */
    const bars = () => {
      for (const bar of view.dom.querySelectorAll<HTMLElement>('.cm-collapsedLines')) {
        if (bar.getAttribute('role') === 'button') continue;
        bar.setAttribute('role', 'button');
        bar.setAttribute('tabindex', '0');
        // Named by its words alone: the theme's ⦚ marks, drawn as CSS
        // content, would otherwise be read as part of its name.
        bar.setAttribute('aria-label', (bar.textContent ?? '').trim());
      }
    };
    bars();
    const drawn = new MutationObserver(bars);
    drawn.observe(view.dom, { childList: true, subtree: true });
    const barOf = (target: EventTarget | null) =>
      target instanceof HTMLElement && target.classList.contains('cm-collapsedLines')
        ? target
        : undefined;
    /**
     * The bar gone, the caret on the first line it unfolded and the text
     * focused, as CodeMirror focuses it, so a reader is where the lines are
     * (T637's review: not on the file's first line, nor the page).
     */
    const landAt = (pos: number) => {
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      view.focus();
    };
    const onKey = (event: KeyboardEvent) => {
      const bar = barOf(event.target);
      if (bar === undefined || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      const pos = view.posAtDOM(bar);
      bar.click();
      landAt(pos);
    };
    // A press on a bar keeps focus off it, which its click then removes, and
    // the caret goes where its lines were unfolded, as from the keys.
    let pressed: number | undefined;
    const onDown = (event: MouseEvent) => {
      const bar = barOf(event.target);
      if (bar === undefined) return;
      event.preventDefault();
      pressed = view.posAtDOM(bar);
    };
    const onClick = () => {
      if (pressed === undefined) return;
      const pos = pressed;
      pressed = undefined;
      landAt(pos);
    };
    view.dom.addEventListener('keydown', onKey);
    view.dom.addEventListener('mousedown', onDown);
    view.dom.addEventListener('click', onClick);
    return () => {
      drawn.disconnect();
      view.dom.removeEventListener('keydown', onKey);
      view.dom.removeEventListener('mousedown', onDown);
      view.dom.removeEventListener('click', onClick);
      view.destroy();
    };
  }, [label, current, proposed, asProposed, all]);
  return (
    <section className="yaml-diff" aria-label={`${path}, the YAML`}>
      <p className="yaml-diff__head" data-testid="yaml-diff-head">
        <span className="is-code">{path}</span>
        {asProposed ? (
          ' as proposed'
        ) : (
          <>
            {current === undefined
              ? ' new in this folder'
              : ` version ${String(version ?? '')} → proposed`}
            {` · +${String(added)}`}
            {removed === 0 ? '' : ` −${String(removed)}`}
          </>
        )}
      </p>
      {asProposed || current === undefined ? null : (
        // Beside the diff: every folded line unfolded, or folded again (T637; R66).
        <button
          type="button"
          className="btn btn-sm yaml-diff__all"
          aria-pressed={all}
          onClick={() => {
            setAll((now) => !now);
          }}
        >
          Show all lines
        </button>
      )}
      <div ref={host} className="yaml-diff__code" />
    </section>
  );
}
