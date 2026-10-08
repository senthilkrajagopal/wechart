import type { AnswerMeta } from '../query/answerMeta';
import { clockOrWhenOf, exactOf } from '../shell/formatTime';
import { relativeAge } from '../shell/relativeAge';
import { StatusIcon } from '../shell/StatusIcon';
import { accelerationOf, shortAge } from './AccelerationBadge';

/**
 * A tile's one freshness badge (T681; design 04 note 4; DSH-01, DSH-23):
 * "● Live" for an answer the database gave, "✓ Pre-agg · 3m" in the status
 * colour for one a pre-aggregation served, its build's age beside it
 * (AC-013). Nothing else, so the title keeps its room.
 *
 * The time to the second, and how long the answer took, are in its tooltip:
 * "Live query · as of 11:12:06 · 42 ms · no pre-aggregation". The badge takes
 * no focus (R76 dashboard-Q9); the tile menu's Data as of submenu carries the
 * time for the keyboard (DSH-21, AC-148). A screen reader reading the tile
 * hears the time with the word.
 */
export function FreshnessBadge({
  served,
  asOf,
  now = new Date(),
}: {
  served: AnswerMeta;
  /** Cube's `lastRefreshTime` for the answer. */
  asOf?: string | undefined;
  now?: Date;
}) {
  const { accelerated, lastUpdatedAt, preAggregation } = accelerationOf(served);
  const when = asOf === undefined ? undefined : new Date(asOf);
  const valid = when !== undefined && !Number.isNaN(when.getTime());
  // Read out with the word: the clock, with its day where it isn't today's.
  const time = valid ? clockOrWhenOf(when, now, { seconds: true }) : undefined;
  // In the tooltip, as every time's is: the exact local time with UTC beside
  // it (T477, the coordinator's Q9), to the second as note 4 asks.
  const exact = valid ? exactOf(when) : undefined;
  const took = served.elapsedMs === undefined ? undefined : `${String(served.elapsedMs)} ms`;
  const title = accelerated
    ? [
        // Named as the model names it (AC-013's tooltip, T014).
        preAggregation === null ? 'Pre-aggregation' : `Pre-aggregation ${preAggregation}`,
        exact === undefined ? undefined : `as of ${exact}`,
        took,
        lastUpdatedAt === null ? 'age unknown' : `built ${relativeAge(lastUpdatedAt, now)}`,
      ]
    : ['Live query', exact === undefined ? undefined : `as of ${exact}`, took, 'no pre-aggregation'];
  const label = accelerated
    ? `Pre-agg · ${lastUpdatedAt === null ? '?' : shortAge(lastUpdatedAt, now)}`
    : 'Live';
  return (
    <span
      className={accelerated ? 'tile-freshness is-ok' : 'tile-freshness'}
      data-testid="tile-freshness"
      data-served={accelerated ? 'pre-aggregation' : 'live'}
      title={title.filter((part) => part !== undefined).join(' · ')}
    >
      {accelerated ? <StatusIcon kind="ok" /> : <span className="tile-freshness__dot" aria-hidden="true" />}
      <span className="tile-freshness__label">{label}</span>
      {!valid || time === undefined ? null : (
        <span className="visually-hidden">
          {' · as of '}
          <time dateTime={when.toISOString()}>{time}</time>
        </span>
      )}
    </span>
  );
}
