import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { StateLine } from '../../shell/StatusIcon';
import { SettingsDiff } from '../reviews/SettingsDiff';

/**
 * A data source's kept version, set against its settings now (T515; design
 * 06, state D; rule 83): each setting as it was and is, and each credential
 * only as "unchanged" or "replaced", compared sealed and never shown.
 */
interface KeptSource {
  readonly version: number;
  readonly content: {
    readonly body: Readonly<Record<string, unknown>>;
    readonly secretChanges?: Readonly<Record<string, 'unchanged' | 'replaced' | 'new'>>;
  };
}

export function SourceVersion({
  source,
  version,
  onClose,
  onRestore,
  lastTest,
}: {
  readonly source: { readonly id: string; readonly name: string; readonly version: number };
  readonly version: number;
  readonly onClose: () => void;
  /** Its restore proposed from the band, as a dashboard's version is (state A). */
  readonly onRestore?: (() => void) | undefined;
  /** The current settings' last test, which the diff shows (state D). */
  readonly lastTest?: ReactNode;
}) {
  const kept = useQuery({
    queryKey: ['history', 'data-source', source.id, version],
    queryFn: async () => {
      const response = await fetch(
        `/api/history/data-source/${encodeURIComponent(source.id)}/versions/${String(version)}`,
      );
      if (!response.ok)
        throw new Error(`That version could not be read (${String(response.status)}).`);
      return (await response.json()) as KeptSource;
    },
  });
  return (
    <section className="source-version" aria-label={`Version ${String(version)}`}>
      <div className="version-band" role="status" aria-label="Version shown">
        <span>
          Version {version} of <span className="is-code">{source.name}</span> · read-only, set
          against version {source.version}, as it is now
        </span>
        {onRestore === undefined ? null : (
          <button type="button" className="btn btn-sm" onClick={onRestore}>
            Propose restoring…
          </button>
        )}
        <button type="button" className="btn btn-sm" onClick={onClose}>
          Back to current
        </button>
      </div>
      {lastTest === undefined ? null : (
        <p className="source-version__test">Last test of the current settings: {lastTest}</p>
      )}
      {kept.isPending ? <StateLine kind="run">Reading version {version}…</StateLine> : null}
      {kept.isError ? <StateLine kind="err">{kept.error.message}</StateLine> : null}
      {kept.data === undefined ? null : (
        <SettingsDiff
          otherLabel={`Version ${String(version)}`}
          otherFirst
          item={{
            kind: 'data-source',
            id: source.id,
            title: source.name,
            version,
            landsIn: '',
            landsInPath: [],
            replaces: { id: source.id, version: source.version, copiedFrom: false },
            snapshot: kept.data.content.body,
            ...(kept.data.content.secretChanges === undefined
              ? {}
              : { secretChanges: kept.data.content.secretChanges }),
          }}
        />
      )}
      <p className="source-version__note">
        Restoring it is a change to where or how it connects: its draft in My workspace is tested
        before it is proposed.
      </p>
    </section>
  );
}
