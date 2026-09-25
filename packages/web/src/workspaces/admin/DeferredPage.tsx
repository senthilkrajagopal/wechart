import type { ReactNode } from 'react';

import { StatusIcon } from '../../shell/StatusIcon';

/**
 * A workspace whose management is not part of this phase (AC-233): its title,
 * what it is for, and that it waits — the prototype's page frame with its
 * info bar, rather than the empty <main> the admin critique found, which read
 * as broken rather than as deferred.
 *
 * Deferred by the user's scope decisions: data-source management (F18) —
 * "Cube first, defer the rest". Schedules has its own page since T160.
 */
export function DeferredPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="admin-page">
      <h1 className="workspace-title">{title}</h1>
      <div className="info-bar" role="note">
        <StatusIcon kind="idle" />
        <div>{children}</div>
      </div>
    </div>
  );
}

/**
 * Data sources: Cube Core has no API for managing connections — they are its
 * deployment's configuration (docs/research/cube/data-sources.md, "Core has no
 * runtime API for managing connections") — and managing them from wechart is
 * deferred. Which source a cube reads is set in the model.
 */
export function DataSourcesPage() {
  return (
    <DeferredPage title="Data sources">
      <p>
        Cube reads its connections from its own deployment’s configuration. Adding, testing and
        editing them from wechart is not part of this phase. Which source a cube reads is its{' '}
        <code>data_source</code>, set in Model.
      </p>
    </DeferredPage>
  );
}
