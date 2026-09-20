---
name: component-research
description: Researches each external library, service, or platform the project depends on by dispatching one integration-researcher subagent per library in parallel, then writes docs/research/<library>.md. Also builds exhaustive platform capability inventories (e.g. everything Cube offers). Use before code imports a new package, before choosing between libraries, or when the scope depends on a platform's features.
---

# Component research

Results go in `docs/research/`. The research gate hook blocks any code that imports a package without a doc here.

## 1. Build the work list

Collect dependencies from `docs/requirements.md` (Stack and Scope), `docs/spec.md`, `docs/inputs/`, and any `package.json`. For each dependency, check `docs/research/`:

- **missing**: research it
- **present but stale** (the `version` is older than what we will install, or `researched` is more than 90 days old): refresh it
- **present and current**: skip it

## 2. Dispatch one integration-researcher per library, all in one message

Put every Agent call in a single message so they run concurrently, and never give one agent two libraries. Each prompt includes:

- the library
- the exact packages we expect to import
- the features and ACs that use it, quoted
- the runtime: Node 26, browser, Vite, React

When a choice is still open (for example, which drag-and-drop or dashboard-grid library to use), dispatch one researcher per candidate. Then compare the candidates on:

- fit to the ACs that need the library
- the API surface we would use
- correctness and known defects
- maintenance activity
- license
- bundle size
- runtime performance
- accessibility

Never weigh how much human effort an option takes to build or integrate. Present the comparison and your recommendation, and let the user decide with AskUserQuestion.

Algorithms and reference implementations count as research subjects too. For example, the chart-recommendation references in `docs/inputs/`: Draco 2, CompassQL, and Vega-Lite defaults. Verify the claims made in `docs/inputs/` rather than repeating them.

## 3. Inventory mode: platforms whose features define the scope

wechart has to bring nearly every Cube capability into its UI. For Cube, research by **capability area** instead of by package:

1. Build the area list from the official docs' navigation and API reference, not from memory. The list will likely include data modeling, access control and security context, pre-aggregations and Cube Store, the refresh worker and jobs, data sources and drivers, multitenancy, caching and query orchestration, the REST, GraphQL and SQL APIs, metadata and introspection, configuration and deployment, and observability. Include every other area the docs list.
2. Dispatch one integration-researcher per area in a single message. Each result is saved as `docs/research/cube/<area>.md`.
3. Write `docs/research/cube-capabilities.md`: a matrix of every capability, with these columns:
   - Cube Core (self-hosted) or Cube Cloud only
   - the API or config surface that drives it
   - a candidate UI surface in wechart
   - a source link

   Flag anything that is Cloud-only, because the UI can't call an API that Core doesn't expose.

## 4. Write the files

The subagents are read-only and return markdown. Write each result verbatim to `docs/research/<library>.md`, using a lowercase slug (`@scope/name` becomes `scope-name.md`, with the scoped name listed under `packages:`). Before saving, check that the frontmatter has:

- `packages:` listing every import name the doc covers
- `version:` pinned exactly
- a `researched:` date

Also check that every claim has a source link. If anything is missing, send the doc back to the same researcher with SendMessage.

## 5. Report

Give a table of library → version → doc path → open risks, and list every item marked UNVERIFIED.
