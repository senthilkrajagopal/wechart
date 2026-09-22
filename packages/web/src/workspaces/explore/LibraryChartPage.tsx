import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { StateLine } from '../../shell/StatusIcon';

/**
 * A library chart's page (AC-022): every dashboard that uses it, and a way to
 * add it to another.
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

export function LibraryChartPage({ chartId }: LibraryChartPageProps) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState('');

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

  return (
    <section className="chart-page">
      <h1>Chart</h1>
      <p data-testid="selected-object">{chartId}</p>

      <h2>Used by</h2>
      {using.isPending ? <StateLine kind="run">Loading…</StateLine> : null}
      {using.isSuccess ? (
        using.data.length === 0 ? (
          <p data-testid="used-by-none">No dashboard uses this chart yet.</p>
        ) : (
          <ul aria-label="Dashboards using this chart">
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

      <h2>Add to a dashboard</h2>
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

      <h2>Delete</h2>
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
    </section>
  );
}
