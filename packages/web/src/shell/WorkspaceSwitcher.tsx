import type { Me } from './AccountMenu';

/**
 * The workspace switcher in the top bar (AC-001).
 *
 * There is deliberately no "Dashboards" entry: dashboards are objects inside
 * Explore folders, not a workspace of their own (docs/inputs §8,
 * direction.md §2). Nor is there a Model entry: models are folder items,
 * opened from their folders in Explore (F27; T331). The Model workspace keeps
 * its address, so a link into it still opens.
 */

export interface Workspace {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  /** False: routed, but never listed in the switcher (AC-001's Model). */
  readonly listed?: false;
}

/** The single list both the switcher and the router read, so they cannot drift. */
export const WORKSPACES = [
  { id: 'explore', label: 'Explore', path: '/explore' },
  { id: 'model', label: 'Model', path: '/model', listed: false },
  { id: 'data-sources', label: 'Data sources', path: '/data-sources' },
  { id: 'jobs', label: 'Jobs', path: '/jobs' },
  { id: 'schedules', label: 'Schedules', path: '/schedules' },
  { id: 'security', label: 'Security', path: '/security' },
] as const satisfies readonly Workspace[];

export type WorkspaceId = (typeof WORKSPACES)[number]['id'];

/** What only those who write somewhere may use: their folders' data sources, builds and schedules. */
const WRITERS: readonly WorkspaceId[] = ['data-sources', 'jobs', 'schedules'];

/**
 * The workspaces a user may not open, left out of the switcher (AC-001;
 * design 09, state A):
 *
 * - Explore is every user's.
 * - Data sources, Jobs and Schedules are Super-Admins' and read-write
 *   members' (T364, T371).
 * - Security is Super-Admins' (T500).
 *
 * With sign-in off the one user holds every permission, as a Super-Admin does
 * (AC-254). Until who is signed in is known, Explore alone: never an entry
 * they may not open, even for a moment (T500's review: fail closed).
 */
export function hiddenWorkspacesFor(me: Me | undefined): WorkspaceId[] {
  if (me === undefined) return [...WRITERS, 'security'];
  if (me.security === 'off' || me.superAdmin) return [];
  return me.readWrite === true ? ['security'] : [...WRITERS, 'security'];
}

export interface WorkspaceSwitcherProps {
  /** None on a page in no workspace, such as Not found. */
  readonly current?: WorkspaceId | undefined;
  /** Those the user may not open, left out (`hiddenWorkspacesFor`). */
  readonly hidden?: readonly WorkspaceId[];
}

export function WorkspaceSwitcher({ current, hidden = [] }: WorkspaceSwitcherProps) {
  return (
    <nav aria-label="Workspaces" className="workspace-switcher">
      <ul>
        {WORKSPACES.filter(
          (workspace: Workspace) =>
            workspace.listed !== false && !hidden.includes(workspace.id as WorkspaceId),
        ).map((workspace) => (
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
