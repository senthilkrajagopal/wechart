import { formatValue, type MemberFormats } from '@wechart/core';

import { useElementAnswer } from './useElementAnswer';

/**
 * A Value as read (T884, AC-520; design 21 pin 8, state C5): the measure in
 * its model's format (AC-046), "—" where there's nothing to show — the
 * author's choice with nothing marked, or no data for these filters (G2).
 */
export function ValueText({
  value,
  none = false,
  member,
  formats,
  busy = false,
}: {
  readonly value?: unknown;
  readonly none?: boolean;
  readonly member: string;
  readonly formats?: MemberFormats | undefined;
  readonly busy?: boolean;
}) {
  const written = none ? '' : formatValue(value, member, formats);
  return (
    <span
      className="text-value"
      data-testid="text-element-value"
      aria-busy={busy ? true : undefined}
    >
      {written === '' ? '—' : written}
    </span>
  );
}

/** A Value asked of Cube: loading, failed, or its value (design 21 G1–G3). */
export function ValueElement({
  asked,
  member,
  formats,
  context,
}: {
  readonly asked: { readonly query: Readonly<Record<string, unknown>> } | { readonly none: true };
  readonly member: string;
  readonly formats?: MemberFormats | undefined;
  readonly context?: Readonly<Record<string, unknown>> | undefined;
}) {
  const answer = useElementAnswer('query' in asked ? asked.query : undefined, context);
  if ('none' in asked) return <ValueText none member={member} />;
  if (answer.pending)
    return (
      <span className="text-value text-value--waiting" aria-busy="true">
        …
      </span>
    );
  if (answer.error !== undefined)
    return <span className="text-value text-value--unavailable">Unavailable</span>;
  return (
    <ValueText
      value={answer.rows[0]?.[member]}
      member={member}
      formats={formats}
      busy={answer.busy}
    />
  );
}
