/**
 * The saved shape of a chart — what actually lands in the database.
 *
 * Three decisions, each taken from what the reference BI tools do and what it
 * cost them (docs/research/{superset,metabase,grafana}-*.md):
 *
 * 1. **Only the authoring shape is stored.** Superset, Metabase and Grafana
 *    all persist queries plus configuration and compute the drawable shape at
 *    load time; none stores a render shape. Rows especially are never saved.
 * 2. **No cached derived query.** Superset caches one and it is the source of
 *    its worst documented maintenance problem — the derivation lived only in
 *    the frontend, so keeping the cache correct forced fifty TypeScript
 *    functions to be re-implemented in Python. `toCubeQuery` stays a pure
 *    function of the spec, computed on demand.
 * 3. **Roles are named here, not recovered later.** Superset's flat
 *    `{control: value}` map costs it an alias table plus three hand-maintained
 *    key lists purely so that switching chart type keeps the user's fields.
 *
 * The catalog fields stay at the top level because the `documents` table
 * generates its `title`, `folder_id` and `owner` columns out of them.
 */

import { emptySpec, type ChartSpec } from './chart-spec';
import type { ChartType } from './render-spec';

/**
 * The version of this shape. Raised only when the stored shape changes in a
 * way an older reader would get wrong; `chart-migrations.ts` carries one
 * upgrade step per raise.
 */
export const CHART_DOCUMENT_VERSION = 1;

/**
 * The visual channels a chart can bind a member to.
 *
 * The vocabulary lives with the saved document rather than with the renderer,
 * because it is what a stored chart is written in — the same reason the chart
 * type does. Taken from the channel model in docs/research/vega-lite.md, cut
 * down to the channels wechart's own chart types need.
 */
export type Channel = 'x' | 'y' | 'color' | 'size' | 'facet' | 'row' | 'column';

export const CHANNELS: readonly Channel[] = ['x', 'y', 'color', 'size', 'facet', 'row', 'column'];

/**
 * Which member the user pinned to which channel.
 *
 * Sparse on purpose: an absent channel means "work it out from the wells and
 * the chart type", and a present one means the user said otherwise. Writing
 * the computed defaults back would turn every recommendation into a pin, which
 * is the distinction AC-032 rests on.
 *
 * The value is a member name, not a reference. Metabase reached the same place
 * only after abandoning reference-keyed settings over an issue that stayed
 * open from 2019 to 2025, and both of its keying schemes still coexist in
 * stored data. Cube member names are already stable, so there is nothing to
 * gain by indirecting.
 */
export type EncodingOverrides = Partial<Record<Channel, string>>;

export interface ChartDefinition {
  readonly source: { readonly cube: string };
  readonly wells: {
    readonly measures: readonly string[];
    readonly dimensions: readonly string[];
    readonly timeDimensions: readonly string[];
  };
  /** Absent means the recommender's pick is followed. */
  readonly chartType?: ChartType;
  readonly encoding?: EncodingOverrides;
  /**
   * Everything else the user changed about how the chart is drawn, as a sparse
   * override layer over computed defaults.
   *
   * Deliberately not a union of per-chart-type option types. Grafana's
   * dashboard schema leaves the equivalent field untyped for the same reason,
   * and Metabase keeps one flat namespaced map; in both, an option belonging
   * to a chart type that is not currently selected is inert rather than
   * invalid, which is what lets a user switch type and switch back.
   */
  readonly options?: Record<string, unknown>;
}

export interface ChartDocument {
  readonly schemaVersion: number;
  readonly title: string;
  readonly owner?: string;
  readonly folderId?: string;
  readonly localToDashboardId?: string;
  readonly chart: ChartDefinition;
}

export class ChartDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChartDocumentError';
  }
}

function memberList(value: unknown, well: string): string[] {
  if (!Array.isArray(value)) {
    throw new ChartDocumentError(`The chart's ${well} well is not a list of members.`);
  }
  for (const member of value) {
    if (typeof member !== 'string') {
      throw new ChartDocumentError(
        `The chart's ${well} well holds ${typeof member} where a member name was expected.`,
      );
    }
  }
  return [...(value as string[])];
}

/**
 * Read a stored body, or refuse it.
 *
 * Strict by choice. Metabase's reader recovers to an empty query on any error,
 * which is how instances ended up with cards that exist but have no query —
 * a condition a later schema upgrade was written to repair, and failed to. A
 * chart that cannot be read is worth an error; a chart that reads as something
 * else is not.
 *
 * Older versions are not handled here: `migrateChartDocument` upgrades them
 * first (AC-181).
 */
export function readChartDocument(body: unknown): ChartDocument {
  if (typeof body !== 'object' || body === null) {
    throw new ChartDocumentError('The stored chart is not an object.');
  }

  const raw = body as Record<string, unknown>;
  const version = raw['schemaVersion'];

  if (typeof version !== 'number') {
    throw new ChartDocumentError(
      'The stored chart carries no schemaVersion, so its format cannot be established.',
    );
  }
  if (version > CHART_DOCUMENT_VERSION) {
    throw new ChartDocumentError(
      `The stored chart is version ${String(version)}, but this wechart understands only up to ${String(
        CHART_DOCUMENT_VERSION,
      )}. It was saved by a newer version.`,
    );
  }
  if (version < CHART_DOCUMENT_VERSION) {
    throw new ChartDocumentError(
      `The stored chart is version ${String(version)} and has not been upgraded to ${String(
        CHART_DOCUMENT_VERSION,
      )}.`,
    );
  }

  const chart = raw['chart'];
  if (typeof chart !== 'object' || chart === null) {
    throw new ChartDocumentError('The stored chart has no chart definition.');
  }
  const definition = chart as Record<string, unknown>;

  const source = definition['source'];
  const cube =
    typeof source === 'object' && source !== null
      ? (source as Record<string, unknown>)['cube']
      : undefined;
  if (typeof cube !== 'string' || cube === '') {
    throw new ChartDocumentError('The stored chart names no cube.');
  }

  const wells = (definition['wells'] ?? {}) as Record<string, unknown>;
  const title = raw['title'];

  return {
    schemaVersion: CHART_DOCUMENT_VERSION,
    title: typeof title === 'string' ? title : '',
    ...(typeof raw['owner'] === 'string' ? { owner: raw['owner'] } : {}),
    ...(typeof raw['folderId'] === 'string' ? { folderId: raw['folderId'] } : {}),
    ...(typeof raw['localToDashboardId'] === 'string'
      ? { localToDashboardId: raw['localToDashboardId'] }
      : {}),
    chart: {
      source: { cube },
      wells: {
        measures: memberList(wells['measures'] ?? [], 'measures'),
        dimensions: memberList(wells['dimensions'] ?? [], 'dimensions'),
        timeDimensions: memberList(wells['timeDimensions'] ?? [], 'timeDimensions'),
      },
      ...(typeof definition['chartType'] === 'string'
        ? { chartType: definition['chartType'] as ChartType }
        : {}),
      ...(definition['encoding'] === undefined
        ? {}
        : { encoding: definition['encoding'] as EncodingOverrides }),
      ...(definition['options'] === undefined
        ? {}
        : { options: definition['options'] as Record<string, unknown> }),
    },
  };
}

/** The document for a chart the user is authoring. */
export function chartDocumentOf(input: {
  readonly title: string;
  readonly spec: ChartSpec;
  readonly owner?: string;
  readonly folderId?: string;
  readonly localToDashboardId?: string;
  readonly encoding?: EncodingOverrides;
  readonly options?: Record<string, unknown>;
}): ChartDocument {
  const { spec } = input;

  return {
    schemaVersion: CHART_DOCUMENT_VERSION,
    title: input.title,
    ...(input.owner === undefined ? {} : { owner: input.owner }),
    ...(input.folderId === undefined ? {} : { folderId: input.folderId }),
    ...(input.localToDashboardId === undefined
      ? {}
      : { localToDashboardId: input.localToDashboardId }),
    chart: {
      source: { cube: spec.cube },
      wells: {
        measures: [...spec.measures],
        dimensions: [...spec.dimensions],
        timeDimensions: [...spec.timeDimensions],
      },
      ...(spec.chartType === undefined ? {} : { chartType: spec.chartType }),
      ...(input.encoding === undefined ? {} : { encoding: input.encoding }),
      ...(input.options === undefined ? {} : { options: input.options }),
    },
  };
}

/** The authoring shape the editor and the query builder work in. */
export function toChartSpec(document: ChartDocument): ChartSpec {
  const { chart } = document;

  return {
    ...emptySpec(chart.source.cube),
    measures: [...chart.wells.measures],
    dimensions: [...chart.wells.dimensions],
    timeDimensions: [...chart.wells.timeDimensions],
    ...(chart.chartType === undefined ? {} : { chartType: chart.chartType }),
  };
}
