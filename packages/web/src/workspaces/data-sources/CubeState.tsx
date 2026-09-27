/**
 * Whether every running Cube instance uses a data source's settings (T365,
 * AC-161), as `GET /api/data-sources/:id/cube-state` says it: each instance
 * reporting within the hour, on the stored version and live. xcube swaps a
 * changed connection's driver while Cube runs, so nothing here asks for a
 * restart. Drawn as every state is: an icon of its kind and its words, never
 * colour alone (direction.md rule 22).
 */
import { Status, type StateKind } from '../jobs/StateBadge';

type Instance = {
  readonly instance: string;
  readonly version: number | null;
  readonly state: 'live' | 'failed';
  readonly error: string | null;
  readonly reportedAt: string;
  readonly current: boolean;
};

export type CubeStateView =
  | { readonly state: 'unlanded' }
  | {
      readonly state: 'live' | 'waiting' | 'failed' | 'unused';
      readonly version: number;
      readonly instances: readonly Instance[];
    };

export function cubeStateLabel(view: CubeStateView): { kind: StateKind; label: string } {
  switch (view.state) {
    case 'live':
      return { kind: 'ok', label: 'Cube uses these settings' };
    case 'waiting':
      return { kind: 'run', label: 'Waiting for Cube to pick up the change' };
    case 'failed':
      return { kind: 'err', label: 'Cube couldn’t take these settings' };
    case 'unused':
      // xcube hears from an instance only when it builds the driver: one
      // using a driver built earlier says nothing (T365's review).
      return { kind: 'idle', label: 'No Cube instance has reported on it in the last hour' };
    case 'unlanded':
      return { kind: 'warn', label: 'Not yet published to Cube' };
  }
}

export function CubeState({ view }: { view: CubeStateView }) {
  const { kind, label } = cubeStateLabel(view);
  const instances = view.state === 'unlanded' ? [] : view.instances;
  const failed = instances.filter((each) => each.current && each.state === 'failed');
  return (
    <div className="cube-state">
      <Status kind={kind} label={label} testId="cube-state" state={view.state} />
      {instances.length > 0 && (
        <p className="cube-state__heard">
          {instances.length === 1
            ? '1 Cube instance reported within the hour'
            : `${String(instances.length)} Cube instances reported within the hour`}
        </p>
      )}
      {failed.length > 0 && (
        <ul className="cube-state__errors">
          {failed.map((each) => (
            <li key={each.instance}>{each.error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
