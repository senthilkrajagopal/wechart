---
library: TanStack Query (React) — the QueryCache, addendum to docs/research/data-layer.md
packages: ['@tanstack/react-query']
version: '5.103.1'
researched: 2026-10-07
sources: ['node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/queryCache.ts', 'node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/query.ts', 'node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/subscribable.ts', 'https://react.dev/reference/react/useSyncExternalStore']
---

# TanStack Query 5.103.1 — reading the QueryCache (addendum)

## Summary

Jobs says "no read-write folder left" (design 16, G5b) for the whole page when any of its lists is refused after it was read (T610's review). The page watches the lists' reads in the `QueryCache`, without an observer of its own on each one. This addendum covers the three things that relies on.

## What the code relies on

1. **`queryClient.getQueryCache()` returns the client's `QueryCache`, and `QueryCache.subscribe(listener)` returns the unsubscribe function.**
   - `QueryCache extends Subscribable<QueryCacheListener>` ([queryCache.ts L123][qc]).
   - `Subscribable.subscribe(listener): () => void` binds itself in its constructor, so it can be passed on unbound ([subscribable.ts L5–15][sub]).
   - The class's own example is `const unsubscribe = queryCache.subscribe((event) => …)` ([queryCache.ts L116–121][qc]).
2. **A listener is called whenever a query's state changes, an error included.**
   - Every state change goes through `Query.#dispatch`, which ends with `this.#cache.notify({ query: this, type: 'updated', action })` inside `notifyManager.batch` ([query.ts L895–903][q]).
   - `QueryCache.notify` calls each listener ([queryCache.ts L332–338][qc]).
   - The `QueryCacheNotifyEvent` doc lists the events: "whenever a query is added or removed from the cache, its state is updated … or one of its observers is added, removed, or has its results or options updated" ([queryCache.ts L80–93][qc]).
3. **A failed read keeps the data it had, with `status: 'error'` and its `error`.**
   - The `'error'` reducer spreads the old state and sets `error`, `status: 'error'` and `isInvalidated: true`. `data` is left as it was ([query.ts L865–879][q]).
   - The inline comment there reads "flag existing data as invalidated if we get a background error".
   - So `query.state.data !== undefined && query.state.status === 'error'` means "read once, refused now".
   - The same reducer sets `errorUpdatedAt: Date.now()` ([query.ts L871][q]). Comparing it with when the page opened tells a refusal during this visit from one kept in the cache from an earlier one.
4. **`QueryCache.getAll()` returns every query in the cache, as an array** ([queryCache.ts L267–279][qc]).
   - `findAll(filters)` filters it with `matchQuery`. With no filters it returns all of them ([queryCache.ts L309–329][qc]).

## Using it from React

- `useSyncExternalStore(subscribe, getSnapshot)` needs a `subscribe` that keeps its identity, or React subscribes again on every render. It also needs a `getSnapshot` that returns the same value while the store hasn't changed ([react-uses]).
- A boolean computed from the cache meets that: it is compared with `Object.is`.
- The listener runs inside `notifyManager.batch` (point 2), so a change to the page and the lists' own observers render together.

[qc]: ../../node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/queryCache.ts
[q]: ../../node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/query.ts
[sub]: ../../node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/subscribable.ts
[react-uses]: https://react.dev/reference/react/useSyncExternalStore
