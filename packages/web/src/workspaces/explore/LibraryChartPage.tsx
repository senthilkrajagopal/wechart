import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { readChartDocument, withMemberLabels } from '@wechart/core';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';

import { CHART_MISSING, formatsFrom, pickedWithFormats } from '../../dashboard/chartSpec';
import { PencilIcon } from '../../dashboard/edit/EditChrome';
import { NOTHING_CHOSEN } from '../../dashboard/edit/templates';
import { specFor } from '../../dashboard/DashboardPage';
import { allMembers } from '../../filters/FilterBar';
import { metaQueryOf } from '../../query/meta';
import { hasWorkspace, ME_QUERY } from '../../shell/me';
import { ProposalBand } from './ProposalBand';
import { ProposeFlow } from './ProposeFlow';
import { approvedText, HistoryIcon, HistoryPanel, historyQuery } from '../history/HistoryPanel';
import { FOLDERS_QUERY } from './folders';
import { placeOf, type ItemWorkspace } from './placeOf';
import { WorkspaceBand } from './WorkspaceBand';
import { RestoreDialogs, useRestore } from '../history/restore';
import { StateLine } from '../../shell/StatusIcon';
import { ChartTile } from '../../tiles/ChartTile';
import { TileError } from '../../tiles/TileError';
import { TileSkeleton } from '../../tiles/TileSkeleton';
import { CHART_TYPE_LABEL, chartTypeText } from './chartTypeLabels';
import { FolderCrumbs } from './FolderCrumbs';
import { ChartHomeLine, LocalChartActions, useChartHome } from './LocalChartHome';
import { MenuButton } from '../../shell/MenuButton';
import { DeleteDialog } from './DeleteDialog';
import { checkChart, removeChart } from './deleteChecks';
import { sayOnExplore } from './deletedToast';
import { exploreHref } from './folders';
import { browserTimeZone } from './projectFolder';
import { SHARED_ROOT } from './roots';

/**
 * A library chart's page, as the prototype's `chartPage()` (AC-212): its
 * title as the heading with its type and Edit chart, the chart drawn, and
 * beside it what it is built on, its measures and dimensions, and the
 * dashboards it is used on (AC-022), with a way to add it to another.
 *
 * Knowing where a chart is already used is what makes editing it safe — it is
 * the same question AC-362 asks before a delete and AC-128 asks before an edit.
 */
export interface UsingDashboard {
  readonly id: string;
  readonly title: string;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${String(response.status)}`);
  return (await response.json()) as T;
}

export interface LibraryChartPageProps {
  readonly chartId: string;
}

/** One of the details pane's sections, named by its heading (AC-212). */
function Detail({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const id = useId();
  return (
    <section className="chart-page__section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

export function LibraryChartPage({ chartId }: LibraryChartPageProps) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState('');

  /** Which folder the chart lives in, for its breadcrumb (AC-195). */
  const stored = useQuery({
    queryKey: ['chart-folder', chartId],
    queryFn: () =>
      getJson<{
        body: {
          folderId?: string;
          targetFolderId?: string;
          title?: string;
          origin?: { id: string; version: number; folderId?: string };
        };
        version?: number;
        /** Where it lives, with sign-in on (T348). */
        workspace?: ItemWorkspace;
        // Where it lives, asked for here only, never by a tile (T348's review).
      }>(`/api/documents/chart/${encodeURIComponent(chartId)}?place`),
  });
  // As the shell asks it, so this reads what the shell already has.
  const me = useQuery({ ...ME_QUERY, retry: false });
  /** Where "Propose again…" proposes it to, while its dialog is open. */
  const [proposingAgain, setProposingAgain] = useState<readonly string[] | null>(null);
  /**
   * Shared work is changed through My workspace and a proposal, with its
   * history and its author's band: signed in, and with sign-in off too, by
   * the single user, since R52 (T359, AC-254).
   */
  const viaWorkspace = me.data !== undefined;
  /**
   * Whether the user may create or edit at all: one read-only everywhere has
   * no workspace, so neither Edit chart nor Add to dashboard (T760, AC-277).
   */
  const mayChange = me.data !== undefined && hasWorkspace(me.data);
  // Its History (T357, AC-289): offered only where the API shows it.
  const history = useQuery({ ...historyQuery('chart', chartId), enabled: viaWorkspace });
  const mayHistory = viaWorkspace && history.data != null;
  const [historyOpen, setHistoryOpen] = useState(false);
  const restore = useRestore('chart', chartId);
  // Where it lives and how it's changed (T348, AC-278; T359).
  const folders = useQuery({ ...FOLDERS_QUERY, enabled: viaWorkspace });
  const currentVersion = history.data?.versions.find((each) => each.current);
  const place =
    stored.data === undefined
      ? undefined
      : placeOf({
          title: stored.data.body.title ?? 'Chart',
          folderId: stored.data.body.folderId,
          version: stored.data.version ?? 1,
          ...(stored.data.body.origin === undefined ? {} : { origin: stored.data.body.origin }),
          targetFolderId: stored.data.body.targetFolderId,
          workspace: stored.data.workspace,
          folders: folders.data,
          approved: currentVersion?.approver == null ? undefined : approvedText(currentVersion),
        });
  /** A shared chart copied into My workspace, and its copy opened in the editor. */
  const copyChart = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/workspace/copies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Into a project folder of its own, named in the user's time (T523, AC-368).
        body: JSON.stringify({ kind: 'chart', id: chartId, timeZone: browserTimeZone() }),
      });
      const answer = (await response.json().catch(() => null)) as { id?: string } | null;
      if (!response.ok || answer?.id === undefined)
        throw new Error(`It could not be copied (${String(response.status)}).`);
      return answer.id;
    },
    onSuccess: (copyId) => {
      globalThis.location.assign(`/explore/charts/${encodeURIComponent(copyId)}/edit`);
    },
  });
  const [restored, setRestored] = useState<{ text: string; proposalId: string } | undefined>(
    undefined,
  );

  /**
   * The chart itself, read and drawn as a dashboard tile draws it (AC-212):
   * the same `specFor`, so it looks the same here as it does there.
   */
  const drawn = useQuery({
    queryKey: ['library-chart', chartId],
    queryFn: () => specFor(chartId),
  });
  /** In My workspace, its field list is its overlay's (T347, AC-323). */
  const workspaceItem =
    stored.data?.workspace?.inWorkspace === true
      ? {
          item: { kind: 'chart' as const, id: chartId },
          targetFolderId: stored.data.body.targetFolderId,
        }
      : undefined;
  const meta = useQuery(metaQueryOf(workspaceItem));
  const titles = new Map(allMembers(meta.data).map((member) => [member.name, member.title]));
  const titleOf = (member: string) => titles.get(member) ?? member;
  const kindOf = (source: string) => {
    // Guarded as `formatsFrom` guards: a `cubes` that is not a list, or
    // holds a null, is no cube (T226's review).
    const cubes: unknown = (meta.data as { cubes?: unknown } | undefined)?.cubes;
    if (!Array.isArray(cubes)) return undefined;
    const found = (cubes as unknown[]).find(
      (cube) =>
        typeof cube === 'object' && cube !== null && (cube as { name?: unknown }).name === source,
    ) as { type?: unknown } | undefined;
    return found === undefined ? undefined : found.type === 'view' ? 'view' : 'cube';
  };

  /**
   * What the chart is, read from the stored document the breadcrumb already
   * fetched — at once, not after its query has run (T226's review): the
   * title, type and fields must not read "Chart" and "None" meanwhile.
   */
  const saved = useMemo(() => {
    if (stored.data === undefined) return undefined;
    try {
      return readChartDocument(stored.data.body);
    } catch {
      return undefined;
    }
  }, [stored.data]);
  const definition = saved?.chart;
  /** The dashboard a local chart lives on (AC-126), and the tile showing it there. */
  const localTo = saved?.localToDashboardId;
  const home = useChartHome(localTo, chartId);
  const spec =
    drawn.data !== undefined && 'spec' in drawn.data.chart ? drawn.data.chart.spec : undefined;
  const failure =
    drawn.data !== undefined && 'error' in drawn.data.chart ? drawn.data.chart.error : undefined;
  /**
   * Drawn with the model's formats and its members' titles (AC-220) — the
   * same object until either changes (T226's review).
   */
  const formatted = useMemo(
    () =>
      spec === undefined
        ? undefined
        : // A calculated measure keeps its calculation in its name (AC-048).
          withMemberLabels(
            // Picked with this model's formats, as the editor and a tile pick
            // it (T510, R67): its own overlay's in My workspace.
            pickedWithFormats(
              spec,
              drawn.data?.document,
              meta.data === undefined ? undefined : formatsFrom(meta.data),
            ),
            {
              formats: formatsFrom(meta.data),
              titles: Object.fromEntries(
                allMembers(meta.data).map((member) => [member.name, member.title]),
              ),
              // For a one-source chart's legend and KPI (T403).
              shortTitles: Object.fromEntries(
                allMembers(meta.data).map((member) => [member.name, member.shortTitle]),
              ),
            },
          ),
    [spec, drawn.data?.document, meta.data],
  );
  const hasFields =
    definition !== undefined &&
    [
      ...definition.wells.measures,
      ...definition.wells.dimensions,
      ...definition.wells.timeDimensions,
    ].length > 0;
  /**
   * Its type by name, as Explore lists it (AC-193): the one saved, the
   * recommender's once drawn — said as such — or Incomplete.
   */
  const typeText =
    definition === undefined
      ? undefined
      : definition.chartType === undefined && formatted !== undefined && hasFields
        ? // As drawn, picked with the model's formats (T510).
          `${CHART_TYPE_LABEL[formatted.chartType]} · auto`
        : chartTypeText({ chartType: definition.chartType ?? null, hasFields });
  const source = definition?.source.cube;
  const measures = definition?.wells.measures ?? [];
  const dimensions = [
    ...(definition?.wells.timeDimensions ?? []),
    ...(definition?.wells.dimensions ?? []),
  ];
  const pills = (members: readonly string[], kind: 'measure' | 'dimension') =>
    // Nothing is said of its fields until the chart is read: "None" before
    // then would be untrue.
    definition === undefined ? null : members.length === 0 ? (
      <p className="chart-page__none">None</p>
    ) : (
      <ul className="chart-page__pills">
        {members.map((member) => (
          <li key={member} className={`field-pill field-pill--${kind}`}>
            {titleOf(member)}
          </li>
        ))}
      </ul>
    );

  const using = useQuery({
    queryKey: ['chart-dashboards', chartId],
    queryFn: () =>
      getJson<UsingDashboard[]>(`/api/charts/${encodeURIComponent(chartId)}/dashboards`),
  });

  /**
   * The dashboards it may be added to: only My workspace's, the single
   * user's too (T359): a shared dashboard gains a tile only by a proposal
   * (T502, AC-278). All of them, wherever in it, a copy in its project folder
   * (T523, AC-368).
   */
  const candidates = useQuery({
    queryKey: ['search', 'dashboards', viaWorkspace],
    // Asked only of one who may add it somewhere (T760's review).
    enabled: mayChange,
    queryFn: () =>
      getJson<{ id: string; title: string; kind: string }[]>(
        viaWorkspace ? '/api/workspace/dashboards' : '/api/folders/root/contents',
      ),
  });

  const addToDashboard = useMutation({
    mutationFn: async (dashboardId: string) => {
      const response = await fetch(`/api/dashboards/${encodeURIComponent(dashboardId)}/charts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chartId }),
      });
      if (!response.ok) {
        const said = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(said?.error ?? `Could not add: ${String(response.status)}`);
      }
      // Kept off the path of the folder that dashboard is read in, it went on
      // as the dashboard's own copy (T527, AC-371).
      const answer =
        response.status === 201
          ? ((await response.json().catch(() => null)) as { copied?: unknown[] } | null)
          : null;
      const title = dashboards.find((dashboard) => dashboard.id === dashboardId)?.title;
      return (answer?.copied?.length ?? 0) > 0
        ? `Added to “${title ?? 'that dashboard'}” as its own copy: this chart isn’t kept in the folder that dashboard is shown in, or one above it.`
        : undefined;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['chart-dashboards', chartId] });
      setTarget('');
    },
  });

  const dashboards = (candidates.data ?? []).filter((item) => item.kind === 'dashboard');

  /**
   * Deleting it (T517, AC-362; design 14, state A): Delete chart… in the
   * header's ⋯, for those who may change its folder — anyone with sign-in
   * off; with it on, in their workspace, or as a shared folder's read-write
   * member, who may copy it. Never a shared dashboard's own chart, which goes
   * only as its dashboard changes (T502, AC-278). The dialog asks the server
   * what uses it first; a chart a shared dashboard shows is refused, naming
   * those dashboards.
   */
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const moreButton = useRef<HTMLSpanElement>(null);
  const mayDelete =
    me.data !== undefined &&
    stored.data !== undefined &&
    // No place said: a server with no workspaces, as phase 1's was.
    (place === undefined ||
      place.kind === 'workspace' ||
      (place.kind === 'shared' && place.copy !== undefined));
  const title = saved?.title ?? stored.data?.body.title ?? 'Chart';
  const deleted = () => {
    setDeleting(false);
    // Back to its folder, which says it's gone (A5).
    sayOnExplore(`Deleted “${title}”.`);
    void queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
    void queryClient.invalidateQueries({ queryKey: ['folders'] });
    void queryClient.invalidateQueries({ queryKey: ['folder-roots'] });
    // Its open proposal, withdrawn with it, leaves Reviews (T528).
    void queryClient.invalidateQueries({ queryKey: ['reviews'] });
    router.history.push(exploreHref(stored.data?.body.folderId ?? SHARED_ROOT.id));
  };

  /** Putting it on another dashboard (AC-022): only with a workspace (T760, AC-277). */
  const addTo = !mayChange ? null : (
    <div className="chart-page__add">
      <label htmlFor="add-to-dashboard">Dashboard</label>
      <select
        id="add-to-dashboard"
        value={target}
        onChange={(event) => setTarget(event.target.value)}
      >
        <option value="">Choose a dashboard…</option>
        {dashboards.map((dashboard) => (
          <option key={dashboard.id} value={dashboard.id}>
            {dashboard.title}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={target === '' || addToDashboard.isPending}
        onClick={() => addToDashboard.mutate(target)}
      >
        Add to dashboard
      </button>
      {/* Under way, in words with its icon, not only by the button fading (AC-177). */}
      {addToDashboard.isPending ? <StateLine kind="run">Adding it…</StateLine> : null}
      {addToDashboard.data === undefined ? null : (
        <StateLine kind="ok" testId="added-as-copy">
          {addToDashboard.data}
        </StateLine>
      )}
      {addToDashboard.isError ? (
        <StateLine kind="err">{(addToDashboard.error as Error).message}</StateLine>
      ) : null}
    </div>
  );

  return (
    <div className="with-panel" data-open={historyOpen ? 'true' : undefined}>
      <div className="with-panel__main">
        <section className="chart-page">
          {/* In My workspace, the place says it is theirs alone (T348; design
              04, pin 2 and state F). */}
          {place?.kind === 'workspace' ? <WorkspaceBand /> : null}
          <RestoreDialogs
            kind="chart"
            restore={restore}
            onProposed={(text, proposalId) => {
              setRestored({ text, proposalId });
            }}
          />
          {restored === undefined ? null : (
            <StateLine kind="ok" testId="restore-proposed">
              {restored.text}{' '}
              <a href={`/reviews/${encodeURIComponent(restored.proposalId)}`}>Review now</a>
            </StateLine>
          )}
          {/* Its author's band: waiting, or rejected with the reason (T358,
          AC-290). None for anyone else; the single user's too (T359). */}
          {viaWorkspace ? (
            <ProposalBand
              kind="chart"
              id={chartId}
              onProposeAgain={(path) => {
                setProposingAgain(path);
              }}
            />
          ) : null}
          {proposingAgain !== null ? (
            <ProposeFlow
              item={{ kind: 'chart', id: chartId, title: saved?.title ?? 'Chart' }}
              targetPath={proposingAgain}
              onClose={() => {
                setProposingAgain(null);
              }}
              onProposed={() => {
                setProposingAgain(null);
              }}
            />
          ) : null}
          <header className="chart-page__head">
            {/* The way back to its folder (AC-195), once the chart is read; to
            Explore's top if it cannot be. */}
            {stored.isSuccess ? <FolderCrumbs folderId={stored.data.body.folderId} /> : null}
            {stored.isError ? <FolderCrumbs folderId={undefined} /> : null}
            {/* Its title is the page's heading (AC-212). */}
            <h1 className="workspace-title">{saved?.title ?? 'Chart'}</h1>
            {typeText === undefined ? null : (
              <span className="badge" data-testid="chart-type">
                {typeText}
              </span>
            )}
            {/* The id the address selected (AC-002), for a reader of the page's
            source rather than its text. */}
            <span hidden data-testid="selected-object">
              {chartId}
            </span>
            {/* Whose it is (T463, AC-126): a local chart lives on one dashboard. */}
            {home.data === undefined ? null : <ChartHomeLine home={home.data} />}
            <span className="chart-page__spacer" />
            {/* Its versions, beside it (T357, AC-289; design 06, pin 1): only
            where the API shows them, to the folder's read-write members. A
            .btn with its clock, pressed while its panel is open (T684). */}
            {mayHistory ? (
              <button
                type="button"
                className={
                  historyOpen ? 'btn pressed dashboard__history' : 'btn dashboard__history'
                }
                data-history-button=""
                aria-pressed={historyOpen}
                onClick={() => {
                  setHistoryOpen((was) => !was);
                }}
              >
                <HistoryIcon />
                History
              </button>
            ) : null}
            {/* A local chart is edited where it is saved — on its dashboard — or
            saved to folders first (AC-127); never in an editor that can't
            save it (T463, UX-040). A library chart is edited here. */}
            {localTo === undefined ? (
              stored.isPending || !mayChange ? null : place?.kind === 'shared' ? (
                // A shared one is changed in a copy, never in place (T348,
                // AC-278): the user's copy opens, or one is made and opened.
                place.copy === undefined ? null : (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={copyChart.isPending}
                    onClick={() => {
                      if (place.copy?.copyId != null)
                        globalThis.location.assign(
                          `/explore/charts/${encodeURIComponent(place.copy.copyId)}/edit`,
                        );
                      else copyChart.mutate();
                    }}
                  >
                    <PencilIcon />
                    {place.copy.label}
                  </button>
                )
              ) : (
                <>
                  {/* A workspace one's way back is its primary (design 04,
                      state F), Edit beside it. */}
                  <a
                    className={
                      // A head's one height (T684): a plain .btn beside its primary.
                      place?.kind === 'workspace' && place.proposeTo !== undefined
                        ? 'btn'
                        : 'btn-primary'
                    }
                    href={`/explore/charts/${encodeURIComponent(chartId)}/edit`}
                  >
                    <span aria-hidden="true">✎ </span>Edit chart
                  </a>
                  {place?.kind === 'workspace' && place.proposeTo !== undefined ? (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setProposingAgain(place.proposeTo!.targetPath);
                      }}
                    >
                      {place.proposeTo.label}
                    </button>
                  ) : null}
                </>
              )
            ) : place?.kind === 'shared' ? null : (
              // On a shared dashboard it is edited only in a copy of that
              // dashboard (T348's review, AC-278): nothing to do here.
              <LocalChartActions dashboardId={localTo} home={home} />
            )}
            {/* Destructive and occasional actions in ⋯ (design 06, pin 5;
                design 14, screen 2): Delete chart…, last. */}
            {mayDelete ? (
              <span ref={moreButton} className="chart-page__more">
                <MenuButton
                  label={`More actions for ${title}`}
                  // A 32 px icon button, as design 14:391 draws it (T684).
                  className="icon-button"
                  items={[
                    {
                      key: 'delete',
                      label: 'Delete chart…',
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
            {/* Where it lives (T348; design 04, states E and F). */}
            {place?.line === undefined || localTo !== undefined ? null : (
              <p className="dashboard__ownership">{place.line}</p>
            )}
            {copyChart.isError ? (
              <p role="alert" className="propose-dialog__refused">
                {copyChart.error.message}
              </p>
            ) : null}
          </header>

          <div className="chart-page__body">
            <div className="chart-page__canvas">
              {/* The tile's own states, as a dashboard draws them (AC-042). */}
              {drawn.isPending ? (
                <TileSkeleton chartType={definition?.chartType ?? 'bar'} height={360} />
              ) : null}
              {drawn.isError ? (
                <TileError error={drawn.error} onRetry={() => void drawn.refetch()} />
              ) : null}
              {failure === undefined ? null : failure === NOTHING_CHOSEN ? (
                // Not a failure: a chart not built yet — what to do next.
                <StateLine kind="idle" testId="chart-page-empty">
                  {/* Never pointing one with no workspace to an Edit they don't have (T760's review). */}
                  {!mayChange
                    ? 'This chart has no fields yet.'
                    : localTo === undefined
                      ? 'This chart has no fields yet. Use Edit chart to finish it.'
                      : `This chart has no fields yet. Use Edit on ${home.data?.title ?? 'its dashboard'} to finish it.`}
                </StateLine>
              ) : failure === CHART_MISSING ? (
                <StateLine kind="idle">{CHART_MISSING}</StateLine>
              ) : (
                <TileError error={failure} onRetry={() => void drawn.refetch()} />
              )}
              {formatted === undefined ? null : (
                <div className="chart-page__tile">
                  <ChartTile
                    spec={formatted}
                    height={360}
                    asOf={drawn.data?.answered?.lastRefreshTime}
                    served={drawn.data?.answered}
                    rowsTotal={drawn.data?.answered?.total}
                  />
                </div>
              )}
            </div>

            <aside className="chart-page__details" aria-label="Chart details">
              <Detail title="Built on">
                {definition === undefined ? null : source === undefined || source === '' ? (
                  <p className="chart-page__none">Nothing yet</p>
                ) : (
                  <p className="chart-page__source">
                    {kindOf(source) === undefined ? source : `${kindOf(source) ?? ''}: ${source}`}
                  </p>
                )}
              </Detail>
              <Detail title="Metrics">{pills(measures, 'measure')}</Detail>
              <Detail title="Dimensions">{pills(dimensions, 'dimension')}</Detail>
              {localTo !== undefined ? (
                // One dashboard's own (AC-126): the dashboard, and what local
                // means — never a picker that would put it on a second one.
                <Detail title="Lives on">
                  {home.data === undefined ? null : (
                    <ul aria-label="The dashboard this chart lives on" className="chart-page__used">
                      <li>
                        <a href={`/explore/dashboards/${encodeURIComponent(localTo)}`}>
                          {home.data.title}
                        </a>
                      </li>
                    </ul>
                  )}
                  <p className="chart-page__none">
                    {home.data !== undefined && home.data.tileId === undefined
                      ? 'No tile on it shows this chart any more, so it cannot be edited there.'
                      : 'A local chart belongs to one dashboard and is edited there. Save it to folders to reuse it elsewhere.'}
                  </p>
                </Detail>
              ) : (
                <Detail title="Used in">
                  {using.isPending ? <StateLine kind="run">Loading…</StateLine> : null}
                  {using.isSuccess ? (
                    using.data.length === 0 ? (
                      <p data-testid="used-by-none" className="chart-page__none">
                        Not on any dashboard yet
                      </p>
                    ) : (
                      <ul aria-label="Dashboards using this chart" className="chart-page__used">
                        {using.data.map((dashboard) => (
                          <li key={dashboard.id} data-testid={`using-${dashboard.id}`}>
                            <a href={`/explore/dashboards/${encodeURIComponent(dashboard.id)}`}>
                              {dashboard.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : null}
                  {addTo}
                </Detail>
              )}
            </aside>
          </div>
          {deleting ? (
            <DeleteDialog
              name={title}
              action="Delete chart"
              check={checkChart(chartId, viaWorkspace, place?.kind === 'workspace')}
              remove={removeChart(chartId, viaWorkspace)}
              onDeleted={deleted}
              onClose={() => {
                setDeleting(false);
                // Back on the ⋯ it came from (design 14, keyboard).
                moreButton.current?.querySelector<HTMLButtonElement>('button')?.focus();
              }}
            />
          ) : null}
        </section>
      </div>
      {historyOpen ? (
        <HistoryPanel
          kind="chart"
          id={chartId}
          onRestore={restore.start}
          onClose={() => {
            setHistoryOpen(false);
            // Focus back to History, where it was opened from (rule 85).
            requestAnimationFrame(() => {
              document.querySelector<HTMLElement>('[data-history-button]')?.focus();
            });
          }}
        />
      ) : null}
    </div>
  );
}
