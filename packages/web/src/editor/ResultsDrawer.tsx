import { formatValue, UNDERLYING_ROW_LIMIT, type MemberFormats } from '@wechart/core';
import { useQuery } from '@tanstack/react-query';

import { loadTile } from '../query/loadTile';

/**
 * The results drawer (AC-036): the result rows, the rows underneath them, and
 * the Cube query the chart actually ran.
 *
 * The result rows shown here are **the same data the chart rendered**, passed
 * in rather than re-fetched. Re-fetching would let the drawer and the chart
 * disagree, which is precisely the failure the criterion names.
 *
 * Open/view state is owned by the editor, not by this component: the drawer is
 * unmounted whenever the chart has no fields, and state kept here would be
 * lost every time the user emptied a well or switched cube, reopening the
 * drawer closed under someone who had opened it.
 */
export type DrawerView = 'result' | 'underlying' | 'query';

export interface ResultsDrawerProps {
  readonly rows: readonly Record<string, unknown>[];
  readonly query: Record<string, unknown>;
  /** The ungrouped query for the rows beneath the aggregate. */
  readonly underlyingQuery: Record<string, unknown>;
  readonly open: boolean;
  readonly view: DrawerView;
  /**
   * Each member's number format from the Cube model (AC-046, T195): the
   * criterion names tables among the places a value wears it.
   */
  readonly formats?: MemberFormats;
  readonly onOpenChange: (open: boolean) => void;
  readonly onViewChange: (view: DrawerView) => void;
}

/** How many rows a table draws before it stops and says so. */
const VISIBLE_ROWS = UNDERLYING_ROW_LIMIT;

/**
 * A cell as text: in its member's format where the model declares one, and
 * as it came otherwise — a member with no format may be an id, which is not a
 * quantity, and grouping it ("1,234") would misstate it.
 */
function cellText(value: unknown, member: string, formats: MemberFormats): string {
  return formats[member] === undefined ? String(value ?? '') : formatValue(value, member, formats);
}

function RowTable({
  rows,
  testId,
  formats,
  capped = false,
}: {
  rows: readonly Record<string, unknown>[];
  testId: string;
  formats: MemberFormats;
  /**
   * True when the rows came back from a capped query, so a full page is
   * evidence of more rows rather than of the total.
   * research/cube/data-apis.md: "treat `rows === limit` as truncated".
   */
  capped?: boolean;
}) {
  if (rows.length === 0) return <p data-testid={`${testId}-empty`}>No rows.</p>;

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const shown = rows.slice(0, VISIBLE_ROWS);

  // Silence is the one thing a data drawer must not do here: a table that
  // quietly stops at 100 rows while the chart says 240 reads as disagreement
  // between the two, which is what AC-036 exists to prevent.
  const note =
    rows.length > VISIBLE_ROWS
      ? `Showing the first ${String(VISIBLE_ROWS)} of ${String(rows.length)} rows.`
      : capped && rows.length === VISIBLE_ROWS
        ? `Showing the first ${String(VISIBLE_ROWS)} rows. There may be more.`
        : null;

  return (
    <>
      {note === null ? null : (
        <p data-testid={`${testId}-truncated`} role="status">
          {note}
        </p>
      )}
      <table data-testid={testId}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th scope="col" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column}>{cellText(row[column], column, formats)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function ResultsDrawer({
  rows,
  query,
  underlyingQuery,
  open,
  view,
  formats = {},
  onOpenChange,
  onViewChange,
}: ResultsDrawerProps) {
  const underlying = useQuery({
    queryKey: ['underlying', underlyingQuery],
    queryFn: ({ signal }) => loadTile({ query: underlyingQuery, signal }),
    // Only asked for when the drawer is actually showing it: the rows beneath
    // an aggregate can be a large query, and nobody asked for it yet.
    enabled: open && view === 'underlying',
  });

  const underlyingRows = ((underlying.data as { data?: unknown[] } | undefined)?.data ??
    []) as Record<string, unknown>[];

  return (
    <section className="results-drawer">
      <button type="button" aria-expanded={open} onClick={() => onOpenChange(!open)}>
        Results
      </button>

      {open ? (
        <div data-testid="results-drawer">
          <div role="tablist" aria-label="Results">
            {(
              [
                ['result', 'Result rows'],
                ['underlying', 'Underlying rows'],
                ['query', 'Query'],
              ] as [DrawerView, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                data-testid={`drawer-tab-${id}`}
                onClick={() => onViewChange(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {view === 'result' ? (
            <div role="tabpanel" aria-label="Result rows">
              <RowTable rows={rows} testId="drawer-result-rows" formats={formats} />
            </div>
          ) : null}

          {view === 'underlying' ? (
            <div role="tabpanel" aria-label="Underlying rows">
              {underlying.isPending ? (
                <p>Loading…</p>
              ) : underlying.isError ? (
                <p role="alert">{(underlying.error as Error).message}</p>
              ) : (
                <RowTable
                  rows={underlyingRows}
                  testId="drawer-underlying-rows"
                  formats={formats}
                  capped
                />
              )}
            </div>
          ) : null}

          {view === 'query' ? (
            <div role="tabpanel" aria-label="Query">
              <pre data-testid="drawer-query">{JSON.stringify(query, null, 2)}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
