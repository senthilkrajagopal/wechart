---
library: client-side routing (comparison)
packages: [react-router, '@tanstack/react-router']
version: 'react-router@8.4.0; @tanstack/react-router@1.170.38'
researched: 2026-09-19
sources:
  - https://registry.npmjs.org/react-router
  - https://registry.npmjs.org/@tanstack/react-router
  - https://unpkg.com/react-router@8.4.0/package.json
  - https://unpkg.com/@tanstack/react-router@1.170.38/package.json
  - https://raw.githubusercontent.com/remix-run/react-router/main/CHANGELOG.md
  - https://reactrouter.com
  - https://tanstack.com/router/latest/docs
  - https://chromium.googlesource.com/chromium/src/+/main/docs/security/url_display_guidelines/url_display_guidelines.md
  - https://nodejs.org/api/cli.html
  - https://url.spec.whatwg.org/
  - https://bundlephobia.com
  - https://github.com/remix-run/react-router
  - https://github.com/TanStack/router
---

# Client-side routing: React Router 8.4.0 vs TanStack Router 1.170.38

## Summary

Evaluated for AC-002 (URL restores workspace/dashboard/chart/model selection on reload), AC-081 (filters in dashboard URL), AC-123 (shareable URL reproduces filters+marks), AC-003 (theme switch doesn't touch route/scroll). Marks are OR-of-AND-tuples over dimension members, so URL state can be large and needs compact, customizable encoding.

## Versions and React 19

- **react-router 8.4.0** (released 2026-09-15, MIT): `peerDependencies` require **react >=19.2.7, react-dom >=19.2.7 (optional)**; `engines.node >=22.22.0`; ESM-only (`"type":"module"`). React Router v8's CHANGELOG "Baseline Support" section states minimums of **Node 22.22.0+, React 19.2.7+, Vite 7+**, and removes `react-router-dom` (merged into `react-router`/`react-router/dom`) and CommonJS builds. [source: unpkg package.json](https://unpkg.com/react-router@8.4.0/package.json), [CHANGELOG](https://raw.githubusercontent.com/remix-run/react-router/main/CHANGELOG.md)
- **@tanstack/react-router 1.170.38** (current `latest` dist-tag, MIT): `peerDependencies`: `react: ">=18.0.0 || >=19.0.0"`, `react-dom` same; `engines.node ">=20.19"`. Supports React 18 and 19 concurrently — no forced React 19 floor. [source: unpkg package.json](https://unpkg.com/@tanstack/react-router@1.170.38/package.json)
- Both satisfy the project's React 19 requirement. React Router v8 is React-19-only (hard floor), which is fine here but signals an aggressive, yearly-major-release cadence going forward (own CHANGELOG: "first major release on our new planned yearly major release cadence"). [source](https://raw.githubusercontent.com/remix-run/react-router/main/CHANGELOG.md)

## Typed routes / typed search params

- **React Router 8**: path params are typed via generated `./+types/<route>` files (`Route.LoaderArgs`, `Route.ComponentProps`) derived from the route config, giving compile-time typing for `:id`-style segments. [source](https://reactrouter.com/start/framework/routing)
  - **Search params have no built-in typing or validation.** `useSearchParams()` returns `[URLSearchParams, setSearchParams]` — a raw, untyped `URLSearchParams` wrapper; the docs explicitly show no compile-time param-name checking, no runtime validation, and no custom serializer hook. Any typed/compact encoding for filters and marks would have to be hand-built on top of raw strings. [source](https://reactrouter.com/api/hooks/useSearchParams)
- **TanStack Router 1.170**: search params are parsed to structured JSON automatically, then passed through a route's `validateSearch` option, which types and validates `Record<string, unknown>` into a trusted shape (works with Zod/Valibot/ArkType/Effect Schema adapters). Router-wide `parseSearch`/`stringifySearch` (via `parseSearchWith`/`stringifySearchWith`) let you swap the whole serializer — documented examples include base64/binary encoding, `query-string`, `jsurl2` (compact, URL-safe positional encoding), and `zipson` (JSON compression) — directly matching the need for a compact encoding of OR-of-AND filter/mark tuples. [source](https://tanstack.com/router/latest/docs/framework/react/guide/custom-search-param-serialization)
  - Full type inference additionally requires registering the router type (`declare module` on `Register`) and generating `routeTree.gen.ts`. [source](https://tanstack.com/router/latest/docs/framework/react/guide/type-safety)

## URL length limits

- **Spec**: WHATWG URL Standard defines no maximum URL length at all — it's purely an implementation choice. [source](https://url.spec.whatwg.org/)
- **Chromium**: internal cap is effectively 2 MB for a URL to be processed; the omnibox additionally truncates _display_ at `kMaxURLDisplayChars` = 32 KB (a VR-specific path caps at 1 KB). Exceeding the internal cap means Chrome will not navigate/process the URL at all. [source](https://chromium.googlesource.com/chromium/src/+/main/docs/security/url_display_guidelines/url_display_guidelines.md)
- **Firefox/Safari**: UNVERIFIED — could not obtain a primary-source numeric limit within tool budget; commonly cited figures (~65k for Firefox, ~80k for Safari) are from secondary/blog sources only and are excluded here.
- **Node HTTP server**: `--max-http-header-size` defaults to **16 KiB (16,384 bytes)** for combined request headers (request line included in the parser's header-size accounting); exceeding it triggers `HPE_HEADER_OVERFLOW` and a `431 Request Header Fields Too Large` response. [source](https://nodejs.org/api/cli.html)
- **Implication for wechart**: since a marking is an OR-of-AND-tuple set, an all-in-URL encoding risks silent truncation well before Chrome's 2 MB ceiling if it ever passes through a Node server (16 KB) or any intermediary with a smaller limit, and general web practice keeps URLs far under 8 KB for cross-service safety (proxies, email, chat apps) — none of the routers change this physics; a compact serializer (TanStack's pluggable `stringifySearch`) reduces risk but does not eliminate the need to consider a server-side short-link fallback for very large mark sets. This is an architecture decision independent of router choice.

## Scroll restoration and preserving state across navigations

- **React Router 8**: `<ScrollRestoration>` component, rendered once at the root, stores positions in `sessionStorage`, restores on `popstate`/navigation via a `getKey` prop (default `location.key`, can switch to `location.pathname`), supports `nonce` and `storageKey`. Preserving non-scroll UI state (e.g., theme) across navigation is left entirely to application state (React state/context), not a router feature. [source](https://reactrouter.com/api/components/ScrollRestoration) — note: docs page is under `/api/components/ScrollRestoration`, an earlier `/how-to/scroll-restoration` path 404s.
- **TanStack Router 1.170**: `scrollRestoration: true` on `createRouter`; restores scroll "before DOM paint," supports per-navigation opt-out (`resetScroll: false` on `Link`/`navigate`/`redirect`), a `useElementScrollRestoration` hook + `data-scroll-restoration-id` for virtualized/nested scroll containers, and a customizable `getScrollRestorationKey`. [source](https://tanstack.com/router/latest/docs/framework/react/guide/scroll-restoration)
- For AC-003 (theme switch, no route change, no scroll loss): neither router is involved in theme state — both are satisfied trivially since theme switching shouldn't call router APIs at all; TanStack's explicit per-element scroll IDs are more directly useful if wechart's dashboard canvas has independently scrollable panels (trellis/sections), which is plausible given the DnD dashboard design.

## Code splitting with Vite / data loading

- **React Router 8 (framework mode)**: route-based code splitting is automatic per route module; `splitRouteModules` (default `true`) further splits `clientLoader`/`clientAction`/`clientMiddleware`/`HydrateFallback`/component into separate chunks so route code can start executing before the component chunk finishes downloading. Loaders (`loader`/`clientLoader`) are a first-class React Router concept tied to route modules. [source](https://reactrouter.com/explanation/code-splitting)
- **TanStack Router 1.170**: code splitting via the Vite plugin's `autoCodeSplitting: true` (splits loader/path-matching-critical code from deferrable component/error-handler code automatically), or manually via `.lazy.tsx` + `createLazyFileRoute` paired with a thin `createFileRoute` file for the loader. [source](https://tanstack.com/router/latest/docs/framework/react/guide/code-splitting)
- Both have route `loader` APIs; wechart's data layer (Cube client) is separate per project decision, so loaders would at most be used to prefetch/await route-level data, not required — both integrate fine as pure client-side SPA routers (React Router used in "framework mode" here would pull in a build plugin/config layer; TanStack Router is router-first with an optional Vite plugin only for codegen/splitting, not a full framework mode).

## Bundle size, licence, maintenance

- **react-router 8.4.0**: 60,428 B gzip / 191,963 B min (includes `cookie-es`, `@remix-run/route-pattern` deps ≈28 KB of that). MIT. Repo: 56.6k stars, 103 open issues, 11,243 commits. [source](https://bundlephobia.com/api/size?package=react-router@8.4.0), [source](https://github.com/remix-run/react-router)
- **@tanstack/react-router 1.170.38**: 30,913 B gzip / 90,878 B min. MIT. Repo: 15.1k stars, 297 open issues, 6,618 commits. [source](https://bundlephobia.com/api/size?package=@tanstack/react-router@1.170.38), [source](https://github.com/TanStack/router)
- TanStack Router ships roughly half the gzip size of React Router 8 for the core client package.

## Gotchas

- React Router v8 dropped `react-router-dom` and CommonJS; only ESM imports from `react-router` / `react-router/dom` work — check any tooling assuming the old package name. [source](https://raw.githubusercontent.com/remix-run/react-router/main/CHANGELOG.md)
- React Router v8 hard-requires React ≥19.2.7 and Node ≥22.22.0 — no fallback path if a future dependency needs React 18. [source](https://unpkg.com/react-router@8.4.0/package.json)
- React Router has no built-in search-param validation/typing or pluggable serializer; any compact encoding for AC-081/AC-123 must be built manually on top of `URLSearchParams`, with no framework guarantee of round-trip correctness. [source](https://reactrouter.com/api/hooks/useSearchParams)
- TanStack Router's own docs warn that custom serializers must be **idempotent** (decode(encode(x)) === x) — a real risk for OR-of-AND mark tuples if a chosen compact codec (e.g., a hand-rolled bit-packing scheme) isn't carefully round-trip-tested. [source](https://tanstack.com/router/latest/docs/framework/react/guide/custom-search-param-serialization)
- TanStack Router's registry `dist-tags` show only `latest` (1.170.38), `alpha`, `beta`, `pre` — no `next`/`rc` tag currently published, though the GitHub releases list separately showed `2.0.0-rc.8`-style entries; could not confirm 2.0's exact stability/release timeline from primary sources within budget — treat a future 1.x→2.x migration as a possibility to monitor. [source](https://registry.npmjs.org/@tanstack/react-router)
- Firefox/Safari practical URL length ceilings are UNVERIFIED here (tried WHATWG spec, MDN 414 page, Mozilla source docs — none gave a numeric Firefox/Safari limit); only Chromium's numbers (2 MB internal / 32 KB omnibox display) and Node's 16 KiB header default are sourced.

## Recommendation

On correctness/fit grounds for AC-002/081/123 (URL must carry large, structured, compactly-encoded filter/mark state and reproduce it exactly on reload/share): **TanStack Router** provides framework-level, typed, pluggable search-param serialization (`validateSearch` + `parseSearch`/`stringifySearch`) purpose-built for exactly this problem, whereas React Router 8 offers only raw `URLSearchParams` with no validation or serializer hook, pushing all of that correctness burden into hand-written application code with no router-level type guarantee. TanStack Router also ships a materially smaller client bundle (≈31 KB vs ≈60 KB gzip) and supports React 18 and 19 rather than forcing a React 19.2.7 floor. React Router's advantages are a larger community/star count and (for AC-003) an equivalent `ScrollRestoration` primitive — but scroll restoration is offered by both routers on comparable terms, so it does not differentiate. Recommend **TanStack Router** for the URL-state-heavy, non-SSR SPA described in the ACs.

## Open questions / unverified

- Firefox and Safari numeric URL length limits — not found in primary sources within tool budget; needed before finalizing whether marks can ever live fully in-URL versus require a server-side short-link fallback across all target browsers.
- TanStack Router 2.0 exact release/stability status (rc vs. stable, target date) — GitHub releases page showed `2.0.0-rc.8`-era entries but npm `dist-tags` show no `next`/`rc` tag; ask TanStack maintainers' changelog or re-check closer to implementation.
- Whether wechart's SPA is served in production behind a Node HTTP server (subject to the 16 KiB header default) or a different server (e.g., nginx/CDN) — determines whether the Node header-size limit is actually load-bearing for in-URL mark encoding.
