import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';

import { ME_QUERY } from '../../shell/me';
import { StateLine } from '../../shell/StatusIcon';
import { SHARED_ROOT } from '../explore/roots';
import { CUBE_STORE_ID, CUBE_STORE_QUERY } from './cubeStore';
import { SqlTab, type SqlSource } from './SqlRunner';

/**
 * Cube Store's page (T536, AC-384, AC-374; design 15's state H2): among the
 * root's data sources once a Super-Admin turns its runner on, with its SQL
 * tab alone, for SELECT and EXPLAIN. Shown to Super-Admins, and once on to
 * those allowed on a data source in a folder switched on (Q7); to anyone else
 * it isn't there, as the API says. A Super-Admin who opens it while off finds
 * Turn on… on its tab, as in Data sources' ⋯ (P5).
 */
export function CubeStorePage() {
  const state = useQuery(CUBE_STORE_QUERY);
  const me = useQuery(ME_QUERY);
  const base = useId();
  if (state.isPending) return <StateLine kind="run">Reading Cube Store…</StateLine>;
  if (state.isError) return <StateLine kind="err">{state.error.message}</StateLine>;
  if (state.data === null)
    return <StateLine kind="err">There’s no such data source, or it isn’t yours to see.</StateLine>;
  const source: SqlSource = {
    cubeStore: true,
    id: CUBE_STORE_ID,
    version: 0,
    name: 'Cube Store',
    folderPath: [],
    inWorkspace: false,
    sqlRunner: {
      on: state.data.on,
      ...(state.data.confirmedBy === undefined ? {} : { confirmedBy: state.data.confirmedBy }),
      ...(state.data.confirmedAt === undefined ? {} : { confirmedAt: state.data.confirmedAt }),
      tab: true,
      runs: state.data.runs,
    },
  };
  return (
    <div className="source-settings">
      <nav aria-label="Breadcrumb" className="source-settings__crumbs">
        <a href="/explore">Explore</a>
        <span aria-hidden="true"> / </span>
        <a href={`/explore?folder=${encodeURIComponent(SHARED_ROOT.id)}`}>{SHARED_ROOT.title}</a>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Cube Store</span>
      </nav>
      <div className="source-settings__head">
        <h1 className="source-settings__name">Cube Store</h1>
        <span className="badge source-settings__driver">Read-only SQL</span>
      </div>
      <div className="source-settings__card">
        <div
          role="tablist"
          aria-label="Data source"
          className="edit-sidebar__tabs source-settings__tabs"
        >
          <button
            type="button"
            role="tab"
            id={`${base}-sql`}
            aria-selected="true"
            aria-controls={`${base}-sql-panel`}
            tabIndex={0}
          >
            SQL
          </button>
        </div>
        <div
          role="tabpanel"
          id={`${base}-sql-panel`}
          aria-labelledby={`${base}-sql`}
          className="source-settings__panel"
        >
          <SqlTab
            source={source}
            // With sign-in off, the one user holds every permission (AC-254).
            superAdmin={me.data?.superAdmin === true || me.data?.security === 'off'}
          />
        </div>
      </div>
    </div>
  );
}
