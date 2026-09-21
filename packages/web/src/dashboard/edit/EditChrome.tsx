import { isValidElement, useState, type ReactNode } from 'react';

import { canRedo, canUndo, discard, historyOf, push, redo, undo } from '../../editor/history';
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
  readonly document: T;
  /** Changes still in effect since editing began. */
  readonly changes: number;
  readonly change: (next: T) => void;
  /**
   * Step back one change — the same Undo the edit bar offers, reachable by
   * whoever needs to offer it somewhere else. AC-060 asks for an undo "in a
   * toast **and** through Undo", and two routes to two different histories
   * would be worse than one.
   */
  readonly undo: () => void;
}

/**
 * The count travels inside the snapshot instead of beside it. Undo, redo and
 * discard then carry it correctly for free: discard is itself undoable, so it
 * leaves an extra entry on the past, and a count derived from the stack's
 * depth would read three changes where the user has made one.
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
  readonly onSave: (document: T) => void;
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
   * gear is one (AC-069, direction.md puts it there for both).
   */
  readonly headerActions?: ReactNode;
  readonly children: (session: EditSession<T>) => ReactNode;
}

export function EditChrome<T>({
  document: opened,
  title,
  onSave,
  panels,
  overlay,
  headerActions,
  children,
}: EditChromeProps<T>) {
  const [editing, setEditing] = useState(false);
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

  const session: EditSession<T> = {
    editing,
    document: current,
    changes,
    change: (next) =>
      setHistory((previous) =>
        push(previous, { document: next, changes: previous.present.changes + 1 }),
      ),
    // The very same step the edit bar's Undo takes.
    undo: () => {
      setHistory(undo);
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
  };

  /**
   * Only a real element counts. Checking merely for "not null" let a falsy
   * ReactNode — `''`, `0`, `false` — blank the dashboard while rendering
   * nothing in its place, which is the one failure mode a full-viewport
   * overlay must not have.
   */
  const shown = overlay?.(session);
  if (isValidElement(shown)) {
    // The session stays mounted around it, so an overlay that changes the
    // document is a change to this session and not to a copy of it.
    return <div className="dashboard dashboard--overlaid">{shown}</div>;
  }

  return (
    <div className="dashboard" data-editing={editing ? 'true' : undefined}>
      <header className="dashboard__header">
        <h1>{title(current)}</h1>
        {headerActions}
        {editing ? (
          <EditBar
            changes={changes}
            canUndo={canUndo(history)}
            canRedo={canRedo(history)}
            onUndo={() => setHistory(undo)}
            onRedo={() => setHistory(redo)}
            onDiscard={() => setHistory(discard)}
            onSave={() => {
              /**
               * Saving leaves edit mode, which is the second half of AC-065.
               * The session is re-seeded from what was saved, so the change
               * count starts again at nothing — otherwise "Discard (4
               * changes)" would still be offering to undo work that is now
               * safely stored.
               */
              onSave(current);
              setHistory(historyOf<Snapshot<T>>({ document: current, changes: 0 }));
              setEditing(false);
            }}
          />
        ) : (
          <button type="button" onClick={start}>
            Edit
          </button>
        )}
      </header>

      <div className="dashboard__body">
        {/* The canvas scrolls on its own, so rule 40 has a position to keep. */}
        <div className="dashboard__canvas" data-testid="canvas-scroll">
          {children(session)}
        </div>
        {editing ? <EditSidebar panels={panels?.(session)} /> : null}
      </div>
    </div>
  );
}
