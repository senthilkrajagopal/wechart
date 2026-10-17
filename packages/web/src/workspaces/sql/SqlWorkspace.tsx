import { useQuery } from '@tanstack/react-query';

import { NotFound } from '../../shell/NotFound';
import { ME_QUERY } from '../../shell/me';
import { hiddenWorkspacesFor } from '../../shell/WorkspaceSwitcher';

/**
 * The SQL runner workspace at `/sql` (F42; R78; design 17, direction §7f).
 *
 * Super-Admins' and read-write members' alone, as Jobs and Schedules are
 * (AC-001, AC-446; T796). Anyone else gets the page an address that matches
 * nothing gets, so the two can't be told apart (rule 67); and until who is
 * signed in is known, nothing of it, never a moment of content they may not
 * see (T500's review: fail closed).
 */
export function SqlWorkspace() {
  const me = useQuery({ ...ME_QUERY, retry: false });
  if (me.data === undefined) return me.isError ? <NotFound /> : null;
  if (hiddenWorkspacesFor(me.data).includes('sql')) return <NotFound />;
  return (
    <section className="sql-workspace" aria-labelledby="sql-workspace-title">
      {/* Design 17 draws no title over the panes; the page still has its heading. */}
      <h1 id="sql-workspace-title" className="visually-hidden">
        SQL runner
      </h1>
    </section>
  );
}
