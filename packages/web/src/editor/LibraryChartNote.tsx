import { useQuery } from '@tanstack/react-query';

import { StateLine } from '../shell/StatusIcon';
import { FOLDERS_QUERY } from '../workspaces/explore/folders';
import { SHARED_ROOT, rootTitleOf } from '../workspaces/explore/roots';

/**
 * Whose a library chart is, in its own editor's header (T256, AC-214): the
 * prototype's note (`explore.js` 174–183). A chart never saved is "New shared
 * chart in ‹folder›"; a saved one says how many dashboards use it, and warns
 * when an edit would change more than one.
 *
 * The count is the dashboards that use it (`/api/charts/:id/dashboards`), as
 * the chart's own page and a dashboard's editor ask (`SharedChartNotice`).
 */
export function LibraryChartNote({
  chartId,
  folderId,
  fresh,
}: {
  chartId: string;
  folderId: string | undefined;
  /** Never saved: new, in its folder. */
  fresh: boolean;
}) {
  const using = useQuery({
    queryKey: ['chart-dashboards', chartId],
    queryFn: async () => {
      const response = await fetch(`/api/charts/${encodeURIComponent(chartId)}/dashboards`);
      if (!response.ok) throw new Error(String(response.status));
      return (await response.json()) as { id: string; title: string }[];
    },
    enabled: !fresh,
  });
  const folders = useQuery({ ...FOLDERS_QUERY, enabled: fresh });

  if (fresh) {
    // A root is no folder of its own; it is named from the one list.
    const folder =
      folderId === undefined
        ? SHARED_ROOT.title
        : (rootTitleOf(folderId) ?? folders.data?.find((each) => each.id === folderId)?.title);
    return (
      <span className="chart-editor__note" data-testid="editor-ownership">
        {folder === undefined ? 'New shared chart' : `New shared chart in ${folder}`}
      </span>
    );
  }
  const count = using.data?.length;
  if (count === undefined)
    return (
      <span className="chart-editor__note" data-testid="editor-ownership">
        {using.isError
          ? 'Shared chart · edits change every dashboard that uses it'
          : 'Shared chart'}
      </span>
    );
  if (count > 1)
    return (
      <StateLine kind="warn" role="status" testId="editor-ownership">
        Shared chart · on {count} dashboards · edits change all of them
      </StateLine>
    );
  return (
    <span className="chart-editor__note" data-testid="editor-ownership">
      {count === 1
        ? 'Shared chart · on 1 dashboard · edits change it'
        : 'Shared chart · not on a dashboard yet'}
    </span>
  );
}
