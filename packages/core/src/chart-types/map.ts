/**
 * The Map (T973, AC-622, AC-305; design 23 sheet 6; direction.md rule 160):
 * one type in place of the Country map, on a Boundary set — Countries
 * (Natural Earth 1:50m admin-0, as the country map drew), Admin-1 by country,
 * or a custom set — with up to three layers:
 *
 * - **Regions:** the chart's dimension, a region key of the boundary set,
 *   coloured by its measure — the Metrics and Dimensions wells, as the
 *   country map took them, so its query is the one it always asked;
 * - **Points:** a geo dimension, sized by a measure;
 * - **Density:** a geo dimension.
 *
 * The Map's own settings are stored sparse under the chart's `options.map`:
 * absent, they read as Countries with no Points or Density layer, so a country
 * map saved before R81 opens as that Map, drawing as it did, with no
 * migration step.
 */
import type { ChartTypeModule } from './index';

/** The boundary sets every wechart has: Countries, then Admin-1 (by country). */
export const BOUNDARY_SETS = ['countries', 'admin1'] as const;

/** A built-in boundary set, or a custom one by its id (`custom:‹id›`, T979). */
export type BoundarySet = (typeof BOUNDARY_SETS)[number] | `custom:${string}`;

export interface PointsLayer {
  /** A geo dimension: each value one point at its latitude and longitude. */
  readonly location: string;
  /** The measure its points are sized by; unsized without one. */
  readonly size?: string;
}

export interface DensityLayer {
  /** A geo dimension: where its values gather. */
  readonly location: string;
}

export interface MapSettings {
  readonly boundarySet: BoundarySet;
  readonly points?: PointsLayer;
  readonly density?: DensityLayer;
}

export const DEFAULT_MAP: MapSettings = { boundarySet: 'countries' };

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const named = (value: unknown): value is string => typeof value === 'string' && value !== '';

const isBoundarySet = (value: unknown): value is BoundarySet =>
  (BOUNDARY_SETS as readonly unknown[]).includes(value) ||
  (typeof value === 'string' && /^custom:.+/.test(value));

function parse(stored: unknown): MapSettings {
  const given = record(stored);
  if (given === undefined) return DEFAULT_MAP;
  const points = record(given['points']);
  const density = record(given['density']);
  return {
    boundarySet: isBoundarySet(given['boundarySet']) ? given['boundarySet'] : 'countries',
    ...(points !== undefined && named(points['location'])
      ? {
          points: {
            location: points['location'],
            ...(named(points['size']) ? { size: points['size'] } : {}),
          },
        }
      : {}),
    ...(density !== undefined && named(density['location'])
      ? { density: { location: density['location'] } }
      : {}),
  };
}

/** Sparse: the defaults are stored as nothing, and nothing at all as `undefined`. */
function save(settings: MapSettings): Record<string, unknown> | undefined {
  const stored = {
    ...(settings.boundarySet === 'countries' ? {} : { boundarySet: settings.boundarySet }),
    ...(settings.points === undefined ? {} : { points: { ...settings.points } }),
    ...(settings.density === undefined ? {} : { density: { ...settings.density } }),
  };
  return Object.keys(stored).length === 0 ? undefined : stored;
}

export const mapModule: ChartTypeModule<MapSettings> = { type: 'map', parse, save };

/** The Map's settings from a chart's options. */
export function mapSettingsOf(options: Readonly<Record<string, unknown>> | undefined): MapSettings {
  return parse(options?.['map']);
}

export interface MapLayers {
  readonly regions?: { readonly key: string; readonly measure?: string };
  readonly points?: PointsLayer;
  readonly density?: DensityLayer;
}

/** The layers a Map draws: Regions from its wells, Points and Density from its settings. */
export function mapLayersOf(chart: {
  readonly wells: { readonly measures: readonly string[]; readonly dimensions: readonly string[] };
  readonly options?: Readonly<Record<string, unknown>> | undefined;
}): MapLayers {
  const [key] = chart.wells.dimensions;
  const [measure] = chart.wells.measures;
  const { points, density } = mapSettingsOf(chart.options);
  return {
    ...(key === undefined
      ? {}
      : { regions: { key, ...(measure === undefined ? {} : { measure }) } }),
    ...(points === undefined ? {} : { points }),
    ...(density === undefined ? {} : { density }),
  };
}
