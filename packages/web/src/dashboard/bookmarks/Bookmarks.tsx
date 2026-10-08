import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { DiscardQuestion } from '../../shell/DiscardQuestion';
import { MenuButton, type MenuItem } from '../../shell/MenuButton';
import { StateLine } from '../../shell/StatusIcon';
import { useFocusTrap } from '../../shell/useFocusTrap';
import { PersonIcon } from '../../workspaces/explore/WorkspaceBand';
import { viewStateFrom, type ViewState } from './viewState';

/** A bookmark as the API lists it to this user (T367). */
interface Saved {
  readonly id: string;
  readonly name: string;
  readonly state: unknown;
  /** Shared with everyone who may see the dashboard (AC-293). */
  readonly shared: boolean;
  /** This user's own: theirs to change. */
  readonly mine: boolean;
  /**
   * Theirs to delete: their own, or another's shared one to a Super-Admin
   * (T580; AC-293 as amended by R61). The API's to say.
   */
  readonly mayDelete: boolean;
  /** Who shared it, on another's. */
  readonly sharedBy?: string;
  /**
   * Phase 1's, saved before sign-in was turned on, listed to a Super-Admin
   * (T762, AC-429).
   */
  readonly savedBeforeSignIn?: boolean;
}

type Listed =
  | { readonly kind: 'reading' }
  | { readonly kind: 'read'; readonly bookmarks: readonly Saved[] }
  | { readonly kind: 'failed'; readonly why: string };

/** What is open over the dashboard, from a bookmark's action. */
type Asking =
  | { readonly kind: 'save'; readonly state: unknown; readonly copyOf?: string }
  | { readonly kind: 'rename'; readonly bookmark: Saved }
  | { readonly kind: 'share'; readonly bookmark: Saved };

/**
 * What a save does with a name: a new bookmark is "Only me" (rule 81); one of
 * the saver's own of that name is replaced, and stays as shared as it was.
 */
const REPLACES =
  'A new bookmark is yours alone until you share it; one of yours of the same name on this dashboard is replaced, and stays shared if it was.';

const urlOf = (dashboardId: string, id?: string) =>
  `/api/dashboards/${encodeURIComponent(dashboardId)}/bookmarks${
    id === undefined ? '' : `/${encodeURIComponent(id)}`
  }`;

/** The API's answer as words: its error, or its status. */
async function whyNot(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === 'string'
    ? body.error
    : `the server answered ${String(response.status)}.`;
}

function readSaved(raw: unknown): Saved | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { id, name, state, shared, mine, mayDelete, sharedBy, savedBeforeSignIn } = raw as Record<
    string,
    unknown
  >;
  if (typeof id !== 'string' || typeof name !== 'string') return undefined;
  return {
    id,
    name,
    state,
    shared: shared === true,
    mine: mine === true,
    mayDelete: mayDelete === true,
    ...(typeof sharedBy === 'string' ? { sharedBy } : {}),
    ...(savedBeforeSignIn === true ? { savedBeforeSignIn: true } : {}),
  };
}

/** Shared: design 10's people, beside the person of "Only me". */
function PeopleIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="6" cy="6" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11" cy="6.5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M1.8 13c.5-2.2 2.1-3.4 4.2-3.4s3.7 1.2 4.2 3.4M10.2 9.8c1.9 0 3.3 1 3.8 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

/**
 * The dashboard header's Bookmarks (T127, AC-121; T128, AC-122; T367,
 * AC-293): a popover listing the reader's own bookmarks under Mine, then
 * those others share under Shared, each newest first as the API lists them
 * (rule 81; design 10, state B). Each row's name applies it (`onApply`),
 * writing nothing; its visibility is an icon and a label; its ⋯ offers its
 * owner Update, Rename, Share or Stop sharing and Delete, and anyone else
 * Apply and Save a copy to mine, with Delete too where the API says they may
 * (a Super-Admin, on a shared one: T580, R61). Save bookmark… keeps what the
 * dashboard shows now — the page tab, the filters' values and the marks —
 * under a name, "Only me". It sits in the header with the dashboard's other
 * reading controls, before its settings gear.
 */
export function Bookmarks({
  dashboardId,
  current,
  onApply,
}: {
  dashboardId: string;
  current: ViewState;
  /** Restore what a bookmark kept, read back as a view (`viewStateFrom`). */
  onApply: (state: ViewState, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<Asking | undefined>(undefined);
  const [said, setSaid] = useState('');
  const box = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  /** Read again after each change, so what changed is listed as it is now. */
  const [reads, setReads] = useState(0);
  const [listed, setListed] = useState<Listed>({ kind: 'reading' });

  useEffect(() => {
    const aborted = new AbortController();
    void fetch(urlOf(dashboardId), { signal: aborted.signal })
      .then(async (response) => {
        if (!response.ok) {
          setListed({ kind: 'failed', why: `The server answered ${String(response.status)}.` });
          return;
        }
        const body = (await response.json()) as { bookmarks?: unknown };
        const bookmarks = Array.isArray(body.bookmarks) ? (body.bookmarks as unknown[]) : [];
        setListed({
          kind: 'read',
          bookmarks: bookmarks.map(readSaved).filter((each) => each !== undefined),
        });
      })
      .catch(() => {
        if (!aborted.signal.aborted)
          setListed({ kind: 'failed', why: 'The server did not answer.' });
      });
    return () => {
      aborted.abort();
    };
  }, [dashboardId, reads]);

  // Focus moves in as it opens (rule 85).
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  /**
   * Escape closes it, focus back on Bookmarks when it was inside (rule 85),
   * as a filter's popover does; a pointer going down anywhere else closes it
   * too. An open ⋯ menu inside takes its own Escape first (`MenuButton`).
   * The dashboard's own Escape, which clears what is marked, leaves it be
   * while it is open (`DashboardView`, `.bookmarks`).
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      if (box.current?.contains(document.activeElement) === true) trigger.current?.focus();
    };
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  /** Closed, focus back on Bookmarks, where the reader was (rule 85). */
  const closeAll = () => {
    setOpen(false);
    setAsking(undefined);
    trigger.current?.focus();
  };
  const changed = (words: string) => {
    setSaid(words);
    setReads((was) => was + 1);
  };

  const apply = (bookmark: Saved) => {
    closeAll();
    // Whatever it holds is read as a view: what isn't one is dropped.
    const state = viewStateFrom(bookmark.state);
    if (state === undefined) {
      setSaid(`The bookmark “${bookmark.name}” holds nothing to restore.`);
      return;
    }
    onApply(state, bookmark.name);
    setSaid(`Applied the bookmark “${bookmark.name}”.`);
  };

  /** A change with nothing to ask first, its owner's or a Super-Admin's delete: said done, or why not. */
  const act = (bookmark: Saved, init: RequestInit, done: string, failed: string) => {
    closeAll();
    void fetch(urlOf(dashboardId, bookmark.id), init)
      .then(async (response) => {
        if (response.ok) changed(done);
        else setSaid(`${failed}: ${await whyNot(response)}`);
      })
      .catch(() => {
        setSaid(`${failed}: the server did not answer.`);
      });
  };
  const patch = (body: Record<string, unknown>): RequestInit => ({
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const actionsOf = (bookmark: Saved): MenuItem[] => {
    const applying: MenuItem = {
      key: 'apply',
      label: 'Apply',
      onSelect: () => {
        apply(bookmark);
      },
    };
    // Asks nothing first, as R61 has it for one's own.
    const deleting: MenuItem = {
      key: 'delete',
      label: 'Delete',
      danger: true,
      separatorBefore: true,
      onSelect: () => {
        act(
          bookmark,
          { method: 'DELETE' },
          `Deleted the bookmark “${bookmark.name}”.`,
          `The bookmark “${bookmark.name}” was not deleted`,
        );
      },
    };
    // Anyone else's: theirs to apply or copy, never to change (AC-293); a
    // Super-Admin's to delete too, where shared (T580, R61).
    if (!bookmark.mine)
      return [
        applying,
        {
          key: 'copy',
          label: 'Save a copy to mine…',
          onSelect: () => {
            setOpen(false);
            setSaid('');
            setAsking({ kind: 'save', state: bookmark.state, copyOf: bookmark.name });
          },
        },
        ...(bookmark.mayDelete ? [deleting] : []),
      ];
    return [
      applying,
      {
        key: 'update',
        label: 'Update',
        title: 'Keep what the dashboard shows now in it',
        onSelect: () => {
          act(
            bookmark,
            patch({ state: current }),
            `Updated the bookmark “${bookmark.name}”.`,
            `The bookmark “${bookmark.name}” was not updated`,
          );
        },
      },
      {
        key: 'rename',
        label: 'Rename…',
        onSelect: () => {
          setOpen(false);
          setSaid('');
          setAsking({ kind: 'rename', bookmark });
        },
      },
      bookmark.shared
        ? {
            key: 'unshare',
            label: 'Stop sharing',
            onSelect: () => {
              act(
                bookmark,
                patch({ shared: false }),
                `Stopped sharing the bookmark “${bookmark.name}”.`,
                `The bookmark “${bookmark.name}” is still shared`,
              );
            },
          }
        : {
            key: 'share',
            label: 'Share with everyone who can see this dashboard…',
            onSelect: () => {
              setOpen(false);
              setSaid('');
              setAsking({ kind: 'share', bookmark });
            },
          },
      deleting,
    ];
  };

  const section = (title: 'Mine' | 'Shared', rows: readonly Saved[]) =>
    rows.length === 0 ? null : (
      <Section title={title}>
        {rows.map((bookmark) => (
          <li key={bookmark.id} className="bookmarks__row">
            <button
              type="button"
              className="bookmarks__name"
              onClick={() => {
                apply(bookmark);
              }}
            >
              {bookmark.name}
            </button>
            <span className="bookmarks__visibility">
              {bookmark.shared ? <PeopleIcon /> : <PersonIcon />}
              {bookmark.savedBeforeSignIn === true
                ? 'Saved before sign-in'
                : !bookmark.shared
                  ? 'Only me'
                  : bookmark.mine || bookmark.sharedBy === undefined || bookmark.sharedBy === ''
                    ? 'Shared'
                    : `Shared by ${bookmark.sharedBy}`}
            </span>
            <MenuButton
              label={`Actions for ${bookmark.name}`}
              className="btn-ghost btn-sm bookmarks__actions"
              items={actionsOf(bookmark)}
            >
              <span aria-hidden="true">⋯</span>
            </MenuButton>
          </li>
        ))}
      </Section>
    );

  return (
    <span ref={box} className="dashboard__bookmarks">
      <button
        ref={trigger}
        type="button"
        className="btn dashboard__bookmarks-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          // Read again as it opens: another's shared since is listed, and one
          // unshared since isn't (T367's review). What was read shows meanwhile.
          if (!open) setReads((was) => was + 1);
          setOpen(!open);
        }}
      >
        Bookmarks <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-label="Bookmarks"
          tabIndex={-1}
          className="bookmarks"
        >
          {listed.kind === 'reading' ? <p className="bookmarks__note">Reading bookmarks…</p> : null}
          {listed.kind === 'failed' ? (
            <StateLine kind="err" className="bookmarks__note">
              {`Bookmarks could not be read: ${listed.why}`}
            </StateLine>
          ) : null}
          {listed.kind === 'read' && listed.bookmarks.length === 0 ? (
            <p className="bookmarks__note">No bookmarks yet</p>
          ) : null}
          {listed.kind === 'read' ? (
            <>
              {section(
                'Mine',
                listed.bookmarks.filter((each) => each.mine),
              )}
              {section(
                'Shared',
                listed.bookmarks.filter((each) => !each.mine),
              )}
            </>
          ) : null}
          <div className="bookmarks__foot">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                setOpen(false);
                setSaid('');
                // What the dashboard shows as it is chosen: the dialog is modal.
                setAsking({ kind: 'save', state: current });
              }}
            >
              Save bookmark…
            </button>
          </div>
        </div>
      ) : null}
      <span className="visually-hidden" role="status">
        {said}
      </span>
      {asking?.kind === 'save' ? (
        <NameDialog
          title={asking.copyOf === undefined ? 'Save a bookmark' : 'Save a copy to mine'}
          initial={asking.copyOf ?? ''}
          note={
            asking.copyOf === undefined
              ? `Keeps the page tab shown, the filters’ values and what is marked. ${REPLACES}`
              : `Keeps what “${asking.copyOf}” holds. ${REPLACES}`
          }
          failed="The bookmark was not saved"
          send={(name) =>
            fetch(urlOf(dashboardId), {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ name, state: asking.state }),
            })
          }
          onDone={(name) => {
            changed(`Saved the bookmark “${name}”.`);
            closeAll();
          }}
          onClose={closeAll}
        />
      ) : null}
      {asking?.kind === 'rename' ? (
        <NameDialog
          title="Rename the bookmark"
          initial={asking.bookmark.name}
          failed="The bookmark was not renamed"
          send={(name) => fetch(urlOf(dashboardId, asking.bookmark.id), patch({ name }))}
          onDone={(name) => {
            changed(`Renamed the bookmark “${asking.bookmark.name}” to “${name}”.`);
            closeAll();
          }}
          onClose={closeAll}
        />
      ) : null}
      {asking?.kind === 'share' ? (
        <ShareDialog
          name={asking.bookmark.name}
          send={() => fetch(urlOf(dashboardId, asking.bookmark.id), patch({ shared: true }))}
          onDone={() => {
            changed(`Shared the bookmark “${asking.bookmark.name}”.`);
            closeAll();
          }}
          onClose={closeAll}
        />
      ) : null}
    </span>
  );
}

/** Mine, or Shared: a heading and the list it names. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  const heading = useId();
  return (
    <section className="bookmarks__section">
      <h2 id={heading} className="bookmarks__heading">
        {title}
      </h2>
      <ul aria-labelledby={heading} className="bookmarks__list">
        {children}
      </ul>
    </section>
  );
}

type Run = { kind: 'idle' } | { kind: 'run' } | { kind: 'err'; text: string };

/** A modal dialog's frame: focus kept in, Escape closes it, as every dialog here (rule 85). */
function Modal({
  title,
  className,
  onClose,
  children,
}: {
  title: string;
  className: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const heading = useId();
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box);
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closing.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        className={`dialog ${className}`}
      >
        <h2 id={heading}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/**
 * A name asked for: Save bookmark…, Save a copy to mine… and Rename…. What
 * `send` answers is said in the dialog when it isn't done, and the dialog
 * kept open.
 */
function NameDialog({
  title,
  initial,
  note,
  failed,
  send,
  onDone,
  onClose,
}: {
  title: string;
  initial: string;
  note?: string;
  failed: string;
  send: (name: string) => Promise<Response>;
  onDone: (name: string) => void;
  onClose: () => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial);
  const [run, setRun] = useState<Run>({ kind: 'idle' });

  // Focus starts on the name.
  useEffect(() => {
    field.current?.focus();
  }, []);

  /**
   * Esc and Cancel close it, asking first where a name was typed (T405's
   * follow-up; rule 85); Esc over the question keeps editing.
   */
  const [asking, setAsking] = useState(false);
  const keepEditing = () => {
    setAsking(false);
    field.current?.focus();
  };
  const requestClose = () => {
    if (asking) keepEditing();
    else if (name !== initial) setAsking(true);
    else onClose();
  };

  const named = name.trim();
  const save = () => {
    if (named === '' || run.kind === 'run') return;
    setRun({ kind: 'run' });
    void send(named)
      .then(async (response) => {
        if (response.ok) {
          onDone(named);
          return;
        }
        setRun({ kind: 'err', text: `${failed}: ${await whyNot(response)}` });
      })
      .catch(() => {
        setRun({ kind: 'err', text: `${failed}: the server did not answer.` });
      });
  };

  const dialog = (
    <Modal title={title} className="save-bookmark" onClose={requestClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label className="save-bookmark__name">
          Name
          <input
            ref={field}
            type="text"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </label>
        {note === undefined ? null : <p className="save-bookmark__keeps">{note}</p>}
        {run.kind === 'run' ? <StateLine kind="run">Saving…</StateLine> : null}
        {run.kind === 'err' ? <StateLine kind="err">{run.text}</StateLine> : null}
        {/* The dialog pattern (T466, UX-106): Cancel beside the one primary. */}
        <div className="dialog__actions">
          <button type="button" onClick={requestClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={named === '' || run.kind === 'run'}
          >
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
  // The question beside the dialog, never in it, so the dialog's trap leaves
  // Tab to it (`DiscardQuestion`; T405's review).
  return (
    <>
      {dialog}
      {asking ? (
        <DiscardQuestion
          body="The name you typed isn’t kept."
          onKeep={keepEditing}
          onDiscard={onClose}
        />
      ) : null}
    </>
  );
}

/** Sharing asks first, saying who will see it (T367; design 10, state C). */
function ShareDialog({
  name,
  send,
  onDone,
  onClose,
}: {
  name: string;
  send: () => Promise<Response>;
  onDone: () => void;
  onClose: () => void;
}) {
  const [run, setRun] = useState<Run>({ kind: 'idle' });
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
  }, []);
  const share = () => {
    if (run.kind === 'run') return;
    setRun({ kind: 'run' });
    void send()
      .then(async (response) => {
        if (response.ok) {
          onDone();
          return;
        }
        setRun({ kind: 'err', text: `The bookmark was not shared: ${await whyNot(response)}` });
      })
      .catch(() => {
        setRun({ kind: 'err', text: 'The bookmark was not shared: the server did not answer.' });
      });
  };
  return (
    <Modal title={`Share “${name}”?`} className="share-bookmark" onClose={onClose}>
      <p className="share-bookmark__who">
        Everyone who can see this dashboard will see it under Shared, labelled with your name. You
        can stop sharing at any time.
      </p>
      {run.kind === 'run' ? <StateLine kind="run">Sharing…</StateLine> : null}
      {run.kind === 'err' ? <StateLine kind="err">{run.text}</StateLine> : null}
      <div className="dialog__actions">
        <button ref={cancel} type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn-primary" disabled={run.kind === 'run'} onClick={share}>
          Share
        </button>
      </div>
    </Modal>
  );
}
