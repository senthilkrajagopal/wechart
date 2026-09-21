import { useQuery } from '@tanstack/react-query';

import { QueryLog, type QueryRecord } from './QueryLog';

/**
 * The Jobs workspace (AC-016): the queries wechart has issued, newest first,
 * as the API records them. Refetched when the workspace is opened again, so
 * the queries a dashboard just issued are there.
 */
export function JobsPage() {
  const records = useQuery({
    queryKey: ['jobs', 'queries'],
    queryFn: async ({ signal }): Promise<QueryRecord[]> => {
      const response = await fetch('/api/jobs/queries', { signal });
      if (!response.ok)
        throw new Error(`The query log could not be read (${String(response.status)}).`);
      return (await response.json()) as QueryRecord[];
    },
    refetchOnMount: 'always',
  });

  return (
    <div className="jobs-workspace">
      <h1>Jobs</h1>
      {records.isPending ? (
        <p>Reading the query log…</p>
      ) : records.isError ? (
        <p role="alert">{records.error.message}</p>
      ) : (
        <QueryLog records={records.data} />
      )}
    </div>
  );
}
