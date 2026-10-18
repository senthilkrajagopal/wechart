import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { TOAST_MS, UndoToast } from '../../dashboard/edit/UndoToast';
import { MenuButton } from '../../shell/MenuButton';
import { PersonIcon } from '../explore/WorkspaceBand';
import { useFocusTrap } from '../../shell/useFocusTrap';
import { useEscape } from './CloseTabDialog';
import type { ParamType } from './parameterNames';
import { placeOf, type SqlSourceRow } from './sources';

/** A saved query, as its owner reads it back (T812, T813). */
export interface SavedQuery {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sourceId: string;
  readonly sql: string;
  readonly parameters: readonly { readonly name: string; readonly type: ParamType; readonly value: string }[];
}

/** The user's own saved queries, by name (`GET /api/sql/saved`, T813). */
export const SAVED_QUERIES = {
  queryKey: ['sql-saved'] as const,
  queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<SavedQuery[]> => {
    const response = await fetch('/api/sql/saved', signal === undefined ? {} : { signal });
    const said = (await response.json().catch(() => ({}))) as { queries?: SavedQuery[]; error?: unknown };
    if (!response.ok || !Array.isArray(said.queries))
      throw new Error(
        typeof said.error === 'string'
          ? said.error
          : `Your saved queries could not be read (${String(response.status)}).`,
      );
    return said.queries;
  },
};

/** What a save sends: everything but its id. */
const bodyOf = (query: SavedQuery) => ({
  name: query.name,
  description: query.description,
  sourceId: query.sourceId,
  sql: query.sql,
  parameters: query.parameters,
});

/** The API's words for a refusal, or a sentence of our own. */
async function refusalOf(response: Response, doing: string): Promise<string> {
  const said = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof said?.error === 'string' ? said.error : `It couldn’t be ${doing} (${String(response.status)}).`;
}
const NO_ANSWER = 'No answer came back, so whether it was done isn’t known. Try again.';

/** "‹name› (copy)", or the first "(copy n)" none of `taken` has (Duplicate). */
export function copyName(name: string, taken: readonly string[]): string {
  const held = new Set(taken);
  if (!held.has(`${name} (copy)`)) return `${name} (copy)`;
  let n = 2;
  while (held.has(`${name} (copy ${String(n)})`)) n += 1;
  return `${name} (copy ${String(n)})`;
}

/**
 * The Saved tab (T813, AC-458; design 17, I1, I3): the user's own saved
 * queries by name, each with its data source and "Only me" as an icon and a
 * label, and Open, Rename…, Duplicate and Delete on its ⋯. Delete says so
 * in a toast whose Undo brings the query back under its own id. A source the
 * user can no longer run SQL on is never named (AC-459's rule).
 */
export function SavedList({
  sourceOf,
  onOpen,
  onRenamed,
  toastMs = TOAST_MS,
}: {
  /** A source the user may run SQL on, by its id; undefined where they may not. */
  readonly sourceOf: (id: string) => SqlSourceRow | undefined;
  readonly onOpen: (query: SavedQuery) => void;
  /** Renamed: the workspace's tabs holding it take the name, so their Save keeps it. */
  readonly onRenamed: (id: string, name: string) => void;
  /** How long the toast stays; zero leaves it up, for tests. */
  readonly toastMs?: number;
}) {
  const queryClient = useQueryClient();
  const saved = useQuery({ ...SAVED_QUERIES, retry: false });
  const [renaming, setRenaming] = useState<SavedQuery | null>(null);
  const [deleted, setDeleted] = useState<SavedQuery | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const again = () => queryClient.invalidateQueries({ queryKey: SAVED_QUERIES.queryKey });

  const ask = async (url: string, init: RequestInit): Promise<Response | null> => {
    setFailed(null);
    try {
      // A JSON type only with a body: the server refuses one declared and empty.
      return await fetch(
        url,
        init.body === undefined ? init : { ...init, headers: { 'content-type': 'application/json' } },
      );
    } catch {
      setFailed(NO_ANSWER);
      return null;
    }
  };
  const remove = async (query: SavedQuery) => {
    const response = await ask(`/api/sql/saved/${encodeURIComponent(query.id)}`, { method: 'DELETE' });
    if (response === null) return;
    if (!response.ok) setFailed(await refusalOf(response, 'deleted'));
    // As the API kept it, to bring back whole.
    else setDeleted((await response.json()) as SavedQuery);
    await again();
  };
  const undo = async () => {
    const query = deleted;
    setDeleted(null);
    if (query === null) return;
    const response = await ask('/api/sql/saved', {
      method: 'POST',
      body: JSON.stringify({ id: query.id, ...bodyOf(query) }),
    });
    if (response !== null && !response.ok) setFailed(await refusalOf(response, 'brought back'));
    await again();
  };
  const duplicate = async (query: SavedQuery) => {
    const name = copyName(query.name, (saved.data ?? []).map((each) => each.name));
    const response = await ask('/api/sql/saved', {
      method: 'POST',
      body: JSON.stringify({ ...bodyOf(query), name }),
    });
    if (response !== null && !response.ok) setFailed(await refusalOf(response, 'duplicated'));
    await again();
  };
  /** Renamed: null once done, or the refusal's reason, said in the dialog. */
  const rename = async (query: SavedQuery, name: string): Promise<string | null> => {
    let response: Response;
    try {
      response = await fetch(`/api/sql/saved/${encodeURIComponent(query.id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...bodyOf(query), name }),
      });
    } catch {
      return NO_ANSWER;
    }
    if (!response.ok) return refusalOf(response, 'renamed');
    onRenamed(query.id, name.trim());
    await again();
    return null;
  };

  const rows = saved.data;
  return (
    <div className="sql-saved">
      {saved.isError ? (
        <p className="sql-saved__note" role="alert">
          {saved.error.message}
        </p>
      ) : rows === undefined ? null : rows.length === 0 ? (
        <p className="sql-saved__note">No saved queries. Save… keeps a query here; only you can see it.</p>
      ) : (
        <>
          <p className="sql-saved__note">Only me · by name</p>
          <ul className="sql-saved__list" aria-label="Saved queries">
            {rows.map((query) => {
              const source = sourceOf(query.sourceId);
              const count = query.parameters.length;
              return (
                <li key={query.id} className="sql-saved__row">
                  <div className="sql-saved__text">
                    <button
                      type="button"
                      className="sql-saved__name"
                      onClick={() => {
                        onOpen(query);
                      }}
                    >
                      {query.name}
                    </button>
                    <span className="sql-saved__source">
                      {source === undefined
                        ? 'A data source no longer available to you'
                        : `${source.name} · ${placeOf(source)}`}
                    </span>
                    <span className="sql-saved__meta">
                      <span className="sql-saved__only">
                        <PersonIcon />
                        Only me
                      </span>
                      {count === 0 ? null : (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span>{`${String(count)} parameter${count === 1 ? '' : 's'}`}</span>
                        </>
                      )}
                    </span>
                  </div>
                  <MenuButton
                    label={`Actions for ${query.name}`}
                    className="sql-saved__more"
                    items={[
                      {
                        key: 'open',
                        label: 'Open',
                        onSelect: () => {
                          onOpen(query);
                        },
                      },
                      {
                        key: 'rename',
                        label: 'Rename…',
                        onSelect: () => {
                          setRenaming(query);
                        },
                      },
                      {
                        key: 'duplicate',
                        label: 'Duplicate',
                        onSelect: () => void duplicate(query),
                      },
                      {
                        key: 'delete',
                        label: 'Delete',
                        danger: true,
                        onSelect: () => void remove(query),
                      },
                    ]}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                      <circle cx="3.5" cy="8" r="1.3" fill="currentColor" />
                      <circle cx="8" cy="8" r="1.3" fill="currentColor" />
                      <circle cx="12.5" cy="8" r="1.3" fill="currentColor" />
                    </svg>
                  </MenuButton>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {failed === null ? null : (
        <p className="sql-saved__note sql-saved__failed" role="alert">
          {failed}
        </p>
      )}
      {renaming === null ? null : (
        <RenameSaved
          name={renaming.name}
          onCancel={() => {
            setRenaming(null);
          }}
          onRename={async (name) => {
            const reason = await rename(renaming, name);
            if (reason === null) setRenaming(null);
            return reason;
          }}
        />
      )}
      <UndoToast
        message={deleted === null ? '' : `Deleted “${deleted.name}”.`}
        onUndo={() => void undo()}
        onDismiss={() => {
          setDeleted(null);
        }}
        afterMs={toastMs}
      />
    </div>
  );
}

/**
 * Rename… a saved query (T813; I1): its name, focus in it, the API's refusal
 * said under it with the dialog kept open, as Save… does (AC-483). Esc and
 * Cancel keep the old name.
 */
function RenameSaved({
  name,
  onCancel,
  onRename,
}: {
  readonly name: string;
  readonly onCancel: () => void;
  /** Renames it: null once done, or the refusal's reason. */
  readonly onRename: (name: string) => Promise<string | null>;
}) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState(name);
  const [refused, setRefused] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  useFocusTrap(box);
  useEscape(onCancel);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const blank = typed.trim() === '';
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (blank || renaming) return;
    setRenaming(true);
    const reason = await onRename(typed);
    setRenaming(false);
    setRefused(reason);
    if (reason !== null) field.current?.focus();
  };
  return (
    <div className="dialog-backdrop">
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={`${ids}-title`} className="dialog">
        <h2 id={`${ids}-title`}>Rename {name}</h2>
        <form className="sql-rename" onSubmit={(event) => void submit(event)}>
          <label className="sql-rename__name">
            Name
            <input
              ref={field}
              type="text"
              value={typed}
              aria-invalid={refused !== null}
              aria-describedby={refused === null ? undefined : `${ids}-refused`}
              onChange={(event) => {
                setTyped(event.target.value);
              }}
            />
          </label>
          {refused === null ? null : (
            <p id={`${ids}-refused`} className="sql-save__refused">
              {refused}
            </p>
          )}
          <div className="dialog__actions">
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={blank || renaming}>
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
