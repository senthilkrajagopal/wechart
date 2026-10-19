import { defaultMarkings, type Marking } from './markings/model';

/**
 * The parts of a dashboard document that both the service and the browser have
 * to agree on, and the body a newly created dashboard starts with (AC-072,
 * direction.md rules 13, 32 and 57).
 *
 * It lives here rather than in the web package because a dashboard is created
 * by the API, and read back by the browser. A creation-time default and a
 * read-time default written separately would be equal today and diverge on the
 * day someone changed one of them — the dashboard stored as one thing and read
 * as another. The layout of the rest of the document stays in the web package,
 * which is the only thing that lays tiles out.
 */
export const INTERACTION_MODES = ['markings', 'crossFilter'] as const;

export type InteractionMode = (typeof INTERACTION_MODES)[number];

/** What a click on one tile does to another (direction.md rule 32). */
export type PairAction = 'filter' | 'highlight' | 'none';

export interface CrossFilterConfig {
  /**
   * direction.md rule 32: "the default action for tile pairs (Filter,
   * Highlight or None)", which "starts at Filter".
   */
  readonly defaultAction: PairAction;
  /**
   * The source → target matrix that overrides the default per pair (AC-117),
   * keyed `source>target` as the prototype's settings page writes it.
   *
   * Sparse: a pair absent here is at the default, so changing the default
   * moves every pair nobody has set. Power BI stores the same thing as a list
   * of `{source, target, type}` entries, with unset pairs left out
   * (`docs/research/cross-highlight.md` §3).
   */
  readonly pairs?: Readonly<Record<string, PairAction>>;
}

/**
 * Which mode is in effect, and the configuration of the one that is not.
 *
 * Marking definitions are deliberately absent: they sit at the top of the
 * document beside `pages`, because AC-065 names "dashboard settings **and**
 * marking definitions" as peers and rule 54 says a saved dashboard stores the
 * definitions. Keeping them out is also what makes AC-070's promise about them
 * structural — a mode switch cannot discard what it cannot reach.
 */
export interface Interactions {
  readonly mode: InteractionMode;
  readonly crossFilter: CrossFilterConfig;
}

/** direction.md rule 57: a dashboard starts in Markings mode. */
export const DEFAULT_INTERACTIONS: Interactions = {
  mode: 'markings',
  crossFilter: { defaultAction: 'filter' },
};

export interface NewDashboard {
  readonly title: string;
  readonly folderId: string;
  readonly owner: string;
}

/**
 * A new dashboard has no parameters (F46, `dashboard-parameters.ts`): they
 * sit at the top of the document beside `filters` and `markings`, as
 * `parameters`, and are absent until the author makes one — absent and empty
 * read alike, so nothing stored before F46 needs a migration.
 */
export interface NewDashboardBody extends NewDashboard {
  readonly schemaVersion: number;
  readonly pages: readonly never[];
  readonly settings: { readonly width: 'fixed' | 'full'; readonly interactions: Interactions };
  readonly markings: readonly Marking[];
}

/**
 * The body a dashboard is created with.
 *
 * Written in full rather than left to be defaulted on read, because AC-072 is
 * about creation: a dashboard that merely *reads* as Markings would satisfy
 * nothing, since every dashboard reads that way whether or not anything was
 * stored.
 */
export function newDashboardBody({ title, folderId, owner }: NewDashboard): NewDashboardBody {
  return {
    schemaVersion: 1,
    title,
    folderId,
    owner,
    pages: [],
    settings: { width: 'fixed', interactions: DEFAULT_INTERACTIONS },
    // From the markings model, which owns "at least one, exactly one default"
    // (AC-084). A literal here would be a second statement of rule 57.
    markings: defaultMarkings(),
  };
}
