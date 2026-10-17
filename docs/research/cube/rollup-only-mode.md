---
library: Cube Core's rollup-only mode, as a client can observe it
packages: []
# Nothing is imported: wechart reads Cube's and xcube's HTTP answers.
version: 'Cube 1.7.45 (in xcube v1.7.45-c2602ac72a@sha256:c7334a52800d8fe30faa7277e9b0ebcc68701b6f10ad394ad267e5e361871884)'
researched: 2026-10-08
---

# Rollup-only mode: what a client can tell (for AC-147, R76 chart-editor-Q4)

**Source:** the Cube expert session's answer, `~/Work/xcube-exchange/to-wechart/2026-10-08-1830-rollup-only-mode.md`. It cites Cube 1.7.45's own source at the lines below. This doc restates that answer. It has not been checked against a running Cube that has `CUBEJS_ROLLUP_ONLY` set.

## The mode isn't reported
- **How the mode is set:** by `orchestratorOptions.rollupOnlyMode`, or else by `CUBEJS_ROLLUP_ONLY` (`OptsHandler.ts:602`).
- **What reports it:** nothing. `/v1/meta`, `/v1/load`, `/v1/dry-run`, the jobs and partitions routes, and `/readyz` carry no field for it.
- **What `/readyz` does differently:** in rollup-only mode it tests only the Cube Store connection (`OrchestratorApi.ts:183`). Its answer doesn't say which test it ran.
- **The mode is per orchestrator.** `orchestratorOptions` can depend on the request's context, so instances can differ.

## The refusal identifies the mode
- **This text is thrown only in rollup-only mode** (`QueryOrchestrator.ts:240`, guarded by `this.rollupOnlyMode`): "No pre-aggregation table has been built for this query yet. Please check your refresh worker configuration if it persists." It answers a query that no pre-aggregation serves.
- **A matched rollup that isn't built yet gets different text**, in or out of rollup-only mode (`PreAggregations.ts:890`, `PreAggregationLoader.ts:174`, `PreAggregationPartitionRangeLoader.ts:282`): "No pre-aggregation partitions were built yet for the pre-aggregation serving this query and this API instance wasn't set up to build pre-aggregations. …"
- **So:**
  - a refusal with the first text means rollup-only mode is on for the instance that answered;
  - the second text means a rollup isn't built yet, and says nothing about the mode.

## xcube can report it (requested 2026-10-08, ~~image pending~~ pinned 2026-10-17)
wechart asked xcube for `rollupOnly: boolean` per model, as the answering instance resolves it, on `GET …/revision`. ~~It might also go on `GET …/refresh-worker`. Until that image is pinned, wechart infers the mode only from the first refusal text (AC-147 as amended by R76).~~

**Correction, 2026-10-17 (T690):** xcube `407622a6b8` carries it on both `GET …/revision` and `GET …/refresh-worker` as `rollupOnly: boolean | null`, with `null` only where no Cube is attached. See `docs/research/xcube-407622a6b8.md`. wechart pins that image and passes the field on as `GET /api/rollup-only`, and the banner shows on `true`. Where wechart can't know (`null`, or an older image without the field), it still infers the mode from the first refusal text above.
