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

const counted = (n: number) => (n === 1 ? '1 instance' : `${String(n)} instances`);

/**
 * What follows the state on its line, as design 03's states G and H write it
 * (T698, SRC-19): live, its version and how many instances; waiting, how many
 * of them have it; failed, how many failed; nothing for the others.
 */
export function cubeStateDetail(view: CubeStateView): string | undefined {
  if (view.state === 'unlanded' || view.instances.length === 0) return undefined;
  const instances = view.instances;
  switch (view.state) {
    case 'live':
      return `version ${String(view.version)} · ${counted(instances.length)}`;
    case 'waiting': {
      const have = instances.filter((each) => each.current && each.state === 'live').length;
      return `version ${String(view.version)} · ${String(have)} of ${counted(instances.length)}`;
    }
    case 'failed':
      return counted(instances.filter((each) => each.current && each.state === 'failed').length);
    case 'unused':
      return undefined;
  }
}

export function CubeState({ view }: { view: CubeStateView }) {
  const { kind, label } = cubeStateLabel(view);
  const instances = view.state === 'unlanded' ? [] : view.instances;
  const failed = instances.filter((each) => each.current && each.state === 'failed');
  const detail = cubeStateDetail(view);
  return (
    <div className="cube-state">
      <Status
        kind={kind}
        label={label}
        testId="cube-state"
        state={view.state}
        {...(detail === undefined ? {} : { detail })}
      />
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
