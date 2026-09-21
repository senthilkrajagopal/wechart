import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChartEditor } from '../../editor/ChartEditor';
import {
  changesChart,
  chartDocumentWith,
  editorStateOf,
  editorViewOf,
  loadChart,
  type EditorState,
} from '../../editor/openChart';
import type { TileSize } from '../../editor/PreviewFrame';
import { loadTile } from '../../query/loadTile';
import { tileChartOf } from '../chartSpec';
import type { ChartDraft } from './chartDrafts';

export interface ChartEditorOverlayProps {
  readonly chartId: string;
  readonly dashboardTitle: string;
  /** The tile it was opened from, as measured on the dashboard. */
  readonly tile: TileSize | undefined;
  /** This chart's draft from earlier in the session, if it has one. */
  readonly draft: ChartDraft | undefined;
  /**
   * Going back to the dashboard: with the edit as a draft, or with nothing
   * when the chart was not changed.
   */
  readonly onBack: (draft: ChartDraft | undefined) => void;
}

/** Runs a chart's query for its draft — exactly as a dashboard tile runs it. */
async function loadRows(query: Record<string, unknown>) {
  const result = (await loadTile({ query })) as { data?: Record<string, unknown>[] };
  return result.data ?? [];
}

/**
 * The chart editor, opened over the dashboard from one of its tiles (T032,
 * AC-034; direction.md §2: "a full-viewport overlay with '← Back to
 * _dashboard_'", and "Esc = Back (keeps the changes)").
 *
 * **Over the dashboard, not a page of its own.** It used to be reached by a
 * full page load, which ended the dashboard's edit session — so there was
 * nothing to return *to* with the tile updated, and nothing a Discard could
 * reach. Shown through `EditChrome`'s overlay, the session stays mounted.
 *
 * **Back keeps the changes**, as a draft held in the session: the tile draws
 * it at once, Undo and Discard reach it, and nothing is written until the
 * dashboard is saved (AC-183, T192). The opposite of the settings page, whose
 * Back asks before losing work — here, going back *is* keeping it.
 */
export function ChartEditorOverlay({
  chartId,
  dashboardTitle,
  tile,
  draft,
  onBack,
}: ChartEditorOverlayProps) {
  /**
   * **A chart already drafted opens on its draft**, not on what is stored.
   * Opened from the server a second time, the editor would start from the old
   * chart and the first edit would be silently replaced by the second.
   */
  const fromDraft = useMemo(
    () =>
      draft === undefined
        ? undefined
        : { document: draft.document, state: editorStateOf(draft.document) },
    [draft],
  );
  const fetched = useQuery({
    queryKey: ['chart-editor-overlay', chartId],
    queryFn: () => loadChart(chartId),
    enabled: draft === undefined,
    // Fetched once per opening and never while open, as the route's editor.
    staleTime: Infinity,
    gcTime: 0,
  });
  const opened = fromDraft ?? fetched.data;
  const view = editorViewOf({ data: opened?.state, error: fetched.error });

  /**
   * The editor's latest state, reported after every change. Held in a ref:
   * it is read only on the way back, and rendering on every keystroke to
   * store it would redraw the editor it came from.
   */
  const latest = useRef<EditorState | undefined>(undefined);
  const onChange = useCallback((state: EditorState) => {
    latest.current = state;
  }, []);

  /**
   * Set while going back. The draft is drawn by running the chart's query,
   * which can take a moment, and until now the editor stayed live through it:
   * anything changed in that moment was silently dropped, since the state had
   * already been taken. The editor is made inert instead, and says so.
   */
  const [applying, setApplying] = useState(false);
  const leaving = useRef(false);
  const back = useCallback(async () => {
    // Once: a second Back while the draft is being drawn would apply it twice.
    if (leaving.current) return;
    leaving.current = true;

    const state = latest.current;
    /**
     * Unchanged goes back with nothing — including a chart changed and then
     * changed back, which `changesChart` judges by what would be written, not
     * by object identity. Recording it would put "Discard (1 change)" on a
     * dashboard exactly as it was, and that count is the only thing telling
     * an editor they have unsaved work.
     */
    if (
      opened === undefined ||
      state === undefined ||
      !changesChart(opened.document, opened.state, state)
    ) {
      onBack(undefined);
      return;
    }

    setApplying(true);
    const document = chartDocumentWith(opened.document, state);
    // Drawn by the very function every tile uses, so an emptied chart reads
    // "no fields yet" rather than the tile keeping its old chart.
    onBack({ document, drawn: await tileChartOf(document, loadRows) });
  }, [opened, onBack]);

  /**
   * Focus starts on the way out, so a keyboard user begins inside the overlay.
   * Esc goes back, keeping the changes — heard on the document, as the
   * settings page's dialog hears it.
   */
  const root = useRef<HTMLDivElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backButton.current?.focus();
  }, []);
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Esc that is ending an IME composition belongs to the composition.
      if (event.isComposing) return;
      /**
       * Only when focus is in the overlay (or nowhere). Heard on the document,
       * Esc was also taken from anything opened over the overlay — the search
       * palette, whose own listener is added later and so runs after this one:
       * closing it went back from the editor as well, applying the draft.
       */
      const focused = window.document.activeElement;
      if (
        focused !== null &&
        focused !== window.document.body &&
        !root.current?.contains(focused)
      ) {
        return;
      }
      event.preventDefault();
      void back();
    };
    window.document.addEventListener('keydown', onKeyDown);
    return () => {
      window.document.removeEventListener('keydown', onKeyDown);
    };
  }, [back]);

  return (
    <div ref={root} className="chart-editor-overlay" data-testid="chart-editor-overlay">
      <header className="chart-editor-overlay__bar">
        <button
          ref={backButton}
          type="button"
          data-testid="editor-back"
          onClick={() => {
            void back();
          }}
        >
          ← Back to {dashboardTitle}
        </button>
        {/* Names the chart, not only the tool: the page it replaces was headed
            by the dashboard, and this is one chart of it. */}
        <h1>
          Chart editor
          {opened === undefined || opened.document.title === '' ? '' : `: ${opened.document.title}`}
        </h1>
        {/* Mounted from the start and only its text changing: a live region
            that appears with its words already in it is announced
            unreliably. */}
        <p role="status" data-testid="editor-applying">
          {applying ? 'Applying the change…' : ''}
        </p>
      </header>
      {view.kind === 'loading' ? (
        <p data-testid="editor-loading">Opening the chart…</p>
      ) : view.kind === 'error' ? (
        <p role="alert" data-testid="editor-load-error">
          {view.message}
        </p>
      ) : (
        <div className="chart-editor-overlay__body" inert={applying} aria-busy={applying}>
          <ChartEditor key={chartId} initial={view.initial} tile={tile} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
