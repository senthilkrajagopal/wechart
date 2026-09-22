import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

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
import { SharedChartNotice } from '../../editor/SharedChartNotice';
import { loadTile } from '../../query/loadTile';
import { StateLine } from '../../shell/StatusIcon';
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
  /**
   * "Save dashboard" (direction.md §2: "applies the chart and saves the
   * dashboard"): the chart's edit as a draft, or nothing when it was not
   * changed, to be applied and saved in one step.
   */
  readonly onSaveDashboard: (draft: ChartDraft | undefined) => void;
  /**
   * Why the dashboard could not be saved with this chart's edit applied, or
   * undefined when it could. Asked with the edit, or with nothing while the
   * chart is unchanged.
   */
  readonly saveBlocked: (
    pending: Pick<ChartDraft, 'document' | 'version'> | undefined,
  ) => string | undefined;
  /** The tile it was opened from (T196). */
  readonly tileId?: string;
  /**
   * The tile the URL names as open in the editor. Once it has named this
   * editor's tile, its going — the browser's Back — closes the editor the way
   * its own Back does, keeping the change (T196, AC-002).
   */
  readonly urlTile?: string | undefined;
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
  onSaveDashboard,
  saveBlocked,
  tileId,
  urlTile,
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
        : {
            document: draft.document,
            state: editorStateOf(draft.document),
            // The version the chart was first read at, carried through every
            // reopening: it is what the write is checked against (T192).
            version: draft.version,
          },
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
  /**
   * Whether the chart now differs from how it was opened — judged as Back
   * judges it — for Save dashboard, which only a *change* to a chart that
   * cannot be written holds back. A flag, not the state: it flips rarely, so
   * setting it does not redraw the editor on every change.
   */
  const [changed, setChanged] = useState(false);
  const onChange = useCallback(
    (state: EditorState) => {
      latest.current = state;
      setChanged(opened !== undefined && changesChart(opened.document, opened.state, state));
    },
    [opened],
  );

  /**
   * Set while going back. The draft is drawn by running the chart's query,
   * which can take a moment, and until now the editor stayed live through it:
   * anything changed in that moment was silently dropped, since the state had
   * already been taken. The editor is made inert instead, and says so.
   */
  const [applying, setApplying] = useState(false);
  const leaving = useRef(false);
  /**
   * Leaving the editor, by Back or by Save dashboard: the edit is handed on as
   * a draft, or nothing when there was none. Both leave the same way so that
   * what is saved is exactly what Back would have applied.
   */
  const leave = useCallback(
    async (then: (draft: ChartDraft | undefined) => void) => {
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
        then(undefined);
        return;
      }

      setApplying(true);
      const document = chartDocumentWith(opened.document, state);
      // Drawn by the very function every tile uses, so an emptied chart reads
      // "no fields yet" rather than the tile keeping its old chart.
      then({ document, drawn: await tileChartOf(document, loadRows), version: opened.version });
    },
    [opened],
  );
  const back = useCallback(() => leave(onBack), [leave, onBack]);

  /**
   * The browser's Back (T196). Opened from a tile, the editor puts the tile in
   * the URL a moment after it opens; once it has seen it there, the tile's
   * going means the user went back, and the editor leaves as its own Back
   * would — the change kept, not dropped with the overlay.
   */
  const seenInUrl = useRef(false);
  useEffect(() => {
    if (tileId === undefined) return;
    if (urlTile === tileId) {
      seenInUrl.current = true;
      return;
    }
    if (seenInUrl.current) void back();
  }, [urlTile, tileId, back]);

  /**
   * Asked with the chart as it was loaded, not as the edit would write it:
   * what decides is whose chart it is and the version it was read at, and the
   * edit changes neither — `chartDocumentWith` keeps every field the editor
   * has no control for, `localToDashboardId` among them.
   */
  const blocked = saveBlocked(
    changed && opened !== undefined
      ? { document: opened.document, version: opened.version }
      : undefined,
  );
  const blockedId = useId();

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
        <StateLine kind="run" testId="editor-applying">
          {applying ? 'Applying the change…' : ''}
        </StateLine>
        {/* Kept mounted with its text changing, as the edit bar's reason is:
            a live region inserted with its words already in it is announced
            unreliably. */}
        <StateLine
          kind="warn"
          id={blockedId}
          className="chart-editor-overlay__blocked"
          testId="editor-save-blocked"
        >
          {blocked ?? ''}
        </StateLine>
        {/* aria-disabled, not disabled, as the edit bar's Save: it stays
            focusable, so the reason it is tied to can be reached from it. The
            handler is what refuses. */}
        <button
          type="button"
          className="chart-editor-overlay__save"
          data-testid="editor-save-dashboard"
          aria-disabled={blocked !== undefined}
          aria-describedby={blocked === undefined ? undefined : blockedId}
          onClick={() => {
            if (blocked !== undefined) return;
            void leave(onSaveDashboard);
          }}
        >
          Save dashboard
        </button>
      </header>
      {/* A library chart: shared, and on how many dashboards, before a change
          spreads (T134, AC-128) — not one this dashboard is saving to a
          folder in the session, which is its own until saved (T133). */}
      {opened === undefined ||
      opened.document.localToDashboardId !== undefined ||
      draft?.wasLocalTo !== undefined ? null : (
        <SharedChartNotice chartId={chartId} folderId={opened.document.folderId} />
      )}
      {view.kind === 'loading' ? (
        <StateLine kind="run" testId="editor-loading">
          Opening the chart…
        </StateLine>
      ) : view.kind === 'error' ? (
        <StateLine kind="err" testId="editor-load-error">
          {view.message}
        </StateLine>
      ) : (
        <div className="chart-editor-overlay__body" inert={applying} aria-busy={applying}>
          <ChartEditor key={chartId} initial={view.initial} tile={tile} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
