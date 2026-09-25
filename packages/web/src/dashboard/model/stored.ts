import { withoutDrafts } from '../edit/chartDrafts';
import { DEFAULT_SETTINGS, type DashboardDocument } from './document';

/**
 * A dashboard as the API stores it, and the document it is read as. Here
 * rather than in `DashboardPage` so what else reads a stored dashboard — Copy
 * › To dashboard (T271) writes into one — reads it the same way, without
 * importing the page.
 */
export interface StoredDocument {
  readonly id: string;
  readonly body: Record<string, unknown>;
  readonly version?: number;
}

/**
 * A stored body is *checked*, not cast.
 *
 * A chart body has gone through strict `readChartDocument` since T023 while a
 * dashboard body was taken on trust — so a `pages` that was an object rather
 * than an array threw inside render, with no error boundary, and the whole
 * app went blank. A dashboard that cannot be read should fail like a chart
 * that cannot: as one surface reporting a problem.
 */
export class DashboardDocumentError extends Error {
  constructor(what: string) {
    super(`This dashboard cannot be opened: ${what}.`);
    this.name = 'DashboardDocumentError';
  }
}

/**
 * A stored body becomes a dashboard document. A dashboard saved before there
 * were pages — every seeded one but the first — opens as an empty dashboard
 * rather than as an error, because "no tiles yet" is what it is.
 */
export function dashboardOf(stored: StoredDocument): DashboardDocument {
  const body = stored.body as Partial<DashboardDocument>;

  // A dashboard saved before there were pages — every seeded one but the
  // first — opens as an empty dashboard rather than an error, because "no
  // tiles yet" is what it is. A `pages` that is present and *wrong* is not.
  if (body.pages !== undefined && !Array.isArray(body.pages)) {
    throw new DashboardDocumentError('its pages are not a list');
  }
  for (const page of body.pages ?? []) {
    if (!Array.isArray(page.items)) {
      throw new DashboardDocumentError(`page “${page.title ?? page.id}” has no list of items`);
    }
  }

  /**
   * Spread first, defaults over the top. The four named fields are the ones
   * this build reads; everything else a stored dashboard carries has to come
   * through untouched, because a save sends back the document it was given
   * (AC-065) and the server replaces the body wholesale.
   *
   * Rebuilt as four fields, this dropped `folderId` on every save — and
   * `folder_id` is a column derived from it, so the dashboard left its folder
   * without anyone moving it (AC-017, AC-020). `owner` went the same way, and
   * markings would have at F10. `save.test.ts` could not see it: it builds the
   * document it sends, so the loss happened one step upstream of it.
   */
  /**
   * Never with chart drafts. They belong to one edit session and are never
   * saved (T032), so a stored body carrying them was written by something
   * else — and read as they are, they would draw tiles from specs no query
   * produced, and survive a Discard as part of the state the session opens
   * with.
   */
  return withoutDrafts({
    ...body,
    schemaVersion: body.schemaVersion ?? 1,
    title: typeof body.title === 'string' ? body.title : 'Dashboard',
    // At least one page: with none, there is nowhere for anything added to
    // go — a new dashboard (created with `pages: []`) took no tile at all.
    pages: body.pages !== undefined && body.pages.length > 0 ? body.pages : [FIRST_PAGE],
    settings: body.settings ?? DEFAULT_SETTINGS,
  });
}

/** The page a dashboard with none opens with, empty; saved with it once anything is added. */
const FIRST_PAGE = { id: 'page-1', title: 'Page 1', items: [] } as const;
