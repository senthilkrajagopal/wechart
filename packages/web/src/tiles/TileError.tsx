import { useState } from 'react';

import { TileLoadError } from '../query/loadTile';
import { missingScopeOf, ScopeUnavailable } from '../query/scopes';

/**
 * A tile whose query failed (AC-012).
 *
 * Cube's own message is shown verbatim rather than translated into something
 * friendlier: "Can't find join path between Orders and Suppliers" tells an
 * author what to change, where "Something went wrong" tells them to file a
 * ticket. The query JSON is one control away, because it is the other half of
 * diagnosing the failure — and behind a control, because it is noise while the
 * message is enough.
 */
export interface TileErrorProps {
  readonly error: unknown;
  readonly onRetry?: () => void;
}

export function TileError({ error, onRetry }: TileErrorProps) {
  const [showQuery, setShowQuery] = useState(false);
  const message = error instanceof Error ? error.message : String(error);
  const query = error instanceof TileLoadError ? error.query : null;

  // A scope wechart's context lacks is not this chart's failure (T176, AC-170).
  const lacking = missingScopeOf(error);
  if (lacking !== undefined) return <ScopeUnavailable scope={lacking} what="This chart" />;

  return (
    <div className="tile-error" role="alert">
      <p className="tile-error__headline">
        {/* Icon plus label, never colour alone (direction.md rule 3). */}
        <span data-icon="error" aria-hidden="true">
          ⚠
        </span>{' '}
        Could not load this chart
      </p>
      <p className="tile-error__message">{message}</p>
      <div className="tile-error__actions">
        {onRetry ? (
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        ) : null}
        {query ? (
          <button
            type="button"
            aria-expanded={showQuery}
            onClick={() => setShowQuery((shown) => !shown)}
          >
            {showQuery ? 'Hide query' : 'Show query'}
          </button>
        ) : null}
      </div>
      {showQuery && query ? (
        <pre className="tile-error__query" data-testid="tile-error-query">
          {JSON.stringify(query, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
