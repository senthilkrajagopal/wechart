---
library: TanStack Query (React) — mutations addendum to docs/research/data-layer.md
packages: ['@tanstack/react-query']
version: '5.103.1'
researched: 2026-09-21
sources: ['https://github.com/TanStack/query/blob/main/docs/framework/react/guides/mutations.md', 'https://github.com/TanStack/query/blob/main/docs/framework/react/guides/invalidations-from-mutations.md', 'https://github.com/TanStack/query/blob/main/docs/framework/react/guides/network-mode.md', 'https://github.com/TanStack/query/blob/main/docs/framework/react/reference/functions/useMutation.md', 'https://github.com/TanStack/query/blob/main/docs/framework/react/reference/classes/QueryClient.md', 'node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/mutation.ts', 'node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/mutationObserver.ts', 'node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/mutationCache.ts', 'node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/queryClient.ts', 'node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/types.ts', 'node_modules/.pnpm/@tanstack+react-query@5.103.1_react@19.3.0/node_modules/@tanstack/react-query/src/useMutation.ts', 'node_modules/.pnpm/@tanstack+react-query@5.103.1_react@19.3.0/node_modules/@tanstack/react-query/src/types.ts', 'https://react.dev/reference/react/StrictMode', 'https://react.dev/reference/react/useTransition', 'https://react.dev/reference/react/useSyncExternalStore']
---

# TanStack Query 5.103.1 — mutations (addendum)

## Summary

This addendum covers `useMutation` only. Queries, `cancelQueries` and `refetchQueries` are covered in [data-layer.md](./data-layer.md). It answers what AC-184 needs: "IF a dashboard save fails, THEN THE SYSTEM SHALL stay in edit mode with every change made in the session kept, including charts edited from its tiles, and show why the save failed."

**Bottom line.** `await save.mutateAsync(vars)` in a `try/catch` does what the plan needs:
- The promise resolves only after `mutationFn` and every hook-level callback (`onSuccess`, `onSettled`, including returned promises) have finished ([mutation.ts L346–383][mut]).
- It rejects with the original error only after hook-level `onError` and `onSettled` have finished ([mutation.ts L384–436][mut]).
- It settles even if the owning component unmounts ([mutationObserver.ts L207–222][mobs]).

So the session can leave edit mode in the `try` branch after the `await`, and stay in edit mode with the error in the `catch` branch.

Two library behaviours can break AC-184 and need guarding:
- **A throwing or rejecting hook-level `onSuccess` turns a stored save into a rejected `mutateAsync`.** See Gotcha 1.
- **With the default `networkMode: 'online'`, a save made while the browser reports offline neither resolves nor rejects.** See Gotcha 4.

Sources were read in two places:
- The installed 5.103.1 sources under `/Users/srajagopal/Work/wechart/node_modules/.pnpm/`. I checked the compiled `build/modern/mutation.js`, `mutationObserver.js` and `useMutation.js` against `src/`, and they match (e.g. `build/modern/mutation.js` L170–217, `build/modern/useMutation.js` L186, L192).
- The v5 docs on GitHub `main`. The generated reference line numbers there match the installed files (`queryClient.ts:462/499/434`, `useMutation.ts:191`) ([ref-qc], [ref-um]).

## Install

Nothing new. `@tanstack/react-query@5.103.1` is already installed. It depends on `@tanstack/query-core` `5.103.1` and has peer `react: "^18 || ^19"` (installed `package.json` L3, L47, L64). Setup is in [data-layer.md](./data-layer.md).

Note: npm `latest` is now **5.103.2** ([npm]). It was released 2026-09-21 with the entries "broadcast-client: don't overwrite an existing query's data on an incoming 'added' message" and "query-core: ignore stale query removals". Neither touches mutations ([releases]). This doc stays pinned to 5.103.1, as the caller asked.

## Init / auth pattern

No mutation defaults are set today. `main.tsx` sets only `defaultOptions.queries` (`packages/web/src/main.tsx` L15–23). Mutation defaults would go under `defaultOptions.mutations`. `defaultMutationOptions` merges, lowest to highest precedence: client `defaultOptions.mutations`, then `setMutationDefaults(mutationKey)`, then the hook's options ([queryClient.ts L1063–1076][qc]).

## API surface

### `useMutation(options, queryClient?)`

```ts
function useMutation<TData = unknown, TError = DefaultError, TVariables = void, TOnMutateResult = unknown>(
  options: UseMutationOptions<TData, TError, TVariables, TOnMutateResult>,
  queryClient?: QueryClient,
): UseMutationResult<TData, TError, TVariables, TOnMutateResult>
```
([useMutation.ts L191–199][um])

Implementation:
- One `MutationObserver` is created per hook instance, in `React.useState(() => new MutationObserver(client, options))` ([L202–208][um]).
- The hook pushes new options to the observer in an effect on every render where `options` changes identity: `React.useEffect(() => { observer.setOptions(options) }, [observer, options])` ([L210–212][um]).
- The hook reads state through `useSyncExternalStore`, with `observer.subscribe(notifyManager.batchCalls(onStoreChange))` ([L214–222][um]).

### Options (`MutationOptions` plus `throwOnError`) ([types.ts L1200–1282][types])

| Option | Signature / default |
|---|---|
| `mutationFn` | `(variables: TVariables, context: MutationFunctionContext) => Promise<TData>` ([L1195–1198][types]) |
| `onMutate` | `(variables, context) => Promise<TOnMutateResult> \| TOnMutateResult` ([L1208–1211][types]) |
| `onSuccess` | `(data, variables, onMutateResult, context) => Promise<unknown> \| unknown` ([L1212–1217][types]) |
| `onError` | `(error, variables, onMutateResult \| undefined, context) => Promise<unknown> \| unknown` ([L1218–1223][types]) |
| `onSettled` | `(data \| undefined, error \| null, variables, onMutateResult \| undefined, context) => Promise<unknown> \| unknown` ([L1224–1230][types]) |
| `retry` | "Defaults to `0`." ([L1231–1239][types]); the code is `retry: this.options.retry ?? 0` ([mutation.ts L310][mut]) |
| `networkMode` | `'online' \| 'always' \| 'offlineFirst'`, "Defaults to `'online'`." ([L223][types], [L1247–1253][types]) |
| `gcTime` | "Defaults to `5 * 60 * 1000` (5 minutes)" ([L1254–1260][types]) |
| `scope` | `{ id: string }` ([L1177–1179][types], [L1264][types]) |
| `mutationKey`, `meta` | ([L1207][types], [L1263][types]) |
| `throwOnError` | `boolean \| ((error: TError) => boolean)`, "Defaults to `false`." ([L1273–1281][types]) |

`MutationFunctionContext` is `{ client: QueryClient; meta; mutationKey? }`. **It has no `AbortSignal`** ([types.ts L1189–1193][types], built at [mutation.ts L289–293][mut]).

### Result (`UseMutationResult`)

- `mutate: (variables, options?: MutateOptions) => void`. The doc comment reads: "Fire-and-forget — errors are surfaced through the mutation result, not thrown" ([react types.ts L422–442][rtypes]).
- `mutateAsync: (variables, options?: MutateOptions) => Promise<TData>` ([react types.ts L444–459][rtypes]; `MutateFunction` in [core types.ts L1326–1333][types]).
- Everything in `MutationState` plus the derived flags: `status: 'idle' | 'pending' | 'success' | 'error'`, `isIdle`, `isPending`, `isSuccess`, `isError`, `data`, `error: TError | null`, `variables`, `context`, `failureCount`, `failureReason`, `isPaused`, `submittedAt`, `reset(): void` ([mutation.ts L30–75][mut], [core types.ts L1335–1493][types], [mutationObserver.ts L224–238][mobs]).
- Per-call `MutateOptions` are `onSuccess`, `onError` and `onSettled`. **All three are typed to return `void`** ([core types.ts L1284–1309][types]).

### Related hooks

- `useIsMutating(filters?)` returns the number of pending mutations that match ([useMutationState.ts L35–44][ums]).
- `useMutationState({ filters, select })` reads mutations straight from the `MutationCache`, independent of any observer ([useMutationState.ts L157–194][ums]).

### Pattern for AC-184 (source-backed)

```tsx
const save = useMutation({
  mutationFn: ({ next, drafts, version }: SaveVars) => saveDashboard({ /* … */ version }),
  onMutate: async (vars) => { /* awaited before mutationFn (Answer 3) */ },
  onSuccess: async () => {
    // awaited before mutateAsync resolves; must not throw (Gotcha 1)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dashboard', dashboardId] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-charts', dashboardId] }),
    ]);
  },
  onError: async (e: Error) => { /* awaited before mutateAsync rejects */ },
});

// Save handler (an event handler, not an effect: Answer 7)
try {
  await save.mutateAsync({ next, drafts, version });
  leaveEditMode(); // only after the server confirmed and hook onSuccess finished
} catch (e) {
  showWhySaveFailed(e); // session state untouched, still in edit mode
}
```

- `Promise.all` over several invalidations is the documented form for invalidating more than one query from a mutation ([inval-mut]).
- Passing `version` in the variables rather than reading it from the closure is covered in Gotcha 7.

## Answers

### 1. `mutate` vs `mutateAsync`: signatures, resolution, rejection, swallowing

- **`mutateAsync` is the observer's own `mutate`.** The hook returns `{ ...result, mutate, mutateAsync: result.mutate }` ([useMutation.ts L244][um]). `MutationObserver.mutate(variables, options?): Promise<TData>` does four things ([mutationObserver.ts L207–222][mobs]):
  - stores the per-call options;
  - detaches from any previous mutation;
  - builds a new `Mutation` in the cache;
  - returns `this.#currentMutation.execute(variables)`.
- **It resolves with `TData`, the value `mutationFn` resolved with.** `execute` ends with `const data = await retryer.start()` … `return data` ([mutation.ts L346][mut], [L383][mut]). Return values of `onSuccess` and `onSettled` are awaited but discarded.
- **It rejects** when any of these fails:
  - `mutationFn` (after `retry` attempts; default 0);
  - `MutationCache.config.onMutate` or hook `onMutate`;
  - `MutationCache.config.onSuccess` or `onSettled`;
  - hook `onSuccess` or `onSettled` on the success path.

  All of these sit in the single `try` at [mutation.ts L319–383][mut]. The catch rethrows the caught error (`throw error`, [L436][mut]) after the error-path callbacks have run.
- The docs say: "Use `mutateAsync` instead of `mutate` to get a promise which will resolve on success or throw on an error" ([guide-mut], "Promises").
- **`mutate` swallows the rejection.** It is `observer.mutate(args[0], args[1]).catch(noop)` and returns `void` ([useMutation.ts L224–235][um], [react types.ts L422–442][rtypes]). The error is still delivered through `result.error` / `status: 'error'` and through the `onError` callbacks.

### 2. Ordering: does `mutateAsync` wait for the callbacks?

**Hook-level callbacks: yes, all of them, including returned promises.** Order inside `Mutation.execute` ([mutation.ts L284–445][mut]):

Success path:
1. `data = await retryer.start()` ([L346][mut])
2. `await mutationCache.config.onSuccess?.(…)` ([L349–355][mut])
3. `await this.options.onSuccess?.(…)` (hook-level) ([L357–362][mut])
4. `await mutationCache.config.onSettled?.(…)` ([L365–372][mut])
5. `await this.options.onSettled?.(…)` (hook-level) ([L374–380][mut])
6. `this.#dispatch({ type: 'success', data })` sets status to success and notifies observers ([L382][mut])
7. `return data`, so `mutateAsync` resolves ([L383][mut])

Error path:
1. `await` cache `onError`, then hook `onError`, then cache `onSettled`, then hook `onSettled`. Each is wrapped in its own `try { … } catch (e) { void Promise.reject(e) }` ([L385–433][mut]).
2. `dispatch({ type: 'error' })` ([L435][mut])
3. `throw error`, so `mutateAsync` rejects with the **original** error ([L436][mut])

The docs agree:
- "When returning a promise in any of the callback functions it will first be awaited before the next callback is called" ([guide-mut]).
- "Returning a Promise on `onSuccess` makes sure the data is updated before the mutation is entirely complete (i.e., isPending is true until onSuccess is fulfilled)" ([inval-mut]).
- `MutationCacheConfig` notes: "If a callback returns a promise, it will be awaited before the mutation continues" ([mutationCache.ts L24][mcache]).

**Per-call callbacks (`mutate(vars, { onSuccess })` or `mutateAsync(vars, { … })`): called before the promise settles, but not awaited.** The chain:
- They are invoked from `MutationObserver.#notify`.
- `#notify` runs synchronously inside the step 6 / error-step 2 `#dispatch`, before `return data` or `throw error` ([mutation.ts L505–514][mut]; `notifyManager.batch` runs its callback synchronously, [notifyManager.ts L62–74][nm]).
- Order is `onSuccess` then `onSettled`, or `onError` then `onSettled` ([mutationObserver.ts L253–297][mobs]).
- They are called without `await`, and each is wrapped in try/catch → `void Promise.reject(e)` ([L254–296][mobs]).

So a promise returned from a per-call callback is **not** awaited. The type says `=> void` ([core types.ts L1290–1308][types]).

They fire only if `this.#mutateOptions && this.hasListeners()` ([mutationObserver.ts L243][mobs]), meaning only while the hook is subscribed (mounted), and only for the latest call. The docs confirm that per-call callbacks "fire second", "won't run if your component unmounts _before_ the mutation finishes", and "will be fired up only _once_" for consecutive calls ([guide-mut]; also the `@returns` of [ref-um]).

### 3. Is an async `onMutate` awaited before `mutationFn`? What if it throws?

- **Awaited.** Order is ([mutation.ts L324–346][mut]):
  1. `dispatch({ type: 'pending', variables, isPaused })`
  2. `await mutationCache.config.onMutate?.(…)`
  3. `const context = await this.options.onMutate?.(variables, mutationFnContext)`
  4. the context is stored with a second `pending` dispatch
  5. `retryer.start()`, which is the only place `mutationFn` is called ([L295–301][mut])
- `isPending` is already `true` while `onMutate` runs, because `pending` is dispatched first ([L324][mut], [mutationObserver.ts L231][mobs]).
- **If `onMutate` throws or rejects:**
  - control jumps to the `catch` at [L384][mut], and `mutationFn` never runs;
  - `onError` and `onSettled` run with `onMutateResult` = `this.state.context`, which is still `undefined` because the context dispatch at [L337–344][mut] was skipped;
  - the mutation goes to `status: 'error'` ([L435][mut]);
  - `mutateAsync` rejects with the `onMutate` error ([L436][mut]).
- `await queryClient.cancelQueries(…)` inside `onMutate` cannot cause this. `cancelQueries` "never rejects" and ends in `.then(noop).catch(noop)` ([queryClient.ts L427, L446][qc]).

### 4. `queryClient.invalidateQueries(filters?, options?)`

```ts
invalidateQueries(filters?: InvalidateQueryFilters, options: InvalidateOptions = {}): Promise<void>
// InvalidateQueryFilters = QueryFilters & { refetchType?: 'active' | 'inactive' | 'all' | 'none' }
// InvalidateOptions = RefetchOptions = { throwOnError?: boolean; cancelRefetch?: boolean }
```
([queryClient.ts L462–482][qc], [core types.ts L694–734][types])

**Does the promise wait for the refetch? Yes, for the queries it refetches.**
- It marks every match invalidated. Then, unless `refetchType === 'none'`, it returns `this.refetchQueries({ ...filters, type: filters?.refetchType ?? filters?.type ?? 'active' }, options)` ([L466–481][qc]).
- `refetchQueries` does the following ([L499–523][qc]):
  - skips queries where `isDisabled()` or `isStatic()` ([L510][qc]);
  - calls `query.fetch(undefined, { ...options, cancelRefetch: options.cancelRefetch ?? true })` for the rest;
  - returns `Promise.all(promises).then(noop)` ([L522][qc]).

So the promise settles when every refetched query's fetch has settled.

**Does `refetchType` matter? Yes.**
- `'active'` (the default) waits only for queries with at least one enabled observer ([query.ts L386–390][query]).
- `'all'` / `'inactive'` also wait for unobserved queries that have been fetched before. A query with no observers that was never fetched counts as disabled ([query.ts L400–406][query]).
- `'none'` returns `Promise.resolve()` right after marking ([queryClient.ts L471–473][qc]).
- Descriptions are at [core types.ts L718–727][types].

Two cases where the promise resolves without waiting for new data:
- A query whose fetch is **paused** (offline, `networkMode: 'online'`) contributes `Promise.resolve()` ([queryClient.ts L516–518][qc]).
- If a matched query is already fetching and has data, `cancelRefetch: true` cancels that fetch silently and starts a new one, which is what gets awaited. With no data yet, the in-flight promise is reused ([query.ts L594–610][query]).

**What if the refetch fails? The promise resolves by default.**
- Each fetch promise gets `.catch(noop)` unless `throwOnError` is set ([queryClient.ts L512–515][qc]). The doc comment says: "it does not reject on individual query failures unless `throwOnError` is set" ([L489–491][qc]; [core types.ts L694–702][types]).
- With `invalidateQueries(filters, { throwOnError: true })`, it rejects through `Promise.all` on the first failure.
- Either way, the failed query's own state becomes `status: 'error'` with its old `data` kept ([query.ts L865–879][query]). Gotcha 10 covers why that matters for `DashboardPage`.

### 5. Unmount or re-render while `mutateAsync` is pending

**The promise still settles.**
- It is `Mutation.execute`'s promise ([mutationObserver.ts L221][mobs]).
- Nothing on the unmount path cancels it. The chain is: `useSyncExternalStore` unsubscribes → `onUnsubscribe` calls `this.#currentMutation?.removeObserver(this)` ([mutationObserver.ts L135–139][mobs]) → `Mutation.removeObserver` only schedules GC ([mutation.ts L200–210][mut]).
- GC keeps a pending mutation: `optionalRemove` reschedules instead of removing while `status === 'pending'` ([mutation.ts L212–220][mut]).
- `Mutation` has no cancel method at all ([mutation.ts][mut]).

**Hook-level callbacks still run.** They are called from `Mutation.execute` whether or not any observer exists ([mutation.ts L357–380, L398–433][mut]). They use the options from the **last committed render** before the unmount (see re-render below). A `setState` in them after unmount is harmless: React removed the "setState on unmounted component" warning, and its maintainers wrote "There's no 'memory leak' here" ([react-22114]).

**Per-call callbacks do not run after unmount.** They require `this.hasListeners()` ([mutationObserver.ts L243][mobs]; [guide-mut]; [ref-um]).

**Re-render (same component instance):**
- The observer is stable, because it lives in `useState` ([useMutation.ts L202–208][um]).
- Each render's new `options` object is pushed in an effect ([L210–212][um]). If the current mutation is pending, `observer.setOptions` forwards the new options to it ([mutationObserver.ts L122–124][mobs]).
- So the pending save's `onSuccess`, `onError` and `onSettled` (and a `mutationFn` not yet started) are the closures from the latest committed render.
- Exception: a change in `mutationKey` hash calls `reset()` instead ([L116–121][mobs]). The hook drops back to `idle`, and the save keeps running unobserved.

**Re-key (new component instance):**
- A new instance gets a new observer that starts `idle`. It knows nothing about the old pending mutation.
- To read that state across instances, give the mutation a `mutationKey` and use `useIsMutating({ mutationKey })` or `useMutationState({ filters: { mutationKey, status: 'pending' } })`, which read the `MutationCache` directly ([useMutationState.ts L35–44, L157–194][ums]).
- In today's code the `useMutation` lives in `LoadedDashboard`, while the keyed element is the child `DashboardView` (`key={dashboardId}`, `DashboardPage.tsx` L260). Re-keying `DashboardView` therefore leaves the observer alone. Unmounting `LoadedDashboard` does not (Gotcha 10).

### 6. `isPending`, `reset()`, `error`, concurrency, `scope`

**`isPending`** is `status === 'pending'` ([mutationObserver.ts L231][mobs]). It covers the whole of `execute`:
- set by the first `pending` dispatch, before `onMutate` ([mutation.ts L324][mut]);
- through `onMutate`, `mutationFn`, and every hook-level `onSuccess`/`onError`/`onSettled`;
- until the `success`/`error` dispatch ([L382][mut], [L435][mut]).

It is also `true` while the mutation is paused (`isPaused: true`) ([mutation.ts L458–462][mut]).

**`error`** is `TError | null`:
- set on the `error` dispatch ([L491–500][mut]);
- cleared by the next `pending` dispatch ([L468–480][mut]) or by `reset()`.

**`reset()`** detaches the observer and sets the result back to `idle`. The source says: "This does not cancel an in-flight mutation; the mutation itself keeps running to completion and its own callbacks still fire" ([mutationObserver.ts L164–187][mobs]). The docs describe it as the way to "clear the `error` or `data` of a mutation request" ([guide-mut]).

**Concurrency:**
- A second `mutateAsync` while one is pending **runs concurrently. There is no built-in dedupe.** Each call builds a new `Mutation` ([mutationObserver.ts L215–217][mobs]). For unscoped mutations, `canRun` is always `true` ([mutationCache.ts L195–210][mcache]).
- The docs say: "Per default, all mutations run in parallel - even if you invoke `.mutate()` of the same mutation multiple times" ([guide-mut]).
- Both promises settle independently, and hook-level callbacks run for both.
- The hook's state follows **only the latest** call, because the observer detaches from the earlier mutation ([mutationObserver.ts L213][mobs]). Per-call callbacks fire only for the latest call ([guide-mut]).
- The docs add that "the order in which mutations are fulfilled may differ from the order of `mutate` function calls" ([guide-mut]).

**`scope`** (present in 5.103.1: [types.ts L1264][types]):
- "All mutations with the same `scope.id` will run in serial, which means when they are triggered, they will start in `isPaused: true` state if there is already a mutation for that scope in progress" ([guide-mut]).
- Mechanism: `canRun` lets only the first pending mutation of the scope run ([mutationCache.ts L195–204][mcache]). `execute`'s `finally` calls `runNext`, which calls `continue()` on the next paused mutation in the scope ([mutation.ts L437–444][mut], [mutationCache.ts L213–224][mcache]).
- Two source-level facts:
  - A queued mutation's **`onMutate` still runs immediately** at submit. Only the retryer waits, because `onMutate` is awaited before `retryer.start()` ([mutation.ts L316–346][mut]).
  - The queued mutation resumes only if `focusManager.isFocused() && online && canRun()` ([retryer.ts L128–131][retryer]; focus means `document.visibilityState !== 'hidden'`, [focusManager.ts L128–136][focus]). Otherwise it waits for the next focus or online event, at which point `QueryClient.mount` calls `resumePausedMutations` ([queryClient.ts L108–119][qc]).

### 7. StrictMode / React 19 gotchas

- **StrictMode double-invocation.** StrictMode calls "Functions that you pass to `useState`…" twice and runs "one extra setup+cleanup cycle… for every Effect", but not "code inside event handlers" ([react-strict]). What that means here:
  - A second throw-away `MutationObserver` gets constructed. The constructor only sets options and computes a result ([mutationObserver.ts L58–73][mobs]).
  - The `useSyncExternalStore` subscription goes subscribe → unsubscribe → subscribe.
  - A save started from a click handler runs once.
- **Resubscribe freeze is fixed in 5.103.1.** Issue [#11171] (v5.101.4) reported "`useMutation` freezes at `pending` forever when React re-subscribes during an in-flight mutation" (StrictMode or `<Activity mode="hidden">`). The cause was that `onUnsubscribe` detached the observer and nothing re-attached it. PR [#11172] "reattach 'MutationObserver' to its mutation in 'onSubscribe'" was merged 2026-08-18. The installed 5.103.1 has the fix: `onSubscribe` re-adds the observer and refreshes the result when `listeners.size === 1` ([mutationObserver.ts L127–133][mobs]).
- **Don't start the save from an effect.** Older issues [#5341] ("Mutations can not be started from an effect in Reacts StrictMode") and [#9826] (5.90.5, status stuck `pending` after `onError` under StrictMode) were closed as wontfix and as a duplicate. Whether #11172 also resolves them is UNVERIFIED (see Open questions). The save is triggered from `onSave`, an event handler (`DashboardPage.tsx` L271–273), which is not double-invoked ([react-strict]).
- **Hook state lags the promise.** Re-render notifications go through `notifyManager.batchCalls` → `schedule` → `setTimeout(cb, 0)` by default ([useMutation.ts L217][um], [notifyManager.ts L19, L32–40, L78–86][nm]). The `await mutateAsync()` continuation (a microtask) can therefore run before the component has rendered `isPending: false` or `status: 'error'`.
  - Decide edit-mode exit or retention from the promise outcome, not from `save.isPending` / `save.error`.
  - In Vitest with fake timers, a timer tick is needed before the hook state updates.
- **React 19 async transitions.** If the save is wrapped in `startTransition(async () => { await save.mutateAsync(…); … })`, React says "You must wrap any state updates after any async requests in another `startTransition` to mark them as Transitions" ([react-transition]). Separately, `useSyncExternalStore` updates "cannot be marked as non-blocking Transition updates" ([react-uses]), so the mutation's own state changes always render as blocking updates.
- **Open bug [#11451] (reported on 5.102.8; fix PR [#11455] open, not merged).** If a per-call `onSuccess`/`onError` starts another mutation on the same hook, the new call's per-call `onSettled` fires with the previous result. A TypeError is raised if the nested call passed no options. The installed `#notify` still reads `this.#mutateOptions.onSettled` after invoking `onSuccess`/`onError` ([mutationObserver.ts L253–297][mobs]), so 5.103.1 has the bug. Don't re-save (for example as a "retry") from inside per-call callbacks.

## Gotchas

1. **A throwing hook-level `onSuccess`/`onSettled` turns a stored save into a failure.**
   - They sit inside the same `try` as `mutationFn` ([mutation.ts L319–383][mut]). A rejection there runs `onError` with that error, sets `status: 'error'`, and rejects `mutateAsync` ([L384–436][mut]), even though the server stored the dashboard.
   - Under AC-184 the UI would then stay in edit mode and report a failure. A re-save would carry the old `version` and be refused as a conflict.
   - Keep `onSuccess` non-throwing. Never pass `{ throwOnError: true }` to the invalidations inside it: `invalidateQueries` without it does not reject on refetch failure ([queryClient.ts L489–491, L512–515][qc]).
2. **`mutate` swallows the error; `mutateAsync` does not.** ([useMutation.ts L232][um]; [mutation.ts L436][mut]) A `mutateAsync` call without `try/catch` produces an unhandled rejection on failure.
3. **Errors thrown inside `onError`/`onSettled` and inside per-call callbacks become unhandled rejections** (`void Promise.reject(e)`). The original error is still what `mutateAsync` rejects with ([mutation.ts L394–433][mut], [mutationObserver.ts L261–296][mobs]).
4. **Offline pauses the save instead of failing it (default `networkMode: 'online'`).**
   - If the browser has fired `offline`, `retryer.canStart()` is false and `start()` waits in `pause()` until online ([retryer.ts L53–57, L133, L151–165, L245–253][retryer]; [onlineManager.ts L11–31][online]).
   - `onMutate` has already run by then ([mutation.ts L324–346][mut]).
   - The docs say mutations "will not fire unless you have network connection" and stay `paused` ([guide-nm]).
   - Result: `mutateAsync` neither resolves nor rejects, `isPending` and `isPaused` stay `true`, and there is no failure to show under AC-184.
   - `networkMode: 'always'` makes the request run and fail normally ([guide-nm]). Which behaviour AC-184 wants offline is a product decision (Open questions).
5. **Per-call callbacks are unreliable for AC-184 logic.** They are not awaited, fire only while mounted, and fire only for the latest call (Answer 2). Put edit-mode logic after `await mutateAsync`, or in hook-level callbacks.
6. **No mutation cancellation.** `MutationFunctionContext` has no `signal` ([types.ts L1189–1193][types]), and neither `reset()` nor unmount stops `execute` ([mutationObserver.ts L164–171][mobs]). Navigating away mid-save still lets the save land.
7. **Closure drift while pending.** A pending mutation picks up newer render options, including `mutationFn` if the retryer has not started yet. The chain is: `setOptions` in an effect ([useMutation.ts L210–212][um]) → forwarded to the pending mutation ([mutationObserver.ts L122–124][mobs]) → `mutationFn` read at run time as `this.options.mutationFn(…)` ([mutation.ts L301][mut]).
   - Today `version` comes from the component closure (`DashboardPage.tsx` L159–173). If `['dashboard', id]` refetches while an async `onMutate` is awaiting, the request could go out with a newer `version` than the session started from.
   - Passing `version` in the mutation variables pins it to the call.
8. **`throwOnError` on `useMutation` throws during render** when `result.error` is set ([useMutation.ts L237–242][um]; [utils.ts L582–592][utils]). That hands the error to an error boundary and unmounts the edit session. Leave it at the default `false` ([types.ts L1273–1281][types]).
9. **Optimistic cache plus `onError` invalidation.**
   - `onMutate` writes drafts into `['dashboard-charts', id]` with `setQueryData` (`DashboardPage.tsx` L181–198). `onError` then invalidates that key (L204–208), and the refetch replaces the optimistic entry with the server's charts ([queryClient.ts L466–481][qc]).
   - Tiles keep the session's edited charts only if the edit session overlays its own drafts instead of reading them from this cache entry.
   - The documented alternative is to return the previous value from `onMutate` and restore it in `onError` ([useMutation.ts L90–124][um], JSDoc example).
10. **A failed background refetch of `['dashboard', id]` unmounts the session.** A failed refetch sets `status: 'error'` and keeps `data` ([query.ts L865–879][query]). `DashboardPage` returns the error paragraph when `saved.isError` (`DashboardPage.tsx` L119–124), which unmounts `LoadedDashboard`: the `useMutation` owner and the edit session's parent. Today only `onSuccess` invalidates `['dashboard', id]` (L199–203). Invalidating it from `onError` (for example on a version conflict) would put AC-184's "stay in edit mode" at the mercy of a second network call.
11. **Double Save.** Unscoped saves run in parallel with the same `version` (Answer 6), so the second is refused by the server's version check (AC-065) even though the first succeeded. Two library-level options:
    - gate on `isPending`;
    - use `scope: { id }`, which serialises but still runs each queued call's `onMutate` immediately (Answer 6).

    Which behaviour to adopt is a product question.
12. **`mutationKey` change resets the hook** to `idle` mid-save ([mutationObserver.ts L116–121][mobs]). If a key includes `dashboardId`, switching dashboards mid-save hides that save's state from the hook.

## Open questions / unverified

- UNVERIFIED: whether PR #11172 (included in 5.103.1) also fixes the effect-started StrictMode freezes in #5341 and #9826. I read the fix's code path ([mutationObserver.ts L127–133][mobs]) but did not test it. The save does not start from an effect, so AC-184 does not depend on this.
- UNVERIFIED: whether Vitest fails a run on the `void Promise.reject(e)` unhandled rejections from throwing callbacks (Gotcha 3). I did not check Vitest's docs; my web-search budget was exhausted.
- Product decision (ask the user): should a save made while the browser reports offline fail at once and show why (`networkMode: 'always'`), or pause and send on reconnect (the default)? AC-184 does not say (Gotcha 4).
- Product decision (ask the user): what a second Save press should do while one is pending: be blocked, be queued (`scope`), or run in parallel (Gotcha 11).
- The generated reference pages on `main` ([ref-um], [ref-qc]) are for the current release. I matched their "Defined in" line numbers to the installed 5.103.1 files. All other claims come from the installed sources.

## Resolved since (added at T197, 2026-09-21)

- **Offline (Gotcha 4)** — decided by the user: a save made offline fails at once and keeps the work. The dashboard save uses `networkMode: 'always'`; a browser test sets the browser offline and fails if the option is removed.
- **A second Save while one is pending (Gotcha 11)** — blocked: the edit session holds Save back ("Saving…") until the first settles.
- **Vitest and unhandled rejections** — observed in this repo, not from Vitest's docs: an unhandled rejection is reported as an error of the whole run ("Unhandled Rejection", "Errors 1", exit 1) while the test that caused it is marked passed; and a `vi.fn` that returns a rejected promise got nothing reported at all.
- **Queries re-fetch on reconnecting, once stale** — read from the installed query-core 5.103.1, which is outside this doc's mutation scope but bears on it: `refetchOnReconnect` defaults to `true` unless the query's `networkMode` is `'always'` (`queryClient.ts` L1032–1034; doc comment at `types.ts` L441–447: "the query will refetch on reconnect if the data is stale"), and the observer re-fetches when it is enabled, not `'static'`, and stale (`queryObserver.ts` L862–875). wechart's queries are stale after `staleTime: 5 * 60_000` (`packages/web/src/main.tsx`). So an edit session longer than five minutes can see its dashboard fetched again on a reconnect — why the dashboard page keeps showing a dashboard whose re-fetch failed, and why T198 pins the version a save is checked against.
- **`setQueryData(key, undefined)`** — not relied on. `onMutate` writes drafts into the charts cache only when the cache holds charts, and a failure puts back only what it wrote.

[mut]: ../../node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/mutation.ts
[mobs]: ../../node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/mutationObserver.ts
[mcache]: ../../node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/mutationCache.ts
[qc]: ../../node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/queryClient.ts
[query]: ../../node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/query.ts
[types]: ../../node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/types.ts
[retryer]: ../../node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/retryer.ts
[nm]: ../../node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/notifyManager.ts
[online]: ../../node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/onlineManager.ts
[focus]: ../../node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/focusManager.ts
[utils]: ../../node_modules/.pnpm/@tanstack+query-core@5.103.1/node_modules/@tanstack/query-core/src/utils.ts
[um]: ../../node_modules/.pnpm/@tanstack+react-query@5.103.1_react@19.3.0/node_modules/@tanstack/react-query/src/useMutation.ts
[ums]: ../../node_modules/.pnpm/@tanstack+react-query@5.103.1_react@19.3.0/node_modules/@tanstack/react-query/src/useMutationState.ts
[rtypes]: ../../node_modules/.pnpm/@tanstack+react-query@5.103.1_react@19.3.0/node_modules/@tanstack/react-query/src/types.ts
[guide-mut]: https://github.com/TanStack/query/blob/main/docs/framework/react/guides/mutations.md
[inval-mut]: https://github.com/TanStack/query/blob/main/docs/framework/react/guides/invalidations-from-mutations.md
[guide-nm]: https://github.com/TanStack/query/blob/main/docs/framework/react/guides/network-mode.md
[ref-um]: https://github.com/TanStack/query/blob/main/docs/framework/react/reference/functions/useMutation.md
[ref-qc]: https://github.com/TanStack/query/blob/main/docs/framework/react/reference/classes/QueryClient.md
[npm]: https://registry.npmjs.org/@tanstack/react-query/latest
[releases]: https://github.com/TanStack/query/releases
[#11171]: https://github.com/TanStack/query/issues/11171
[#11172]: https://github.com/TanStack/query/pull/11172
[#11451]: https://github.com/TanStack/query/issues/11451
[#11455]: https://github.com/TanStack/query/pull/11455
[#5341]: https://github.com/TanStack/query/issues/5341
[#9826]: https://github.com/TanStack/query/issues/9826
[react-strict]: https://react.dev/reference/react/StrictMode
[react-transition]: https://react.dev/reference/react/useTransition
[react-uses]: https://react.dev/reference/react/useSyncExternalStore
[react-22114]: https://github.com/facebook/react/pull/22114
