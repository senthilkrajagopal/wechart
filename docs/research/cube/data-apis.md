---
library: Cube data APIs (REST, GraphQL, SQL, MDX, DAX, WebSocket) and the Cube JavaScript SDK
packages: [@cubejs-client/core, @cubejs-client/core/format, @cubejs-client/react, @cubejs-client/ws-transport]
version: 1.7.42
researched: 2026-09-19
sources: [https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx, https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/index.mdx, https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/query-format.mdx, https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/queries.mdx, https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/graphql-api/index.mdx, https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/graphql-api/reference.mdx, https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/index.mdx, https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/query-format.mdx, https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/reference.mdx, https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/joins.mdx, https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/security.mdx, https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/mdx-api.mdx, https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/dax-api/index.mdx, https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/xirr.mdx, https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/javascript-sdk/reference/cubejs-client-core.mdx, https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/javascript-sdk/reference/cubejs-client-react.mdx, https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/javascript-sdk/reference/cubejs-client-ws-transport.mdx, https://github.com/cube-js/cube/tree/v1.7.42/docs-mintlify/recipes/core-data-api, https://github.com/cube-js/cube/tree/v1.7.42/packages/cubejs-client-core/src, https://github.com/cube-js/cube/tree/v1.7.42/packages/cubejs-client-react/src, https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-ws-transport/src/index.ts, https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts, https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/query.js, https://registry.npmjs.org/@cubejs-client/core/latest, https://registry.npmjs.org/@cubejs-client/react/latest, https://registry.npmjs.org/@cubejs-client/ws-transport/latest]
---

# Cube data APIs and JavaScript SDK 1.7.42

## Summary

Cube exposes its semantic layer through several data APIs. The REST (JSON) API, GraphQL API, SQL API (Postgres wire protocol plus HTTP) and WebSocket transport are part of Cube Core. The MDX and DAX APIs are Cube Cloud Enterprise-plan features ([rest-index], [gql-index], [sql-index], [mdx], [dax]). The JavaScript SDK (`@cubejs-client/core`, `@cubejs-client/react`, `@cubejs-client/ws-transport`) wraps the REST and WebSocket transports. It also provides client-side pivoting (`ResultSet`), metadata helpers (`Meta`), and value formatting (`@cubejs-client/core/format`) ([sdk-core-ref]).

There are no spec AC or feature IDs yet (`docs/spec.md` does not exist). This doc maps to the sections of `docs/inputs/2026-09-19-product-direction.md`:

- **§1, full Cube capability scope.** See the capability inventory below.
- **§2, authoring.** Charts, global filters, cross-filters, drill-down and trellis all run through the query format, filters, `drillDown` and pivot.
- **§3, chart recommender.** It uses member types from `/v1/meta` and cardinality from queries.

Key conclusions:

- **Use REST `/v1/load` for every chart.** It is the only API that supports all query types wechart needs: compare date range, total, ungrouped and segments. GraphQL has no compare-date-range queries, segments or metadata queries ([gql-index]). The SQL API has no compare-date-range or total queries except through a hand-written `UNION` ([queries]).
- **Store the chart's Cube query as the REST query JSON.** The server validates that shape with a strict Joi schema ([src-gw-query]). `/v1/dry-run` returns the normalized form without executing the query ([src-gw]).
- **`/v1/meta` gives the recommender its input.** Each member has a `type` (`time | number | string | boolean` in the client types). The response also carries `aggType`, `drillMembers`, `primaryKey`, `suggestFilterValues`, formats, custom `granularities`, `hierarchies`, `folders`, and `connectedComponent`, which describes the join graph ([rest-ref], [src-core-types]).
- **All three SDK packages are published at 1.7.42** ([npm-core], [npm-react], [npm-ws]). The React peer range is `react >=16.10.2` ([npm-react]). I found no API usage in `@cubejs-client/react` that React 19 removed (details below).
- **Breaking changes in 1.7.0 that affect wechart:**
  - The `renewQuery` parameter was removed; use `cache: 'must-revalidate'` instead.
  - All numeric values in results are now serialized as JSON strings.
  - The default `continueWaitTimeout` changed from 5 s to 10 s.

  Source: [chg-root].

## Install

```bash
pnpm add @cubejs-client/core@1.7.42 @cubejs-client/react@1.7.42
# only if WebSocket real-time is adopted:
pnpm add @cubejs-client/ws-transport@1.7.42
```

| Package                       | Version | Module format                                                                                                             | Deps / peers                                                                                                                                                                       | Source                         |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `@cubejs-client/core`         | 1.7.42  | `"type": "module"`. `exports` has `.` and `./format`, each with `types`/`import`/`require`. `engines.node >=20.0.0`. MIT. | uuid ^11.1.1, dayjs ^1.10.4, ramda ^0.27.2, core-js ^3.34.0, d3-format ^3.1.0, d3-time-format ^4.1.0, url-search-params-polyfill ^7.0.0. No peers.                                 | [npm-core], [unpkg-core-pkg]   |
| `@cubejs-client/react`        | 1.7.42  | `main` is CJS, `module` is ESM, `types` is `dist/index.d.ts`. No `exports` field. MIT.                                    | Depends on `@cubejs-client/core` **exactly** `1.7.42`, plus ramda, core-js, @babel/runtime. Peer: `react >=16.10.2`. devDeps pin react/react-dom ^18.3.1 and @types/react ^18.3.0. | [npm-react], [unpkg-react-pkg] |
| `@cubejs-client/ws-transport` | 1.7.42  | CJS only (`main: dist/cubejs-client-ws-transport.cjs.js`, `typings: dist/index.d.ts`). MIT.                               | `@cubejs-client/core` 1.7.42, `isomorphic-ws` ^4.0.1, `ws` ^7.5.3.                                                                                                                 | [npm-ws], [unpkg-ws-pkg]       |

Notes:

- **Pin core and react to the same version.** `@cubejs-client/react` pins core to an exact version ([npm-react]).
- **Vite handles the CJS-only packages.** Vite converts CommonJS dependencies to ESM during pre-bundling. A linked package in a monorepo that isn't ESM must be added to `optimizeDeps.include` ([vite-prebundle]).
- **`isomorphic-ws` maps to native `WebSocket` in browsers** through its `browser` field (`browser.js`) ([unpkg-isows]).
- **Server side (docker-compose):**
  - The WebSocket server starts only when `CUBEJS_WEB_SOCKETS=true` (default `false`) ([env], [src-server]).
  - The SQL API listens only when `CUBEJS_PG_SQL_PORT` is set ([sql-index], [env]).

## Init / auth pattern

**Authentication:**

- REST, GraphQL and WebSocket authenticate with a JWT sent in the `Authorization` header ([rest-index], [ctx]).
- The security context is the JWT payload, which must be an object ([ctx]). Per the docs, "Your authentication server issues JWTs to your client application" ([ctx]).
- In the development environment a token is not required ([rest-index]).
- `apiToken` may be an async function. The SDK calls it before each request (and before each subscription poll) and updates the transport only when the token changes ([src-core-index]).

HTTP (default) client for Vite + React 19. The token endpoint shown is illustrative only; wechart's token-minting design is not decided.

```ts
// packages/web/src/cube/client.ts
import cube from '@cubejs-client/core';
import type { CubeApi } from '@cubejs-client/core';

async function getCubeToken(): Promise<string> {
  const res = await fetch('/api/cube-token', { credentials: 'include' }); // illustrative
  if (!res.ok) throw new Error(`cube token request failed: ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

// Typed default export: (apiToken: string | (() => Promise<string>), options: CubeApiOptions) => CubeApi
export const cubeApi: CubeApi = cube(getCubeToken, {
  apiUrl: import.meta.env.VITE_CUBE_API_URL, // e.g. http://localhost:4000/cubejs-api/v1
});
```

```tsx
import { CubeProvider } from '@cubejs-client/react';
import { cubeApi } from './cube/client';

export function App({ children }: { children: React.ReactNode }) {
  return (
    <CubeProvider cubeApi={cubeApi} options={{ castNumerics: false }}>
      {children}
    </CubeProvider>
  );
}
```

- **Default dev `apiUrl`** is `http://localhost:4000/cubejs-api/v1`. The base path is `/cubejs-api` and can be changed with `basePath`. `/livez` and `/readyz` are not under the base path ([sdk-core-ref], [rest-index]).
- **Typing of the default export.** The published typing is `(apiToken, options) => CubeApi` with both arguments required, and `CubeApiOptions.apiUrl` is non-optional ([unpkg-core-dts]). So the docs example `cube({ transport })` ([rest-index]) fails a strict TypeScript typecheck. At runtime the `CubeApi` constructor accepts `(options)` alone and needs only `transport` or `apiUrl` ([src-core-index]). Under strict TS, pass both arguments and an `apiUrl`.

WebSocket variant:

```ts
import cube from '@cubejs-client/core';
import WebSocketTransport from '@cubejs-client/ws-transport';

export const cubeWsApi = cube(getCubeToken, {
  apiUrl: import.meta.env.VITE_CUBE_API_URL, // required by the type even with a transport
  transport: new WebSocketTransport({ apiUrl: import.meta.env.VITE_CUBE_WS_URL }), // e.g. ws://localhost:4000/
});
```

`WebSocketTransportOptions` is `{ authorization?: string; apiUrl: string; heartBeatInterval?: number; hearBeatInterval?: number /* deprecated */ }`. `apiUrl` is passed straight to `new WebSocket(apiUrl)`. Setting `authorization` to a new token closes the socket, and the transport reconnects ([src-ws]).

## API surface we will use

### 1. REST endpoints at v1.7.42

The base path defaults to `/cubejs-api` ([rest-index]). In the table, "Undocumented" means the route is registered in `gateway.ts` ([src-gw]) but absent from the REST reference ([rest-ref]).

| Endpoint                                                                      | Methods                          | API scope                       | Purpose                                                                                                                                                                                                                     | Status                                                         |
| ----------------------------------------------------------------------------- | -------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `/v1/load`                                                                    | GET, POST                        | `data`                          | Run query or queries. Params: `query` (object or array), `queryType=multi`, `cache`, `responseFormat`. Headers: `Authorization`, optional `x-request-id`.                                                                   | Documented ([rest-ref], [rest-index])                          |
| `/v1/subscribe`                                                               | GET, POST                        | `data`                          | Same handler as load. The SDK's HTTP `subscribe` calls it.                                                                                                                                                                  | Undocumented ([src-gw], [src-core-index])                      |
| `/v1/sql`                                                                     | GET (docs); POST also registered | `sql`                           | Returns generated SQL. Params: `query`, `format=rest\|sql`, `disable_post_processing`. Response: `sql: [sql, params]`, `dataSource`, and for SQL input `status` and `query_type` (`regular\|post_processing\|pushdown`).    | Documented ([rest-ref], [src-gw])                              |
| `/v1/dry-run`                                                                 | GET, POST                        | `data`                          | Validates and normalizes without executing. Returns `{queryType, normalizedQueries, pivotQuery, queryOrder, transformedQueries}`.                                                                                           | Only the SDK `dryRun` is documented ([src-gw], [sdk-core-ref]) |
| `/v1/convert-query`                                                           | POST                             | UNVERIFIED                      | Converts SQL API to REST: body `{input:'sql', output:'rest', query}`, returns `{status, query \| error}`. Fails for post-processing or multi-query SQL.                                                                     | Documented ([rest-ref])                                        |
| `/v1/meta`                                                                    | GET                              | `meta`                          | Cubes and views metadata; `public: false` members are omitted. Query params `onlyViews=true` and `extended` exist in source.                                                                                                | Documented; params only in source ([rest-ref], [src-gw])       |
| `/v1/cubesql`                                                                 | POST                             | `data`                          | Runs SQL API queries over HTTP. Body `{query, timezone?, cache?}`. Streams NDJSON: first `schema` (plus optional `lastRefreshTime`, `usedPreAggregations`), then `data` chunks sized by `CUBESQL_CUBE_SCAN_MAX_BATCH_ROWS`. | Documented ([rest-ref], [rest-index])                          |
| `/v1/running-query/{requestId}`                                               | DELETE                           | UNVERIFIED                      | Cancels in-flight queries whose request ID matches; returns `{result: [...]}`.                                                                                                                                              | Documented ([rest-ref])                                        |
| `/v1/pre-aggregations/jobs`                                                   | POST                             | `jobs` (not granted by default) | Trigger or poll pre-aggregation builds. Out of scope here; see the pre-aggregations/jobs research doc.                                                                                                                      | Documented ([rest-ref], [rest-index])                          |
| `/v1/pre-aggregations/can-use`                                                | POST                             | `meta`                          | Checks whether a pre-aggregation can serve a transformed query.                                                                                                                                                             | Undocumented ([src-gw])                                        |
| `/v1/graphql-to-json`                                                         | POST                             | none seen                       | Converts GraphQL to a JSON query.                                                                                                                                                                                           | Undocumented ([src-gw])                                        |
| `/graphql`                                                                    | (graphqlHTTP)                    | `graphql`                       | GraphQL API.                                                                                                                                                                                                                | Documented ([gql-index])                                       |
| `/v2`                                                                         | proxy                            | none seen                       | Proxies to the native gateway when the `nativeApiGateway` env var is set.                                                                                                                                                   | Undocumented ([src-gw])                                        |
| `/cubejs-system/v1/*`                                                         | GET/POST                         | n/a                             | Pre-aggregation system endpoints (context, partitions, preview, build, queue, cancel).                                                                                                                                      | Undocumented ([src-gw]); pre-aggregations research doc         |
| `/readyz`, `/livez`                                                           | GET                              | none                            | 200 `{"health":"HEALTH"}` or 500 `{"health":"DOWN"}`. Readiness checks the default data source; liveness checks existing connections.                                                                                       | Documented ([rest-ref])                                        |
| `/v1/data-sources`, `/v1/entities`, `/v1/entities/{name}`, `/v1/entities/all` | GET/POST                         | Bearer                          | Metadata API: "Metadata API is only available in Cube Cloud."                                                                                                                                                               | Cloud-only ([rest-ref])                                        |

**API scopes** ([rest-index], [env]):

| Scope     | Endpoints                   | Granted by default |
| --------- | --------------------------- | ------------------ |
| `meta`    | `/v1/meta`, Metadata API    | Yes                |
| `data`    | `/v1/load`, `/v1/cubesql`   | Yes                |
| `graphql` | `/graphql`                  | Yes                |
| `sql`     | `/v1/sql`                   | Yes                |
| `jobs`    | `/v1/pre-aggregations/jobs` | No                 |
| (none)    | `/livez`, `/readyz`         | Always accessible  |

Configure scopes with `CUBEJS_DEFAULT_API_SCOPES` (default `meta,data,graphql,sql`) or per request with `contextToApiScopes`.

**CORS:** all origins (`*`) are allowed by default; restrict with the `http.cors` option ([rest-index]).

### 2. Query format (`/v1/load`, `/v1/subscribe`, `/v1/sql`, `/v1/dry-run`)

These are the keys the server accepts. The Joi `querySchema` allows exactly `measures, dimensions, filters, timeDimensions, order, segments, timezone, limit, offset, total, cacheMode, cache, ungrouped, responseFormat, subqueryJoins, joinHints, maskedMembers`. Validation passes no `allowUnknown` option, and failures raise `Invalid query format: …` ([src-gw-query]). Joi `object.keys()` "Sets or extends the allowed object keys" ([joi-api]). Any other key, such as `renewQuery`, is therefore rejected.

| Property              | Type / rules                                                                             | Notes                                                                                                                                                       | Source                           |
| --------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `measures`            | `string[]` (`cube.member`)                                                               |                                                                                                                                                             | [rest-qf]                        |
| `dimensions`          | `string[]`                                                                               | A time dimension may carry a granularity suffix, e.g. `stories.time.week`.                                                                                  | [rest-qf]                        |
| `timeDimensions`      | `{dimension, granularity?, dateRange?, compareDateRange?}[]`                             | `dateRange` and `compareDateRange` are mutually exclusive (`oxor`). `granularity` is a string of at most 128 characters.                                    | [rest-qf], [src-gw-query]        |
| `filters`             | `(BinaryFilter \| UnaryFilter \| {and: Filter[]} \| {or: Filter[]})[]`                   | See the operator table below.                                                                                                                               | [rest-qf], [src-core-types]      |
| `segments`            | `string[]`                                                                               | Named filters from the model.                                                                                                                               | [rest-qf]                        |
| `order`               | `{ [member]: 'asc'\|'desc' }` or `[member, 'asc'\|'desc'][]`                             | Default ordering (below). `{}` means no ordering. Time members may include a granularity, e.g. `orders.created_at.month`.                                   | [rest-qf], [src-gw-query]        |
| `limit`               | integer ≥ 0                                                                              | Default `CUBEJS_DB_QUERY_DEFAULT_LIMIT` (10000). Must not exceed `CUBEJS_DB_QUERY_LIMIT` (50000), or the server throws `The query limit has been exceeded.` | [queries], [env], [src-gw-query] |
| `offset`              | integer ≥ 0                                                                              | Default 0.                                                                                                                                                  | [rest-qf]                        |
| `total`               | boolean                                                                                  | "Cube will run a total query and return the total number of rows as if no row limit or offset are set". Default false.                                      | [rest-qf]                        |
| `timezone`            | IANA TZ name                                                                             | Default `CUBEJS_DEFAULT_TIMEZONE` (`UTC`).                                                                                                                  | [rest-qf], [env]                 |
| `ungrouped`           | boolean                                                                                  | No `GROUP BY`. Requires the primary keys of all cubes unless `allow_ungrouped_without_primary_key`. Measures render unaggregated.                           | [queries]                        |
| `joinHints`           | `[cubeA, cubeB][]`                                                                       | Query-time join hints.                                                                                                                                      | [rest-qf]                        |
| `responseFormat`      | `default \| compact \| columnar`                                                         | Can also be passed as a `/v1/load` parameter.                                                                                                               | [rest-ref], [src-gw-query]       |
| `cache` / `cacheMode` | `stale-if-slow` (default) \| `stale-while-revalidate` \| `must-revalidate` \| `no-cache` | Replaces the removed `renewQuery`.                                                                                                                          | [rest-index], [chg-root]         |
| `renewQuery`          | **removed in 1.7.0**                                                                     | "Use the `cache` parameter instead: `cache: 'must-revalidate'` replaces `renewQuery: true`."                                                                | [chg-root]                       |

Meaning of each `cache` value ([rest-index]):

- **`stale-if-slow`:** returns the cached value while refresh keys are current. If they have expired, tries a fresh value but returns stale data if the source is slow.
- **`stale-while-revalidate`:** returns stale data and refreshes in the background.
- **`must-revalidate`:** always waits for fresh data once the cache has expired.
- **`no-cache`:** skips refresh-key checks and always fetches fresh data.

**Default ordering** ([rest-qf]):

1. The first time dimension that has a granularity, ascending.
2. If there is none, the first measure, descending.
3. If there is no measure, the first dimension, ascending.

**Time dimensions** ([rest-qf], [dimensions], [src-core-time]):

- **Granularity:**
  - Predefined values are `second, minute, hour, day, week, month, quarter, year`.
  - Custom granularities are declared in the model with `interval`, `offset?`, `origin?` and `title?`, and appear in meta as `granularities: {name, title}[]`.
  - Leaving out the granularity filters without grouping.
  - **The values that come back (observed against the running Cube v1.7.42, local docker-compose, 2026-09-21, T206).** `orders.count` was asked with `timeDimensions: [{dimension: 'orders.ordered_at', granularity: g}]` for each predefined `g`, with no `timezone` (so `UTC`). Each row carries the bucket's start twice, under `orders.ordered_at.<g>` and under `orders.ordered_at`, as `YYYY-MM-DDTHH:mm:ss.SSS` with **no offset**, in the query's timezone:
    - `year` gives `2026-01-01T00:00:00.000`.
    - `quarter` gives `2026-01-01…`, then `2026-04-01…`.
    - `month` gives `2026-01-01…`, then `2026-02-01…`.
    - `week` gives `2025-12-29…`, then `2026-01-05…`. Weeks start on **Monday**, so a week can start in the previous year.
    - `day` gives `2026-01-02T00:00:00.000`.
    - `hour`, `minute` and `second` give the same shape, at the bucket's start.
    - The response `annotation.timeDimensions['orders.ordered_at.<g>'].granularity` is `{name, title, interval}` (for example `{name: 'week', title: 'week', interval: '1 week'}`). The bare `orders.ordered_at` entry has no `granularity`.
- **`dateRange`:**
  - An absolute range is `[start, end]` in `YYYY-MM-DD` form, padded to the start and end of the day, or `YYYY-MM-DDTHH:mm:ss.SSS` form, local to the query timezone.
  - A relative range is a string such as `today`, `last 6 months`, `from 7 days ago to now` or `from now to 2 weeks from now`, parsed by Chrono.
  - **Observed against the running Cube v1.7.42 (local docker-compose, 2026-09-21, T082)** — each sent as `timeDimensions[].dateRange` on `orders.ordered_at`, and each answered with the range Cube resolved it to (`query.timeDimensions[0].dateRange` in the response), on a Monday, 2026-09-21: `today` → that day; `yesterday` → the day before; `last 7 days` → 09-14 to 09-20 and `last 30 days` → 08-22 to 09-20 (both **end yesterday**, excluding today); `this week` → 09-21 to 09-27 (weeks start Monday); `this month`, `last month`, `this quarter`, `last quarter`, `this year`, `last year` → the calendar period; `last 12 months` → 2025-09-01 to 2026-08-31 (whole months, **ending last month**). Cube 1.7 parses these natively (no JavaScript date parser was found in the image), so this observation, not the Chrono docs, is the source for the presets wechart offers.
- **`compareDateRange`:** two or more ranges, each in `dateRange` format. The server throws `compareDateRange can only exist for one timeDimension` if more than one time dimension uses it ([src-gw]).

**Filter operators** (documented in [rest-qf]; the client type is `BinaryOperator`/`UnaryOperator` in [src-core-types]):

| Operator                                                                            | Member types                                 | `values`                                                                                                    |
| ----------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `equals`, `notEquals`                                                               | measures; string, number and time dimensions | string[], multiple allowed                                                                                  |
| `contains`, `notContains`, `startsWith`, `notStartsWith`, `endsWith`, `notEndsWith` | string dimensions                            | string[]. Matching is a case-insensitive `LIKE`. `notContains` adds `IS NULL` unless `null` is in `values`. |
| `gt`, `gte`, `lt`, `lte`                                                            | measures; number dimensions                  | one string value                                                                                            |
| `set`, `notSet`                                                                     | measures; number, string and time dimensions | none                                                                                                        |
| `inDateRange`, `notInDateRange`                                                     | time                                         | two timestamps, or one relative string                                                                      |
| `beforeDate`, `beforeOrOnDate`, `afterDate`, `afterOrOnDate`                        | time                                         | one timestamp or relative string                                                                            |
| `measureFilter`                                                                     | measures                                     | none. Applies the measure's own filters; used by drill-down.                                                |

The server additionally accepts `in`, `notIn` and `onTheDate` ([src-gw-query]). These are not documented and are absent from the client `BinaryOperator` type ([src-core-types]).

**Logical operators** `{or: [...]}` and `{and: [...]}` can nest ([rest-qf]). Rules:

- "You can not put dimensions and measures filters in the same logical operator." Dimension filters become `WHERE`, measure filters become `HAVING` ([rest-qf]).
- A date predicate inside a logical group is scoped to that group. By contrast, `timeDimensions.dateRange` "is always emitted as a global `AND`… and also drives granularity and pre-aggregation matching". An `inDateRange` filter "is applied as a generic filter. All pre-aggregation granularity matching rules aren't applied" ([rest-qf]).

### 3. `/v1/load` response shape

- **Without `queryType=multi`:** a single `LoadResponseResult`.
- **With `queryType=multi`:** `{ queryType: 'regularQuery'|'compareDateRangeQuery'|'blendingQuery', results: LoadResponseResult[], pivotQuery, slowQuery? }`.

A compare-date-range or blending query sent without `multi` throws `'<queryType>' query type is not supported by the client. Please update the client.` ([src-gw]). The SDK always sends `queryType: 'multi'` ([src-core-index]).

```ts
// packages/cubejs-client-core/src/types.ts @ v1.7.42
export type LoadResponseResult<T> = {
  annotation: QueryAnnotations;
  lastRefreshTime: string;
  query: Query;
  data: T[];
  external: boolean | null;
  dbType: string;
  extDbType: string;
  requestId?: string;
  usedPreAggregations?: Record<string, UsedPreAggregation>;
  transformedQuery?: TransformedQuery;
  total?: number;
};
export type QueryAnnotations = {
  dimensions: Record<string, Annotation>;
  measures: Record<string, Annotation>;
  timeDimensions: Record<string, Annotation>;
  segments: Record<string, Annotation>;
};
export type Annotation = {
  title: string;
  shortTitle: string;
  type: string;
  meta?: any;
  format?: DimensionFormat | MeasureFormat;
  formatDescription?: FormatDescription;
  currency?: string;
  drillMembers?: any[];
  drillMembersGrouped?: any;
  granularity?: GranularityAnnotation;
};
export type UsedPreAggregation = {
  preAggregationId?: string;
  targetTableName?: string;
  lastUpdatedAt?: number;
  type: 'rollup' | 'rollupJoin' | 'rollupLambda' | 'originalSql';
};
```

Source: [src-core-types].

- **Values are JSON strings.** Numeric primitives (Int64, UInt64, Float64) are serialized as strings ([src-rust-transform]). As of 1.7.0, "All numeric values in query results are now serialized as JSON strings" ([chg-root]). The docs give the reason: precision beyond ±9007199254740991 ([r-cast]).
- **Visibility of pre-aggregation fields.** `preAggregationId`, `lastUpdatedAt` and `type` are always visible. `targetTableName` and `refreshKeyValues` are visible only in dev mode ([rest-ref]).
- **`responseFormat: compact`** returns `{members, dataset}` with rows as primitive arrays. **`columnar`** returns `{members, columns}` ([rest-ref]). The SDK converts both back to row objects ([src-core-index]).

### 4. Errors, "Continue wait", progress, cancellation

- **Status codes** ([rest-index]):
  - 400: general error (database, timeout)
  - 403: `Authorization header isn't set` or `Invalid token`
  - 500: server error
- **Continue wait (long polling).** A slow request returns HTTP 200 with `{ "error": "Continue wait" }`. "Clients should continuously retry the same query in a loop until they get a successful result." Queries that stop being retried are orphaned and removed from the queue. `continueWaitTimeout` controls the interval ([rest-index]); its default has been 10 s since 1.7.0 ([chg-root]).
- **How the SDK handles it:**
  - On `Continue wait` it calls `progressCallback(new ProgressResult(body))`, where `ProgressResponse = {stage: string; timeElapsed: number}`, and re-requests immediately ([src-core-index], [src-core-types]).
  - Any non-200 response throws `RequestError` with `message`, `status` and `response` ([src-core-index], [src-core-reqerr]).
  - A 502 or a `network error` waits `pollInterval` seconds (default 5) and retries. `networkErrorRetries` defaults to 0 ([src-core-index]).
- **Request IDs.** Recommended header format: `x-request-id: ${spanId}-span-${requestSequenceId}` ([rest-index]). The SDK sets `baseRequestId` (a UUID by default) and sends `${baseRequestId}-span-${n}`, where `n` increments on each retry ([src-core-index], [src-core-http]).
- **Cancelling a server query:** `DELETE /v1/running-query/{requestId}` ([rest-ref]). The SDK has no method for it ([src-core-index]).
- **Aborting on the client:**
  - Pass `signal` per call or in `CubeApiOptions`; an abort produces `RequestError('aborted')`.
  - `fetchTimeout` creates an `AbortSignal.timeout` ([src-core-http]).

### 5. `/v1/meta` (via `cubeApi.meta()` or `useCubeMeta()`)

Response: `{ cubes: Cube[]; viewGroups?: ViewGroup[] }` ([src-core-types], [rest-ref]).

```ts
type Cube = {
  name;
  title;
  description?;
  type?: 'view' | 'cube';
  measures: TCubeMeasure[];
  dimensions: TCubeDimension[];
  segments: TCubeSegment[];
  folders: { name; members: string[] }[];
  nestedFolders;
  hierarchies: { name; title?; levels: string[]; public? }[];
  connectedComponent?: number;
  isVisible?;
  public?;
  meta?;
  viewGroups?: string[];
};
type BaseCubeMember = {
  type: 'time' | 'number' | 'string' | 'boolean';
  name;
  title;
  shortTitle;
  description?;
  isVisible?;
  public?;
  meta?;
  aliasMember?;
};
type TCubeMeasure = BaseCubeMember & {
  aggType: 'count' | 'number';
  cumulative;
  cumulativeTotal;
  drillMembers: string[];
  drillMembersGrouped: { measures: string[]; dimensions: string[] };
  format?: 'currency' | 'percent';
  currency?;
};
type BaseCubeDimension = BaseCubeMember & {
  primaryKey?;
  suggestFilterValues: boolean;
  format?;
  currency?;
  key?;
};
type CubeTimeDimension = BaseCubeDimension & {
  type: 'time';
  granularities?: { name: string; title: string }[];
};
```

- **`connectedComponent`:** "If the same value is returned for two cubes, then there is at least one join path between them" ([rest-ref]). **This overstates it.** See `markings-query-support.md`, "Corrections to sibling research docs" item 2 and Q4. The component is computed over the undirected join graph, but Cube joins along directed edges, so the same component is necessary and not sufficient. Use it only to rule a join out.
- **Observed against the running Cube v1.7.42 (2026-09-21, T085 review), confirming that correction.** The seed's `customers` and `products` both have `connectedComponent: 1`, and both are joined only *from* `orders`. `{measures:['customers.count'], dimensions:['customers.country'], filters:[{member:'products.category', operator:'equals', values:['Components']}]}` returns **HTTP 400 `{"type":"UserError","error":"Can't find join path to join 'customers', 'products'"}`**. The same filter on an `orders` query returns 200.
- **Observed against the running Cube v1.7.42 (local docker-compose, 2026-09-21, T085)**, in `/v1/meta` for the seed model plus one view (`infra/cube/model/views/order_summary.yml`, `join_path: orders`, `includes: [count, status]`):
  - The three joined cubes (`orders` joins `customers` and `products`) each carry `type: 'cube'` and `connectedComponent: 1`.
  - The view carries `type: 'view'` and **no `connectedComponent`**.
  - Each view member carries **`aliasMember`, naming the cube member it exposes**: `order_summary.status` → `orders.status` and `order_summary.count` → `orders.count`. The client type lists `aliasMember?` without saying what it holds ([src-core-types]). This observation is the source for wechart reading it as "the view's name for that cube member".
- **`?onlyViews=true`:** returns views only. It was added to `meta()` in 1.7.14 ([src-gw], [chg-react], [sdk-core-ref]).
- **`?extended`:** adds `sql`, `fileName`, `refreshKey` and `extends` for cubes; `sql` and `filters` for measures; `sql` and `case` for dimensions; joins; and pre-aggregation references ([src-gw-metaext]). It is not in the docs.

### 6. `/v1/sql`, `/v1/dry-run`, `/v1/convert-query`, `/v1/cubesql`

- **`/v1/sql`:** `cubeApi.sql(query)` returns `SqlQuery` with `rawQuery()` and `sql()` ([sdk-core-ref], [src-core-index]).
- **`/v1/dry-run`:** `cubeApi.dryRun(query)` returns `{queryType, normalizedQueries, pivotQuery, queryOrder, transformedQueries}`. `transformedQueries` includes `isAdditive`, `leafMeasures`, `hasMultipliedMeasures` and `sortedDimensions` ([src-core-types], [src-gw]).
- **`/v1/convert-query`:** a SQL-to-REST converter with no SDK method ([rest-ref], [src-core-index]).
- **`/v1/cubesql`:**
  - `cubeApi.cubeSql(sql, { timezone?, timeout?, ...LoadMethodOptions })` returns `{ schema, data: (string|number|boolean|null)[][] }` plus metadata.
  - `cubeApi.cubeSqlStream(sql, opts)` is an `AsyncGenerator` of `{type:'schema'} | {type:'data'} | {type:'error'}` chunks.

  Sources: [src-core-index], [sdk-core-ref].

### 7. GraphQL API (Core)

- **Endpoint and access:** `${basePath}/graphql`, i.e. `/cubejs-api/graphql`. It is on by default and gated by the `graphql` scope ([gql-index], [src-gw]).
- **Query shape:** `query { cube(where, limit, offset, timezone, ungrouped) { <cube>(where, orderBy) { members… timeDim { value | day | month … } } } }`. Filters combine with `AND`/`OR` at the root and per cube ([gql-ref]). The source also exposes a `cache` argument on `cube` ([src-gw-gql]).
- **Filter inputs:** the documented set is narrower than what the source generates ([gql-ref] vs [src-gw-gql]).

  | Input            | Documented                                                                            | In source                                             |
  | ---------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------- |
  | `StringFilter`   | equals, notEquals, in, notIn, contains, notContains, set                              | also startsWith, notStartsWith, endsWith, notEndsWith |
  | `FloatFilter`    | equals, notEquals, in, notIn, set                                                     | also gt, gte, lt, lte                                 |
  | `DateTimeFilter` | equals, notEquals, in, notIn, inDateRange, notInDateRange, beforeDate, afterDate, set | also beforeOrOnDate, afterOrOnDate                    |

  In the source, `in` maps to `equals` and `notIn` to `notEquals`. `set` maps to `set` or `notSet` depending on its value.

- **Response `extensions`:** `annotation`, `lastRefreshTime` and `usedPreAggregations` ([gql-ref]).
- **Unsupported:** WebSockets transport, subscriptions, segments, compare date range queries, metadata queries, and front-end pivot config ([gql-index]).

### 8. SQL API (Core): Postgres wire protocol and HTTP

- **Enabling it:**
  - Set `CUBEJS_PG_SQL_PORT`. `CUBEJS_SQL_USER` and `CUBEJS_SQL_PASSWORD` provide credentials.
  - Connect with e.g. `PGPASSWORD=password psql -h localhost -p 15432 -U user cube`.
  - Cube Cloud enables it by default on port 5432.

  Sources: [sql-index], [env].

- **Auth:**
  - `checkSqlAuth: async (req, username) => ({ password, securityContext })`; throw an error to reject the login.
  - `CUBEJS_SQL_SUPER_USER` and `canSwitchSqlUser` allow switching users with the virtual filter `WHERE __user = '…'`.
  - `extendContext` can enforce defaults.

  Sources: [sql-sec], [env].

- **Data model mapping:**
  - Each cube or view is a table. Dimensions are columns; aggregate by them with `GROUP BY`.
  - Measures must be wrapped in `MEASURE()` or a matching aggregate (`sum` → `SUM`, `count_distinct` → `COUNT(DISTINCT …)`, and so on). A mismatch raises `Measure aggregation type doesn't match`.
  - Segments are boolean columns.

  Source: [sql-qf].

- **Joins:**
  - Views are the recommended way to define join paths.
  - `CROSS JOIN`, or `LEFT JOIN … ON a.__cubeJoinField = b.__cubeJoinField`, uses the model's joins.
  - Joining two views on a shared dimension runs a multi-fact query without fan-out.

  Source: [sql-joins].

- **Query planning:**
  - Planning runs in Apache DataFusion with egg rewriting.
  - There are three query types: regular (cache and pre-aggregations), post-processing (cache and pre-aggregations, limited SQL), and pushdown (cache only, no pre-aggregations).
  - Pushdown is on by default (`CUBESQL_SQL_PUSH_DOWN=true`).

  Sources: [sql-index], [queries], [env].

- **Supported statements:** `SELECT` (with `DISTINCT ON`, `CROSS JOIN`, `WHERE`, `GROUP BY`, `HAVING`, `LIMIT`, `OFFSET`), `EXPLAIN [ANALYZE]`, `SHOW`, `SET`, `CREATE TEMPORARY TABLE`, `COPY … FROM STDIN` ([sql-ref]).
- **Function categories** ([sql-ref]). Each function is documented as supported or not in regular, post-processing and pushdown modes.
  - Comparison operators and predicates.
  - Mathematical and trigonometric functions.
  - String functions and `LIKE`/`REGEXP_SUBSTR`.
  - `TO_CHAR`.
  - Date/time functions: `DATE_ADD`, `DATE_TRUNC` (default granularities only), `DATEDIFF`, `EXTRACT`, `LOCALTIMESTAMP`, `NOW`.
  - Conditional functions: `CASE`, `COALESCE`, `NULLIF`, `GREATEST`, `LEAST`.
  - Aggregates: `AVG`, `COUNT`, `COUNT(DISTINCT)`, `MAX`, `MIN`, `SUM`, `MEASURE`, `STRING_AGG`, `PERCENTILE_CONT`.
  - Statistics functions.
  - Window functions: `LAG`, `LEAD`, and aggregates with `OVER` (pushdown only).
  - `IN` / `NOT IN`.
  - Custom: `XIRR(payment, date [, initial_guess [, on_error]])`, available since v1.3.8 in post-processing and since v1.3.12 in Cube Store multi-stage measures ([xirr]).
- **Settings and limits:**
  - `SET cube_cache = 'must-revalidate'` controls caching.
  - `CUBESQL_STREAM_MODE` enables streaming, which removes the row cap for queries with an explicit `LIMIT`.
  - `CUBEJS_MAX_SESSIONS` defaults to 1024.
  - `CUBESQL_SQL_NO_IMPLICIT_ORDER` defaults to true, so the SQL API adds no implicit `ORDER BY`.

  Sources: [sql-index], [env], [queries].

### 9. MDX API and DAX API: Cloud-only

- **MDX API:** Excel on Windows through XMLA. "Available on Enterprise plan" and "currently in preview". It exposes views only ([mdx]).
- **DAX API:** Power BI. "Available on Enterprise plan"; configured in Cube Cloud Settings. It exposes views only and supports Kerberos, NTLM, username/password and tokens. The page has `hidden: true` in its frontmatter ([dax]).
- **Not usable from a Core deployment.** I found no Core configuration for either API.

### 10. Real-time: WebSocket transport and subscriptions (Core)

- **Server:**
  - Enable with `CUBEJS_WEB_SOCKETS=true` (default false) ([env], [src-server]).
  - The server is `new WebSocket.Server({ server, path: options.webSocketsBasePath, maxPayload: maxRequestSize })` and re-executes stored subscriptions every `processSubscriptionsInterval`, 5 s by default ([src-server-ws]).
  - The docs' `websocat` example uses `ws://localhost:4000/cubejs-api/v1/ws`; the SDK example uses `ws://localhost:4000/` ([rest-index], [r-rt]).
- **Protocol** ([rest-index], [src-gw-ws], [src-ws]):
  - First message: `{"authorization":"TOKEN"}`. The server replies `{handshake: true}`, or 403 `Not authorized`.
  - Requests: `{"messageId":"1","method":"load","params":{"query":{…}}}`. Allowed methods are `load`, `sql`, `dry-run`, `meta`, `subscribe`, `unsubscribe`.
  - Responses: `{messageId, message, status?}` plus `{messageProcessedId}`.
  - The client unsubscribes with `{unsubscribe: messageId}`.
  - The client sends a heartbeat (60 s default). It closes the socket after 4× the heartbeat interval with no messages, then reconnects and re-sends subscriptions.
- **Client API:**
  - `cubeApi.subscribe(query, options|null, (err, resultSet) => …)` returns `{ unsubscribe() }`.
  - React: `useCubeQuery(query, { subscribe: true })`, which unsubscribes on unmount ([r-rt], [src-react-query]).
- **Subscriptions over plain HTTP.** With the HTTP transport, `subscribe` re-polls every `pollInterval` seconds, 5 by default ([src-core-index]).
- **Update frequency.** "Real-time data fetch obeys the `refresh_key`" ([r-rt]).

### 11. Recipes

- **Pagination** ([r-pag]):
  - Page with `limit` + `offset` and a deterministic `order`.
  - Get the total from a separate count-measure query, or use `total: true` ([rest-qf]).
- **Drill-downs** ([r-drill], [measures], [src-core-rs]):
  - Declare `drill_members` on a measure; they surface as `drillMembers` and `drillMembersGrouped`.
  - `resultSet.drillDown({xValues, yValues?}, pivotConfig?)` returns a `Query` or `null`. The query has:
    - `...drillMembersGrouped`, meaning the drill measures and dimensions;
    - `filters: [{member: measure, operator: 'measureFilter'}, ...parentFilters, {member, operator: 'equals', values: [v]} | {member, operator: 'notSet'}]`;
    - a `timeDimensions` date range snapped to the clicked bucket and clamped to the original `dateRange`;
    - `segments` and `timezone`.
  - It returns `null` if the measure has no drill members.
  - It throws for compare-date-range and blending queries.
- **Unique values for a field** ([r-uniq]):
  - Query `{ dimensions: ['users.city'] }` returns one row per distinct value.
  - `suggestFilterValues: true` in meta "indicates dimensions suitable for dropdown suggestions".
- **Sorting** ([r-sort]):
  - For a custom sort order, sort by an extra dimension that doesn't have to be selected.
  - In ascending order, `NULL`s sort last; use `COALESCE` in the model to change that.
  - The SQL API does not support `NULLS FIRST/LAST`.
- **Casting numerics** ([r-cast], [src-core-index]):
  - Set `castNumerics: true` per `load` or in `CubeApiOptions`/`CubeProvider` options.
  - It converts members annotated `type: 'number'` with `Number()`. Values beyond `Number.MAX_SAFE_INTEGER` lose precision.

### 12. `@cubejs-client/core` 1.7.42

Exports: default `cube` factory; `CubeApi`, `Meta`, `SqlQuery`, `RequestError`, `ProgressResult`, `ResultSet`; everything from `HttpTransport`, `utils`, `time` and `types`. Sources: [unpkg-core-dts], [src-core-index].

`CubeApiOptions` ([src-core-index], [unpkg-core-dts]):

| Option                | Type                               | Default / behaviour                                                                     |
| --------------------- | ---------------------------------- | --------------------------------------------------------------------------------------- |
| `apiUrl`              | `string` (required in the type)    |                                                                                         |
| `transport`           | `ITransport`                       | `HttpTransport`                                                                         |
| `method`              | `'GET'\|'PUT'\|'POST'\|'PATCH'`    | Automatic: GET while the URL is under 2000 characters, otherwise POST ([src-core-http]) |
| `headers`             | `Record<string,string>`            | `{}`                                                                                    |
| `pollInterval`        | `number` (seconds)                 | 5                                                                                       |
| `credentials`         | `'omit'\|'same-origin'\|'include'` |                                                                                         |
| `parseDateMeasures`   | `boolean`                          |                                                                                         |
| `resType`             | `'default'\|'compact'\|'columnar'` | Stored but not used by `load()` in 1.7.42 (source reading)                              |
| `castNumerics`        | `boolean`                          | false                                                                                   |
| `networkErrorRetries` | `number`                           | 0                                                                                       |
| `signal`              | `AbortSignal`                      |                                                                                         |
| `fetchTimeout`        | `number`                           |                                                                                         |

`LoadMethodOptions`: `{ mutexKey? (default 'default'); mutexObj?; subscribe?; cubeApi?; castNumerics?; progressCallback?(ProgressResult); cache?: CacheMode; signal?; baseRequestId? }`. `MetaMethodOptions` adds `onlyViews?`. `CubeSqlOptions` adds `timeout?` and `timezone?`. Source: [src-core-index].

`CubeApi` methods ([src-core-index]). Each method also has a callback overload that returns `UnsubscribeObj`.

| Method                                        | Returns                              |
| --------------------------------------------- | ------------------------------------ |
| `load(query \| query[], options?)`            | `Promise<ResultSet>`                 |
| `subscribe(query, options \| null, callback)` | `UnsubscribeObj`                     |
| `meta(options?)`                              | `Promise<Meta>`                      |
| `dryRun(query, options?)`                     | `Promise<DryRunResponse>`            |
| `sql(query, options?)`                        | `Promise<SqlQuery>`                  |
| `cubeSql(sql, options?)`                      | `Promise<CubeSqlResult>`             |
| `cubeSqlStream(sql, options?)`                | `AsyncGenerator<CubeSqlStreamChunk>` |

`ResultSet` ([sdk-core-ref], [src-core-rs]):

- **Raw access** (throws `Method is not supported for a '<type>' query type. Please use decompose` for non-regular queries): `rawData()`, `query()`, `annotation()`.
- **Multi-result and persistence:** `decompose()` returns one `ResultSet[]` entry per result. `serialize()` and `static deserialize(data, options?)` round-trip a result set.
- **Totals:** `totalRows()` returns `total`; `totalRow(pivotConfig?)`.
- **Pivots:**
  - `pivot(cfg?)` returns `PivotRow[] = {xValues, yValuesArray: [yValues[], value][]}`.
  - `chartPivot(cfg?)` returns rows `{x, xValues, [seriesKey]: number|string|Date}`.
  - `tablePivot(cfg?)` returns flat rows; pivoted column keys are `yValues.join()`.
  - `tableColumns(cfg?)` returns nested `TableColumn[]`.
  - `seriesNames(cfg?)` returns `{key, title, shortTitle, yValues}[]`.
  - `series(cfg?)` returns `{key, title, shortTitle, series: {x, value}[]}[]`.
- **Drill-down:** `drillDown(locator, cfg?)`.
- **Time series:** `timeSeries(td, resultIndex?, annotations?)`.
- **Static helpers:** `getNormalizedPivotConfig(pivotQuery, cfg?)`, `timeDimensionMember(td)` (returns `${dimension}.${granularity}`), `measureFromAxis(axis)`.

`PivotConfig = { x?: string[]; y?: string[]; fillMissingDates?: boolean | null (default true); fillWithValue?: string | number | null; aliasSeries?: string[]; joinDateRange?: fn | false (default false) }`. `'measures'` is a pseudo-member; `'compareDateRange'` is another for compare queries. Sources: [src-core-types], [src-core-rs].

`Meta` ([src-core-meta], [sdk-core-ref]):

- Fields: `meta`, `cubes`, `cubesMap`.
- `membersForQuery(query, 'measures'|'dimensions'|'segments')` ignores `query` and returns all members sorted by title.
- `resolveMember(name, type)`.
- `filterOperatorsForMember(name, type)`:
  - string: contains … notEndsWith, equals, notEquals, set, notSet
  - number: equals, notEquals, set, notSet, gt, gte, lt, lte
  - time: equals, notEquals, in/notInDateRange, after/before(OrOn)Date
- `defaultTimeDimensionNameFor(member)`.
- `membersGroupedByCube()`.

Format API: `import { formatValue, getFormat, formatDateByGranularity } from '@cubejs-client/core/format'`. Numeric formats use d3-format specifiers ([sdk-core-ref]).

Utilities ([src-core-utils], [src-core-time]):

- Query helpers: `isQueryPresent`, `areQueriesEqual`, `validateQuery`, `removeEmptyQueryFields`, `defaultOrder`, `defaultHeuristics`, `getQueryMembers`, `flattenFilters`, `getOrderMembersFromOrder`.
- Pivot helpers: `movePivotItem`, `moveItemInArray`, `aliasSeries`.
- Time helpers: `GRANULARITIES`, `isPredefinedGranularity`, `dayRange`, `timeSeriesFromCustomInterval`.

### 13. `@cubejs-client/react` 1.7.42

Exports: `useCubeQuery`, `useCubeMeta`, `useDryRun`, `useLazyDryRun`, `useCubeSql`; `CubeProvider`, `CubeContext`, `QueryRenderer`, `QueryRendererWithTotals`, `QueryBuilder`; plus types. Source: [src-react-index].

- **`useCubeQuery<Data, Q>(query, options?)`** ([src-react-query], [src-react-types]):
  - Options: `{ cubeApi?, skip?, subscribe?, resetResultSetOnChange? (default true when unset), castNumerics?, cache? }`.
  - Returns: `{ isLoading, resultSet, error, progress, previousQuery, refetch }`.
  - Dependencies are deep-compared.
  - A `requestIdRef` guard ignores stale responses ("ignore stale useCubeQuery responses", 1.7.38 [chg-react]).
  - On unmount it unsubscribes subscriptions but does not abort HTTP fetches.
- **`useCubeMeta({ cubeApi?, skip?, onlyViews?, baseRequestId? })`** returns `{ isLoading, error, response: Meta, refetch }` ([src-react-meta], [src-react-fetch]).
- **`useDryRun(query, options)`** has the same shape with `DryRunResponse` ([src-react-dry]).
- **`useLazyDryRun(query?, options)`** returns `[load, result]` ([src-react-lazy]).
- **`useCubeSql`** is marked `@hidden`. It resolves a `SqlQuery` but is typed as a `DryRunResponse` result ([src-react-sql]).
- **`CubeProvider`** takes `{ cubeApi: CubeApi | null; options?: { castNumerics? }; children }` and is a `React.FC` ([src-react-provider], [src-react-types]).
- **`QueryRenderer`, `QueryBuilder`:** class components using `static contextType`, `static defaultProps`, `getDerivedStateFromProps` and `shouldComponentUpdate` ([src-react-qb], [src-react-qr]). The `QueryBuilder` `ChartType` is limited to `'line'|'bar'|'table'|'area'|'number'|'pie'` ([src-core-types]).

**React 19 assessment:**

- **Peer range:** `react >=16.10.2` includes 19 ([npm-react]).
- **Upstream testing:** devDependencies are React 18.3.1 and @types/react 18.3 ([unpkg-react-pkg]), so React 19 is not in the upstream test setup (inferred from devDeps).
- **Source APIs:**
  - Hooks use only `useContext`, `useState`, `useEffect`, and `useRef` called with an argument ([src-react-query], [src-react-fetch]).
  - Class components use `static defaultProps` and `static contextType`. React 19 keeps both for class components: "Class components will continue to support `defaultProps`", and legacy `contextTypes` is replaced by `contextType` ([react19]).
- **Published typings:** they use `React.JSX.Element`, not the global `JSX` namespace ([unpkg-react-qb-dts]).
- **Issue #9797** ("Cube react client incompatible with React 19?") turned out to be Next.js 15.4 behaviour, fixed by `next@15.4.4`, and a maintainer closed it ([i9797]).
- **Verdict:** I found no blocker. wechart should still cover the hooks with its own tests under React 19 StrictMode.

### 14. `@cubejs-client/ws-transport` 1.7.42

- **Usage:** `new WebSocketTransport({ apiUrl, authorization?, heartBeatInterval? })`, default export ([src-ws], [sdk-ws-ref]).
- **Interface:** implements `ITransport`. `request(method, params)` returns `{ subscribe, unsubscribe }`, so `CubeApi` uses native server-side subscriptions instead of polling ([src-core-index]).
- **Batching:** messages are queued and flushed 100 ms after the socket initializes ([src-ws]).

## Capability inventory

"Candidate wechart UI surface" entries are candidates for the interview and spec, not decisions.

| Capability                                                                                            | Core or Cloud-only                                   | API/config surface to drive it                                                            | Candidate wechart UI surface                | Source                                         |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| Grouped query (measures × dimensions)                                                                 | Core                                                 | `/v1/load` `measures`, `dimensions`; `cubeApi.load`; `useCubeQuery`                       | Every chart and table render                | [rest-qf], [rest-ref]                          |
| Time bucketing, predefined and custom granularities                                                   | Core                                                 | `timeDimensions[].granularity`; meta `granularities`; annotation `granularity`            | Time-axis granularity picker                | [rest-qf], [dimensions], [src-core-types]      |
| Absolute and relative date ranges                                                                     | Core                                                 | `timeDimensions[].dateRange` (Chrono strings)                                             | Date-range picker; global date filter       | [rest-qf]                                      |
| Period-over-period comparison                                                                         | Core (REST only)                                     | `timeDimensions[].compareDateRange` + `queryType=multi`                                   | "Compare to period" toggle                  | [queries], [rest-qf], [src-gw]                 |
| Member filters (18 documented operators + `measureFilter`)                                            | Core                                                 | `filters[]`                                                                               | Filter panel, global filters, cross-filters | [rest-qf]                                      |
| Nested AND/OR filter logic                                                                            | Core                                                 | `{and:[…]}`, `{or:[…]}` (no dimension/measure mixing)                                     | Advanced filter groups                      | [rest-qf]                                      |
| Segments                                                                                              | Core                                                 | `segments[]`; meta `segments`                                                             | Segment chips                               | [rest-qf], [rest-ref]                          |
| Sorting                                                                                               | Core                                                 | `order` (object or tuple array; `{}` means none)                                          | Sort controls; sorted bars                  | [rest-qf], [r-sort]                            |
| Pagination                                                                                            | Core                                                 | `limit`, `offset` (+ `order`)                                                             | Table paging                                | [r-pag]                                        |
| Total row count                                                                                       | Core (REST only)                                     | `total: true` → `total`; `ResultSet.totalRows()`                                          | Row count; cardinality probe                | [rest-qf], [src-gw], [src-core-rs]             |
| Query time zone                                                                                       | Core                                                 | `timezone`; `CUBEJS_DEFAULT_TIMEZONE`                                                     | Dashboard or user time-zone setting         | [rest-qf], [env]                               |
| Ungrouped (row-level) queries                                                                         | Core                                                 | `ungrouped: true`; `allow_ungrouped_without_primary_key`                                  | Raw-rows table; drill to detail             | [queries]                                      |
| Join hints                                                                                            | Core                                                 | `joinHints`                                                                               | Join-path chooser when ambiguous            | [rest-qf]                                      |
| Cache control / forced refresh                                                                        | Core                                                 | `cache` (4 modes); SQL `SET cube_cache`                                                   | "Refresh now"; freshness policy             | [rest-index], [sql-index]                      |
| Compact/columnar payloads                                                                             | Core                                                 | `responseFormat`                                                                          | None (transport optimisation)               | [rest-ref]                                     |
| Data blending (multi-query)                                                                           | Core                                                 | Array `query` + `queryType=multi` → `blendingQuery`                                       | Overlay of queries from different cubes     | [rest-ref], [src-gw-query]                     |
| Data-model metadata                                                                                   | Core                                                 | `GET /v1/meta` (`onlyViews`); `meta()`; `useCubeMeta`                                     | Field list; recommender type signature      | [rest-ref], [src-gw]                           |
| Extended metadata (SQL, joins, pre-aggregations)                                                      | Core (undocumented)                                  | `GET /v1/meta?extended`                                                                   | Read-only semantic-layer inspector          | [src-gw], [src-gw-metaext]                     |
| Join reachability                                                                                     | Core                                                 | meta `connectedComponent`                                                                 | Grey out non-joinable fields                | [rest-ref]                                     |
| Hierarchies, folders, view groups                                                                     | Core                                                 | meta `hierarchies`, `folders`, `nestedFolders`, `viewGroups`                              | Field tree; drill hierarchies               | [rest-ref], [src-core-types]                   |
| Member formats (currency, percent, custom d3, time formats)                                           | Core                                                 | meta/annotation `format`, `formatDescription`, `currency`; `@cubejs-client/core/format`   | Axis, tooltip and table formatting          | [sdk-core-ref], [src-core-types], [dimensions] |
| Drill-down                                                                                            | Core                                                 | Model `drill_members`; `ResultSet.drillDown`                                              | Click-to-drill                              | [r-drill], [src-core-rs]                       |
| Validate query without running it                                                                     | Core                                                 | `/v1/dry-run`; `dryRun`; `useDryRun` / `useLazyDryRun`                                    | Validate on save; normalized query          | [src-gw], [sdk-core-ref]                       |
| Generated SQL                                                                                         | Core                                                 | `/v1/sql`; `sql()`                                                                        | "View SQL" panel                            | [rest-ref]                                     |
| SQL → REST conversion                                                                                 | Core                                                 | `POST /v1/convert-query`                                                                  | SQL authoring saved as a Cube query         | [rest-ref]                                     |
| SQL execution over HTTP                                                                               | Core                                                 | `POST /v1/cubesql`; `cubeSql`, `cubeSqlStream`                                            | SQL runner                                  | [rest-ref], [sdk-core-ref]                     |
| SQL API over the Postgres wire protocol                                                               | Core                                                 | `CUBEJS_PG_SQL_PORT`, `CUBEJS_SQL_USER/PASSWORD`, `checkSqlAuth`, `CUBEJS_SQL_SUPER_USER` | Connection-info page for external BI tools  | [sql-index], [sql-sec], [env]                  |
| XIRR                                                                                                  | Core (SQL post-processing; Cube Store multi-stage)   | `XIRR(...)`                                                                               | Financial measures                          | [xirr]                                         |
| Query progress                                                                                        | Core                                                 | `Continue wait` + `progressCallback` (`stage`, `timeElapsed`)                             | Loading state with stage                    | [rest-index], [src-core-index]                 |
| Query cancellation                                                                                    | Core                                                 | `x-request-id` / `baseRequestId` + `DELETE /v1/running-query/{id}`; `signal`              | Cancel button                               | [rest-ref], [src-core-http]                    |
| Real-time subscriptions                                                                               | Core                                                 | `CUBEJS_WEB_SOCKETS=true`; ws-transport; `subscribe`; `useCubeQuery({subscribe:true})`    | Live dashboard toggle                       | [rest-index], [r-rt], [env]                    |
| Polling refresh over HTTP                                                                             | Core                                                 | `subscribe` + `pollInterval`                                                              | Auto-refresh interval                       | [src-core-index]                               |
| Freshness and acceleration info                                                                       | Core                                                 | `lastRefreshTime`, `usedPreAggregations`, `external`                                      | "Data as of" and "accelerated" badges       | [rest-ref], [src-core-types]                   |
| Pre-aggregation build jobs                                                                            | Core (`jobs` scope, off by default)                  | `POST /v1/pre-aggregations/jobs`                                                          | See the pre-aggregations/jobs research doc  | [rest-ref], [rest-index]                       |
| API scopes                                                                                            | Core                                                 | `CUBEJS_DEFAULT_API_SCOPES`, `contextToApiScopes`                                         | Security/admin view                         | [rest-index], [env]                            |
| Health checks                                                                                         | Core                                                 | `/readyz`, `/livez`                                                                       | System status page                          | [rest-ref]                                     |
| GraphQL API                                                                                           | Core                                                 | `/cubejs-api/graphql`                                                                     | None in the UI (external consumers)         | [gql-index]                                    |
| MDX API (Excel/XMLA)                                                                                  | Cloud-only (Enterprise, preview)                     | Cube Cloud settings                                                                       | None                                        | [mdx]                                          |
| DAX API (Power BI)                                                                                    | Cloud-only (Enterprise)                              | Cube Cloud settings                                                                       | None                                        | [dax]                                          |
| Metadata API (`/v1/data-sources`, `/v1/entities*`)                                                    | Cloud-only                                           | Bearer token                                                                              | None (use `/v1/meta`)                       | [rest-ref]                                     |
| Cloud groups and user attributes in JWTs                                                              | Cloud-only (per its references to Cube Cloud groups) | JWT claims + Cloud data access policies                                                   | None                                        | [r-cloudgroups]                                |
| Personal Core Data API Token                                                                          | UNVERIFIED (configured in Preferences)               | n/a                                                                                       | None                                        | [cda-index]                                    |
| Internal routes (`/v1/pre-aggregations/can-use`, `/v1/graphql-to-json`, `/v2`, `/cubejs-system/v1/*`) | Core (undocumented)                                  | n/a                                                                                       | None until documented                       | [src-gw]                                       |

### Recommendation: getting dimension cardinality cheaply for the recommender

1. **Metadata priors, no query** ([rest-ref], [src-core-types]):
   - Classify each member as N, Q or T from `/v1/meta` `type`.
   - Treat `primaryKey: true` dimensions as unique per row.
   - For a time dimension, the number of buckets follows from `dateRange` + `granularity` on the client (`ResultSet.timeSeries` implements the same bucketing, [src-core-rs]).
2. **Bounded distinct probe (default).** Run `{ dimensions: [d], filters: <active dashboard filters>, timeDimensions: <active date range, no granularity>, limit: T + 1, order: {} }`. Here `T` is the largest cardinality threshold the recommender tests; the thresholds in the input are not decided.
   - **Result:** `rows ≤ T` gives the exact `n`, and the rows double as filter-dropdown values ([r-uniq]). `rows = T + 1` means `n > T`, which is all the threshold rules need.
   - **Why it is cheap and correct:**
     - It is a regular grouped query, so cache and pre-aggregations apply ([queries]).
     - The payload is capped at `T + 1` rows.
     - `order: {}` drops the default sort ([rest-qf]).
     - Security context and filters apply, so the count is what the user can actually see.
3. **Exact count, only when needed** (for example to explain "342 categories"). Run the same query with `limit: 1, total: true` and read `resultSet.totalRows()`. The server clones the query, strips `order`, `limit`, `rowLimit` and `offset`, and runs a count query in parallel ([src-gw]). The cost is a full grouped scan unless a pre-aggregation serves it (UNVERIFIED, see open questions).
4. **Free post-hoc refinement.** After the chart query runs, if `rows < limit`, count distinct values per dimension in `rawData()` and re-rank the recommendation. This needs no extra request.
5. **At scale.** A model-level `count_distinct_approx` measure (HyperLogLog, additive, usable in rollup pre-aggregations) is the cheapest repeatable approach ([measures]). It needs a semantic-layer change, so the recommender cannot assume it exists.
6. **What I did not use.** SQL API `COUNT(DISTINCT dim)`: its plan type and pre-aggregation eligibility are unverified, and pushdown queries cannot use pre-aggregations ([queries]).

Cache probe results keyed by (member, filter set, security identity). `NULL` counts as one group.

### Recommendation: mapping compareDateRange and ResultSet pivot to multi-series charts

**How the pivot works by default.** `getNormalizedPivotConfig` works as follows ([src-core-rs]):

- If any time dimension has a granularity:
  - `x` is those time dimensions, as `dim.granularity`;
  - `y` is the query's dimensions;
  - `'measures'` is appended to `y`.
- Otherwise:
  - `x` is the dimensions;
  - `y` is `['measures']`.

Each distinct `y` tuple becomes one series:

- `seriesNames()` gives `key` (the `y` values joined by commas) and `title`.
- `chartPivot()` gives one row per `x` with `row[key]` values.

For a renderer, emit one series per `seriesNames()` entry, with x from `row.x`/`row.xValues` and y from `row[key]`. The ECharts-specific wiring belongs in the ECharts research doc.

**Trellis:**

- The ResultSet has no facet API ([src-core-rs]).
- Put the facet dimension first in `y` and group `seriesNames()` by `yValues[0]`. Alternatively, split `rawData()` by facet value and pivot each panel with the same `x` domain.
- The facet count comes from the cardinality probe.

**compareDateRange, end to end:**

1. Send `timeDimensions: [{ dimension, granularity, compareDateRange: [r1, r2, …] }]`. Only one time dimension may carry it, and it cannot be combined with `dateRange` ([src-gw], [src-gw-query]).
2. The server splits the request into one query per range, in the same order ([src-gw]). It tags every row with `compareDateRange: "<start> - <end>"`, the normalized range joined by `" - "` ([src-rust-transform]). It returns `queryType: 'compareDateRangeQuery'` with `results[i]` matching `rᵢ` and `pivotQuery.dimensions = ['compareDateRange', …]` ([src-gw-query]).
3. The client's default pivot gives `x = [dim.granularity]` and `y = ['compareDateRange', …dimensions, 'measures']`. That yields one series per range × dimension tuple × measure ([src-core-rs]).
4. Each result is pivoted on its own and then merged **by row index**:
   - The x labels come from the shortest result (the first range on ties). With `joinDateRange`, the labels of all ranges are joined with `", "` instead.
   - Ranges with different bucket counts (for example February vs March by day) are truncated to the shortest ([src-core-rs]).
5. Limitations:
   - `rawData()`, `query()` and `annotation()` throw for compare-date-range results; use `decompose()` ([src-core-rs], [i8050]).
   - `drillDown()` throws ([src-core-rs], [i5056] is open).

**Recommendation for wechart's engine-neutral spec.** Store the Cube query as-is. For compare-date-range charts, build series from `resultSet.decompose()` and align buckets by ordinal position. Label them from wechart's own period labels, not the first range's dates.

Build the value matrix from `rawData()` plus `annotation()` rather than `chartPivot()` whenever missing data must stay distinguishable from zero, because of three `ResultSet` behaviours:

- `pivot()` fills missing cells and null measures with `fillWithValue ?? 0`.
- `chartPivot()` converts values with `parseFloat`.
- Series keys are comma-joined with null values dropped.

Sources for all three: [src-core-rs], [src-core-utils]. `getNormalizedPivotConfig` and `timeSeries` remain reusable for axis layout and bucket generation.

## Gotchas

1. **`renewQuery` no longer exists (removed in 1.7.0).** Use `cache: 'must-revalidate'` ([chg-root]). Because the server rejects unknown keys ([src-gw-query]), sending `renewQuery` fails with `Invalid query format`. The same applies to `rowLimit`: it is in the client `Query` type ([src-core-types]) but not in the server schema.
2. **Numbers arrive as strings** ([chg-root], [src-rust-transform]):
   - `castNumerics` uses `Number()` and loses precision above 2^53 ([r-cast]).
   - `chartPivot()` always calls `parseFloat`, whatever `castNumerics` is set to ([src-core-rs]).
3. **Pivot fills with zeros.** Missing buckets and null measure values become `0` unless `fillWithValue` is a non-null value; `fillWithValue: null` still yields 0 through `?? 0`. `fillMissingDates` defaults to true, but only applies when `x` is exactly the single time dimension with a granularity ([src-core-rs]).
4. **Series keys can collide:**
   - They are `yValues` joined by `,`, so values containing commas can clash.
   - `aliasSeries` drops `null` values from keys, so tuples that differ only in where a null sits collapse together.

   Sources: [src-core-rs], [src-core-utils].

5. **compareDateRange caveats:** positional merge and truncation, `rawData()` throws, `drillDown` unsupported, one time dimension only, and it requires `queryType=multi` (the SDK sets this) ([src-core-rs], [src-gw], [i8050], [i5056]). Compare-date-range for blending queries is an open feature request ([i2380]).
6. **Strict TypeScript and the docs' `cube({ transport })` example.** The typed default export needs two arguments and a non-optional `apiUrl`, so the example fails strict typecheck ([unpkg-core-dts]).
7. **A superseded `load()` resolves to `null`.** When a newer call shares the same `mutexObj`/`mutexKey`, the older call resolves `null` even though the type says `Promise<ResultSet>` ([src-core-index]).
8. **`useCubeQuery` cannot abort HTTP requests.** It ignores stale responses, but the requests keep running. Feature request [i8263] is open. For cancellation, call `cubeApi.load(q, { signal })` directly ([src-core-index]).
9. **Raw HTTP clients must handle `Continue wait`.** They have to loop on it themselves. The SDK re-requests immediately. Abandoned queries are orphaned ([rest-index], [src-core-index]).
10. **Unbounded retries on 502 (from reading source, not observed at runtime).** In `HttpTransport` retry handling, `A || B && --retries >= 0` means a 502 retries without limit every `pollInterval` seconds, regardless of `networkErrorRetries` ([src-core-index]).
11. **`fetchTimeout` covers the whole polling loop (from reading source).** One `AbortSignal.timeout` is created per `request()` call and reused across Continue-wait retries ([src-core-http]).
12. **Global date filters belong in `timeDimensions[].dateRange`.** An `inDateRange` filter skips pre-aggregation granularity matching ([rest-qf]).
13. **No mixing of dimension and measure filters in one and/or group** ([rest-qf]). The docs don't say how top-level `filters` entries combine (see open questions).
14. **Row limits truncate silently:**
    - REST defaults to 10,000 rows with a maximum of 50,000 ([env]). Set an explicit `limit` and treat `rows === limit` as truncated (inference).
    - In the SQL API, post-processing and non-aggregated queries are capped at 50,000 rows and "The result can be incorrect without any error being raised" ([sql-qf]).
15. **Default ordering applies when `order` is omitted** ([rest-qf]). Use `order: {}` for none.
16. **`Meta.membersForQuery` ignores its query argument** ([src-core-meta]). To find joinable members, use `connectedComponent` ([rest-ref]).
17. **Client types are narrower than the server:**
    - `TCubeMemberType` omits the `geo` and `switch` dimension types ([src-core-types], [dimensions]).
    - `aggType` is typed as `'count'|'number'`.
    - `BinaryOperator` omits `in`, `notIn` and `onTheDate` ([src-gw-query]).
    - `Meta` time operators omit `set`/`notSet`, although the docs allow them ([src-core-meta], [rest-qf]).
18. **GraphQL docs list fewer filter operators than the generated schema** ([gql-ref], [src-gw-gql]).
19. **Several routes are undocumented and should be treated as unstable:** `/v1/dry-run`, `/v1/subscribe`, `/v1/meta?extended`, `/v1/pre-aggregations/can-use`, `/v1/graphql-to-json`, `/v2` ([src-gw]).
20. **ESM build.** Issue [i10041] reported extensionless ESM imports in core 1.3.73. At 1.7.42 the published `dist/src/index.js` imports `./ResultSet.js` and so on, with extensions ([unpkg-core-js]), but the issue is still open.
21. **ws-transport specifics:**
    - It is CJS-only; Vite pre-bundles it ([vite-prebundle]).
    - It depends on `ws` ^7.5.3. GHSA-3h5v-q93c-6h6q (CVE-2024-37890, a DoS affecting `ws` servers below 7.5.10) is covered by the caret range ([ws-cve]).
    - Browsers use native `WebSocket` through `isomorphic-ws` ([unpkg-isows]).
22. **Keep core and react in lockstep.** `@cubejs-client/react` pins `@cubejs-client/core` to exactly 1.7.42 ([npm-react]). A different core version in the workspace would install two copies, and `CubeApi` types would stop matching (inference).
23. **Security notes:**
    - Tokens are JWTs issued by an auth server ([ctx]).
    - Development mode needs no token ([rest-index]).
    - CORS defaults to `*` ([rest-index]).
    - Pre-aggregation storage details are exposed only in dev mode ([rest-ref]).
24. **`QueryBuilder` doesn't fit wechart's chart types.** Its `ChartType` has only six values ([src-core-types]). It is a render-prop class component that also calls `meta()` and `dryRun()` itself ([src-react-qb]).

## Alternatives considered

The caller did not request a comparison. Among Cube's own APIs, the choice of REST over GraphQL or SQL is justified in the Summary from documented feature gaps ([gql-index], [queries]).

## Open questions / unverified

- **npm vs tag commit.** npm `gitHead` for all three packages is `919434f42b50183179e97d1eed85696bafb05ae2` ([npm-core]). The caller gave tag sha `68eeb0e7`. That may be the annotated-tag object rather than the commit; not checked.
- **Top-level filter semantics.** The docs don't say that top-level `filters` entries are ANDed ([rest-qf]). Confirm with an integration test before building cross-filter rewriting on that assumption.
- **`total` and pre-aggregations.** Unknown whether the `total` count query can be served by a pre-aggregation. Tried: read the `gateway.ts` total path only.
- **compareDateRange label format.** The exact timestamp format inside the `compareDateRange` row value (for example `2024-01-01T00:00:00.000 - …`) is unverified. The source shows only the join with `" - "`.
- **Cancellation ID matching.** Unknown whether `DELETE /v1/running-query/{id}` matches the full `-span-N` ID or a prefix, and which span to use after Continue-wait retries.
- **Scopes of two routes.** The scopes for `/v1/convert-query` and `/v1/running-query` were not found.
- **Meta values for less common types.** What `/v1/meta` returns for `geo`/`switch` dimensions, and which `aggType` values the server emits beyond the documented `count` example.
- **WebSocket path and push behaviour.** No default for `webSocketsBasePath` was found in `server.ts`/`websocket-server.ts`. Also unknown whether WebSocket subscriptions push only when results change or on every 5 s re-execution.
- **Personal Core Data API Token availability.** Whether it is Cloud-only is not stated ([cda-index]).
- **GraphQL custom granularities.** Whether custom granularities appear as GraphQL time fields is unverified.
- **SQL `COUNT(DISTINCT dimension)`.** Plan type and pre-aggregation use are unverified.
- **Bundle size.** The bundlephobia API returned 503; bundle size is unverified.
- **React 19 test coverage.** React 19 is not in upstream devDependencies. Compatibility rests on the source review above plus [i9797].
- **Source-reading findings not checked at runtime:** the 502 retry precedence (Gotcha 10), `fetchTimeout` scope (Gotcha 11), and `resType` being unused by `load()`.

[rest-ref]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
[rest-index]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/index.mdx
[rest-qf]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/rest-api/query-format.mdx
[queries]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/queries.mdx
[cda-index]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/index.mdx
[gql-index]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/graphql-api/index.mdx
[gql-ref]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/graphql-api/reference.mdx
[sql-index]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/index.mdx
[sql-qf]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/query-format.mdx
[sql-ref]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/reference.mdx
[sql-joins]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/joins.mdx
[sql-sec]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/sql-api/security.mdx
[mdx]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/mdx-api.mdx
[dax]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/dax-api/index.mdx
[xirr]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/core-data-apis/xirr.mdx
[r-pag]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/recipes/core-data-api/pagination.mdx
[r-drill]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/recipes/core-data-api/drilldowns.mdx
[r-uniq]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/recipes/core-data-api/getting-unique-values-for-a-field.mdx
[r-sort]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/recipes/core-data-api/sorting.mdx
[r-cast]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/recipes/core-data-api/cast-numerics.mdx
[r-rt]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/recipes/core-data-api/real-time-data-fetch.mdx
[r-cloudgroups]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/recipes/core-data-api/cloud-groups-and-user-attributes.mdx
[sdk-core-ref]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/javascript-sdk/reference/cubejs-client-core.mdx
[sdk-ws-ref]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/javascript-sdk/reference/cubejs-client-ws-transport.mdx
[env]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/configuration/environment-variables.mdx
[measures]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/data-modeling/measures.mdx
[dimensions]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/data-modeling/dimensions.mdx
[ctx]: https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/docs/data-modeling/access-control/context.mdx
[src-core-index]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/index.ts
[src-core-types]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/types.ts
[src-core-rs]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/ResultSet.ts
[src-core-http]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/HttpTransport.ts
[src-core-meta]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/Meta.ts
[src-core-time]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/time.ts
[src-core-utils]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/utils.ts
[src-core-reqerr]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/RequestError.ts
[src-react-index]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-react/src/index.ts
[src-react-types]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-react/src/types.ts
[src-react-query]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-react/src/hooks/cube-query.ts
[src-react-fetch]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-react/src/hooks/cube-fetch.ts
[src-react-meta]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-react/src/hooks/cube-meta.ts
[src-react-dry]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-react/src/hooks/dry-run.ts
[src-react-lazy]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-react/src/hooks/lazy-dry-run.ts
[src-react-sql]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-react/src/hooks/cube-sql.ts
[src-react-provider]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-react/src/CubeProvider.tsx
[src-react-qb]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-react/src/QueryBuilder.tsx
[src-react-qr]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-react/src/QueryRenderer.tsx
[src-ws]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-ws-transport/src/index.ts
[src-gw]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts
[src-gw-query]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/query.js
[src-gw-gql]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/graphql.ts
[src-gw-ws]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/ws/subscription-server.ts
[src-gw-metaext]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/helpers/transform-meta-extended.ts
[src-server]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server/src/server.ts
[src-server-ws]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server/src/websocket-server.ts
[src-rust-transform]: https://github.com/cube-js/cube/blob/v1.7.42/rust/cube/cubeorchestrator/src/query_result_transform.rs
[chg-root]: https://github.com/cube-js/cube/blob/v1.7.42/CHANGELOG.md
[chg-react]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-react/CHANGELOG.md
[npm-core]: https://registry.npmjs.org/@cubejs-client/core/latest
[npm-react]: https://registry.npmjs.org/@cubejs-client/react/latest
[npm-ws]: https://registry.npmjs.org/@cubejs-client/ws-transport/latest
[unpkg-core-pkg]: https://unpkg.com/@cubejs-client/core@1.7.42/package.json
[unpkg-core-dts]: https://unpkg.com/@cubejs-client/core@1.7.42/dist/src/index.d.ts
[unpkg-core-js]: https://unpkg.com/@cubejs-client/core@1.7.42/dist/src/index.js
[unpkg-react-pkg]: https://unpkg.com/@cubejs-client/react@1.7.42/package.json
[unpkg-react-qb-dts]: https://unpkg.com/@cubejs-client/react@1.7.42/dist/QueryBuilder.d.ts
[unpkg-ws-pkg]: https://unpkg.com/@cubejs-client/ws-transport@1.7.42/package.json
[unpkg-isows]: https://unpkg.com/isomorphic-ws@4.0.1/package.json
[i9797]: https://github.com/cube-js/cube/issues/9797
[i8050]: https://github.com/cube-js/cube/issues/8050
[i5056]: https://github.com/cube-js/cube/issues/5056
[i8263]: https://github.com/cube-js/cube/issues/8263
[i10041]: https://github.com/cube-js/cube/issues/10041
[i2380]: https://github.com/cube-js/cube/issues/2380
[react19]: https://react.dev/blog/2024/04/25/react-19-upgrade-guide
[vite-prebundle]: https://vite.dev/guide/dep-pre-bundling
[joi-api]: https://github.com/hapijs/joi/blob/master/API.md
[ws-cve]: https://github.com/advisories/GHSA-3h5v-q93c-6h6q
