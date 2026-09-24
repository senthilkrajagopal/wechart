---
library: Abort and timer APIs on the web platform (no package)
packages: []
version: platform — MDN pages read 2026-09-23; WHATWG DOM and Fetch living standards
researched: 2026-09-23
sources:
  [
    https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort,
    https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static,
    https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/reason,
  ]
---

# Giving up on a request: AbortController, AbortSignal.timeout, and which to use

**Why this exists.** AC-186 asks that a dashboard save with no answer after 60
seconds be treated as failed (T200). That needs a clock and a way to abandon
the request, and the platform offers two shapes of the same idea. This records
what each does, from their documentation, and why wechart uses one of them.

## What the platform gives

### `AbortController.abort(reason?)`

- "The **`abort()`** method of the `AbortController` interface aborts an
  asynchronous operation before it has completed. This is able to abort
  [fetch requests], the consumption of any response bodies, or streams."
  ([abort][mdn-abort])
- With no argument: "If not specified, the reason is set to 'AbortError'
  `DOMException`." ([abort][mdn-abort])

So `fetch(url, { signal })` rejects when the controller aborts, and
`signal.aborted` is `true` afterwards — which is how a caller tells "we gave
up" apart from "the network failed", since both arrive as a rejected fetch.

### `AbortSignal.timeout(ms)`

- "The **`AbortSignal.timeout()`** static method returns an `AbortSignal` that
  will automatically abort after a specified time."
  ([timeout][mdn-timeout])
- "The signal aborts with a `TimeoutError` `DOMException` on timeout."
  ([timeout][mdn-timeout])
- **It cannot be cancelled:** "AbortSignal.timeout() does not provide a way to
  cancel its timeout. Finishing the operation early, or aborting another
  signal combined with it through `AbortSignal.any()`, does not cancel the
  timeout." ([timeout][mdn-timeout])
- MDN's own recommendation for the cancellable case: "If resources are
  constrained and you want to definitively cancel timeouts early, use an
  `AbortController` with `setTimeout()` instead, and call `clearTimeout()`
  when the operation finishes." ([timeout][mdn-timeout])
- Its clock is not wall-clock: "The timeout is based on active rather than
  elapsed time, and will effectively be paused if the code is running in a
  suspended worker, or while the document is in a back-forward cache."
  ([timeout][mdn-timeout])

## What wechart uses, and why

`saveDashboard` (`packages/web/src/dashboard/edit/save.ts`) creates an
`AbortController`, arms a `setTimeout`, passes `controller.signal` to `fetch`,
and clears the timer in a `finally`. Two reasons, both from the quotes above:

1. **It is cancellable.** A save that answers in two seconds should leave
   nothing ticking for another fifty-eight; MDN names this as the case for
   `AbortController` + `setTimeout` + `clearTimeout`.
2. **It is testable on the tests' own clock.** `AbortSignal.timeout` runs on
   the platform's timer, which a test's fake timers do not reach;
   `setTimeout` is exactly what fake timers replace. AC-186's test advances
   the clock to 61 seconds without waiting a minute.

Telling the two failures apart is `signal.aborted` after the rejection, not
the error's name: an abort with no reason is an `AbortError` (above), which is
also what a caller-supplied abort would look like, and wechart supplies none
of its own here.

## Gotchas

- **The request may still land.** Abandoning a request on the client says
  nothing about the server: neither page claims the operation is undone, and
  the service may have written the save after the browser stopped listening.
  AC-186's message therefore says the save may have gone through, rather than
  sending the user to save again over their own write.
- **`AbortSignal.timeout`'s paused clock** would make "60 seconds" mean
  something different for a backgrounded tab. Not a factor here, since we do
  not use it, but worth knowing before anyone swaps it in.
- **No package is added.** Both are platform APIs; `packages:` is empty and
  the research gate has nothing to match, so this doc exists for the claims
  above rather than for an import.

[mdn-abort]: https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort
[mdn-timeout]: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static
