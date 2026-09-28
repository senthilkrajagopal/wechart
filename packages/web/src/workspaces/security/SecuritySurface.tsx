import { useQuery } from '@tanstack/react-query';

import { AppShell } from '../../shell/AppShell';
import { ME_QUERY } from '../../shell/me';
import { NotFound } from '../../shell/NotFound';
import { StateLine } from '../../shell/StatusIcon';
import { SecurityPage, type SecurityTab } from './SecurityPage';

/**
 * Security (T500; design 08 of 2026-09-27): with sign-in on, the
 * Super-Admins' alone, in tabs at their own addresses; to anyone else the
 * same Not found as a missing page (state D, rule 67). With sign-in off,
 * phase 1's one page, at `/security`. Who is signed in unknown — the answer
 * failed — shows nothing of it: the gate fails closed (T500's review).
 */
export function SecuritySurface({ tab }: { tab: SecurityTab | undefined }) {
  const me = useQuery({ ...ME_QUERY, retry: false });
  if (me.isPending)
    return (
      <AppShell>
        <StateLine kind="run">Loading…</StateLine>
      </AppShell>
    );
  const signedIn = me.data?.security === 'oidc';
  const allowed =
    me.isSuccess && tab !== undefined && (signedIn ? me.data.superAdmin : tab === 'policies');
  if (!allowed)
    return (
      <AppShell>
        <NotFound />
      </AppShell>
    );
  return (
    <AppShell workspace="security">
      <SecurityPage signedIn={signedIn} tab={tab} />
    </AppShell>
  );
}
