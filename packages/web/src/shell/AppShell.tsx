import { SearchPalette } from './SearchPalette';
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
  readonly workspace: WorkspaceId;
  readonly children?: React.ReactNode;
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
        <ThemeToggle />
      </header>
      <main>{children}</main>
      <SearchPalette />
    </div>
  );
}
