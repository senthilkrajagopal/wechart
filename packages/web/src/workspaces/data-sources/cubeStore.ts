import type { CatalogItem } from '../explore/FolderContents';

/**
 * Cube Store's SQL runner, as `GET /api/cube-store` tells this user of it
 * (T536, AC-384, AC-374; design 15's state H, P5, Q7 and Q9). The API
 * answers it only to Super-Admins, and, once it is on, to those allowed on a
 * data source in a folder a Super-Admin switched on; to anyone else it is
 * not there (`404`), and nothing lists it.
 */

/** Its id among the data sources' pages: `/explore/data-sources/cubestore`. */
export const CUBE_STORE_ID = 'cubestore';

export interface CubeStoreState {
  readonly on: boolean;
  readonly confirmedBy?: { readonly name: string };
  readonly confirmedAt?: string;
  /** Whether this user may run SQL on it now. */
  readonly runs: boolean;
}

export const CUBE_STORE_QUERY = {
  queryKey: ['cube-store'],
  queryFn: async (): Promise<CubeStoreState | null> => {
    const response = await fetch('/api/cube-store');
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error(`Cube Store’s SQL runner could not be read (${String(response.status)}).`);
    return (await response.json()) as CubeStoreState;
  },
};

/** Listed among the root's data sources: once on, to whoever may run SQL on it (AC-384). */
export const cubeStoreListed = (state: CubeStoreState | null | undefined): boolean =>
  state?.on === true && state.runs;

/**
 * Its row among the root's contents in Explore (design 15's H1): a data
 * source, at the root, last changed when it was turned on.
 */
export const cubeStoreItem = (state: CubeStoreState): CatalogItem => ({
  kind: 'data-source',
  id: CUBE_STORE_ID,
  title: 'Cube Store',
  owner: null,
  updatedAt: state.confirmedAt ?? new Date().toISOString(),
  folderId: 'root',
  driver: CUBE_STORE_ID,
});
