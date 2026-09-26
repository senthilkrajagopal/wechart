import { AccountMenu } from './AccountMenu';
import { openSearch, SearchPalette } from './SearchPalette';
import { ThemeToggle } from './ThemeToggle';
import { WorkspaceSwitcher, type WorkspaceId } from './WorkspaceSwitcher';

/**
 * The top bar and the surface beneath it (AC-001, direction.md §2).
 *
 * The bar is a banner landmark and the workspace content a main landmark, so
 * the keyboard and screen-reader paths through the app are structural rather
 * than added later (AC-176).
 */
export interface AppShellProps {
  /** The workspace the page belongs to; none for a page that is in none. */
  readonly workspace?: WorkspaceId;
  readonly children?: React.ReactNode;
}

/** The shortcut as this platform writes it. */
const shortcut = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';

/**
 * The top bar's search field (AC-190), the prototype's `.search`: it looks
 * like a field and names the shortcut, so search is visible to someone who
 * does not know ⌘K — and it is a button, because what it does is open the
 * palette, where the typing happens.
 */
function SearchTrigger() {
  return (
    <button
      type="button"
      className="app-search"
      onClick={(event) => {
        openSearch(event.currentTarget);
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      {/* Words that fit the prototype's 260 px (N6): its "Search fields,
          charts, models" leaves out dashboards, and naming all four does not
          fit. The palette's own field names them once it is open. A small
          choice made in T245 and put to the user; theirs to change. */}
      <span>Search wechart</span>
      <kbd>{shortcut()}</kbd>
    </button>
  );
}

export function AppShell({ workspace, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="app-bar">
        {/* The prototype's brand: the "we" mark, then the name (AC-187). */}
        <span className="app-bar__product">
          <span className="app-bar__mark" data-testid="brand-mark" aria-hidden="true">
            we
          </span>
          wechart
        </span>
        <WorkspaceSwitcher current={workspace} />
        <span className="app-bar__spacer" />
        <SearchTrigger />
        <ThemeToggle />
        {/* Who is signed in, at the far right (AC-190, AC-252, AC-254). */}
        <AccountMenu />
      </header>
      <main>{children}</main>
      <SearchPalette />
    </div>
  );
}
