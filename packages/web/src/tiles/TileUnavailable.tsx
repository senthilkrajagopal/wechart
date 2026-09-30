/**
 * Cube's answer to a query asking for a member no access policy grants the
 * security context: HTTP 500, "You requested hidden member: '<member>'.
 * Please make it visible using `public: true`. …" — a hidden member, not a
 * 403 — naming the first such member only (research/cube/access-control.md,
 * "Observed locally", and the open issue it cites).
 *
 * Cube words a member that is `public: false` for every context the same
 * way, so under a preview such a chart reads as unavailable to the context
 * too; outside a preview it shows Cube's message, advice and all.
 */
const HIDDEN = /You requested hidden member: '([^']+)'/;
/**
 * xcube's folder gate (T436, AC-320): a 403 naming the folder none of the
 * context's groups reaches, and the cube or view in it (research
 * xcube-4754c2c960.md, "A query into a folder the groups don't reach").
 */
const GATED = /None of these groups reaches folder \S+ \(([^)]+)\)/;

/**
 * The member Cube refused the context first, or the cube xcube's folder gate
 * refused it; undefined for any other failure.
 */
export function hiddenMemberOf(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : undefined;
  if (message === undefined) return undefined;
  return HIDDEN.exec(message)?.[1] ?? GATED.exec(message)?.[1];
}

/**
 * A tile the previewed security context cannot see (T173, AC-167): a state of
 * the context, not a failure of the chart, so it is said as one — the member
 * Cube refused it, and that there may be more, since Cube names one — in
 * secondary ink, rather than as Cube's advice to make the member public,
 * which is not what the author should do.
 */
export function TileUnavailable({
  member,
  title,
}: {
  member: string;
  /** Its title from the model (AC-220), which it is named by where there is one. */
  title?: string | undefined;
}) {
  return (
    <div className="tile-empty" data-testid="tile-unavailable">
      <p>
        <span data-icon="unavailable" aria-hidden="true">
          ⊘
        </span>{' '}
        Not available to this security context
      </p>
      <p>
        Cube refuses it {title ?? <code>{member}</code>}, and may refuse other fields this chart
        uses.
      </p>
    </div>
  );
}
