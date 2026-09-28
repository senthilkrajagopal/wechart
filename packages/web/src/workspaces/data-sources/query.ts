import type { ListedSource } from './DataSourcesList';

/**
 * Every data source the user can see, as `GET /api/data-sources` lists them:
 * Data sources' list, and the health Generate cubes shows beside each (T490),
 * from one cache.
 */
export const DATA_SOURCES_QUERY = {
  queryKey: ['data-sources'],
  queryFn: async (): Promise<ListedSource[]> => {
    const response = await fetch('/api/data-sources');
    if (!response.ok)
      throw new Error(`The data sources could not be read (${String(response.status)}).`);
    return (await response.json()) as ListedSource[];
  },
};
