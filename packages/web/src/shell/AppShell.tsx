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
        <span className="app-bar__product">wechart</span>
        <WorkspaceSwitcher current={workspace} />
      </header>
      <main>{children}</main>
    </div>
  );
}
