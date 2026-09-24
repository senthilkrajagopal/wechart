/**
 * The workspace switcher in the top bar (AC-001).
 *
 * There is deliberately no "Dashboards" entry: dashboards are objects inside
 * Explore folders, not a workspace of their own (docs/inputs §8,
 * direction.md §2).
 */

export interface Workspace {
  readonly id: string;
  readonly label: string;
  readonly path: string;
}

/** The single list both the switcher and the router read, so they cannot drift. */
export const WORKSPACES = [
  { id: 'explore', label: 'Explore', path: '/explore' },
  { id: 'model', label: 'Model', path: '/model' },
  { id: 'data-sources', label: 'Data sources', path: '/data-sources' },
  { id: 'jobs', label: 'Jobs', path: '/jobs' },
  { id: 'schedules', label: 'Schedules', path: '/schedules' },
  { id: 'security', label: 'Security', path: '/security' },
] as const satisfies readonly Workspace[];

export type WorkspaceId = (typeof WORKSPACES)[number]['id'];

export interface WorkspaceSwitcherProps {
  /** None on a page in no workspace, such as Not found. */
  readonly current?: WorkspaceId | undefined;
}

export function WorkspaceSwitcher({ current }: WorkspaceSwitcherProps) {
  return (
    <nav aria-label="Workspaces" className="workspace-switcher">
      <ul>
        {WORKSPACES.map((workspace) => (
          <li key={workspace.id}>
            <a
              href={workspace.path}
              // Not colour alone: the current workspace is announced
              // (direction.md rule 3).
              aria-current={workspace.id === current ? 'page' : undefined}
            >
              {workspace.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
