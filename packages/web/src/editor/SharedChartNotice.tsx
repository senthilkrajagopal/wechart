import { useQuery } from '@tanstack/react-query';

import { StateLine } from '../shell/StatusIcon';
import { SHARED_ROOT, rootTitleOf } from '../workspaces/explore/roots';

/**
 * A library chart opened for editing from a dashboard (T134, AC-128;
 * direction.md rule 41): that it is shared, and on how many dashboards —
 * before any change spreads, which, kept, it does (the user's decision,
 * 2026-09-22). The prototype's editor note (`prototype/dashboard.js`).
 *
 * The count is the dashboards that use it (`/api/charts/:id/dashboards`, as
 * the library chart's own page asks, AC-022); one used by no other dashboard
 * yet is named by its folder.
 */
export function SharedChartNotice({
  chartId,
  dashboardId,
  folderId,
  onMakeLocalCopy,
}: {
  chartId: string;
  /** The dashboard it is opened from, counted with the others (T134's review). */
  dashboardId: string;
  folderId: string | undefined;
  /** "Make a local copy" (T135, AC-129), before any change spreads. */
  onMakeLocalCopy?: (() => void) | undefined;
}) {
  const using = useQuery({
    queryKey: ['chart-dashboards', chartId],
    queryFn: async () => {
      const response = await fetch(`/api/charts/${encodeURIComponent(chartId)}/dashboards`);
      if (!response.ok) throw new Error(String(response.status));
      return (await response.json()) as { id: string; title: string }[];
    },
  });
  const folders = useQuery({
    queryKey: ['folders'],
    queryFn: async () => {
      const response = await fetch('/api/folders');
      if (!response.ok) throw new Error(String(response.status));
      return (await response.json()) as { id: string; title: string }[];
    },
  });
  // A root is no folder of its own; it is named from the one list.
  const folder =
    folderId === undefined
      ? SHARED_ROOT.title
      : (rootTitleOf(folderId) ??
        folders.data?.find((each) => each.id === folderId)?.title ??
        folderId);

  // The other dashboards, and this one: whether its saved body shows the
  // chart yet or only this session does.
  const count =
    using.data === undefined
      ? undefined
      : using.data.filter((each) => each.id !== dashboardId).length + 1;
  const said = using.isPending ? (
    <StateLine kind="run">Shared chart: asking which dashboards use it…</StateLine>
  ) : using.isError || count === undefined ? (
    <StateLine kind="warn" role="status">
      Shared chart: which dashboards use it could not be read. Edits change every dashboard that
      uses it.
    </StateLine>
  ) : count > 1 ? (
    <StateLine kind="warn" role="status">
      Shared chart · on {count} dashboards · edits change all of them
    </StateLine>
  ) : (
    <StateLine kind="idle">Shared chart from {folder} · no other dashboard uses it yet</StateLine>
  );
  return (
    <div className="shared-chart-notice">
      {said}
      {onMakeLocalCopy === undefined ? null : (
        <button type="button" className="btn-sm" onClick={onMakeLocalCopy}>
          Make a local copy
        </button>
      )}
    </div>
  );
}
