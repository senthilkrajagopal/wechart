import type { ReactNode } from 'react';

import { accelerationOf } from '../../AccelerationBadge';
import { describeElement, ElementTooltip, type ElementFacts } from '../ElementTooltip';
import { useElementAnswer } from './useElementAnswer';

/**
 * A value with its tooltip (T888, AC-524), the data's age read from the
 * same answer the value drew — asked once, keyed by its query — with
 * whether a pre-aggregation answered (rule 19), and "No data for these
 * filters" where it answered nothing (T889, AC-525). While it loads or once
 * it failed, the value is drawn as its state, which says its own (AC-525).
 */
export function AnsweredTooltip({
  query,
  context,
  facts,
  member,
  children,
}: {
  readonly query: Readonly<Record<string, unknown>> | undefined;
  readonly context?: Readonly<Record<string, unknown>> | undefined;
  readonly facts: Omit<ElementFacts, 'data' | 'noData'>;
  /** The member whose value it reads, to tell no data from a value. */
  readonly member?: string | undefined;
  readonly children: ReactNode;
}) {
  const answer = useElementAnswer(query, context);
  if (answer.pending || answer.error !== undefined) return <>{children}</>;
  const refreshed = (answer.result as { lastRefreshTime?: unknown } | undefined)?.lastRefreshTime;
  const acceleration = accelerationOf(answer.result);
  const noData =
    query !== undefined &&
    member !== undefined &&
    answer.rows.every((row) => row[member] === null || row[member] === undefined);
  const lines = describeElement({
    ...facts,
    noData,
    data: {
      at: typeof refreshed === 'string' ? new Date(refreshed) : undefined,
      preAggregation: acceleration.accelerated
        ? (acceleration.preAggregation ?? 'a pre-aggregation')
        : undefined,
    },
  });
  return <ElementTooltip lines={lines}>{children}</ElementTooltip>;
}
