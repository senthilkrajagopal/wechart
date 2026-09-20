/**
 * @wechart/core — chart spec, marking model, filter model and the canonical
 * Cube query builder. No DOM, no React.
 */
export const PACKAGE_NAME = '@wechart/core';

export {
  addToWell,
  emptySpec,
  isEmpty,
  removeFromWell,
  toCubeQuery,
  wellFor,
  type ChartSpec,
  type WellName,
} from './chart-spec';
