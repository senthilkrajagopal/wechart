import { createContext, useContext } from 'react';

/**
 * The item a query serves (T340, AC-268): every query to Cube names it, and
 * the API checks, before Cube is asked, that the user may open it and that
 * the query names only cubes it is bound to. A dashboard's tiles, filters,
 * tokens and drills name the dashboard; the chart editor and a chart's page,
 * the chart; a proposal's review view, the proposal.
 */
export interface QueryItem {
  readonly kind: 'dashboard' | 'chart' | 'proposal';
  readonly id: string;
}

/** The item the queries beneath serve, set by the dashboard, the chart editor and the review view. */
export const QueryItemContext = createContext<QueryItem | undefined>(undefined);

export const useQueryItem = (): QueryItem | undefined => useContext(QueryItemContext);

/** A query body's item, `for`, where there is one. */
export const forItem = (item: QueryItem | undefined): { for?: QueryItem } =>
  item === undefined ? {} : { for: item };
