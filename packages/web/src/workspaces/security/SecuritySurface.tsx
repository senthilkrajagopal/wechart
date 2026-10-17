import { useQuery } from '@tanstack/react-query';

import { AppShell } from '../../shell/AppShell';
import { ME_QUERY } from '../../shell/me';
import { NotFound } from '../../shell/NotFound';
import { StateLine } from '../../shell/StatusIcon';
import type { AuditFilters } from './AuditTrail';
import { SecurityPage, type SecurityTab } from './SecurityPage';

/**
 * Security (T500; design 08 of 2026-09-27): with sign-in on, the
 * Super-Admins' alone, in tabs at their own addresses; to anyone else the
 * same Not found as a missing page (state D, rule 67). With sign-in off,
 * the same tabs, the single user's (security-Q1, T699). Who is signed in unknown — the answer
 * failed — shows nothing of it: the gate fails closed (T500's review).
 */
export function SecuritySurface({
  tab,
  audit,
}: {
  tab: SecurityTab | undefined;
  /** The audit trail's filters, from the page's address (T369). */
  audit?: { readonly filters: AuditFilters; readonly onFilters: (next: AuditFilters) => void };
}) {
  const me = useQuery({ ...ME_QUERY, retry: false });
  if (me.isPending)
    return (
      <AppShell>
        <StateLine kind="run">Loading…</StateLine>
      </AppShell>
    );
  const signedIn = me.data?.security === 'oidc';
  // With sign-in off, the one user is a Super-Admin: the same tabs (security-Q1, R76; T699).
  // Everyone's tokens only with sign-in on: off, there is one user (T772; design 18, H).
  const allowed =
    me.isSuccess && tab !== undefined && (signedIn ? me.data.superAdmin : tab !== 'tokens');
  if (!allowed)
    return (
      <AppShell>
        <NotFound />
      </AppShell>
    );
  return (
    <AppShell workspace="security">
      <SecurityPage signedIn={signedIn} tab={tab} {...(audit === undefined ? {} : { audit })} />
    </AppShell>
  );
}
