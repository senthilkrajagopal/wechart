import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { DRIVERS, type DriverType, type FieldValue } from '@wechart/core';
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';

import { ME_QUERY } from '../../shell/me';
import { shortAgo, shortDay } from '../../shell/relativeAge';
import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { TableScroll } from '../../shell/TableScroll';
import { onTabKey } from '../../shell/tabKeys';
import { useFocusTrap } from '../../shell/useFocusTrap';
import { MY_WORKSPACE, SHARED_ROOT } from '../explore/roots';
import { approvedText, HistoryPanel, historyQuery } from '../history/HistoryPanel';
import { RestoreDialogs, useRestore } from '../history/restore';
import { SourceVersion } from './SourceVersion';
import { WorkspaceBand } from '../explore/WorkspaceBand';
import { ProposalBand } from '../explore/ProposalBand';
import { ProposeFlow } from '../explore/ProposeFlow';
import { CubeState, cubeStateLabel, type CubeStateView } from './CubeState';
import type { ListedSource } from './DataSourcesList';
import { CHECK_LABELS } from './connectionTest';
import { DriverMark } from './driverMarks';
import { storedRowsOf, storedValuesOf } from './connectionSummary';
import { HealthBadge } from './health';
import {
  EditableConnection,
  EditableGeneral,
  EditFoot,
  LeaveGuard,
  useSourceEdit,
} from './SourceEditor';
import { DATA_SOURCES_QUERY } from './query';
import { SqlTab, type SqlRunnerState } from './SqlRunner';
import { MenuButton } from '../../shell/MenuButton';
import { DeleteDialog } from '../explore/DeleteDialog';
import { checkSource, openProposalOf, removeSource } from '../explore/deleteChecks';
import { sayOnExplore } from '../explore/deletedToast';
import { exploreHref } from '../explore/folders';
import { browserTimeZone } from '../explore/projectFolder';
import { generateFrom } from '../model/ModelFilePage';
import { cubeSourceOf } from './cubeSource';

/**
 * A stored data source's settings (T462; AC-269, AC-161, AC-163, AC-310),
 * drawn as design 03 of 2026-09-27: opened from its row in Explore or in
 * Data sources, under its folder's breadcrumb, with its name in the code
 * face, its driver, and a line saying where it is, where it came from and is
 * to go, its health and Cube's use of it. Five tabs: General, Connection,
 * Test history, Usage and In Cube.
 *
 * In a shared folder it is read-only: a read-write member changes it through
 * a copy in their workspace, "Edit in my workspace" (rule 71, AC-280). A copy
 * is headed as a draft, with Discard my copy.
 */

type Folder = { readonly id: string; readonly title: string };

export interface StoredSource {
  readonly id: string;
  readonly folderId: string;
  readonly name: string;
  readonly driver: DriverType;
  readonly authMethod: string;
  readonly fields: Readonly<Record<string, FieldValue>>;
  readonly secrets: Readonly<Record<string, { readonly stored: boolean }>>;
  readonly targetFolderId: string | null;
  readonly origin: {
    readonly id: string;
    readonly version: number;
    readonly folderId: string;
  } | null;
  readonly version: number;
  readonly updatedAt: string;
  readonly folderPath: readonly Folder[];
  /** Whether the user may change it in its folder (AC-262). */
  readonly canWrite: boolean;
  readonly inWorkspace: boolean;
  /** What it is for, in its own words (T499); null for none. */
  readonly description: string | null;
  readonly originPath?: readonly Folder[];
  readonly targetPath?: readonly Folder[];
  /** Its SQL runner's switch (T531): on, and who confirmed it when. */
  readonly sqlRunner?: Pick<SqlRunnerState, 'on' | 'confirmedBy' | 'confirmedAt'>;
  /** Its SQL tab, as this user may use it (T535); none where the API runs no SQL. */
  readonly sqlAccess?: Pick<SqlRunnerState, 'tab' | 'runs' | 'why' | 'needsSwitch'>;
}

interface HistoryTest {
  readonly id: string;
  readonly ranAt: string;
  readonly ok: boolean;
  readonly asStored: boolean;
  readonly checks: readonly {
    readonly id: string;
    readonly status: string;
    readonly durationMs?: number;
    readonly error?: string;
  }[];
  readonly by: { readonly key: string; readonly name: string } | null;
}

export const sourceQuery = (id: string) => ({
  queryKey: ['data-source', id],
  queryFn: async (): Promise<StoredSource> => {
    const response = await fetch(`/api/data-sources/${encodeURIComponent(id)}`);
    if (response.status === 404)
      throw new Error('There’s no such data source, or it isn’t yours to see.');
    if (!response.ok)
      throw new Error(`The data source could not be read (${String(response.status)}).`);
    return (await response.json()) as StoredSource;
  },
});

/** Its own folder's root: My workspace for one in a workspace, else Shared. */
const rootOf = (source: Pick<StoredSource, 'inWorkspace'>) =>
  source.inWorkspace ? MY_WORKSPACE : SHARED_ROOT;
/** Its own folder's path as Explore names it: its root by its title, then each folder's. */
const pathText = (source: StoredSource, path: readonly Folder[]) =>
  path.length === 0 ? rootOf(source).title : path.map((folder) => folder.title).join(' / ');
/**
 * A shared folder's path — what a copy came from, where it is to go: the
 * Shared root is "Shared", never the workspace the copy is in (T462's review).
 */
const sharedPathText = (path: readonly Folder[] | undefined) =>
  path === undefined || path.length === 0
    ? SHARED_ROOT.title
    : path.map((folder) => folder.title).join(' / ');
const folderHref = (id: string) => `/explore?folder=${encodeURIComponent(id)}`;

const TABS = [
  ['general', 'General'],
  ['connection', 'Connection'],
  ['history', 'Test history'],
  ['usage', 'Usage'],
  ['cube', 'In Cube'],
] as const;
/**
 * SQL, the sixth, last so the five keep their places (design 15, pin 1):
 * for Super-Admins and the folder's own read-write members, and a workspace
 * data source's owner; with its off panel while off, never greyed out (P1).
 */
const WITH_SQL = [...TABS, ['sql', 'SQL']] as const;
type Tab = (typeof WITH_SQL)[number][0];

export function SourceSettings({ id }: { id: string }) {
  const source = useQuery(sourceQuery(id));
  if (source.isPending) return <StateLine kind="run">Reading the data source…</StateLine>;
  if (source.isError) return <StateLine kind="err">{source.error.message}</StateLine>;
  // Keyed by the source: a copy opened from its original is another page's state.
  return <Settings key={source.data.id} source={source.data} />;
}

function Settings({ source }: { source: StoredSource }) {
  const base = useId();
  const queryClient = useQueryClient();
  const router = useRouter();
  const tabs: readonly (readonly [Tab, string])[] =
    source.sqlAccess?.tab === true ? WITH_SQL : TABS;
  // A link may name the tab to open on (`?tab=sql`, from My runs: T535's
  // review), where this user has it.
  const [tab, setTab] = useState<Tab>(() => {
    const asked = new URLSearchParams(globalThis.location.search).get('tab');
    return tabs.find(([key]) => key === asked)?.[0] ?? 'connection';
  });
  /** Proposing it again from its rejected band (T358). */
  /** Where "Propose again…" proposes it to, while its dialog is open. */
  const [proposingAgain, setProposingAgain] = useState<readonly string[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const me = useQuery(ME_QUERY);
  /**
   * Its versions, beside it (T515, AC-289; design 06, states A and D): for a
   * shared one, where the API shows them, to its folder's read-write members
   * and Super-Admins. A version is set against the settings now; restoring
   * one drafts it in My workspace, which opens to be tested and proposed.
   */
  // Signed in, and with sign-in off the single user, since R52 (T359, AC-254).
  const viaWorkspace = me.data !== undefined;
  const history = useQuery({
    ...historyQuery('data-source', source.id),
    enabled: viaWorkspace && !source.inWorkspace,
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyButton = useRef<HTMLButtonElement>(null);
  const [viewing, setViewing] = useState<number | undefined>(undefined);
  const restore = useRestore('data-source', source.id);
  /** A draft restored from a version: what to do next (T515). */
  const restoredFrom = new URLSearchParams(globalThis.location.search).get('restored');
  const list = useQuery(DATA_SOURCES_QUERY);
  const listed = list.data?.find((each) => each.id === source.id);
  /** A copy's original, whose cubes the copy stands in for (AC-280): its Usage. */
  const original =
    source.origin === null ? undefined : list.data?.find((each) => each.id === source.origin?.id);
  const root = rootOf(source);
  const discardButton = useRef<HTMLButtonElement>(null);
  /** Deleting a shared one (T526; design 14, state C). */
  const [deleting, setDeleting] = useState(false);
  const moreButton = useRef<HTMLSpanElement>(null);
  /**
   * Changed here where the user may write it, in their workspace (T497). A
   * shared one is changed through a copy (rule 71), with sign-in off too
   * since R52 (T359, AC-254).
   */
  const editable = source.canWrite && source.inWorkspace;
  const edit = useSourceEdit(source);
  /** A plain click on a link of the page's is followed by the router, which the leave guard sees. */
  const inApp = (event: MouseEvent<HTMLAnchorElement>) => {
    const link = event.currentTarget;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    router.history.push(link.getAttribute('href') ?? '/explore');
  };
  /** Changed through a copy in the user's workspace (rule 71), the single user's too (T359). */
  const copies =
    !source.inWorkspace &&
    source.canWrite &&
    me.data !== undefined &&
    (me.data.security === 'off' || me.data.superAdmin || me.data.readWrite === true);

  /**
   * Generating cubes from it (T492): by its connection's name in Cube, where
   * Cube lists it (a shared one), for one with a workspace or the single user.
   */
  const inCube = cubeSourceOf({
    name: source.name,
    folderId: source.folderId,
    inWorkspace: source.inWorkspace,
  });
  const mayGenerate =
    inCube !== undefined &&
    me.data !== undefined &&
    (me.data.security === 'off' || me.data.superAdmin || me.data.readWrite === true);

  const editInWorkspace = async () => {
    setFailed(null);
    // Into a project folder of its own, named in the user's time (T523, AC-368).
    const response = await fetch(`/api/data-sources/${encodeURIComponent(source.id)}/copy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timeZone: browserTimeZone() }),
    });
    if (!response.ok) {
      const said = (await response.json().catch(() => ({}))) as { error?: string };
      setFailed(said.error ?? `It could not be copied (${String(response.status)}).`);
      return;
    }
    const copy = (await response.json()) as StoredSource;
    void queryClient.invalidateQueries({ queryKey: DATA_SOURCES_QUERY.queryKey });
    router.history.push(`/explore/data-sources/${encodeURIComponent(copy.id)}`);
  };
  const discardCopy = async () => {
    const response = await fetch(`/api/data-sources/${encodeURIComponent(source.id)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      setAsking(false);
      discardButton.current?.focus();
      const said = (await response.json().catch(() => ({}))) as { error?: string };
      setFailed(said.error ?? `Your copy could not be discarded (${String(response.status)}).`);
      return;
    }
    void queryClient.invalidateQueries({ queryKey: DATA_SOURCES_QUERY.queryKey });
    // Gone, with whatever was changed in it: nothing left to ask about (T497's review).
    edit.release();
    globalThis.location.assign(folderHref(MY_WORKSPACE.id));
  };

  const page = (
    <div className="source-settings">
      {/* In the user's workspace, the page says so across its width (T498;
          design 04, pin 2; design 03). */}
      {source.inWorkspace && viaWorkspace ? <WorkspaceBand /> : null}
      {/* Its proposal's band: waiting, or rejected with the reason (T358, AC-290). */}
      {source.inWorkspace && viaWorkspace ? (
        <ProposalBand
          kind="data-source"
          id={source.id}
          onProposeAgain={(path) => {
            setProposingAgain(path);
          }}
        />
      ) : null}
      {proposingAgain !== null ? (
        <ProposeFlow
          item={{ kind: 'data-source', id: source.id, title: source.name }}
          targetPath={proposingAgain}
          onClose={() => {
            setProposingAgain(null);
          }}
          onProposed={() => {
            setProposingAgain(null);
          }}
        />
      ) : null}
      {/* Under its folder's breadcrumb, wherever it was opened from (pin 1). */}
      {/* Followed in the app, so leaving with unsaved changes is asked about (state I, T497). */}
      <nav aria-label="Breadcrumb" className="source-settings__crumbs">
        <a href="/explore" onClick={inApp}>
          Explore
        </a>
        <span aria-hidden="true"> / </span>
        <a href={folderHref(root.id)} onClick={inApp}>
          {root.title}
        </a>
        {source.folderPath.map((folder) => (
          <span key={folder.id}>
            <span aria-hidden="true"> / </span>
            <a href={folderHref(folder.id)} onClick={inApp}>
              {folder.title}
            </a>
          </span>
        ))}
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{source.name}</span>
      </nav>

      {/* Its name in the code face, its type and its state (pin 2). */}
      <div className="source-settings__head">
        <DriverMark type={source.driver} />
        <h1 className="is-code source-settings__name">{source.name}</h1>
        <span className="badge source-settings__driver">{DRIVERS[source.driver].label}</span>
        {source.inWorkspace ? <span className="badge source-settings__status">Draft</span> : null}
        <span className="source-settings__spacer" />
        {/* A copy only: one made new in the workspace is the only one there is. */}
        {source.inWorkspace && source.canWrite && source.origin !== null ? (
          <button
            ref={discardButton}
            type="button"
            className="btn"
            onClick={() => {
              setAsking(true);
            }}
          >
            Discard my copy…
          </button>
        ) : null}
        {history.data == null ? null : (
          <button
            ref={historyButton}
            type="button"
            className="btn btn-sm dashboard__history"
            data-history-button=""
            aria-pressed={historyOpen}
            onClick={() => {
              setHistoryOpen((was) => !was);
              setViewing(undefined);
            }}
          >
            History
          </button>
        )}
        {/* Its tables as cubes (T492; the user, 2026-10-02: "add generate cube
            within the datasource details page"): into My workspace's model,
            to go to its folder, for those with a workspace; with sign-in off,
            the root's model. */}
        {mayGenerate && inCube !== undefined && viewing === undefined ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              router.history.push(
                generateFrom(queryClient, {
                  source: inCube,
                  target: source.folderId,
                  signedIn: me.data?.security === 'oidc',
                }),
              );
            }}
          >
            Generate cubes…
          </button>
        ) : null}
        {/* Not while an old version shows (design 06, state A). */}
        {copies && viewing === undefined ? (
          <button type="button" className="btn btn-primary" onClick={() => void editInWorkspace()}>
            Edit in my workspace
          </button>
        ) : null}
        {/* Delete data source…, last, in the header's ⋯ (T526; design 14,
            state C1): a shared one, for those who may change its folder. A
            workspace copy keeps Discard my copy…, since no published cube is
            ever bound to a copy (AC-280). */}
        {!source.inWorkspace && source.canWrite && viewing === undefined ? (
          <span ref={moreButton}>
            <MenuButton
              label={`More actions for ${source.name}`}
              className="btn-ghost btn-sm"
              items={[
                {
                  key: 'delete',
                  label: 'Delete data source…',
                  danger: true,
                  onSelect: () => {
                    setDeleting(true);
                  },
                },
              ]}
            >
              <span aria-hidden="true">⋯</span>
            </MenuButton>
          </span>
        ) : null}
      </div>
      {failed === null ? null : <StateLine kind="err">{failed}</StateLine>}
      {restoredFrom !== null && source.inWorkspace ? (
        <StateLine kind="idle" testId="restored-draft">
          Restored from version {restoredFrom}. Test its connection, then propose it: a change to
          where or how it connects is proposed only once a test of it passes.
        </StateLine>
      ) : null}
      {viewing === undefined ? null : (
        <SourceVersion
          source={source}
          version={viewing}
          onClose={() => {
            setViewing(undefined);
          }}
          onRestore={() => {
            const kept = history.data?.versions.find((each) => each.version === viewing);
            if (kept !== undefined) restore.start({ ...kept, approvedText: approvedText(kept) });
          }}
          lastTest={listed === undefined ? undefined : <HealthBadge source={listed} phrased />}
        />
      )}

      {/* Where it is, where it came from and is to go, its health and Cube's use (pin 4). */}
      <div className="source-settings__line">
        {source.inWorkspace ? (
          <>
            {source.origin === null ? null : (
              <span className="source-settings__origin">
                Copied from {sharedPathText(source.originPath)} ›{' '}
                <a href={`/explore/data-sources/${encodeURIComponent(source.origin.id)}`}>
                  {source.name}
                </a>{' '}
                · version {String(source.origin.version)}
              </span>
            )}
            {source.targetPath === undefined ? null : (
              <span className="source-settings__target">
                Target: <b>{sharedPathText(source.targetPath)}</b>
              </span>
            )}
          </>
        ) : editable ? null : (
          <span className="badge source-settings__access">
            Read-only · in {pathText(source, source.folderPath)}
          </span>
        )}
        {/* Its version, as the line of a shared one says it (state A). */}
        <span className="source-settings__version">Version {String(source.version)}</span>
        {listed === undefined ? null : (
          <span className="source-settings__health">
            <HealthBadge source={listed} phrased />
          </span>
        )}
        <CubeUse id={source.id} />
      </div>

      {/* The tabs and the chosen one's panel, on one card. */}
      <div className="source-settings__card">
        <div
          role="tablist"
          aria-label="Data source"
          className="edit-sidebar__tabs source-settings__tabs"
        >
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`${base}-${key}`}
              aria-selected={tab === key}
              aria-controls={`${base}-${key}-panel`}
              tabIndex={tab === key ? 0 : -1}
              onClick={() => {
                setTab(key);
              }}
              onKeyDown={(event) => {
                onTabKey(event, (at) => {
                  setTab(tabs[at]?.[0] ?? key);
                });
              }}
            >
              {label}
              {/* A tab with unsaved changes carries a dot (pin 6). */}
              {editable &&
              ((key === 'general' && (edit.nameChanged || edit.descriptionChanged)) ||
                (key === 'connection' && edit.connects)) ? (
                <>
                  <span className="source-settings__dot" aria-hidden="true" />
                  <span className="visually-hidden">, changed</span>
                </>
              ) : null}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`${base}-${tab}-panel`}
          aria-labelledby={`${base}-${tab}`}
          className="source-settings__panel"
        >
          {tab === 'general' ? (
            <>
              {editable ? <EditableGeneral source={source} edit={edit} listed={listed} /> : null}
              <dl className="source-settings__rows">
                {editable ? null : (
                  <>
                    <dt>Name</dt>
                    <dd className="is-code">{source.name}</dd>
                    <dt>Description</dt>
                    <dd className="source-settings__description">{source.description ?? '—'}</dd>
                  </>
                )}
                <dt>Folder</dt>
                <dd>{pathText(source, source.folderPath)}</dd>
                <dt>Version</dt>
                <dd>{String(source.version)}</dd>
              </dl>
            </>
          ) : tab === 'connection' && editable ? (
            <EditableConnection source={source} edit={edit} />
          ) : tab === 'connection' ? (
            <dl className="source-settings__rows">
              {storedRowsOf(
                source.driver,
                storedValuesOf(source.driver, source.authMethod, source.fields),
                Object.entries(source.secrets)
                  .filter(([, secret]) => secret.stored)
                  .map(([field]) => field),
              ).map(([label, value]) => (
                <Row key={label} label={label} value={value} />
              ))}
            </dl>
          ) : tab === 'history' ? (
            <TestHistory id={source.id} />
          ) : tab === 'usage' ? (
            list.isError ? (
              <StateLine kind="err">{list.error.message}</StateLine>
            ) : (
              <Usage source={source} listed={source.origin === null ? listed : original} />
            )
          ) : tab === 'sql' && source.sqlAccess !== undefined ? (
            <SqlTab
              source={{
                id: source.id,
                version: source.version,
                name: source.name,
                driver: source.driver,
                fields: source.fields,
                folderPath: source.folderPath,
                inWorkspace: source.inWorkspace,
                sqlRunner: { on: false, ...source.sqlRunner, ...source.sqlAccess },
              }}
              // With sign-in off, the one user holds every permission (AC-254).
              superAdmin={me.data?.superAdmin === true || me.data?.security === 'off'}
            />
          ) : (
            <InCube id={source.id} />
          )}
        </div>
      </div>
      {editable ? (
        <>
          <EditFoot edit={edit} />
          <LeaveGuard source={source} edit={edit} />
        </>
      ) : null}

      {deleting ? (
        <DeleteDialog
          name={source.name}
          action="Delete data source"
          check={checkSource(source.id)}
          remove={removeSource(source.id)}
          onDeleted={() => {
            setDeleting(false);
            // Its folder opens, saying so; the Data sources list drops it (state C).
            sayOnExplore(`Deleted “${source.name}”.`);
            void queryClient.invalidateQueries({ queryKey: DATA_SOURCES_QUERY.queryKey });
            void queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
            void queryClient.invalidateQueries({ queryKey: ['folders'] });
            void queryClient.invalidateQueries({ queryKey: ['folder-roots'] });
            edit.release();
            router.history.push(exploreHref(source.folderId));
          }}
          onClose={() => {
            setDeleting(false);
            // Back on the ⋯ it came from (design 14, keyboard).
            moreButton.current?.querySelector<HTMLButtonElement>('button')?.focus();
          }}
        />
      ) : null}
      {asking ? (
        <AskToDiscardCopy
          source={source}
          onKeep={() => {
            setAsking(false);
            // Back on what asked (T462's review).
            discardButton.current?.focus();
          }}
          onDiscard={() => void discardCopy()}
        />
      ) : null}
      <RestoreDialogs
        kind="data-source"
        restore={restore}
        onProposed={() => undefined}
        onDrafted={(draftId, version) => {
          restore.close();
          router.history.push(
            `/explore/data-sources/${encodeURIComponent(draftId)}?restored=${String(version)}`,
          );
        }}
      />
    </div>
  );
  return (
    <div className="with-panel" data-open={historyOpen ? 'true' : undefined}>
      <div className="with-panel__main">{page}</div>
      {historyOpen ? (
        <HistoryPanel
          kind="data-source"
          id={source.id}
          viewing={viewing}
          onView={setViewing}
          onRestore={restore.start}
          onClose={() => {
            setHistoryOpen(false);
            setViewing(undefined);
            // Back on what opened it (rule 85).
            historyButton.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

/** Said in words, not the code face: what isn't a name or an address (design 03 state A). */
const IN_WORDS = new Set(['Type', 'TLS', 'Given']);

function Row({ label, value }: { label: string; value: string }) {
  const who = label === 'Signs in with' ? /^(.*), as (.+)$/.exec(value) : null;
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {value === 'Stored · encrypted' ? (
          <span className="source-settings__stored">
            <span className="secret-pasted__lock" aria-hidden="true" />
            {value}
          </span>
        ) : label === 'Signs in with' ? (
          // "Password, as cube_reader": the way in words, the name in the code face.
          who === null ? (
            value
          ) : (
            <>
              {who[1]}, as <span className="is-code">{who[2]}</span>
            </>
          )
        ) : IN_WORDS.has(label) || IN_WORDS.has(value) ? (
          value
        ) : (
          <span className="is-code">{value}</span>
        )}
      </dd>
    </>
  );
}

/** Cube's use of it, in the head's line: its state and how many instances told (pin 4). */
function CubeUse({ id }: { id: string }) {
  const state = useCubeState(id);
  if (state.data === undefined) return null;
  const { kind, label } = cubeStateLabel(state.data);
  const count = withinTheHour(state.data, new Date()).length;
  return (
    <span className={`status status--${kind} source-settings__cube-use`}>
      <StatusIcon kind={kind} />
      {label}
      {count === 0 ? null : (
        <span className="status__when">
          {' · '}
          {count === 1 ? '1 instance' : `${String(count)} instances`}
        </span>
      )}
    </span>
  );
}

function useCubeState(id: string) {
  return useQuery({
    queryKey: ['data-source', id, 'cube-state'],
    queryFn: async (): Promise<CubeStateView> => {
      const response = await fetch(`/api/data-sources/${encodeURIComponent(id)}/cube-state`);
      if (!response.ok) {
        const said = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          said.error ?? `Cube’s use of it could not be read (${String(response.status)}).`,
        );
      }
      return (await response.json()) as CubeStateView;
    },
    // Asked again each minute while the page is open: an instance's report ages out of the
    // hour, and Cube picks a change up as it runs (AC-161; T462's review).
    refetchInterval: 60_000,
  });
}

const HOUR = 60 * 60 * 1000;
/** Only instances that reported within the hour, as of now, not as of the answer (AC-161). */
const withinTheHour = (view: CubeStateView, now: Date) =>
  view.state === 'unlanded'
    ? []
    : view.instances.filter(
        (instance) => now.getTime() - new Date(instance.reportedAt).getTime() <= HOUR,
      );

/** When a test ran, short, on one 24-hour clock: "Today 14:21", "Sep 24, 09:40" (state E). */
function shortWhen(then: Date, now: Date): string {
  const clock = then.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return then.toDateString() === now.toDateString()
    ? `Today ${clock}`
    : `${shortDay(then, now)}, ${clock}`;
}

/**
 * Its tests, newest first (AC-163; design 03 state E): when, who ran it, its
 * outcome in icon and words, whether of the stored settings or a trial of
 * changes, and each check; a failure opens to its check and Cube's text.
 */
function TestHistory({ id }: { id: string }) {
  const tests = useQuery({
    queryKey: ['data-source', id, 'tests'],
    queryFn: async (): Promise<HistoryTest[]> => {
      const response = await fetch(`/api/data-sources/${encodeURIComponent(id)}/tests`);
      if (!response.ok)
        throw new Error(`Its tests could not be read (${String(response.status)}).`);
      return (await response.json()) as HistoryTest[];
    },
  });
  if (tests.isPending) return <StateLine kind="run">Reading its tests…</StateLine>;
  if (tests.isError) return <StateLine kind="err">{tests.error.message}</StateLine>;
  if (tests.data.length === 0)
    return <p className="source-settings__none">It hasn’t been tested yet.</p>;
  const now = new Date();
  return (
    <TableScroll label="Tests">
      <table className="query-log source-settings__history" aria-label="Tests">
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Run by</th>
            <th scope="col">Outcome</th>
            <th scope="col">Of</th>
            <th scope="col">Checks</th>
          </tr>
        </thead>
        <tbody>
          {tests.data.map((test) => {
            const failed = test.checks.find((check) => check.status === 'failed');
            return (
              <tr key={test.id}>
                <td>
                  <time dateTime={test.ranAt} title={new Date(test.ranAt).toLocaleString()}>
                    {shortWhen(new Date(test.ranAt), now)}
                  </time>
                </td>
                <td>{test.by?.name ?? '—'}</td>
                <td>
                  <span className={`status status--${test.ok ? 'ok' : 'err'}`}>
                    <StatusIcon kind={test.ok ? 'ok' : 'err'} />
                    {test.ok ? 'Passed' : 'Failed'}
                  </span>
                  {failed === undefined ? null : (
                    <span className="source-settings__failure">
                      Failed at {CHECK_LABELS[failed.id] ?? failed.id}
                      {failed.error === undefined ? null : (
                        <code className="source-settings__error">{failed.error}</code>
                      )}
                    </span>
                  )}
                </td>
                <td>{test.asStored ? 'Stored settings' : 'Trial of changes'}</td>
                <td>
                  <span className="source-settings__checks">
                    {test.checks.map((check) => {
                      const kind =
                        check.status === 'passed'
                          ? 'ok'
                          : check.status === 'failed'
                            ? 'err'
                            : 'idle';
                      return (
                        <span
                          key={check.id}
                          className={`status status--${kind}`}
                          title={`${CHECK_LABELS[check.id] ?? check.id}: ${check.status}`}
                        >
                          <StatusIcon kind={kind} />
                          <span className="visually-hidden">
                            {CHECK_LABELS[check.id] ?? check.id}: {check.status}
                          </span>
                        </span>
                      );
                    })}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableScroll>
  );
}

/**
 * The published cubes bound to it, with their folders (design 03 state F),
 * as Data sources lists them (T459): a change's reach, seen before it is
 * proposed. Those in folders the user can't see are counted, never named.
 */
function Usage({ source, listed }: { source: StoredSource; listed: ListedSource | undefined }) {
  if (listed === undefined) return <StateLine kind="run">Reading which cubes use it…</StateLine>;
  if (listed.usedBy === null)
    return (
      <p className="source-settings__none">Not known: Cube didn’t answer which cubes use it.</p>
    );
  const hidden = listed.usedElsewhere ?? 0;
  return (
    <div className="source-settings__usage">
      {listed.usedBy.length === 0 ? (
        <p className="source-settings__none">No published cube uses it.</p>
      ) : (
        <table className="query-log" aria-label={`Cubes using ${source.name}`}>
          <thead>
            <tr>
              <th scope="col">Cube</th>
              <th scope="col">Model</th>
              <th scope="col">Folder</th>
            </tr>
          </thead>
          <tbody>
            {listed.usedBy.map((cube) => (
              <tr key={`${cube.folderId}/${cube.name}`}>
                <td className="is-code">{cube.name}</td>
                {/* Its model file, by name, the whole path in its tooltip (T499; state F). */}
                <td className="is-code" title={cube.file}>
                  {cube.file === undefined ? '—' : (cube.file.split('/').at(-1) ?? cube.file)}
                </td>
                <td>
                  <a href={folderHref(cube.folderId)}>
                    {cube.folderPath.length === 0
                      ? SHARED_ROOT.title
                      : cube.folderPath.map((folder) => folder.title).join(' / ')}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hidden === 0 ? null : (
        <p className="source-settings__none">
          {hidden === 1
            ? '1 more cube uses it, in a folder you can’t see.'
            : `${String(hidden)} more cubes use it, in folders you can’t see.`}
        </p>
      )}
      <p className="info-bar source-settings__note" role="note">
        <StatusIcon kind="info" />
        Cubes bind to a data source when they’re published, and keep that binding until they’re
        published again.
      </p>
    </div>
  );
}

/**
 * Cube's use of it (AC-161; design 03 states G and H): its state, then each
 * instance that reported within the hour, on which version, live or not.
 */
function InCube({ id }: { id: string }) {
  const state = useCubeState(id);
  if (state.isPending) return <StateLine kind="run">Asking Cube…</StateLine>;
  if (state.isError) return <StateLine kind="err">{state.error.message}</StateLine>;
  const view = state.data;
  const now = new Date();
  const instances = withinTheHour(view, now);
  return (
    <div className="source-settings__cube">
      <CubeState view={view} />
      {instances.length === 0 ? null : (
        <>
          <TableScroll label="Cube instances">
            <table className="query-log" aria-label="Cube instances">
              <thead>
                <tr>
                  <th scope="col">Instance</th>
                  <th scope="col">Settings</th>
                  <th scope="col">State</th>
                  <th scope="col">Reported</th>
                </tr>
              </thead>
              <tbody>
                {instances.map((instance) => {
                  const kind = !instance.current
                    ? 'idle'
                    : instance.state === 'live'
                      ? 'ok'
                      : 'err';
                  return (
                    <tr key={instance.instance}>
                      <td className="is-code">{instance.instance}</td>
                      <td>
                        {instance.version === null ? '—' : `Version ${String(instance.version)}`}
                      </td>
                      <td>
                        <span className={`status status--${kind}`}>
                          <StatusIcon kind={kind} />
                          {!instance.current
                            ? 'Previous version'
                            : instance.state === 'live'
                              ? 'Live'
                              : 'Failed'}
                        </span>
                      </td>
                      <td title={new Date(instance.reportedAt).toLocaleString()}>
                        {shortAgo(new Date(instance.reportedAt), now)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
          <p className="source-settings__none">
            Only instances that reported within the last hour are listed.
          </p>
        </>
      )}
    </div>
  );
}

/** "Discard my copy…" asks first (rule 85): its answer that loses nothing is focused. */
function AskToDiscardCopy({
  source,
  onKeep,
  onDiscard,
}: {
  source: StoredSource;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  useFocusTrap(box);
  /**
   * The open proposal it waits in, which discarding it withdraws, named first
   * (T528, AC-372): read afresh as the dialog opens, never from a cache that
   * may predate a proposal, and Discard waits for it (T528's review).
   */
  const proposal = useQuery({
    queryKey: ['open-proposal', 'data-source', source.id],
    queryFn: () => openProposalOf('data-source', source.id),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    retry: false,
  });
  const withdraws = proposal.data?.[0];
  const known = proposal.isSuccess && !proposal.isFetching;
  // Read through a ref: the page's re-renders mustn't pull focus back to Keep (T462's review).
  const keeping = useRef(onKeep);
  useEffect(() => {
    keeping.current = onKeep;
  }, [onKeep]);
  useEffect(() => {
    keep.current?.focus();
    // Esc keeps it, as the answer that loses nothing.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') keeping.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  return (
    <div className="source-settings__veil">
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={withdraws === undefined ? `${ids}-body` : `${ids}-body ${ids}-withdraws`}
        className="source-pane__ask"
      >
        <h3 id={`${ids}-title`}>Discard your copy?</h3>
        <p id={`${ids}-body`}>
          Your copy of <span className="is-code">{source.name}</span>, and any change in it, is
          removed.
          {source.origin === null ? '' : ` ${sharedPathText(source.originPath)} keeps its own.`}
        </p>
        {withdraws === undefined ? null : (
          <p
            id={`${ids}-withdraws`}
            className="source-pane__ask-withdraws"
            data-testid="discard-withdraws"
          >
            It withdraws its open proposal, waiting for review: <b>{withdraws.title}</b> →{' '}
            {withdraws.targetPath} · {shortDay(new Date(withdraws.proposedAt), new Date())}.
          </p>
        )}
        {proposal.isError ? (
          <StateLine kind="err">
            Whether it waits in a proposal couldn’t be read, so it can’t be discarded yet:{' '}
            {proposal.error.message}
          </StateLine>
        ) : null}
        <div className="source-pane__ask-actions">
          <button ref={keep} type="button" className="btn" onClick={onKeep}>
            Keep it
          </button>
          {/* Not until what it withdraws is known, so it is named first (AC-372). */}
          <button type="button" className="btn btn-danger" disabled={!known} onClick={onDiscard}>
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
