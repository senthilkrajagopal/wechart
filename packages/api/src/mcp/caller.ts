import { isSuperAdmin } from '@wechart/core';

import { type SecurityMode, SINGLE_USER, type WechartUser } from '../auth/user';
import type { SignInStore } from '../repos/sign-ins';

export interface McpCallerOptions {
  readonly security: SecurityMode;
  /** The group whose members are Super-Admins (T323); none makes no one one. */
  readonly superAdminGroup?: string;
  /** Needed with sign-in on: with none, an owner has no groups. */
  readonly signIns?: Pick<SignInStore, 'latest'>;
}

/**
 * Who a token acts as on `/mcp` (T777, AC-471, AC-432): its owner, as the
 * web app's user, with the groups of the owner's latest web sign-in, so a
 * change of groups takes effect from their next sign-in. An owner with no
 * sign-in on record has no groups. A Super-Admin is one by those groups, as
 * on the web (T323). With sign-in off, it is the single user (AC-479).
 */
export function mcpCaller(options: McpCallerOptions) {
  return async (owner: { key: string; name: string }): Promise<WechartUser> => {
    if (options.security === 'off') return SINGLE_USER;
    const groups = [...((await options.signIns?.latest(owner.key))?.groups ?? [])];
    return {
      key: owner.key,
      name: owner.name,
      groups,
      superAdmin: isSuperAdmin(groups, options.superAdminGroup),
    };
  };
}

export type McpCallerOf = ReturnType<typeof mcpCaller>;
