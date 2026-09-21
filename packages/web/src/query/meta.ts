/**
 * The Cube model's metadata, fetched through the wechart API (AC-007).
 *
 * One definition for every caller — the chart editor lists fields from it, a
 * dashboard takes number formats from it (AC-046) — so they share one cache
 * entry. Two query functions registered under the same key would work until
 * they diverged, and then whichever ran first would decide what the other saw.
 */
export const META_QUERY = {
  queryKey: ['meta'] as const,
  queryFn: async (): Promise<unknown> => {
    const response = await fetch('/api/meta');
    if (!response.ok) throw new Error(`Could not load the model: ${String(response.status)}`);
    return (await response.json()) as unknown;
  },
};
