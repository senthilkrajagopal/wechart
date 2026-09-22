import { Status } from './StateBadge';

/**
 * The query records in the Jobs workspace (AC-016).
 *
 * Failed queries are listed alongside successful ones: a query that ran for
 * four seconds and then errored is what someone opens this list to find.
 */
export interface QueryRecord {
  readonly id: number;
  readonly requestId: string;
  readonly query: Record<string, unknown>;
  readonly durationMs: number;
  readonly accelerated: boolean;
  readonly preAggregation?: string | null;
  readonly error?: string | null;
  readonly createdAt: string;
}

export interface QueryLogProps {
  readonly records: readonly QueryRecord[];
}

export function QueryLog({ records }: QueryLogProps) {
  if (records.length === 0) {
    return (
      <p className="query-log__empty">No queries yet. Open a dashboard and they appear here.</p>
    );
  }

  return (
    <table className="query-log">
      <caption>Queries wechart has issued, newest first</caption>
      <thead>
        <tr>
          <th scope="col">When</th>
          <th scope="col">Query</th>
          <th scope="col">Duration</th>
          <th scope="col">Source</th>
          <th scope="col">Outcome</th>
        </tr>
      </thead>
      <tbody>
        {records.map((record) => (
          <tr key={record.id}>
            <td>
              <time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleString()}</time>
            </td>
            <td>
              <details>
                <summary>{summarise(record.query)}</summary>
                <pre>{JSON.stringify(record.query, null, 2)}</pre>
              </details>
            </td>
            <td data-testid={`duration-${String(record.id)}`}>
              {formatDuration(record.durationMs)}
            </td>
            <td>
              {/* Icon plus label, never colour alone (direction.md rule 3). */}
              <span data-icon={record.accelerated ? 'accelerated' : 'live'} aria-hidden="true">
                {record.accelerated ? '⚡' : '●'}
              </span>{' '}
              {record.accelerated ? (record.preAggregation ?? 'Accelerated') : 'Live'}
            </td>
            <td className="query-log__outcome">
              {/* An icon and words either way (T158, AC-152). */}
              {record.error ? (
                <Status
                  kind="err"
                  label={`Failed: ${record.error}`}
                  testId={`query-outcome-${String(record.id)}`}
                />
              ) : (
                <Status kind="ok" label="Succeeded" testId={`query-outcome-${String(record.id)}`} />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function summarise(query: Record<string, unknown>): string {
  const measures = asNames(query['measures']);
  const dimensions = asNames(query['dimensions']);
  const parts = [...measures, ...dimensions];
  return parts.length > 0 ? parts.join(', ') : 'Query';
}

function asNames(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${String(Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`;
}
