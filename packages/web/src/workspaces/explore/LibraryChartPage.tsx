import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { readChartDocument } from '@wechart/core';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

import { CHART_MISSING, formatsFrom } from '../../dashboard/chartSpec';
import { NOTHING_CHOSEN } from '../../dashboard/edit/templates';
import { specFor } from '../../dashboard/DashboardPage';
import { allMembers } from '../../filters/FilterBar';
import { META_QUERY } from '../../query/meta';
import { StateLine } from '../../shell/StatusIcon';
import { ChartTile } from '../../tiles/ChartTile';
import { TileError } from '../../tiles/TileError';
import { TileSkeleton } from '../../tiles/TileSkeleton';
import { CHART_TYPE_LABEL, chartTypeText } from './chartTypeLabels';
import { FolderCrumbs } from './FolderCrumbs';

/**
 * A library chart's page, as the prototype's `chartPage()` (AC-212): its
 * title as the heading with its type and Edit chart, the chart drawn, and
 * beside it what it is built on, its measures and dimensions, and the
 * dashboards it is used on (AC-022), with a way to add it to another.
 *
 * Knowing where a chart is already used is what makes editing it safe — it is
 * the same question AC-023 asks before a delete and AC-128 asks before an edit.
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
      getJson<{ body: { folderId?: string } }>(
        `/api/documents/chart/${encodeURIComponent(chartId)}`,
      ),
  });

  /**
   * The chart itself, read and drawn as a dashboard tile draws it (AC-212):
   * the same `specFor`, so it looks the same here as it does there.
   */
  const drawn = useQuery({
    queryKey: ['library-chart', chartId],
    queryFn: () => specFor(chartId),
  });
  const meta = useQuery(META_QUERY);
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
        : {
            ...spec,
            formats: formatsFrom(meta.data),
            titles: Object.fromEntries(
              allMembers(meta.data).map((member) => [member.name, member.title]),
            ),
            // For a one-source chart's legend and KPI (T403).
            shortTitles: Object.fromEntries(
              allMembers(meta.data).map((member) => [member.name, member.shortTitle]),
            ),
          },
    [spec, meta.data],
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
      : definition.chartType === undefined && spec !== undefined && hasFields
        ? `${CHART_TYPE_LABEL[spec.chartType]} · auto`
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

  const candidates = useQuery({
    queryKey: ['search', 'dashboards'],
    queryFn: () =>
      getJson<{ id: string; title: string; kind: string }[]>('/api/folders/root/contents'),
  });

  const addToDashboard = useMutation({
    mutationFn: async (dashboardId: string) => {
      const response = await fetch(`/api/dashboards/${encodeURIComponent(dashboardId)}/charts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chartId }),
      });
      if (!response.ok) throw new Error(`Could not add: ${String(response.status)}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['chart-dashboards', chartId] });
      setTarget('');
    },
  });

  const dashboards = (candidates.data ?? []).filter((item) => item.kind === 'dashboard');

  /**
   * AC-023: a delete that would affect dashboards is refused by the service
   * until confirmed, and the refusal carries their names. The dialog shows
   * what the server said rather than a list the browser assembled, so what the
   * user confirms is what the server checked.
   */
  const [blockedBy, setBlockedBy] = useState<UsingDashboard[] | null>(null);
  /**
   * The confirmation's focus (T182, AC-176): on the choice that loses nothing
   * as it opens, Escape keeps the chart, and closing gives focus back to
   * Delete chart — a keyboard user is never left on a control that has gone.
   */
  const deleteButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const confirming = blockedBy !== null;
  useEffect(() => {
    if (!confirming) return undefined;
    keepButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setBlockedBy(null);
      deleteButton.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [confirming]);

  const remove = useMutation({
    mutationFn: async (confirmed: boolean) => {
      const response = await fetch(
        `/api/documents/chart/${encodeURIComponent(chartId)}${confirmed ? '?confirm=true' : ''}`,
        { method: 'DELETE' },
      );

      if (response.status === 409) {
        const conflict = (await response.json()) as { dashboards: UsingDashboard[] };
        setBlockedBy(conflict.dashboards);
        return 'blocked' as const;
      }
      if (!response.ok) throw new Error(`Could not delete: ${String(response.status)}`);
      return 'deleted' as const;
    },
    onSuccess: (outcome) => {
      if (outcome === 'deleted') globalThis.location.assign('/explore');
    },
  });

  /** Putting it on another dashboard (AC-022). */
  const addTo = (
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
      {addToDashboard.isError ? (
        <StateLine kind="err">{(addToDashboard.error as Error).message}</StateLine>
      ) : null}
    </div>
  );

  /** Deleting it, confirmed where dashboards use it (AC-023). */
  const deleteControls = (
    <>
      <button
        ref={deleteButton}
        type="button"
        onClick={() => remove.mutate(false)}
        disabled={remove.isPending}
      >
        Delete chart
      </button>
      {remove.isPending ? <StateLine kind="run">Deleting it…</StateLine> : null}

      {blockedBy ? (
        <div role="alertdialog" aria-labelledby="delete-heading" className="confirm">
          <h3 id="delete-heading">Delete this chart?</h3>
          <p>
            {blockedBy.length === 1
              ? 'One dashboard uses this chart:'
              : `${String(blockedBy.length)} dashboards use this chart:`}
          </p>
          <ul aria-label="Dashboards that use this chart">
            {blockedBy.map((dashboard) => (
              <li key={dashboard.id}>{dashboard.title}</li>
            ))}
          </ul>
          <p>Deleting it will leave them without this chart.</p>
          <button type="button" onClick={() => remove.mutate(true)}>
            Delete anyway
          </button>
          <button
            ref={keepButton}
            type="button"
            onClick={() => {
              setBlockedBy(null);
              deleteButton.current?.focus();
            }}
          >
            Keep the chart
          </button>
        </div>
      ) : null}

      {remove.isError ? <StateLine kind="err">{(remove.error as Error).message}</StateLine> : null}
    </>
  );

  return (
    <section className="chart-page">
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
        <span className="chart-page__spacer" />
        <a className="btn-primary" href={`/explore/charts/${encodeURIComponent(chartId)}/edit`}>
          <span aria-hidden="true">✎ </span>Edit chart
        </a>
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
              This chart has no fields yet. Use Edit chart to finish it.
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
          <Detail title="Delete">{deleteControls}</Detail>
        </aside>
      </div>
    </section>
  );
}
