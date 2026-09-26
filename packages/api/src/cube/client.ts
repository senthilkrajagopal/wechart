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
  /**
   * The deployment's model in xcube (T421, AC-334): every token names it, and
   * the last revision xcube acknowledged, read as each request is signed, so
   * an answer comes from that revision or a newer one on any Cube instance
   * (research `xcube-slice-2.md`, "Token claims"). Absent, tokens name no
   * model and Cube answers from its mounted directory, as before the cut-over.
   */
  readonly model?: {
    readonly id: string;
    readonly revision: () => Promise<number | undefined>;
  };
  /** How long to wait before asking a catching-up instance again; its Retry-After, by default. */
  readonly catchUpDelayMs?: (retryAfterSeconds: number) => number;
}

/**
 * A Cube instance behind the revision a token names catches up for up to 10 s,
 * then answers one of these 503s with `Retry-After: 2` (research, "Serving"):
 * it is asked again, a few times, and the answer is the caller's.
 */
const CATCHING_UP =
  /is not active on this instance yet|is not loaded on this instance yet|has no revision that compiles on this instance yet/;
/**
 * Three asks: each can take xcube's 10 s of catching up, so the last answer
 * comes about 34 s in, inside a proxy's usual 60 s read timeout (T421's review).
 */
const CATCH_UP_ASKS = 3;

/** How long to wait before asking again: the instance's Retry-After, 5 s at most. */
export const catchUpDelayOf = (retryAfterSeconds: number): number =>
  Math.min(retryAfterSeconds, 5) * 1000;

/**
 * A failure reported by Cube. Carries Cube's own message so a tile can show it
 * (AC-012), and deliberately never carries the secret or the token.
 */
export class CubeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CubeError';
  }
}

/**
 * Cube not reached at all: the request or its answer lost on the way (T422,
 * AC-319). A 503, which the web app waits out, keeping what went wrong as its
 * `cause` for the log, since a bad address or certificate reads the same.
 */
export class CubeUnreachable extends CubeError {
  constructor(cause: unknown) {
    super('Cube could not be reached. Try again.', 503, { cause });
    this.name = 'CubeUnreachable';
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
  readonly #options: CubeClientOptions;
  readonly #catchUpDelayMs: (retryAfterSeconds: number) => number;

  constructor(options: CubeClientOptions) {
    this.#options = options;
    this.#apiUrl = options.apiUrl.replace(/\/$/, '');
    this.#apiSecret = options.apiSecret;
    this.#securityContext = options.securityContext;
    this.#ttl = options.tokenTtlSeconds ?? DEFAULT_TTL_SECONDS;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#catchUpDelayMs = options.catchUpDelayMs ?? catchUpDelayOf;
  }

  /**
   * This client for one signed-in user (T322, AC-008): the configured context
   * with the user's AD groups beside it, in place of any the configuration
   * names, so the model's access policies apply by group (infra/cube/cube.js,
   * `contextToGroups`; research/cube/access-control.md).
   */
  as(user: { readonly groups: readonly string[] }): CubeClient {
    return new CubeClient({
      ...this.#options,
      securityContext: { ...this.#securityContext, groups: [...user.groups] },
    });
  }

  /** `/v1/meta`: the cubes, views and members the model exposes. */
  async meta(): Promise<unknown> {
    return this.#request('/v1/meta', { method: 'GET' });
  }

  /**
   * `/v1/load`: run a query. `cache` is Cube's own per-request policy —
   * `no-cache` skips refresh key checks and asks the source (research/cube/
   * refresh-jobs-caching.md); left out, Cube's default.
   */
  async load(
    query: Record<string, unknown>,
    cache?: CachePolicy,
    /** A previewed security context, asked as in place of wechart's (T172). */
    preview?: Record<string, unknown>,
  ): Promise<unknown> {
    return this.#request(
      '/v1/load',
      {
        method: 'POST',
        body: JSON.stringify(cache === undefined ? { query } : { query, cache }),
        headers: { 'content-type': 'application/json' },
      },
      undefined,
      preview,
    );
  }

  /**
   * `/v1/sql`: the SQL Cube would run for a query, without running it — and
   * the pre-aggregations it would use (T150; research/cube/pre-aggregations.md
   * §4 and "Observed locally").
   */
  async sql(
    query: Record<string, unknown>,
    /** A previewed security context, asked as in place of wechart's (T174). */
    preview?: Record<string, unknown>,
  ): Promise<unknown> {
    return this.#request(
      `/v1/sql?query=${encodeURIComponent(JSON.stringify(query))}`,
      { method: 'GET' },
      undefined,
      preview,
    );
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
          // Cube builds for this context in place of the token's: it names
          // the model and its revision too (T421's review; research
          // `xcube-slice-2.md`, refresh contexts name the model).
          contexts: [
            { securityContext: { ...this.#securityContext, ...(await this.#modelClaims()) } },
          ],
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

  /**
   * The user's Cube fork's data-source introspection (T275, AC-250;
   * research/cube/introspection-api.md): its routes alone, each with a token of
   * its own that carries `wechartIntrospection: true` — the claim
   * `infra/cube/cube.js` grants the `introspection` scope for — and lives a
   * minute. The scope reads the warehouse's whole catalog, so no other token
   * wechart signs has it, and none reaches the browser. Answered as Cube
   * answers — status and body, refusals included — for the API to say in its
   * own words.
   */
  async introspect(
    path: string,
    init: { method?: string; body?: string } = {},
  ): Promise<{ status: number; body: unknown }> {
    if (!/^\/v1\/introspection\/data-sources(?:[/?]|$)/.test(path))
      throw new Error('Only Cube’s introspection routes are asked with an introspection token.');
    const { response, text } = await this.#send(path, async () => ({
      method: init.method ?? 'GET',
      headers: {
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        authorization: `Bearer ${this.#token({ wechartIntrospection: true }, undefined, INTROSPECTION_TTL_SECONDS, await this.#modelClaims())}`,
      },
      ...(init.body === undefined ? {} : { body: init.body }),
    }));
    return { status: response.status, body: text ? safeJson(text) : null };
  }

  /**
   * One request signed as wechart, answered as Cube answers it — its status
   * and body, refusals included — for the scope probes (T176), which read a
   * refusal's words rather than failing on it.
   */
  async ask(
    path: string,
    init: { method?: string; body?: string; headers?: Record<string, string> },
  ): Promise<{ status: number; body: unknown }> {
    const { response, text } = await this.#send(path, async () => ({
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${this.#token(undefined, undefined, this.#ttl, await this.#modelClaims())}`,
      },
      redirect: 'manual',
      // A hung Cube is not an answer: the probe reads it as unknown.
      signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
    }));
    return { status: response.status, body: text ? safeJson(text) : null };
  }

  async #request(
    path: string,
    init: RequestInit,
    context?: Record<string, unknown>,
    preview?: Record<string, unknown>,
  ): Promise<unknown> {
    const { response, text } = await this.#send(
      path,
      async () => ({
        ...init,
        headers: {
          ...init.headers,
          // AC-008: every request, not only the first.
          authorization: `Bearer ${this.#token(context, preview, this.#ttl, await this.#modelClaims())}`,
        },
      }),
      (failure) => {
        // A cancellation stays one: the caller asked for it.
        if ((failure as { name?: unknown } | null)?.name === 'AbortError') return;
        // Cube gone mid-request, or not there: Cube away, not wechart failing,
        // so the web app waits it out and asks again (T422, AC-319).
        throw new CubeUnreachable(failure);
      },
    );
    const parsed: unknown = text ? safeJson(text) : null;
    if (response.ok) return parsed;
    throw new CubeError(
      cubeMessage(parsed) ?? `Cube returned ${String(response.status)}`,
      response.status,
    );
  }

  /**
   * One request to Cube, signed afresh for each ask, and asked again while
   * the Cube instance answering catches up to the revision the token names
   * (T421, AC-334): its 503 is waited out, never the caller's. Every path —
   * a query, introspection, a probe — passes xcube's pin (T421's review).
   */
  async #send(
    path: string,
    initFor: () => Promise<RequestInit>,
    onFailure?: (failure: unknown) => void,
  ): Promise<{ response: Response; text: string }> {
    for (let ask = 1; ; ask += 1) {
      // Signed before asking: a token that can't be made is wechart's fault, not Cube away.
      const init = await initFor();
      let response: Response;
      let text: string;
      try {
        response = await this.#fetch(`${this.#apiUrl}${path}`, init);
        text = await response.text();
      } catch (failure) {
        onFailure?.(failure);
        throw failure;
      }
      const message = cubeMessage(text ? safeJson(text) : null) ?? '';
      if (response.status !== 503 || !CATCHING_UP.test(message) || ask >= CATCH_UP_ASKS)
        return { response, text };
      const after = Number(response.headers.get('retry-after') ?? '2');
      const wait = this.#catchUpDelayMs(Number.isFinite(after) ? after : 2);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  /** The model and its revision, for this request (T421). */
  async #modelClaims(): Promise<Record<string, unknown>> {
    const model = this.#options.model;
    if (model === undefined) return {};
    const revision = await model.revision();
    return {
      wechartModel: model.id,
      ...(revision !== undefined && revision > 0 ? { wechartRevision: revision } : {}),
    };
  }

  /**
   * A signed JWT whose payload is the security context. Built here rather than
   * with a JWT library: it is three base64url segments and an HMAC, and this
   * keeps the secret from travelling through another dependency.
   */
  #token(
    context?: Record<string, unknown>,
    preview?: Record<string, unknown>,
    ttl: number = this.#ttl,
    /** The model and its revision (T421), set last, so nothing names them for wechart. */
    model: Record<string, unknown> = {},
  ): string {
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      /**
       * A previewed context (T172) is asked as itself, in place of the
       * configured one — a configured claim it did not name would otherwise
       * apply unseen — keeping only what is wechart's alone: which model
       * Cube compiles (`wechart…`), set after it so it cannot be named.
       */
      ...(preview === undefined
        ? { ...this.#securityContext, ...context }
        : { ...previewClaimsOf(preview), ...wechartClaimsOf(this.#securityContext) }),
      ...model,
      iat: issuedAt,
      exp: issuedAt + ttl,
    };

    const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
    const signature = createHmac('sha256', this.#apiSecret).update(unsigned).digest('base64url');

    return `${unsigned}.${signature}`;
  }
}

/** An introspection token's life: one request's, and no more (T275, AC-250). */
const INTROSPECTION_TTL_SECONDS = 60;

/** How long `ask` waits: long enough for a busy Cube, short enough that a hung one reads unknown. */
const ASK_TIMEOUT_MS = 5000;

/**
 * The claims that say whether a token is valid — when, by whom, for whom —
 * which are wechart's to set, never a previewed context's.
 */
const TOKEN_CLAIMS = new Set(['iat', 'exp', 'nbf', 'iss', 'aud']);

/** wechart's own claims: which model Cube compiles, and from which revision (T421). */
const isWechartClaim = (key: string) => key.startsWith('wechart');

/**
 * A previewed security context's claims (T172, AC-166): an object's, less
 * wechart's own and the token's. Null when it is not an object.
 */
export function previewClaimsOf(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key]) => !isWechartClaim(key) && !TOKEN_CLAIMS.has(key),
    ),
  );
}

function wechartClaimsOf(context: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(context).filter(([key]) => isWechartClaim(key)));
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
