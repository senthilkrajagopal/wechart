import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

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

  return (
    <section className="chart-page">
      <h1>Chart</h1>
      <p data-testid="selected-object">{chartId}</p>

      <h2>Used by</h2>
      {using.isPending ? <p>Loading…</p> : null}
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
      {addToDashboard.isError ? (
        <p role="alert">{(addToDashboard.error as Error).message}</p>
      ) : null}
    </section>
  );
}
