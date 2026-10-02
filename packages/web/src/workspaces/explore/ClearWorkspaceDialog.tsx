import { useRef } from 'react';

import { DeleteDialog, type Confirmation } from './DeleteDialog';

/**
 * Clear My workspace (T522, AC-367; design 14, states F2 and F3): the
 * delete's dialog, asking the server first what a clear would remove, every
 * item and folder at any depth by kind, and each open proposal it would
 * withdraw, which it names before anything goes. Cancel has focus; the one
 * filled destructive button clears it.
 */
export interface Held {
  readonly items: number;
  readonly folders: number;
  readonly dashboards: number;
  readonly charts: number;
  readonly models: number;
  readonly dataSources: number;
}

interface Asked extends Held {
  readonly proposals: readonly {
    readonly id: string;
    readonly title: string;
    readonly targetPath: string;
    readonly proposedAt: string;
  }[];
}

interface Cleared extends Held {
  readonly withdrawn: number;
}

const counted = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`;

/** "14 items and 3 folders": what it holds, without the kinds. */
const wholeText = ({ items, folders }: Held) =>
  [
    items > 0 ? counted(items, 'item', 'items') : null,
    folders > 0 ? counted(folders, 'folder', 'folders') : null,
  ]
    .filter((part) => part !== null)
    .join(' and ');

/** "14 items and 3 folders (5 dashboards, 6 charts, 2 models, 1 data source)": only the kinds it holds. */
export function heldText(held: Held): string {
  const kinds = (
    [
      [held.dashboards, 'dashboard', 'dashboards'],
      [held.charts, 'chart', 'charts'],
      [held.models, 'model', 'models'],
      [held.dataSources, 'data source', 'data sources'],
    ] as const
  )
    .filter(([count]) => count > 0)
    .map(([count, one, many]) => counted(count, one, many));
  const whole = wholeText(held);
  return kinds.length === 0 ? whole : `${whole} (${kinds.join(', ')})`;
}

/** F3's toast: "Cleared My workspace: 14 items and 3 folders removed, 2 proposals withdrawn." */
function clearedText(cleared: Cleared): string {
  const whole = wholeText(cleared);
  const withdrawn =
    cleared.withdrawn > 0
      ? `, ${counted(cleared.withdrawn, 'proposal', 'proposals')} withdrawn`
      : '';
  return `Cleared My workspace: ${whole === '' ? 'nothing' : whole} removed${withdrawn}.`;
}

/** The server's answer, or its reason as an error. */
async function answerOf<T>(response: Response, doing: string): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  const said = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(said?.error ?? `${doing} (${String(response.status)}).`);
}

/** What a clear would remove and withdraw, as the confirmation says it (F2). */
async function checkClear(): Promise<Confirmation> {
  const asked = await answerOf<Asked>(
    await fetch('/api/workspace/clear'),
    'What My workspace holds could not be read',
  );
  return {
    kind: 'confirm',
    text: `This removes everything in My workspace: ${heldText(asked)}.`,
    withdraws: asked.proposals.map((proposal) => ({
      id: proposal.id,
      title: proposal.title,
      targetPath: proposal.targetPath,
      proposedAt: proposal.proposedAt,
    })),
    note: 'Nothing outside My workspace changes: what’s already approved stays in its folder.',
  };
}

export function ClearWorkspaceDialog({
  onCleared,
  onFailed,
  onClose,
}: {
  /** Cleared: what the toast says (F3). */
  readonly onCleared: (said: string) => void;
  /** Not cleared: part of it may be gone all the same, to be read afresh (T522's review). */
  readonly onFailed?: () => void;
  readonly onClose: () => void;
}) {
  const cleared = useRef<Cleared | null>(null);
  return (
    <DeleteDialog
      name="My workspace"
      heading="Clear My workspace?"
      action="Clear My workspace"
      check={checkClear}
      remove={async () => {
        try {
          cleared.current = await answerOf<Cleared>(
            await fetch('/api/workspace/clear', { method: 'POST' }),
            'My workspace could not be cleared',
          );
        } catch (failure) {
          onFailed?.();
          throw failure;
        }
        return undefined;
      }}
      onDeleted={() => {
        if (cleared.current !== null) onCleared(clearedText(cleared.current));
      }}
      onClose={onClose}
    />
  );
}
