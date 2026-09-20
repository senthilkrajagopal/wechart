---
library: TanStack Query (React) — wechart's React data-fetching layer
packages: [@tanstack/react-query, @tanstack/react-query-devtools]
version: 5.103.1
researched: 2026-09-19
sources: [https://registry.npmjs.org/@tanstack/react-query/latest, https://tanstack.com/query/latest/docs/framework/react/guides/query-keys, https://github.com/TanStack/query/blob/main/docs/framework/react/guides/query-cancellation.md, https://github.com/TanStack/query/blob/main/packages/query-core/src/query.ts, https://github.com/TanStack/query/blob/main/packages/query-core/src/queryClient.ts, https://github.com/TanStack/query/blob/main/packages/query-core/src/utils.ts, https://github.com/TanStack/query/blob/main/packages/query-core/src/types.ts, https://swr.vercel.app/docs/api, https://github.com/vercel/swr/blob/main/src/index/use-swr.ts, https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-react/src/hooks/cube-query.ts]
---

# TanStack Query 5.103.1 (React data-fetching layer)

## Summary

wechart tiles call wechart's own API, which proxies Cube's REST `/v1/load` ([data-apis]). The client layer must: hold a long-poll open (AC-010), abort a superseded request **and** fire `DELETE /v1/running-query/{requestId}` (AC-011), keep an unmarked base result cached while a marked query reloads (AC-104), produce a byte-stable key so the same marking re-uses the cache (AC-105), and update 10 tiles within 3 s p95 (AC-175).

**Recommendation: `@tanstack/react-query` 5.103.1.** It is the only candidate of the three that (a) gives the query function an `AbortSignal` and aborts it when a query loses its last observer ([src-query]) or when a refetch supersedes an in-flight fetch ([src-qc]), which is what AC-011 needs, and (b) caches each query key independently with an explicit `gcTime`, so the base result survives marking changes (AC-104) ([caching]). SWR 2.5.1 never creates an `AbortController` at all ([swr-usesw]); `@cubejs-client/react`'s `useCubeQuery` is unusable here because it talks to a `CubeApi` instance, not to wechart's API, and it also never aborts ([cube-react]). Detail in _Alternatives considered_.

## Install

```bash
pnpm add @tanstack/react-query@5.103.1
pnpm add -D @tanstack/react-query-devtools@5.103.1
```

- `@tanstack/react-query@5.103.1`, MIT, single dependency `@tanstack/query-core@5.103.1`, peer `react: "^18 || ^19"` ([npm-rq]). `latest` on npm is 5.103.1; there is no published v6 for React (dist-tags: alpha/beta/rc are all 5.0.0-* pre-releases) ([tags-rq]).
- `"type": "module"` with dual `exports` (`import` → `build/modern/index.js`, `require` → `.cjs`) plus a `build/legacy` fallback ([npm-rq]). No CJS-interop work is needed under Vite.
- Devtools 5.103.1, MIT, peers `react ^18 || ^19`, `@types/react ^18 || ^19`, `@tanstack/react-query ^5.103.1` ([npm-rqdt]).
- Bundle: 50,626 B minified / 13,760 B gzip, 1 dependency ([bp-rq]).

## Init / auth pattern

One `QueryClient` per app, created outside render; wechart's API is called with `fetch` so the `signal` flows straight through.

```tsx
// packages/web/src/query/client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000, // default 0 => every mount refetches ([src-types])
      gcTime: 5 * 60_000, // default 5 min ([src-types])
      retry: false, // default 3 + exponential backoff ([defaults])
      refetchOnWindowFocus: false, // default true ([src-types])
    },
  },
});
```

```tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
// <QueryClientProvider client={queryClient}>{children}<ReactQueryDevtools /></QueryClientProvider>
```

Auth is wechart's own session cookie / bearer header inside the fetch wrapper; the library has no auth surface of its own.

## API surface we will use

### 1. Query keys, hashing, structural sharing (AC-105)

- "Query keys are hashed deterministically! This means that no matter the order of keys in objects, all of the following queries are considered equal" ([keys]). The default hasher sorts **plain-object** keys only:
  ```ts
  export function hashKey(queryKey) {
    return JSON.stringify(queryKey, (_, val) =>
      isPlainObject(val)
        ? Object.keys(val)
            .sort()
            .reduce((r, k) => {
              r[k] = val[k];
              return r;
            }, {})
        : val,
    );
  }
  ```
  ([src-utils]). `hashQueryKeyByOptions` lets a per-query `queryKeyHashFn` replace it ([src-utils]); the option is documented as "If specified, this function is used to hash the `queryKey` to a string" ([src-types]).
- **Array item order matters**: "The following query keys, however, are not equal. Array item order matters!" ([keys]). Cube `filters`, `measures`, `dimensions`, `segments` and marking tuples are all arrays, so `hashKey` will _not_ canonicalise them. AC-105 therefore has to be met by wechart's own canonicaliser (sort + de-duplicate tuples and values, per [markings] Q1/Gotcha 13) **before** the query object becomes both the query key and the request body. Use one function for both, so the cache key and the Cube SQL cannot drift apart.
- Suggested key shape: `['tile', tileId, canonicalCubeQuery] as const` for the base query and `['tile', tileId, canonicalCubeQuery, { marking: canonicalMarking }] as const` for the marked query — distinct keys, so both are cached independently (AC-104).
- **Structural sharing** runs on results by default: "React Query uses a technique called 'structural sharing' to ensure that as many references as possible will be kept intact between re-renders"; "This optimization only works if the `queryFn` returns JSON compatible data"; disable with `structuralSharing: false` or supply a function ([render-opt], [src-types]). The implementation is `replaceEqualDeep`, which returns the old object when deeply equal and otherwise copies only the changed children, with a 500-level depth guard ([src-utils]). This keeps ECharts `setOption` from seeing a new array identity when a poll returns identical data.

### 2. Cancellation (AC-011)

- "TanStack Query provides each query function with an `AbortSignal` instance"; "When a query becomes out-of-date or inactive, this `signal` will become aborted"; "By default, queries that unmount or become unused before their promises are resolved are _not_ cancelled" — unless "you consume the `AbortSignal`", in which case "the Promise will be cancelled" ([cancel]).
- The mechanism is explicit in source. Reading `context.signal` sets `#abortSignalConsumed`; when the last observer goes away the in-flight retryer is cancelled, and the retryer's `onCancel` calls `abortController.abort()`:
  ```ts
  if (!this.observers.length) {
    if (this.#retryer) {
      if (
        this.#abortSignalConsumed ||
        (this.state.fetchStatus === 'paused' && this.state.status === 'pending')
      )
        this.#retryer.cancel({ revert: true });
      else this.#retryer.cancelRetry();
    }
    this.scheduleGc();
  }
  ```
  ([src-query]). So changing a tile's filters/marks changes its key, the old key loses its only observer, and its fetch aborts.
- Manual: "you just need to call `queryClient.cancelQueries({ queryKey })`" ([cancel]); it defaults to `{ revert: true, ...cancelOptions }` ([src-qc]). `refetchQueries` defaults to `cancelRefetch: true` ([src-qc]), and `Query.fetch` then calls `this.cancel({ silent: true })` before starting the new fetch ([src-query]) — so "Refresh now" aborts the previous load of the same tile.
- **Side effect on cancel** (`DELETE /v1/running-query/{requestId}`, [data-apis] §4): attach a listener inside the query function. The docs use exactly this pattern for pre-0.22 axios: `signal?.addEventListener('abort', () => { source.cancel(...) })` ([cancel]).

```ts
type Ctx = { signal: AbortSignal; queryKey: readonly unknown[] };
export async function loadTile({ signal }: Ctx, body: CanonicalQuery): Promise<TileResult> {
  const requestId = `${crypto.randomUUID()}-span-0`; // x-request-id form per [data-apis]
  signal.addEventListener(
    'abort',
    () => {
      void fetch(`/api/running-query/${requestId}`, { method: 'DELETE', keepalive: true }); // AC-011
    },
    { once: true },
  );
  // AC-010: wechart's API relays Cube's 200 + {"error":"Continue wait"}; keep the query fetching.
  for (;;) {
    const res = await fetch('/api/load', {
      method: 'POST',
      signal,
      headers: { 'x-request-id': requestId, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`load failed: ${res.status}`);
    const json = await res.json();
    if (json.error === 'Continue wait') continue; // same request id span semantics as [data-apis]
    return json;
  }
}
```

The loop keeps one `useQuery` in `fetchStatus: 'fetching'` for the whole long poll, which is what AC-010 asks for; `signal` is aborted between iterations by any of the paths above, so the loop exits at the `fetch` call. **UNVERIFIED:** whether `keepalive: true` is needed — untested against wechart's API, which does not exist yet.

### 3. Keeping previous data while a dependent query reloads (AC-104)

- `placeholderData: keepPreviousData` — "The data from the last successful fetch is available while new data is being requested, even though the query key has changed"; `isPlaceholderData` flags it ([paginated]).
- Caveat: placeholder data is "not persisted to the cache" ([placeholder]). That is fine here, because AC-104's "keep the unmarked result cached" is satisfied by the **base query being its own cache entry** with its own `gcTime`, not by placeholder data ([caching]).
- So: base tile query = plain `useQuery` (unchanged key across marking changes → served from cache, no refetch while `staleTime` holds); marked tile query = `useQuery({ placeholderData: keepPreviousData })`, so the previous marked overlay stays on screen while the new one loads.

### 4. Deduplication, parallelism, retries, bounded concurrency (AC-175)

- Dedup: one `Query` object per hashed key; an in-flight fetch is shared — `else if (this.#retryer) { this.#retryer.continueRetry(); return this.#retryer.promise }` ([src-query]). Two tiles with an identical canonical query issue one HTTP request. Docs confirm the cache-hit half: "Since the cache already has data for the `['todos']` key from the first query, that data is immediately returned from the cache" ([caching]).
- Parallelism: side-by-side `useQuery` calls "will execute in parallel"; for a variable number of tiles use `useQueries({ queries: [...] })`, which "returns an array of query results" ([parallel]).
- Retry defaults: failed queries "are **silently retried 3 times, with exponential backoff delay**" ([defaults]); `retryDelay` "Defaults to a function that applies exponential backoff, capped at 30 seconds" ([src-types]). Set `retry: false` (or retry only on 5xx/network) so a Cube `UserError` 400 — e.g. `Can't find join path` for a non-applicable marking ([markings] Q4.4) — surfaces immediately instead of after ~7 s of backoff, which would blow AC-175.
- **There is no concurrency cap in the library.** No such option exists in the documented `QueryOptions`/`QueryObserverOptions` surface ([src-types]) and there is no guide for it ([guides-dir]); HTTP itself only says "A client ought to limit the number of simultaneous open connections… Previous revisions of HTTP gave a specific number of connections as a ceiling, but this was found to be impractical" ([rfc9112]). Bound it in the fetch wrapper (a semaphore around the `fetch` call inside `loadTile`), not in the query layer. This matters because Cube's own queue concurrency defaults to **2**, so 20 simultaneous tile loads mostly translate into `Continue wait` ([markings] Q7, Install table).
- `networkMode` defaults to `'online'` ([src-types]) — offline tiles land in `fetchStatus: 'paused'` rather than erroring.

### 5. Invalidation: model change, and "Refresh now" for one tile

- `invalidateQueries` marks matching queries stale — "This stale state overrides any `staleTime` configurations" — and refetches those currently rendered ([invalidation]). Matching is **prefix** by default; `exact: true` narrows it; `predicate` is "used as a final filter on all matching queries" ([filters], [invalidation]).
- Source semantics: `invalidateQueries` invalidates all matches then delegates to `refetchQueries` with `type: filters?.refetchType ?? filters?.type ?? 'active'`; `refetchType: 'none'` skips the refetch ([src-qc]).
- **Model change** → `queryClient.invalidateQueries({ queryKey: ['tile'] })`, or `removeQueries` if the cached shape is no longer valid (it deletes entries outright, no options beyond filters) ([src-qc]). Put the model/schema version into the key prefix so a change cannot serve a stale entry at all.
- **Refresh now for one tile** → `refetch()` from that `useQuery`, or `queryClient.refetchQueries({ queryKey: ['tile', tileId] })`; `cancelRefetch` defaults to `true`, so the in-flight load is cancelled first ([src-qc]) and our `DELETE /v1/running-query` fires. Force Cube past its cache by also setting `cache: 'must-revalidate'` in the request body ([data-apis]).

### 6. Devtools, SSR, licence, maintenance

- `@tanstack/react-query-devtools@5.103.1` renders the cache, each key's state and lets you trigger refetch/invalidate; MIT; peers React 18/19 ([npm-rqdt]).
- SSR is irrelevant to wechart (Vite SPA). Note only that `gcTime` "Defaults to `5 * 60 * 1000` (5 minutes), or `Infinity` during SSR" ([src-types]) — the SSR branch never applies.
- Licence MIT ([npm-rq]). Maintenance: releases on 2026-09-16 and a v6 pre-release line on 2026-09-17 ([rq-rel]); React's `latest` is still 5.103.1 ([tags-rq]).

## Gotchas

1. **Array order is not canonicalised by the hasher.** Only plain-object keys are sorted ([src-utils], [keys]). AC-105 depends on wechart's canonicaliser, and the same canonical object must be both key and request body.
2. **Non-plain objects in keys are hashed by `JSON.stringify` semantics.** `isPlainObject` is false for `Map`/`Set`/class instances, so they fall through to `JSON.stringify`'s default and collide ([src-utils]). Keep query keys to strings, numbers, booleans, null, plain objects and arrays.
3. **Structural sharing requires JSON-compatible data** ([render-opt]). Cube 1.7.0+ returns numerics as JSON strings ([data-apis]), so this holds — but if wechart casts to `Date`/`BigInt` before returning from `queryFn`, disable `structuralSharing` for that query or cast in a `select`.
4. **Abort only happens if you read `signal`.** `#abortSignalConsumed` is set by the getter ([src-query]); a `queryFn` that ignores `signal` silently defeats AC-011.
5. **Cancellation does not work with the Suspense hooks** — "`useSuspenseQuery`, `useSuspenseQueries` and `useSuspenseInfiniteQuery`" ([cancel]). Do not use them for tiles.
6. **Defaults are wrong for a BI grid**: `staleTime: 0` ([src-types]) plus `refetchOnWindowFocus: true` ([src-types]) means every alt-tab re-fires every tile against a queue of concurrency 2 ([markings] Q7). Override both, as in _Init_.
7. **`placeholderData` is not cached** ([placeholder]); don't treat it as the base-result cache for AC-104.
8. **`invalidateQueries` is prefix-matching** ([invalidation]) — `['tile']` hits every tile. Use `exact`/`predicate` for a single tile.
9. **`gcTime` is 5 minutes** ([src-types]); a base result whose tile unmounts (tab switch) can be collected, so a marking change after that re-queries Cube. Raise `gcTime` for base tile queries if AC-104/AC-175 need it.

## Alternatives considered

### SWR 2.5.1 (MIT, peers `react ^16.11 || ^17 || ^18 || ^19`, deps `dequal`, `use-sync-external-store`; 12,921 B min / 5,711 B gzip) ([npm-swr], [bp-swr])

Actively maintained: 2.5.1 published 2026-08-12, most recent `main` commit 2026-09-14 ([swr-rel], [swr-commits]).

- **Keys**: "Since SWR 1.1.0, object-like keys will be serialized under the hood automatically" ([swr-args]). `stableHash` sorts plain-object keys (`OBJECT.keys(arg).sort()`) but, like TanStack, preserves array order ([swr-hash]). Same conclusion for AC-105: canonicalise upstream.
- **Disqualifying for AC-011**: SWR creates no `AbortController` and passes no signal — the fetcher is invoked as `currentFetcher(fnArg)` ([swr-usesw]), and the option list documents the fetcher as `fetcher(args)` with no signal ([swr-api]). Superseded requests are only _ignored_: the `FETCH[key][1] !== startAt` check fires `onDiscarded(key)` and returns ([swr-usesw]) — the HTTP request and the Cube queue slot are left running, which is exactly the failure AC-011 forbids.
- **AC-104 is met** (`keepPreviousData = false`: "return the previous key's data until the new data has been loaded", [swr-api]; `laggyDataRef` in [swr-usesw]).
- Dedup is time-windowed, not in-flight-scoped: `dedupingInterval = 2000` "dedupe requests with the same key in this time span" ([swr-api], [swr-cfg]).
- Retries are **unbounded by default**: `errorRetryCount` is absent from `defaultConfig`, and `onErrorRetry` only stops when `!isUndefined(maxRetryCount) && currentRetryCount > maxRetryCount` ([swr-cfg]).
- Invalidation is `mutate(key, data?, options?)`, including a filter function over cache keys with `{ revalidate: true }` ([swr-mut]) — adequate for both invalidation ACs.
- Render optimisation is a whole-value `compare` — "comparison function used to detect when returned data has changed, to avoid spurious rerenders" ([swr-api]), defaulting to `dequal/lite` ([swr-cfg]) — not sub-tree reference preservation like `replaceEqualDeep`.
- No devtools ship with the package; its `exports` are only `index`, `infinite`, `mutation`, `immutable`, `subscription`, `_internal` ([npm-swr]).

### `@cubejs-client/react` 1.7.42 `useCubeQuery`

It adds nothing once queries go through wechart's own API, and subtracts the cancellation we need.

- It is bound to a `CubeApi` instance (`cubeApi` option / `CubeProvider`) and issues `cubeApi.load`/`subscribe` against Cube's REST or WS endpoint directly ([cube-react], [data-apis] §13). Routing through wechart's API means bypassing it entirely.
- **Mutex**: it passes `{ mutexObj: mutexRef.current, mutexKey: 'query' }` ([cube-react]). In core, a superseded load only discovers this at its next checkpoint — `checkMutex` throws `MUTEX_ERROR = 'Mutex has been changed'` when `mutexObj[mutexKey] !== mutexValue`, and that check runs inside the `Continue wait` branch ([cube-core]). So the browser request is never aborted ([cube-react]: "No AbortSignal is created or utilized"), and the Cube-side query lingers until `orphanedTimeout` (120 s) ([markings] Q7). That fails AC-011.
- **`resetResultSetOnChange`** (default true) clears `resultSet` to `null` before each fetch; `false` keeps the previous result on screen ([cube-react]) — the same job as `placeholderData: keepPreviousData`, but per-hook only, with no shared cache, no dedup across tiles, and no invalidation API. A `requestIdRef` guard discards stale responses ([cube-react]) — again ignoring, not cancelling.
- Nothing in it caches the base result across marking changes (no cache at all), so AC-104 would have to be rebuilt by hand.
- Keep `@cubejs-client/core` for what it is genuinely good at and which is orthogonal to fetching: `ResultSet` pivoting, `drillDown`, `Meta`, and `@cubejs-client/core/format` ([data-apis] §12).

## Open questions / unverified

- UNVERIFIED: the exact publish date of `@tanstack/react-query@5.103.1`. Dated evidence is the 2026-09-16 release group on the releases page, which lists 5.103.1 ([rq-rel]); I did not fetch the npm packument `time` field (WebSearch budget for this session was exhausted).
- UNVERIFIED: React 19 StrictMode behaviour of either library under wechart's tile lifecycle. Peer ranges include 19 ([npm-rq], [npm-swr]), but that is a declaration, not a test. Cover double-mount + abort with wechart's own tests.
- UNVERIFIED: whether `fetch(..., { keepalive: true })` is required for the `DELETE /v1/running-query` fired from the `abort` listener to survive a tab close; untested.
- UNVERIFIED (product): the concurrency bound for a marking burst. AC-175's 3 s p95 interacts with Cube's default queue concurrency of 2 ([markings] Q7); the right client-side semaphore size and debounce window need measurement against the docker-compose stack, and the Cube-side `concurrency` may need raising. Ask the user before choosing numbers.
- Not researched: persistence of the query cache across reloads (`@tanstack/query-persist-client-core`), and `@tanstack/react-query`'s `experimental_streamedQuery`. Neither is required by the quoted ACs.

[npm-rq]: https://registry.npmjs.org/@tanstack/react-query/latest
[npm-rqdt]: https://registry.npmjs.org/@tanstack/react-query-devtools/latest
[npm-swr]: https://registry.npmjs.org/swr/latest
[tags-rq]: https://registry.npmjs.org/-/package/@tanstack/react-query/dist-tags
[bp-rq]: https://bundlephobia.com/api/size?package=@tanstack/react-query@5.103.1
[bp-swr]: https://bundlephobia.com/api/size?package=swr@2.5.1
[keys]: https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
[render-opt]: https://tanstack.com/query/latest/docs/framework/react/guides/render-optimizations
[cancel]: https://github.com/TanStack/query/blob/main/docs/framework/react/guides/query-cancellation.md
[defaults]: https://github.com/TanStack/query/blob/main/docs/framework/react/guides/important-defaults.md
[paginated]: https://github.com/TanStack/query/blob/main/docs/framework/react/guides/paginated-queries.md
[placeholder]: https://github.com/TanStack/query/blob/main/docs/framework/react/guides/placeholder-query-data.md
[caching]: https://github.com/TanStack/query/blob/main/docs/framework/react/guides/caching.md
[parallel]: https://github.com/TanStack/query/blob/main/docs/framework/react/guides/parallel-queries.md
[filters]: https://github.com/TanStack/query/blob/main/docs/framework/react/guides/filters.md
[invalidation]: https://github.com/TanStack/query/blob/main/docs/framework/react/guides/query-invalidation.md
[guides-dir]: https://github.com/TanStack/query/tree/main/docs/framework/react/guides
[src-utils]: https://github.com/TanStack/query/blob/main/packages/query-core/src/utils.ts
[src-query]: https://github.com/TanStack/query/blob/main/packages/query-core/src/query.ts
[src-qc]: https://github.com/TanStack/query/blob/main/packages/query-core/src/queryClient.ts
[src-types]: https://github.com/TanStack/query/blob/main/packages/query-core/src/types.ts
[rq-rel]: https://github.com/TanStack/query/releases
[swr-api]: https://swr.vercel.app/docs/api
[swr-args]: https://swr.vercel.app/docs/arguments
[swr-mut]: https://swr.vercel.app/docs/mutation
[swr-hash]: https://github.com/vercel/swr/blob/main/src/_internal/utils/hash.ts
[swr-usesw]: https://github.com/vercel/swr/blob/main/src/index/use-swr.ts
[swr-cfg]: https://github.com/vercel/swr/blob/main/src/_internal/utils/config.ts
[swr-rel]: https://github.com/vercel/swr/releases/tag/v2.5.1
[swr-commits]: https://github.com/vercel/swr/commits/main
[cube-react]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-react/src/hooks/cube-query.ts
[cube-core]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/index.ts
[rfc9112]: https://www.rfc-editor.org/rfc/rfc9112.html#section-9.4
[data-apis]: ./cube/data-apis.md
[markings]: ./cube/markings-query-support.md
