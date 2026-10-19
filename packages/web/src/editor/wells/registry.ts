import type { ChartType, MemberFormats, WellName as SpecWell } from '@wechart/core';
import type { WellName } from '@wechart/recommender';
import type { ComponentType } from 'react';

import type { Member } from '../fields';
import { BulletWells } from './bullet';
import { GraphicalTableWells } from './graphicalTable';
import { KpiWells } from './kpi';
import { MapWells } from './map';
import { ParallelWells } from './parallel';
import { SankeyWells } from './sankey';

/**
 * R81's wells, one module per type (T934; docs/tasks.md §P2.27): a KPI's
 * Compare to and Target, a histogram's Bins, a timeline's Start and End …
 * live in `editor/wells/‹type›.tsx`, and `Wells` draws a type's own after
 * Metrics, as design 23's sheets order them (direction.md §7i, "New wells"),
 * routed from this registry, so that no type's wells are written into
 * `Wells.tsx`.
 *
 * What a type's wells need comes in through `TypeWellsProps`, which the
 * editor fills and `Wells` hands on whole.
 */
export interface TypeWellsProps {
  readonly chartType: ChartType;
  /** The well the editor asks to be highlighted (AC-217), where it is one of this type's. */
  readonly highlight?: WellName | undefined;
  /** The fields the chart's cube or view offers. */
  readonly available: readonly Member[];
  /** The chart's options, where a type keeps its own settings (a KPI's under `kpi`, the Map's under `map`). */
  readonly options: Readonly<Record<string, unknown>>;
  /** Set or clear option keys, as one undoable change; `undefined` clears a key. */
  readonly onOptions: (patch: Readonly<Record<string, unknown>>) => void;
  /** A member by its title from the model (AC-220). */
  readonly titleOf: (member: string) => string;
  /** The chart's own Metrics and Dimensions. */
  readonly spec?:
    { readonly measures: readonly string[]; readonly dimensions: readonly string[] } | undefined;
  /** Each member's format, as the model gives it (T981: Shared needs one format). */
  readonly formats?: MemberFormats | undefined;
  /** Add a field to one of the editor's wells (T981: parallel coordinates' + Measure). */
  readonly onAdd?: ((well: SpecWell, member: string) => void) | undefined;
  /** The Map's custom boundary sets the chart's folder path offers (T979). */
  readonly customSets?: readonly { readonly id: string; readonly name: string }[] | undefined;
  /** Where a Map's Upload a boundary set… goes: the chart's folder (T979). */
  readonly folderId?: string | undefined;
}

/** Each type with wells of its own, by its type. One line per type. */
export const TYPE_WELLS: Partial<Record<ChartType, ComponentType<TypeWellsProps>>> = {
  kpi: KpiWells,
  map: MapWells,
  parallel: ParallelWells,
  graphicalTable: GraphicalTableWells,
  sankey: SankeyWells,
  bullet: BulletWells,
};
