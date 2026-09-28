/**
 * Whether a tile's numbers came from a pre-aggregation or from the source
 * database, and how old they are (AC-013).
 *
 * Requirements §4: data volumes vary widely, so the UI has to make clear which
 * queries are accelerated. Both directions matter — labelling everything "live"
 * hides that a number is an hour old, and labelling everything "accelerated"
 * claims a freshness guarantee that is not there.
 */
import { relativeAge } from '../shell/relativeAge';

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
 * Cube reports `usedPreAggregations` on the result, and leaves it out of a
 * source-database answer (research/cube/pre-aggregations.md §4). An empty set
 * is taken as live too, so the key's *presence* proves nothing — only a
 * non-empty set means the result was accelerated.
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

  /**
   * Shown as the prototype's tile badge is — the icon and the age, "⚡ 40m" —
   * so a half-width tile keeps room for its title (T014's review). The words
   * are the badge's text for a screen reader, and its tooltip, with the
   * rollup's name.
   */
  const built = lastUpdatedAt ? `built ${relativeAge(lastUpdatedAt, now)}` : 'age unknown';
  const short = lastUpdatedAt ? shortAge(lastUpdatedAt, now) : '?';
  return (
    <span
      className="acceleration acceleration--accelerated"
      data-testid="acceleration"
      title={`Accelerated: served from ${preAggregation ?? 'a pre-aggregation'}, ${built}`}
    >
      <span data-icon="accelerated" aria-hidden="true">
        ⚡
      </span>
      <span className="acceleration__short" aria-hidden="true">
        {short}
      </span>
      <span className="visually-hidden">Accelerated · {built}</span>
    </span>
  );
}

/** The age as the prototype's badge writes it: "45s", "40m", "3h", "2d", "1w". */
function shortAge(then: Date, now: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  const units: [number, string][] = [
    [7 * 24 * 3600, 'w'],
    [24 * 3600, 'd'],
    [3600, 'h'],
    [60, 'm'],
  ];
  for (const [size, unit] of units)
    if (seconds >= size) return `${String(Math.round(seconds / size))}${unit}`;
  return `${String(seconds)}s`;
}
