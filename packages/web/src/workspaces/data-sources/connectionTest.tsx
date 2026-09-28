import {
  sealSecretV1,
  type DriverType,
  type FieldValue,
  type SealedV1,
  type XcubeKey,
} from '@wechart/core';

import { StatusIcon } from '../../shell/StatusIcon';

/**
 * A connection test, as the new data source wizard (T471, design 01 state D)
 * and a stored one's page (T497, design 03 pin 8) both run it: each typed
 * secret sealed to xcube's key as it is sent (AC-325), and Cube's four
 * checks listed before they run, ticked as they answer, a failure opened
 * in place with what to look at and Cube's own words (AC-159).
 */

export type Seal = (
  driver: DriverType,
  field: string,
  fields: Readonly<Record<string, FieldValue>>,
  secret: string,
) => Promise<SealedV1>;

export interface Check {
  readonly id: string;
  readonly status: 'passed' | 'failed' | 'skipped';
  readonly durationMs?: number;
  readonly error?: string;
}

/** xcube's checks, in the order it runs them, as AC-159 names them. */
export const CHECKS = [
  { id: 'secrets', label: 'Open the secrets' },
  { id: 'config', label: 'Build the connection’s configuration' },
  { id: 'connect', label: 'Connect' },
  { id: 'schemas', label: 'Read the catalog' },
] as const;
export const CHECK_LABELS: Record<string, string> = Object.fromEntries(
  CHECKS.map((check) => [check.id, check.label]),
);

/** What to look at when a check fails, before Cube's own words. */
const GUIDANCE: Record<string, string> = {
  secrets: 'Cube couldn’t open the secrets. Enter them again.',
  config: 'Cube couldn’t build a connection from these settings. Check each of them.',
  connect:
    'Cube’s driver couldn’t connect. Check the host and port, the user and password, and whether the database accepts connections from Cube.',
  schemas: 'Cube connected, but couldn’t read the catalog. Check that this user may list schemas.',
};

/** Seals to the key wechart's API gives out (T441), read once. */
export function sealerOf(): Seal {
  let key: Promise<XcubeKey> | undefined;
  return async (driver, field, fields, secret) => {
    key ??= fetch('/api/data-sources/sealing-key').then(async (response) => {
      if (!response.ok) throw new Error(await errorOf(response, 'read the key to seal it to'));
      return (await response.json()) as XcubeKey;
    });
    return sealSecretV1(
      await key.catch((error: unknown) => {
        key = undefined;
        throw error;
      }),
      driver,
      field,
      fields,
      secret,
    );
  };
}

/** The API's reason, and any problems it names, or what couldn't be done. */
export async function errorOf(response: Response, doing: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    problems?: string[];
  };
  const said = [body.error, ...(body.problems ?? [])].filter(Boolean).join(' ');
  return said === '' ? `Could not ${doing} (${String(response.status)}).` : said;
}

/**
 * The four checks: before a run each "Not run"; while it runs, each under
 * way, none claimed further along (Cube answers them at once, T471's
 * review); then each with its time, a failure opened with its guidance,
 * Cube's text and the ways to fix it.
 */
export function ConnectionChecks({
  checks,
  running,
  onFix,
}: {
  checks: readonly Check[] | undefined;
  running: boolean;
  /** Where each fix goes: the sign-in fields or where it connects. */
  onFix: (group: 'sign-in' | 'where') => void;
}) {
  return (
    <ul className="connection-checks" aria-label="Checks">
      {CHECKS.map((each) => {
        const check = checks?.find((one) => one.id === each.id);
        const state = check?.status ?? (running ? 'running' : 'not-run');
        return (
          <li key={each.id} className={`connection-checks__check is-${state}`}>
            <span className="connection-checks__row">
              <StatusIcon
                kind={
                  state === 'passed'
                    ? 'ok'
                    : state === 'failed'
                      ? 'err'
                      : state === 'running'
                        ? 'run'
                        : 'idle'
                }
              />
              <span className="connection-checks__label">{each.label}</span>
              <span className="connection-checks__time">
                {state === 'passed' || state === 'failed'
                  ? `${String(check?.durationMs ?? 0)} ms`
                  : state === 'skipped'
                    ? 'Skipped'
                    : state === 'running'
                      ? 'Testing'
                      : 'Not run'}
              </span>
            </span>
            {state === 'failed' ? (
              <div className="connection-checks__failure">
                <p>{GUIDANCE[each.id]}</p>
                {check?.error === undefined ? null : <pre>{check.error}</pre>}
                <div className="connection-checks__fixes">
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      onFix('sign-in');
                    }}
                  >
                    Change sign-in
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      onFix('where');
                    }}
                  >
                    Change where it connects
                  </button>
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
