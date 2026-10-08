import { describe, expect, it } from 'vitest';

import type { Me } from './AccountMenu';
import { hasWorkspace } from './me';

/**
 * T760 (AC-277): WHILE a user has only read-only access everywhere, THE
 * SYSTEM SHALL give them no workspace and no action that creates or edits
 * content. Whether the signed-in user has a workspace, as `/api/me` says it.
 */
const signedIn = (rest: Partial<Me>): Me => ({
  name: 'Someone',
  groups: [],
  superAdmin: false,
  security: 'oidc',
  ...rest,
});

describe('who has a workspace (T760, AC-277)', () => {
  it('is the single user with sign-in off, a Super-Admin, and a read-write member somewhere', () => {
    expect(hasWorkspace({ name: 'admin', groups: [], superAdmin: true, security: 'off' })).toBe(
      true,
    );
    expect(hasWorkspace(signedIn({ superAdmin: true }))).toBe(true);
    expect(hasWorkspace(signedIn({ readWrite: true }))).toBe(true);
  });

  it('is no one read-only everywhere, nor one in no group', () => {
    expect(hasWorkspace(signedIn({ readWrite: false, groups: ['sales-ro'] }))).toBe(false);
    expect(hasWorkspace(signedIn({}))).toBe(false);
  });
});
