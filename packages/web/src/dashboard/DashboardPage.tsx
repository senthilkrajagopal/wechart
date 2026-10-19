import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  readChartDocument,
  type ChartDocument,
  type DashboardParameter,
  type RenderSpec,
} from '@wechart/core';

import { answerMetaOf, type AnswerMeta } from '../query/answerMeta';
import { loadTile } from '../query/loadTile';
import { metaQueryOf, useWorkspaceItem, WorkspaceItemContext } from '../query/meta';
import { reachFrom } from '../filters/coverage';
import { primaryKeyOf } from './markings/primaryKey';
import { allMembers } from '../filters/FilterBar';
import type { FilterValues } from '../filters/model';
import { CHART_MISSING, formatsFrom, tileChartFollowing, type TileChart } from './chartSpec';
import { StateLine } from '../shell/StatusIcon';
import { DashboardLoading } from './DashboardLoading';
import { ROOT_FOLDERS, SHARED_ROOT } from '../workspaces/explore/roots';
import { useRouter } from '@tanstack/react-router';
import { DeleteDialog } from '../workspaces/explore/DeleteDialog';
import { checkDashboard, removeDashboard } from '../workspaces/explore/deleteChecks';
import { sayOnExplore } from '../workspaces/explore/deletedToast';
import { ProposalBand } from '../workspaces/explore/ProposalBand';
import { ProposeFlow } from '../workspaces/explore/ProposeFlow';
import { hasWorkspace, ME_QUERY } from '../shell/me';
import {
  approvedText,
  HistoryPanel,
  historyQuery,
  type KeptVersion,
} from '../workspaces/history/HistoryPanel';
import { RestoreDialogs, useRestore, type RestoringVersion } from '../workspaces/history/restore';
import { refreshReviews } from '../workspaces/reviews/reviews';
import { EditInWorkspaceDialog } from '../workspaces/explore/EditInWorkspaceDialog';
import { exploreHref, FOLDERS_QUERY, targetPathOf } from '../workspaces/explore/folders';
import { placeOf, type ItemWorkspace } from '../workspaces/explore/placeOf';
import { WorkspaceBand } from '../workspaces/explore/WorkspaceBand';
import { DashboardView, type DashboardViewProps } from './DashboardView';
import { chartWritesOf, drawnWithDrafts } from './edit/chartDrafts';
import { saveDashboard, type CopiedChart } from './edit/save';
import { chartIdsOf, type DashboardDocument } from './model/document';
import type { QueryItem } from '../query/item';
import type { ViewState } from './bookmarks/viewState';
import { dashboardOf, type StoredDocument } from './model/stored';

/**
 * The dashboard route (AC-018): load the saved document, load each of its
 * charts, and hand both to the view.
 *
 * Fetching lives here rather than in `DashboardView` for the reason the rest
 * of the app already follows — `FolderContents` takes its rows, `ChartTile`
 * takes its spec. A view that fetches cannot be rendered in a test without a
 * server, and cannot be reused inside the editor's preview.
 */
/** A request the server answered with an error status, which it carries. */
class HttpError extends Error {
  constructor(readonly status: number) {
    super(`Request failed: ${String(status)}`);
    this.name = 'HttpError';
  }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new HttpError(response.status);
  return (await response.json()) as T;
}

// Read as `model/stored` reads it, where Copy › To dashboard reads one too
// (T271); exported from here still for what imported it from the page.
export { dashboardOf, DashboardDocumentError } from './model/stored';

/** Each chart's drawn spec, or why it could not be drawn — the charts query's data. */
interface DrawnCharts {
  specs: Record<string, RenderSpec>;
  errors: Record<string, unknown>;
  /** Each chart's document as read, which filters re-query and tiles are named by (F9). */
  documents: Record<string, ChartDocument>;
  /** What Cube said of each chart's answer: when from, and from what (T154, T014). */
  answered: Record<string, AnswerMeta>;
}

/** A save, whole: nothing it needs is read from the render it started in. */
interface SaveVariables {
  readonly id: string;
  readonly next: DashboardDocument;
  readonly drafts: DashboardDocument['chartDrafts'];
  /** The dashboard's version, which the server checks the save against. */
  readonly version: number;
}

export interface DashboardPageProps {
  readonly dashboardId: string;
  /** The tile whose chart the URL has open in the editor (T196, AC-002). */
  readonly editTile?: string | undefined;
  /** Put a tile in the URL as the one open in the editor, or none (T196). */
  readonly onEditTile?: ((tileId: string | undefined) => void) | undefined;
  /** Open in edit mode, as a new dashboard from Explore's New is (T245). */
  readonly startEditing?: boolean | undefined;
  /** Edit mode was entered as asked: take the request out of the URL (T245). */
  readonly onStartedEditing?: (() => void) | undefined;
  /** A tile whose Properties to open asking for a folder, once (T463, AC-127). */
  readonly publishTile?: string | undefined;
  /** That ask was taken, or can't be: take it out of the URL (T463). */
  readonly onPublishTaken?: (() => void) | undefined;
  /** The filter values the URL holds now (AC-081). */
  readonly urlFilterValues?: FilterValues | undefined;
  /** Put these filter values in the URL (AC-081). */
  readonly onFilterValues?: ((values: FilterValues) => void) | undefined;
  /** What a link with marks carries: its page tab, marks and marking filters (T129, AC-123). */
  readonly urlView?: ViewState | undefined;
  /** The link's view is taken: drop it from the URL (T129). */
  readonly onViewTaken?: (() => void) | undefined;
  /**
   * A security context previewed from the Security workspace (T172, AC-166):
   * every query this dashboard asks is signed with its claims.
   */
  readonly preview?: Readonly<Record<string, unknown>> | undefined;
  /** Leave the preview: the dashboard as wechart itself asks. */
  readonly onExitPreview?: (() => void) | undefined;
  /** The panel the address has open beside it: History (T357). */
  readonly panel?: 'history' | undefined;
  /** Open or close a panel, in the address. */
  readonly onPanel?: ((panel: 'history' | undefined) => void) | undefined;
}

export function DashboardPage({
  dashboardId,
  editTile,
  onEditTile,
  startEditing,
  onStartedEditing,
  publishTile,
  onPublishTaken,
  urlFilterValues,
  onFilterValues,
  urlView,
  onViewTaken,
  preview,
  onExitPreview,
  panel,
  onPanel,
}: DashboardPageProps) {
  const saved = useQuery({
    queryKey: ['dashboard', dashboardId],
    // Parsed here rather than during render: a body that cannot be read
    // becomes a query error this page already knows how to show, instead of
    // an exception thrown inside render with no boundary above it.
    queryFn: async () => {
      const stored = await getJson<StoredDocument>(
        `/api/documents/dashboard/${encodeURIComponent(dashboardId)}`,
      );
      const { body, workspace } = stored as StoredDocument & { workspace?: ItemWorkspace };
      return {
        document: dashboardOf(stored),
        version: stored.version ?? 1,
        // Where it lives, with sign-in on (T348): shared, or the user's workspace's.
        workspace,
        origin: body['origin'] as { id: string; version: number; folderId?: string } | undefined,
        targetFolderId:
          typeof body['targetFolderId'] === 'string' ? body['targetFolderId'] : undefined,
      };
    },
  });

  const document = saved.data?.document;
  // As the shell asks it, so this reads what the shell already has.
  const me = useQuery({ ...ME_QUERY, retry: false });
  /**
   * Shared work is changed through My workspace and a proposal, with its
   * history and its author's band: signed in, and with sign-in off too, by
   * the single user, since R52 (T359, AC-254).
   */
  const viaWorkspace = me.data !== undefined;
  /** Where "Propose again…" proposes it to, while its dialog is open. */
  const [proposingAgain, setProposingAgain] = useState<readonly string[] | null>(null);
  // Its History (T357, AC-289): offered only where the API shows it, to the
  // folder's read-write members and Super-Admins.
  const history = useQuery({ ...historyQuery('dashboard', dashboardId), enabled: viaWorkspace });
  const mayHistory = viaWorkspace && history.data != null;
  const historyOpen = mayHistory && panel === 'history';
  /** A kept version drawn in its place (design 06, state A). */
  const [viewing, setViewing] = useState<number | undefined>(undefined);
  const restore = useRestore('dashboard', dashboardId);
  /**
   * History closes as editing begins (T357's review): a version drawn in the
   * dashboard's place would end the edit session, and History is for reading.
   */
  const closeHistoryWhileEditing = useCallback(
    (editing: boolean) => {
      if (!editing || panel !== 'history') return;
      setViewing(undefined);
      onPanel?.(undefined);
    },
    [panel, onPanel],
  );
  // Where it lives and how it's changed (T348, AC-278; T359).
  const folders = useQuery({ ...FOLDERS_QUERY, enabled: viaWorkspace });
  const [copying, setCopying] = useState(false);
  const current = history.data?.versions.find((each) => each.current);
  const place =
    saved.data === undefined
      ? undefined
      : placeOf({
          title: saved.data.document.title,
          folderId: saved.data.document.folderId,
          version: saved.data.version,
          ...(saved.data.origin === undefined ? {} : { origin: saved.data.origin }),
          targetFolderId: saved.data.targetFolderId,
          workspace: saved.data.workspace,
          folders: folders.data,
          approved: current?.approver == null ? undefined : approvedText(current),
        });
  const placeActions =
    place === undefined
      ? undefined
      : {
          line: place.line,
          editsElsewhere: place.kind === 'shared',
          copy:
            place.kind === 'shared' && place.copy !== undefined
              ? {
                  label: place.copy.label,
                  onClick: () => {
                    // Their copy opens to be edited, as a new one does (AC-278).
                    const copyId = place.copy?.copyId ?? null;
                    if (copyId !== null)
                      globalThis.location.assign(
                        `/explore/dashboards/${encodeURIComponent(copyId)}?editing=true`,
                      );
                    else setCopying(true);
                  },
                }
              : undefined,
          proposeTo:
            place.kind === 'workspace' && place.proposeTo !== undefined
              ? {
                  label: place.proposeTo.label,
                  onClick: () => {
                    setProposingAgain(place.proposeTo!.targetPath);
                  },
                }
              : undefined,
        };
  /**
   * Delete dashboard…, in its header's ⋯ (design 14, B2; T528): for those
   * who may change its folder, in their workspace, or as a shared folder's
   * read-write member, who may copy it; the single user with sign-in off too.
   * Its own charts and its bookmarks go with it (AC-363); in the workspace
   * its open proposal is withdrawn, named first (AC-372).
   */
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const mayDelete =
    me.data !== undefined &&
    saved.data !== undefined &&
    // No place said: a server with no workspaces, as phase 1's was.
    (place === undefined ||
      place.kind === 'workspace' ||
      (place.kind === 'shared' && place.copy !== undefined));
  /** A restore proposed: what to say, and where to review it (state E). */
  const [restored, setRestored] = useState<{ text: string; proposalId: string } | undefined>(
    undefined,
  );

  /**
   * A request to open in edit mode (T245) that can never be met — the
   * dashboard would not load — is forgotten as well, so a reload once the
   * server is back opens it to be read (T245's review).
   */
  const failed = saved.isError && document === undefined;
  useEffect(() => {
    if (failed && startEditing === true) onStartedEditing?.();
    if (failed && publishTile !== undefined) onPublishTaken?.();
  }, [failed, startEditing, onStartedEditing, publishTile, onPublishTaken]);

  // Its frame, not a lone "Loading…" (T251, F15).
  if (saved.isPending) return <DashboardLoading />;
  /**
   * The error only when there is no dashboard to show. A fetch that fails
   * after one has loaded — the library fetches again on its own, on
   * reconnecting once the data is stale — keeps what it had (research,
   * Answer 4); putting an error in its place took any edit session on it
   * down with it, AC-184's failing state reached without a save (T197).
   */
  if (document === undefined)
    return (
      <StateLine kind="err" testId="dashboard-error">
        {(saved.error as Error | null)?.message ?? 'This dashboard could not be opened.'}
      </StateLine>
    );

  /**
   * In My workspace, its field list is its overlay's, and its pickers offer
   * its target's path after the workspace's own cubes (T347; AC-323, AC-329).
   */
  const workspaceItem =
    saved.data?.workspace?.inWorkspace === true
      ? {
          item: { kind: 'dashboard' as const, id: dashboardId },
          targetFolderId: saved.data.targetFolderId,
        }
      : undefined;

  return (
    <WorkspaceItemContext.Provider value={workspaceItem}>
      {/* In My workspace, the place says it is theirs alone (T348; design
          04, pin 2 and state F). */}
      {saved.data?.workspace?.inWorkspace === true ? <WorkspaceBand /> : null}
      {/* Its author's band: waiting, or rejected with the reason (T358,
          AC-290). None for anyone else; the single user's too (T359). */}
      {viaWorkspace ? (
        <ProposalBand
          kind="dashboard"
          id={dashboardId}
          onProposeAgain={(path) => {
            setProposingAgain(path);
          }}
        />
      ) : null}
      {proposingAgain !== null ? (
        <ProposeFlow
          item={{ kind: 'dashboard', id: dashboardId, title: document.title }}
          targetPath={proposingAgain}
          onClose={() => {
            setProposingAgain(null);
          }}
          onProposed={() => {
            setProposingAgain(null);
          }}
        />
      ) : null}
      {copying ? (
        <EditInWorkspaceDialog
          dashboardId={dashboardId}
          title={document.title}
          // Back to the folder it lives in now.
          targetPath={
            (document.folderId === undefined
              ? undefined
              : targetPathOf(folders.data ?? [], document.folderId)) ?? 'its folder'
          }
          onClose={() => {
            setCopying(false);
          }}
          onCopied={(copyId) => {
            // The copy, to be edited (design 04, state D's "Copy and edit").
            globalThis.location.assign(
              `/explore/dashboards/${encodeURIComponent(copyId)}?editing=true`,
            );
          }}
        />
      ) : null}
      {deleting ? (
        <DeleteDialog
          name={document.title}
          action="Delete dashboard"
          check={checkDashboard(dashboardId, place?.kind === 'workspace')}
          remove={removeDashboard(dashboardId)}
          onDeleted={() => {
            setDeleting(false);
            // Its folder opens, saying so (design 14, B).
            sayOnExplore(`Deleted “${document.title}”.`);
            void queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
            void queryClient.invalidateQueries({ queryKey: ['folders'] });
            void queryClient.invalidateQueries({ queryKey: ['folder-roots'] });
            void refreshReviews(queryClient);
            router.history.push(exploreHref(document.folderId ?? SHARED_ROOT.id));
          }}
          onClose={() => {
            setDeleting(false);
            // Back on the ⋯ it came from (design 14, keyboard).
            window.document.querySelector<HTMLElement>('[data-testid="dashboard-more"]')?.focus();
          }}
        />
      ) : null}
      <RestoreDialogs
        kind="dashboard"
        restore={restore}
        onProposed={(text, proposalId) => {
          setRestored({ text, proposalId });
          setViewing(undefined);
        }}
      />
      {restored === undefined ? null : (
        <StateLine kind="ok" testId="restore-proposed">
          {restored.text}{' '}
          <a href={`/reviews/${encodeURIComponent(restored.proposalId)}`}>Review now</a>
        </StateLine>
      )}
      {/* Its History docked beside it (T357; design 06, pin 2). The same
          elements open or closed, so the dashboard, and an edit session on
          it, is never drawn anew as the panel opens or closes. */}
      <div className="with-panel" data-open={historyOpen ? 'true' : undefined}>
        <div className="with-panel__main">
          {viewing === undefined ? (
            <LoadedDashboard
              /**
               * Keyed by the dashboard, as the view below is: what the page holds
               * for one dashboard — why its save failed, the save itself — must not
               * be shown over the next one opened (T197). And by the security
               * context previewed (T172's review): the answers it keeps drawing while
               * newer ones are asked — a filtered tile's, a filter's values — must
               * not be one context's under another's banner, or under none.
               */
              key={`${dashboardId}:${JSON.stringify(preview ?? null)}`}
              document={document}
              dashboardId={dashboardId}
              version={saved.data?.version ?? 1}
              editTile={editTile}
              onEditTile={onEditTile}
              startEditing={startEditing}
              onStartedEditing={onStartedEditing}
              publishTile={publishTile}
              onPublishTaken={onPublishTaken}
              urlFilterValues={urlFilterValues}
              onFilterValues={onFilterValues}
              urlView={urlView}
              onViewTaken={onViewTaken}
              preview={preview}
              onExitPreview={onExitPreview}
              {...(mayHistory
                ? {
                    onHistory: () => {
                      onPanel?.(historyOpen ? undefined : 'history');
                    },
                    historyOpen,
                  }
                : {})}
              onEditingChange={closeHistoryWhileEditing}
              place={placeActions}
              {...(mayDelete
                ? {
                    onDelete: () => {
                      setDeleting(true);
                    },
                  }
                : {})}
            />
          ) : (
            <VersionView
              dashboardId={dashboardId}
              version={viewing}
              onBack={() => {
                setViewing(undefined);
              }}
              onRestore={restore.start}
            />
          )}
        </div>
        {historyOpen ? (
          <HistoryPanel
            kind="dashboard"
            id={dashboardId}
            viewing={viewing}
            onView={setViewing}
            // Where none was kept, the dashboard as it is now (T766, AC-289).
            onViewNow={() => {
              setViewing(undefined);
            }}
            onRestore={restore.start}
            onClose={() => {
              setViewing(undefined);
              onPanel?.(undefined);
              // Focus back to History, where it was opened from (pin 2, rule 85),
              // or below 1,024 px to ⋯, which holds it there (T842's review).
              requestAnimationFrame(() => {
                (
                  window.document.querySelector<HTMLElement>('[data-history-button]') ??
                  window.document.querySelector<HTMLElement>('[data-testid="dashboard-more"]')
                )?.focus();
              });
            }}
          />
        ) : null}
      </div>
    </WorkspaceItemContext.Provider>
  );
}

/**
 * One kept version drawn read-only in the dashboard's place, under a band
 * saying which, with Propose restoring… and Back to current (T357; design
 * 06, state A). Its own charts are drawn as the version kept them.
 */
function VersionView({
  dashboardId,
  version,
  onBack,
  onRestore,
}: {
  readonly dashboardId: string;
  readonly version: number;
  readonly onBack: () => void;
  readonly onRestore: (version: RestoringVersion) => void;
}) {
  const kept = useQuery({
    queryKey: ['history-version', 'dashboard', dashboardId, version],
    queryFn: () =>
      getJson<
        KeptVersion & {
          content: { body: Record<string, unknown>; parts: { id: string; body: unknown }[] };
        }
      >(`/api/history/dashboard/${encodeURIComponent(dashboardId)}/versions/${String(version)}`),
  });
  if (kept.isPending) return <DashboardLoading />;
  if (kept.isError) return <StateLine kind="err">Version {version} could not be read.</StateLine>;
  const drawn = kept.data;
  return (
    <div className="version-view">
      <div role="status" aria-label="Version shown" className="version-band">
        <p>
          <strong>
            Version {drawn.version} of {drawn.title}
          </strong>{' '}
          · read-only · {approvedText(drawn)}
        </p>
        {drawn.current ? null : (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              onRestore({ ...drawn, approvedText: approvedText(drawn) });
            }}
          >
            Propose restoring…
          </button>
        )}
        <button type="button" className="btn btn-sm" onClick={onBack}>
          Back to current
        </button>
      </div>
      <ReadOnlyDashboard
        cacheKey={`version:${dashboardId}:${String(drawn.version)}`}
        dashboardId={dashboardId}
        document={dashboardOf({ body: drawn.content.body } as StoredDocument)}
        heldCharts={Object.fromEntries(drawn.content.parts.map((part) => [part.id, part.body]))}
      />
    </div>
  );
}

/**
 * A dashboard drawn to be read, never edited or bookmarked (T356; design 05,
 * pin 3): a proposal's, from the documents it holds, or its folder's current
 * one. A chart the proposal holds is drawn from its document there, since
 * its reviewer can't read the author's workspace; any other is read as a
 * tile reads it.
 */
export function ReadOnlyDashboard({
  cacheKey,
  dashboardId,
  document,
  heldCharts = {},
  item = { kind: 'dashboard', id: dashboardId },
  crumbs = true,
}: {
  /** Its folder's breadcrumb over it; none in a review, which draws it as readers see it (T544, AC-390). */
  readonly crumbs?: boolean;
  /** What the drawn charts are kept under: a proposal's, or a folder's. */
  readonly cacheKey: string;
  readonly dashboardId: string;
  readonly document: DashboardDocument;
  /** Chart documents' bodies by id, as a proposal holds them. */
  readonly heldCharts?: Readonly<Record<string, unknown>>;
  /**
   * The item its queries serve (T340, AC-268): the dashboard, or the
   * proposal a review draws it from, whose copy its reviewer can't open.
   */
  readonly item?: QueryItem;
}) {
  const ids = chartIdsOf(document);
  const charts = useQuery({
    queryKey: ['read-only-charts', cacheKey, ids] as const,
    queryFn: async (): Promise<DrawnCharts> => {
      const entries = await Promise.all(
        ids.map(
          async (id) =>
            [
              id,
              id in heldCharts
                ? await drawChartBody(heldCharts[id], undefined, undefined, item)
                : await specFor(id, undefined, undefined, item),
            ] as const,
        ),
      );
      const specs: Record<string, RenderSpec> = {};
      const errors: Record<string, unknown> = {};
      const documents: Record<string, ChartDocument> = {};
      const answered: Record<string, AnswerMeta> = {};
      for (const [id, { chart, document: read, answered: meta }] of entries) {
        if ('spec' in chart) specs[id] = chart.spec;
        else errors[id] = chart.error;
        if (read !== undefined) documents[id] = read;
        if (meta !== undefined) answered[id] = meta;
      }
      return { specs, errors, documents, answered };
    },
  });
  // A proposal's review reads its overlay's field list (T440, AC-323); a
  // version kept, or the folder's current one, the model's.
  const meta = useQuery(metaQueryOf(item?.kind === 'proposal' ? { item } : undefined));
  const formats = useMemo(() => formatsFrom(meta.data), [meta.data]);
  const reach = useMemo(() => reachFrom(meta.data), [meta.data]);
  const primaryKey = useMemo(() => {
    const data = meta.data;
    return (cube: string) => primaryKeyOf(data, cube);
  }, [meta.data]);
  const titles = useMemo(
    () => Object.fromEntries(allMembers(meta.data).map((member) => [member.name, member.title])),
    [meta.data],
  );
  const shortTitles = useMemo(
    () =>
      Object.fromEntries(allMembers(meta.data).map((member) => [member.name, member.shortTitle])),
    [meta.data],
  );
  const memberTitle = useMemo(() => (name: string) => titles[name], [titles]);
  return (
    <DashboardView
      key={cacheKey}
      dashboardId={dashboardId}
      queryItem={item}
      document={document}
      specs={charts.data?.specs ?? {}}
      documents={charts.data?.documents}
      reach={reach}
      model={meta.data}
      primaryKey={primaryKey}
      memberTitle={memberTitle}
      titles={titles}
      shortTitles={shortTitles}
      formats={formats}
      errors={charts.data?.errors ?? {}}
      loading={charts.isPending}
      answered={charts.data?.answered}
      readOnly
      crumbs={crumbs}
      onSave={() => undefined}
    />
  );
}

/**
 * Separate so the document is in hand before any chart query is keyed on it.
 * `EditChrome` seeds its session when Edit is pressed, and a dashboard that
 * arrived after that would be a session editing nothing.
 */
function LoadedDashboard({
  document,
  dashboardId,
  version,
  editTile,
  onEditTile,
  startEditing,
  onStartedEditing,
  publishTile,
  onPublishTaken,
  urlFilterValues,
  onFilterValues,
  urlView,
  onViewTaken,
  preview,
  onExitPreview,
  onHistory,
  historyOpen,
  onEditingChange,
  place,
  onDelete,
}: {
  /** Delete dashboard… in its header's ⋯ (design 14, B2): absent where it may not be deleted. */
  onDelete?: (() => void) | undefined;
  /** Its History button (T357): absent where History isn't offered. */
  onHistory?: (() => void) | undefined;
  historyOpen?: boolean | undefined;
  onEditingChange?: ((editing: boolean) => void) | undefined;
  /** Where it lives, and how it's changed (T348). */
  place?: DashboardViewProps['place'];
  document: DashboardDocument;
  dashboardId: string;
  version: number;
  editTile: string | undefined;
  onEditTile: ((tileId: string | undefined) => void) | undefined;
  startEditing: boolean | undefined;
  onStartedEditing: (() => void) | undefined;
  publishTile: string | undefined;
  onPublishTaken: (() => void) | undefined;
  urlFilterValues: FilterValues | undefined;
  onFilterValues: ((values: FilterValues) => void) | undefined;
  urlView: ViewState | undefined;
  onViewTaken: (() => void) | undefined;
  preview: Readonly<Record<string, unknown>> | undefined;
  onExitPreview: (() => void) | undefined;
}) {
  const queryClient = useQueryClient();
  // As the shell asks it (T760, AC-277): one read-only everywhere copies a
  // chart to no dashboard. Not offered until who is signed in is known.
  const me = useQuery({ ...ME_QUERY, retry: false });
  /**
   * The charts' place in the query cache: keyed by the context they were
   * asked as too, so a preview (T172) never draws answers Cube gave wechart's
   * own context, nor the reverse.
   */
  /**
   * And by the charts the saved dashboard shows (T068's review): a save that
   * adds one — a duplicate's copy, a new local chart — moves the key, so the
   * charts are loaded for the dashboard as saved. Keyed only by the dashboard,
   * the load after a save ran with the chart ids from before it, and the new
   * chart's tile read "no longer available". The previous answer stays on the
   * tiles meanwhile (`placeholderData`), so they do not flash.
   */
  const chartsKeyOf = (id: string) =>
    [
      'dashboard-charts',
      id,
      preview ?? null,
      chartIdsOf(document),
      // A bound chart is loaded at its parameters' defaults (T898, AC-534).
      document.parameters ?? [],
    ] as const;
  const [saveFailed, setSaveFailed] = useState('');
  /**
   * Where the charts this save put in folders went (T133, AC-127): each by
   * its title and its folder's, said once the save has gone through — the
   * Properties that said it would are gone with the edit session. Cleared by
   * the next edit.
   */
  const [savedToFolders, setSavedToFolders] = useState('');
  const sayWhereSaved = async (
    id: string,
    next: DashboardDocument,
    drafts: DashboardDocument['chartDrafts'],
    /** The library charts the save put on it as its own copies (T527, AC-371). */
    copied: readonly CopiedChart[] = [],
  ) => {
    const shown = new Set(chartIdsOf(next));
    const moved = Object.entries(drafts ?? {}).flatMap(([chartId, draft]) =>
      shown.has(chartId) &&
      draft.wasLocalTo === id &&
      draft.document.localToDashboardId === undefined &&
      draft.document.folderId !== undefined
        ? [{ title: draft.document.title, folderId: draft.document.folderId }]
        : [],
    );
    const copies = copied.map(
      ({ title }) =>
        `“${title}” isn’t kept in the folder this dashboard is shown in, or one above it, so the dashboard now shows its own copy of it.`,
    );
    if (moved.length === 0) {
      setSavedToFolders(copies.join(' '));
      return;
    }
    // By name where the folders can be read; by id, never not at all. The
    // roots are no folders of their own, so they are named from the one list.
    const names = new Map<string, string>(ROOT_FOLDERS.map((root) => [root.id, root.title]));
    try {
      const response = await fetch('/api/folders');
      if (response.ok)
        for (const folder of (await response.json()) as { id: string; title: string }[])
          names.set(folder.id, folder.title);
    } catch {
      // Said by id.
    }
    setSavedToFolders(
      [
        ...moved.map(
          ({ title, folderId }) =>
            `Saved “${title}” to ${names.get(folderId) ?? folderId}. It is now a shared chart.`,
        ),
        ...copies,
      ].join(' '),
    );
  };
  /**
   * Moved on each time the charts are loaded afresh or a save writes them. A
   * tile's refresh (T154) answers for the charts as they were when it was
   * asked, so one overtaken by either drops its answer rather than put older
   * charts back over newer ones (T154's review).
   */
  const chartsGeneration = useRef(0);

  /**
   * The version the dashboard had when the edit being saved began (T198,
   * AC-015): an edit session when it starts, or the settings page when it
   * opens in view mode — each works on the dashboard as it stood then, and
   * each save is checked against that. Not the version when Save is pressed:
   * the dashboard can be fetched again while an edit is open — the library
   * does so on reconnecting once the data is stale (research, "Resolved
   * since") — bringing in someone else's save, and checked against their
   * version, the edit went through over their change without a word.
   *
   * Set afresh whenever an edit begins, and never cleared: clearing it when a
   * save succeeded wiped an edit session begun while a view-mode save was
   * still out, and the session's save then went through over that save.
   */
  const [editBase, setEditBase] = useState<number | undefined>(undefined);

  /**
   * Saving (AC-065). The version the session started from travels with it, so
   * a dashboard changed somewhere else is refused rather than overwritten —
   * and on success the cached copy is refreshed, or the next Edit would begin
   * from the document as it was before this save.
   *
   * **Everything the save needs rides in its own variables** — the dashboard,
   * the document, its drafts, the version — and no callback reads them from
   * this render. A pending save picks up newer renders' options
   * (docs/research/tanstack-query-mutations.md, gotcha 7), so a save still
   * starting when the user moved to another dashboard could otherwise write
   * this dashboard's document under that one's id.
   *
   * `networkMode: 'always'`: with the default, a save made while the browser
   * reports itself offline waits for the connection, neither resolving nor
   * failing — the session would sit "Saving…", untouchable, with nothing
   * said (gotcha 4). Sent regardless, it fails, and AC-184 keeps the work and
   * says why.
   */
  const save = useMutation({
    networkMode: 'always',
    mutationFn: ({ id, next, drafts, version: from }: SaveVariables) =>
      saveDashboard({
        dashboardId: id,
        document: next,
        version: from,
        charts: drafts === undefined ? [] : chartWritesOf({ ...next, chartDrafts: drafts }, id),
      }),
    /**
     * The tiles keep showing the edited charts once the save has gone
     * through. The session leaves edit mode then, and the drafts go with it —
     * so without this the tiles fell back to the charts as they were loaded,
     * and the old chart flashed up until the charts were fetched again.
     */
    onMutate: async ({ id, next, drafts }) => {
      if (drafts === undefined) return undefined;
      /**
       * A load of the charts still running — the last save's re-fetch, with
       * Cube slow — would otherwise land after this and put that save's
       * charts back over this one's edits. Cancelled, its result is dropped
       * and the query reverts (`cancelQueries`, docs/research/data-layer.md).
       */
      await queryClient.cancelQueries({ queryKey: ['dashboard-charts', id] });
      /**
       * Only over charts already drawn: with none yet there is nothing to
       * keep showing, and nothing for a failure to put back. What was there
       * is kept, so a save that fails can put the cache back as it was
       * (`onError`).
       */
      const before = queryClient.getQueryData<DrawnCharts>(chartsKeyOf(id));
      if (before === undefined) return undefined;
      // A refresh still out answers for the charts as they were: overtaken.
      chartsGeneration.current += 1;
      queryClient.setQueryData<DrawnCharts>(
        chartsKeyOf(id),
        drawnWithDrafts(before, { ...next, chartDrafts: drafts }) as DrawnCharts,
      );
      return { before };
    },
    /**
     * Awaited before the save's promise resolves, and so before the session
     * leaves edit mode (AC-184) — the dashboard's re-fetch, that is: the saved
     * dashboard is in the cache by the time the session leaves. The page
     * itself picks it up a moment later — the library tells a query's users
     * on a timeout, after the save's promise has settled (research, Answer 7)
     * — so for that moment the dashboard may show as it was opened; before
     * T197 it did so for the whole re-fetch. The charts are fetched again
     * without waiting: that re-runs every tile's query, which with Cube slow
     * would hold the user at "Saving…" long after the save is stored, and the
     * tiles already show the saved charts (`onMutate`). Must not throw — a
     * throw here would turn a stored save into a failure (gotcha 1) — and
     * `invalidateQueries` neither throws nor rejects unless asked to.
     */
    onSuccess: async (saved, { id, next, drafts }) => {
      setSaveFailed('');
      void sayWhereSaved(id, next, drafts, saved.copied);
      void queryClient.invalidateQueries({ queryKey: ['dashboard-charts', id] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
    },
    onError: (failure: Error, { id }, written) => {
      setSaveFailed(failure.message);
      if (written === undefined) return;
      /**
       * The drafts `onMutate` wrote into the cache were not saved, so they
       * come out of it: put back as it was, at once, then fetched again for
       * anything changed meanwhile. The tiles still show the drafts — the
       * session is kept (AC-184) and draws them over the saved charts — but
       * undone, a tile must show the chart as stored, not the unsaved edit.
       *
       * Put back, not only fetched again: offline, or with the server down,
       * the fetch cannot run, and the unsaved edit stayed in the cache as if
       * saved — found by the offline test (the research's documented pattern,
       * gotcha 9). And not waited for: the save's promise rejects only once
       * this returns (Answer 2), and the fetch re-runs every tile's query —
       * waited for, it kept the session locked at "Saving…" beside a message
       * saying the save had failed.
       */
      queryClient.setQueryData(chartsKeyOf(id), written.before);
      void queryClient.invalidateQueries({ queryKey: ['dashboard-charts', id] });
    },
  });
  const charts = useQuery({
    queryKey: chartsKeyOf(dashboardId),
    // The charts the key names, not the page's at the time: a load asked for
    // just after a save still has the key it was asked under.
    queryFn: async ({ queryKey }): Promise<DrawnCharts> => {
      // A refresh still out was asked before this load: overtaken by it.
      chartsGeneration.current += 1;
      const entries = await Promise.all(
        queryKey[3].map(
          async (id) =>
            [
              id,
              await specFor(
                id,
                undefined,
                preview,
                { kind: 'dashboard', id: dashboardId },
                queryKey[4],
              ),
            ] as const,
        ),
      );

      // Split rather than collapsed: a chart that drew and a chart that failed
      // are different things to put on a tile, and a failure that arrives as
      // "no spec" would be drawn as an empty chart, which reads as "no data".
      const specs: Record<string, RenderSpec> = {};
      const errors: Record<string, unknown> = {};
      const documents: Record<string, ChartDocument> = {};
      const answered: Record<string, AnswerMeta> = {};
      for (const [id, { chart, document: read, answered: meta }] of entries) {
        if ('spec' in chart) specs[id] = chart.spec;
        else errors[id] = chart.error;
        if (read !== undefined) documents[id] = read;
        if (meta !== undefined) answered[id] = meta;
      }
      return { specs, errors, documents, answered };
    },
    placeholderData: keepPreviousData,
  });

  /**
   * "Refresh now" on one tile (T154, AC-148): its chart asked again, past
   * wechart's cached answer and Cube's (`no-cache`, which "Skips refresh key
   * checks"; `must-revalidate` would serve Cube's cache while its key holds), and put back in
   * place — the other tiles are not asked again.
   */
  const [refreshing, setRefreshing] = useState<ReadonlySet<string>>(new Set());
  const refresh = async (chartId: string) => {
    setRefreshing((now) => new Set([...now, chartId]));
    const began = chartsGeneration.current;
    try {
      const {
        chart,
        document: read,
        answered: meta,
      } = await specFor(
        chartId,
        'no-cache',
        preview,
        { kind: 'dashboard', id: dashboardId },
        document.parameters,
      );
      // The charts were loaded again, or saved, while this was out: what
      // they hold now is newer than what this asked (T154's review).
      if (chartsGeneration.current !== began) return;
      queryClient.setQueryData<DrawnCharts>(chartsKeyOf(dashboardId), (before) => {
        if (before === undefined) return before;
        const specs = { ...before.specs };
        const errors = { ...before.errors };
        if ('spec' in chart) {
          specs[chartId] = chart.spec;
          delete errors[chartId];
        } else {
          errors[chartId] = chart.error;
          delete specs[chartId];
        }
        // The chart as read now: what names the tile, and what filters ask.
        const documents = { ...before.documents };
        if (read !== undefined) documents[chartId] = read;
        const answered = { ...before.answered };
        if (meta === undefined) delete answered[chartId];
        else answered[chartId] = meta;
        return { specs, errors, documents, answered };
      });
    } finally {
      setRefreshing((now) => new Set([...now].filter((id) => id !== chartId)));
    }
  };

  /**
   * Number formats from the Cube model (AC-046, T194), applied as the tiles
   * are drawn rather than while they load: no tile waits for the model, and
   * each picks its formats up when the model arrives. The same query the
   * editor uses, so the two read one cache entry.
   *
   * Handed to the view rather than applied here, because the view is where a
   * chart edited from a tile replaces the saved one (T032). Applied here, they
   * reached only the saved charts, and a drafted tile read "76,900" where the
   * editor's preview had just shown "$76,900.00".
   *
   * A workspace dashboard's from its overlay (T347, AC-323).
   */
  const meta = useQuery(metaQueryOf(useWorkspaceItem()));
  const formats = useMemo(() => formatsFrom(meta.data), [meta.data]);
  // Which fields reach which cubes and views, for filters (AC-079). Until the
  // model arrives it cannot say, and no filter is applied or marked.
  const reach = useMemo(() => reachFrom(meta.data), [meta.data]);
  /**
   * Which dimension identifies a cube's rows, so a table tile knows whether
   * its rows can be marked at all (AC-092). Read here, with the rest of the
   * model, rather than queried again inside the dashboard.
   */
  const primaryKey = useMemo(() => {
    const data = meta.data;
    return (cube: string) => primaryKeyOf(data, cube);
  }, [meta.data]);
  /**
   * Each member's title from the model: to name filters in words, and every
   * member a chart shows — a legend, a tooltip, a table's headers (AC-220).
   */
  const titles = useMemo(
    () => Object.fromEntries(allMembers(meta.data).map((member) => [member.name, member.title])),
    [meta.data],
  );
  /** And its short title, for a one-source chart's legend and KPI (T403). */
  const shortTitles = useMemo(
    () =>
      Object.fromEntries(allMembers(meta.data).map((member) => [member.name, member.shortTitle])),
    [meta.data],
  );
  const memberTitle = useMemo(() => (name: string) => titles[name], [titles]);

  return (
    <>
      {saveFailed === '' ? null : (
        // Why the save failed (AC-184). The session is still open beneath it,
        // every change kept, for another try or another course.
        <StateLine kind="err" testId="save-failed">
          {saveFailed}
        </StateLine>
      )}
      {savedToFolders === '' ? null : (
        <StateLine kind="ok" testId="saved-to-folder">
          {savedToFolders}
        </StateLine>
      )}
      <DashboardView
        /**
         * Keyed by the dashboard, so moving from one to another starts a new
         * edit session rather than carrying the previous dashboard's history
         * into it — the session is seeded when Edit is pressed and would
         * otherwise be editing a document that is no longer on screen.
         */
        key={dashboardId}
        dashboardId={dashboardId}
        document={document}
        specs={charts.data?.specs ?? {}}
        documents={charts.data?.documents}
        reach={reach}
        // What a tile's marked items can be drilled by (T270, AC-237).
        model={meta.data}
        primaryKey={primaryKey}
        memberTitle={memberTitle}
        titles={titles}
        shortTitles={shortTitles}
        formats={formats}
        errors={charts.data?.errors ?? {}}
        loading={charts.isPending}
        answered={charts.data?.answered}
        onRefresh={(chartId) => {
          void refresh(chartId);
        }}
        refreshing={refreshing}
        refreshable={!charts.isFetching}
        preview={preview}
        onExitPreview={onExitPreview}
        mayCopyToDashboard={me.data !== undefined && hasWorkspace(me.data)}
        onHistory={onHistory}
        historyOpen={historyOpen}
        onEditingChange={onEditingChange}
        place={place}
        onDelete={onDelete}
        // E and a tile's pencil open the chart editor over the dashboard, in
        // the view itself (T032). They used to navigate here, a full page
        // load that ended the edit session — so there was no dashboard to
        // return to with the tile updated, and nothing a Discard could reach.
        // The save's outcome goes back to the session: it leaves edit mode when
        // the save resolves, and keeps every change when it rejects (AC-184).
        // The rejection is the session's to handle; why is shown above.
        editTile={editTile}
        onEditTile={onEditTile}
        startEditing={startEditing}
        onStartedEditing={onStartedEditing}
        publishTile={publishTile}
        onPublishTaken={onPublishTaken}
        urlFilterValues={urlFilterValues}
        onFilterValues={onFilterValues}
        urlView={urlView}
        onViewTaken={onViewTaken}
        onEditStart={() => {
          setEditBase(version);
          setSavedToFolders('');
          // A new session: the last one's failed save is not this one's.
          setSaveFailed('');
        }}
        // Its changes put back and edit mode left (AC-204): a failed save's
        // "the session is still open" no longer holds (T223's review).
        onDiscard={() => {
          setSaveFailed('');
        }}
        onSave={(next, drafts) =>
          save.mutateAsync({ id: dashboardId, next, drafts, version: editBase ?? version })
        }
      />
    </>
  );
}

/**
 * One tile's chart, ready to render — and a library chart's own page's (AC-212),
 * so the chart is drawn the same there: the saved chart document, read strictly,
 * then drawn by `tileChartOf` — the same recommendation the editor makes, so a
 * chart looks the same on a dashboard as it did where it was built (T193).
 *
 * `readChartDocument` is strict, so a body in an older or broken format is
 * refused here rather than drawn as an empty chart.
 */
export async function specFor(
  chartId: string,
  /** `no-cache` for a tile's "Refresh now": asked past Cube's cache (T154, AC-148). */
  cache?: 'no-cache',
  /** A previewed security context, asked as (T172, AC-166). */
  context?: Readonly<Record<string, unknown>>,
  /** The item its query serves: its dashboard's, or the chart's own (T340, AC-268). */
  item: QueryItem = { kind: 'chart', id: chartId },
  /** Its dashboard's parameters: a bound well is asked at its default (T898, AC-534). */
  parameters?: readonly DashboardParameter[],
): Promise<{ chart: TileChart; document: ChartDocument | undefined; answered?: AnswerMeta }> {
  let stored;
  try {
    stored = await getJson<StoredDocument>(`/api/documents/chart/${encodeURIComponent(chartId)}`);
  } catch (failure) {
    /**
     * Only the server saying the chart does not exist is the missing-chart
     * state. A request that never reached it — the network dropped — or one
     * it failed to answer says nothing about whether the chart is there, and
     * calling it "no longer available" sends the reader looking for whoever
     * deleted it (the dashboard critique, F10). That is a failure to load, and
     * the tile offers Retry for it (AC-042).
     */
    if (failure instanceof HttpError && failure.status === 404)
      return { chart: { error: CHART_MISSING }, document: undefined };
    return {
      chart: {
        error: new Error(
          failure instanceof HttpError
            ? `The server could not read this chart (HTTP ${String(failure.status)}).`
            : 'Could not reach the server to read this chart. Check the connection, then retry.',
        ),
      },
      document: undefined,
    };
  }

  return drawChartBody(stored.body, cache, context, item, parameters);
}

/**
 * A chart document's body, read strictly and drawn: `specFor`'s second half,
 * and how a proposal's review view draws a chart it holds (T356).
 */
export async function drawChartBody(
  body: unknown,
  cache?: 'no-cache',
  context?: Readonly<Record<string, unknown>>,
  /** The item its query serves (T340, AC-268): a dashboard, a chart or a proposal. */
  item?: QueryItem,
  /**
   * Its dashboard's parameters (T898, AC-534): a bound well asked at its
   * default; the document handed back is the chart as its author wrote it.
   */
  parameters: readonly DashboardParameter[] = [],
): Promise<{ chart: TileChart; document: ChartDocument | undefined; answered?: AnswerMeta }> {
  let document;
  try {
    document = readChartDocument(body);
  } catch {
    // Stored but unreadable: the chart as it stands cannot be drawn, which is
    // the missing-chart state — a broken dashboard, not a broken query, so
    // the tile shows it without Retry, which would only fail the same way.
    return { chart: { error: CHART_MISSING }, document: undefined };
  }

  // AC-012: a failed query reaches the tile as the thrown value, so that a
  // TileLoadError still carries its query and the tile can offer it.
  // What Cube says of its answer besides the rows: when the data is from, and
  // whether a pre-aggregation served it (T154, T014).
  let answered: AnswerMeta | undefined;
  const chart = await tileChartFollowing(document, parameters, {}, async (query) => {
    const result = (await loadTile({
      query,
      ...(cache === undefined ? {} : { cache }),
      ...(context === undefined ? {} : { context }),
      item,
    })) as { data?: Record<string, unknown>[] };
    answered = answerMetaOf(result);
    return result.data ?? [];
  });
  return answered === undefined ? { chart, document } : { chart, document, answered };
}
