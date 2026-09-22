import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Status } from '../jobs/StateBadge';

type AuthCheck =
  | { readonly auth: 'enforced' }
  | { readonly auth: 'open'; readonly accepted: readonly string[] }
  | { readonly auth: 'unknown' };

const KEY = ['cube-auth'] as const;
const UNKNOWN: AuthCheck = { auth: 'unknown' };

/**
 * Whether Cube lets in requests nobody signed (T175, AC-169), in the Security
 * workspace: a warning for as long as it does — asked again while the page is
 * open, with nothing to dismiss it — naming what Cube let in, what that opens,
 * and what makes Cube refuse them: `NODE_ENV=production`, or a `checkAuth`
 * that rejects them (research/cube/access-control.md, Gotchas).
 *
 * Only a definite answer replaces a warning: an ask that fails or cannot tell
 * leaves it up (T175's review). Not known is said as not known, never as
 * refused.
 */
export function AuthWarning({ pollMs = 30_000 }: { pollMs?: number }) {
  const client = useQueryClient();
  const check = useQuery({
    queryKey: KEY,
    queryFn: async ({ signal }): Promise<AuthCheck> => {
      const before = client.getQueryData<AuthCheck>(KEY);
      let answer: AuthCheck;
      try {
        const response = await fetch('/api/cube-auth', { signal });
        answer = response.ok ? ((await response.json()) as AuthCheck) : UNKNOWN;
      } catch (error) {
        // Leaving the page is not an answer.
        if (signal.aborted) throw error;
        answer = UNKNOWN;
      }
      return answer.auth === 'unknown' && before?.auth === 'open' ? before : answer;
    },
    refetchInterval: pollMs,
    refetchOnMount: 'always',
  });

  const known = check.data;
  if (known?.auth === 'open')
    return (
      // Its own node, so the alert is announced as it appears rather than a
      // status line changing its role.
      <div key="open" className="auth-check auth-check--open" role="alert" data-testid="cube-auth">
        <Status
          kind="err"
          label={`Cube lets in requests with ${known.accepted.join(' and with ')}.`}
          testId="cube-auth-state"
        />
        <p>
          It answers them as an empty security context: every cube and view with no access policy,
          and every policy for any group, is open to anyone who can reach Cube. Cube refuses them
          when it runs with <code>NODE_ENV=production</code>, or with a <code>checkAuth</code> that
          rejects them.
        </p>
      </div>
    );
  if (known?.auth === 'enforced')
    return (
      <div key="said" className="auth-check" role="status" data-testid="cube-auth">
        <Status
          kind="ok"
          label="Cube refuses requests without a valid token."
          testId="cube-auth-state"
        />
      </div>
    );
  return (
    <div key="said" className="auth-check" role="status" data-testid="cube-auth">
      <Status
        // Asking is under way, not a warning (T183, AC-177); not knowing is one.
        kind={known === undefined ? 'run' : 'warn'}
        label={
          known === undefined
            ? 'Asking Cube whether it refuses requests without a valid token…'
            : 'Could not tell whether Cube refuses requests without a valid token.'
        }
        testId="cube-auth-state"
      />
      {known === undefined ? null : (
        <p>
          A <code>checkAuth</code> that rejects them answers with an error, which reads as this.
        </p>
      )}
    </div>
  );
}
