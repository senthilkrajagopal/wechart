import { useEffect, useState } from 'react';

/**
 * Preview as groups' links (T438, AC-166, AC-232): a dashboard opened as a
 * context would see it, the dashboards found to open, and a model file
 * opened in Model. Phase 1's JSON context pane, which used them first, is
 * gone (security-Q1; T699, T698).
 */

/** A dashboard, opened as the context would see it (the route's `preview`). */
export function previewHref(dashboardId: string, context: Readonly<Record<string, unknown>>) {
  return `/explore/dashboards/${encodeURIComponent(dashboardId)}?preview=${encodeURIComponent(
    JSON.stringify(context),
  )}`;
}

interface Found {
  readonly kind: string;
  readonly id: string;
  readonly title: string;
}

/** How many dashboards the preview offers at once (AC-232): a bounded list. */
export const DASHBOARD_LIMIT = 8;

/**
 * The dashboards whose titles hold what was typed, from the catalog's search
 * of dashboards alone — one more than are shown, so whether more match is
 * known rather than guessed — and whether the search has been answered, or
 * failed.
 */
export function useDashboards(text: string): {
  readonly items: readonly Found[];
  readonly answered: boolean;
  readonly failed?: string;
} {
  const needle = text.trim();
  // Kept with the text they answer, so an answer to older text never shows.
  const [found, setFound] = useState<{
    needle: string;
    items: readonly Found[];
    failed?: string;
  }>({ needle: '', items: [] });
  useEffect(() => {
    if (needle === '') return undefined;
    const aborted = new AbortController();
    const timer = setTimeout(() => {
      const url = `/api/search?q=${encodeURIComponent(needle)}&kind=dashboard&limit=${String(DASHBOARD_LIMIT + 1)}`;
      void fetch(url, { signal: aborted.signal })
        .then(async (response) => {
          if (!response.ok) {
            setFound({ needle, items: [], failed: `HTTP ${String(response.status)}` });
            return;
          }
          const items = (await response.json()) as Found[];
          setFound({ needle, items: items.filter((item) => item.kind === 'dashboard') });
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      clearTimeout(timer);
      aborted.abort();
    };
  }, [needle]);
  const answered = found.needle === needle && needle !== '';
  return {
    items: answered ? found.items : [],
    answered,
    ...(answered && found.failed !== undefined ? { failed: found.failed } : {}),
  };
}

/** A model file, opened in the Model workspace (AC-232). */
export function modelHref(path: string): string {
  return `/model/files/${encodeURIComponent(path)}`;
}
