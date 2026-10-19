import { clockTimeOf } from '../../../dashboard/dataAsOf';
import { accelerationOf } from '../../../tiles/AccelerationBadge';
import { ElementSkeleton, ElementUnavailable } from '../ElementState';
import { useElementAnswer } from './useElementAnswer';

/**
 * An As of as read (T886, AC-522; design 21 pin 10, state C6; rule 19): the
 * data's age — "as of 14:05", the day beside it when not today, as Data as
 * of says it — its tooltip saying whether a pre-aggregation answered.
 */
export function AsOfText({
  at,
  now = new Date(),
  preAggregation,
}: {
  readonly at: Date | undefined;
  readonly now?: Date;
  /** The pre-aggregation that answered, or undefined for the database. */
  readonly preAggregation?: string | undefined;
}) {
  if (at === undefined || Number.isNaN(at.getTime())) return <span className="text-value">—</span>;
  return (
    <span
      className="text-value text-as-of"
      title={
        preAggregation === undefined
          ? 'Answered by the database, not a pre-aggregation'
          : `Answered by the pre-aggregation ${preAggregation}`
      }
    >
      {`as of ${clockTimeOf(at, now)}`}
    </span>
  );
}

/** An As of asked of Cube: its measure's answer, by when it was refreshed and what answered. */
export function AsOfElement({
  query,
  context,
}: {
  readonly query: Readonly<Record<string, unknown>>;
  readonly context?: Readonly<Record<string, unknown>> | undefined;
}) {
  const answer = useElementAnswer(query, context);
  // Its states (T889, AC-525): "as of 14:05" is about 11 characters.
  if (answer.pending) return <ElementSkeleton width={11} />;
  if (answer.error !== undefined) return <ElementUnavailable error={answer.error} />;
  const refreshed = (answer.result as { lastRefreshTime?: unknown } | undefined)?.lastRefreshTime;
  const acceleration = accelerationOf(answer.result);
  return (
    <AsOfText
      at={typeof refreshed === 'string' ? new Date(refreshed) : undefined}
      preAggregation={
        acceleration.accelerated ? (acceleration.preAggregation ?? undefined) : undefined
      }
    />
  );
}
