import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';

import { StateLine } from '../../shell/StatusIcon';
import { useFocusTrap } from '../../shell/useFocusTrap';
import { browserTimeZone, projectNameAt } from './projectFolder';

/**
 * "Edit in my workspace" for a shared dashboard (T348, AC-278, AC-279;
 * design 04, state D; surface 5): what is always copied — the dashboard, its
 * own charts and the library charts it shows — and its data sources offered
 * unticked, "only if you'll change them". Only what is ticked is copied;
 * anything else is used from its folder. The copy then opens to be edited.
 * (Models join the list once workspaces hold them, T347.)
 */
interface Offered {
  readonly ownCharts: readonly unknown[];
  readonly libraryCharts: readonly unknown[];
  readonly dataSources: readonly {
    readonly id: string;
    readonly name: string;
    readonly folderPath: readonly string[];
  }[];
}

const counted = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`;

/** "the dashboard, its 2 local charts and the 1 library chart it shows". */
function alwaysText(own: number, library: number): string {
  const parts = ['the dashboard'];
  if (own > 0) parts.push(`its ${counted(own, 'local chart', 'local charts')}`);
  if (library > 0)
    parts.push(`the ${counted(library, 'library chart', 'library charts')} it shows`);
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)!}`;
}

const pathText = (path: readonly string[]) => path.slice(1).join(' / ') || 'Shared';

export function EditInWorkspaceDialog({
  dashboardId,
  title,
  targetPath,
  onCopied,
  onClose,
}: {
  readonly dashboardId: string;
  readonly title: string;
  /** Where it goes back to: "Sales / EMEA". */
  readonly targetPath: string;
  /** The copy made, or the user's copy already there. */
  readonly onCopied: (copyId: string) => void;
  readonly onClose: () => void;
}) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
  // Escape closes it, as every dialog here closes (T348's review).
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
  // What it uses, as its export offers it (T511): the user's to see only.
  const offered = useQuery({
    queryKey: ['export-offer', dashboardId],
    queryFn: async () => {
      const response = await fetch(`/api/export/dashboards/${encodeURIComponent(dashboardId)}`);
      if (!response.ok)
        throw new Error(`What it uses could not be read (${String(response.status)}).`);
      return (await response.json()) as Offered;
    },
  });
  /**
   * Which of its data sources the user may copy: those in folders they
   * write in (T346). One they only read is shown, not offered (T348's
   * review), since its copy would be refused.
   */
  const sources = offered.data?.dataSources ?? [];
  const copyable = useQuery({
    queryKey: ['copyable-sources', sources.map((source) => source.id)],
    enabled: sources.length > 0,
    queryFn: async () => {
      const mayCopy = await Promise.all(
        sources.map(async (source) => {
          const response = await fetch(`/api/data-sources/${encodeURIComponent(source.id)}`);
          if (!response.ok) return false;
          return ((await response.json()) as { canWrite?: boolean }).canWrite === true;
        }),
      );
      return new Set(sources.filter((_, index) => mayCopy[index]).map((source) => source.id));
    },
  });
  /**
   * The folder its copies go into (T523, AC-368; design 14, state G1): the
   * minute as the dialog opens. The API names it for the minute Copy and
   * edit is pressed, `-2` where that name is taken.
   */
  const [projectName] = useState(() => projectNameAt(new Date()));
  /** The dashboard's copy once made: a second try copies only what's left, into its folder. */
  const made = useRef<{ readonly id: string; readonly folderId?: string } | null>(null);
  /** The data sources copied already. */
  const sourcesCopied = useRef(new Set<string>());
  const copy = useMutation({
    mutationFn: async () => {
      // The dashboard first: its copy makes the folder the rest go into.
      if (made.current === null) {
        const response = await fetch('/api/workspace/copies', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'dashboard', id: dashboardId, timeZone: browserTimeZone() }),
        });
        const answer = (await response.json().catch(() => null)) as {
          id?: string;
          folderId?: string;
          error?: string;
        } | null;
        if (!response.ok || answer?.id === undefined)
          throw new Error(answer?.error ?? `It could not be copied (${String(response.status)}).`);
        made.current = {
          id: answer.id,
          ...(answer.folderId === undefined ? {} : { folderId: answer.folderId }),
        };
      }
      const { id: copyId, folderId } = made.current;
      for (const id of ticked) {
        if (sourcesCopied.current.has(id)) continue;
        const answer = await fetch(`/api/data-sources/${encodeURIComponent(id)}/copy`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // Into the dashboard's copy's folder: the one it made, or, where their
          // copy was there already, the one that copy is in (T523's review).
          body: JSON.stringify(
            folderId === undefined ? { timeZone: browserTimeZone() } : { into: folderId },
          ),
        });
        if (!answer.ok) {
          const said = (await answer.json().catch(() => null)) as { error?: string } | null;
          throw new Error(
            said?.error ?? `A data source could not be copied (${String(answer.status)}).`,
          );
        }
        sourcesCopied.current.add(id);
      }
      return copyId;
    },
    onSuccess: (copyId) => {
      onCopied(copyId);
    },
  });

  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-heading`}
        className="dialog edit-in-workspace"
      >
        <h2 id={`${ids}-heading`}>Edit in my workspace</h2>
        <p>
          Copies {title} into My workspace. You’ll propose it back to {targetPath}.
        </p>
        {offered.isPending ? (
          <StateLine kind="run">Reading what it uses…</StateLine>
        ) : offered.isError ? (
          <StateLine kind="err">{offered.error.message}</StateLine>
        ) : (
          <>
            <p className="edit-in-workspace__always" data-testid="always-copied">
              Always copied:{' '}
              {alwaysText(offered.data.ownCharts.length, offered.data.libraryCharts.length)}.
            </p>
            {offered.data.dataSources.length === 0 ? null : (
              <fieldset className="edit-in-workspace__also">
                <legend>Also copy, only if you’ll change them</legend>
                {offered.data.dataSources.map((source) => (
                  <label key={source.id} className="edit-in-workspace__option">
                    <input
                      type="checkbox"
                      disabled={copyable.data?.has(source.id) !== true}
                      checked={ticked.has(source.id)}
                      onChange={(event) => {
                        const on = event.target.checked;
                        setTicked((was) => {
                          const next = new Set(was);
                          if (on) next.add(source.id);
                          else next.delete(source.id);
                          return next;
                        });
                      }}
                    />
                    <span className="edit-in-workspace__name">{source.name}</span>
                    <span className="edit-in-workspace__where">
                      Data source · {pathText(source.folderPath)}
                      {copyable.isSuccess && !copyable.data.has(source.id)
                        ? ' · view only here'
                        : ''}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            <p className="edit-in-workspace__note">
              Anything you don’t copy is used from its folder.
            </p>
            <p className="edit-in-workspace__folder" data-testid="project-folder">
              <span className="itemicon ic-folder" data-icon="folder" aria-hidden="true" />
              <span>
                Into a new folder in My workspace:{' '}
                <b className="edit-in-workspace__project">{projectName}</b>
              </span>
            </p>
          </>
        )}
        {copy.isError ? (
          <p role="alert" className="propose-dialog__refused">
            {copy.error.message}
          </p>
        ) : null}
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!offered.isSuccess || copy.isPending}
            onClick={() => {
              copy.mutate();
            }}
          >
            Copy and edit
          </button>
        </div>
      </div>
    </div>
  );
}
