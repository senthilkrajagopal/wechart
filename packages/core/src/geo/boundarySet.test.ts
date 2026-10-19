import { describe, expect, it } from 'vitest';

import { BOUNDARY_SET_MAX_BYTES, boundarySetProblem, boundarySetRegions } from './boundarySet';

/**
 * T979 / AC-628: … SHALL accept only GeoJSON whose features are polygons or
 * multipolygons, each holding the key property named at upload with a value
 * unique in the set, refusing anything else and naming the first feature
 * that fails.
 * `Fails when: … a file with a point feature, a feature without the key, or
 * two features of one key is accepted; a refusal doesn't name the failing
 * feature; …`
 */
const square = (id: unknown, at = 0) => ({
  type: 'Feature',
  properties: id === undefined ? {} : { territory_id: id, name: `T${String(at)}` },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [at, 0],
        [at + 1, 0],
        [at + 1, 1],
        [at, 1],
        [at, 0],
      ],
    ],
  },
});
const collection = (...features: unknown[]) => ({ type: 'FeatureCollection', features });

describe('a custom boundary set (AC-628)', () => {
  it('passes a FeatureCollection of polygons and multipolygons, each with a unique key', () => {
    const multi = {
      type: 'Feature',
      properties: { territory_id: 'Islands' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [square('x').geometry.coordinates, square('y', 5).geometry.coordinates],
      },
    };
    expect(
      boundarySetProblem(collection(square('Atlantic'), square('Gulf', 1), multi), 'territory_id'),
    ).toBeUndefined();
    expect(boundarySetRegions(collection(square('Atlantic'), square('Gulf', 1)), 'territory_id')).toEqual([
      'Atlantic',
      'Gulf',
    ]);
  });

  it('refuses a Point feature, naming it', () => {
    const point = {
      type: 'Feature',
      properties: { territory_id: 'Pier' },
      geometry: { type: 'Point', coordinates: [0, 0] },
    };
    expect(boundarySetProblem(collection(square('Atlantic'), point), 'territory_id')).toBe(
      'Feature 2 ("Pier") is a Point: every feature must be a Polygon or MultiPolygon.',
    );
  });

  it('refuses a feature without the key, naming it', () => {
    expect(boundarySetProblem(collection(square('Atlantic'), square(undefined, 1)), 'territory_id')).toBe(
      'Feature 2 has no "territory_id": every feature must hold the key property.',
    );
  });

  it('refuses two features of one key, naming the second', () => {
    expect(
      boundarySetProblem(collection(square('Atlantic'), square('Gulf', 1), square('Gulf', 2)), 'territory_id'),
    ).toBe('Feature 3 ("Gulf") has the same "territory_id" as feature 2: each key must be unique.');
  });

  // Checkpoint 5's review: a polygon is rings of positions, or it can't be drawn or marked.
  it('refuses a polygon whose coordinates aren’t rings of positions, naming it', () => {
    const shaped = (key: string, geometry: unknown) => ({
      type: 'Feature',
      properties: { territory_id: key },
      geometry,
    });
    for (const coordinates of [null, [], 'x', [[[0, 0], [1, 0], [0, 0]]], [[[0, 0], [1, 'a'], [1, 1], [0, 0]]]])
      expect(
        boundarySetProblem(
          collection(square('Atlantic', 0), shaped('Gulf', { type: 'Polygon', coordinates })),
          'territory_id',
        ),
        JSON.stringify(coordinates),
      ).toBe(
        'Feature 2 ("Gulf") has a Polygon that isn’t rings of at least 4 [longitude, latitude] positions.',
      );
    expect(
      boundarySetProblem(
        collection(shaped('Islands', { type: 'MultiPolygon', coordinates: [[]] })),
        'territory_id',
      ),
    ).toBe(
      'Feature 1 ("Islands") has a MultiPolygon that isn’t rings of at least 4 [longitude, latitude] positions.',
    );
  });

  it('refuses what isn’t a FeatureCollection, or holds no features, or is too large', () => {
    expect(boundarySetProblem({ type: 'Feature' }, 'territory_id')).toBe(
      'This is not a GeoJSON FeatureCollection.',
    );
    expect(boundarySetProblem(collection(), 'territory_id')).toBe('The file holds no features.');
    expect(boundarySetProblem(collection(square('A')), '')).toBe('Name the key property.');
    expect(BOUNDARY_SET_MAX_BYTES).toBe(5_000_000);
  });
});
