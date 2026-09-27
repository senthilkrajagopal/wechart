import type { ConnectionHealth } from './connections';

/**
 * Whether every running Cube instance uses a data source's stored settings
 * (T365, AC-161), from each instance's report to xcube. xcube swaps a changed
 * connection's driver while Cube runs, so nothing here asks for a restart.
 *
 * "Every instance" is each one reporting within the hour: an instance writes
 * a report only when it builds the driver, and nothing removes the reports of
 * instances that are gone (research `xcube-slice-6.md`, "When a row is
 * written"), so an older report isn't shown.
 */
export type CubeState =
  /** xcube holds no connection of its name: not landed (a workspace's, say). */
  | { readonly state: 'unlanded' }
  | {
      /**
       * `live`: every instance reporting within the hour runs the stored version;
       * `waiting`: one still runs the settings before;
       * `failed`: one couldn't take them, and says why;
       * `unused`: no instance has built its driver within the hour.
       */
      readonly state: 'live' | 'waiting' | 'failed' | 'unused';
      readonly version: number;
      readonly instances: ConnectionHealth['instances'];
    };

const HOUR_MS = 60 * 60 * 1000;

export function cubeStateOf(health: ConnectionHealth | undefined, now: Date): CubeState {
  if (health === undefined) return { state: 'unlanded' };
  const instances = health.instances.filter(
    (instance) => now.getTime() - new Date(instance.reportedAt).getTime() <= HOUR_MS,
  );
  const state =
    instances.length === 0
      ? 'unused'
      : instances.some((instance) => instance.current && instance.state === 'failed')
        ? 'failed'
        : instances.every((instance) => instance.current && instance.state === 'live')
          ? 'live'
          : 'waiting';
  return { state, version: health.version, instances };
}
