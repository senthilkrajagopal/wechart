---
library: Cube (spike)
packages: []
version: 1.7.42
researched: 2026-09-21
sources:
  [
    observed against cubejs/cube:v1.7.42 on the local compose network (a throwaway container, port 54100),
    docs/research/cube/configuration-deployment.md,
    docs/research/cube/data-modeling.md,
  ]
---

# Spike: model files served by wechart, and quick calculations as generated multi-stage measures

> **Superseded in part, 2026-09-25**, by the user's architecture decisions 1, 6 and 8 ([docs/inputs/2026-09-25-architecture-decisions.md](../../inputs/2026-09-25-architecture-decisions.md)).
> - **Superseded:**
>   - model files served by wechart through `repositoryFactory` (§1, :18, :28–66);
>   - drafts under their own app id (:56);
>   - companions added to wechart's served files (:113–116).
> - **Now:** companion measures are published into xcube's model.
> - **Still holds:** the observations, including "a bad publish breaks everything", which supports decision 6's whole-model check.

**Why.** On 2026-09-21 the user took two recommendations, subject to a spike: "i will go with your recommendation for the two decisions.. before accepting .. run a spike if required".

1. **Model files live in wechart's metadata database.** Cube reads them through `repositoryFactory` and picks up a publish through `schemaVersion`, with no restart. This is T137–T143, AC-131–AC-137.
2. **Quick calculations are generated multi-stage measures** that the chart editor picks from. This is T053–T055, AC-047–AC-049.

**How.**
- A throwaway Cube, `cubejs/cube:v1.7.42`, ran in production mode on the compose network against the sample database. Its `cube.js` read the model from a small HTTP store standing in for wechart's API.
- The store served `GET /model/files` and `GET /model/version`, accepted `POST /model/publish` and `POST /model/drafts`, and counted calls.
- Queries went through the REST API with a JWT. Every observation below is from that run. Nothing was built into wechart.

## 1. Model files served by wechart: works, with one hard requirement

The spike's `cube.js` was:

```js
const STORE = 'http://host.docker.internal:4790';
const draftOf = (context) => context?.securityContext?.wechartDraft;
module.exports = {
  contextToAppId: (context) => (draftOf(context) === undefined ? 'live' : `draft_${draftOf(context)}`),
  repositoryFactory: (context) => ({
    dataSchemaFiles: async () => {
      const draft = draftOf(context);
      const url = draft === undefined ? `${STORE}/model/files` : `${STORE}/model/drafts/${draft}`;
      return (await fetch(url)).json(); // [{ fileName, content }]
    },
  }),
  schemaVersion: async (context) => {
    const draft = draftOf(context);
    if (draft !== undefined) return `draft_${draft}`;
    return (await (await fetch(`${STORE}/model/version`)).json()).version;
  },
};
```

**Observed:**

- **Serving works.** Cube compiled the three seed cubes, plus the generated measures below, from the HTTP store. It fetched the files once per compile.
- **Publishing needs no restart.** After a new version was published, the new members were in `/v1/meta` within about a second, with the container still up.
- **`schemaVersion` runs on every request**, as the configuration research says. The store counted 17 version calls against 2 file fetches. wechart should keep that endpoint cheap, or cache it in `cube.js` for about a second.
- **An invalid published model breaks everything.** Publishing a measure that referenced an undefined member made *every* request fail with HTTP 500 `{"error":"Error: Compile errors:\nErrors:\nno_such_member is not defined\n"}`, `/v1/meta` included. Cube did not keep serving the last good model. Republishing a good one recovered at once. **So AC-136's "validate before publishing" is not optional.** A bad publish takes down every dashboard.
- **Validating a draft without touching the live model works.** A request whose security context names a draft goes to its own app id (`contextToAppId`), compiled from the draft's files. Asking `/v1/meta` with that token returned the draft's compile errors, while the live model went on answering. A valid draft returned its new members.
- **Error attribution varies:**
  - A duplicate member names its file: `model/cubes/customers.yml Errors: Member names must be unique within a cube. Found duplicate measure 'count' in cube 'customers'.`
  - An undefined reference does not: `no_such_member is not defined`.
  - A YAML syntax error gives the line, column and a snippet but not the file: `YAMLException: missed comma between flow collection entries (7:7)`.
  - To attribute every error to a file (AC-136), wechart needs its own YAML parse, which it has for AC-135, plus its own attribution for references.

**Consequences for the build:**
- `cube.js` is mounted into the Cube container and read at start. Adopting it takes one restart.
- Cube must reach wechart's API: on the compose network locally, and through a service in Kubernetes. The file endpoints are Cube's alone and need a credential.
- Each draft app id is a compiler Cube keeps in memory. Whether and when Cube evicts them was not measured, so drafts should be few and short-lived.

## 1a. Through wechart's own `infra/cube/cube.js` (T142, observed 2026-09-21)

**Setup.** A throwaway `cubejs/cube:v1.7.42` ran on the compose network, on port 54100, in production mode, against the sample database.
- It mounted `infra/cube/cube.js` and `infra/cube/model`.
- `WECHART_MODEL_STORES` was set to one stand-in store, with a key.
- The store served the paths as wechart stores them (`cubes/orders.yml`) as `fileName`s.
- `/v1/meta` was asked with a token per case.

**Observed:**
- **Where the model comes from:**
  - No `wechartStore` in the context: the mounted directory.
  - A store not on `WECHART_MODEL_STORES`: the directory too, not that store.
  - The listed store: its files, fetched once, with `version` fetched on each request, as §1 found.
- **Drafts:**
  - A draft (`wechartDraft`) compiled under its own app id. A valid draft's new member was in its `/v1/meta`.
  - The live model, asked again afterwards, didn't have that member.
- **The three kinds of error, as Cube returns them (HTTP 500, `{"error": …}`):**
  - A duplicate member names the file by the `fileName` wechart served: `"Error: Compile errors:\ncubes/customers.yml Errors:\nMember names must be unique within a cube. Found duplicate measure 'count' in cube 'customers'.\n"`.
  - An undefined reference names no file: `"Error: Compile errors:\nErrors:\nno_such_member is not defined\n"`.
  - A YAML syntax error names no file, and it isn't a compile-errors list. It gives a line, a column and a snippet: `"YAMLException: missed comma between flow collection entries (2:3)\n\n 1 | cubes: [\n …"`.
- **Jinja reaches Cube's environment.** Found by T142's review and observed the same way on 2026-09-21. A draft whose `products.yml` had `description: "{{ env_var('CUBEJS_API_SECRET') }}"` was rendered with the secret in place.
  - Cube's answer was a 500 whose `YAMLException` snippet showed the line as `description: ""probe-secret""`.
  - So the secret came back in Cube's error text, which a publish would hand to the browser as a problem, and a well-formed template would have put it in `/v1/meta`.
  - wechart therefore publishes no Jinja template: content matching Cube's Jinja test is refused before Cube sees it.
  - It also publishes no JavaScript, Python or `.jinja` file, since those run inside Cube (spec Non-goals, AC-140). A stored template is never written over.
- **What this means for AC-136:** wechart must attribute the last two itself.
  - The live model compiled, so a draft's error comes from the files the draft changed.
  - An undefined name is placed on the changed file that holds it.
  - A YAML error is placed on the changed file whose text doesn't parse. wechart's own parse finds it before Cube does (T141).

## 2. Quick calculations as generated multi-stage measures: all six work

Each calculation was written as a companion of `orders.count` and queried on the seed data (orders: 80 of each of three statuses; monthly counts 30, 28, 31, 30, 31, 30, 31, 29 from January to August 2026).

| Calculation | Companion (YAML) | Observed |
|---|---|---|
| % of total | `…__grand_total`: `multi_stage: true, type: sum, sql: '{count}', grain: {keep_only: []}`; then `…__pct_of_total`: `multi_stage: true, type: number, sql: '1.0 * {count} / NULLIF({…__grand_total}, 0)'` | ⅓ for each status. **With a filter on two statuses, ½ each**: the total is the filtered total. |
| Difference from previous period | `…__prev_month`: `multi_stage: true, type: number, sql: '{count}', time_shift: [{interval: 1 month, type: prior}]`; `…__diff_prev_month`: `sql: '{count} - {…__prev_month}'` | Feb −2, Mar +3, Apr −1. January is null (no December data). **A date range starting in February still takes January as February's previous month.** |
| % difference from previous period | `sql: '1.0 * ({count} - {…__prev_month}) / NULLIF({…__prev_month}, 0)'` | Feb −6.7 %, Mar +10.7 %. |
| Running total | `type: count, rolling_window: {trailing: unbounded}` (not multi-stage) | 30, 58, 89, 119, 150. **It counts from the start of the data, not the start of the chart's range**: a range starting in March shows 89 for March. |
| Rank | `multi_stage: true, type: rank, order_by: [{sql: '{count}', dir: desc}], grain: {keep_only: []}` for every row; `reduce_by: [status]` for within a category | Across months: the three 31s are 1st, 30 is 4th, 29 is 7th, 28 is 8th, which is standard competition ranking. Within each month by status: correct, with ties shared. |
| Moving average | `…__rolling_3_month`: `type: count, rolling_window: {trailing: 3 month}`; `…__months_in_3_month`: `type: count_distinct, sql: "date_trunc('month', {CUBE}.ordered_at)", rolling_window: {trailing: 3 month}`; average: `sql: '1.0 * {…__rolling_3_month} / NULLIF({…__months_in_3_month}, 0)'` | 30, 29, 29.67, 29.67. Dividing by 3 instead gave 10 and 19.3 for the first two months; the window has to be divided by the periods actually in it. |

**What this means for generating them:**

- **Period calculations exist per grain.** A measure's `time_shift` takes one fixed interval (data-modeling.md Y.7b), and a rolling window one fixed length. So "previous period" and "moving average" are generated per granularity (day, week, month, quarter, year), and the editor picks the one matching the chart's time dimension. With no time dimension, AC-049 disables them.
- **Rank within a category needs `reduce_by` that dimension.** So it is generated per dimension a chart ranks by.
- **Generate only what charts use.** All calculations × grains × dimensions for every measure would be dozens of members per measure, and every generated member must stay `public`, since private members cannot be queried over the API. Because wechart serves the model files itself (part 1), it can add to a cube's file, *as served*, only the companions charts actually use: generated from the chart, never written into the user's own file, and published and validated like any change. wechart's field lists then hide them by name or `meta`.
- **So quick calculations depend on part 1.** The model store and publish path come first.

## Open for the user

- **Running total: all of history, or the chart's range?** Cube's `rolling_window: {trailing: unbounded}` counts from the start of the data. BI tools usually count from the start of what the chart shows.
- **% of total when filtered:** the share of the filtered total (observed), rather than of everything. This is the usual BI meaning, noted here so it is a decision rather than an accident.
