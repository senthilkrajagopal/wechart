import { useQuery } from '@tanstack/react-query';

/** A dashboard's bookmarks as the API lists them to this reader: their own and those shared. */
export interface ListedBookmark {
  readonly id: string;
  readonly name: string;
  readonly state: unknown;
}

const urlOf = (dashboardId: string) =>
  `/api/dashboards/${encodeURIComponent(dashboardId)}/bookmarks`;

/** The bookmarks this reader can see on a dashboard, read now; none where the API says no. */
export async function readBookmarks(dashboardId: string): Promise<ListedBookmark[]> {
  const response = await fetch(urlOf(dashboardId));
  if (!response.ok) return [];
  const body = (await response.json()) as { bookmarks?: unknown };
  if (!Array.isArray(body.bookmarks)) return [];
  return (body.bookmarks as unknown[]).flatMap((raw) => {
    if (typeof raw !== 'object' || raw === null) return [];
    const { id, name, state } = raw as Record<string, unknown>;
    return typeof id === 'string' && typeof name === 'string' ? [{ id, name, state }] : [];
  });
}

/**
 * An Action button's Apply bookmark choices (T894, AC-530): the bookmarks
 * this author can see on the dashboard, asked only while `enabled` — while
 * a button's settings are open.
 */
export function useDashboardBookmarks(
  dashboardId: string,
  enabled: boolean,
): readonly { readonly id: string; readonly name: string }[] {
  const listed = useQuery({
    queryKey: ['dashboard-bookmarks', dashboardId],
    queryFn: () => readBookmarks(dashboardId),
    enabled,
  });
  return listed.data ?? [];
}
