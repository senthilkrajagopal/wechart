import { isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';

import { canRedo, canUndo, discard, historyOf, push, redo, undo } from '../../editor/history';
import { FolderCrumbs } from '../../workspaces/explore/FolderCrumbs';
import { EditBar } from './EditBar';
import { EditSidebar, type SidebarContent } from './EditSidebar';

/**
 * Edit mode on a dashboard (AC-053).
 *
 * Editing is a mode the user turns on — direction.md section 2: "An explicit
 * Edit switches the dashboard in place". AC-018 depends on the same fact from
 * the other side: a dashboard opens in view mode, so the mode has to be off
 * until asked for.
 *
 * The chrome is generic over the document because it never reads one. The
 * dashboard document's shape belongs to the grid and the element grammar
 * (T060 onwards); what lives here is the session: what the user opened with,
 * what they have changed since, and the controls that act on that.
 *
 * `../../editor/history` is reused rather than copied. It is already generic
 * over the state it holds, and it stores states rather than inverse
 * operations, which is what lets a kind of change that does not exist yet be
 * undoable the day it is added.
 */
export interface EditSession<T> {
  readonly editing: boolean;
  /**
   * A save is under way (AC-184). The session takes no change until it
   * settles; what else the caller offers — a page over the dashboard, an
   * editor — should not open meanwhile either.
   */
  readonly saving: boolean;
  readonly document: T;
  /** Changes still in effect since editing began. */
  readonly changes: number;
  readonly change: (next: T) => void;
  /**
   * A change made to the document as it is when the change lands, not as it
   * was when it began — for one that finishes later, like an image's upload
   * (T069's review): made from an earlier render's document, it undid
   * everything changed while it was on its way.
   */
  readonly update: (apply: (current: T) => T) => void;
  /**
   * Step back one change — the same Undo the edit bar offers, reachable by
   * whoever needs to offer it somewhere else. AC-060 asks for an undo "in a
   * toast **and** through Undo", and two routes to two different histories
   * would be worse than one.
   */
  readonly undo: () => void;
  /**
   * Enter edit mode, as the Edit button does — for a control inside the
   * dashboard that needs it, such as a tile's pencil (T032, direction.md §2:
   * "From view mode, the pencil switches the dashboard into edit mode
   * first").
   */
  readonly edit: () => void;
  /**
   * Save this document, as the edit bar's Save saves the session's — for a
   * save made from inside, such as the chart editor's "Save dashboard"
   * (direction.md §2: "applies the chart and saves the dashboard"). Handed the
   * document because the caller's own last change is made in the same step:
   * `change` followed by a save would save the document from before it.
   *
   * Refused on the same terms as Save. A refused document is kept as a change,
   * not dropped — it carries the caller's change — and the bar then says why
   * Save is held back.
   */
  readonly save: (document: T) => void;
}

/**
 * The count travels inside the snapshot instead of beside it, so undo and
 * redo carry it correctly for free. (Discard used to be undoable and leave an
 * entry of its own; it now leaves edit mode, AC-204.)
 */
interface Snapshot<T> {
  readonly document: T;
  readonly changes: number;
}

export interface EditChromeProps<T> {
  readonly document: T;
  /**
   * Read from the document being edited, not passed as a fixed string: the
   * title is part of the document, so renaming it in the settings page has to
   * show in the header the rename is about. A caller that handed in a string
   * would be handing in the *opened* document's title, and the heading would
   * keep the old name until the dashboard was saved and re-fetched.
   */
  readonly title: (document: T) => string;
  /**
   * The folder it lives in, for the breadcrumb back to it (AC-195) — read from
   * the document being edited like the title, so a move made in the settings
   * shows at once. Absent draws no breadcrumb.
   */
  readonly folderOf?: (document: T) => string | undefined;
  /**
   * Save this document. Return a promise and it decides the outcome (AC-184):
   * edit mode is left once it resolves, and if it rejects the session stays,
   * every change kept, for the user to try again or change course. Saying why
   * it failed is the caller's — the rejection is not shown here. A caller
   * that returns nothing is taken to have saved.
   */
  readonly onSave: (document: T) => void | Promise<unknown>;
  /**
   * What the sidebar's three panels hold. A function of the session, because
   * the Add panel needs to know what is selected and to make a change
   * (AC-058) — and the session is created here.
   */
  readonly panels?: ((session: EditSession<T>) => SidebarContent) | undefined;
  /**
   * A full-viewport page shown *instead of* the dashboard and its chrome, with
   * the session left running underneath — the dashboard settings page is one
   * (AC-069).
   *
   * It takes the place of the header and body rather than covering them
   * because it brings its own bar, and a second bar behind it would offer Save
   * twice with two different meanings. Keeping the session mounted is the
   * point: AC-074 makes a settings save one undoable change, and unmounting
   * here would take the history with it.
   *
   * Returning nothing means no overlay, so the dashboard shows as usual.
   */
  readonly overlay?: ((session: EditSession<T>) => ReactNode) | undefined;
  /**
   * Controls that sit in the header in both view and edit mode — the settings
   * gear is one (AC-069, direction.md puts it there for both). A function of
   * the session when they need it: the header is outside the body a save
   * makes inert, so a control there has to hold itself back while saving.
   */
  readonly headerActions?: ReactNode | ((session: EditSession<T>) => ReactNode);
  /**
   * Why the document cannot be saved as it stands, or undefined when it can.
   * While there is a reason, Save is held back with the reason beside it,
   * rather than saving what it can and leaving edit mode — which drops the
   * rest in silence. A dashboard holding a chart edited from a tile that
   * cannot be written with it — one local to another dashboard, one with no
   * version — is such a document (T032, T192; library charts are written
   * since T134).
   */
  readonly saveBlocked?: ((document: T) => string | undefined) | undefined;
  /**
   * Editing has begun, from the document as it stands now. For a caller that
   * has to remember something about that moment the document does not hold —
   * the version the save will be checked against (T198, AC-015).
   */
  readonly onStart?: (() => void) | undefined;
  /** The session discarded and edit mode left (AC-204). */
  readonly onDiscard?: (() => void) | undefined;
  /**
   * No way into edit mode: no Edit, and `edit()` does nothing — for a
   * dashboard previewed as a security context (T172), whose editing would
   * ask as wechart under a banner saying otherwise.
   */
  readonly readOnly?: boolean | undefined;
  /**
   * The rows between the header and the canvas — a dashboard's page tabs and
   * filter bar — full width above the canvas and the sidebar alike, as the
   * prototype stacks them (T246), and so held while the canvas scrolls.
   */
  readonly band?: ((session: EditSession<T>) => ReactNode) | undefined;
  /**
   * Docked under the canvas, full width — the details panel (T269, AC-240):
   * the canvas gives it room rather than go under it.
   */
  readonly foot?: ReactNode;
  readonly children: (session: EditSession<T>) => ReactNode;
}

export function EditChrome<T>({
  document: opened,
  title,
  folderOf,
  onSave,
  panels,
  overlay,
  headerActions,
  saveBlocked,
  onStart,
  onDiscard,
  readOnly = false,
  band,
  foot,
  children,
}: EditChromeProps<T>) {
  const [editing, setEditing] = useState(false);
  /** Edit, once a Discard has put it back: where focus goes (T223's review). */
  const editButton = useRef<HTMLButtonElement>(null);
  const focusEditNext = useRef(false);
  useEffect(() => {
    if (editing || !focusEditNext.current) return;
    focusEditNext.current = false;
    editButton.current?.focus();
  }, [editing]);
  const [history, setHistory] = useState(() =>
    historyOf<Snapshot<T>>({ document: opened, changes: 0 }),
  );

  /**
   * In view mode the prop is the truth: the history was seeded once, at mount,
   * and a dashboard that arrives from the server after that would otherwise
   * never be seen. Edit mode is the opposite — the session owns the document
   * from the moment Edit was pressed, and a prop that changed underneath must
   * not silently discard what the user has done.
   */
  const current = editing ? history.present.document : opened;
  const changes = editing ? history.present.changes : 0;
  // Only while editing: view mode has no Save to hold back.
  const blocked = editing ? saveBlocked?.(current) : undefined;

  /**
   * A save under way (AC-184). Every guard below reads this render's value,
   * so it holds from the render after the save starts; a second press of Save
   * then meets a held-back "Saving…" (`saveOutcome.test.tsx` presses it and
   * finds one save sent).
   */
  const [saving, setSaving] = useState(false);

  /**
   * No change while a save is under way. A save that then succeeds re-seeds
   * the session from what it saved, so a change made meanwhile would be
   * dropped with nothing said. The body is inert as well; this also stops
   * what inert does not — a key handled on the document.
   */
  const change = (next: T) => {
    if (saving) return;
    setHistory((previous) =>
      push(previous, { document: next, changes: previous.present.changes + 1 }),
    );
  };
  const update = (apply: (current: T) => T) => {
    if (saving) return;
    setHistory((previous) =>
      push(previous, {
        document: apply(previous.present.document),
        changes: previous.present.changes + 1,
      }),
    );
  };

  /**
   * Leaving edit mode is the second half of AC-065. The session is re-seeded
   * from what was saved, so the change count starts again at nothing —
   * otherwise "Discard (4 changes)" would still be offering to undo work that
   * is now safely stored.
   */
  const leave = (saved: T) => {
    setHistory(historyOf<Snapshot<T>>({ document: saved, changes: 0 }));
    setEditing(false);
  };

  /**
   * Edit mode is left only once the save has gone through (AC-184). Leaving
   * at once, as it did, took every change with it when the save then failed.
   * On failure the session stays as it is; the caller says why.
   */
  const saveDocument = (document: T) => {
    if (saving) return;
    const outcome = onSave(document);
    if (!(outcome instanceof Promise)) {
      leave(document);
      return;
    }

    setSaving(true);
    outcome.then(
      () => {
        setSaving(false);
        leave(document);
      },
      () => {
        setSaving(false);
      },
    );
  };

  const session: EditSession<T> = {
    editing,
    saving,
    document: current,
    changes,
    change,
    update,
    // The very same step the edit bar's Undo takes — and, like it, not while
    // a save is under way.
    undo: () => {
      if (!saving) setHistory(undo);
    },
    /**
     * Only from view mode. Entering starts a fresh history, so entering again
     * while editing would keep the document but move the baseline under it:
     * every change so far would stay applied and stop being discardable.
     */
    edit: () => {
      if (!editing && !readOnly) start();
    },
    /**
     * The document is recorded as a change first, then saved: if the save is
     * refused, or fails (AC-184), the caller's own change is still there.
     */
    save: (document) => {
      if (saving) return;
      if (document !== current) change(document);
      if (saveBlocked?.(document) !== undefined) return;
      saveDocument(document);
    },
  };

  /**
   * The session starts where Edit was pressed, not where the component
   * mounted, so "every change since editing began" means what it says — and
   * Discard has the right state to return to (AC-066).
   */
  const start = () => {
    setHistory(historyOf<Snapshot<T>>({ document: current, changes: 0 }));
    setEditing(true);
    onStart?.();
  };

  /**
   * Only a real element counts. Checking merely for "not null" let a falsy
   * ReactNode — `''`, `0`, `false` — blank the dashboard while rendering
   * nothing in its place, which is the one failure mode a full-viewport
   * overlay must not have.
   */
  const shown = overlay?.(session);
  const overlaid = isValidElement(shown);

  /**
   * The overlay covers the dashboard; it does not replace it.
   *
   * It used to be returned *instead of* the dashboard, which unmounted the
   * whole dashboard for as long as an overlay was open. Coming back, every tab
   * group reopened on its first tab — so a tile edited from a later tab was
   * not even on screen on return (T032, AC-034) and focus had nowhere to go —
   * and both panes were back at the top, which is AC-067's failing state. The
   * settings page had always done this; the chart editor made it the main
   * authoring path.
   *
   * So the dashboard stays exactly where it is in the tree — the same second
   * child whether or not an overlay is showing, so React never remounts it —
   * and keeps its geometry: it is hidden with visibility, which changes no
   * layout, so its scroll positions are still valid when it is shown again. It
   * is inert and hidden from assistive technology while covered, so there is
   * still one bar and one meaning of Save that anyone can reach.
   */
  return (
    <>
      {overlaid ? <div className="dashboard dashboard--overlaid">{shown}</div> : null}
      <div
        className={overlaid ? 'dashboard dashboard--under-overlay' : 'dashboard'}
        data-editing={editing ? 'true' : undefined}
        inert={overlaid}
        aria-hidden={overlaid ? true : undefined}
      >
        <header className="dashboard__header">
          {/* The way back to its folder (AC-195). */}
          {folderOf === undefined ? null : <FolderCrumbs folderId={folderOf(current)} />}
          {/* "Editing ‹name›" while editing (AC-206), as the prototype's header.
              The word is for the eye: the heading still names the dashboard,
              and the edit bar — a toolbar named "Dashboard editing" — says the
              mode to a screen reader. */}
          <h1>
            {editing ? (
              <span className="dashboard__editing" aria-hidden="true">
                Editing{' '}
              </span>
            ) : null}
            {title(current)}
          </h1>
          {editing ? (
            <EditBar
              changes={changes}
              canUndo={canUndo(history)}
              canRedo={canRedo(history)}
              onUndo={() => setHistory(undo)}
              onRedo={() => setHistory(redo)}
              // The dashboard as it was when editing began, and back to view
              // mode, changes or none (AC-204, the prototype's Discard) —
              // focus on Edit, where the next session begins, rather than
              // lost with the bar (T223's review).
              onDiscard={() => {
                leave(discard(history).present.document);
                focusEditNext.current = true;
                onDiscard?.();
              }}
              saveBlocked={blocked}
              saving={saving}
              onSave={() => {
                // Refused here too, not only by the button: nothing that reaches
                // Save by another route should save a document that cannot be
                // kept whole. `session.save` is such a route, refused alike.
                if (blocked !== undefined) return;
                saveDocument(current);
              }}
            />
          ) : readOnly ? null : (
            // The prototype's primary Edit, with its pencil (AC-187).
            <button ref={editButton} type="button" className="btn-primary" onClick={start}>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M11.5 2.5l2 2L6 12l-2.8.8L4 10z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
              Edit
            </button>
          )}
          {/* Last, as the prototype has the settings gear. */}
          {typeof headerActions === 'function' ? headerActions(session) : headerActions}
        </header>

        {band === undefined ? null : (
          // Inert with the body while a save is under way, as it was inside it.
          <div className="dashboard__fixed" inert={saving}>
            {band(session)}
          </div>
        )}

        <div className="dashboard__body" inert={saving} aria-busy={saving}>
          {/* The canvas scrolls on its own, so rule 40 has a position to keep. */}
          <div className="dashboard__canvas" data-testid="canvas-scroll">
            {children(session)}
          </div>
          {editing ? <EditSidebar panels={panels?.(session)} /> : null}
        </div>
        {foot === undefined || foot === null ? null : <div className="dashboard__foot">{foot}</div>}
      </div>
    </>
  );
}
