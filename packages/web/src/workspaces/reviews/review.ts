import type { ReviewKind, ReviewStatus } from './reviews';

/**
 * One proposal as its review view reads it (T356; `GET /api/proposals/:id`,
 * T351): each item with what it holds, where it lands and what it replaces
 * there, and what the user may do with it. A data source's credentials are
 * only named, unchanged or replaced, never sent (rule 83).
 */
export interface ProposalItem {
  readonly kind: ReviewKind;
  readonly id: string;
  readonly title: string;
  readonly version: number;
  readonly landsIn: string;
  /** From Shared down: `['Shared', 'Sales', 'EMEA']`. */
  readonly landsInPath: readonly string[];
  readonly replaces: {
    readonly id: string;
    readonly version: number;
    readonly copiedFrom: boolean;
  } | null;
  /** The version the folder has now of what it replaces: it may have moved on. */
  readonly replacesNow?: number | null;
  /** The item as proposed: a document's body, or a data source's settings. */
  readonly snapshot: Readonly<Record<string, unknown>>;
  /** A data source's credentials against the folder's: never their values. */
  readonly secretChanges?: Readonly<Record<string, 'unchanged' | 'replaced' | 'new'>>;
  /** A model's file as the folder has it now, while it waits (T350; design 05, state G). */
  readonly current?: { readonly content: string; readonly version: number };
}

export interface ProposalDetail {
  readonly id: string;
  readonly kind: ReviewKind;
  readonly itemId: string;
  readonly title: string;
  readonly targetFolderId: string;
  readonly targetPath: readonly string[];
  readonly author: { readonly key: string; readonly name: string };
  readonly description: string | null;
  readonly proposedAt: string;
  readonly status: ReviewStatus;
  readonly replaces: ProposalItem['replaces'];
  readonly items: readonly ProposalItem[];
  readonly decision: {
    readonly by: { readonly key: string; readonly name: string };
    readonly at: string;
    readonly reason: string | null;
  } | null;
  readonly mayApprove: boolean;
  readonly mayReject: boolean;
  /** The signed-in user proposed it. */
  readonly yours: boolean;
}

/** The API's own words for a failure, where it gives them. */
async function saidBy(response: Response, otherwise: string): Promise<string> {
  const said = ((await response.json().catch(() => null)) as { error?: unknown } | null)?.error;
  return typeof said === 'string' ? said : otherwise;
}

export const proposalQuery = (id: string) => ({
  queryKey: ['proposal', id] as const,
  queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<ProposalDetail> => {
    const response = await fetch(
      `/api/proposals/${encodeURIComponent(id)}`,
      signal === undefined ? {} : { signal },
    );
    if (!response.ok)
      throw new Error(
        await saidBy(response, `The proposal could not be read (${String(response.status)}).`),
      );
    return (await response.json()) as ProposalDetail;
  },
});

/** A decision the API refused: its words, and a data source's problems. */
export class DecisionRefused extends Error {
  constructor(
    message: string,
    readonly problems: readonly string[] = [],
  ) {
    super(message);
    this.name = 'DecisionRefused';
  }
}

/** Approve or reject it; the API's answer, or its refusal thrown. */
export async function decide(
  id: string,
  action: 'approve' | 'reject',
  body: Record<string, unknown> = {},
): Promise<{ readonly landed?: readonly { kind: string; id: string; version: number }[] }> {
  const response = await fetch(`/api/proposals/${encodeURIComponent(id)}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const answer = (await response.json().catch(() => null)) as {
    error?: unknown;
    problems?: unknown;
    landed?: { kind: string; id: string; version: number }[];
  } | null;
  if (!response.ok)
    throw new DecisionRefused(
      typeof answer?.error === 'string'
        ? answer.error
        : `It could not be decided (${String(response.status)}).`,
      Array.isArray(answer?.problems)
        ? answer.problems.filter((each): each is string => typeof each === 'string')
        : [],
    );
  return answer ?? {};
}

/** "27 Sep 2026, 14:05", as the review view's inspector writes a moment. */
export function momentText(iso: string): string {
  const at = new Date(iso);
  // The month as "Sep": en-GB's short month is "Sept".
  const month = at.toLocaleDateString('en-US', { month: 'short' });
  const clock = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${String(at.getDate())} ${month} ${String(at.getFullYear())}, ${clock}`;
}

/** The items a reviewer is shown: a dashboard's own charts are part of it. */
export function shownItems(proposal: ProposalDetail): readonly ProposalItem[] {
  return proposal.items.filter(
    (item) => !(item.kind === 'chart' && item.snapshot['localToDashboardId'] === proposal.itemId),
  );
}
