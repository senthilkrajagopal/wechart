import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { useFocusTrap } from '../../shell/useFocusTrap';
import { ProposeFlow } from '../explore/ProposeFlow';
import type { KeptVersion } from './HistoryPanel';

/**
 * Proposing a version restored (T357, AC-289; design 06, states C and E):
 * the API makes a draft of it in the user's workspace (T354), and the
 * Propose dialog takes it on, titled for the version and filled in. Where
 * the user has a copy of the item, they are asked before it is replaced;
 * one waiting for review, or a chart they can't open, is said and stops it.
 * Nothing changes in the folder until the proposal is approved.
 */
export type RestoringVersion = KeptVersion & { readonly approvedText: string };

class Refused extends Error {
  constructor(
    message: string,
    readonly replaceable: boolean,
  ) {
    super(message);
    this.name = 'Refused';
  }
}

export function useRestore(kind: 'dashboard' | 'chart', itemId: string) {
  const [asked, setAsked] = useState<RestoringVersion | undefined>(undefined);
  const mutation = useMutation({
    mutationFn: async ({
      version,
      replaceCopy,
    }: {
      version: RestoringVersion;
      replaceCopy: boolean;
    }): Promise<string> => {
      const response = await fetch(`/api/history/${kind}/${encodeURIComponent(itemId)}/restore`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: version.version, ...(replaceCopy ? { replaceCopy } : {}) }),
      });
      const answer = (await response.json().catch(() => null)) as {
        id?: string;
        error?: string;
        replaceable?: boolean;
      } | null;
      if (!response.ok)
        throw new Refused(
          answer?.error ?? `It could not be restored (${String(response.status)}).`,
          answer?.replaceable === true,
        );
      return answer!.id!;
    },
  });
  return {
    asked,
    draftId: mutation.data,
    refused: mutation.error instanceof Refused ? mutation.error : undefined,
    busy: mutation.isPending,
    start: (version: RestoringVersion) => {
      setAsked(version);
      mutation.mutate({ version, replaceCopy: false });
    },
    replaceCopy: () => {
      if (asked !== undefined) mutation.mutate({ version: asked, replaceCopy: true });
    },
    close: () => {
      setAsked(undefined);
      mutation.reset();
    },
  };
}

/** The dialogs a restore goes through, from the hook's state. */
export function RestoreDialogs({
  kind,
  restore,
  onProposed,
}: {
  readonly kind: 'dashboard' | 'chart';
  readonly restore: ReturnType<typeof useRestore>;
  /** Proposed: what to say, and the proposal. */
  readonly onProposed: (said: string, proposalId: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box);
  const asking = restore.asked !== undefined && restore.refused !== undefined;
  // Focus to it as it opens, and Esc closes it, not the panel behind (rule 85).
  const closing = useRef(restore.close);
  useEffect(() => {
    closing.current = restore.close;
  }, [restore.close]);
  useEffect(() => {
    if (!asking) return;
    box.current?.querySelector<HTMLButtonElement>('.dialog__actions button:last-child')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closing.current();
    };
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      document.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [asking]);
  const version = restore.asked;
  if (version === undefined) return null;
  if (restore.draftId !== undefined)
    return (
      <ProposeFlow
        item={{ kind, id: restore.draftId, title: version.title }}
        targetPath={['Shared']}
        restoring={{
          version: version.version,
          description: `Restore version ${String(version.version)} (${version.approvedText}).`,
        }}
        onClose={restore.close}
        onProposed={(proposal, targetPath) => {
          restore.close();
          const folder = targetPath.slice(1).join(' / ') || 'Shared';
          onProposed(
            `Proposed restoring version ${String(version.version)} to ${folder}. It lands when approved.`,
            proposal.id,
          );
        }}
      />
    );
  if (restore.refused === undefined) return null;
  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-refused"
        className="dialog restore-dialog"
      >
        <h2 id="restore-refused">
          {restore.refused.replaceable
            ? 'Replace your copy?'
            : `Can’t restore version ${String(version.version)}`}
        </h2>
        <p>{restore.refused.message}</p>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={restore.close}>
            {restore.refused.replaceable ? 'Cancel' : 'Close'}
          </button>
          {restore.refused.replaceable ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={restore.busy}
              onClick={restore.replaceCopy}
            >
              Replace my copy
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
