/**
 * A shared item's content changes only through a proposal (T502, AC-278):
 * with sign-in on, never in place, by anyone, a Super-Admin too. It is
 * changed in a copy in the workspace ("Edit in my workspace"), proposed back
 * and approved. Moving and renaming it are not changes to its content.
 */
export const sharedInPlace = (noun: 'dashboard' | 'chart' | 'data source') => ({
  error: `This ${noun} is shared: it changes only through a proposal. Choose Edit in my workspace, change your copy there, and propose it.`,
  code: 'shared_in_place' as const,
});
