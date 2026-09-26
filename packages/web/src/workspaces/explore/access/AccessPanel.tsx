import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';

import { StateLine } from '../../../shell/StatusIcon';
import { GroupCombobox, type AccessLevel } from './GroupCombobox';
import { GroupRow } from './GroupRow';

/**
 * A folder's Access panel (T330; direction.md §7e, rules 62–66), docked right
 * of Explore for a Super-Admin or a read-write member of the folder.
 *
 * - AC-259: any number of read-only and read-write AD groups, each setting
 *   optional, never a person.
 * - AC-260: an unset setting takes the parent's; every inherited group is
 *   shown with the folder that sets it.
 *
 * Changes wait for Save, which counts them, and a save that takes away the
 * editor's own read-write access asks first (rule 65).
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
  readonly folderTitle: string;
  /** The folder an unset setting inherits from; none for the shared root. */
  readonly parentTitle: string | undefined;
  readonly titleOf: (folderId: string) => string;
  /** The signed-in user's groups and role, to warn before they lock themselves out. */
  readonly myGroups: readonly string[];
  readonly superAdmin: boolean;
  readonly onOpenFolder: (folderId: string) => void;
  readonly onClose: () => void;
}

type Draft = Record<AccessLevel, string[]>;

const LEVELS: readonly { level: AccessLevel; heading: string }[] = [
  // Read-write first (rule 62).
  { level: 'readWrite', heading: 'Read-write groups' },
  { level: 'readOnly', heading: 'Read-only groups' },
];

const accessUrl = (folderId: string) => `/api/folders/${encodeURIComponent(folderId)}/access`;

async function answered(response: Response): Promise<AccessAnswer> {
  const body = (await response.json().catch(() => null)) as
    (AccessAnswer & { error?: unknown }) | null;
  if (!response.ok) {
    throw new Error(
      typeof body?.error === 'string'
        ? body.error
        : `Could not read this folder's access (${String(response.status)}).`,
    );
  }
  return body as AccessAnswer;
}

/**
 * A folder's access, as Explore asks it too: answered only to a Super-Admin
 * or a read-write member of the folder, so its answering is what shows the
 * Access button (rule 68).
 */
export const folderAccessQuery = (folderId: string) => ({
  queryKey: ['folder-access', folderId],
  queryFn: async () => answered(await fetch(accessUrl(folderId))),
});

/** The groups set on folders the editor may see, for the picker (rule 64). */
const KNOWN_GROUPS_QUERY = {
  queryKey: ['folder-access-known-groups'],
  queryFn: async () => {
    const response = await fetch('/api/access/known-groups');
    if (!response.ok) return [];
    return ((await response.json()) as { groups: string[] }).groups;
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

export function AccessPanel({
  id,
  folderId,
  folderTitle,
  parentTitle,
  titleOf,
  myGroups,
  superAdmin,
  onOpenFolder,
  onClose,
}: AccessPanelProps) {
  const client = useQueryClient();
  const { queryKey } = folderAccessQuery(folderId);
  const access = useQuery(folderAccessQuery(folderId));
  /** Pending changes, to the answer they were made on: a fresh answer, first or after a save, starts afresh. */
  const [edit, setEdit] = useState<{ base: AccessAnswer; draft: Draft } | undefined>();
  const [asking, setAsking] = useState(false);
  /** The setting before the last save, for its Undo (rule 65). */
  const [undo, setUndo] = useState<AccessSetting | undefined>();
  const headingId = useId();
  const known = useQuery(KNOWN_GROUPS_QUERY);
  const panelRef = useRef<HTMLElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  // Focus follows the panel as it opens, and the ask as it's put.
  useEffect(() => panelRef.current?.focus(), []);
  useEffect(() => {
    if (!asking) return undefined;
    keepRef.current?.focus();
    // Escape keeps the editor's access, as Keep does.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setAsking(false);
      saveRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [asking]);

  const save = useMutation({
    mutationFn: async (setting: AccessSetting) =>
      answered(
        await fetch(accessUrl(folderId), {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(setting),
        }),
      ),
    onSuccess: (saved) => {
      client.setQueryData(queryKey, saved);
      // What a folder shows depends on its groups: listings and counts too,
      // and what the folders beneath inherit.
      void client.invalidateQueries({ queryKey: ['folders'] });
      void refreshFolderAccess(client);
    },
  });

  const data = access.data;
  const stored = data === undefined ? undefined : draftOf(data.setting);
  const draft = edit !== undefined && edit.base === data ? edit.draft : stored;
  const setDraft = (next: Draft) => {
    if (data !== undefined) setEdit({ base: data, draft: next });
  };
  const changes = stored === undefined || draft === undefined ? 0 : changesBetween(stored, draft);

  const mine = new Set(myGroups);
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
    setAsking(false);
    // Undoing a save that took away the editor's own access would be refused.
    setUndo(losesOwnWrite ? undefined : data.setting);
    save.mutate(settingOf(draft));
  };
  const keep = () => {
    setAsking(false);
    saveRef.current?.focus();
  };

  const suggestions = [...new Set([...myGroups, ...(known.data ?? [])])].sort();

  return (
    <aside
      id={id}
      className="access-panel"
      aria-labelledby={headingId}
      ref={panelRef}
      tabIndex={-1}
    >
      <div className="access-panel__head">
        <h2 id={headingId}>Folder access</h2>
        <span className="access-panel__folder">{folderTitle}</span>
        <button
          type="button"
          className="btn-ghost btn-sm"
          aria-label="Close folder access"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {access.isPending ? <StateLine kind="run">Loading…</StateLine> : null}
      {access.isError ? <StateLine kind="err">{(access.error as Error).message}</StateLine> : null}
      {data !== undefined && draft !== undefined ? (
        <div className="access-panel__body">
          {data.onlySuperAdmins && changes === 0 ? (
            <p className="access-panel__alone">Only Super-Admins can see this folder</p>
          ) : null}
          {LEVELS.map(({ level, heading }) => {
            const sectionId = `${headingId}-${level}`;
            const inherited = data.inherited[level];
            return (
              <section key={level} className="access-panel__level" aria-labelledby={sectionId}>
                <h3 id={sectionId}>{heading}</h3>
                <h4>Set here</h4>
                {draft[level].length === 0 ? (
                  <p className="access-panel__unset">
                    {parentTitle === undefined
                      ? 'Not set here.'
                      : `Not set here. Inherits from ${parentTitle}.`}
                  </p>
                ) : (
                  <ul className="access-panel__list">
                    {draft[level].map((group) => {
                      const outranking =
                        level === 'readOnly'
                          ? data.inherited.readWrite.find((grant) => grant.group === group)
                          : undefined;
                      return (
                        <GroupRow
                          key={group}
                          group={group}
                          onRemove={() =>
                            setDraft({
                              ...draft,
                              [level]: draft[level].filter((each) => each !== group),
                            })
                          }
                          {...(outranking === undefined
                            ? {}
                            : { outrankedBy: titleOf(outranking.from) })}
                        />
                      );
                    })}
                  </ul>
                )}
                <h4>From ancestors</h4>
                {inherited.length === 0 ? (
                  <p className="access-panel__unset">None.</p>
                ) : (
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
                )}
              </section>
            );
          })}
          <GroupCombobox
            suggestions={suggestions}
            onAdd={(group, level) => {
              if (draft[level].includes(group)) return;
              setDraft({ ...draft, [level]: [...draft[level], group] });
            }}
          />
          {asking ? (
            <div
              className="access-panel__ask"
              role="alertdialog"
              aria-labelledby={`${headingId}-ask`}
            >
              <p id={`${headingId}-ask`}>
                This save would remove your own read-write access to {folderTitle}. You couldn’t
                change it, or its groups, afterwards.
              </p>
              <button type="button" className="btn-primary btn-sm" onClick={commit}>
                Remove my access
              </button>
              <button type="button" className="btn-sm" ref={keepRef} onClick={keep}>
                Keep my access
              </button>
            </div>
          ) : null}
          {save.isError ? <StateLine kind="err">{(save.error as Error).message}</StateLine> : null}
          {save.isSuccess && changes === 0 ? (
            <p className="access-panel__saved" role="status">
              Access saved.{' '}
              {undo === undefined ? null : (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    const previous = undo;
                    setUndo(undefined);
                    save.mutate(previous);
                  }}
                >
                  Undo
                </button>
              )}
            </p>
          ) : null}
          <div className="access-panel__foot">
            <button
              type="button"
              className="btn-primary"
              ref={saveRef}
              disabled={changes === 0 || save.isPending}
              onClick={() => (losesOwnWrite ? setAsking(true) : commit())}
            >
              {changes === 0 ? 'Save' : `Save ${String(changes)} change${changes === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
