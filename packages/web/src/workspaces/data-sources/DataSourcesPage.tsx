import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { ME_QUERY } from '../../shell/me';
import { InfoBar } from '../../shell/InfoBar';
import { MenuButton } from '../../shell/MenuButton';
import { StateLine } from '../../shell/StatusIcon';
import type { Target } from '../explore/NewItemDialog';
import { CUBE_STORE_QUERY, cubeStoreListed } from './cubeStore';
import { DataSourcesList } from './DataSourcesList';
import { CubeStoreTurnOn } from './SqlRunner';
import { NewSourceWizard } from './NewSourceWizard';
import { DATA_SOURCES_QUERY } from './query';

/**
 * Data sources (T364; AC-157, AC-233): its title, a note saying what the
 * page is for, and every data source the user may see, in every folder.
 * Phase 1's placeholder said managing connections was not part of that
 * phase; data sources are now folders' items, landed in xcube (T335, T442).
 * `/sources` opens it too (routes.tsx).
 */
export function DataSourcesPage() {
  const sources = useQuery(DATA_SOURCES_QUERY);
  const me = useQuery(ME_QUERY);
  const queryClient = useQueryClient();
  /**
   * Cube Store (T536, AC-384; design 15's P5): while off, its switch is in
   * the header's ⋯, for a Super-Admin, whom alone the API tells of it then;
   * once on, a row of its own, to whoever may use it.
   */
  const cubeStore = useQuery(CUBE_STORE_QUERY);
  const [turningOn, setTurningOn] = useState(false);
  /** Turned on here: focus goes to its new row, the ⋯ being gone (T536's review). */
  const turnedOn = useRef(false);
  const more = useRef<HTMLSpanElement>(null);
  const listed = cubeStoreListed(cubeStore.data);
  useEffect(() => {
    if (!turnedOn.current || !listed) return;
    turnedOn.current = false;
    document.querySelector<HTMLElement>('[data-testid="source-cubestore"] a')?.focus();
  }, [listed]);
  /**
   * "+ Data source", as the approved prototype's page has it (T363): made in
   * My workspace, which a signed-in Super-Admin or read-write member has
   * (AC-276, AC-277), and the single user with sign-in off (T359, AC-254),
   * asking where it is to go (AC-282).
   */
  const hasWorkspace =
    me.data !== undefined &&
    (me.data.security === 'off' || me.data.superAdmin || me.data.readWrite === true);
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
              // Enabled while the pane is open, ringed as what opened it
              // (design 01's main screen; T691, SRC-16).
              className={adding === null ? 'btn btn-primary' : 'btn btn-primary is-open'}
              onClick={(event) => {
                // One at a time: pressed again while open, it takes you to
                // the pane, as Generate cubes' opener does (T485's review).
                // Its step's first tab stop (a roving radio group's chosen
                // tile, not one out of the tab order), else its ✕.
                if (adding !== null) {
                  const stop = ':not(:disabled):not([tabindex="-1"])';
                  document
                    .querySelector<HTMLElement>(
                      `.admin-page .source-pane__body :is(button, input, select, textarea, a[href])${stop}, .admin-page .source-pane__close${stop}`,
                    )
                    ?.focus();
                  return;
                }
                // Safari doesn't focus a button it clicks: focused here, it is
                // the opener the wizard gives focus back to (T496).
                event.currentTarget.focus();
                void add();
              }}
            >
              + Data source
            </button>
          ) : null}
          {me.data?.superAdmin === true && cubeStore.data?.on === false ? (
            <span ref={more}>
              <MenuButton
                label="More actions for Data sources"
                // The item heads' 32 px icon button (T684; R76 components-Q1).
                className="icon-button"
                items={[
                  {
                    key: 'cube-store',
                    label: 'Turn on the SQL runner for Cube Store…',
                    onSelect: () => {
                      setTurningOn(true);
                    },
                  },
                ]}
              >
                <span aria-hidden="true">⋯</span>
              </MenuButton>
            </span>
          ) : null}
        </div>
        {turningOn ? (
          <CubeStoreTurnOn
            onTurnedOn={() => {
              turnedOn.current = true;
            }}
            onClose={() => {
              setTurningOn(false);
              more.current?.querySelector('button')?.focus();
            }}
          />
        ) : null}
        {addFailed === null ? null : <StateLine kind="err">{addFailed}</StateLine>}
        <InfoBar>
          {/* Design 01's note (T496): how to change one, where there's a workspace to (T462). */}
          <p>
            Every data source you can see, in every folder.
            {hasWorkspace ? (
              <>
                {' '}
                To change one, open it and choose <b>Edit in my workspace</b>.
              </>
            ) : null}{' '}
            Health is the newest test of its stored settings.
          </p>
        </InfoBar>
        {sources.isPending || me.isPending ? (
          <StateLine kind="run">Reading the data sources…</StateLine>
        ) : sources.isError ? (
          <StateLine kind="err">{sources.error.message}</StateLine>
        ) : (
          <DataSourcesList
            sources={sources.data}
            seesEveryFolder={me.data?.superAdmin === true}
            readWrite={me.data?.readWrite === true}
            cubeStore={listed}
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
