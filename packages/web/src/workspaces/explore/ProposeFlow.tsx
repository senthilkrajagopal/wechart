import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ProposeDialog, type ProposalCheck, type ProposalCheckItem } from './ProposeDialog';

/**
 * Proposing a workspace item (T358, AC-284; design 05, states A, B and F).
 * What proposing would do is checked as the dialog opens (`POST
 * /api/proposals/check`), so a refusal is said before anything is typed.
 * Propose sends it; the Reviews lists and the top bar's count are read
 * again, as is the item's own band.
 */
export interface Proposable {
  readonly kind: 'dashboard' | 'chart' | 'data-source';
  readonly id: string;
  readonly title: string;
}

/** The API's own words, where it gives them. */
async function saidBy(response: Response, fallback: string): Promise<string> {
  const said = ((await response.json().catch(() => null)) as { error?: unknown } | null)?.error;
  return typeof said === 'string' ? said : fallback;
}

export function ProposeFlow({
  item,
  targetPath,
  onProposed,
  onClose,
  restoring,
}: {
  readonly item: Proposable;
  /** A version restored, to propose (T357; design 06, state C). */
  readonly restoring?: { readonly version: number; readonly description: string } | undefined;
  /** The target's path from Shared, until the check says it. */
  readonly targetPath: readonly string[];
  /** Proposed: the proposal, and the target's path from Shared as checked. */
  readonly onProposed: (
    proposal: { id: string; status: string },
    targetPath: readonly string[],
  ) => void;
  readonly onClose: () => void;
}) {
  const client = useQueryClient();
  const checked = useQuery({
    queryKey: ['proposal-check', item.kind, item.id],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/proposals/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: item.kind, id: item.id }),
        signal,
      });
      if (!response.ok)
        throw new Error(
          await saidBy(response, `It could not be checked (${String(response.status)}).`),
        );
      return (await response.json()) as {
        targetPath: string[];
        items: ProposalCheckItem[];
      };
    },
    // Always as it is now: the item or its folder may have changed.
    staleTime: 0,
    gcTime: 0,
  });
  const proposing = useMutation({
    mutationFn: async (description: string) => {
      const response = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: item.kind,
          id: item.id,
          ...(description.trim() === '' ? {} : { description }),
        }),
      });
      if (!response.ok)
        throw new Error(
          await saidBy(response, `It could not be proposed (${String(response.status)}).`),
        );
      return (await response.json()) as { id: string; status: string };
    },
    onSuccess: async (proposal) => {
      await client.invalidateQueries({ queryKey: ['reviews'] });
      await client.invalidateQueries({ queryKey: ['proposal-of', item.kind, item.id] });
      onProposed(proposal, checked.data?.targetPath ?? targetPath);
    },
  });

  const check: ProposalCheck = checked.isPending
    ? { state: 'checking', targetPath }
    : checked.isError
      ? { state: 'refused', targetPath, error: checked.error.message }
      : { state: 'ready', targetPath: checked.data.targetPath, items: checked.data.items };

  return (
    <ProposeDialog
      check={check}
      busy={proposing.isPending}
      failure={proposing.isError ? proposing.error.message : undefined}
      restoring={restoring}
      onPropose={(description) => {
        proposing.mutate(description);
      }}
      onClose={onClose}
    />
  );
}
