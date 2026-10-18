import type { ChartType } from '@wechart/core';
import type { WellName } from '@wechart/recommender';
import type { ComponentType } from 'react';

/**
 * R81's wells, one module per type (T934; docs/tasks.md §P2.27): a KPI's
 * Compare to and Target, a histogram's Bins, a timeline's Start and End …
 * live in `editor/wells/‹type›.tsx`, and `Wells` draws a type's own after
 * Metrics, Dimensions and Time (direction.md §7i, "New wells"), routed from
 * this registry, so that no type's wells are written into `Wells.tsx`.
 *
 * What a type's wells need beyond these comes in through `TypeWellsProps`,
 * which the editor fills and `Wells` hands on whole.
 */
export interface TypeWellsProps {
  readonly chartType: ChartType;
  /** The well the editor asks to be highlighted (AC-217), where it is one of this type's. */
  readonly highlight?: WellName | undefined;
}

/** Each type with wells of its own, by its type. One line per type. */
export const TYPE_WELLS: Partial<Record<ChartType, ComponentType<TypeWellsProps>>> = {};
