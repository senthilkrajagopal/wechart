import { createHmac } from 'node:crypto';

import type { QuerySigner } from './signing';

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
  /**
   * The service credential's token (T420, AC-326, AC-250; `service-token.ts`):
   * what wechart's own calls carry — the jobs API, introspection, and the
   * whole model's field list from xcube — in place of any token it signs
   * here. Absent, those calls are signed here as before slice 4.
   */
  readonly service?: () => Promise<string>;
  /**
   * The query signer (T437, AC-326; `signing.ts`), once its key is pushed to
   * xcube: every query token is then RS256 under it, carrying only the groups,
   * the model and the revision. Until it gives one, tokens are HS256 as before
   * slice 4, which a model with no keys still takes.
   */
  readonly signer?: () => QuerySigner | undefined;
}

/**
 * The groups some access policy or folder's allowed set names (T437; AC-008,
 * AC-326; `named-groups.ts`), read as each token is signed.
 */
export type NamedGroups = () => Promise<ReadonlySet<string>>;

/**
 * A Cube instance behind the revision a token names catches up for up to 10 s,
 * then answers one of these 503s with `Retry-After: 2` (research, "Serving"):
 * it is asked again, a few times, and the answer is the caller's. So is a
 * request pinned to a data source's settings since changed, once the old
 * revision's grace is over, which answers with no Retry-After (T501; research
 * xcube-bc18f82c01.md, Gotcha 1), and one on an instance that has heard of
 * new settings but not yet switched to them, a 503 from xcube dabd7bde6e on
 * (Gotcha 2; `to-wechart/2026-09-28-0400-bc18f82c01-follow-ups.md`).
 */
const CATCHING_UP =
  /is not active on this instance yet|is not loaded on this instance yet|has no revision that compiles on this instance yet|connection settings this request was pinned to changed|changed to new settings on this instance|Cube is busy compiling; try again|is no longer compiled here; try again/;
/**
 * And an overlay's (T347; research `xcube-slice-5.md`, "Querying a preview"):
 * its first query waits for the compile lane, `503` "Cube is busy compiling;
 * try again", and one pinned to a version retired mid-request answers `503`
 * "…no longer compiled here; try again" — never the published model in its
 * place (`xcube-overlay-data-sources.md`, Gotcha 16). Both are in the pattern
 * above. One gone (expired or dropped) answers `410`: pushed again once, then
 * asked again (Gotcha 3, "Expiry").
 */
const OVERLAY_GONE = 410;
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
  /** A signed-in user's groups, when this client asks as one (`as`). */
  #userGroups: readonly string[] | undefined;
  /** The groups their tokens may carry, when `as` was given them. */
  #named: NamedGroups | undefined;
  /**
   * The overlay its queries' tokens name (`inOverlay`), how it is pushed
   * again once gone, and the version it must be answered from at least.
   */
  #overlay:
    | {
        readonly id: string;
        readonly pushAgain?: () => Promise<unknown>;
        readonly atLeast?: number;
      }
    | undefined;

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
   * names, so the model's access policies and xcube's folder gate apply by
   * group (xcube's `contextToGroups`; research xcube-slice-4.md, "cube.js").
   * Given `named`, each token carries only those of their groups it names
   * (T437, AC-008).
   */
  as(user: { readonly groups: readonly string[] }, named?: NamedGroups): CubeClient {
    const client = new CubeClient({
      ...this.#options,
      securityContext: { ...this.#securityContext, groups: [...user.groups] },
    });
    client.#userGroups = [...user.groups];
    client.#named = named;
    return client;
  }

  /**
   * This client with its queries answered from an overlay (T347, AC-323;
   * research `xcube-slice-5.md`, "Query tokens"): every query token names it
   * in `wechartOverlay`, set last, so no preview's context can name one, and
   * no call of wechart's own carries it. Asked for a workspace's owner, or a
   * proposal's allowed reviewers (T440), and for no one else. `pushAgain` is
   * called once a request finds it gone, and the request asked again. Given
   * `atLeast`, the version this server last pushed, an answer from an older
   * one — an instance not yet told of the push — is asked again, and then
   * refused (research `xcube-slice-5.md`, Gotcha 17).
   */
  inOverlay(id: string, pushAgain?: () => Promise<unknown>, atLeast?: number): CubeClient {
    const client = new CubeClient({ ...this.#options, securityContext: this.#securityContext });
    client.#userGroups = this.#userGroups;
    client.#named = this.#named;
    client.#overlay = {
      id,
      ...(pushAgain === undefined ? {} : { pushAgain }),
      ...(atLeast === undefined ? {} : { atLeast }),
    };
    return client;
  }

  /** Whether an answer came from an older version of its overlay than it must. */
  #fromOlderOverlay(response: Response): boolean {
    const atLeast = this.#overlay?.atLeast;
    if (atLeast === undefined || !response.ok) return false;
    const version = /@(\d+)$/.exec(response.headers.get('x-xcube-overlay') ?? '')?.[1];
    return version !== undefined && Number(version) < atLeast;
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
   *
   * Given a `requestId`, it is the post's `x-request-id`: Cube keeps it as
   * the job's request id (research cube/job-records.md, finding 4), and
   * xcube's queue gives it back on each entry the post made (T372; research
   * xcube-jobs-schedules-routes.md, Gotcha 3).
   */
  async buildPreAggregations(
    ids: readonly string[],
    { requestId }: { readonly requestId?: string } = {},
  ): Promise<unknown> {
    return this.#serviceRequest('/v1/pre-aggregations/jobs', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(requestId === undefined ? {} : { 'x-request-id': requestId }),
      },
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
    return this.#serviceRequest('/v1/pre-aggregations/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'get', tokens }),
    });
  }

  /**
   * `/v1/meta?extended=true`: the model as compiled, its pre-aggregations
   * included, from the revision last recorded or a newer one (T421, AC-334),
   * as this client's token sees it: under xcube's folder gate, only the
   * folders its groups reach. The acceleration panel reads it as its user.
   * wechart's own reads of the whole model (Jobs, Schedules, a publish) are
   * `modelMeta`'s (T436).
   */
  async metaExtended(): Promise<unknown> {
    return this.#request('/v1/meta?extended=true', { method: 'GET' });
  }

  /**
   * The whole model's field list, as `metaExtended` shapes it, for wechart's
   * own reads: Jobs', Schedules' and a publish's (T436, AC-320, AC-334).
   * Under xcube's folder gate a token sees only the folders its groups
   * reach, so it is xcube's own `GET …/meta?extended=true`, unfiltered, with
   * the service credential, from the revision last recorded or a newer one
   * (research xcube-meta-revision-and-bindings.md, "GET …/meta"). A 503 while
   * an instance catches up is waited out as a query's is. Without xcube,
   * Cube's own, as before.
   */
  async modelMeta({ hidden = false }: { readonly hidden?: boolean } = {}): Promise<unknown> {
    const { service, model } = this.#options;
    if (service === undefined || model === undefined) return this.metaExtended();
    const revision = await model.revision();
    // No revision recorded yet: none asked, which xcube refuses as 0 (Gotcha 1).
    const at = revision !== undefined && revision > 0 ? `&revision=${String(revision)}` : '';
    // Cubes marked `public: false` too, where asked (T376's review; research
    // xcube-jobs-schedules-routes.md §2): what the model holds, not what it shows.
    const all = hidden ? '&hidden=true' : '';
    return this.#answer(
      `/v1/semantic/models/${encodeURIComponent(model.id)}/meta?extended=true${at}${all}`,
      { method: 'GET' },
      service,
    );
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
   * research/cube/introspection-api.md): its routes alone, with the service
   * credential, the only credential xcube grants `introspection` (T420; research
   * xcube-slice-4.md, "Scopes by role"). The scope reads the warehouse's whole
   * catalog, so no query token wechart signs has it, and none reaches the
   * browser. Answered as Cube answers — status and body, refusals included —
   * for the API to say in its own words.
   *
   * Without a service credential (no xcube configured) it still signs T275's
   * minute-long token with `wechartIntrospection: true`, which cube.js no
   * longer grants anything for since T437: Cube refuses it as a missing scope,
   * and the API says so.
   */
  async introspect(
    path: string,
    init: { method?: string; body?: string } = {},
  ): Promise<{ status: number; body: unknown }> {
    if (!/^\/v1\/introspection\/data-sources(?:[/?]|$)/.test(path))
      throw new Error('Only Cube’s introspection routes are asked with an introspection token.');
    // The service credential, which xcube grants `introspection` (T420); else
    // T275's minute-long token, which no scope is granted for any more (T437).
    const service = this.#options.service;
    const { response, text } = await this.#send(path, async () => ({
      method: init.method ?? 'GET',
      headers: {
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        authorization: `Bearer ${
          service === undefined
            ? await this.#token(
                { wechartIntrospection: true },
                undefined,
                INTROSPECTION_TTL_SECONDS,
                await this.#modelClaims(),
              )
            : await service()
        }`,
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
    /** With the service credential, where there is one (T437): as wechart builds. */
    asService = false,
  ): Promise<{ status: number; body: unknown }> {
    const service = asService ? this.#options.service : undefined;
    const { response, text } = await this.#send(path, async () => ({
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${
          service === undefined
            ? await this.#token(undefined, undefined, this.#ttl, await this.#modelClaims())
            : await service()
        }`,
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
    // AC-008: every request, not only the first. Its overlay too, beside the
    // model, set last (T347).
    const overlay = this.#overlay === undefined ? {} : { wechartOverlay: this.#overlay.id };
    return this.#answer(
      path,
      init,
      async () =>
        this.#token(context, preview, this.#ttl, { ...(await this.#modelClaims()), ...overlay }),
      this.#overlay !== undefined,
    );
  }

  /**
   * A call of wechart's own (T420, AC-326): with the service credential where
   * there is one, else signed as any other request.
   */
  async #serviceRequest(path: string, init: RequestInit): Promise<unknown> {
    const service = this.#options.service;
    return service === undefined ? this.#request(path, init) : this.#answer(path, init, service);
  }

  /** One request, carrying the token `bearer` gives for each ask, and Cube's answer read. */
  async #answer(
    path: string,
    init: RequestInit,
    bearer: () => Promise<string>,
    /** Its token names an overlay, so the answer must say it came from one (T347). */
    fromOverlay = false,
  ): Promise<unknown> {
    const { response, text } = await this.#send(
      path,
      async () => ({
        ...init,
        headers: { ...init.headers, authorization: `Bearer ${await bearer()}` },
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
    // An instance from before overlays ignores the claim and answers from the
    // published model (research xcube-slice-5.md, Gotcha 2): never passed on
    // as the preview's (AC-323).
    if (response.ok && fromOverlay && response.headers.get('x-xcube-overlay') === null)
      throw new CubeError(
        'Cube answered this preview without the changes it previews, so it isn’t shown. Try again.',
        503,
      );
    // Still an older version after asking again (T347).
    if (fromOverlay && this.#fromOlderOverlay(response))
      throw new CubeError(
        'Cube hasn’t caught up with the latest changes this previews yet, so it isn’t shown. Try again.',
        503,
      );
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
    let pushedAgain = false;
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
      // Its overlay gone, expired or dropped: pushed again once, and asked again (T347).
      const pushAgain = this.#overlay?.pushAgain;
      if (response.status === OVERLAY_GONE && pushAgain !== undefined && !pushedAgain) {
        pushedAgain = true;
        await pushAgain();
        continue;
      }
      // An instance answering an older version of the overlay catches up as one
      // behind the revision does: asked again (T347).
      const lagging = this.#fromOlderOverlay(response);
      if (lagging && ask < CATCH_UP_ASKS) {
        await new Promise((resolve) => setTimeout(resolve, this.#catchUpDelayMs(2)));
        continue;
      }
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
  async #token(
    context?: Record<string, unknown>,
    preview?: Record<string, unknown>,
    ttl: number = this.#ttl,
    /** The model and its revision (T421), set last, so nothing names them for wechart. */
    model: Record<string, unknown> = {},
  ): Promise<string> {
    /**
     * A signed-in user's own context carries only their groups that some
     * policy or folder names (T437, AC-008). A preview carries exactly the
     * groups chosen for it (AC-166), and the configured context its own.
     */
    const named =
      preview === undefined && this.#userGroups !== undefined ? await this.#named?.() : undefined;
    const own = {
      ...this.#securityContext,
      ...context,
      ...(named === undefined
        ? {}
        : { groups: (this.#userGroups ?? []).filter((group) => named.has(group)) }),
    };
    /**
     * RS256 under the pushed key (T437, AC-326): the groups, from a preview
     * (T172, AC-166) or the user's context, and the model and revision,
     * nothing else. xcube reads no other claim, and wechart sends none.
     */
    const signer = this.#options.signer?.();
    if (signer !== undefined) {
      const source = preview ?? own;
      const groups = Array.isArray(source['groups'])
        ? (source['groups'] as unknown[]).filter(
            (group): group is string => typeof group === 'string',
          )
        : [];
      return signer.sign(
        {
          groups,
          ...(typeof model['wechartModel'] === 'string'
            ? { wechartModel: model['wechartModel'] }
            : {}),
          ...(typeof model['wechartRevision'] === 'number'
            ? { wechartRevision: model['wechartRevision'] }
            : {}),
          // Only where this client was asked for one (T347, AC-323).
          ...(typeof model['wechartOverlay'] === 'string'
            ? { wechartOverlay: model['wechartOverlay'] }
            : {}),
        },
        ttl,
      );
    }
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload: Record<string, unknown> = {
      /**
       * A previewed context (T172) is asked as itself, in place of the
       * configured one — a configured claim it did not name would otherwise
       * apply unseen — keeping only what is wechart's alone: which model
       * Cube compiles (`wechart…`), set after it so it cannot be named.
       */
      ...(preview === undefined
        ? own
        : { ...previewClaimsOf(preview), ...wechartClaimsOf(this.#securityContext) }),
      ...model,
      iat: issuedAt,
      exp: issuedAt + ttl,
    };
    // An overlay only where this client was asked for one (T347, AC-323):
    // never one the configured context names, nor xcube's own claim's.
    if (typeof model['wechartOverlay'] !== 'string') delete payload['wechartOverlay'];
    delete payload['xcubeOverlay'];

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
 * wechart's own, xcube's own — a module to serve from, a service role, which
 * xcube honours in a context (T438; research xcube-slice-3b.md, Gotcha 4) —
 * and the token's. Null when it is not an object.
 */
export function previewClaimsOf(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key]) => !isWechartClaim(key) && !key.startsWith('xcube') && !TOKEN_CLAIMS.has(key),
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
