import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef } from 'react';

import { forItem, useQueryItem } from '../query/item';
import { StateLine } from '../shell/StatusIcon';
import { useFocusTrap } from '../shell/useFocusTrap';

/**
 * A chart tile's View query (AC-199): the Cube query it asks — its chart's,
 * with the filters that reach it — and the SQL Cube runs for it, as the
 * prototype's "View query (Cube JSON + SQL)". Asked as the previewed context
 * where there is one, as wechart otherwise.
 *
 * A modal dialog, as the SQL-as-context one is: Escape or Close puts it away
 * and the caller gives focus back to where it was opened from.
 */
export function ViewQuery({
  title,
  query,
  context,
  onClose,
}: {
  title: string;
  query: Readonly<Record<string, unknown>>;
  context?: Readonly<Record<string, unknown>> | undefined;
  onClose: () => void;
}) {
  const heading = useId();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useFocusTrap(box);

  // The dashboard the tile is on (T340, AC-268).
  const item = useQueryItem();
  const sql = useQuery({
    queryKey: ['view-query-sql', query, context, item ?? null],
    queryFn: async ({ signal }): Promise<{ queries: { sql: string; params: unknown[] }[] }> => {
      const response = await fetch('/api/sql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          query,
          ...(context === undefined ? {} : { context }),
          ...forItem(item),
        }),
        signal,
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error = (body as { error?: unknown } | null)?.error;
        throw new Error(
          typeof error === 'string' ? error : `Cube answered ${String(response.status)}.`,
        );
      }
      return body as { queries: { sql: string; params: unknown[] }[] };
    },
    staleTime: 0,
  });

  // The latest `onClose`, read by Escape without re-running the effect below.
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    close.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closing.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        className="dialog view-query"
      >
        <h2 id={heading}>Query for {title}</h2>
        <h3>Cube query</h3>
        <pre className="view-query__code" data-testid="cube-query">
          {JSON.stringify(query, null, 2)}
        </pre>
        <h3>SQL</h3>
        {sql.isPending ? <StateLine kind="run">Asking Cube for its SQL…</StateLine> : null}
        {sql.isError ? <StateLine kind="err">{sql.error.message}</StateLine> : null}
        {sql.isSuccess
          ? sql.data.queries.map(({ sql: text, params }, index) => (
              // Positions: Cube's statements, in the order it gave them.
              <div key={String(index)} data-testid="generated-sql">
                <pre className="view-query__code">{text}</pre>
                {params.length === 0 ? null : (
                  <p className="view-query__params">
                    Values bound, in order:{' '}
                    {params.map((value, at) => `${String(at + 1)} = ${String(value)}`).join(', ')}
                  </p>
                )}
              </div>
            ))
          : null}
        <div className="dialog__actions">
          <button type="button" ref={close} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
