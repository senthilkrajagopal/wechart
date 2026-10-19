import { useQuery } from '@tanstack/react-query';

import { ME_QUERY } from '../../shell/me';
import { hiddenWorkspacesFor } from '../../shell/WorkspaceSwitcher';
import { SQL_SOURCES_QUERY } from './sources';

/** None that runs SQL for this user. */
const NONE: ReadonlySet<string> = new Set();

/**
 * The data sources this user may run SQL on now (T823, AC-464, AC-373): as
 * the SQL runner workspace's picker lists them, on or their own with no
 * switch, Cube Store aside. For whom the workspace is hidden, none, and
 * nothing is asked of the API. Rows' ⋯ in Data sources and Explore offer
 * "Open in SQL runner" on these alone.
 */
export function useSqlRunnable(): ReadonlySet<string> {
  const me = useQuery(ME_QUERY);
  const sources = useQuery({
    ...SQL_SOURCES_QUERY,
    enabled: me.data !== undefined && !hiddenWorkspacesFor(me.data).includes('sql'),
    retry: false,
  });
  if (sources.data === undefined) return NONE;
  return new Set(
    sources.data
      .filter((row) => !row.cubeStore && (row.runner === 'on' || row.runner === 'no-switch'))
      .map((row) => row.id),
  );
}
