import { addToWell, emptySpec, isEmpty, removeFromWell, toCubeQuery } from '@wechart/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { explain, recommend, type Signature } from '@wechart/recommender';

import { loadTile } from '../query/loadTile';
import { WhyThisChart } from './WhyThisChart';
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

  // Memoised: a fresh array each render would defeat every memo below it, so
  // the signature — and with it the recommendation — would be recomputed on
  // every keystroke.
  const rows = useMemo(
    () =>
      ((result.data as { data?: unknown[] } | undefined)?.data ?? []) as Record<string, unknown>[],
    [result.data],
  );

  /**
   * Cardinalities come from the rows the query actually returned, not from a
   * separate count. What decides whether a chart reads is how many values are
   * *in this result*, and it costs nothing extra (AC-028).
   */
  const signature: Signature = useMemo(() => {
    const distinct = (member: string) => new Set(rows.map((row) => String(row[member] ?? ''))).size;

    return {
      fields: [
        ...spec.measures.map((name) => ({ name, kind: 'measure' as const })),
        ...spec.dimensions.map((name) => ({
          name,
          kind: 'dimension' as const,
          ...(rows.length > 0 ? { cardinality: distinct(name) } : {}),
        })),
        ...spec.timeDimensions.map((name) => ({
          name,
          kind: 'timeDimension' as const,
          ...(rows.length > 0 ? { cardinality: distinct(name) } : {}),
        })),
      ],
      rowCount: rows.length,
    };
  }, [spec, rows]);

  const recommendation = useMemo(() => recommend(signature), [signature]);
  const explanation = useMemo(() => explain(signature), [signature]);

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
        <h3>Chart</h3>
        {recommendation.top ? (
          <div data-testid="recommendation">
            <p data-testid="recommended-type">{recommendation.top.candidate.chartType}</p>
            <p data-testid="recommended-reason">{recommendation.top.reason}</p>
            <h4>Or</h4>
            <ul>
              {recommendation.runnersUp.map((runnerUp) => (
                <li
                  key={runnerUp.candidate.chartType}
                  data-testid={`runner-up-${runnerUp.candidate.chartType}`}
                >
                  {runnerUp.candidate.chartType} — {runnerUp.reason}
                </li>
              ))}
            </ul>
            <WhyThisChart explanation={explanation} />
          </div>
        ) : null}

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
