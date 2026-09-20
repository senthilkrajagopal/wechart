import { addToWell, emptySpec, isEmpty, removeFromWell, toCubeQuery } from '@wechart/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { loadTile } from '../query/loadTile';
import { FieldList } from './FieldList';
import { Wells } from './Wells';
import { membersOf, type Member } from './fields';

/**
 * The chart editor (AC-025, AC-026).
 *
 * Adding a field to a well re-runs the chart's query. The result is shown as a
 * row count and a preview until the renderer lands (F5); what the criterion
 * asks for is that the result changes, not yet how it is drawn.
 */
export function ChartEditor() {
  const [cubeName, setCubeName] = useState('');
  const [spec, setSpec] = useState(emptySpec());
  /** The field under the pointer during a drag, so wells can judge it (AC-027). */
  const [dragging, setDragging] = useState<Member | null>(null);

  const meta = useQuery({
    queryKey: ['meta'],
    queryFn: async () => {
      const response = await fetch('/api/meta');
      if (!response.ok) throw new Error(`Could not load the model: ${String(response.status)}`);
      return (await response.json()) as unknown;
    },
  });

  const available = useMemo(
    () => (cubeName ? membersOf(meta.data, cubeName) : []),
    [meta.data, cubeName],
  );

  const query = useMemo(() => toCubeQuery(spec), [spec]);

  /**
   * Keyed by the query, so adding a field re-runs it: the key changes, the
   * previous request is abandoned and its Cube-side query cancelled (AC-011),
   * and the tile shows the new result rather than the old one.
   */
  const result = useQuery({
    queryKey: ['editor-preview', query],
    queryFn: ({ signal }) => loadTile({ query, signal }),
    enabled: !isEmpty(spec),
  });

  const rows = ((result.data as { data?: unknown[] } | undefined)?.data ?? []) as Record<
    string,
    unknown
  >[];

  return (
    <div className="chart-editor">
      <div className="chart-editor__fields">
        <FieldList
          cubeName={cubeName}
          onDragStateChange={setDragging}
          onCubeChange={(next) => {
            setCubeName(next);
            // Members belong to a cube; keeping them across a change would
            // build a query naming fields the new cube does not have.
            setSpec(emptySpec(next));
          }}
        />
      </div>

      <div className="chart-editor__wells">
        <Wells
          spec={spec}
          available={available}
          dragging={dragging}
          onAdd={(well, member) => setSpec((current) => addToWell(current, well, member))}
          onRemove={(well, member) => setSpec((current) => removeFromWell(current, well, member))}
        />
      </div>

      <section className="chart-editor__result" data-testid="editor-result">
        <h3>Result</h3>
        {isEmpty(spec) ? (
          <p data-testid="result-empty">Add a field to see data.</p>
        ) : result.isPending ? (
          <p data-testid="result-loading">Running the query…</p>
        ) : result.isError ? (
          <p role="alert">{(result.error as Error).message}</p>
        ) : (
          <>
            <p data-testid="result-row-count">{rows.length} rows</p>
            <pre data-testid="result-first-row">{JSON.stringify(rows[0] ?? null)}</pre>
          </>
        )}
      </section>
    </div>
  );
}
