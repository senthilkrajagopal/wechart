/**
 * "Open in SQL runner" (T823, AC-464; design 17's N): from a data source's
 * page, its head's ⋯, and each row's ⋯ in Data sources and in Explore, a
 * new workspace tab on that data source. The workspace reads `?source=` once
 * as it opens (`SqlSurface.tsx`).
 */
export const OPEN_IN_SQL_RUNNER = 'Open in SQL runner';

export const openInSqlRunner = (id: string): string => `/sql?source=${encodeURIComponent(id)}`;
