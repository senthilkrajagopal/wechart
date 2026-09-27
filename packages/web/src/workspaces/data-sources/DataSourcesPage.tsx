import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Me } from '../../shell/AccountMenu';
import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import type { Target } from '../explore/NewItemDialog';
import { DataSourcesList, type ListedSource } from './DataSourcesList';
import { NewSourceWizard } from './NewSourceWizard';

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
  const queryClient = useQueryClient();
  /**
   * "+ Data source", as the approved prototype's page has it (T363): made in
   * My workspace, which a signed-in Super-Admin or read-write member has
   * (AC-276, AC-277), asking where it is to go (AC-282).
   */
  const hasWorkspace =
    me.data?.security === 'oidc' && (me.data.superAdmin || me.data.readWrite === true);
  const [adding, setAdding] = useState<readonly Target[] | null>(null);
  const [addFailed, setAddFailed] = useState<string | null>(null);
  const add = async () => {
    setAddFailed(null);
    try {
      const response = await fetch('/api/folders/targets');
      if (!response.ok) throw new Error(`error ${String(response.status)}`);
      setAdding((await response.json()) as Target[]);
    } catch (error) {
      setAddFailed(`Could not list the folders it may go to: ${(error as Error).message}`);
    }
  };

  return (
    // The wizard docks beside the list, which stays in view (T471, design 01).
    <div className={adding === null ? 'admin-page' : 'admin-page admin-page--docked'}>
      <div className="admin-page__main">
        <div className="admin-page__head">
          <h1 className="workspace-title">Data sources</h1>
          {hasWorkspace ? (
            <button
              type="button"
              className="btn btn-primary"
              // One at a time: open, it is where the new one is made.
              disabled={adding !== null}
              onClick={() => void add()}
            >
              + Data source
            </button>
          ) : null}
        </div>
        {addFailed === null ? null : <StateLine kind="err">{addFailed}</StateLine>}
        <div className="info-bar" role="note">
          <StatusIcon kind="idle" />
          <div>
            <p>
              Every data source you can see, in every folder, with its health from its last
              connection test.
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
      {adding === null ? null : (
        <NewSourceWizard
          folderId="mine"
          targets={adding}
          onClose={() => {
            setAdding(null);
          }}
          onCreated={() => {
            setAdding(null);
            void queryClient.invalidateQueries({ queryKey: ['data-sources'] });
          }}
        />
      )}
    </div>
  );
}
