import type { ReactNode } from 'react';

import { accelerationOf } from '../../AccelerationBadge';
import { describeElement, ElementTooltip, type ElementFacts } from '../ElementTooltip';
import { useElementAnswer } from './useElementAnswer';

/**
 * A value with its tooltip (T888, AC-524), the data's age read from the
 * same answer the value drew — asked once, keyed by its query — with
 * whether a pre-aggregation answered (rule 19).
 */
export function AnsweredTooltip({
  query,
  context,
  facts,
  children,
}: {
  readonly query: Readonly<Record<string, unknown>> | undefined;
  readonly context?: Readonly<Record<string, unknown>> | undefined;
  readonly facts: Omit<ElementFacts, 'data'>;
  readonly children: ReactNode;
}) {
  const answer = useElementAnswer(query, context);
  const refreshed = (answer.result as { lastRefreshTime?: unknown } | undefined)?.lastRefreshTime;
  const acceleration = accelerationOf(answer.result);
  const lines = describeElement({
    ...facts,
    data: {
      at: typeof refreshed === 'string' ? new Date(refreshed) : undefined,
      preAggregation: acceleration.accelerated
        ? (acceleration.preAggregation ?? 'a pre-aggregation')
        : undefined,
    },
  });
  return <ElementTooltip lines={lines}>{children}</ElementTooltip>;
}
