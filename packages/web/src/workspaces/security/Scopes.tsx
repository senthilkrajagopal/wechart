import { NEEDED_BY, SCOPES, useScopes, type ScopeState } from '../../query/scopes';
import { StateLine } from '../../shell/StatusIcon';
import { Status, type StateKind } from '../jobs/StateBadge';

const SAID: Record<ScopeState, [StateKind, string]> = {
  granted: ['ok', 'Granted'],
  missing: ['err', 'Missing'],
  unknown: ['warn', 'Unknown'],
};

/**
 * The Cube API scopes wechart's own security context has (T176, AC-170),
 * each with its state — an icon and words — and what in wechart needs it.
 */
export function Scopes() {
  const scopes = useScopes();
  if (scopes.isPending)
    return <StateLine kind="run">Asking Cube which API scopes wechart has…</StateLine>;
  if (scopes.isError) return <StateLine kind="err">{scopes.error.message}</StateLine>;
  return (
    <table className="query-log" aria-label="Cube API scopes">
      <thead>
        <tr>
          <th scope="col">Scope</th>
          <th scope="col">wechart has it</th>
          <th scope="col">Needed by</th>
        </tr>
      </thead>
      <tbody>
        {SCOPES.map((scope) => {
          const [kind, label] = SAID[scopes.data[scope]] ?? SAID.unknown;
          return (
            <tr key={scope}>
              <td className="query-log__query">{scope}</td>
              <td>
                <Status kind={kind} label={label} testId={`scope-${scope}`} />
              </td>
              <td>{NEEDED_BY[scope]}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
