import { useQuery } from '@tanstack/react-query';

import type { Me } from '../../shell/AccountMenu';
import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { DataSourcesList, type ListedSource } from './DataSourcesList';

/**
 * Data sources (T364; AC-157, AC-233): its title, a note saying what the
 * page is for, and every data source the user may see, in every folder.
 * Phase 1's placeholder said managing connections was not part of that
 * phase; data sources are now folders' items, landed in xcube (T335, T442).
 * `/sources` opens it too (routes.tsx).
 */
export function DataSourcesPage() {
  const sources = useQuery({
    queryKey: ['data-sources'],
    queryFn: async () => {
      const response = await fetch('/api/data-sources');
      if (!response.ok)
        throw new Error(`The data sources could not be read (${String(response.status)}).`);
      return (await response.json()) as ListedSource[];
    },
  });
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await (await fetch('/api/me')).json()) as Me,
  });

  return (
    <div className="admin-page">
      <h1 className="workspace-title">Data sources</h1>
      <div className="info-bar" role="note">
        <StatusIcon kind="idle" />
        <div>
          <p>
            Every data source you can see, in every folder, with its health from its last connection
            test.
          </p>
        </div>
      </div>
      {sources.isPending || me.isPending ? (
        <StateLine kind="run">Reading the data sources…</StateLine>
      ) : sources.isError ? (
        <StateLine kind="err">{sources.error.message}</StateLine>
      ) : (
        <DataSourcesList
          sources={sources.data}
          seesEveryFolder={me.data?.superAdmin === true}
          readWrite={me.data?.readWrite === true}
        />
      )}
    </div>
  );
}
