import type { ChartType, MemberFormats, WellName as SpecWell } from '@wechart/core';
import type { WellName } from '@wechart/recommender';
import type { ComponentType } from 'react';

import type { Member } from '../fields';
import { MapWells } from './map';
import { ParallelWells } from './parallel';

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
  /** The chart's options, where a type keeps its own settings (T973: the Map's `map`). */
  readonly options?: Readonly<Record<string, unknown>> | undefined;
  /** A change to them: each key set, or cleared where `undefined`. */
  readonly onOptions?: ((patch: Readonly<Record<string, unknown>>) => void) | undefined;
  /** The fields the chart's cube offers, as the field list lists them. */
  readonly available?: readonly Member[] | undefined;
  /** A member as the editor names it. */
  readonly titleOf?: ((member: string) => string) | undefined;
  /** The chart's own Metrics and Dimensions. */
  readonly spec?:
    { readonly measures: readonly string[]; readonly dimensions: readonly string[] } | undefined;
  /** Each member's format, as the model gives it (T981: Shared needs one format). */
  readonly formats?: MemberFormats | undefined;
  /** Add a field to one of the editor's wells (T981: parallel coordinates' + Measure). */
  readonly onAdd?: ((well: SpecWell, member: string) => void) | undefined;
}

/** Each type with wells of its own, by its type. One line per type. */
export const TYPE_WELLS: Partial<Record<ChartType, ComponentType<TypeWellsProps>>> = {
  map: MapWells,
  parallel: ParallelWells,
};
