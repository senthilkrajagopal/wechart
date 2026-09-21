---
library: TanStack Router (search-param state and history addendum)
packages: ['@tanstack/react-router']
version: '1.170.38'
researched: 2026-09-21
sources:
  - https://registry.npmjs.org/@tanstack/react-router/latest
  - https://tanstack.com/router/latest/docs/framework/react/guide/search-params
  - https://tanstack.com/router/latest/docs/framework/react/api/router/RouteOptionsType
  - https://tanstack.com/router/latest/docs/framework/react/api/router/useSearchHook
  - https://tanstack.com/router/latest/docs/framework/react/api/router/NavigateOptionsType
  - https://tanstack.com/router/latest/docs/framework/react/api/router/ToOptionsType
  - https://tanstack.com/router/latest/docs/framework/react/guide/navigation
  - https://tanstack.com/router/latest/docs/framework/react/api/router/useNavigateHook
  - https://tanstack.com/router/latest/docs/framework/react/api/router/navigateComponent
  - https://tanstack.com/router/latest/docs/framework/react/api/router/useCanGoBack
  - https://tanstack.com/router/latest/docs/framework/react/api/router/RouterEventsType
  - https://tanstack.com/router/latest/docs/framework/react/api/router/RouterType
  - https://tanstack.com/router/latest/docs/framework/react/api/router/ParsedHistoryStateType
  - https://tanstack.com/router/latest/docs/framework/react/guide/history-types
  - https://tanstack.com/router/latest/docs/framework/react/guide/scroll-restoration
  - https://tanstack.com/router/latest/docs/framework/react/guide/navigation-blocking
  - /Users/srajagopal/Work/wechart/node_modules/.pnpm/@tanstack+react-router@1.170.38_react-dom@19.3.0_react@19.3.0__react@19.3.0/node_modules/@tanstack/react-router/src
  - /Users/srajagopal/Work/wechart/node_modules/.pnpm/@tanstack+router-core@1.171.32/node_modules/@tanstack/router-core/src
  - /Users/srajagopal/Work/wechart/node_modules/.pnpm/@tanstack+history@1.162.4/node_modules/@tanstack/history/src/index.ts
  - /Users/srajagopal/Work/wechart/node_modules/.pnpm/@tanstack+react-store@0.11.1_react-dom@19.3.0_react@19.3.0__react@19.3.0/node_modules/@tanstack/react-store/src/useSelector.ts
  - https://react.dev/reference/react/StrictMode
  - https://react.dev/reference/react-dom/createPortal
  - https://react.dev/reference/react/useSyncExternalStore
  - https://developer.mozilla.org/en-US/docs/Web/API/History/pushState
  - https://www.typescriptlang.org/tsconfig/#exactOptionalPropertyTypes
---

# TanStack Router 1.170.38: search-param state and history (addendum)

This addendum to `docs/research/router.md` covers only what that doc leaves out: search-param state, history, Back/Forward, remounting and scroll. It uses `@tanstack/react-router@1.170.38`, which depends on `@tanstack/router-core@1.171.32` and `@tanstack/history@1.162.4`.

**Source path shorthands.** Installed-source citations below use these prefixes. Line numbers refer to the installed files.

- `RR/` = `/Users/srajagopal/Work/wechart/node_modules/.pnpm/@tanstack+react-router@1.170.38_react-dom@19.3.0_react@19.3.0__react@19.3.0/node_modules/@tanstack/react-router/src/`
- `RC/` = `/Users/srajagopal/Work/wechart/node_modules/.pnpm/@tanstack+router-core@1.171.32/node_modules/@tanstack/router-core/src/`
- `H` = `/Users/srajagopal/Work/wechart/node_modules/.pnpm/@tanstack+history@1.162.4/node_modules/@tanstack/history/src/index.ts`
- `RS/` = `/Users/srajagopal/Work/wechart/node_modules/.pnpm/@tanstack+react-store@0.11.1_react-dom@19.3.0_react@19.3.0__react@19.3.0/node_modules/@tanstack/react-store/src/`

## Summary

T196 is part of AC-002 ("…change the URL so that reloading it restores the same surface and the same selected object"). Its route is `/explore/dashboards/$objectId`. Opening the chart-editor overlay must add `?edit=<tileId>`. Reloading that URL must reopen the overlay. The browser's Back must close the overlay, run the app's own "keep the changes" logic, and leave the dashboard component mounted with its in-memory edit session intact.

Short answers:

1. **The route can carry `edit`.** A plain-function `validateSearch` declares it.
2. **Search-only navigation keeps the component.** Push, replace and Back/Forward that change only search params leave the route component mounted. It does not remount unless `remountDeps` or `defaultRemountDeps` is configured, and neither is by default.
3. **Back is observable.** The router re-renders subscribed hooks with the new search. App code can tell a traversal (`BACK`/`FORWARD`/`GO`) from a navigation (`PUSH`/`REPLACE`) only through `router.history.subscribe` or `useBlocker`. Router lifecycle events do not carry the action.

Every claim is sourced inline below.

## Install

Nothing new to install. `packages/web/package.json` already pins `"@tanstack/react-router": "1.170.38"` (`/Users/srajagopal/Work/wechart/packages/web/package.json:15`). The registry `latest` is still `1.170.38`, with dependencies `@tanstack/history` `1.162.4` and `@tanstack/router-core` `1.171.32` ([registry](https://registry.npmjs.org/@tanstack/react-router/latest)).

Types such as `HistoryState`, `RouterHistory` and `HistoryLocation` are re-exported from `@tanstack/react-router` (`RR/index.tsx:112-123`). App code does not need a direct `@tanstack/history` dependency to name them.

## Init / auth pattern

The router is created with `createRouter({ routeTree })` and no `history`, `scrollRestoration`, `defaultRemountDeps` or `search` options (`/Users/srajagopal/Work/wechart/packages/web/src/router/routes.tsx:185-187`). The defaults that follow from that:

- **History:** a browser history created with `createBrowserHistory()` (`RC/router.ts:1279-1286`).
- **Search serialisation:** `defaultParseSearch` and `defaultStringifySearch` (`RC/router.ts:1227-1228`).
- **Unknown search keys:** kept, because `search.strict` defaults to `false` (`RC/router.ts:450-458`).
- **Remounting:** no remount keying (`RR/Match.tsx:192-213`).
- **Scroll:** the window is still scrolled to the top after navigations, even though scroll restoration is off (see Q8).

The app renders inside `<StrictMode>` (`/Users/srajagopal/Work/wechart/packages/web/src/main.tsx:32`). The TypeScript base config enables `exactOptionalPropertyTypes: true` (`/Users/srajagopal/Work/wechart/tsconfig.base.json:23`).

A minimal route declaration that fits the sources below. This is illustrative, not decided code.

```tsx
type DashboardSearch = { edit?: string | undefined }; // `| undefined` needed under exactOptionalPropertyTypes

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/explore/dashboards/$objectId',
  validateSearch: (search: Record<string, unknown>): DashboardSearch => ({
    // Return the key explicitly (see Gotchas: an omitted key lets the raw value through)
    edit: typeof search.edit === 'string' && search.edit !== '' ? search.edit : undefined,
  }),
  component: DashboardSurface,
});
```

A component module that `routes.tsx` imports (for example `DashboardPage`) can read this route without importing `routes.tsx` by calling `getRouteApi('/explore/dashboards/$objectId')` (`RR/route.tsx:91-96`). Its `.useSearch()` calls `useSearch({ ...opts, from: this.id })` (`RR/route.tsx:117-119`). For a first-level child of the root, the route id is `'/' + path` (`RC/route.ts:1816-1832`), so here the id is `/explore/dashboards/$objectId`.

## API surface we will use

### `validateSearch` (route option)

- **Signature:** `validateSearch?: Constrain<TSearchValidator, AnyValidator, DefaultValidator>` (`RC/route.ts:980`). `Validator<TInput, TOutput>` accepts:
  - a plain function `ValidatorFn = (input: TInput) => TOutput`;
  - an object with `parse`;
  - an adapter;
  - a Standard Schema validator (`RC/validators.ts:60-67`).
- **Runtime dispatch:** Standard Schema first, then `.parse`, then a plain function. `null`/`undefined` yields `{}`. An async Standard Schema result throws `SearchParamError('Async validation not supported')` (`RC/router.ts:2841-2867`).
- **Docs:** type `(rawSearchParams: unknown) => TSearchSchema`. "If this function throws, the route will be put into an error state and the error will be thrown during render." ([RouteOptionsType](https://tanstack.com/router/latest/docs/framework/react/api/router/RouteOptionsType)). The docs example uses `(search: Record<string, unknown>): ProductSearch => ({...})` ([search-params guide](https://tanstack.com/router/latest/docs/framework/react/guide/search-params)).

### `useSearch`

```ts
function useSearch<TRouter = RegisteredRouter, const TFrom = undefined, TStrict extends boolean = true,
  TThrow extends boolean = true, TSelected = unknown, TStructuralSharing extends boolean = boolean>(
  opts: ( { from: RouteId; strict?: true } | { strict: false; from?: never } ) & {
    select?: (search) => TSelected; shouldThrow?: TThrow; structuralSharing?: boolean;
  },
): ThrowOrOptional<UseSearchResult<TRouter, TFrom, TStrict, TSelected>, TThrow>
```

- Declared at `RR/useSearch.tsx:77-106`. The `from`/`strict` union is `StrictOrFrom` (`RC/utils.ts:447-459`).
- **Result type:** with `strict: false` it is `FullSearchSchema<routeTree>`. Otherwise it is that route's `fullSearchSchema` (`RC/useSearch.ts:14-20`).
- **Docs:** `from` is "The RouteID to match the search query parameters from". `strict` defaults to `true`. `shouldThrow` defaults to `true` ([useSearch](https://tanstack.com/router/latest/docs/framework/react/api/router/useSearchHook)).
- **`Route.useSearch(opts?)`** equals `useSearch({ ...opts, from: this.id })` (`RR/route.tsx:257-259`). Its option type is `UseSearchRoute<TId>` (`RR/useSearch.tsx:48-63`).

### `useNavigate` / `router.navigate`

```ts
function useNavigate<TRouter = RegisteredRouter, TDefaultFrom extends string = string>(
  _defaultOpts?: { from?: FromPathOption<TRouter, TDefaultFrom> },
): UseNavigateResult<TDefaultFrom>                    // (opts: NavigateOptions) => Promise<void>
type NavigateFn = (opts: NavigateOptions) => Promise<void>   // router.navigate
```

- `useNavigate` is declared at `RR/useNavigate.tsx:28-45`. `UseNavigateResult` is at `RC/useNavigate.ts:4-13`. `NavigateFn` is at `RC/RouterProvider.ts:25-33`.
- `Route.useNavigate()` equals `useNavigate({ from: this.fullPath })` (`RR/route.tsx:273-275`).
- `NavigateOptions = ToOptions & NavigateOptionProps` (`RC/link.ts:289-295`). The fields that matter here:
  - `to?`, `from?`, `hash?`, `unsafeRelative?` and `state?: true | NonNullableUpdater<ParsedHistoryState, HistoryState>` (`RC/link.ts:433-442`).
  - `search?: true | TToSearch | ((current: TFromSearch) => TToSearch)` (`RC/link.ts:444-451, 541-547`).
  - `params?`.
  - `replace?: boolean`, default `false` (`RC/link.ts:316`).
  - `resetScroll?: boolean`, default `true` (`RC/link.ts:323`).
  - `ignoreBlocker?: boolean`, default `false` (`RC/link.ts:344`).
  - `hashScrollIntoView?`, `viewTransition?`, `reloadDocument?`, `href?` (`RC/link.ts:301-358`).
  - The docs confirm the `replace` and `resetScroll` defaults ([NavigateOptions](https://tanstack.com/router/latest/docs/framework/react/api/router/NavigateOptionsType)).
- **When the promise resolves:** after `onResolved`/`onRendered` have been emitted for that navigation (`RC/load-client.ts:1901-1915`).

### `RouterHistory` (`router.history`, also `useRouter().history`)

```ts
interface RouterHistory {
  location: HistoryLocation; length: number;
  subscribe: (cb: (opts: { location: HistoryLocation; action: { type: 'PUSH'|'REPLACE'|'BACK'|'FORWARD' } | { type: 'GO'; index: number } }) => void) => () => void;
  push(path: string, state?: any, navigateOpts?: { ignoreBlocker?: boolean }): void;
  replace(path: string, state?: any, navigateOpts?: { ignoreBlocker?: boolean }): void;
  go(index: number, navigateOpts?): void; back(navigateOpts?): void; forward(navigateOpts?): void;
  canGoBack(): boolean; block(blocker: NavigationBlocker): () => void; flush(): void; /* … */
}
```

- The interface and the `SubscriberArgs`/action types are at `H:5-42`.
- `HistoryLocation` = `{ href, pathname, search: string, hash, state: ParsedHistoryState }` (`H:44-61`).
- `router.history` is a public field (`RC/router.ts:1175`). `useRouter()` returns the router from context (`RR/useRouter.tsx:17-25`).
- The history docs pages do not document these methods ([RouterType](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterType), [history-types](https://tanstack.com/router/latest/docs/framework/react/guide/history-types)). The installed source is the only source for them.

### `useCanGoBack(): boolean`

- Exported (`RR/index.tsx:297`). It returns `location.state.__TSR_index !== 0` from the router's location store (`RR/useCanGoBack.ts:5-17`).
- The docs mark it "currently experimental" and say the index "is reset after a navigation with `reloadDocument` set as `true`" ([useCanGoBack](https://tanstack.com/router/latest/docs/framework/react/api/router/useCanGoBack)).

### `useLocation(opts?: { select?, structuralSharing? })`

- Subscribes to `router.stores.location` (`RR/useLocation.tsx:45-68`).
- Its `search` is the raw `parseSearch` output, not run through `validateSearch` (`RC/router.ts:1464-1483`).

### `useBlocker(opts)`

```ts
useBlocker({ shouldBlockFn: ({ current, next, action }) => boolean | Promise<boolean>,
             enableBeforeUnload?: boolean | (() => boolean) /* default true */,
             disabled?: boolean, withResolver?: boolean })
```

- Types are at `RR/useBlocker.tsx:61-78`. The `enableBeforeUnload = true` default is at `RR/useBlocker.tsx:157-162`.
- `current.search` and `next.search` are raw `parseSearch` output, not validated (`RR/useBlocker.tsx:191, 200`).
- The blocker is registered through `history.block` inside a `useEffect` (`RR/useBlocker.tsx:176-261`).
- Docs: [navigation-blocking](https://tanstack.com/router/latest/docs/framework/react/guide/navigation-blocking).

### `router.subscribe(eventType, fn): () => void`

- Declared at `RC/router.ts:645-648, 1427-1438`; docs at [RouterType](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterType).
- The events are `onBeforeNavigate`, `onBeforeLoad`, `onLoad`, `onBeforeRouteMount`, `onResolved` and `onRendered`. Each payload is `{ type, fromLocation?, toLocation, pathChanged, hrefChanged, hashChanged }`, with no history action (`RC/router.ts:607-634`; [RouterEventsType](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterEventsType)).

## Behaviour answers

### Q1. Declaring an optional `edit` with a plain-function `validateSearch`

**What the function receives.** It gets `{ ...parentSearch }`: the whole accumulated search for the URL. That includes keys owned by other routes and unknown keys (`RC/router.ts:1610-1616`). The default parser has already converted values:

- numeric-looking strings become numbers, and `'true'`/`'false'` become booleans (`RC/qss.ts:49-55`);
- repeated keys become arrays (`RC/qss.ts:64-81`);
- values that start like JSON are `JSON.parse`d (`RC/searchParams.ts:6, 26-53`).

So `search.edit` can be `string | number | boolean | unknown[] | object | ''`, and the validator must type-check it.

**Typing.**

- The output type is the function's return type (`RC/validators.ts:107-121`).
- The input type that `navigate`/`Link` accept is that same return type, unless the parameter is typed with `SearchSchemaInput` (`RC/validators.ts:75-81`).
- `search` becomes *required* on every navigation/Link to the route only when `{}` is not assignable to that type (`IsRequiredParams`, `RC/link.ts:30-31, 606-609`). So `edit` must be optional.
- Under `exactOptionalPropertyTypes`, assigning `undefined` to an optional property is an error "unless the type explicitly includes `undefined`" ([TS docs](https://www.typescriptlang.org/tsconfig/#exactOptionalPropertyTypes)). Declare `edit?: string | undefined` so that updaters can write `edit: undefined`.

**Unknown keys** are kept in `match.search`, because it is built as `{ ...parentSearch, ...strictSearch }` (`RC/router.ts:1618-1621`) and `search.strict` defaults to `false` (`RC/router.ts:450-458`). They also survive `search: (prev) => ({ ...prev, … })` (`RC/router.ts:1833-1843, 2077-2099`).

**Malformed values.** There are three cases:

1. **The validator returns the key with a sanitised value** (for example `edit: undefined`). Components see that value. On first load, the Transitioner rebuilds the URL through `validateSearch`. If the canonical href differs, it commits it with `replace: true, ignoreBlocker: true` (`RR/Transitioner.tsx:50-74`, with the validate middleware at `RC/router.ts:2950-2968`). So `?edit=<garbage>` is replaced in place by the URL without `edit`.
2. **The validator omits the key.** The raw value survives the merge and reaches `useSearch` (`RC/router.ts:1618-1621`), even though the type says `string | undefined`.
3. **The validator throws.** The error is wrapped in a `SearchParamError` stored on the match (`RC/router.ts:1623-1638`). The route's `onError` runs and the match enters the error state (`RC/load-client.ts:324-335, 411-417`). `MatchInner` then throws the error during render (`RR/Match.tsx:231-251`), so the `errorComponent` renders "instead of the route's `component`" ([search-params guide](https://tanstack.com/router/latest/docs/framework/react/guide/search-params)).
   - wechart's root and dashboard routes have no `errorComponent`, and the router has no `defaultErrorComponent` (`routes.tsx:32-40, 90-94, 186`). The error therefore reaches the global `CatchBoundary` in `Matches` (`RR/Matches.tsx:107-124`), and the dashboard subtree is replaced.
   - The URL is not canonicalised in this case, because the validate middleware swallows the throw and keeps the raw search (`RC/router.ts:2965-2968`).

### Q2. Reading search params

- **`useSearch({ from })`** ignores the nearest match and reads that route's match store by id (`RR/useMatch.tsx:146-151`). It throws `Could not find an active match from "<id>"` when that route is not currently matched, unless `shouldThrow: false` (`RR/useMatch.tsx:181-195`).
- **`useSearch({ strict: false })`** reads the **nearest** match from `matchContext`, which `MatchView` provides (`RR/Match.tsx:127`; `RR/useMatch.tsx:146-151`). It is typed as the tree-wide `FullSearchSchema` (`RC/useSearch.ts:14-20`). It throws "Could not find a nearest match!" when rendered outside any match (`RR/useMatch.tsx:185-195`).
- **`Route.useSearch()`** is equivalent to `useSearch({ from: Route.id })` (`RR/route.tsx:257-259`).
- **What they all return:** `match.search`, selected by `select` if one is given (`RR/useSearch.tsx:97-105`). That is the accumulated, validated-and-merged search: validated keys plus unknown keys. It is not `_strictSearch`.
- **When they update:** when the router commits new matches, which happens inside `React.startTransition` (`RR/Transitioner.tsx:31-37`; `RC/load-client.ts:1870-1881`). `useLocation()` updates earlier, because the location store is set when the load starts (`RC/load-client.ts:2037-2040`).

### Q3. Changing only the search params

- **Omitting `to`** is the same as `'.'` (`RC/router.ts:1959`). It resolves against `dest.from ?? <current location's leaf route fullPath>` (`RC/router.ts:1960-1970`), and `resolvePath(base, '.')` returns the base (`RC/path.ts:124-135`).
- **Path params** are inherited from the current match when `params` is `undefined` or `true` and the destination is a template (`RC/router.ts:2031-2036, 2869-2907`). So `navigate({ search: … })`, or `to: '.'`, keeps both the route and `$objectId`. The docs describe `to="."` as "reload the current location or provided `from` path" ([navigation guide](https://tanstack.com/router/latest/docs/framework/react/guide/navigation)).
- **`from` for typing:** without `from`, typing treats the navigation as coming from root and the updater's `prev` is the tree-wide union. The docs recommend passing `from` ([navigation guide](https://tanstack.com/router/latest/docs/framework/react/guide/navigation)). Use `Route.useNavigate()` or `useNavigate({ from: '/explore/dashboards/$objectId' })` (`RR/route.tsx:273-275`).
- **`search` forms.** Navigations always run with `_includeValidateSearch: true` (`RC/router.ts:2348`). Because the dashboard route has a `validateSearch`, the validate middleware runs, and search is resolved by `applySearchMiddleware` (`RC/router.ts:2103-2104, 2978-3018`):
  - `search` omitted or falsy: the result is `{}` and **all current search params are dropped** (`RC/router.ts:2990-2992`).
  - `search: true`: the current search is kept (`RC/router.ts:2993-2995`).
  - `search: (prev) => next`: `prev` is the current location's accumulated search (validated keys plus unknown keys) (`RC/router.ts:2077-2099, 1833-1843`). The result then passes through `validateSearch` and is merged as `{ ...result, ...validated }` (`RC/router.ts:2952-2968`).
  - `search: {…}` (object): used as-is, then validated. Keys not in the object are dropped.
- **History entry.** The default is **push**: `historyAction = next.replace ? 'REPLACE' : 'PUSH'` (`RC/router.ts:2313-2319`).
  - A push gets `__TSR_index = current + 1` and a new key (`H:206-219, 283-291`).
  - `replace: true` calls `history.replace`, which keeps the same `__TSR_index` with a new key and notifies `REPLACE` (`H:220-233`).
  - If the built href and the user state are deep-equal to the current ones, nothing is committed and the router only re-runs `load()` (`RC/router.ts:2246-2266`). Opening the tile that is already in the URL does not add a duplicate entry.
- **URL write timing.** The browser URL is written in a microtask after `navigate`. `router.history.flush()` forces the write immediately (`H:373-426`).

### Q4. Remount or re-render on a search-only navigation?

**Re-render only; the component keeps its state.** The chain, from the source:

1. The match id is `route.id + interpolatedPath + loaderDepsHash` (`RC/router.ts:1674-1680`). A search-only change keeps the same id, and the existing match is reused, including its status (`RC/router.ts:1682-1687, 1717-1726`).
2. Child matches render as `<Match routeId={childRouteId} />` with no key (`RR/Match.tsx:315`).
3. The route component is rendered as `<Comp key={key} />`. `key` is `undefined` unless `route.options.remountDeps ?? router.options.defaultRemountDeps` returns a value, and the element is memoised on `[key, component]` (`RR/Match.tsx:192-213`). So the router does not even re-render the route component itself. Only components that call router hooks re-render, through `useSyncExternalStoreWithSelector` (`RS/useSelector.ts:43-67`).

The docs agree: "By default, a route component will not be remounted if it stays active after a navigation." ([RouteOptionsType](https://tanstack.com/router/latest/docs/framework/react/api/router/RouteOptionsType)).

Options that affect this in 1.170:

- **`remountDeps` (route) and `defaultRemountDeps` (router).** Signature: `(opts: { routeId, search, params, loaderDeps }) => any`. `search` is `match._strictSearch`, the validated keys only. A change in the JSON of the return value remounts the component (`RC/route.ts:410-420, 1051-1061`; `RC/router.ts:478`; `RR/Match.tsx:192-201`). Neither is set in wechart. Any `remountDeps` that includes `search.edit` would remount the dashboard on every open or close.
- **There is no route-level `key` option** in the 1.171.32 route option types (searched `RC/route.ts`; only `loaderDeps`/`remountDeps` exist at 1047-1061).
- **`loaderDeps` and loaders.** Putting `edit` in `loaderDeps` changes the match id and creates a new match. A new match starts `pending` if the route has a `loader`, `beforeLoad` or lazy component (`RC/router.ts:658-666, 1728`). `MatchInner` then renders the pending branch instead of the component (`RR/Match.tsx:215-225`). The dashboard route currently has none of these (`routes.tsx:90-94`).

### Q5. Browser Back/Forward (popstate)

**The flow.**

1. On `popstate`, `createBrowserHistory` compares the destination entry's `__TSR_index` with the current one. A delta of -1 is `BACK`, +1 is `FORWARD`, anything else is `{ type: 'GO', index: delta }` (`H:434-460`).
2. It runs any blockers (`H:462-481`), updates `currentLocation`, and calls `history.notify(action)` (`H:483-484`).
3. The router's own subscriber, `router.history.subscribe(router.load)`, is registered in the Transitioner's layout effect (`RR/Transitioner.tsx:41`). `load` updates `latestLocation` and runs a client load (`RC/router.ts:2423-2434`).
4. The match is reused as in Q4 and the new search is published to the match stores (`RC/stores.ts:153-177`). **The same component instance re-renders** with the new `useSearch` value.

**How app code can observe it:**

| Mechanism | Sees Back vs push? | When it runs | Source |
|---|---|---|---|
| `useSearch` / `Route.useSearch` | No | When the router commits matches, inside a React transition. An overlay rendered on `edit` unmounts in this same commit. | `RR/useSearch.tsx:97-105`, `RC/load-client.ts:1870-1881` |
| `useLocation()` | No; `state.__TSR_index` is visible | When the load starts, before matches commit | `RC/load-client.ts:2037-2040` |
| `router.subscribe('onResolved' \| 'onRendered' …)` | **No.** The payload has no action. | After commit | `RC/router.ts:607-634`, `RC/load-client.ts:1901-1910`, [RouterEventsType](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterEventsType) |
| `router.history.subscribe(({ location, action }) => …)` | **Yes:** `PUSH`, `REPLACE`, `BACK`, `FORWARD`, or `GO` with `index` | Synchronously inside the popstate handler (or inside `push`/`replace`). The router's commit is always later: it runs in a microtask plus a transition. So the overlay is still mounted when the callback runs. | `H:9-21, 149-152, 483-484`; `RC/load-client.ts:1997-1999, 1881` |
| `useBlocker({ shouldBlockFn: ({ action, current, next }) => … })` | **Yes** | Before the router processes the traversal. For Back, the browser has already moved; returning `true` makes history call `history.go(-delta)` to undo it. | `H:462-479`, `RR/useBlocker.tsx:176-253` |

Notes on telling actions apart:

- A programmatic `router.history.back()` calls `window.history.back()`, and browser history does not notify on index changes itself (`notifyOnIndexChange: false`). The only notification comes from the resulting `popstate`, so **it produces the same `BACK` action as the browser's Back button** (`H:244-253, 527-533, 568`). App code cannot tell those two apart. It can tell both apart from `navigate()`, which produces `PUSH`/`REPLACE`.
- Direct `window.history.pushState`/`replaceState` calls are also reported as `PUSH`/`REPLACE`, because both methods are patched (`H:589-599`).
- A multi-entry jump, such as a long-press on Back, is reported as `GO` with a negative `index` (`H:444-460`).

### Q6. `history.back()`, `canGoBack()` and `useCanGoBack()`

- **`router.history.back(navigateOpts?: { ignoreBlocker?: boolean }): void`** (`H:31`). It returns immediately; the navigation completes asynchronously through `popstate` (`H:244-253, 527-533`). With `ignoreBlocker: true` the next popstate skips blockers (`H:528-531`).
- **`router.history.canGoBack(): boolean`** returns `location.state.__TSR_index !== 0` (`H:264`).
- **`useCanGoBack(): boolean`** exists in 1.170.38 and is exported (`RR/index.tsx:297`; `RR/useCanGoBack.ts:5-17`). The docs call it experimental and use it as `canGoBack ? router.history.back() : …` ([useCanGoBack](https://tanstack.com/router/latest/docs/framework/react/api/router/useCanGoBack)).
- **Limit:** it only reports that the index is not 0. It does *not* report that the previous entry is this dashboard without `?edit`. When a tab is opened directly on a `?edit=` URL, the history seeds `__TSR_index: 0` (`H:336-347`), so `useCanGoBack()` is `false`.
- **Recording the entry.** A navigation can carry app data in the entry's `state` (`state?:` option, `RC/link.ts:439`; built at `RC/router.ts:2127-2133`; stored through `pushState` at `H:206-219`). `HistoryState` is an open interface (`H:55`), and the value can be read back through `useLocation({ select: l => l.state })`. Custom-state typing is covered under Open questions.

### Q7. Removing a param with `search: (prev) => ({ ...prev, edit: undefined })`

**The key is dropped from the URL.** `encode` skips values that are `undefined` (`RC/qss.ts:31-35`), and the result gets no `?` when it is empty (`RC/searchParams.ts:96-99`). The validate-middleware merge (`{ ...result, ...validated }`) keeps `edit: undefined`, which is still dropped (`RC/router.ts:2964`). The search-params guide also says to pass `undefined` to remove a parameter ([search-params guide](https://tanstack.com/router/latest/docs/framework/react/guide/search-params)).

Other values are *not* dropped:

- `null` passes through `stringifyValue` unchanged and is written by `URLSearchParams.set`, so the URL gets `?edit=null`. That parses back to `null` (`RC/searchParams.ts:72-94`; `RC/qss.ts:31-35`).
- `''` is written as `?edit=` (`RC/searchParams.ts:79-83`).

### Q8. Scroll

**Search-only navigations reset the window scroll by default.** `commitLocation` sets `_scroll.next = next.resetScroll ?? true` without regard to what changed (`RC/router.ts:2328`). The client always installs the reset handler, even with `scrollRestoration` off (`RC/router.ts:1369-1371`; `RC/scroll-restoration.ts:166-173, 232-237`). On `onRendered`, if `resetScroll` was true and the URL has no hash, the handler calls `window.scrollTo(0,0)` plus `scrollTo` on any `scrollToTopSelectors` elements (`RC/scroll-restoration.ts:304-357`). The docs agree: without `scrollRestoration`, "only the window scrolls to the top" ([scroll-restoration guide](https://tanstack.com/router/latest/docs/framework/react/guide/scroll-restoration)).

- **Per-navigation opt-out:** `navigate({ …, resetScroll: false })`, which also works on `<Link>` and `redirect()` ([NavigateOptions](https://tanstack.com/router/latest/docs/framework/react/api/router/NavigateOptionsType); [scroll-restoration guide](https://tanstack.com/router/latest/docs/framework/react/guide/scroll-restoration)).
- **Back/Forward cannot opt out per navigation.** `_scroll.next` goes back to `true` after every `onRendered` (`RC/scroll-restoration.ts:242-247`), so a popstate resets the window scroll, or restores it from the cache when `scrollRestoration` is on.
  - The only router-level opt-out is the function form `scrollRestoration: ({ location }) => boolean`. Returning `false` skips the handler (`RC/scroll-restoration.ts:249-254`).
  - Any truthy value, including a function, also switches on restoration: `history.scrollRestoration = 'manual'` and scroll tracking (`RC/scroll-restoration.ts:168-173, 200-230`).
- **Element scrolling:** only the window and configured `scrollToTopSelectors` elements are reset. wechart's dashboard canvas scrolls in its own element (`.dashboard__canvas { … overflow: auto; }`, `/Users/srajagopal/Work/wechart/packages/web/src/shell/styles.ts:268`), and no `scrollToTopSelectors` are configured (`routes.tsx:186`). So the router does not touch the canvas scroll; it only scrolls the window.

### Q9. Gotchas asked about

**StrictMode.** In development, React re-renders an extra time and re-runs Effects an extra time ([StrictMode](https://react.dev/reference/react/StrictMode)).

- The router's own mount effect guards its initial canonicalise-and-load with a dev-only `mounted` ref, so the initial URL is loaded once (`RR/Transitioner.tsx:25-48`).
- `history.subscribe` and `history.block` both return an unsubscribe (`H:199-205, 266-275`). Effects using them must return it, and `useBlocker` already does (`RR/useBlocker.tsx:251-253`).
- `search` updater functions run during render: `<Link>` calls `router.buildLocation` inside its store selector (`RR/link.tsx:293-306`). Updaters must be pure.
- An effect that calls `navigate` to the same target twice is deduplicated only when `latestLocation` already equals the target (`RC/router.ts:2246-2266`). That holds synchronously only when no blocker is registered: blockers are awaited before a push (`H:159-189`), and `load()` updates `latestLocation` synchronously (`RC/router.ts:2428`).
- Reopening after a reload needs no navigation: the URL already carries `edit`.

**Navigating during render.**

- The library never navigates in render. `<Navigate>` defers to `useLayoutEffect` (`RR/useNavigate.tsx:73-78`), and the docs say it navigates "inside of a `useEffect` hook when successfully rendered" ([Navigate](https://tanstack.com/router/latest/docs/framework/react/api/router/navigateComponent)).
- `navigate()` synchronously pushes (when there is no blocker) and synchronously sets the router's location store (`H:159-189`; `RC/load-client.ts:2037-2040`). Other components read that store through `useSyncExternalStore` (`RS/useSelector.ts:60-66`).
- Call `navigate` from event handlers or effects only. The exact React diagnostic for writing an external store during another component's render is UNVERIFIED (see Open questions).

**Components outside the route.**

- `strict: false` needs a nearest match. Any component rendered under the dashboard route component gets it, including content rendered through `createPortal`, because a portal child "can access the context provided by the parent tree" ([createPortal](https://react.dev/reference/react-dom/createPortal)). wechart renders `AppShell` inside each route component (`routes.tsx:79-88`), so the shell is under the match.
- A component that is inside `RouterProvider` but outside every match throws unless it passes `shouldThrow: false` (`RR/useMatch.tsx:185-195`).
- `useLocation()` works anywhere under `RouterProvider`, but its `search` is unvalidated (`RC/router.ts:1464-1483`).

## Gotchas

- **Return `edit` explicitly from the validator.** For malformed input, return `edit: undefined`; do not omit the key. An omitted key lets the raw parsed value (number, array, object) reach `useSearch` under a `string | undefined` type (`RC/router.ts:1618-1621`).
- **Don't throw from the validator.** A throw replaces the dashboard subtree with the error UI (Q1), which loses the in-memory edit session.
- **The default parser coerces types** (`RC/qss.ts:49-81`; `RC/searchParams.ts:6, 26-53`):
  - `?edit=123` parses as the number `123`; `?edit=true` as `true`; `?edit=a&edit=b` as an array.
  - The router's own stringifier JSON-quotes strings that would parse as JSON (`'123'` becomes `%22123%22`), so ids the app writes round-trip as strings (`RC/searchParams.ts:79-91`). Only hand-typed URLs produce non-strings.
  - Seeded tile ids look like `tile-status` (`/Users/srajagopal/Work/wechart/packages/api/src/seed.ts:96`).
- **`validateSearch` runs several times per navigation:** in full matching, lightweight matching, and the navigate validate middleware (`RC/router.ts:1614, 1834-1843, 2950-2972`). It must be pure.
- **A navigation without `search` drops every search param,** including `edit` and any future filter params, whenever the destination route has a `validateSearch` (`RC/router.ts:2990-2992`). Use `search: true` or an updater to keep them.
- **`router.subscribe` events carry no history action,** and the docs list them in a different order from the source. The source emits `onBeforeNavigate` → `onBeforeLoad` → `onLoad` → `onBeforeRouteMount` → `onResolved` → `onRendered` (`RC/load-client.ts:1876-1878, 1901-1910, 1953-1955`). The docs page lists `onResolved` before `onBeforeRouteMount` ([RouterEventsType](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterEventsType)). Trust the source.
- **`router.state` is "NOT REACTIVE"** ([RouterType](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterType)). Read state through hooks.
- **`useBlocker` side effects:**
  - It registers a `beforeunload` prompt by default (`enableBeforeUnload = true`, `RR/useBlocker.tsx:157-162`; `H:487-520`). That prompt would fire on the reload AC-002 requires unless `enableBeforeUnload: false` is set.
  - A blocked Back has already changed the URL. The history undoes it with `history.go(-delta)` (`H:473-477`), so the URL changes briefly.
  - Its `search` is unvalidated (`RR/useBlocker.tsx:191, 200`).
  - The navigation-blocking docs page as fetched summarised the blocking rule inconsistently. The source is unambiguous: a truthy result blocks (`H:176-184, 468-478`; `RR/useBlocker.tsx:214-221`).
- **`useCanGoBack` is experimental** and only tells whether the index is 0 (Q6).
- **A `useSearch({ from })` caller must not outlive the route.** It throws once that route is no longer matched (`RR/useMatch.tsx:185-195`).
- **The browser URL lags `navigate()` by a microtask** (`H:373-426`). Tests that read `window.location` synchronously right after navigating can see the old URL; `router.history.flush()` forces the write.

## Alternatives considered

Not requested.

## Open questions / unverified

- **UNVERIFIED: does `history.state`, and with it `__TSR_index`, survive a page reload?** Tried: MDN `History.pushState`, `History.state` and "Working with the History API", plus WHATWG HTML §7.4.1.1. The spec defines a session history entry's "classic history API state", but the fetched text gave no reload rule.
  - The router assumes it survives: it seeds `__TSR_index: 0` only when the current state has no key (`H:336-347`).
  - This decides whether Back after reloading `?edit=` is classified `BACK` and whether `useCanGoBack()` is `true` afterwards.
  - T196's e2e test should assert "reload, then browser Back, closes the overlay and stays on the dashboard" in all three browsers.
- **UNVERIFIED: which React warning results from calling `navigate()` during another component's render?** Not found in react.dev's `useSyncExternalStore` caveats. The recommendation (handlers/effects only) stands on the library's own practice (`RR/useNavigate.tsx:73-78`).
- **UNVERIFIED: typing custom navigation `state`.** `HistoryState` is an empty open interface (`H:55`), re-exported from `@tanstack/react-router` (`RR/index.tsx:122`). Not verified:
  - whether `declare module '@tanstack/history' { interface HistoryState { … } }` resolves from `packages/web`, where `@tanstack/history` is not a direct dependency (`packages/web/package.json:14-17`);
  - whether augmenting through the `@tanstack/react-router` re-export merges;
  - whether an unaugmented object literal passes excess-property checks against it.

  No docs page covering this was found ([ParsedHistoryStateType](https://tanstack.com/router/latest/docs/framework/react/api/router/ParsedHistoryStateType) has no augmentation guidance). This only matters if the history-state approach is chosen.
- **UNVERIFIED: known bugs in 1.170.38 for this area.** The GitHub issues search page returned "There was an error while loading", and the releases page named no fixes touching search params, history, popstate, blockers, remounting or scroll.
- **Doc/source mismatch (minor):** the `useSearch` docs say `strict: false` types the result as `Partial<FullSearchSchema>`. The installed type is `FullSearchSchema<routeTree>` (`RC/useSearch.ts:18-19`).
