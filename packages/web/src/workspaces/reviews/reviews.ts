import type { QueryClient, QueryKey } from '@tanstack/react-query';

import { clockOf } from '../../shell/formatTime';
import { shortDay } from '../../shell/relativeAge';
import type { StateKind } from '../../shell/StatusIcon';

/**
 * The Reviews page's two lists and the top bar's count (T355, AC-287;
 * design 05 of 2026-09-27, states C, D and E), as `GET /api/reviews`
 * answers them: never an item's content.
 */
// A Map's custom boundary set too (T979, AC-628).
export type ReviewKind = 'dashboard' | 'chart' | 'data-source' | 'model' | 'boundary-set';
export type ReviewStatus = 'open' | 'approved' | 'rejected' | 'withdrawn';

export interface ReviewRow {
  readonly id: string;
  readonly kind: ReviewKind;
  readonly itemId: string;
  readonly title: string;
  readonly targetFolderId: string;
  /** From Shared down: `['Shared', 'Sales', 'EMEA']`. */
  readonly targetPath: readonly string[];
  readonly author: { readonly key: string; readonly name: string };
  readonly description: string | null;
  readonly proposedAt: string;
  readonly status: ReviewStatus;
  /** The signed-in user proposed it. */
  readonly yours: boolean;
  /** What goes with it, besides a dashboard's own charts. */
  readonly includes: readonly { readonly kind: ReviewKind; readonly title: string }[];
  readonly replaces: { readonly id: string; readonly version: number } | null;
  readonly decision: {
    readonly by: { readonly key: string; readonly name: string };
    readonly at: string;
    readonly reason: string | null;
  } | null;
  /** The version it landed as, once approved. */
  readonly landedVersion: number | null;
  /** Every item in it, its own first (T358). */
  readonly items?: readonly { readonly kind: ReviewKind; readonly id: string }[];
}

export interface Reviews {
  /** Every open proposal the user may decide, theirs included. */
  readonly toReview: readonly ReviewRow[];
  /** Theirs, in every state, newest first. */
  readonly mine: readonly ReviewRow[];
}

const isReviews = (value: unknown): value is Reviews => {
  const lists = value as Partial<Reviews> | null;
  return (
    typeof lists === 'object' &&
    lists !== null &&
    Array.isArray(lists.toReview) &&
    Array.isArray(lists.mine)
  );
};

/** One query the page and the top bar's count share. */
export const REVIEWS_QUERY = {
  queryKey: ['reviews'] as const,
  queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<Reviews> => {
    const response = await fetch('/api/reviews', signal === undefined ? {} : { signal });
    if (!response.ok) {
      // The API's own words where it gives them: "Proposals need sign-in."
      const said = ((await response.json().catch(() => null)) as { error?: unknown } | null)?.error;
      throw new Error(
        typeof said === 'string'
          ? said
          : `The proposals could not be read (${String(response.status)}).`,
      );
    }
    const lists = (await response.json()) as unknown;
    if (!isReviews(lists)) throw new Error('The proposals could not be read.');
    return lists;
  },
};

/**
 * The top bar's count alone (T355's review): the number "To review" lists,
 * asked without reading the lists themselves.
 */
export const REVIEWS_COUNT_QUERY = {
  queryKey: ['reviews', 'count'] as const,
  queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<number> => {
    const response = await fetch('/api/reviews/count', signal === undefined ? {} : { signal });
    if (!response.ok)
      throw new Error(`The proposals waiting could not be counted (${String(response.status)}).`);
    const waiting = ((await response.json()) as { waiting?: unknown }).waiting;
    if (typeof waiting !== 'number') throw new Error('The proposals waiting could not be counted.');
    return waiting;
  },
};

/**
 * After a change to proposals: Reviews' lists and count, and any other keys
 * named (an item's `proposal-of`, say), asked again. Every place that changes
 * proposals goes through this, so none can drift back to a bare invalidation.
 *
 * Cancelled first: a read still on its way began before the change, and the
 * first of one, with no data yet, would be reused by an invalidation rather
 * than asked again (tanstack-query-mutations.md, "With no data yet, the
 * in-flight promise is reused"), leaving an item's row "Draft" after it was
 * proposed (propose.spec:83 under load; lane FIX).
 */
export async function refreshReviews(
  client: QueryClient,
  ...more: readonly QueryKey[]
): Promise<void> {
  for (const queryKey of [['reviews'], ...more]) {
    await client.cancelQueries({ queryKey });
    await client.invalidateQueries({ queryKey });
  }
}

export const KIND_LABEL: Record<ReviewKind, string> = {
  dashboard: 'Dashboard',
  chart: 'Chart',
  'data-source': 'Data source',
  model: 'Model',
  'boundary-set': 'Boundary set',
};

/** Each kind's icon chip, as Explore's New menu draws them (design 05, pin 2 and state D). */
export const KIND_ICON: Readonly<
  Record<ReviewKind, { readonly icon: string; readonly chip: string }>
> = {
  dashboard: { icon: '▦', chip: 'ic-dash' },
  chart: { icon: '◢', chip: 'ic-chart' },
  model: { icon: '◇', chip: 'ic-model' },
  'data-source': { icon: '◍', chip: 'ic-source' },
  'boundary-set': { icon: '◰', chip: 'ic-chart' },
};

const PLURAL: Record<ReviewKind, string> = {
  dashboard: 'dashboards',
  chart: 'charts',
  'data-source': 'data sources',
  model: 'models',
  'boundary-set': 'boundary sets',
};

/** A folder as the page names it: "Sales / EMEA", and the root as "Shared". */
export function folderText(path: readonly string[]): string {
  const below = path[0] === 'Shared' ? path.slice(1) : path;
  return below.length === 0 ? 'Shared' : below.join(' / ');
}

/** What goes with it, counted by kind: "+2 charts"; nothing, "". */
export function includesText(includes: ReviewRow['includes']): string {
  const counts = new Map<ReviewKind, number>();
  for (const each of includes) counts.set(each.kind, (counts.get(each.kind) ?? 0) + 1);
  return [...counts]
    .map(([kind, count]) =>
      count === 1 ? `+1 ${KIND_LABEL[kind].toLowerCase()}` : `+${String(count)} ${PLURAL[kind]}`,
    )
    .join(', ');
}

/**
 * A proposal's state in words, with its icon (rule 79): never colour alone.
 */
export function statusOf(row: ReviewRow): { kind: StateKind; text: string } {
  switch (row.status) {
    // The idle clock, as design 05 draws waiting (T699, SEC-20).
    case 'open':
      return { kind: 'idle', text: 'Waiting for review' };
    case 'approved':
      return {
        kind: 'ok',
        text:
          row.landedVersion === null
            ? 'Approved'
            : `Approved as version ${String(row.landedVersion)}`,
      };
    case 'rejected':
      return {
        kind: 'err',
        text: row.decision === null ? 'Rejected' : `Rejected by ${row.decision.by.name}`,
      };
    case 'withdrawn':
      return { kind: 'idle', text: 'Withdrawn' };
  }
}

/**
 * When, as design 05's lists write it: "Today 14:05", "Yesterday", or else
 * the day as the rest of the app writes one (`shortDay`: "24 Sep", with the
 * year only when it isn't this one's; T477's day first).
 */
export function proposedText(iso: string, now: Date): string {
  const then = new Date(iso);
  const day = (at: Date) => new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  const days = Math.round((day(now) - day(then)) / (24 * 3600 * 1000));
  if (days === 0) return `Today ${clockOf(then)}`;
  if (days === 1) return 'Yesterday';
  return shortDay(then, now);
}
