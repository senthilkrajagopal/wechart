import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { ExportedToast } from '../../../dashboard/export/ExportedToast';
import { UndoToast } from '../../../dashboard/edit/UndoToast';
import { StatusIcon } from '../../../shell/StatusIcon';
import { GroupCombobox, type AccessLevel } from './GroupCombobox';
import { GroupRow, type ListName } from './GroupRow';

/**
 * A folder's Access panel (T330; direction.md §7e, rules 62–66), docked right
 * of Explore for a Super-Admin or a read-write member of the folder, drawn as
 * the 2026-09-27 design 07 draws it (T473, AC-343).
 *
 * - AC-259: any number of read-only and read-write AD groups, each setting
 *   optional, never a person.
 * - AC-260: an unset setting takes the parent's; every inherited group is
 *   shown with the folder that sets it.
 *
 * Changes wait for Save, which counts them, and a save that takes away the
 * editor's own read-write access asks first (rule 65). Cancel, × and Escape
 * ask first when there are changes (rule 85).
 */
export interface Grant {
  readonly group: string;
  readonly from: string;
  readonly setHere: boolean;
}

export interface AccessSetting {
  readonly readOnly: readonly string[] | null;
  readonly readWrite: readonly string[] | null;
}

/** `GET /api/folders/:id/access` (routes/access.ts). */
export interface AccessAnswer {
  readonly folderId: string;
  readonly setting: AccessSetting;
  readonly effective: Grants;
  /** What the ancestors give on their own: a group set here too is still in it. */
  readonly inherited: Grants;
  readonly onlySuperAdmins: boolean;
}

interface Grants {
  readonly readOnly: readonly Grant[];
  readonly readWrite: readonly Grant[];
}

export interface AccessPanelProps {
  readonly id?: string;
  readonly folderId: string;
  /** The folder by its path below its root, "Sales / EMEA", or a root by its name (pin 2). */
  readonly folderPath: string;
  /** The folder an unset setting inherits from; none for a root. */
  readonly parent: { readonly id: string; readonly title: string } | undefined;
  readonly titleOf: (folderId: string) => string;
  /** A folder's path, as `folderPath` says this one's: where a suggested group is used. */
  readonly pathOf: (folderId: string) => string;
  /** The signed-in user's groups and role, to warn before they lock themselves out. */
  readonly myGroups: readonly string[];
  readonly superAdmin: boolean;
  readonly onOpenFolder: (folderId: string) => void;
  readonly onClose: () => void;
}

type Draft = Record<AccessLevel, string[]>;

const LEVELS: readonly {
  level: AccessLevel;
  heading: string;
  name: ListName;
  help: string;
}[] = [
  // Read-write first (rule 62), each with what its level allows (pin 3).
  {
    level: 'readWrite',
    heading: 'Read-write groups',
    name: 'read-write',
    // Design 16's state J rewording of design 07's line (R56, AC-399).
    help: 'Propose changes, create subfolders, set access, and build and schedule this folder’s pre-aggregations. They also see every folder above, view-only, but not its pre-aggregations in Jobs.',
  },
  {
    level: 'readOnly',
    heading: 'Read-only groups',
    name: 'read-only',
    help: 'See dashboards here, in every folder below and in every folder above. Nothing else.',
  },
];

const accessUrl = (folderId: string) => `/api/folders/${encodeURIComponent(folderId)}/access`;

/**
 * A folder's access, not given: its status says why. 403 is a user who sees
 * the folder but may not change it, a reader (rule 68), which Explore's
 * access chip says as View only (T331, rule 69); 404 one who can't see it.
 */
export class AccessRefused extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function answered(response: Response): Promise<AccessAnswer> {
  const body = (await response.json().catch(() => null)) as
    (AccessAnswer & { error?: unknown }) | null;
  if (!response.ok) {
    throw new AccessRefused(
      typeof body?.error === 'string'
        ? body.error
        : `Could not read this folder's access (${String(response.status)}).`,
      response.status,
    );
  }
  return body as AccessAnswer;
}

/** Refused as no longer the editor's to change, or to see (design 07, state G). */
const lostBy = (error: unknown) =>
  error instanceof AccessRefused && (error.status === 403 || error.status === 404);

/**
 * A folder's access, as Explore asks it too: answered only to a Super-Admin
 * or a read-write member of the folder, so its answering is what shows the
 * Access button (rule 68).
 */
export const folderAccessQuery = (folderId: string) => ({
  queryKey: ['folder-access', folderId],
  queryFn: async () => answered(await fetch(accessUrl(folderId))),
});

/** The groups set on folders the editor may see, and on which, for the picker (rule 64). */
const KNOWN_GROUPS_QUERY = {
  queryKey: ['folder-access-known-groups'],
  queryFn: async (): Promise<Record<string, readonly string[]>> => {
    const response = await fetch('/api/access/known-groups');
    if (!response.ok) return {};
    const known = (await response.json()) as {
      groups: string[];
      usedOn?: Record<string, string[]>;
    };
    return Object.fromEntries(known.groups.map((group) => [group, known.usedOn?.[group] ?? []]));
  },
};

/** After a change to any folder's groups or place: what each folder inherits may have moved. */
export const refreshFolderAccess = (client: QueryClient) =>
  Promise.all([
    client.invalidateQueries({ queryKey: ['folder-access'] }),
    client.invalidateQueries({ queryKey: KNOWN_GROUPS_QUERY.queryKey }),
  ]);

const draftOf = (setting: AccessSetting): Draft => ({
  readWrite: [...(setting.readWrite ?? [])],
  readOnly: [...(setting.readOnly ?? [])],
});

/** How many groups were added or removed, over both settings. */
function changesBetween(stored: Draft, draft: Draft): number {
  let count = 0;
  for (const { level } of LEVELS) {
    const before = new Set(stored[level]);
    const after = new Set(draft[level]);
    for (const group of after) if (!before.has(group)) count += 1;
    for (const group of before) if (!after.has(group)) count += 1;
  }
  return count;
}

/** An empty list is saved as unset: inheriting adds the same groups either way. */
const settingOf = (draft: Draft): AccessSetting => ({
  readOnly: draft.readOnly.length > 0 ? draft.readOnly : null,
  readWrite: draft.readWrite.length > 0 ? draft.readWrite : null,
});

const changesText = (count: number) => `${String(count)} change${count === 1 ? '' : 's'}`;

/** "a", "a and b", "a, b and c": the groups a removal names. */
function namesOf(groups: readonly string[]): ReactNode {
  return groups.map((group, at) => (
    <span key={group}>
      {at === 0 ? '' : at === groups.length - 1 ? ' and ' : ', '}
      <code>{group}</code>
    </span>
  ));
}

/** A question put in the panel, anchored above its foot: Cancel's or Save's. */
type Asking =
  | { readonly kind: 'lockout'; readonly mine: readonly string[] }
  | { readonly kind: 'discard'; readonly back: HTMLElement | null };

/** A save done: its toast, and the setting its Undo puts back, where it may (state E). */
interface Saved {
  readonly message: string;
  readonly undo: AccessSetting | undefined;
}

export function AccessPanel({
  id,
  folderId,
  folderPath,
  parent,
  titleOf,
  pathOf,
  myGroups,
  superAdmin,
  onOpenFolder,
  onClose,
}: AccessPanelProps) {
  const client = useQueryClient();
  const access = useQuery(folderAccessQuery(folderId));
  /** Pending changes, to the answer they were made on: a fresh answer, first or after a save, starts afresh. */
  const [edit, setEdit] = useState<{ base: AccessAnswer; draft: Draft } | undefined>();
  const [asking, setAsking] = useState<Asking | null>(null);
  /** The list whose Add group is open, as its combobox (pin 7). */
  const [adding, setAdding] = useState<AccessLevel | null>(null);
  const [saved, setSaved] = useState<Saved | undefined>();
  const headingId = useId();
  const known = useQuery(KNOWN_GROUPS_QUERY);
  const panelRef = useRef<HTMLElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const askRef = useRef<HTMLButtonElement>(null);
  /** The list whose Add group takes focus as its box gives way to it. */
  const refocusAdd = useRef<AccessLevel | null>(null);
  /** The open AD group box. */
  const boxRef = useRef<HTMLInputElement>(null);

  // It follows the tree's selection (pin 2): what was asked, opened, changed
  // or saved for the folder before is not this one's, and isn't brought back
  // on returning there (T473's review). Adjusted as it renders.
  const [shownFor, setShownFor] = useState(folderId);
  if (shownFor !== folderId) {
    setShownFor(folderId);
    setEdit(undefined);
    setAsking(null);
    setAdding(null);
    setSaved(undefined);
  }

  const save = useMutation({
    mutationFn: async ({ folder, setting }: { folder: string; setting: AccessSetting }) =>
      answered(
        await fetch(accessUrl(folder), {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(setting),
        }),
      ),
    onSuccess: (answer, { folder }) => {
      client.setQueryData(folderAccessQuery(folder).queryKey, answer);
      // What a folder shows depends on its groups: listings and counts too,
      // and what the folders beneath inherit.
      void client.invalidateQueries({ queryKey: ['folders'] });
      void refreshFolderAccess(client);
    },
  });
  /** The last save, if it was this folder's. */
  const saving = save.variables?.folder === folderId ? save : undefined;

  // Focus follows the panel as it opens.
  useEffect(() => panelRef.current?.focus(), []);
  // The question takes focus on its safe answer: Cancel, or Keep editing.
  useEffect(() => {
    if (asking !== null) askRef.current?.focus();
  }, [asking]);

  const data = access.data;
  const lost = data !== undefined && (lostBy(saving?.error) || lostBy(access.error));
  const stored = data === undefined ? undefined : draftOf(data.setting);
  const draft = !lost && edit !== undefined && edit.base === data ? edit.draft : stored;
  const setDraft = (next: Draft) => {
    if (data !== undefined) setEdit({ base: data, draft: next });
  };
  const changes = stored === undefined || draft === undefined ? 0 : changesBetween(stored, draft);

  const mine = new Set(myGroups);
  /** The editor's own read-write groups this save takes out of the list. */
  const myRemovals =
    stored === undefined || draft === undefined
      ? []
      : stored.readWrite.filter((group) => mine.has(group) && !draft.readWrite.includes(group));
  /**
   * Whether this save would take away the editor's own read-write access
   * here: they have it through a group now, and neither the pending setting
   * nor an ancestor would still give it (rule 65).
   */
  const losesOwnWrite =
    !superAdmin &&
    data !== undefined &&
    draft !== undefined &&
    data.effective.readWrite.some((grant) => mine.has(grant.group)) &&
    ![...draft.readWrite, ...data.inherited.readWrite.map((grant) => grant.group)].some((group) =>
      mine.has(group),
    );

  const commit = () => {
    if (draft === undefined || data === undefined) return;
    const message = `Access saved for ${folderPath} · ${changesText(changes)}`;
    // Undoing a save that took away the editor's own access would be refused.
    const undo = losesOwnWrite ? undefined : data.setting;
    setAsking(null);
    // What was being added is in the save: its box gives way to Add group.
    setAdding(null);
    setSaved(undefined);
    save.mutate(
      { folder: folderId, setting: settingOf(draft) },
      { onSuccess: () => setSaved({ message, undo }) },
    );
  };

  /** Save, and Retry after a failed one: asking first where it takes away the editor's own access (rule 65). */
  const saveAsked = () => {
    if (losesOwnWrite) setAsking({ kind: 'lockout', mine: myRemovals });
    else commit();
  };

  /** Close, asking first when there are changes (rule 85). */
  const close = (back: HTMLElement | null) => {
    if (changes > 0 && !lost) setAsking({ kind: 'discard', back });
    else onClose();
  };
  /** The question answered with its safe answer: back where it was asked from. */
  const keepEditing = () => {
    const back = asking?.kind === 'discard' ? asking.back : saveRef.current;
    setAsking(null);
    (back ?? panelRef.current)?.focus();
  };

  /**
   * Escape in the panel: the question's safe answer, or close (rule 85).
   * Heard on the document, after React has handed the combobox its own
   * Escapes, which go no further; subscribed afresh each render, so it acts
   * on what is shown.
   */
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const panel = panelRef.current;
      if (event.key !== 'Escape' || event.defaultPrevented || panel === null) return;
      if (!(event.target instanceof Node) || !panel.contains(event.target)) return;
      event.preventDefault();
      if (asking !== null) keepEditing();
      else close(event.target instanceof HTMLElement ? event.target : null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  /** A level's draft, with a group taken out, put back or added. */
  const change = (level: AccessLevel, group: string, how: 'remove' | 'keep' | 'add') => {
    if (draft === undefined || stored === undefined) return;
    const list = draft[level];
    if (how === 'remove') {
      setDraft({ ...draft, [level]: list.filter((each) => each !== group) });
      // An addition taken back goes, row and all: focus stays in its list,
      // on its open box or its Add group (T473's review; rule 85).
      if (!stored[level].includes(group)) {
        if (adding === level) boxRef.current?.focus();
        else refocusAdd.current = level;
      }
      return;
    }
    if (list.includes(group)) return;
    // A stored group comes back to its place; a new one goes last.
    const back = stored[level].includes(group);
    setDraft({
      ...draft,
      [level]: back
        ? [
            ...stored[level].filter((each) => each === group || list.includes(each)),
            ...list.filter((each) => !stored[level].includes(each)),
          ]
        : [...list, group],
    });
  };

  const used = Object.entries(known.data ?? {}).map(([group, folders]) => ({
    group,
    where:
      folders.length === 0
        ? ''
        : `${pathOf(folders[0]!)}${folders.length > 1 ? ` +${String(folders.length - 1)}` : ''}`,
  }));

  const failure =
    saving !== undefined && saving.isError && !lost ? (
      <div className="access-panel__band access-panel__band--err" role="alert">
        <StatusIcon kind="err" />
        <span>
          {changes === 0
            ? 'Couldn’t save.'
            : `Couldn’t save. Your ${changesText(changes)} ${changes === 1 ? 'is' : 'are'} kept.`}
        </span>
        <button
          type="button"
          className="access-panel__link"
          onClick={() => {
            if (changes > 0) saveAsked();
            else save.mutate(saving.variables);
          }}
        >
          Retry
        </button>
        <details>
          <summary>Details</summary>
          <p>{saving.error.message}</p>
        </details>
      </div>
    ) : null;

  return (
    <aside
      id={id}
      className="access-panel"
      aria-labelledby={`${headingId} ${headingId}-path`}
      ref={panelRef}
      tabIndex={-1}
    >
      <div className="access-panel__head">
        <h2 id={headingId}>Access</h2>
        <span id={`${headingId}-path`} className="access-panel__folder">
          {folderPath}
        </span>
        <button
          type="button"
          className="access-panel__close"
          aria-label="Close access"
          onClick={(event) => close(event.currentTarget)}
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      </div>
      {access.isPending ? (
        <ul className="access-panel__loading" aria-busy="true" aria-label="Loading access">
          {[0, 1, 2, 3].map((each) => (
            <li key={each} aria-hidden="true" />
          ))}
        </ul>
      ) : null}
      {data === undefined && access.isError ? (
        <div className="access-panel__body">
          <div className="access-panel__band access-panel__band--err" role="alert">
            <StatusIcon kind="err" />
            <span>Couldn’t load access for this folder.</span>
            <button
              type="button"
              className="access-panel__link"
              onClick={() => {
                void access.refetch();
              }}
            >
              Retry
            </button>
            <details>
              <summary>Details</summary>
              <p>{access.error.message}</p>
            </details>
          </div>
        </div>
      ) : null}
      {data !== undefined && draft !== undefined && stored !== undefined ? (
        <>
          <div className="access-panel__body">
            {lost ? (
              <div className="access-panel__band access-panel__band--warn" role="status">
                <StatusIcon kind="warn" />
                <span>You can no longer change access here. The lists below are read-only.</span>
              </div>
            ) : null}
            {failure}
            {/* Said until a group is saved: a pending one reaches nobody yet. */}
            {data.onlySuperAdmins ? (
              // State C (rule 63, AC-267): the header's lock chip, said here too.
              <div className="access-panel__band access-panel__band--warn" role="note">
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <rect x="3" y="7" width="10" height="7" rx="1.5" />
                  <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
                </svg>
                <span>
                  <strong>Only Super-Admins can see this folder.</strong> Add a group to either list
                  to give people access.
                </span>
              </div>
            ) : null}
            {LEVELS.map(({ level, heading, name, help }) => {
              const sectionId = `${headingId}-${level}`;
              const inherited = data.inherited[level];
              const list = draft[level];
              const rows = [
                ...stored[level].map((group) => ({
                  group,
                  pending: list.includes(group) ? undefined : ('removing' as const),
                })),
                ...list
                  .filter((group) => !stored[level].includes(group))
                  .map((group) => ({ group, pending: 'adding' as const })),
              ];
              const nothing = rows.length === 0 && inherited.length === 0;
              const add = lost ? null : adding === level ? (
                <GroupCombobox
                  inputRef={boxRef}
                  mine={myGroups}
                  used={used}
                  taken={new Set(list)}
                  onAdd={(group) => change(level, group, 'add')}
                  onClose={() => {
                    setAdding(null);
                    refocusAdd.current = level;
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="access-panel__link access-panel__add"
                  ref={(button) => {
                    // Back from its box, closed from it.
                    if (button === null || refocusAdd.current !== level) return;
                    refocusAdd.current = null;
                    button.focus();
                  }}
                  onClick={() => setAdding(level)}
                >
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                  Add group
                </button>
              );
              return (
                <section key={level} className="access-panel__level" aria-labelledby={sectionId}>
                  <h3 id={sectionId}>{heading}</h3>
                  <p className="access-panel__help" data-testid="access-help">
                    {help}
                  </p>
                  {nothing ? (
                    // State C: nothing set here or above.
                    <p className="access-panel__unset">
                      Not set here, and no folder above sets any.
                    </p>
                  ) : (
                    <>
                      <h4>Set here</h4>
                      {rows.length === 0 ? (
                        <p className="access-panel__unset">
                          {parent === undefined ? (
                            'Not set here.'
                          ) : (
                            <>
                              Not set here. Inherits from{' '}
                              <button
                                type="button"
                                className="access-panel__link"
                                onClick={() => onOpenFolder(parent.id)}
                              >
                                {parent.title}
                              </button>
                              .
                            </>
                          )}
                        </p>
                      ) : (
                        <ul className="access-panel__list">
                          {rows.map(({ group, pending }) => {
                            const outranking =
                              level === 'readOnly'
                                ? data.inherited.readWrite.find((grant) => grant.group === group)
                                : undefined;
                            return (
                              <GroupRow
                                key={group}
                                group={group}
                                listName={name}
                                pending={pending}
                                onRemove={lost ? undefined : () => change(level, group, 'remove')}
                                onKeep={lost ? undefined : () => change(level, group, 'keep')}
                                outrankedBy={
                                  outranking === undefined
                                    ? undefined
                                    : {
                                        title: titleOf(outranking.from),
                                        onOpen: () => onOpenFolder(outranking.from),
                                      }
                                }
                              />
                            );
                          })}
                        </ul>
                      )}
                    </>
                  )}
                  {add}
                  {inherited.length === 0 ? null : (
                    <>
                      <h4>From ancestors</h4>
                      <ul className="access-panel__list">
                        {inherited.map((grant) => (
                          <GroupRow
                            key={`${grant.group}-${grant.from}`}
                            group={grant.group}
                            source={{
                              title: titleOf(grant.from),
                              onOpen: () => onOpenFolder(grant.from),
                            }}
                          />
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              );
            })}
          </div>
          {lost ? null : (
            <div className="access-panel__foot">
              {asking === null ? null : (
                // Anchored above Save, focus on its safe answer. The lockout
                // question is state D's; the discard question is rule 85's.
                <div
                  className="access-panel__ask"
                  role="alertdialog"
                  aria-labelledby={`${headingId}-ask`}
                  aria-describedby={`${headingId}-ask-body`}
                >
                  {asking.kind === 'lockout' ? (
                    <>
                      <p id={`${headingId}-ask`} className="access-panel__ask-title">
                        You’ll lose read-write access to {folderPath}.
                      </p>
                      <p id={`${headingId}-ask-body`}>
                        Removing {namesOf(asking.mine)} leaves you with none of this folder’s
                        read-write groups. Save anyway?
                      </p>
                    </>
                  ) : (
                    <>
                      <p id={`${headingId}-ask`} className="access-panel__ask-title">
                        Discard your changes?
                      </p>
                      <p id={`${headingId}-ask-body`}>
                        Your {changesText(changes)} to the access of {folderPath}{' '}
                        {changes === 1 ? 'isn’t' : 'aren’t'} saved.
                      </p>
                    </>
                  )}
                  <div className="access-panel__acts">
                    <button type="button" className="btn" ref={askRef} onClick={keepEditing}>
                      {asking.kind === 'lockout' ? 'Cancel' : 'Keep editing'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={asking.kind === 'lockout' ? commit : onClose}
                    >
                      {asking.kind === 'lockout' ? 'Save anyway' : 'Discard changes'}
                    </button>
                  </div>
                </div>
              )}
              <p>Changes apply when saved, and every one is recorded in the audit trail.</p>
              <div className="access-panel__acts">
                <button
                  type="button"
                  className="btn"
                  onClick={(event) => close(event.currentTarget)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  ref={saveRef}
                  disabled={changes === 0 || save.isPending}
                  onClick={saveAsked}
                >
                  {changes === 0 ? 'Save' : `Save ${changesText(changes)}`}
                </button>
              </div>
            </div>
          )}
        </>
      ) : null}
      {saved === undefined ? null : saved.undo === undefined ? (
        <ExportedToast message={saved.message} onDismiss={() => setSaved(undefined)} />
      ) : (
        <UndoToast
          message={saved.message}
          onDismiss={() => setSaved(undefined)}
          onUndo={() => {
            const previous = saved.undo;
            setSaved(undefined);
            if (previous !== undefined) save.mutate({ folder: folderId, setting: previous });
          }}
        />
      )}
    </aside>
  );
}
