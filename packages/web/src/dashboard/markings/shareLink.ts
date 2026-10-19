import { valuesFromSearch, valuesToSearch } from '../../filters/url';
import { viewStateFrom, type ViewState } from '../bookmarks/viewState';

/**
 * Copy link with marks (T129, AC-123; direction.md rule 54: "Current marks
 * are carried only by a link … or a bookmark"): the dashboard's own URL,
 * carrying what the reader has made of it.
 *
 * Its filters' values go in `filters`, as AC-081 writes them. Everything else
 * — the page tab, the marks, the filters "Filter to marked" made, the tile
 * each marking was marked from — goes in `view`, which a dashboard opened
 * from the link takes and then drops from its URL. The router writes and
 * reads each parameter as JSON (research/router-search-history.md, Q1).
 * Nothing of the author's own session goes: no chart open in the editor, no
 * edit mode, no security context's preview.
 */
export function linkWithMarks(href: string, view: ViewState): string {
  const url = new URL(href);
  for (const key of ['edit', 'editing', 'preview', 'filters', 'view']) url.searchParams.delete(key);
  const filters = valuesToSearch(view.filters);
  if (filters !== undefined) url.searchParams.set('filters', JSON.stringify(filters));
  const { page, marks, markFilters, from, parameters } = view;
  // Each dashboard parameter's value too (T900, AC-123), where it has any.
  url.searchParams.set(
    'view',
    JSON.stringify({
      page,
      marks,
      markFilters,
      from,
      ...(parameters === undefined ? {} : { parameters }),
    }),
  );
  return url.toString();
}

/**
 * What a link with marks carries, read back from its parameters as the router
 * parsed them — each part checked as a bookmark's is (`viewStateFrom`), and
 * its filters as the URL's always are — or nothing, without its `view`.
 */
export function viewFromLink(search: { filters?: unknown; view?: unknown }): ViewState | undefined {
  if (search.view === undefined) return undefined;
  const view = viewStateFrom(search.view);
  return view === undefined ? undefined : { ...view, filters: valuesFromSearch(search.filters) };
}
