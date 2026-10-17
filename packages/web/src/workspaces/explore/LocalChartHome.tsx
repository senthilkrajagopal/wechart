import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { defaultStringifySearch } from '@tanstack/react-router';

import { tileShowing } from '../../dashboard/model/document';
import { dashboardOf, type StoredDocument } from '../../dashboard/model/stored';
import { StateLine } from '../../shell/StatusIcon';
import type { ItemWorkspace } from './placeOf';

/**
 * Where a dashboard-local chart lives (T463, AC-126; phase-1 design 06, item
 * 1): its dashboard's title and folder, and the tile that shows it there.
 *
 * A local chart is saved only with its dashboard, so its page and its editor
 * send the user there — "Edit on ‹dashboard›" opens that tile's editor in the
 * dashboard's edit mode, where Save saves it, and "Save to folders…" opens
 * the tile's Properties asking for a folder (AC-127) — never to an editor
 * that can't save (UX-040).
 */
export interface ChartHome {
  readonly title: string;
  readonly folderId: string | undefined;
  /** The tile showing the chart; none if no tile on it shows it any more. */
  readonly tileId: string | undefined;
  /**
   * The dashboard's place, as its own page reads it (T348), for a chart that
   * lives only on a shared dashboard: edited through that dashboard's copy
   * (T686; R76 dashboard-Q7).
   */
  readonly version: number;
  readonly origin?: { readonly id: string; readonly version: number; readonly folderId?: string };
  readonly targetFolderId?: string | undefined;
  readonly workspace?: ItemWorkspace | undefined;
}

export function useChartHome(dashboardId: string | undefined, chartId: string) {
  return useQuery({
    queryKey: ['chart-home', dashboardId, chartId],
    queryFn: async (): Promise<ChartHome> => {
      const response = await fetch(
        `/api/documents/dashboard/${encodeURIComponent(dashboardId ?? '')}`,
      );
      if (!response.ok) throw new Error(`Request failed: ${String(response.status)}`);
      const stored = (await response.json()) as StoredDocument & {
        readonly workspace?: ItemWorkspace;
      };
      const body = stored.body as
        | {
            title?: unknown;
            folderId?: unknown;
            targetFolderId?: unknown;
            origin?: { id: string; version: number; folderId?: string };
          }
        | undefined;
      let tileId: string | undefined;
      try {
        tileId = tileShowing(dashboardOf(stored), chartId);
      } catch {
        // A dashboard that can't be read opens to say so; there is no tile.
        tileId = undefined;
      }
      return {
        title: typeof body?.title === 'string' && body.title !== '' ? body.title : 'its dashboard',
        folderId: typeof body?.folderId === 'string' ? body.folderId : undefined,
        tileId,
        version: stored.version ?? 1,
        ...(body?.origin === undefined ? {} : { origin: body.origin }),
        targetFolderId: typeof body?.targetFolderId === 'string' ? body.targetFolderId : undefined,
        workspace: stored.workspace,
      };
    },
    enabled: dashboardId !== undefined,
  });
}

const dashboardPath = (dashboardId: string) =>
  `/explore/dashboards/${encodeURIComponent(dashboardId)}`;

/**
 * The tile's editor, open on the dashboard in edit mode (T196's `edit`).
 * Written by the router's own serializer, so a tile id that reads as a number
 * stays a string.
 */
export const editOnHref = (dashboardId: string, tileId: string): string =>
  dashboardPath(dashboardId) + defaultStringifySearch({ edit: tileId });

/** The tile's Properties in edit mode, asking for a folder (the ⋯ "Save to folders…"). */
export const saveToFoldersHref = (dashboardId: string, tileId: string): string =>
  dashboardPath(dashboardId) + defaultStringifySearch({ editing: true, publish: tileId });

/**
 * "Lives on ‹dashboard› · only there": whose the chart is, said once — or, for
 * a chart no tile on its dashboard shows any more, that it is on none of them.
 */
export function ChartHomeLine({ home }: { readonly home: ChartHome }) {
  return (
    <span className="chart-home" data-testid="chart-home">
      {/* The dashboard's chip, drawn by the stylesheet: not part of the words. */}
      <span className="itemicon ic-dash" aria-hidden="true" />
      {/* Design 06 pin 2's words (T686, DSH-13), and that no tile shows it. */}
      Local chart · only on <b>{home.title}</b>
      {home.tileId === undefined ? ' · on none of its tiles' : null}
    </span>
  );
}

/**
 * "Save to folders…" beside the primary "✎ Edit on ‹dashboard›". Where no
 * tile shows the chart any more there is nothing to edit it in, or to save to
 * folders from: only the way to its dashboard. Where the dashboard can't be
 * read, the reason — never nothing at all (T463's review).
 */
export function LocalChartActions({
  dashboardId,
  home,
  small = false,
}: {
  readonly dashboardId: string;
  readonly home: UseQueryResult<ChartHome>;
  /** In the editor's head, at its 24 px size. */
  readonly small?: boolean;
}) {
  const size = small ? ' btn-sm' : '';
  if (home.isError)
    return (
      <StateLine kind="err">
        Its dashboard could not be opened, so this chart can&apos;t be edited from here.
      </StateLine>
    );
  if (home.data === undefined) return null;
  const { title, tileId } = home.data;
  if (tileId === undefined)
    return (
      <a className={`btn${size}`} href={dashboardPath(dashboardId)}>
        Open {title}
      </a>
    );
  return (
    <>
      <a className={`btn${size}`} href={saveToFoldersHref(dashboardId, tileId)}>
        Save to folders…
      </a>
      <a className={`btn-primary${size}`} href={editOnHref(dashboardId, tileId)}>
        <span aria-hidden="true">✎ </span>Edit on {title}
      </a>
    </>
  );
}
