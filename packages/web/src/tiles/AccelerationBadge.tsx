/**
 * Whether a tile's numbers came from a pre-aggregation or from the source
 * database, and how old they are (AC-013).
 *
 * Requirements §4: data volumes vary widely, so the UI has to make clear which
 * queries are accelerated. Both directions matter — labelling everything "live"
 * hides that a number is an hour old, and labelling everything "accelerated"
 * claims a freshness guarantee that is not there.
 */

export interface Acceleration {
  readonly accelerated: boolean;
  readonly lastUpdatedAt: Date | null;
  readonly preAggregation: string | null;
}

interface PreAggregationInfo {
  readonly lastUpdatedAt?: number;
  /** The model's name for it, "stable across rebuilds" (research/cube/pre-aggregations.md §4). */
  readonly preAggregationId?: string;
}

/**
 * Cube reports `usedPreAggregations` on the result. It sends the key with no
 * entries for a source-database query, so its *presence* proves nothing —
 * only a non-empty set means the result was accelerated.
 */
export function accelerationOf(result: unknown): Acceleration {
  const used =
    typeof result === 'object' && result !== null && 'usedPreAggregations' in result
      ? ((result as { usedPreAggregations?: Record<string, PreAggregationInfo> })
          .usedPreAggregations ?? {})
      : {};

  const entries = Object.entries(used);
  const first = entries[0];

  if (!first) return { accelerated: false, lastUpdatedAt: null, preAggregation: null };

  // Keyed by its table in Cube Store; named as the model names it where Cube
  // says so, which is what a reader can find in the model.
  const [table, info] = first;
  return {
    accelerated: true,
    lastUpdatedAt: typeof info.lastUpdatedAt === 'number' ? new Date(info.lastUpdatedAt) : null,
    preAggregation: typeof info.preAggregationId === 'string' ? info.preAggregationId : table,
  };
}

export interface AccelerationBadgeProps {
  readonly result: unknown;
  /** Injected so the rendered age is deterministic in tests. */
  readonly now?: Date;
}

export function AccelerationBadge({ result, now = new Date() }: AccelerationBadgeProps) {
  const { accelerated, lastUpdatedAt, preAggregation } = accelerationOf(result);

  if (!accelerated) {
    return (
      <span className="acceleration acceleration--live" data-testid="acceleration">
        <span data-icon="live" aria-hidden="true">
          ●
        </span>{' '}
        Live
      </span>
    );
  }

  return (
    <span
      className="acceleration acceleration--accelerated"
      data-testid="acceleration"
      title={preAggregation ?? undefined}
    >
      <span data-icon="accelerated" aria-hidden="true">
        ⚡
      </span>{' '}
      Accelerated · {lastUpdatedAt ? `built ${relativeAge(lastUpdatedAt, now)}` : 'age unknown'}
    </span>
  );
}

function relativeAge(then: Date, now: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  // Each pair is "once this many of the current unit have passed, divide and
  // call the result the next unit up": 2,400 seconds is 40 minutes.
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'minute'],
    [60, 'hour'],
    [24, 'day'],
    [7, 'week'],
  ];

  let value = seconds;
  let unit: Intl.RelativeTimeFormatUnit = 'second';
  for (const [size, nextUnit] of units) {
    if (Math.abs(value) < size) break;
    value = Math.round(value / size);
    unit = nextUnit;
  }

  return new Intl.RelativeTimeFormat('en', { numeric: 'always' }).format(-value, unit);
}
