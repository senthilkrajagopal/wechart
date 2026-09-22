import { createHmac } from 'node:crypto';

/**
 * The only place in wechart that holds the Cube API secret (AC-007), and the
 * only place that talks to Cube (AC-008).
 *
 * Cube authenticates a request by a JWT in the Authorization header, and reads
 * the token's payload as the security context. Phase 1 is single-user, so that
 * context is configuration rather than per-request identity (requirements.md
 * §4); the shape stays per-request so phase 2 can supply a real one without
 * changing the call sites.
 */

export interface CubeClientOptions {
  readonly apiUrl: string;
  readonly apiSecret: string;
  readonly securityContext: Record<string, unknown>;
  /** Seconds a minted token stays valid. */
  readonly tokenTtlSeconds?: number;
  readonly fetchImpl?: typeof fetch;
}

/**
 * A failure reported by Cube. Carries Cube's own message so a tile can show it
 * (AC-012), and deliberately never carries the secret or the token.
 */
export class CubeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CubeError';
  }
}

const DEFAULT_TTL_SECONDS = 60 * 5;

/** The values of `/v1/load`'s `cache` (research/cube/refresh-jobs-caching.md). */
export const CACHE_POLICIES = [
  'stale-if-slow',
  'stale-while-revalidate',
  'must-revalidate',
  'no-cache',
] as const;
export type CachePolicy = (typeof CACHE_POLICIES)[number];

export class CubeClient {
  readonly #apiUrl: string;
  readonly #apiSecret: string;
  readonly #securityContext: Record<string, unknown>;
  readonly #ttl: number;
  readonly #fetch: typeof fetch;

  constructor(options: CubeClientOptions) {
    this.#apiUrl = options.apiUrl.replace(/\/$/, '');
    this.#apiSecret = options.apiSecret;
    this.#securityContext = options.securityContext;
    this.#ttl = options.tokenTtlSeconds ?? DEFAULT_TTL_SECONDS;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  /**
   * `/v1/meta`: the cubes, views and members the model exposes. `context`
   * adds claims for this one request — a draft to compile (T142).
   */
  async meta(context?: Record<string, unknown>): Promise<unknown> {
    return this.#request('/v1/meta', { method: 'GET' }, context);
  }

  /**
   * `/v1/load`: run a query. `cache` is Cube's own per-request policy —
   * `no-cache` skips refresh key checks and asks the source (research/cube/
   * refresh-jobs-caching.md); left out, Cube's default.
   */
  async load(query: Record<string, unknown>, cache?: CachePolicy): Promise<unknown> {
    return this.#request('/v1/load', {
      method: 'POST',
      body: JSON.stringify(cache === undefined ? { query } : { query, cache }),
      headers: { 'content-type': 'application/json' },
    });
  }

  /**
   * `/v1/sql`: the SQL Cube would run for a query, without running it — and
   * the pre-aggregations it would use (T150; research/cube/pre-aggregations.md
   * §4 and "Observed locally").
   */
  async sql(query: Record<string, unknown>): Promise<unknown> {
    return this.#request(`/v1/sql?query=${encodeURIComponent(JSON.stringify(query))}`, {
      method: 'GET',
    });
  }

  /** `/v1/dry-run`: the query as Cube's matcher sees it (its transformed query). */
  async dryRun(query: Record<string, unknown>): Promise<unknown> {
    return this.#request(`/v1/dry-run?query=${encodeURIComponent(JSON.stringify(query))}`, {
      method: 'GET',
    });
  }

  /**
   * `POST /v1/pre-aggregations/jobs`, `action: post`: build these
   * pre-aggregations, for the context wechart's own requests carry — so the
   * build is of the model Cube answers wechart from — in UTC, the zone the
   * refresh worker builds in by default. One token per partition built
   * (T155; research/cube/refresh-jobs-caching.md §B).
   */
  async buildPreAggregations(ids: readonly string[]): Promise<unknown> {
    return this.#request('/v1/pre-aggregations/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'post',
        selector: {
          contexts: [{ securityContext: this.#securityContext }],
          timezones: ['UTC'],
          preAggregations: ids,
        },
      }),
    });
  }

  /** `POST /v1/pre-aggregations/jobs`, `action: get`: each token's state. */
  async jobStatuses(tokens: readonly string[]): Promise<unknown> {
    return this.#request('/v1/pre-aggregations/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'get', tokens }),
    });
  }

  /** `/v1/meta?extended=true`: the model as compiled, its pre-aggregations included. */
  async metaExtended(): Promise<unknown> {
    return this.#request('/v1/meta?extended=true', { method: 'GET' });
  }

  /**
   * `DELETE /v1/running-query/{requestId}`: stop a query Cube is still running
   * (AC-011). Without this a superseded query holds one of the queue's two
   * default slots until its orphan timeout.
   */
  async cancel(requestId: string): Promise<unknown> {
    return this.#request(`/v1/running-query/${encodeURIComponent(requestId)}`, {
      method: 'DELETE',
    });
  }

  async #request(
    path: string,
    init: RequestInit,
    context?: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await this.#fetch(`${this.#apiUrl}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        // AC-008: every request, not only the first.
        authorization: `Bearer ${this.#token(context)}`,
      },
    });

    const text = await response.text();
    const parsed: unknown = text ? safeJson(text) : null;

    if (!response.ok) {
      throw new CubeError(
        cubeMessage(parsed) ?? `Cube returned ${String(response.status)}`,
        response.status,
      );
    }

    return parsed;
  }

  /**
   * A signed JWT whose payload is the security context. Built here rather than
   * with a JWT library: it is three base64url segments and an HMAC, and this
   * keeps the secret from travelling through another dependency.
   */
  #token(context?: Record<string, unknown>): string {
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      ...this.#securityContext,
      ...context,
      iat: issuedAt,
      exp: issuedAt + this.#ttl,
    };

    const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
    const signature = createHmac('sha256', this.#apiSecret).update(unsigned).digest('base64url');

    return `${unsigned}.${signature}`;
  }
}

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Cube reports failures as `{ "error": "..." }`. */
function cubeMessage(parsed: unknown): string | null {
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    const error = (parsed as { error: unknown }).error;
    if (typeof error === 'string') return error;
  }
  return null;
}
