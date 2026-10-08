import type { FieldValue, SealedV1 } from '@wechart/core';

import { DataSourceRefused, type DataSource, type Landed } from '../repos/data-sources';
import { XcubeError } from './client';
import type { PublishedFolders } from './folders';
import { DEFAULT_AT_ROOT, nameInUse } from './refusal';

/**
 * Each folder's data source landed in xcube as a connection (T442; AC-327,
 * AC-330, AC-161; research `xcube-slice-6.md`, "`PUT …/connections/{name}`").
 *
 * wechart's server alone calls xcube: xcube never asks wechart for a
 * connection (AC-327). A PUT carries the whole connection — its folder, driver,
 * sign-in method, fields, every stored envelope and their revisions — and
 * xcube stores it whole, after checking every envelope opens for the target
 * and the driver's configuration builds; nothing connects. So a data source
 * lands before wechart commits it, and xcube's refusal refuses the save.
 */

/** A connection as xcube lists it: its secrets named, never held out. */
export interface HeldConnection {
  readonly name: string;
  readonly folderId: string;
  readonly driver: string;
  readonly authMethod: string;
  readonly fields: Readonly<Record<string, FieldValue>>;
  readonly secrets: readonly string[];
  readonly revisions: Readonly<Record<string, string>>;
  /** The version an edit of it names (T701; research `xcube-256d632371.md`, 2.5). */
  readonly version: number;
}

export interface ConnectionBody {
  readonly folderId: string;
  readonly driver: string;
  readonly authMethod: string;
  readonly fields: Readonly<Record<string, FieldValue>>;
  readonly sealed: Readonly<Record<string, SealedV1>>;
  readonly revisions: Readonly<Record<string, string>>;
  /**
   * The version it edits, in place or moved to `folderId`; `null` creates it,
   * which xcube never lands over another data source of its name, in any
   * case (T701; research `xcube-256d632371.md`, 2.5). Required from
   * `256d632371`.
   */
  readonly baseVersion: number | null;
}

/** A connection as tested: what xcube opens and connects with, stored or not (T361). */
export type TestedConnection = Omit<ConnectionBody, 'folderId' | 'revisions' | 'baseVersion'>;

/**
 * A connection test's checks, as xcube ran them (research, "`POST
 * …/connections/test`"): `secrets`, `config`, `connect`, `schemas`, a failed
 * one skipping the rest, each secret redacted from its error.
 */
export interface TestAnswer {
  readonly ok: boolean;
  readonly checks: readonly {
    readonly id: string;
    readonly status: 'passed' | 'failed' | 'skipped';
    readonly durationMs: number;
    readonly error?: string;
  }[];
}

/**
 * Each Cube instance's report of a connection (research, "`GET
 * …/connections/{name}/health`"): written when an instance builds its driver,
 * on first use or a swap; `current` when it built the stored version.
 */
export interface ConnectionHealth {
  readonly version: number;
  readonly instances: readonly {
    readonly instance: string;
    readonly version: number | null;
    readonly state: 'live' | 'failed';
    readonly error: string | null;
    readonly reportedAt: string;
    readonly current: boolean;
  }[];
}

export interface XcubeConnections {
  put(name: string, body: ConnectionBody): Promise<void>;
  /** Its instances' reports; none where xcube holds no connection of that name. */
  health(name: string): Promise<ConnectionHealth | undefined>;
  /** Removed, or never there: xcube answers 204 either way. */
  remove(name: string): Promise<void>;
  list(): Promise<HeldConnection[]>;
  /** Connects as Cube would, with Cube's own driver (T361, AC-159). */
  test(body: TestedConnection): Promise<TestAnswer>;
}

/**
 * What xcube refuses every time for the same connection (research, "Errors
 * added by slice 6"): its config or name (400), a change of driver or a
 * connection published cubes use (409), an envelope that won't open (422).
 * From `256d632371` (T701; research `xcube-256d632371.md`, "On the connection
 * route"): `default` outside the root (400); a name another data source
 * holds, in any case, a version since changed, and a move that would leave
 * cubes off their data source's path (409).
 */
export class ConnectionRefused extends Error {
  constructor(
    readonly status: 400 | 409 | 422,
    readonly code: string,
    message: string,
    readonly problems: readonly string[],
  ) {
    super(message);
    this.name = 'ConnectionRefused';
  }
}

const REFUSALS: Readonly<Record<string, 400 | 409 | 422>> = {
  invalid_connection: 400,
  invalid_connection_name: 400,
  bad_request: 400,
  default_outside_root: 400,
  driver_change: 409,
  in_use: 409,
  name_in_use: 409,
  conflict: 409,
  data_source_range: 409,
  invalid_secret: 422,
};

/**
 * xcube checks a connection and builds its driver's configuration, and never
 * connects (research, "Checks, in order"): it answers well within this. A
 * save's database transaction waits on it, so it is short (T442's review).
 */
const CALL_TIMEOUT_MS = 15_000;
/** A test connects, and lists schemas: two steps of up to 30 s each (research, T361's row). */
const TEST_TIMEOUT_MS = 70_000;

export function xcubeConnections({
  cubeApiUrl,
  model,
  token,
  fetch: send = fetch,
  timeoutMs = CALL_TIMEOUT_MS,
}: {
  readonly cubeApiUrl: string;
  readonly model: string;
  /** The service credential's token, minted for each call (T420). */
  readonly token: string | (() => Promise<string>);
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}): XcubeConnections {
  const base = `${cubeApiUrl.replace(/\/$/, '')}/v1/semantic/models/${encodeURIComponent(model)}/connections`;
  const credential = typeof token === 'string' ? async () => token : token;

  const call = async (
    method: 'GET' | 'PUT' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    waitMs = timeoutMs,
  ) => {
    const response = await send(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await credential()}`,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(waitMs),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const answer = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: response.status, answer };
  };
  const failed = (status: number, answer: Record<string, unknown>) => {
    const code = typeof answer['code'] === 'string' ? answer['code'] : undefined;
    const error = typeof answer['error'] === 'string' ? answer['error'] : undefined;
    const refusal = code === undefined ? undefined : REFUSALS[code];
    if (refusal !== undefined && refusal === status) {
      const message = error ?? code!;
      // `name_in_use` comes with no problems (research `xcube-256d632371.md`):
      // its words are its one problem, as where none are given.
      const problems =
        Array.isArray(answer['problems']) && answer['problems'].length > 0
          ? (answer['problems'] as unknown[]).map(String)
          : [message];
      return new ConnectionRefused(refusal, code!, message, problems);
    }
    return new XcubeError(
      status,
      code,
      `xcube answered ${String(status)}${error === undefined ? '' : `: ${error}`}`,
    );
  };

  return {
    async put(name, body) {
      const { status, answer } = await call('PUT', `/${encodeURIComponent(name)}`, body);
      if (status !== 200) throw failed(status, answer);
    },

    async health(name) {
      const { status, answer } = await call('GET', `/${encodeURIComponent(name)}/health`);
      if (status === 404 && answer['code'] === 'unknown_connection') return undefined;
      if (status !== 200) throw failed(status, answer);
      return {
        version: Number(answer['version']),
        instances: Array.isArray(answer['instances'])
          ? (answer['instances'] as ConnectionHealth['instances'])
          : [],
      };
    },

    async remove(name) {
      const { status, answer } = await call('DELETE', `/${encodeURIComponent(name)}`);
      if (status !== 204 && status !== 200) throw failed(status, answer);
    },

    async list() {
      const { status, answer } = await call('GET', '');
      if (status !== 200) throw failed(status, answer);
      const rows = Array.isArray(answer['connections'])
        ? (answer['connections'] as Record<string, unknown>[])
        : [];
      return rows.map((row) => ({
        name: String(row['name']),
        folderId: String(row['folderId']),
        driver: String(row['driver']),
        authMethod: String(row['authMethod']),
        fields: (row['fields'] ?? {}) as Record<string, FieldValue>,
        secrets: Array.isArray(row['secrets']) ? (row['secrets'] as unknown[]).map(String) : [],
        revisions: (row['revisions'] ?? {}) as Record<string, string>,
        version: Number(row['version']),
      }));
    },

    async test(body) {
      const { status, answer } = await call('POST', '/test', body, TEST_TIMEOUT_MS);
      if (status !== 200) throw failed(status, answer);
      // No checks is no test: never shown as one that passed nothing (AC-159).
      if (!Array.isArray(answer['checks']) || answer['checks'].length === 0)
        throw new XcubeError(status, undefined, 'xcube answered a test with no checks');
      return { ok: answer['ok'] === true, checks: answer['checks'] as TestAnswer['checks'] };
    },
  };
}

/** What the start's reconcile did, said in the API's log. */
export interface Reconciled {
  readonly put: readonly string[];
  readonly removed: readonly string[];
  /**
   * Connections xcube can't open a stored secret of, with its reason. Kept as
   * stored: xcube's 422 is also its answer for a key it lacks (research,
   * Gotcha 16), and wechart holds the only copy (T442's review).
   */
  readonly unopened: readonly string[];
  /** Those xcube refused otherwise, or couldn't be asked about, with why. */
  readonly failed: readonly string[];
}

/**
 * A data source's landing in one folder, made ready before the save's
 * transaction opens: it asks nothing more of the database (T442's review).
 */
export interface PreparedLanding {
  /**
   * Its connection put whole: created where `creating` (a new data source),
   * which xcube refuses while any data source holds its name in any case;
   * otherwise an edit of the version xcube holds under its name, or created
   * where it holds none, as after a rename (T701; research
   * `xcube-256d632371.md`, 2.5).
   */
  land(source: DataSource, landed: Landed, creating: boolean): Promise<void>;
  /** The connection of a name it leaves, on a rename. */
  unland(source: DataSource): Promise<void>;
}

const sameRecord = (a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]));
};

/** xcube's answer, as the reason a save or a removal is refused. */
function refusalOf(error: unknown, doing: 'saved' | 'removed', name?: string): unknown {
  if (error instanceof DataSourceRefused) return error;
  if (error instanceof ConnectionRefused) {
    if (error.code === 'in_use')
      return new DataSourceRefused(
        409,
        `Published cubes use this data source: ${error.problems.join(' ')}`,
        error.problems,
      );
    if (error.status === 422)
      return new DataSourceRefused(
        422,
        `xcube can’t open a secret: ${error.message}. Enter it again.`,
      );
    /**
     * T701 (AC-421, AC-424): the name is in use, and nothing more. xcube's
     * "in use as" names the holder's own spelling: not said either.
     */
    if (error.code === 'name_in_use') return new DataSourceRefused(409, nameInUse(name ?? ''));
    if (error.code === 'conflict')
      return new DataSourceRefused(
        409,
        'This data source changed in xcube meanwhile, so nothing was saved. Open it again, and save your change on what it is now.',
      );
    // The cubes xcube names may be in folders the saver can't see (AC-322):
    // none is said here.
    if (error.code === 'data_source_range')
      return new DataSourceRefused(
        409,
        'Cubes using this data source would be left outside its folder and its subfolders, so nothing was saved.',
      );
    // xcube's words name the root by its xcube id.
    if (error.code === 'default_outside_root') return new DataSourceRefused(400, DEFAULT_AT_ROOT);
    return new DataSourceRefused(error.status, error.problems.join(' '), error.problems);
  }
  // Another answer — a service key xcube won't take, say — is no outage (T442's review).
  if (error instanceof XcubeError)
    return new DataSourceRefused(502, `xcube refused it: ${error.message}`);
  return new DataSourceRefused(
    503,
    `xcube can’t be reached, so nothing was ${doing}. Try again once it is back.`,
  );
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function connectionSync({
  connections,
  folders,
  pushTree,
}: {
  readonly connections: XcubeConnections;
  /** The folders xcube's tree holds, by wechart's id, with their xcube ids. */
  readonly folders: () => Promise<PublishedFolders>;
  /** Puts xcube's tree, so a folder made a moment ago is in it (T452). */
  readonly pushTree?: () => Promise<unknown>;
}) {
  const bodyOf = (
    source: DataSource,
    xcubeId: string,
    landed: Landed,
    baseVersion: number | null,
  ): ConnectionBody => ({
    folderId: xcubeId,
    driver: source.driver,
    authMethod: source.authMethod,
    fields: source.fields,
    sealed: landed.sealed,
    revisions: landed.revisions,
    baseVersion,
  });
  /** The version xcube holds under exactly this name, or null where it holds none. */
  const heldVersion = async (name: string) =>
    (await connections.list()).find((held) => held.name === name)?.version ?? null;
  /**
   * A new one's: the version of what xcube still holds of exactly it, under
   * its name in its folder, left when wechart's store was emptied (a data
   * reset; xcube keeps the root's `default` its cubes use): landed over, as
   * the start's reconcile would (T708, AC-330). Anything else, or xcube not
   * answering the list, creates (`null`), which xcube refuses while another
   * holds the name.
   */
  const leftVersion = async (name: string, xcubeFolderId: string) =>
    (await connections.list().catch(() => [])).find(
      (held) => held.name === name && held.folderId === xcubeFolderId,
    )?.version ?? null;

  return {
    /**
     * Ready to land a data source of this folder: its xcube id, and xcube's
     * tree put, so a folder made a moment ago is there. A folder wechart
     * publishes no tree for — a workspace's, until slice 5 — is refused.
     */
    async prepare(folderId: string): Promise<PreparedLanding> {
      let xcubeId: string | undefined;
      try {
        xcubeId = (await folders()).ids.get(folderId);
        if (xcubeId !== undefined) await pushTree?.();
      } catch (error) {
        throw refusalOf(error, 'saved');
      }
      if (xcubeId === undefined)
        throw new DataSourceRefused(
          409,
          'This folder isn’t published to xcube, so its data sources can’t be used yet.',
        );
      const id = xcubeId;
      return {
        async land(source, landed, creating) {
          try {
            // By its own name in any folder (T701; research
            // `xcube-256d632371.md`, 1.1).
            const baseVersion = creating
              ? await leftVersion(source.name, id)
              : await heldVersion(source.name);
            await connections.put(source.name, bodyOf(source, id, landed, baseVersion));
          } catch (error) {
            throw refusalOf(error, 'saved', source.name);
          }
        },
        async unland(source) {
          await connections.remove(source.name).catch((error: unknown) => {
            throw refusalOf(error, 'saved');
          });
        },
      };
    },

    /** Its instances' reports, under its own name; none where it never landed (T365). */
    async healthOf(source: DataSource): Promise<ConnectionHealth | undefined> {
      const xcubeId = (await folders()).ids.get(source.folderId);
      return xcubeId === undefined ? undefined : connections.health(source.name);
    },

    /** Removes it from xcube, or refuses while published cubes use it. */
    async unland(source: DataSource): Promise<void> {
      try {
        const xcubeId = (await folders()).ids.get(source.folderId);
        // Never landed: nothing in xcube to remove.
        if (xcubeId === undefined) return;
        await connections.remove(source.name);
      } catch (error) {
        throw refusalOf(error, 'removed');
      }
    },

    /**
     * xcube's connections brought up to wechart's (AC-330): each one xcube
     * lacks or holds otherwise put, each one wechart doesn't have removed.
     */
    async reconcile(store: {
      all(): Promise<DataSource[]>;
      sealedOf(id: string): Promise<Landed>;
    }): Promise<Reconciled> {
      const [held, sources, published] = await Promise.all([
        connections.list(),
        store.all(),
        folders(),
      ]);
      const heldBy = new Map(held.map((connection) => [connection.name, connection]));
      const wanted = new Set<string>();
      const report = {
        put: [] as string[],
        removed: [] as string[],
        unopened: [] as string[],
        failed: [] as string[],
      };
      for (const source of sources) {
        const xcubeId = published.ids.get(source.folderId);
        // A workspace's, which xcube's tree doesn't hold until slice 5.
        if (xcubeId === undefined) continue;
        const name = source.name;
        wanted.add(name);
        const landed = await store.sealedOf(source.id);
        const was = heldBy.get(name);
        if (
          was !== undefined &&
          was.folderId === xcubeId &&
          was.driver === source.driver &&
          was.authMethod === source.authMethod &&
          sameRecord(was.fields, source.fields) &&
          sameRecord(was.revisions, landed.revisions)
        )
          continue;
        try {
          // Over the version xcube holds, moved to its folder where it isn't
          // there; created where xcube holds none (T701).
          await connections.put(name, bodyOf(source, xcubeId, landed, was?.version ?? null));
          report.put.push(name);
        } catch (error) {
          const said = `${name}: ${reasonOf(error)}`;
          if (error instanceof ConnectionRefused && error.status === 422)
            report.unopened.push(said);
          else report.failed.push(said);
        }
      }
      for (const connection of held) {
        if (wanted.has(connection.name)) continue;
        try {
          await connections.remove(connection.name);
          report.removed.push(connection.name);
        } catch (error) {
          report.failed.push(`${connection.name}: ${reasonOf(error)}`);
        }
      }
      return report;
    },
  };
}
