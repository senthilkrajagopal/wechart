import { useQuery } from '@tanstack/react-query';

import { StateLine } from '../shell/StatusIcon';

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
  folderId,
}: {
  chartId: string;
  folderId: string | undefined;
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
  // The top level is no folder of its own; Explore calls it "All folders".
  const folder =
    folderId === 'root' || folderId === undefined
      ? 'All folders'
      : (folders.data?.find((each) => each.id === folderId)?.title ?? folderId);

  if (using.isPending)
    return (
      <StateLine kind="run" className="shared-chart-notice">
        Shared chart: asking which dashboards use it…
      </StateLine>
    );
  if (using.isError)
    return (
      <StateLine kind="warn" role="status" className="shared-chart-notice">
        Shared chart: which dashboards use it could not be read. Edits change every dashboard that
        uses it.
      </StateLine>
    );
  const count = using.data.length;
  return count > 1 ? (
    <StateLine kind="warn" role="status" className="shared-chart-notice">
      Shared chart · on {count} dashboards · edits change all of them
    </StateLine>
  ) : (
    <StateLine kind="idle" className="shared-chart-notice">
      Shared chart from {folder} · no other dashboard uses it yet
    </StateLine>
  );
}
