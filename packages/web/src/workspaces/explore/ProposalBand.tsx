import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { clockOrWhenOf } from '../../shell/formatTime';
import { StatusIcon } from '../../shell/StatusIcon';

/**
 * The band on the author's workspace item (T358, AC-290, AC-284; design 05,
 * state M; rule 79), from the item's latest proposal:
 * - waiting: since when and where to, with a link to it, and that it can't
 *   be changed while it waits (R52; T541, AC-388), which replaces design 05
 *   state M's "changed since proposing" note;
 * - rejected: who and when, the reason as a quote (or "No reason given"),
 *   with Propose again… and Dismiss, which lasts until the item is proposed
 *   again (R42.1).
 * Nothing when it was never proposed, withdrawn, approved, or dismissed.
 */
interface Latest {
  readonly id: string;
  readonly status: 'open' | 'approved' | 'rejected' | 'withdrawn';
  readonly proposedAt: string;
  readonly targetPath: readonly string[];
  readonly items: readonly {
    readonly kind: string;
    readonly id: string;
    readonly version: number;
    /** Where it lands: the target, or a library chart's own folder. */
    readonly landsInPath?: readonly string[];
  }[];
  readonly decision: {
    readonly by: { readonly name: string };
    readonly at: string;
    readonly reason: string | null;
  } | null;
  readonly dismissedAt: string | null;
}

const folderText = (path: readonly string[]) => {
  const below = path[0] === 'Shared' ? path.slice(1) : path;
  return below.length === 0 ? 'Shared' : below.join(' / ');
};

/**
 * "14:05" today, in a band's sentence ("since 14:05", as design 05 draws
 * it); else as every moment is written, "Yesterday 16:40", "26 Sep 16:40"
 * (T477; the coordinator's Q8).
 */
function whenText(iso: string, now: Date): string {
  return clockOrWhenOf(new Date(iso), now);
}

export function ProposalBand({
  kind,
  id,
  onProposeAgain,
  now = new Date(),
}: {
  readonly kind: 'dashboard' | 'chart' | 'data-source';
  readonly id: string;
  /** Propose it again, to where it lands (from Shared down). */
  readonly onProposeAgain: (targetPath: readonly string[]) => void;
  readonly now?: Date;
}) {
  const client = useQueryClient();
  const latest = useQuery({
    queryKey: ['proposal-of', kind, id],
    // Asked each time the item is opened: a decision made since is shown,
    // not a cached "Waiting" (T358's review; AC-290).
    staleTime: 0,
    queryFn: async ({ signal }): Promise<Latest | null> => {
      const response = await fetch(
        `/api/proposals?kind=${encodeURIComponent(kind)}&itemId=${encodeURIComponent(id)}`,
        { signal },
      );
      // Never proposed, or proposals are off (sign-in off): no band.
      if (response.status === 404) return null;
      if (!response.ok)
        throw new Error(`Its proposal could not be read (${String(response.status)}).`);
      return (await response.json()) as Latest;
    },
  });
  const dismiss = useMutation({
    mutationFn: async (proposalId: string) => {
      const response = await fetch(`/api/proposals/${encodeURIComponent(proposalId)}/dismiss`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('It could not be dismissed.');
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['proposal-of', kind, id] }),
  });

  const proposal = latest.data;
  if (proposal === undefined || proposal === null) return null;

  // This item's own entry: it may have gone with another item's proposal,
  // into its own folder (T358's review).
  const own =
    proposal.items.find((item) => item.kind === kind && item.id === id) ?? proposal.items[0];
  const landsIn = own?.landsInPath ?? proposal.targetPath;

  if (proposal.status === 'open') {
    // Frozen while it waits (R52; T541, AC-388): ~~changes since proposing
    // aren't in it (decision 2)~~ none can be made until it is withdrawn.
    return (
      <div role="status" aria-label="Proposal" className="proposal-band">
        {/* The idle clock and a bold lead, as state M draws it (T699, SEC-20, SEC-25). */}
        <StatusIcon kind="idle" />
        <p>
          <b>Waiting for review since {whenText(proposal.proposedAt, now)}</b> · proposed to{' '}
          {folderText(landsIn)}. It can’t be changed while it waits: withdraw its proposal to change
          it, then propose it again.
        </p>
        <a
          className="btn btn-sm"
          href={`/reviews?tab=mine&selected=${encodeURIComponent(proposal.id)}`}
        >
          View proposal
        </a>
      </div>
    );
  }

  if (proposal.status === 'rejected' && proposal.dismissedAt === null) {
    const decision = proposal.decision;
    return (
      <div role="status" aria-label="Proposal" className="proposal-band proposal-band--rejected">
        <StatusIcon kind="err" />
        <div className="proposal-band__body">
          <p className="proposal-band__decision" data-testid="band-decision">
            Rejected
            {decision === null ? '' : ` by ${decision.by.name} · ${whenText(decision.at, now)}`}
          </p>
          <blockquote className="proposal-band__reason">
            {decision?.reason ?? 'No reason given'}
          </blockquote>
          {dismiss.isError ? <p className="proposal-band__error">{dismiss.error.message}</p> : null}
        </div>
        <div className="proposal-band__actions">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              onProposeAgain(landsIn);
            }}
          >
            Propose again…
          </button>
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={dismiss.isPending}
            onClick={() => {
              dismiss.mutate(proposal.id);
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }
  return null;
}
