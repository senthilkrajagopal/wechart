# wechart specification (phases 1 and 2)

## Overview

wechart is a browser BI tool on the Cube semantic layer, built to replace Spotfire for one organisation: analysts build charts and dashboards, mark data and drill into details without writing SQL, while semantic-layer engineers and platform operators run the Cube model, its pre-aggregations, jobs and connections from the same application. This spec covers phase 1 and traces to [docs/requirements.md](./requirements.md); design rules it cites by number live in [docs/design/direction.md](./design/direction.md).

**Phase 2** adds four things:
- sign-in through OIDC, switchable to phase 1's single-user mode;
- folder access by AD group, with Super-Admin, Admin and User roles;
- models and data sources as folder items, ~~resolved per folder~~ published into one flat model under folder-prefixed names, with short names bound at publish;
- private workspaces, whose work reaches shared folders only through approved proposals.

**Amended 2026-09-25** by the user's architecture decisions (`docs/inputs/2026-09-25-architecture-decisions.md`) and round R27.
- Cube plus **xcube**, the Cube-side package in the user's fork, is the semantic service: it owns the published model, Cube's rules and the connection runtime.
- wechart is its client, and owns workflow, folders, permissions, dashboards and the UI.
- Criteria the decisions overturn are reworded in place, or retired with their text kept and struck through. Their IDs are kept, never reused.

**Amended again 2026-09-26** by the final integration plan (`docs/inputs/2026-09-26-integration-plan-decisions.md`, cited `[IP n]`; its shared doc, as a snapshot, `[plan]`) and round R28.
- wechart is the system of record. xcube keeps a derived copy of what is published, and compiles it as **modules**, checking only the modules a change affects.
- ~~Every folder, the shared root included, publishes under `<folderId>__<shortName>`.~~ Superseded by slice 3, below. A published item keeps its binding until it is next published.
- The plan's slices order the work. Criteria are reworded in place in the same way, and three are added: AC-330 to AC-332.

**Amended again 2026-09-26** by xcube's slice 3 as built (`[X3]`, with the user's decisions recorded in it, `[X3, user]`; xcube's answers, `[X3A]`) and round R30. It is set out in [requirements.md §P2.4](./requirements.md), "Slice 3 as built".
- **Names.** The shared root keeps its bare names; only an item in another folder publishes as `<folderId>__<shortName>`, and nothing stored is migrated.
- **Items.** wechart publishes items (one cube or view each) and its folder tree through xcube's changesets.
- **Changes to criteria.** AC-328, AC-333, AC-272 and AC-321 are reworded, AC-331 is retired, and AC-336 and AC-337 are added.

It also brings back everything phase 1 moved to its backlog. Its features are F25–F36, after F24. The phase-1 criteria it changes are rewritten in place, marked "phase 2", and unchecked until tests show them again. It traces to [docs/requirements.md](./requirements.md) Part 2.

Acceptance criteria are global and sequential. A criterion is checked only when a passing test demonstrates it.

## Glossary

| Term                         | Meaning                                                                                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cube**                     | The semantic layer. A _cube_ is a modelled table with measures and dimensions; a _view_ is a curated selection across cubes with a fixed join path.                                |
| **Measure / dimension**      | An aggregated value (revenue, count) and a grouping attribute (category, order date). Cube declares the type of each.                                                              |
| **Member**                   | Any measure, dimension, segment or hierarchy, named `cube.member`.                                                                                                                 |
| **Granularity**              | The time bucket of a time dimension: day, week, month, quarter, year, or a custom granularity.                                                                                     |
| **Pre-aggregation (rollup)** | A materialised summary Cube builds and queries instead of the source database.                                                                                                     |
| **Cube Store**               | The store that holds pre-aggregations.                                                                                                                                             |
| **Security context**         | The claims wechart sends with a query; Cube uses them for row-level policies and masking. Phase 2: a signed-in user's token carries their groups only, signed RS256 (AC-326), and on a preview the overlay it may query (AC-323). |
| **Tile**                     | One element on a dashboard: chart, text, header, divider, image or link.                                                                                                           |
| **Chart spec**               | The saved, engine-neutral definition of a chart: source, metrics, dimensions, time, filters, type and options.                                                                     |
| **Marking**                  | A named, coloured selection shared by the tiles that use it. Stored as a predicate over dimension members. Spotfire's term, kept.                                                  |
| **Brushing**                 | Showing a marking in other tiles by drawing the marked share at full strength and fading the rest.                                                                                 |
| **Details tile**             | A tile limited to what is marked, Spotfire's details visualization.                                                                                                                |
| **Cross-filtering**          | The alternative interaction mode: a click filters or highlights other tiles, set per tile pair.                                                                                    |
| **Quick calculation**        | A fixed transformation applied to a measure in a chart (% of total, difference from previous period, running total, rank, moving average), executed as a Cube multi-stage measure. |
| **Library chart**            | A chart saved to a folder and reusable across dashboards. A **local chart** belongs to one dashboard.                                                                              |
| **Bookmark**                 | A saved state: page tab, filters and marks.                                                                                                                                        |
| **Accelerated**              | A result Cube served from a pre-aggregation rather than the source database.                                                                                                       |
| **Security mode** (phase 2)  | Whether sign-in is enabled. Enabled: every user signs in through the configured OIDC provider. Disabled: **single-user mode**, one user holding every permission.                 |
| **AD group**                 | A directory group, delivered in the user's token by the identity provider. wechart grants folder access to groups only, never to individual users.                              |
| **Read-only / read-write groups** | A folder's two optional permission settings. Each one left unset is inherited from the parent folder.                                                                        |
| **Super-Admin / Admin / User** | The roles. A **Super-Admin** is a member of the group the deployment names, with read-write everywhere and every admin surface. An **Admin** is a read-write member of a folder. A **User** is a read-only member, who sees dashboards only. |
| **Shared folder**            | A folder in the shared tree, as opposed to a workspace.                                                                                                                           |
| **Workspace**                | A user's private area, "My workspace", where all creating and editing happens.                                                                                                    |
| **Target folder**            | The shared folder a workspace item is meant for. Its path resolves the item's cubes after the workspace's own.                                                                    |
| **Proposal**                 | A request to put a workspace item into its target folder. It lands only when approved by its author, a read-write member of the folder, or a Super-Admin.                      |
| **Resolution**               | Finding what a short name inside an item means. The search runs when the item is published, nearest first from the item's own folder up to the root, and the full prefixed name is stored. xcube does it. ~~Cubes from the folder up to the root, nearest first; data sources the same way, then in the folder's descendants.~~ (Amended 2026-09-25.) |
| **xcube**                    | The Cube-side package in the user's Cube fork (formerly `cube-introspection`). ~~It owns the published model, Cube's validation and access policies, the connection runtime, overlays and name resolution~~ It keeps a derived copy of what wechart publishes, in its own `xcube` schema, and runs names, modules, validation, the folder check, overlays and connections for Cube. It knows the folder tree and each folder's allowed groups (amended 2026-09-26, `[IP 1, IP 2]`). |
| **Prefixed name**            | The unique name a cube, view or data source is published under: `<folderId>__<shortName>`, the folder id written as `f` plus its letters and digits. ~~The shared root adds no prefix.~~ The shared root is prefixed like any folder (amended 2026-09-26, `[IP 3, R28]`). |
| **Allowed groups**           | The groups whose members may query a folder's cubes: those granted on the folder, an ancestor or a descendant, plus the Super-Admin group. ~~xcube turns them into access policies.~~ xcube checks a query's folders against them for each request (amended 2026-09-26, `[IP 6, R28]`). |
| **Module**                   | A group of cubes and views that reference each other, which xcube compiles and versions on its own. A change recompiles only its modules. |
| **Changeset**                | The items a publish upserts or deletes, sent to xcube together with the revision they were based on. |
| **Revision**                 | xcube's number for the published state. Each publish that lands makes a new one. |
| **Whole-model check**        | ~~Compiling the entire published model with a change applied. The change is refused if anything, anywhere, breaks.~~ Now the **publish check**: compiling each module a change affects, with the change applied, in a throwaway compile. The change is refused if any of them breaks (amended 2026-09-26, `[IP 5]`). |
| **Overlay**                  | Unpublished workspace or proposal content that xcube holds for a short time, so it can be queried before it lands. |
| **Service credential**       | The credential wechart uses for calls it makes on its own behalf (introspection, builds and jobs, system partitions, health, xcube's admin calls), separate from users' tokens. |
| **Audit trail**              | wechart's record of sign-ins, permission changes, proposals, approvals, rejections, restores and data-source changes. Super-Admins can browse it.                                |

---

## F1. Application shell and navigation

Purpose: one workbench for authoring and administration, addressable by URL.
Traces to: `[R2]`, `[docs/inputs §8]`, direction.md §2.

- [x] AC-001 WHEN the application loads, THE SYSTEM SHALL show a top bar whose workspace switcher lists Explore to every user; Data sources, Jobs and Schedules to Super-Admins and read-write members; and Security to Super-Admins. It SHALL list no Model workspace (phase 2: `[P2 input, R18, R19, R23]`).
      Fails when: the switcher shows a "Dashboards" or "Model" entry, omits an entry the user's role may use, or shows one it may not.
- [x] AC-002 WHEN the user opens a workspace, a dashboard, a chart or a model file, THE SYSTEM SHALL change the URL so that reloading it restores the same surface and the same selected object.
      Fails when: after reload the application shows a different workspace, dashboard, chart or file than the URL names.
- [x] AC-003 WHEN the user switches the theme, THE SYSTEM SHALL re-render the current surface in the other theme without changing the route or losing scroll position.
      Fails when: the route changes, the scroll position resets, or any element keeps the previous theme's background colour after the switch.
- [x] AC-004 THE SYSTEM SHALL render every text node at a computed font size of at least 12 px (direction.md rule 1).
      Fails when: any rendered text node has a computed font-size below 12 px.
- [x] AC-005 THE SYSTEM SHALL meet WCAG AA contrast for text in both themes: at least 4.5:1, or 3:1 for text of at least 18.66 px bold or 24 px (direction.md rule 2).
      Fails when: any text node's contrast ratio against its own background is below its threshold.
- [x] AC-006 WHEN the user presses ⌘K or Ctrl+K anywhere in the application, THE SYSTEM SHALL open the search palette with keyboard focus in its input.
      Fails when: after the shortcut, focus is not inside the palette input, or the palette does not open.

## F2. wechart service: Cube access, metadata and persistence

Purpose: one server that owns Cube credentials, queries, and everything wechart saves.
Traces to: `[R5]`, `[R4]`, `[research/cube/data-apis.md]`, `[research/cube/access-control.md]`.

- [x] AC-007 WHEN the browser needs data or metadata, THE SYSTEM SHALL obtain it through the wechart API, and the browser SHALL make no request to the Cube API host.
      Fails when: a network request from the browser targets the Cube API host, or any response to the browser contains the Cube API secret.
- [ ] AC-008 WHEN wechart queries Cube, THE SYSTEM SHALL attach the configured security context to every request. WHILE security is enabled, every query made for a signed-in user SHALL carry ~~that user's AD groups~~ that user's AD groups that some access policy names (a folder's allowed groups or a model's own policies), and nothing else of theirs, so the model's access policies, and xcube's folder check, filter its rows and members by group. What wechart asks Cube or xcube for on its own behalf uses the service credential, never a user's token (phase 2: `[R14, R25; AD 1, AD 4, AD 12; IP 6, IP 8, R28]`; ~~what wechart asks Cube for itself (compiling a model, builds, schedules, a data source's catalog, health) carries the configured context alone~~, superseded 2026-09-25; the groups trimmed to those a policy names, 2026-09-26).
      Fails when: a request reaches Cube without the configured context; with security enabled, a query made for a signed-in user carries no groups, groups other than the user's, a group of theirs that no policy names, or any other attribute of theirs; leaves out a group of theirs that some policy names; a group's access policy doesn't apply to its members' queries; or an own-behalf call carries a user's token.
- [x] AC-009 WHEN Cube reports a new `schemaVersion`, THE SYSTEM SHALL serve metadata from the new model within 60 seconds without a restart.
      Fails when: 60 seconds after the change, a metadata request still returns members from the previous model.
      Note (2026-09-26, `[IP 5, R28]`): from slice 3 the new model is a new xcube revision, ~~and the metadata comes from xcube's merged field list~~ and the metadata is Cube's `/v1/meta`, merged by xcube across modules; xcube has no field-list route of its own (`[X3A, R30]`). This criterion keeps its wording and its tick, and the slice-3 publish task retests it.
- [x] AC-010 WHILE Cube replies "Continue wait" for a query, THE SYSTEM SHALL keep the request open, show the tile in a loading state, and deliver the result when it arrives.
      Fails when: the tile shows an error, or the result never renders although Cube completed the query.
- [x] AC-011 WHEN a query is superseded, because its filters, marks or dashboard changed, THE SYSTEM SHALL cancel the earlier query against Cube before rendering the newer result.
      Fails when: no cancellation is issued for the superseded request, or the older result replaces the newer one.
- [x] AC-012 IF Cube returns an error for a query, THEN THE SYSTEM SHALL show the tile in an error state with Cube's message and a control that reveals the query JSON.
      Fails when: the tile shows an empty chart, or the message and query JSON are not reachable from the tile.
- [x] AC-013 WHEN a result is served from a pre-aggregation, THE SYSTEM SHALL mark the tile as accelerated and show the age of the data; otherwise it SHALL mark the tile as live.
      Fails when: a result with `usedPreAggregations` shows no accelerated indicator, or a source-database result is labelled accelerated.
- [x] AC-014 WHEN a dashboard, chart, folder, bookmark or setting is saved, THE SYSTEM SHALL store it so that it is present and unchanged after the wechart service restarts.
      Fails when: any saved object is missing or altered after a restart.
- [x] AC-015 WHEN two browser sessions edit the same dashboard and the second saves over a newer version, THE SYSTEM SHALL refuse the save and tell the user the dashboard changed.
      Fails when: the second save silently overwrites the newer version.
- [x] AC-181 WHEN a saved chart written in an earlier document format is opened, THE SYSTEM SHALL upgrade it to the current format on read and render the same chart, and SHALL refuse to open one whose format is newer than it understands, saying so.
      Fails when: a chart stored in an earlier format opens with a different chart type, different members or an empty query, or a chart from a newer format is opened and silently renders something other than what it describes.
- [x] AC-016 THE SYSTEM SHALL record, for every query it issues, the Cube request, the duration and whether it was accelerated, and expose those records in the Jobs workspace.
      Fails when: a rendered chart produces no query record, or the record lacks duration or acceleration.

## F3. Explore: folders, catalog and search

Purpose: find, open and organise dashboards and charts.
Traces to: `[docs/inputs §8]`, direction.md §2.

- [x] AC-017 WHEN the user opens Explore, THE SYSTEM SHALL show a folder tree and the contents of the selected folder, listing dashboards and library charts with their type, owner and last-updated time.
      Fails when: the list omits an item in the folder, or a column is blank for an item that has that value.
- [x] AC-018 WHEN the user opens a dashboard from Explore, THE SYSTEM SHALL open it in view mode with its saved page tabs, tiles and settings.
      Fails when: the dashboard opens in edit mode, or a saved tile or setting is missing.
- [x] AC-019 WHEN the user types in the Explore search box, THE SYSTEM SHALL list every dashboard and library chart whose title contains the text, and no dashboard-local chart.
      Fails when: a matching library item is missing, or a dashboard-local chart appears in the results.
- [x] AC-020 WHEN the user creates a folder, dashboard or chart from Explore, THE SYSTEM SHALL place it in the selected folder and open it.
      Fails when: the new object lands in a different folder, or is not opened.
- [x] AC-021 WHEN the user renames or moves a folder, dashboard or chart, THE SYSTEM SHALL keep every reference to it working, including dashboards that use a moved library chart.
      Fails when: a dashboard that used the object shows a missing-chart state after the move.
- [x] AC-022 WHEN the user opens a library chart's page, THE SYSTEM SHALL list every dashboard that uses it and offer to add it to another dashboard.
      Fails when: a dashboard that contains the chart is missing from the list.
- **AC-023 (retired 2026-09-30, superseded by AC-362, `[R48]`; the ID stays and is never reused):** ~~WHEN the user deletes a library chart that dashboards use, THE SYSTEM SHALL name those dashboards and require confirmation before deleting.~~ A chart a dashboard uses can't be deleted at all now: its delete is refused, naming those dashboards.
- [x] AC-024 WHEN the user navigates the Explore contents with the keyboard, THE SYSTEM SHALL move the selection with the arrow keys and open the selected item with Enter.
      Fails when: arrow keys do not move the selection, or Enter does not open the selected item.

## F4. Chart builder and recommendation

Purpose: build a chart from Cube members without SQL, with a recommended chart type that can be overridden.
Traces to: `[docs/inputs §2, §3]`, `[R2]`, direction.md §6, rules 8–10, 29–30.

- [x] AC-025 WHEN the user opens the chart editor, THE SYSTEM SHALL list the cubes and views available from `/v1/meta` and, once one is chosen, its measures, dimensions, segments and time dimensions grouped by type.
      Fails when: a member present in the metadata is missing from the field list, or a hidden member is shown.
- [x] AC-026 WHEN the user drags a field onto a well, or adds it with the well's "+" picker, THE SYSTEM SHALL add it to that well and re-run the chart's query.
      Fails when: the field is not added by either route, or the chart still shows the previous result.
- [x] AC-027 WHILE a field is being dragged, THE SYSTEM SHALL mark each well as legal or illegal for it and give a reason for every illegal well (direction.md rule 12).
      Fails when: an illegal well accepts the drop, or gives no reason.
- [x] AC-028 WHEN the chart's fields change, THE SYSTEM SHALL recommend a chart type from the field signature and cardinalities, and show at least one runner-up, each with a reason of at most 80 characters (direction.md rule 9).
      Fails when: no runner-up is shown, or a reason exceeds 80 characters.
- [x] AC-029 WHEN the user opens "Why this chart?", THE SYSTEM SHALL show the field signature, the cardinality of each field, and every hard rule with its pass or fail result (direction.md rule 29).
      Fails when: a rule that rejected a candidate is absent from the trace.
- [x] AC-030 THE SYSTEM SHALL never recommend a chart with two value axes (direction.md rule 8).
      Fails when: any recommendation or runner-up uses a second value axis.
- [x] AC-031 WHEN a chart would exceed a channel's capacity, THE SYSTEM SHALL reject that candidate: more than 8 colour categories, more than 20 trellis panels, more than 6 pie slices, or more than 200 heatmap cells (direction.md rule 6).
      Fails when: a candidate over any cap is offered as the top pick or a runner-up.
- [x] AC-032 WHEN the user picks a chart type manually, THE SYSTEM SHALL keep that type through later field changes until the user chooses "Back to recommended" (direction.md rule 10).
      Fails when: the type reverts to the recommendation after a field change.
- [x] AC-033 WHEN the chart's fields cannot produce the chosen type, THE SYSTEM SHALL show what is missing, naming the well and the member type needed.
      Fails when: the chart renders empty axes with no message, or the message does not name what is missing.
- [x] AC-034 WHEN the editor is opened from a dashboard tile, THE SYSTEM SHALL offer a preview at the tile's own size and a preview that fills the editor, and SHALL return to the dashboard with the tile updated.
      Fails when: the preview ignores the tile's width and height, or the dashboard tile does not reflect the applied changes.
- [x] AC-035 WHEN the user changes the chart in the editor, THE SYSTEM SHALL support undo and redo of every change made since the editor opened, and a "Discard changes" that restores the chart as it was.
      Fails when: any change cannot be undone, or Discard leaves a change applied.
- [x] AC-036 WHEN the user opens the results drawer, THE SYSTEM SHALL show the result rows, the underlying rows, and the Cube query JSON for the current chart.
      Fails when: any of the three views is missing, or shows data from a different query than the chart rendered.
- [x] AC-182 WHEN the chart editor is opened on an existing chart, THE SYSTEM SHALL load that chart's cube, fields, chart type and axis settings into the editor.
      Fails when: the editor opens with empty wells, or with a chart type other than the one saved.
- [x] AC-183 WHEN a chart edited from a dashboard tile is applied, THE SYSTEM SHALL hold the edit in the dashboard's edit session and write the chart document only when the dashboard is saved (direction.md §2 Layout: "Save dashboard (applies the chart and saves the dashboard)").
      Fails when: the chart document changes before the dashboard is saved, or the tile does not show the edit before saving.

## F5. Chart rendering

Purpose: render the saved chart spec with the axis, legend and label rules the design fixes.
Traces to: `[docs/inputs §2]`, direction.md §6, rules 4–7, 18–19.

- [x] AC-037 THE SYSTEM SHALL render bar, horizontal bar, grouped and stacked bar, line, multi-series line, area, stacked area, scatter, pie, donut, treemap, heatmap, KPI, table, pivot table, trellis (small multiples) and combo charts from a chart spec.
      Fails when: a listed type cannot be produced from a valid spec.
- [x] AC-038 WHEN a chart has two or more series, THE SYSTEM SHALL show a legend; with one series it SHALL show none (direction.md rule 4).
      Fails when: a single-series chart shows a legend box, or a multi-series chart omits it.
- [x] AC-039 THE SYSTEM SHALL give a member the same colour in every tile of a dashboard, and keep that colour when filters change the set of visible members (direction.md rule 7).
      Fails when: a member's colour changes between tiles or after filtering.
- [x] AC-040 WHEN the user edits an axis, THE SYSTEM SHALL apply minimum, maximum, logarithmic scale, gridlines, tick rotation, number format and axis title to the rendered chart.
      Fails when: any of those settings has no effect on the rendered axis.
- [x] AC-041 WHEN a categorical chart exceeds its top-N setting, THE SYSTEM SHALL offer either to fold the remainder into a single "Other (n)" item, labelled with the number of members it covers, or to drop it. It SHALL also offer a row limit that drops rows past it (phase 2: the UI review's gap 10, `[R16]`).
      Fails when: the chart renders more categories than the setting, the remainder is unlabelled when folded or still drawn when dropped, or no row limit can be set.
- [x] AC-042 WHEN a chart is loading, THE SYSTEM SHALL show a skeleton in the shape of the chart, and WHEN it fails, an error state offering Retry and the error details (direction.md rule 18).
      Fails when: loading shows an empty tile, or the error state offers no Retry or no details.
- [x] AC-043 WHEN a query returns no rows, THE SYSTEM SHALL show an empty state naming the filters that are in effect.
      Fails when: the tile renders blank axes with no message, or the message omits an active filter.
- [x] AC-044 WHEN the user sorts a chart, THE SYSTEM SHALL order categories by value ascending, value descending or label, and keep that order after a data refresh.
      Fails when: the order is not applied, or changes after a refresh with unchanged data.
- [x] AC-045 WHEN a trellis chart is rendered, THE SYSTEM SHALL lay panels out in a grid with a shared scale by default and a per-panel title, and cap the panels at 20 (direction.md rule 6).
      Fails when: panels use different scales while the shared setting is on, or more than 20 panels render.
- [x] AC-046 THE SYSTEM SHALL format every value with its member's format from the Cube model, including currency and percentage, in axes, labels, tooltips and tables. A value axis shared by measures whose formats differ shows plain ticks, while each value keeps its own format in tooltips, labels and tables (the user, 2026-09-21: "Record it as the rule").
      Fails when: a value renders without its declared format in any of those places, other than the ticks of a value axis shared by measures whose formats differ.

## F6. Quick calculations and calculation requests

Purpose: give analysts who do not write SQL the common derived measures, and a path for everything else.
Traces to: `[R7]`, `[R2]`, `[research/cube/data-modeling.md]`.

> **Status, 2026-09-21: quick calculations deferred for phase 1, at the user's direction.**
> The options were presented: keep the Cube multi-stage design, compute from
> extra queries in the browser, or defer. The user replied: "C. Defer or drop
> quick calculations for phase 1."
> AC-047, AC-048 and AC-049, and their tasks T053–T055, are not built in phase 1.
> They stay here, unticked, so they can be taken up again. The spike that proved
> the design (`research/cube/spike-model-store-and-quick-calcs.md`) is kept.
> The two semantic questions asked with it (what a running total counts from,
> and % of total under a filter) are closed with it.
> The request flow, AC-050 to AC-052 (tasks T056–T058), is deferred with them.
> The user: "same with quick calculations.. if already some work is done.. keep
> it as it is.. any pending work.. defer". None of F6 had been built beyond the
> spike, so the whole of F6 waits.

> **Phase 2** (`[R16]`): these six return from the backlog. AC-050, AC-051 and
> AC-052 now name the folder and the workspace, since the Model workspace is
> gone (`[P2 input]`). The status note above is phase 1's: AC-047 (T380) and
> AC-049 (T381) are built and ticked, 2026-09-28.

- [x] AC-047 WHEN the user opens the menu on a measure in the chart editor, THE SYSTEM SHALL offer % of total, difference from previous period, % difference from previous period, running total, rank and moving average.
      Fails when: any of the six is missing from the menu.
- [x] AC-048 WHEN a quick calculation is applied, THE SYSTEM SHALL compute it in Cube as a multi-stage measure rather than in the browser, and the tile SHALL label the measure with the calculation applied.
      Fails when: the value is computed from the already-fetched rows, or the label does not name the calculation.
- [x] AC-049 WHEN a quick calculation needs a time dimension and the chart has none, THE SYSTEM SHALL disable it and say which field is missing.
      Fails when: the calculation is offered and produces an error, or gives no reason when disabled.
- [ ] AC-050 WHEN the user requests a calculation the menu cannot express, THE SYSTEM SHALL record a request carrying the chart, the fields in use and the user's description, and show it to the read-write members of the folder whose model defines the chart's cube.
      Fails when: the request is stored without the chart reference, or is not shown to that folder's read-write members.
- [ ] AC-051 WHEN a read-write member of that folder opens a calculation request, THE SYSTEM SHALL open the target cube's model in the model editor, in their workspace, with the request visible beside it.
      Fails when: the editor opens without the request, or on a different cube than the request names.
- [ ] AC-052 WHEN a requested measure is added to the model and its proposal is approved into the folder, THE SYSTEM SHALL mark the request as resolved and name the member that resolves it.
      Fails when: the request stays open after the member exists in the folder, or names no member.

## F7. Dashboard authoring

Purpose: build dashboards on a 12-column grid, in place, with the keyboard or the mouse.
Traces to: `[docs/inputs §8, §9]`, direction.md §2, rules 15–17, 36–42.

- [x] AC-053 WHEN the user activates Edit on a dashboard, THE SYSTEM SHALL show the edit bar with Undo, Redo, Discard and Save, and the edit sidebar with Add, Outline and Properties.
      Fails when: any of those controls is missing in edit mode.
- [x] AC-054 WHILE editing, THE SYSTEM SHALL show a 12-column grid on the canvas and snap every tile to whole columns and to 8-pixel row units (direction.md rule 15).
      Fails when: a tile's width is not a whole number of columns, or its height is not a multiple of 8 pixels.
- [x] AC-055 WHEN the user drags a tile's edge or corner, THE SYSTEM SHALL resize it and show a live readout of columns, percentage and pixels, and THE SYSTEM SHALL offer no numeric width or height field anywhere in the editor (direction.md rule 36).
      Fails when: resizing shows no readout, or a width or height input exists in the editor.
- [x] AC-056 WHEN the user drags a tile by its grip, THE SYSTEM SHALL show a drop marker and move the tile to the marked position, including onto a page tab or a tab-group label, which moves it into that tab.
      Fails when: no drop marker appears, or a drop on a tab label leaves the tile in its original container.
- [x] AC-057 WHEN a tile has keyboard focus in edit mode, THE SYSTEM SHALL move it with the arrow keys, resize it with Shift and the arrow keys, open its chart editor with E, and delete it with Delete (direction.md rule 39).
      Fails when: any of those keys has no effect on the focused tile.
- [x] AC-058 WHEN the user adds an element from the sidebar, THE SYSTEM SHALL offer chart, chart from folders, section, tab group, markdown, header, divider, image, link and filter, and insert the chosen one after the selection or into the chosen "+ Add" slot — except a filter, which is added to the filter bar (direction.md §2, Filter bar).
      Fails when: an element type is missing, an insert lands somewhere other than the stated position, or a filter lands anywhere but the filter bar.
- [x] AC-059 WHEN a tab group would be added outside a section, THE SYSTEM SHALL wrap it in a new section and say so (direction.md rule 37).
      Fails when: a tab group is created directly on a page tab, or no message explains the wrapping.
- [x] AC-060 WHEN the user deletes a tile, section, page tab or tab, THE SYSTEM SHALL offer an undo in a toast and through Undo, restoring the element and its contents (direction.md rule 38).
      Fails when: an undo restores the element without its contents, or no undo is offered.
- [x] AC-061 WHEN the user deletes a section that contains tiles, THE SYSTEM SHALL ask whether to delete its contents or keep them, and apply the choice.
      Fails when: the contents are deleted without asking, or "keep" loses a tile.
- [x] AC-062 WHEN the user duplicates a chart tile, THE SYSTEM SHALL give the copy its own dashboard-local chart, so editing one tile leaves the other unchanged.
      Fails when: editing the copy changes the original tile.
- [x] AC-063 WHEN an image tile has no alternative text, THE SYSTEM SHALL show a warning on the tile in edit mode, and SHALL accept only PNG, JPEG, WebP, GIF and SVG files of at most 2 MB (direction.md rule 42).
      Fails when: a tile without alt text shows no warning, or a file of another type or over 2 MB is accepted.
- [x] AC-064 WHEN a link tile targets a dashboard, THE SYSTEM SHALL open that dashboard, carrying the current filters when "pass the current filters" is on; WHEN it targets a URL, THE SYSTEM SHALL accept only http and https and open it in a new tab (direction.md rule 42).
      Fails when: a non-http(s) URL is accepted, or the target dashboard opens without the filters while the option is on.
- [x] AC-065 WHEN the user saves a dashboard, THE SYSTEM SHALL persist the layout, tile settings, dashboard settings and marking definitions, and leave edit mode.
      Fails when: any of those is missing after reopening the dashboard.
- [x] AC-066 WHEN the user discards an edit session, THE SYSTEM SHALL restore the dashboard, its chart specs and its settings to their state when editing began.
      Fails when: any change made during the session survives the discard.
- [x] AC-184 IF a dashboard save fails, THEN THE SYSTEM SHALL stay in edit mode with every change made in the session kept, including charts edited from its tiles, and show why the save failed.
      Fails when: after a failed save the dashboard is out of edit mode, a change made before the save is missing from the dashboard or from Undo, or no reason for the failure is shown.
- [x] AC-185 WHEN the user saves the dashboard settings page in view mode, THE SYSTEM SHALL keep the page open until the save has gone through, and IF the save fails, keep the settings as entered on the page and show why the save failed.
      Fails when: the page closes before the save has gone through, or after a failed save the settings entered are missing from the page or no reason for the failure is shown.
- [x] AC-186 IF a dashboard save has had no answer 60 seconds after it was sent, THEN THE SYSTEM SHALL treat it as failed — keeping the edit session as AC-184 requires, or the settings page as AC-185 requires — and say that the save timed out.
      Fails when: 60 seconds after a save with no answer, "Saving…" is still shown, an edit session it was saving is out of edit mode, or the reason shown does not say the save timed out.
- [x] AC-067 WHEN the dashboard re-renders during editing, THE SYSTEM SHALL keep the canvas and sidebar scroll positions (direction.md rule 40).
      Fails when: either scroll position resets after a re-render.
- [x] AC-068 WHEN the user adds a section template, THE SYSTEM SHALL insert its tiles as empty charts that state what they need, rather than charts bound to sample data.
      Fails when: a template inserts a chart already bound to fields the user did not choose.

## F8. Dashboard settings and interaction modes

Purpose: one place for a dashboard's name, interaction mode, markings, cross-filter matrix and layout.
Traces to: `[docs/inputs §12]`, direction.md §2, rules 13, 32, 56.

- [x] AC-069 WHEN the user activates the gear control on a dashboard, THE SYSTEM SHALL open a settings page with General, Interactions, Markings, Cross-filtering and Layout sections, and a way to return without saving.
      Fails when: a section is missing, or leaving the page applies changes that were not saved.
- [x] AC-070 WHEN the user changes the interaction mode, THE SYSTEM SHALL keep both configurations, activate the chosen one and label the other as inactive (direction.md rule 56).
      Fails when: switching discards the other mode's configuration, or both modes are active at once.
- [x] AC-071 WHEN the interaction mode changes and the settings are saved, THE SYSTEM SHALL clear current marks and cross-filters.
      Fails when: a mark or cross-filter from the previous mode still affects a tile.
- [x] AC-072 WHEN a new dashboard is created, THE SYSTEM SHALL set its interaction mode to Markings with one marking named "Marking" as the default (direction.md rule 57).
      Fails when: a new dashboard starts in cross-filter mode, or without a default marking.
- [x] AC-073 WHEN the user leaves the settings page with unsaved changes, THE SYSTEM SHALL ask before discarding them.
      Fails when: unsaved changes are discarded without asking.
- [x] AC-074 WHEN settings are saved while the dashboard is being edited, THE SYSTEM SHALL record them as one undoable change.
      Fails when: Undo after saving settings leaves any of them applied, or requires more than one Undo.
- [x] AC-075 WHEN the page width setting changes, THE SYSTEM SHALL render the dashboard centred at 1,440 pixels or across the full width, according to the setting.
      Fails when: the rendered canvas width does not follow the setting.

## F9. Filters

Purpose: dashboard, tab and tile filters that combine with everything else.
Traces to: `[docs/inputs §2]`, direction.md §7, rule 14.

- [x] AC-076 THE SYSTEM SHALL offer filter widgets for a date range with presets, a list with search, a numeric range, and a checkbox list.
      Fails when: a listed widget type cannot be added to a dashboard.
- [x] AC-077 WHEN a filter is added, THE SYSTEM SHALL scope it to the dashboard, a page tab or named tiles, and show its scope on the widget (direction.md rule 14).
      Fails when: the widget does not show its scope, or a tab-scoped filter changes a tile on another tab.
- [x] AC-078 WHEN a filter value changes, THE SYSTEM SHALL re-query every tile in its scope and leave tiles outside the scope unchanged.
      Fails when: a tile outside the scope re-queries, or a tile inside it keeps the previous result.
- [x] AC-079 WHEN a filter's member is not reachable from a tile's cube or view, THE SYSTEM SHALL leave that tile unfiltered and mark it as not covered by the filter.
      Fails when: the tile shows a query error, or is silently left unfiltered with no indication.
- [x] AC-080 WHEN the user clears a filter, THE SYSTEM SHALL return every tile in its scope to the unfiltered result.
      Fails when: any tile still reflects the cleared filter.
- [x] AC-081 WHEN filters are active, THE SYSTEM SHALL include them in the dashboard's URL so that opening that URL reproduces them.
      Fails when: opening the URL in a new session produces different filter values.
- [x] AC-082 THE SYSTEM SHALL combine dashboard, tab and tile filters with marking limits using AND (direction.md rule 20).
      Fails when: a tile's rows satisfy only one of the two and are still shown.
- [x] AC-083 WHEN a date filter uses a relative preset such as "last 30 days", THE SYSTEM SHALL send it to Cube as that relative range rather than as fixed dates.
      Fails when: the query contains fixed dates for a relative preset.

## F10. Markings

Purpose: Spotfire's linked selections, on a live semantic layer.
Traces to: `[docs/inputs §10–13]`, `[R7]`, direction.md §7a, rules 43–55; `[docs/design/references-markings.md]`, `[research/cube/markings-query-support.md]`.

> **Status, 2026-09-20: built but not wired. Deferred at the user's direction.**
> The modules behind these criteria exist and are tested — `core/src/markings/*`,
> `charts/src/interaction/*`, `charts/src/marking/*`, `web/src/dashboard/markings/*`,
> `web/src/dashboard/tiles/NothingMarked.tsx` — but nothing in the running app
> imports them. `ChartTile.tsx` contains no marking code and `DashboardView.tsx`
> none either, so a user cannot mark anything today.
>
> Eighteen criteria here were ticked on unit tests of those modules and have been
> unticked, because each one's `Fails when:` names an observation on *a tile* and
> no test makes it. Only AC-084, AC-086 and AC-099 stay ticked: their failing
> states are observable on artifacts that do exist in the product — the dashboard
> document (`core/src/dashboard-document.ts`) and the shipped palette.
>
> The cause was a planning gap, not a coding one: unlike the F5–F9 tasks, which
> list `DashboardView.tsx` and an e2e spec in their Files, every marking task
> (T086–T119) lists only its own module and test. No task wires the subsystem, so
> on the current plan these ticks could never be earned. T190 covers that work and
> is deferred; none of the code has been deleted.

- [x] AC-084 THE SYSTEM SHALL give every dashboard at least one marking and exactly one default marking, and SHALL allow at most four markings per dashboard (direction.md rules 43, 57; `[R7]`).
      Fails when: a dashboard has no default marking, or a fifth marking can be created.
- [x] AC-085 WHEN a chart tile is created, THE SYSTEM SHALL set it to mark with the dashboard's default marking, and the tile's Marking setting SHALL also offer "(None)" and every other marking (direction.md rule 44).
      Fails when: a new chart tile marks with no marking, or "(None)" is missing from the setting.
- [x] AC-086 THE SYSTEM SHALL store a marking only as a predicate over Cube dimension members — tuples of member, granularity and value, or bounded ranges — and never as row numbers or result positions (direction.md rule 46).
      Fails when: a stored marking references a row index or a position in a result set.
- [x] AC-087 WHEN the user clicks an item in a tile that marks, THE SYSTEM SHALL replace that marking with the clicked item; WHEN the user Ctrl-clicks or ⌘-clicks, THE SYSTEM SHALL toggle that item and leave the rest (direction.md rule 47).
      Fails when: a plain click adds to the marking, or a modified click replaces it.
- [x] AC-088 WHEN the user drags a rectangle, or Alt-drags a lasso, over a tile that marks, THE SYSTEM SHALL mark every item the shape touches, and a press-and-release without movement SHALL be treated as a click, not a selection.
      Fails when: a drag of at least 5 pixels is treated as a click, or a click is treated as an empty selection.
- [x] AC-089 WHEN the user Ctrl-drags or ⌘-drags a shape, THE SYSTEM SHALL toggle the enclosed items when all or none of them are marked, and otherwise add them (direction.md rule 47).
      Fails when: a Ctrl-drag over a partly marked set unmarks items instead of adding them.
- [x] AC-090 WHEN the user clicks a legend entry's text in a tile that marks, THE SYSTEM SHALL mark every item of that category, and Ctrl-click or ⌘-click SHALL add further categories; series visibility SHALL be changed elsewhere (direction.md rule 7 of §7a).
      Fails when: a legend click hides the series, or does not mark it.
- [x] AC-091 WHEN the user clicks a trellis panel header, THE SYSTEM SHALL mark every item in that panel.
      Fails when: the click marks a single item, or nothing.
- [x] AC-092 WHEN the user clicks a row in a table tile, THE SYSTEM SHALL mark it; Shift-click SHALL mark the range from the anchor row; and rows SHALL be markable only when the cube's primary key is available (direction.md rule 10 of §7a).
      Fails when: Shift-click marks a single row, or rows are markable without a primary key.
- [x] AC-093 WHILE a marking is in range mode, THE SYSTEM SHALL let the user drag along an axis to mark a continuous range, show it as a coloured stripe on that axis, and keep its bounds when filters change (direction.md rule 30 of §7a; `[R7]`; phase 2, `[R16]`).
      Fails when: the stripe does not appear, or the bounds move when a filter changes.
- [x] AC-094 WHEN the user clicks an empty plot area, or presses Escape on a focused tile, THE SYSTEM SHALL unmark that tile's marking and leave other markings unchanged.
      Fails when: another marking is cleared, or the marking survives.
- [x] AC-095 WHEN a marking changes, THE SYSTEM SHALL update every tile that uses it or is limited by it, on every page tab of the dashboard (direction.md rule 48).
      Fails when: a tile on another page tab still shows the previous marking state when opened.
- [x] AC-096 WHEN a tile shows a marking, THE SYSTEM SHALL draw marked items in their own colour with an outline in the marking's colour and fade unmarked items (direction.md rule 49).
      Fails when: unmarked items render at full strength, or marked items carry no outline.
- [x] AC-097 WHEN an item is partly marked and its measure is additive, THE SYSTEM SHALL draw the marked share from the baseline at full strength and fade the remainder; WHEN the measure is not additive, THE SYSTEM SHALL draw the whole item with a pattern and show the marked and total values in its tooltip (direction.md rule 49; `[docs/inputs §11]`; phase 2, `[R16]`).
      Fails when: a partial average or distinct count is drawn as a sub-length, or a partly marked sum shows no marked share.
- [x] AC-098 THE SYSTEM SHALL convey marking state by more than colour: every tile using a non-empty marking shows a badge naming the marking and the number of marked items, and every non-empty marking has a chip naming it and summarising its values (direction.md rule 50).
      Fails when: a tile or chip conveys the marking only through colour.
- [x] AC-099 THE SYSTEM SHALL keep every marking colour at least ΔE 15 from every categorical series colour under normal vision, and at least ΔE 8 under protan and deutan simulation, in both themes (direction.md rule 51).
      Fails when: the palette validator reports a marking colour below either threshold against any series colour.
- [x] AC-100 WHEN a tile has keyboard focus in view mode, THE SYSTEM SHALL move between its items with the arrow keys without changing the marking, mark the focused item with Space, toggle it with Ctrl+Space or ⌘+Space, and extend the marking with Shift and the arrow keys (direction.md rule 52).
      Fails when: an arrow key changes the marking, or Space does not mark the focused item.
- [x] AC-101 WHEN a marking changes, THE SYSTEM SHALL announce the marking's name, the number of marked items and the source tile in a polite live region (direction.md rule 52).
      Fails when: no announcement is made, or it omits the count.
- [x] AC-102 IF a marking would exceed 1,000 items, THEN THE SYSTEM SHALL refuse the additional items and explain the limit; "Mark all" SHALL be exempt because it stores the tile's filter rather than a list (`[R7]`, direction.md rule 29 of §7a).
      Fails when: a marking exceeds 1,000 stored items, or "Mark all" is refused.
- [x] AC-103 WHEN a tile's cube or view cannot resolve every member of a marking's predicate, THE SYSTEM SHALL leave that tile unmarked and label it as not linked to that marking (direction.md rule 18 of §7a).
      Fails when: the tile shows a query error, or is silently left unbrushed with no label.
- [x] AC-104 WHEN a tile needs the marked share and the marking's members are not among its own groupings, THE SYSTEM SHALL obtain it with one additional query per tile and keep the unmarked result cached across marking changes (phase 2, `[R16]`).
      Fails when: more than one extra query per tile is issued for a marking change, or the base result is re-fetched when only the marking changed.
- [x] AC-105 WHEN the same set of items is marked again, THE SYSTEM SHALL produce an identical Cube query to the previous time, so the result can be served from cache.
      Fails when: two identical markings produce different query JSON.
- [x] AC-106 WHILE a dashboard is in edit mode, THE SYSTEM SHALL select the tile on click and change no marking.
      Fails when: clicking a chart in edit mode changes a marking.

## F11. Details tiles and marked-rows actions

Purpose: Spotfire's master-detail workflow and the operations on a selection.
Traces to: `[docs/inputs §11]`, direction.md §7a, rules 33, 53, 55.

- [x] AC-107 WHEN a tile is limited by one or more markings, THE SYSTEM SHALL restrict its query to those markings, combined as All markings (AND) or Any marking (OR) according to its setting, and SHALL skip markings that are empty (direction.md rule 33).
      Fails when: a tile limited by two markings with one empty returns no rows, or OR behaves as AND.
- [x] AC-108 THE SYSTEM SHALL prevent a tile from being limited by the marking it marks with, and SHALL state the reason where that option is offered (direction.md rule 45).
      Fails when: a tile can be limited by its own marking.
- [x] AC-109 WHEN every marking limiting a tile is empty, THE SYSTEM SHALL show the tile's nothing-marked state: all data, an empty visualization, or a message on an empty background, as set on the tile (direction.md rule 33).
      Fails when: the tile shows a state other than the one configured.
- [x] AC-110 WHEN a tile is first limited by a marking, THE SYSTEM SHALL set its nothing-marked state to the message option and pre-fill the message with the names of the tiles that mark with those markings (direction.md rule 58).
      Fails when: the default is another option, or the message is empty.
- [x] AC-111 IF a limiting marking is not empty but its items are excluded by the active filters, THEN THE SYSTEM SHALL say the marked items are hidden by the filters rather than showing the nothing-marked state (direction.md rule 55).
      Fails when: the tile shows its nothing-marked state in that situation.
- [x] AC-112 WHEN the user chooses "Create details tile" on a tile, THE SYSTEM SHALL add a tile limited by that tile's marking, with its nothing-marked message pre-filled.
      Fails when: the new tile is not limited by the marking, or has no message.
- [x] AC-113 WHEN the user chooses "Filter to marked" or "Filter out marked", THE SYSTEM SHALL create a removable dashboard filter equivalent to the marking's predicate, or its negation, and then clear the marking (direction.md rule 53).
      Fails when: the filter is not removable, the marking survives, or the rows kept differ from the marked rows.
- [x] AC-114 WHEN the user chooses "View marked rows", THE SYSTEM SHALL show the underlying rows behind the marked items, state the total number of rows, and offer an export of them (direction.md rule 53).
      Fails when: the rows shown do not match the marking, or the total is absent.
- [x] AC-115 WHEN the user chooses Invert marking or Mark all on a tile, THE SYSTEM SHALL mark exactly the tile's unmarked items, or all of its items, and leave other tiles' contributions to that marking unchanged.
      Fails when: an inverted marking keeps a previously marked item, or Mark all misses a visible item.
- [x] AC-116 WHEN a text tile contains a marking token, THE SYSTEM SHALL render the marking's summary or count, and a measure token limited by a marking SHALL show the measure over the marked rows, or over all data when nothing is marked (phase 2, `[R16]`).
      Fails when: a token renders as literal text, or a limited measure ignores the marking.

## F12. Cross-filtering and cross-highlighting

Purpose: the alternative interaction mode for dashboards that prefer it.
Traces to: `[docs/inputs §12]`, direction.md §7, rules 13, 32.

- [x] AC-117 WHILE a dashboard is in cross-filter mode, WHEN the user clicks a mark, THE SYSTEM SHALL apply the action set for that source and target pair: filter the target, highlight it, or leave it unchanged.
      Fails when: a pair set to None changes, or a pair set to Filter only highlights.
- [x] AC-118 THE SYSTEM SHALL apply the dashboard's default pair action to pairs the author has not set, and show that default in the settings page (direction.md rule 32).
      Fails when: an unset pair behaves differently from the stated default.
- [x] AC-119 WHEN a cross-filter is active, THE SYSTEM SHALL show a chip naming the member and value and the source tile, and clear it when the chip is dismissed or Escape is pressed.
      Fails when: the chip omits the source tile, or dismissing it leaves a tile filtered.
- [x] AC-120 WHILE a dashboard is in cross-filter mode, THE SYSTEM SHALL offer no marking controls, chips or badges anywhere in that dashboard.
      Fails when: a marking control appears in cross-filter mode.

## F13. Bookmarks and shareable links

Purpose: return to a state, and send it to someone.
Traces to: `[R7]`, direction.md §7a.

- [x] AC-121 WHEN the user saves a bookmark, THE SYSTEM SHALL store the page tab, the filter values and the current marks under a name the user gives.
      Fails when: applying the bookmark restores a different tab, filter value or mark set.
- [x] AC-122 WHEN the user applies a bookmark, THE SYSTEM SHALL restore that state without changing the dashboard's saved definition.
      Fails when: applying a bookmark modifies the dashboard for other users.
- [x] AC-123 WHEN the user copies a link with marks, THE SYSTEM SHALL produce a URL that reproduces the current filters and marks when opened.
      Fails when: opening the link produces different marks or filters.
- [x] AC-124 WHEN a dashboard is opened without a bookmark or link parameters, THE SYSTEM SHALL open it with no marks (direction.md rule 54).
      Fails when: a dashboard opens with marks the author left behind.
- [x] AC-125 THE SYSTEM SHALL save marking definitions — names, colours, the default, which tile marks with which, and the limits — with the dashboard, and never the marked items (direction.md rule 54).
      Fails when: reopening a saved dashboard restores marked items.

## F14. Chart ownership: local and library charts

Purpose: editing a chart must never change a dashboard the author did not open.
Traces to: `[docs/inputs §9]`, direction.md §2, rule 41.

- [x] AC-126 WHEN a chart is created on a dashboard, THE SYSTEM SHALL make it local to that dashboard and keep it out of Explore folders and search.
      Fails when: a dashboard-local chart appears in a folder listing or in search results.
- [x] AC-127 WHEN the user saves a local chart to a folder, THE SYSTEM SHALL make it a library chart reusable by other dashboards, and say where it was saved.
      Fails when: the chart stays local, or the confirmation does not name the folder.
- [x] AC-128 WHEN a library chart is opened for editing from a dashboard, THE SYSTEM SHALL state that it is shared and on how many dashboards, and offer to make a local copy before changes spread (direction.md rule 41).
      Fails when: the editor gives no shared indication for a library chart used by more than one dashboard.
- [x] AC-129 WHEN the user makes a local copy of a shared chart, THE SYSTEM SHALL repoint that tile to the copy, keep edits made so far, and leave the shared chart unchanged.
      Fails when: the shared chart changes, or the edits are lost.
- [x] AC-130 WHEN a local chart is edited, THE SYSTEM SHALL change no other dashboard (direction.md rule 41).
      Fails when: another dashboard's rendering changes after editing a local chart.

## F15. Model editor (Cube YAML)

Purpose: author the semantic model in a form and in code, with the same file underneath.
Traces to: `[docs/inputs §4b]`, direction.md §7b, rules 20, 26–28; `[research/cube/data-modeling.md]`.

- [x] AC-131 WHEN the user opens a model in a folder, THE SYSTEM SHALL show the cubes, views, measures, dimensions, segments, hierarchies, joins and pre-aggregations each of its files defines (phase 2: models live in folders, `[P2 input]`).
      Fails when: a file's object is missing from the listing.
- [x] AC-132 THE SYSTEM SHALL offer a form for every key Cube's validator accepts on a cube or a view, with enumerations offering exactly the validator's allowed values (direction.md rule 26).
      Fails when: a key the validator accepts has no form field, or an enumeration offers a value the validator rejects.
- [x] AC-133 WHEN the user edits a field in the form, THE SYSTEM SHALL update the YAML view within one render, and WHEN the user edits valid YAML, THE SYSTEM SHALL update the form within 500 milliseconds (direction.md rule 27).
      Fails when: either view still shows the previous value after that point.
- [x] AC-134 IF switching from code to form would lose information, such as comments or anchors, THEN THE SYSTEM SHALL warn and name what would be lost before applying the change (direction.md rule 20).
      Fails when: comments disappear from a file with no warning.
- [x] AC-135 IF the YAML fails to parse, THEN THE SYSTEM SHALL name the file and line in a problems list and keep the form read-only until it parses (direction.md rule 28).
      Fails when: the form stays editable on unparseable YAML, or the problem names no line.
- [x] AC-136 WHEN the user saves model changes, THE SYSTEM SHALL validate them against Cube before publishing and refuse to publish a model Cube rejects, showing Cube's error per file.
      Fails when: an invalid model is published, or the error is not attributed to a file.
      Note (2026-09-26, `[IP 5, plan, R28]`): from slice 3, publishing is one changeset call to xcube. It validates the affected modules and activates them, with each error naming its item. ~~This criterion stays checked until then. Slice 3 rewords it and retests it.~~ It keeps its wording (the slice-3 note before AC-336, `[R30]`). Retested at T426 on items mode: each error lands on its item's file; a compile error carries no line, since xcube's lines are its resolved copy's; a YAML error keeps its line. A file that makes no item, or declares a name another file does, is refused before xcube is asked.
- [x] AC-137 WHEN a valid model is published, THE SYSTEM SHALL make the new members available to the chart builder without restarting Cube.
      Fails when: a published member is missing from the field list while Cube reports the new schema version.
      Note (2026-09-26, `[IP 5, R28]`): from slice 3, "Cube reports the new schema version" becomes "xcube reports the new revision active on every instance". ~~This criterion stays checked until then. Slice 3 rewords it and retests it.~~ It keeps its wording (the slice-3 note before AC-336, `[R30]`). Retested at T426 on items mode: a publish applied as its changeset is in the field list at once, through another API process and on another Cube instance (`xcube-cutover.spec.ts`, D2).
- [x] AC-138 WHEN the user opens the join editor for a cube, THE SYSTEM SHALL show the join graph with each relationship's direction and let the user add a join by choosing the target cube, the relationship and the condition.
      Fails when: the diagram omits a declared join, or shows a direction the model does not declare.
- [x] AC-139 WHEN the user generates cubes from a data source, THE SYSTEM SHALL browse that connection's schemas and tables and create a cube per selected table with its columns mapped to dimensions and a count measure (`[R7]`).
      Fails when: a selected table produces no cube, or a column is dropped without saying so.
      > Deferred 2026-09-21 with F18, at the user's direction ("for requirements that dont work with cube defer"). Browsing a connection's tables is Cube's drivers called from wechart's server, not a Cube API (`research/cube-capabilities.md` §6).
      > **Un-deferred 2026-09-25 `[R10]`.** Browsing and generating go through the data-source introspection API in the user's Cube fork (`research/cube/introspection-api.md`). The generated YAML is shown with the columns Cube left unmapped and each one's reason, ~~saved to wechart's model store, and published as any model change is~~ saved in the author's workspace, and published to xcube through a proposal and the whole-model check (AC-136, AC-137; amended 2026-09-25, AC-321).
- [x] AC-249 IF a cube generated from a data source has the name or file name of a cube or file already in the target folder, THEN THE SYSTEM SHALL refuse to save it, name the existing cube or file, and leave the existing one unchanged (`[R10]`; phase 2: names are unique per folder, `[P2 input]`).
      Fails when: an existing model file changes; a clashing cube is saved into the same folder; a cube is refused for a name used only in another folder; or the refusal does not name what it clashes with.
- [ ] AC-250 THE SYSTEM SHALL grant Cube's `introspection` scope only to wechart's service credential, used to browse a data source and generate cubes, never to a user's token, and never to the browser (`[R10]`; phase 2: `[AD 12, R27]`; ~~the short-lived tokens its API signs … never to a draft's token~~, amended 2026-09-25 and unticked until retested).
      Fails when: a user's token is granted `introspection`, or a response to the browser carries a credential that has it.
- [x] AC-140 WHEN a model file uses Jinja, Python or JavaScript generation, THE SYSTEM SHALL open it read-only in the code view and say why it cannot be edited as a form. (Phase 2: such a file can't be published into a folder, AC-332.)
      Fails when: such a file opens in an editable form, or gives no reason.
- [x] AC-141 WHEN the user edits a member that charts use, THE SYSTEM SHALL list the charts and dashboards that reference it before saving. A model saved in My workspace SHALL list, before it is saved, the shared charts and dashboards that landing it would change in the folder it goes to, and name that folder by its path (amended 2026-10-02, `[R55]`: a shared model changes only through a copy in My workspace and a proposal, so the workspace save is where a member's references are listed).
      Fails when: a referencing chart is missing from that list; or a save in My workspace of a model whose landing would change a member a shared chart or dashboard uses, in the folder the model goes to or through a view or an extending cube on a path through it, lists nothing, or doesn't name that folder.

## F16. Pre-aggregations

Purpose: make acceleration visible and editable, because data volumes vary widely.
Traces to: `[R4]`, `[docs/inputs §1]`, direction.md §7c; `[research/cube/pre-aggregations.md]`.

> **Status, 2026-09-21: AC-145 deferred, at the user's direction.**
> Cube Core has no documented API that lists a rollup's partitions with their
> build state and last build time (`research/cube/refresh-jobs-caching.md` §C).
> There are two sources, and the user chose to defer both rather than depend on either:
> - Cube's undocumented `/cubejs-system/*` routes, which need
>   `CUBEJS_PLAYGROUND_AUTH_SECRET` and may change without notice;
> - Cube Store's MySQL interface, which has no authentication and exposes
>   destructive commands.
>
> The user's words: "defer both as per recommendation".
>
> **Un-deferred 2026-09-24, at the user's direction.** An independent analysis
> found two things:
> - **Rebuilding selected partitions** needs only the documented jobs API:
>   a `dateRange` of one partition's start matches that partition alone.
> - **The full partition list** comes exactly only from Cube's
>   `/cubejs-system/v1/pre-aggregations/partitions`. Cube Store's SQL interface
>   can't show a partition that was never built, and anything that reaches it
>   can run destructive commands unauthenticated.
>
> The user chose "Cube's system API": read-only, switched on by a secret only
> Cube and wechart's API hold, with a contract test run on each Cube upgrade.
> "Building" and "failed" come from AC-150's history. The route's research is
> `research/cube/system-partitions.md`.

- [x] AC-142 WHEN the user opens a cube's pre-aggregations, THE SYSTEM SHALL list each rollup with its measures, dimensions, time dimension, granularity, partition granularity and indexes.
      Fails when: a declared rollup or any of those attributes is missing.
- [x] AC-143 WHEN the user edits a rollup in the form, THE SYSTEM SHALL write it into the model file as YAML, subject to the same validation and publishing as any model change.
      Fails when: the change is applied to Cube without being written to the model file.
- [x] AC-189 IF a model change being published leaves a pre-aggregation naming a measure, dimension, segment, time dimension or index column that the model does not have, THEN THE SYSTEM SHALL refuse to publish the change and show each unknown name on that pre-aggregation's row in its cube's Pre-aggregations tab.
      Fails when: a change whose rollup names `CUBE.no_such_member` is published (the stored file changes), or the refusal does not show `CUBE.no_such_member` on that rollup's row.
      > Added 2026-09-22 at the user's decision ("Yes, refuse to publish"): Cube compiles a rollup that names members the model doesn't have, and every query on that cube then fails (research/cube/pre-aggregations.md, "Observed locally").
- [x] AC-144 WHEN the user opens a chart's acceleration panel, THE SYSTEM SHALL say whether the chart's query matches a pre-aggregation, and when it does not, name the member that prevents the match.
      Fails when: the panel reports a match that Cube does not use, or names no reason for a miss.
- [x] AC-145 WHEN the user opens a ~~partitioned~~ rollup in Jobs, THE SYSTEM SHALL list every partition Cube derives from its build range in the time zones wechart builds in (one, the whole pre-aggregation, for a rollup that isn't partitioned), each with its period, its build state (built, not built, building, ~~or failed~~ queued, stalled or failed) and the time Cube last built it, and SHALL rebuild the partitions the user selects through Cube's jobs API, or every partition. A partition SHALL read failed only when the latest build of it that wechart started failed and no build has replaced it since, saying which build it still serves. A lambda or rollup join SHALL name the rollups it is built from instead. An answer from which a module's partitions are missing SHALL be asked for again, not shown as none (phase 2, `[R16]`; amended 2026-10-02, `[R56]`: design 16's states and Build all; failed only for builds wechart started, since the refresh worker's build history is deferred, `[R41]`; built from xcube's partitions route, and building, queued and stalled from its queue route).
      Fails when: a partition Cube lists for the rollup is missing, or shows a last build time other than Cube's newest version of it; ~~or~~ a rebuild starts a job whose table names a partition the user did not select, or starts none for one they did; a partition reads failed after a build wechart didn't start, or after a later build replaced the failed one; or a list whose first answer lacked a module's partitions is shown without them.
- [x] AC-146 WHEN the user defines an index on a rollup, THE SYSTEM SHALL let the columns be ordered and mark aggregate indexes as such.
      Fails when: the column order cannot be changed, or an aggregate index is written as a regular one.
- [x] AC-147 IF a query would fail under rollup-only mode, THEN THE SYSTEM SHALL warn on the chart that it depends on the source database.
      Fails when: such a chart shows no warning.
- [x] AC-148 WHEN the user asks to refresh a chart's data, THE SYSTEM SHALL re-query Cube bypassing wechart's cached result and show the new data-as-of time; and WHEN a pre-aggregation serves the chart, THE SYSTEM SHALL say that its data is as of that pre-aggregation's last build, and name the Jobs workspace as where to rebuild it.
      Fails when: a chart the database serves shows its previous result again with an unchanged timestamp after a refresh; or a refreshed chart a pre-aggregation serves shows no message naming that pre-aggregation, saying its data is as of the last build, and linking to the Jobs workspace.
      > Reworded 2026-09-22 at the user's decision: Cube answers a refresh of a rollup-served chart from the rollup as last built, so its data-as-of time need not move (research/cube/refresh-jobs-caching.md). The refresh says so rather than rebuilding it.
- [x] AC-235 WHEN the user publishes a model change in which a rollup names members of cubes Cube cannot join, THE SYSTEM SHALL refuse the publish, name the rollup and its file, and give Cube's reason. That includes a rollup in a file the change leaves alone that Cube already refused before it (amended 2026-09-26, `[R29]`: every break refuses, and xcube's check sends no `compare`; unticked until the cut-over demonstrates it, since the check it replaced let an old refusal pass).
      Fails when: such a change is published, or the refusal names no rollup or gives no reason.
      > Added 2026-09-25 at the user's direction: "if it is not possible to rollup.. then refuse providing reason why it cannot be done". Cube compiles such a rollup, then its refresh worker aborts its run for the whole model at it, so no scheduled refresh in that model happens (research/cube/refresh-key-schedule.md; seen in T159). How Cube decides a rollup can be joined is in research/cube/rollup-join-paths.md.

## F17. Jobs, builds and scheduling

Purpose: run and watch pre-aggregation builds, since Cube Core keeps only 24 hours of job records.
Traces to: `[docs/inputs §7]`, direction.md §7c, rules 22, 34; `[research/cube/refresh-jobs-caching.md]`; design 16 `[R56]`; `[research/xcube-jobs-schedules-routes.md]`.

> **Design 16 approved, 2026-10-02 (`[R56]`).** The user approved
> `docs/design/reviews/2026-10-01/designs/16-jobs-schedules.html` as drawn, with
> all five proposals and every question's drawn default:
> - **Amended:** AC-145, AC-150, AC-151, AC-153, AC-154, AC-155 and AC-234 here,
>   AC-294 (F32) and AC-297 (F33).
> - **Added:**
>   - AC-391, each row's state;
>   - AC-392, a refresh key and a wechart schedule both running (Q2);
>   - AC-393, the refresh worker's status (Q4);
>   - AC-394 … AC-398, the proposals P1–P5;
>   - AC-399, the design itself.
> - **Sources:** xcube's partitions, queue and cancel, hidden-cube meta and
>   refresh-worker routes, in the image compose pins (`89628a0e88`).
> - **Still deferred:** the refresh worker's own build history (`[R41]`). Nothing
>   here reports a build Cube started on its own as failed, or names who started it.
>
> **Status, 2026-09-21: AC-150, AC-153, AC-154 and AC-155 deferred, at the user's direction.**
> The user: "Lets first integrate what works with cube... and for requirements
> that dont work with cube defer..". These four need machinery Cube Core has no
> API for (`research/cube-capabilities.md` §3–4):
> - build history beyond Cube's 24 hours (a Cloud feature wechart would rebuild);
> - a scheduler ("Core has no scheduler API"), with its ownership labels and
>   suspension.
>
> Starting a build, the state badges and deployment health (AC-149, AC-152,
> AC-156) are Cube's own APIs and stay.
>
> **Amended 2026-09-24, at the user's direction.** An independent analysis found that
> Cube Core's schedule is the model's `refresh_key`, which wechart already edits
> and publishes. The user chose "Cube-owned now":
> - **AC-153 and AC-154 are reworded and no longer deferred.** A schedule is set in
>   the model editor's pre-aggregation form, the user's choice. The next runs carry
>   a note that a run can start up to about five minutes late.
> - **The wechart-scheduler half of the old AC-153** becomes AC-234. It stays
>   deferred, with AC-150 and AC-155.
> - **Sources:** `research/cube/refresh-key-schedule.md`, a sibling to
>   `refresh-jobs-caching.md`.
>
> **AC-150 un-deferred and reworded, 2026-09-24, at the user's direction.** A
> second independent analysis found that Cube Core blocks only half of it:
> - **Builds wechart starts:** Cube's documented jobs API reports each one's
>   final state.
> - **Builds the refresh worker starts on a `refresh_key`:** no API reports them.
>   Cube's documented `logger` option in `cube.js` receives the refresh worker's
>   events, but the events themselves are Cube's internal wording.
>
> Asked what the history is for (finding out why a rollup's data is stale or
> failing), the user chose "Build it, all builds", keeping the last 100 records
> of each pre-aggregation. They also chose to research Cube v1.7.43 and move to
> it: on v1.7.42 a failed import can report `done`. Sources:
> `research/cube/job-records.md`, `research/cube/logger-build-events.md` and
> `research/cube/upgrade-1.7.43.md`.
>
> **Phase 2, 2026-09-25.** Every criterion here is in scope, the deferred ones
> included (`[R16]`). Jobs and Schedules are for Super-Admins, and for each
> folder's read-write members over that folder's own pre-aggregations (AC-297,
> `[R18]`).
>
> **AC-151 deferred too, 2026-09-21, at the user's direction.** Cube's
> documented jobs API starts builds and reports on tokens, but it can't list the
> queue or cancel an entry. Only the undocumented `/cubejs-system/*` routes and
> Cube Store's MySQL interface can, and the user deferred both (see F16's
> status note, AC-145).

- [x] AC-149 WHEN the user starts a build for a pre-aggregation, THE SYSTEM SHALL submit it to Cube, show the job token, and poll until the job reports done, missing partition, failure or not found.
      Fails when: the job's terminal state is never shown, or the token is absent.
- [ ] AC-391 WHEN the user opens Jobs, THE SYSTEM SHALL show in each pre-aggregation's row the state of its partitions that most needs attention (failed, then building, queued, stalled, partly built with how many of how many, not built, and built), taken from AC-145's sources whoever started the builds; when Cube last built any of its partitions; who started that build from wechart, a person or a wechart schedule with its icon, or "—" when wechart didn't start it; and how many partitions it has (`[R56]`, design 16's screen 1; `[R41]`, `[R42.2]`).
      Fails when: a row reads not built while a partition of it has a built version; reads built while one of its partitions is failed, building, queued or not built; shows a last-built time other than the newest version Cube lists for its partitions; or names a starter for a build wechart didn't start.
- [ ] AC-150 WHEN a pre-aggregation build ~~finishes, whether wechart started it through Cube's jobs API or Cube's refresh worker started it on its refresh key,~~ that wechart started through Cube's jobs API, from Jobs or by a wechart schedule, finishes, THE SYSTEM SHALL record it in wechart's own history, one record for each start, with its pre-aggregation, ~~partition~~ the partitions it asked for, ~~what started it~~ who or what started it (a person, or a wechart schedule), its duration as wechart saw it, its outcome ~~with Cube's error when it failed~~ (done; failed, with how many partitions failed and Cube's error; cancelled, with who cancelled it; or Cube's record expired, when Cube no longer knew a job before wechart saw it end), and a log of each state Cube reported for each partition's job, with its token and the time wechart saw it. It SHALL also list the record in the Jobs workspace's Run history, newest first, 50 at a time, filterable by outcome, starter, folder and time, after Cube's own record of the job has expired, and keep the latest 100 records of each pre-aggregation (phase 2, `[R16]`; the refresh worker's builds deferred to the next phase, `[R41]`; amended 2026-10-02, `[R56]`: one record per start, design 16's Q6, with its outcomes and filters).
      Fails when: a build that finished more than 24 hours ago is missing from Run history, or lacks any of those fields; ~~a rebuild of a rollup with a `* * * * *` refresh key is not in Run history within one of Cube's check periods of finishing;~~ a build started from Jobs that finishes while no browser has Jobs open is not recorded; a recorded outcome differs from what Cube reported; one start of several partitions is kept as more than one record; a job Cube no longer knew is recorded as done or failed; or a pre-aggregation has more than 100 records.
- [x] AC-151 THE SYSTEM SHALL show the build queue, oldest first, with each entry's pre-aggregation, its folder, partition, state (queued, building or stalled), who started it (a person, a wechart schedule, Cube's refresh worker or a query) and token ("—" for a build wechart didn't start, which has none), and allow cancelling a queued entry that wechart started. An entry Cube's refresh worker or a query started SHALL be shown without Cancel, saying why. A cancel that reaches Cube after the entry started building, or left the queue, SHALL say it wasn't cancelled, and why (phase 2, `[R16]`; amended 2026-10-02, `[R56]`: design 16's Q1, since Cube's refresh worker queues a build it lost to a cancel again at its next run until its refresh key turns over, and Q5).
      Fails when: a queued build is missing, or cancelling leaves it queued; an entry wechart started shows no token; Cancel is offered on an entry wechart didn't start; or a cancel refused because the entry had started or gone is reported as done.
- [ ] AC-394 WHEN the user stops a building entry in the queue that wechart started, THE SYSTEM SHALL have xcube stop it, so that no version of its partition comes from that build, and record it in Run history as cancelled while building, with who stopped it. An entry Cube's refresh worker or a query started SHALL offer no Stop (`[R56]`, design 16's P1, with Q1; research `xcube-jobs-schedules-routes.md` §1).
      Fails when: after Stop, the build finishes and its partition gets a version from it; its record reads anything but cancelled; or Stop is offered on an entry wechart didn't start.

- [x] AC-152 THE SYSTEM SHALL show every job and schedule with an icon and a text label for its state, never colour alone (direction.md rule 22).
      Fails when: a state is conveyed only by colour.
- [ ] AC-153 WHEN the user sets a pre-aggregation's refresh schedule in the model editor as a cron expression and time zone, THE SYSTEM SHALL accept only expressions Cube's refresh worker can run, show the next runs Cube's refresh key implies, listed only up to its zone's next daylight-saving change and then followed by a warning that Cube may run it an hour off after the change until it next compiles the model, with a note that a run can start up to about five minutes after its time, and write the schedule into the model as that pre-aggregation's `refresh_key`, validated and published as any model change (phase 2, `[R16]`; amended 2026-10-02, `[R56]`: design 16's Q3, since Cube keeps the offset its zone had when it generated the key's SQL, research `cube/refresh-key-schedule.md`).
      Fails when: a shown run differs from when Cube's refresh key turns over, an expression Cube cannot run is published, ~~or~~ the pre-aggregation is not rebuilt within one of Cube's check periods of a shown run; or a run after the zone's next daylight-saving change is listed, or the list stops at the change with no warning.
- [ ] AC-154 THE SYSTEM SHALL list every pre-aggregation's refresh schedule in Schedules, those of cubes marked `public: false` included, and every wechart-owned schedule, one row for each, so that a pre-aggregation with both has two; label each with its owner, Cube's refresh worker or wechart's scheduler, as an icon and a label, and a wechart schedule with who made it; show each schedule in words and as written, with its zone, its next run (a refresh key's by AC-153's daylight-saving rule), and its last run, which for a wechart schedule is how its last run ended and for a refresh key only when Cube last built the pre-aggregation; show Cube-owned schedules read-only there with a link opening the pre-aggregation in the model editor, and say when one is not scheduled (direction.md rule 34; phase 2, `[R16]`; amended 2026-10-02, `[R56]`: design 16's screen 2 and Q2; hidden cubes from xcube's admin meta, `[R41]`).
      Fails when: a `refresh_key` schedule is editable on the Schedules page, is unlabelled, or its link does not open the model editor; a pre-aggregation of a cube marked `public: false` is missing; a pre-aggregation with both kinds of schedule has one row; or a refresh key's row shows how its last build ended or who started it.
- [ ] AC-397 THE SYSTEM SHALL offer on Schedules an owner filter, All, Cube's refresh worker or wechart, each with the count of the schedules it lists in the folders the user sees there (`[R56]`, design 16's P4, keeping the 2026-09-24 design 07's filter).
      Fails when: a count differs from the rows its choice then lists, or a choice lists a schedule of the other owner.
- [ ] AC-155 IF a ~~scheduled~~ wechart-owned schedule's ~~build fails repeatedly~~ runs fail as many times in a row as that schedule sets, THEN THE SYSTEM SHALL suspend the schedule ~~after the configured number of~~ ~~as many consecutive failures as that schedule sets, 3 by default,~~ and say so on the schedule, with its failed runs and Cube's last error, and offer Resume, which runs it again from its next time with the count back at 0. The number SHALL be a whole number of 1 or more, 3 by default, with no "never". A run SHALL count as failed when Cube refuses to start it, or when any of its partitions ends failed or missing partition; one whose record Cube had dropped SHALL count neither way. Until the limit, the schedule SHALL say how many runs in a row have failed (phase 2, `[R16]`; amended 2026-09-28, `[R42]`: a refresh key keeps Cube's own retry; amended 2026-10-02, `[R56]`: design 16's state E and Q9).
      Fails when: the schedule keeps running after the limit, or offers no Resume; a run Cube refused, or one with a single partition failed, isn't counted; a run whose record Cube dropped changes the count; a limit below 1, or none, is accepted; or after Resume it is suspended before that many more runs have failed.
- [ ] AC-234 WHEN the user creates a schedule for a pre-aggregation build ~~or a cache warm-up~~ ~~that a refresh key cannot express~~, THE SYSTEM SHALL accept a five-field cron expression and a time zone, which is required and starts empty, read the cron back in words, show the next five runs it implies in that zone and in UTC, listed across a daylight-saving change at the zone's own time, and start each run at its time through Cube's jobs API, building every partition of the pre-aggregation. It SHALL refuse a cron it can't read, naming the field and why; accept one a refresh key could express, with a note that a refresh key could run it, in the model, by proposal; let each schedule choose whether a run that fell due while wechart was stopped runs once when wechart is back, the default, or is skipped; and let a schedule be changed or deleted, each applied at once, with no proposal (phase 2, `[R16]`; amended 2026-09-28, `[R42]`: result-cache warm-ups dropped, since they would need a token per group set, AC-008; amended 2026-10-02, `[R56]`: design 16's screen 2 and state D, with its Q3, Q7, Q8 and Q11).
      Fails when: the next runs shown do not match the expression in its zone, or a due run does not start; a run builds fewer than every partition; an unreadable cron is saved, or its refusal names no field; a cron a refresh key could express is refused, or accepted with no note; a missed run is run when its schedule says to skip it, or skipped when it says to run it once; or a change or a delete waits for a proposal.
- [ ] AC-392 WHILE a pre-aggregation has a refresh key Cube's refresh worker runs, WHEN the user makes or opens a wechart schedule for it, THE SYSTEM SHALL say that the refresh key runs too and that both run, and SHALL leave the model's refresh key and `scheduled_refresh` as they are (`[R56]`, design 16's Q2).
      Fails when: such a schedule's form or pane doesn't say the refresh key runs too; or making, changing or deleting a wechart schedule changes the model, or offers to set `scheduled_refresh: false`.
- [ ] AC-395 WHEN the user chooses Run now on a wechart schedule, THE SYSTEM SHALL start the schedule's build at once through Cube's jobs API, recorded in Run history as started by Run now on that schedule, by that user, and leave the schedule's times unchanged (`[R56]`, design 16's P2).
      Fails when: no build starts; its record doesn't name both the schedule and the person; or the schedule's next run changes.
- [ ] AC-396 WHEN the user pauses a wechart schedule, THE SYSTEM SHALL start none of its runs until it is resumed, and show it as paused, with who paused it, as an icon and a label. Once resumed, its next run SHALL be its first time after the resume (`[R56]`, design 16's P3).
      Fails when: a paused schedule starts a run at one of its times; it doesn't say it is paused, or by whom; or once resumed it runs a time that fell while it was paused.

- [x] AC-156 THE SYSTEM SHALL show the refresh worker's state and the Cube deployment's health, and mark the deployment as down when Cube's health endpoint does not report healthy.
      Fails when: the indicator stays healthy while Cube reports otherwise.
- [ ] AC-393 THE SYSTEM SHALL show the refresh worker's state in Jobs' header as xcube reports it: running, with when it last ran; behind, while a worker refreshes an older revision of the model than the one published; failing, while a module's last error is later than its last good run; or none, when no worker has run the model. A panel opened from it SHALL list each worker with its revision and last run, and each module with its last run and state, giving a module's last error to Super-Admins and to nobody else (`[R56]`, design 16's state F and Q4; research `xcube-jobs-schedules-routes.md` §3).
      Fails when: the badge reads running while every worker's revision is older than the model's, or while a module's last error is later than its last good run; or a user who isn't a Super-Admin sees a module's error text.
- [ ] AC-398 THE SYSTEM SHALL show in Jobs' header, over the user's folders, how many builds are building and how many are queued, how many pre-aggregations read failed by AC-391's rule, and how many wechart schedules are suspended, each count a link to the tab or page that lists them, filtered to those (`[R56]`, design 16's P5).
      Fails when: a count differs from the entries or rows its link then lists, or counts one in a folder the user can't write.
- [ ] AC-399 THE SYSTEM SHALL draw Jobs and Schedules as design 16 draws them (`docs/design/reviews/2026-10-01/designs/16-jobs-schedules.html`), with the structure, placement, controls, wording and states the design and its notes give, in the tokens of direction.md §3–5. That includes loading as skeleton rows; an error with Retry and Details; empty in the user's folders; a refusal in the API's words; access lost while open, with its toast and the list read again; a link out of the user's scope as Not found; sign-in off as a Super-Admin sees it; and, below 1,024 pixels, the pane as a full-screen sheet. Design 10's pin 6 and pane note, and the 2026-09-27 design 07's read-write help line, SHALL read as design 16's state J rewords them (`[R56]`: the user, "Approve as drawn").
      Fails when: a state design 16 draws is missing, or a surface differs from it in structure, placement, controls or wording, judged against its notes as AC-343 is.

## F18. Data sources and connections

Purpose: add, test and assign connections, which Cube Core cannot do through an API.
Traces to: `[R4]`, `[docs/inputs §7]`, direction.md §7c, rules 23, 35; `[research/cube/data-sources.md]`.

> **Status, 2026-09-21: deferred, except AC-162, at the user's direction** ("for
> requirements that dont work with cube defer").
> Cube Core has no API to list, add or test a connection
> (`research/cube-capabilities.md` §6):
> - a source is Cube's environment, changed by restarting Cube;
> - a test means wechart calling the drivers itself;
> - `/v1/data-sources` is Cloud-only.
>
> AC-157 to AC-161, AC-163 and AC-164 wait. AC-162 stays: it writes
> `data_source` into a cube's model file, and belongs with the Model workspace
> (F15). Data sources are configured as they are today, in Cube's environment.
>
> **Phase 2, 2026-09-25: all of F18 is in scope, per folder** (`[R16]`).
> - Data sources are folder items, under the folders' access rules. They are
>   created and changed in a workspace and land through approval (F27–F30).
> - The Data sources workspace lists every source the user may see (`[R19]`).
> - Credentials are encrypted in wechart's metadata database (AC-298, `[R14]`),
>   to xcube's public key (amended 2026-09-25, `[AD 7]`).
> - ~~How Cube takes connections from wechart, rather than from its own
>   environment, is research's to find, with fork changes allowed (`[R15]`).~~
>   Superseded 2026-09-25 `[AD 1, AD 7]`: wechart pushes each data source to
>   xcube with its credential as ciphertext. xcube owns the connection runtime,
>   and Cube never calls wechart.
>   AC-161 is reworded so it doesn't assume a restart.
> - A connection test runs in Cube, with Cube's own drivers, at wechart's
>   request (`[R20]`, `research/connection-testing.md`). AC-159 is reworded
>   to say so.
> - **2026-09-26** `[plan]`: xcube runs the test through its admin route
>   `POST /v1/semantic/connections/test`, and swaps a changed connection's
>   driver with no restart. ~~A change of database type lands as a publish
>   (AC-161).~~ A data source's database type never changes: Cube fixes
>   the SQL dialect at compile, so wechart refuses the change and a new
>   data source is made instead (AC-161, `[X6, R31]`). This is slice 6 of
>   the plan.
> - **2026-09-26** `[X6, XD, XOV, R31]`: slice 6 as built. Eight drivers
>   (AC-160). Health is per Cube instance, within the last hour (AC-161).
>   The root's `default` is seeded by a post-install Job (AC-310). A
>   workspace's data sources are previewed through its overlay (AC-280).

- [x] AC-157 THE SYSTEM SHALL list, in the Data sources workspace, every data source the user may see, each with its folder, its driver type, its health from the last test, and the cubes whose models use it (phase 2: `[R16, R19]`).
      Fails when: a data source the user may see is missing, one they may not see is listed, or a cube list disagrees with the models.
- [x] AC-158 WHEN the user adds a data source in their workspace, THE SYSTEM SHALL take its name, the driver type, the connection fields for that driver and a Test step, and SHALL refuse to create it until ~~the test passes or the user explicitly overrides~~ a test of exactly its settings passes. A change to a data source's connection SHALL likewise be saved only once a test of it passes. There is no override (direction.md rules 23, 35; phase 2: `[P2 input]`; amended 2026-09-27, the user's answer: "test first, and dont save if test fails.. both in create new as well as edit").
      Fails when: a source is created new, or a change to its connection is saved, without a passing test of exactly those settings, whatever the request says. (A copy into a workspace, AC-280, holds its original's stored settings unchanged and is made without one; a change to it needs one. Decided 2026-09-27 under the standing instruction, T346; overturnable.) A version restored as a draft in the workspace (AC-289, T515) is saved as that version had it, untested, and SHALL be proposed only once a test of exactly its settings passes; it fails when such a draft can be proposed without one (amended 2026-09-30, the user's answer, `[R49]`).
- [x] AC-159 WHEN the user runs a connection test, THE SYSTEM SHALL have Cube run it, with Cube's own driver for that type, at the wechart service's request; show each check's result (opening the secrets, building the connection's configuration, connecting, and reading the catalog where the driver can); and show the driver's error text when a check fails, with the connection's secrets left out of it (phase 2: `[R20]`; the checks, amended 2026-09-26, `[X6]`).
      Fails when: the test runs in the browser or through a driver other than Cube's; a check's result is missing; a failure shows no error text; or an error text shows a secret.
- [x] AC-160 THE SYSTEM SHALL offer ~~PostgreSQL, Snowflake, Databricks, BigQuery, SQL Server and Oracle~~ PostgreSQL, Amazon Redshift, MySQL, Snowflake, BigQuery, SQL Server, Oracle and Dremio as driver types, with each driver's own authentication fields: Redshift a user and password; MySQL a password or a client certificate; BigQuery a service-account key; Dremio a Cloud URL with a token, or a Software host and port with a token or a user and password (`[R4]`; amended 2026-09-26, `[XD, X6]`: Redshift, MySQL and Dremio added, Databricks dropped).
      Fails when: a listed driver is absent, Databricks is offered, or a driver's form omits an authentication method listed here or offers one xcube doesn't take.
- [ ] AC-161 WHEN an approved change to a data source's settings lands in its folder, THE SYSTEM SHALL ~~say whether Cube needs a restart before it takes effect, and~~ put it into effect without restarting Cube, and show whether every running Cube instance uses the new settings: live only when every instance reporting within the last hour reports the new version, live. Reports older than an hour, from instances that are gone, SHALL not be shown. ~~A change of database type SHALL land as a publish, through the publish check (AC-321)~~ A data source's database type SHALL never change: the change is refused where it is made, in the workspace, saying to make a data source of the new type under another name (phase 2: `[R15, AD 11]`; amended 2026-09-26, `[plan]`; amended again 2026-09-26, `[X6, R31]`: per-instance health, the hour, and no change of type).
      Fails when: the UI claims the change is live while any instance reporting within the hour still uses the previous settings or reports failed; an instance's report older than an hour is shown; the change needs a Cube restart; or a data source's type can be changed, saved or proposed.
- [x] AC-353 WHILE the user edits a BigQuery, Snowflake or Dremio data source whose key or token is stored, THE SYSTEM SHALL keep the stored key or token unless the user chooses to replace it, and SHALL say, before a replaced one is saved, that replacing it rebuilds the data source's pre-aggregations, even when the new one is the same (added 2026-09-28, `[R42]`).
      Fails when: the form asks for the stored key or token again when nothing that is its target changed; or a replaced key or token is saved without that warning shown.
- [x] AC-163 THE SYSTEM SHALL record the result of each connection test over time and show that history per source.
      Fails when: a test result is missing from the history.
- [x] AC-164 THE SYSTEM SHALL never show a stored credential in plain text after it is saved, and SHALL never send it to the browser.
      Fails when: a saved secret is readable in the UI or in a response to the browser.
- [x] AC-338 THE SYSTEM SHALL mark each driver type in the new data source wizard with its vendor's logo, where the vendor's licence terms allow wechart to show it, and otherwise with a monogram of its name (`[R33]`, proposal 1 of the 2026-09-27 designs, approved 2026-09-27).
      Fails when: a driver's type tile shows neither a logo nor a monogram, or shows a logo whose licence terms, as recorded in `docs/research/`, don't allow it.
- [x] AC-339 WHEN a Dremio Cloud project URL starting with `http://` is entered, THE SYSTEM SHALL warn beside it that the token would be sent unencrypted (`[R33]`, proposal 2).
      Fails when: an `http://` Cloud URL shows no warning, or an `https://` one shows one.
- [x] AC-340 WHEN a BigQuery service-account key is pasted, THE SYSTEM SHALL read its `client_email` in the browser, before the key is sealed, and show it beside the field, sending it nowhere unsealed (`[R33]`, proposal 3; AC-325 still holds).
      Fails when: a valid key's `client_email` isn't shown, or a request body to wechart holds the pasted key or its `client_email` outside the sealed envelope.

- [x] AC-162 WHEN the user assigns a cube to a data source, THE SYSTEM SHALL write `data_source` into that cube's model file.
      Fails when: the assignment is stored only in wechart and not in the model.

## F19. Security: policies and context preview

Purpose: see what Cube's access policies do, and preview a dashboard as a security context. Users and groups are phase 2.
Traces to: `[R4]`, `[docs/inputs §7]`, direction.md §7c, rule 21; `[research/cube/access-control.md]`.

- [x] AC-165 THE SYSTEM SHALL list every access policy in the model with its role, member-level rules, row-level filters, conditions and masking, as declared.
      Fails when: a declared policy or rule is missing from the listing.
- [x] AC-166 WHEN the user ~~edits a security context~~ chooses one or more groups and previews a dashboard, THE SYSTEM SHALL run that dashboard's queries as a token carrying exactly those groups, and show a persistent banner naming them (direction.md rule 21; phase 2: tokens carry groups only, `[AD 12, R27]`; amended 2026-09-25 and unticked until retested).
      Fails when: the queries use the default context or carry anything but the chosen groups, or no banner is shown.
- [x] AC-167 WHEN a preview context hides a member a chart uses, THE SYSTEM SHALL show that tile as unavailable to the context rather than as an error.
      Fails when: the tile shows a raw Cube error.
- [x] AC-168 THE SYSTEM SHALL show the generated SQL and the effective filters for a chart under the previewed context.
      Fails when: the SQL shown omits the row-level filters the policy adds.
- [x] AC-169 IF Cube would accept unauthenticated requests, because authentication checks are not enforced, THEN THE SYSTEM SHALL show a persistent warning in the Security workspace.
      Fails when: no warning is shown while Cube accepts an unauthenticated request.
- [x] AC-170 THE SYSTEM SHALL show which API scopes the configured context has, and mark a screen as unavailable when its scope is missing.
      Fails when: a screen fails with an error instead of reporting the missing scope.

## F20. Export

Purpose: get data out, without a server renderer.
Traces to: `[R6]`, direction.md §7c.

- [x] AC-171 WHEN the user exports a chart or a marked-rows view, THE SYSTEM SHALL produce a CSV whose rows and columns match what the tile shows, including the applied filters and marking limits.
      Fails when: the CSV contains rows the tile excluded, or omits a displayed column.
- [x] AC-172 WHEN an export exceeds the row limit Cube returns, THE SYSTEM SHALL say how many rows were exported and that the result was truncated.
      Fails when: a truncated export claims to be complete.
- [x] AC-173 THE SYSTEM SHALL format exported values with their member formats, and SHALL write raw numeric values for measures so the file can be re-analysed.
      Fails when: a measure is exported only as a formatted string.

## F21. Performance, accessibility and design conformance

Purpose: the cross-cutting bars every surface must meet.
Traces to: `[R3]`, `[R7]`, direction.md rules 1–5, 39, 52.

- [x] AC-174 WHEN a dashboard of 10 charts on live warehouse data is opened, THE SYSTEM SHALL render every tile within 3 seconds at the 95th percentile, measured from wechart's own query timings.
      Fails when: the p95 across a repeated run exceeds 3 seconds.
- [x] AC-175 WHEN a marking changes on a dashboard of 10 charts, THE SYSTEM SHALL update every affected tile within 3 seconds at the 95th percentile.
      Fails when: the p95 update time exceeds 3 seconds.
- [ ] AC-176 THE SYSTEM SHALL make every action reachable from the keyboard: navigation, authoring, marking, filtering and every dialog, with a visible focus indicator distinct from the marking outline (direction.md rules 39, 52; phase 2, `[R16]`).
      Fails when: an action can be performed only with a pointer, or focus is invisible on any control.
- [x] AC-177 THE SYSTEM SHALL pair every status, validation and job state with an icon and a text label (direction.md rule 3).
      Fails when: any state is conveyed by colour alone.
- [x] AC-178 THE SYSTEM SHALL provide a table view of every chart's data, reachable from the tile (direction.md rule 5).
      Fails when: a chart type offers no table view.
- [x] AC-179 THE SYSTEM SHALL render dashboards, the chart editor and the model editor without horizontal scrolling at a viewport width of 1,280 pixels.
      Fails when: any of those surfaces scrolls horizontally at that width.
- [ ] AC-180 THE SYSTEM SHALL work in current Chrome, Edge, Firefox and Safari on desktop (`[R7]`; phase 2, `[R16]`).
      Fails when: any acceptance test in this spec fails in one of those browsers.
      > Edge needs the `msedge` channel, whose install asks for the machine's
      > password, or a CI run, which needs a push (the 2026-09-22 status). The
      > Playwright and CI configuration for all four is in place (T001). This
      > criterion is ticked by a four-browser run, not by the local three.
- [x] AC-188 THE SYSTEM SHALL write a time dimension's values by their granularity — a year as "2026", a quarter as "Q1 2026", a month as "Jan 2026", a week as "Week of Jan 5, 2026", a day as "Jan 2, 2026", and an hour or finer with the time — in axes, labels, tooltips and tables, unless the member's model format says otherwise.
      Fails when: a time value shows as a raw timestamp such as "2026-01-02T00:00:00.000".
- [ ] AC-187 THE SYSTEM SHALL draw the app bar, workspace navigation, buttons and inputs, the dashboard header and page tabs, the filter bar, tiles, and the edit sidebar with the component styles of the design prototype the user approved (`docs/design/prototype/index.html`, published as "wechart Workbench"; the user, 2026-09-21: "align with the ui styles in" it), in the tokens of direction.md §3–5 (phase 2, `[R16]`; the open differences are in `docs/phase-2/backlog.md` §1 and the 2026-09-25 critiques).
      Fails when: one of those components' computed height, padding, border width or radius, font size or weight, or colour token differs from the prototype's rule for the same component.

## F22. Following the design prototype's structure

Purpose: the prototype's structure, layout and interaction, which the user accepted, on every surface — not only its component styles, which AC-187 covers.
Traces to: `[R7]`, `[R9]`; the critiques in `docs/design/critiques/2026-09-24-*.md`, which measured each gap against `docs/design/prototype/`.

Application shell and search:

- [x] AC-190 THE SYSTEM SHALL show at the right of the top bar a search field that names the platform's shortcut (⌘K or Ctrl+K) and opens the search palette when clicked, and an identity avatar at the far right.
      Fails when: the top bar offers no visible way to open search, or the avatar is missing.
- [x] AC-191 WHEN the user types in the search palette, THE SYSTEM SHALL list the matching dashboards, library charts, Cube fields and model files, each with its type, move the active result with the arrow keys, open it with Enter, and return focus to where it was when the palette closes (`[R9]`).
      Fails when: a matching field or model file is missing, a result has no type, the arrow keys do not move the active result, or focus is not returned on close.

Explore:

- [x] AC-192 WHEN the user opens a folder in Explore, THE SYSTEM SHALL show a breadcrumb of its ancestors, the folder's name as the page heading (with Rename beside it for those who may rename it), the Explore search box, and a single "New" menu. In a shared folder the menu offers Folder to the folder's read-write members; in the user's workspace it offers Dashboard, Chart, Model, Data source and Folder, and, under a divider, Import a dashboard… (AC-356) (phase 2: `[P2 input, R17]`; amended 2026-09-28, `[R46]`).
      Fails when: the folder's name is not the page heading, a breadcrumb ancestor does not open that folder, creating is offered other than through the New menu, or a shared folder's New menu offers anything but Folder.
- [x] AC-193 THE SYSTEM SHALL list a folder's contents under the columns Name, Type, Built on, Updated and Owner — subfolders first, then dashboards, then charts — showing a dashboard's description beneath its name and its number of page tabs, a chart's chart type and the cube or view it is built on, and a subfolder's item count, and SHALL offer rename and move through a menu on each row.
      Fails when: a column is missing, a chart's type reads only "Chart", a row shows a rename or move control before its menu is opened, or a move offers the item's own folder or, for a folder, itself or a folder inside it.
- [x] AC-194 THE SYSTEM SHALL show the folder tree as a full-height pane headed "Folders", with a "+ Folder" action for those who may create one. It holds the shared root, showing only the folders the user may see, and "My workspace" for users who have a workspace. Each folder shows how many items it and its subfolders hold, counting only items the user may see (`[R9]`; phase 2: `[P2 input, R12]`).
      Fails when: a folder the user may not see appears; "My workspace" is missing for a user who has a workspace, or shown to one who doesn't; a count includes items the user may not see, or leaves out items in subfolders; or the tree scrolls away with the contents.
- [x] AC-195 WHEN the user opens a dashboard or a library chart from Explore, THE SYSTEM SHALL show a breadcrumb back to its folder, and returning by it, or reloading Explore, SHALL show that folder.
      Fails when: the breadcrumb is missing, or returning or reloading lands on a folder other than the item's.

Dashboards:

- [x] AC-196 WHILE a dashboard is open, THE SYSTEM SHALL keep its header, page tabs and filter bar fixed above the scrolling tiles, and show the filter bar at all times, with a one-line hint on how to mark or filter while nothing is set.
      Fails when: the page tabs or the filter bar scroll out of view with the tiles, or the filter bar appears only once something is set.
- [x] AC-197 WHEN the user opens a dashboard's settings, THE SYSTEM SHALL let the user change its name, its folder and its description under General, and Explore SHALL show that description beneath the dashboard's name.
      Fails when: the folder or the description cannot be changed there, or a saved description does not appear in Explore.
- [x] AC-198 WHEN the user opens Settings › Markings, THE SYSTEM SHALL list the dashboard's markings with their colour, name, whether each is the default and how many tiles mark with or are limited by it, let the user add a marking (up to four), rename, recolour, delete and make one the default, and show a table of every chart tile with the marking it marks with and the markings that limit it.
      Fails when: any of those changes cannot be made on that page, or the tiles table is missing.
- [x] AC-199 WHEN the user opens a chart tile's menu in view mode, THE SYSTEM SHALL offer View as table, View query, Export and Edit chart, and, while the dashboard is in Markings mode, the marked-rows actions headed by the tile's marking and its count.
      > Reworded 2026-09-25 with F23: "Download CSV" is now Export's first item (AC-244).
      Fails when: one of those items is missing, or the marked-rows actions appear outside Markings mode.
- [x] AC-200 THE SYSTEM SHALL show each non-empty marking in the filter bar as a chip bordered in the marking's colour, naming the marking, summarising its values by the members' titles, naming the tile it came from, and offering a menu and a control that unmarks it.
      Fails when: a chip shows a member's internal name, omits the source tile, or cannot unmark from the chip.
- [x] AC-201 THE SYSTEM SHALL show the marked-items badge whole, ~~in a chart tile's header row, beside its title,~~ in a chart tile's header row beside its title where the head has room, and otherwise under the chart, and only on chart tiles whose marking holds something (phase 2, `[R16]`: the 2026-09-25 re-critique measured a marked KPI tile whose title is squeezed to nothing; amended 2026-09-27, the user's answer (a) to handoff question 29: a narrow tile's head is its title's).
      Fails when: the badge pushes the title down, squeezes it out of view or is cut short itself, or appears on a tile that does not mark or whose marking is empty.
- [x] AC-202 THE SYSTEM SHALL draw a section as a band with a header holding a collapse control, its title and its number of items, and SHALL collapse and expand it in view and edit mode.
      Fails when: a section has no collapse control, or cannot be collapsed in view mode.
- [x] AC-203 WHEN the user selects a tile in edit mode, THE SYSTEM SHALL open Properties, showing for a chart tile its title, chart type and source, an Edit chart action, its ownership, its Marking settings and its layout.
      Fails when: selecting a tile leaves another sidebar tab open, or one of those parts is missing for a chart tile.
- [x] AC-204 WHEN the user chooses Discard in edit mode, THE SYSTEM SHALL restore the dashboard as it was when editing began and return to view mode, whether or not anything was changed.
      Fails when: Discard leaves the dashboard in edit mode, or is unavailable with no changes.
- [x] AC-205 WHEN the user opens a tile's menu in edit mode, THE SYSTEM SHALL list Duplicate first and Delete last, with Save to folders… or Make a local copy, and Move to with its targets between them, every item reachable without scrolling the menu except the Move to targets.
      Fails when: Duplicate or Delete must be scrolled to, or an item is missing.
- [x] AC-206 WHILE a dashboard is in edit mode, THE SYSTEM SHALL mark every tile as editable at rest — its drag grip visible and its outline dashed — title the page "Editing ‹name›", and offer "+ Page tab" in the tab row.
      Fails when: a tile's grip is visible only on hover, or either the title or "+ Page tab" is missing.
- [x] AC-207 WHEN a dashboard or one of its page tabs has no tiles, THE SYSTEM SHALL show a sentence saying so with a way to start editing, and SHALL show the page-tab strip.
      Fails when: an empty dashboard or tab renders a blank canvas, or the tab strip is hidden.
- [x] AC-208 THE SYSTEM SHALL render a markdown tile's headings, emphasis, lists and line breaks, and no raw HTML (`[R7]`).
      Fails when: a heading marker such as "##" or an emphasis marker is shown as text, or an HTML tag in the text renders as HTML.
- [x] AC-209 THE SYSTEM SHALL name every tile, in its accessible name and its menu's, by its title — or, for a tile without one, by its kind and position — and never by an internal id.
      Fails when: a tile or its menu is announced by an id such as "tile-status" or "el-1790238490469-7".
- [x] AC-210 WHEN a chart's query returns rows, THE SYSTEM SHALL draw every row visibly, whatever the width of the tile.
      Fails when: a chart with returned rows draws empty axes, as a 243-bar chart did at a tile width where each bar measured 0 px.
- [x] AC-211 THE SYSTEM SHALL draw charts in the dark theme with the dark categorical palette and the dark theme's text and gridline tokens, and redraw them when the theme changes (direction.md rules 2, 24).
      Fails when: a chart in the dark theme uses a light-theme series colour, text colour or gridline colour.

Library charts and the chart editor:

- [x] AC-212 WHEN the user opens a library chart from Explore, THE SYSTEM SHALL show its title as the page heading, its chart type, the chart drawn, the cube or view it is built on, its measures and dimensions, the dashboards it is used on, and an Edit chart action that opens the chart editor on it.
      Fails when: the chart is not drawn, its title is not the heading, or there is no way to open it in the chart editor.
- [x] AC-213 WHEN the user chooses New › Chart in Explore, THE SYSTEM SHALL open the chart editor on a new library chart titled "Untitled chart" in the open folder, and saving it SHALL open that chart's page.
      Fails when: New › Chart ends anywhere but the chart editor, or the saved chart is not in the folder that was open.
- [x] AC-214 WHILE the chart editor is open, THE SYSTEM SHALL show the field list on the left, the preview in the centre above a drawer of results, underlying rows and the Cube query, and an inspector on the right with Data and Customize tabs, the preview's top edge visible without scrolling at 1,440 × 900, and a single header row holding the chart's editable title, its source and row count, whether it is local or shared, Undo, Redo, Discard and the save action.
      Fails when: the preview's top edge is below the fold at 1,440 × 900, the title cannot be edited in the editor, or result rows are printed anywhere outside the drawer.
- [x] AC-215 THE SYSTEM SHALL group the chart editor's fields by the cube they belong to, with a search box, and show on each field its role, its aggregation, type or number of distinct values, and whether the chart uses it; clicking a field, or pressing Enter or Space on it, SHALL add it to the well its role belongs in.
      Fails when: clicking or pressing Enter on a field adds nothing, or the search does not narrow the list.
- [x] AC-216 THE SYSTEM SHALL show each field in a well by its title with a tag for its aggregation or its time granularity, let the user change a time field's granularity from its pill, and offer a Filters well and a Top N setting beside the Metrics, Dimensions and Time wells.
      Fails when: a pill shows a member's internal name, a time field's granularity cannot be changed from its pill, or the Filters well is missing.
- [x] AC-217 THE SYSTEM SHALL show the chart's type by its name — "Auto" with the recommended type, or "Chosen manually" — with a Change action opening a gallery of every type that can be searched, groups types by purpose, states what each needs and greys those the chart's fields cannot draw, and SHALL show "Back to recommended" only while a type is chosen manually (direction.md rules 9, 10).
      Fails when: a type is shown by an internal id such as "groupedBar", a type the fields cannot draw is not greyed with its requirement, or "Back to recommended" shows while the type is the recommended one.
- [x] AC-218 WHILE a manually chosen type is a combo, or exceeds a channel's capacity for the chart's fields, THE SYSTEM SHALL show a warning with an icon saying why, and offer to switch to the recommended type (direction.md rules 6, 30).
      Fails when: a combo, or a pie drawn with more than 6 slices, shows no warning.
- [x] AC-219 THE SYSTEM SHALL offer in the chart editor's Customize tab the axis settings — title, label rotation, include zero, logarithmic scale, gridlines, minimum and maximum — the legend's visibility and position, each series' colour and visibility and whether series stack, data labels, and the number format.
      Fails when: the legend's position, data labels or "include zero" cannot be set.
- [x] AC-220 THE SYSTEM SHALL name every member by its title from the model wherever a person reads it, and never by its internal name. That covers legends, tooltips, table headers, well pills, marking chips, the "Why this chart?" trace and the Acceleration tab. Where the member's cube or view is evident (a pill, a legend or a KPI label of a one-source chart), it SHALL use the member's short title, and its full title elsewhere (phase 2, `[R16]`: the UI review's gap 13, and the re-critique's Acceleration finding).
      Fails when: any of those shows a name such as "orders.count", or a one-source chart's legend or KPI label repeats the source's title.
- [x] AC-221 WHEN a pie or donut is drawn, THE SYSTEM SHALL list every slice in its legend.
      Fails when: a slice has no legend entry.

Model workspace:

- [x] AC-222 WHILE a model is open, THE SYSTEM SHALL show its folder's model files beside the editor, open the chosen file in place with its folder and name in the URL, offer New cube and New view in the user's workspace, and mark each file that has problems (phase 2: `[P2 input]`).
      Fails when: moving to another of the folder's files requires leaving the editor; New cube or New view is missing in the workspace, or offered in a shared folder; or a file with an error carries no mark.
- [x] AC-223 THE SYSTEM SHALL lay the model editor out as full-height panes, each with its own header row and scrolling — the form, and the code with its Problems panel docked beneath it counting errors and warnings — with code and file paths in direction.md's code face.
      Fails when: the page itself scrolls at 1,440 × 900, Problems gives no count of warnings, or code is set in a face other than IBM Plex Mono.
- [x] AC-224 THE SYSTEM SHALL edit every field that refers to model members — pre-aggregation measures, dimensions, segments, rollups and time dimension, drill members, hierarchy levels, a view's includes and excludes — with a picker of the members it may refer to, and a join's target with a list of cubes (direction.md §7b).
      Fails when: any of those fields accepts free text.
- [x] AC-225 THE SYSTEM SHALL show each member in a row with its name, its type, a preview of its SQL and badges for primary key, public and format, and when expanded, only the fields that apply to its type and to how it is defined, in named groups.
      Fails when: a collapsed row omits its type or SQL, a primary key carries no badge, or an expanded number dimension offers fields for a CASE, a switch or a geographic point.
- [x] AC-226 WHEN a model file has changes not yet published, THE SYSTEM SHALL say so in the editor's header and on the file's row in the tree, offer Discard, and ask before leaving the file with them unpublished.
      Fails when: an edit shows no unpublished marker, or leaving the file loses it without asking.
- [x] AC-227 WHEN the model's code parses, THE SYSTEM SHALL list in Problems, with the line, every value outside the set Cube's validator allows and every required key that is missing, before the user publishes (direction.md rule 26).
      Fails when: a measure of type "summ" leaves Problems empty.
- [ ] AC-344 THE SYSTEM SHALL draw the Model workspace as its designs draw it — a model file's editor, its tree, and New cube and New view as phase-1 design 03 (`docs/design/reviews/2026-09-24/designs/03-model-workspace.html`); Generate cubes as design 11 and the Model overview as design 12 (`docs/design/reviews/2026-09-27/designs/11-generate-cubes.html`, `12-model-overview.html`) — with their structure, placement, controls, wording and states, in the tokens of direction.md §3–5 (`[R34]`: the user, 2026-09-27, "Cleanup the models page.. add models page and generate cube page").
      Fails when: a Model surface differs from its design in its layout or placement, its controls or their order, its wording, or a state the design draws. Each surface's task names the design, and the findings of `docs/design/critiques/2026-09-27-model-workspace.md`, it checks against.
- [x] AC-345 WHEN the user adds the cubes Generate cubes has generated, THE SYSTEM SHALL add each as an unpublished file in the model's tree and publish none of them until it is saved (`[R36]`, proposal 1 of design 11).
      Fails when: Cube's model changes as the cubes are added, or a generated file is missing from the tree or its row is not marked unpublished.
- [x] AC-346 WHEN the user saves an unpublished file whose cubes join a cube that only another unpublished file defines, THE SYSTEM SHALL publish those files with it in one publish, and name them beside Save before it is pressed (`[R36]`).
      Fails when: the file is sent alone and Cube refuses the join ("Cube … doesn't exist"), or a file published with it was not named beside Save.
- [x] AC-347 WHEN Generate cubes lists a table that a cube in the model already reads from as its `sql_table`, THE SYSTEM SHALL mark the table's row "In model", naming that cube, before anything is generated (`[R36]`, proposal 2 of design 11).
      Fails when: the seed's `public.orders`, which the `orders` cube reads, is listed without "In model" or without naming `orders`, or a table no cube reads is marked.
- [x] AC-348 WHEN Generate cubes lists the data sources to generate from, THE SYSTEM SHALL show beside each its health as Data sources shows it — its icon, its label and how long ago it was tested — or that it has not been tested (`[R36]`, proposal 3 of design 11).
      Fails when: a data source whose last test failed is listed without that state, or a listed health differs from the same data source's in Data sources.
- [x] AC-349 THE SYSTEM SHALL offer, in the header of Generate cubes' table list, a checkbox that chooses or clears every table on the page shown, checked when all of them are chosen and mixed when only some are (`[R36]`, proposal 4 of design 11).
      Fails when: pressing it leaves a table on the page unchosen or chooses one on another page, or it shows checked while a table on the page is not chosen.
- [x] AC-350 WHILE security is enabled, THE SYSTEM SHALL head Generate cubes with "in My workspace" and the person icon, as the new data source pane's head does, and add the cubes to the user's workspace model (`[R36]`, proposal 5 of design 11; direction.md rule 74). The pane SHALL ask which shared folder the cubes are to go to, as a new workspace model file must name one, and keep it with each draft. Generate cubes SHALL also be offered on a data source's page and in its row's ⋯ in Explore, to those who may make a model, opening on that data source with its folder chosen (amended 2026-10-02, the user, `[R57]`).
      Fails when: with security on, the pane's head does not say "in My workspace"; a generated cube is added to a shared folder's model; a generated draft is added without the folder it is to go to, or saved without it; or a data source's page or its row's ⋯ offers no Generate cubes to one who may make a model, or opens it on another data source.
- [x] AC-351 WHEN the user creates a view with New view, THE SYSTEM SHALL write it with no `cubes`, open it on its Cubes tab ready to add a cube with the join-path picker focused, and say in the empty tab "A view shows nothing until it includes a cube." (`[R36]`, MW-19 of design 12).
      Fails when: the new view's YAML names a cube or members the user didn't choose, it opens on another tab, or focus is not on the join-path picker.
- [x] AC-420 WHEN the user pops out a model file's YAML or join diagram, THE SYSTEM SHALL show that pane — its YAML / Join diagram switch, Wrap, the editor or diagram, and its problems — in a modal dialog wider and taller than the pane, holding what it held unchanged (the text and any unsaved edit, the cursor and undo history, the diagram). WHEN that dialog is closed, by its close button, the pane's pop-in control or Esc, THE SYSTEM SHALL put the pane back in its place, unchanged, with focus on the control that popped it out (2026-10-02, the user: "can you add functionality to see join diagram and yaml in a bigger model screen... you should be able to popout into modal and closing should pop back into place..", `[R58]`).
      Fails when: the pane has no pop-out control, or the dialog is not larger than the pane; text typed before or while popped out is lost or reset, or the undo history is; closing leaves the pane out of its place, or focus elsewhere than the pop-out control; or Esc doesn't close it.

Jobs, Security, Schedules and Data sources:

- [x] AC-228 THE SYSTEM SHALL lay out Jobs and Security as a list beside a full-height inspector pane, and WHEN the user selects a pre-aggregation in Jobs, THE SYSTEM SHALL show in that pane its state, its trigger, a Build action and a way to open it in Model.
      Fails when: selecting a pre-aggregation shows nothing, or the pane is not full height.
      > *Scope note (2026-09-27, T500):* with sign-in on, Security follows 2026-09-27 design 08 (AC-343): tabs at their own addresses, the preview a tab of its own. Its list-beside-a-pane layout holds with sign-in off, as phase 1 built it.
- [x] AC-229 THE SYSTEM SHALL list each pre-aggregation in Jobs with its state as an icon and a label, the refresh key that triggers it, and its name ~~linking to its definition in Model~~, a way from its row to its definition in Model (its details pane's "Open in Model", the row itself only selecting it), and SHALL show a started build's progress in that row (direction.md rule 22; amended 2026-09-28, `[R47]`).
      Fails when: a row has no state or no trigger, ~~the name does not open Model~~ there is no way from a row to its definition in Model, or a build's progress appears only outside its row.
- [x] AC-230 THE SYSTEM SHALL let the user narrow the query log by outcome, source and time range and sort it, keep its column headers in view while it scrolls, and render no more than a page of rows at a time.
      Fails when: the headers scroll out of view, a filter does not narrow the rows, or more than one page of rows is rendered at once.
- [x] AC-231 THE SYSTEM SHALL draw the workspaces' page titles in direction.md's page-title style, and their tables as cards with a header band, rows of 34 pixels, 12-pixel cells and tabular numerals (direction.md rule 1). *(Amended 2026-09-27, `[R34]`: a model file is headed by its path in the editor's head, at design 03's 13/600, not by a page title. The Model overview keeps its 20/600 title. See direction.md's list of differences.)*
      Fails when: a workspace page title is not 20 px at weight 600, or a workspace table's numbers are not tabular.
- [x] AC-232 WHEN the user opens Security, THE SYSTEM SHALL offer a preset context for each group the policies name, list every cube and view with the access the current context gives it and why, start a dashboard preview from a bounded list of dashboards that says when nothing matches, link each policy to its file in Model, and keep the edited context for the session.
      Fails when: effective access is missing, a search with no match shows nothing, a policy's source does not open Model, or the context is reset after a preview.
- [x] AC-233 WHEN the user opens Schedules or Data sources, THE SYSTEM SHALL show the page's title and a note saying what the page is for, and SHALL treat "/sources" as Data sources (phase 2: data sources are managed in folders, `[R16, R19]`).
      Fails when: either page renders nothing, "/sources" shows Not found, or Data sources says managing connections is not part of this phase.

## F23. The chart tile's menu (DSH-08)

Purpose: act on a chart tile and its marked items from one menu, opened by its ⋯ button, a right-click on the chart, or the keyboard.
Traces to: the user, 2026-09-25; `[docs/design/reviews/2026-09-24/chart-context-menu.md]` (DSH-08, proposals P1–P8); direction.md rule 31, §7a.

> **Status, 2026-09-25: added at the user's direction.** From the chart context menu
> analysis, the user chose "Drill by, Underlying rows + panel, Data-as-of +
> right-click, Copy & export submenus". Every item is answered by Cube Core's REST
> API or by the browser (the analysis §1). Decided with it, as small choices the
> user may overturn:
> - Drill by redraws the tile in place.
> - A drilled view does not mark, and is not kept on reload, since it hangs on
>   marks, which a dashboard opens without (AC-124).
> - Drill by is offered while the tile's marking holds items.
> - Excel export waits for a research doc and the user's approval of its package.
> - PDF stays out, as a server renderer's.

- [x] AC-236 WHEN the user chooses Drill by and a dimension on a chart tile whose marking holds items, THE SYSTEM SHALL redraw that tile in place grouped by the chosen dimension and filtered to the marked items, with a breadcrumb naming the drilled items and a Back control, and SHALL leave the saved chart and every other tile unchanged.
      Fails when: the drilled tile's rows differ from a Cube query of the chosen dimension filtered to the marked items, Back does not restore the previous view, or the saved chart changes.
- [x] AC-237 WHEN the user opens Drill by on a tile, THE SYSTEM SHALL offer the next level of the member's hierarchy first, then finer time granularities, then the dimensions of the tile's cube and of the cubes Cube reports joined to it, and SHALL offer neither a primary key nor the marked member itself.
      Fails when: a primary key or the marked member is offered, or a dimension of a cube Cube reports in another join component is offered.
- [x] AC-238 WHILE a tile shows a drilled view, THE SYSTEM SHALL show the drilled answer's own freshness: the pre-aggregation that served it, or that the database did.
      Fails when: a drilled view the database answered shows the parent view's pre-aggregation.
- [x] AC-239 WHEN the user chooses View underlying rows on a chart tile with nothing marked, THE SYSTEM SHALL show the rows behind the whole tile, as its query ungrouped with its filters, and state the total number of rows.
      Fails when: the rows differ from the tile's query ungrouped, or the total is absent.
- [x] AC-240 WHILE the details panel is on, WHEN the marking changes, THE SYSTEM SHALL show the rows behind the newly marked items and their total, and the panel SHALL be turned on and off both from the tile's menu and from the panel itself.
      Fails when: the panel shows rows of a previous marking after the change, or either control does not toggle it.
- [x] AC-241 WHEN the user chooses Copy › Marked values, THE SYSTEM SHALL put the marked items' member values on the clipboard as tab-separated text with a header row of the members' titles.
      Fails when: the clipboard text differs from the marked items, or has no header row.
- [x] AC-242 WHEN the user chooses Copy › Image on a tile ECharts draws, THE SYSTEM SHALL put a PNG of the chart as drawn, marking included, on the clipboard; on a KPI, table or pivot tile THE SYSTEM SHALL offer it disabled and say why.
      Fails when: the clipboard holds no image, the image omits the marking's drawing, or a KPI, table or pivot tile offers it enabled.
- [x] AC-243 WHEN the user chooses Copy › To dashboard and picks a dashboard, THE SYSTEM SHALL add a dashboard-local copy of the tile's chart to that dashboard, and SHALL leave the source dashboard unchanged.
      Fails when: the chosen dashboard lacks the copy, the copy is the source's chart rather than its own, or the source dashboard's saved definition changes.
- [x] AC-244 THE SYSTEM SHALL offer under a chart tile's Export the tile's CSV, the marked rows' CSV while the marking holds items, and SVG and PNG images of a chart ECharts draws, each downloading the chart as drawn.
      Fails when: one of those items is missing where it applies, or an image file is not the chart as drawn.
- [x] AC-245 WHEN the user opens the tile menu's Data as of submenu, THE SYSTEM SHALL show, for an answer a pre-aggregation served, its name, its last build, its refresh schedule in words and as written, and its next run with how late it may start, with Refresh now, Open in Jobs on that pre-aggregation and Edit schedule in Model; and, for an answer the database served, say so, with Refresh now and Why not accelerated.
      Fails when: one of those items is missing, Open in Jobs does not select that pre-aggregation, or a database answer is described as a pre-aggregation's.
- [x] AC-246 WHEN the user right-clicks a chart tile's plot, or presses Shift+F10 or the Menu key on a focused chart tile, THE SYSTEM SHALL open the tile's menu at the pointer or at the tile, and the browser's own menu SHALL not open there (phase 2, `[R16]`: the re-critique found Shift+F10 doing nothing on a chart tile with no fields yet).
      Fails when: the browser's context menu opens instead, the keys do nothing on any chart tile (one with no fields yet included), or a right-click changes a marking.
- [x] AC-247 WHILE the tile's marking holds items, THE SYSTEM SHALL head the tile's menu with the marking's name, the marked values by their members' titles, and the count marked out of the tile's items.
      Fails when: the heading omits the values, or either count differs from the marked items or the tile's items.

## F24. Deployment to Kubernetes

Purpose: run wechart, Cube and Cube Store on Kubernetes as production will, and on docker-desktop for end-to-end tests.
Traces to: `[R4]` ("self-hosted Kubernetes … running wechart, Cube and Cube Store as containers"); requirements.md, Deployment (docker-desktop, namespace `wechart`); the user, 2026-09-25 ("create the helm charts.. so that you are able to deploy wechart into docker-desktop k8s context. Use the same northwind database that superset uses").

> **Status, 2026-09-25: added at the user's direction**, before the Superset-parity
> test. Its data source is set in the chart's values, in Cube's environment, as data
> sources are configured today while F18 is deferred.
>
> **Phase 2 (amended 2026-09-25, `[AD 11, R27]`):**
> - The chart runs 2 or more Cube instances on the Cube Store queue and 2 or more API replicas (AC-319).
> - The chart's values seed the root's `default` data source on install; it is then managed like any other (AC-310).

- [x] AC-248 WHEN the wechart Helm chart is installed into a Kubernetes cluster, THE SYSTEM SHALL run the web app, the API, its metadata database, Cube's API, Cube's refresh worker and Cube Store there, with Cube's data source taken from the chart's values, and SHALL serve the web app at the address the values name.
      Fails when: after the install a component is not Ready, the web app's address does not load, or a query from the web app does not reach the data source the values name.

---

# Phase 2

Phase 2's criteria start at AC-251. Its requirements are in [docs/requirements.md](./requirements.md), Part 2, and cited there as §P2.n, rounds R11–R19, and `[P2 input]`. The architecture decisions of 2026-09-25 are cited as `[AD n]`, with round R27. They reworded AC-008, AC-161, AC-166, AC-250, AC-251, AC-263, AC-264, AC-272–AC-275, AC-288, AC-291, AC-298 and AC-310, retired AC-309 and AC-311, and added AC-319–AC-329 and F37. Phase 1's criteria above still hold, except for the ones rewritten and marked "phase 2". Authoring criteria such as F7's apply as they did, but now in the user's workspace, because shared content is no longer edited in place (AC-278).

## F25. Sign-in and the security mode

Purpose: nobody reaches wechart without signing in when security is on, and one user has everything when it's off.
Traces to: §P2.2, §P2.4, `[P2 input]`, `[R11, R12, R14, R15, R18, R19]`.

- [x] AC-251 WHERE security is enabled, WHEN a request without a signed-in session reaches a wechart page or API route, THE SYSTEM SHALL send a page request to the configured OIDC provider's sign-in, and answer an API request with 401, returning no wechart content either way. Exempt are the health routes, sign-in's own routes, and the route the install Job seeds the shared root's `default` data source through, which answers only the Job's own token, returns nothing, and works only while the root has no `default` (`[R25]`; the seeding route added 2026-09-27, the user's answer for T443, AC-310; ~~and the routes Cube reads the model through, which answer only to Cube's key~~: Cube no longer reads the model from wechart, `[AD 1]`; amended 2026-09-25 and unticked until retested).
      Fails when: any page renders wechart content, or any API route other than those exempt returns data, without a signed-in session; or wechart serves any route for Cube to read the model through.
- [x] AC-252 WHERE security is enabled, WHEN a user signs in, THE SYSTEM SHALL take their identity and AD groups from the provider's token, as the configuration names them (issuer, client, groups claim), and show the user's name and a Sign out control in the top bar.
      Fails when: the groups wechart grants access by differ from the token's, or the top bar shows no name or no Sign out.
- [x] AC-253 WHEN the user signs out, THE SYSTEM SHALL end the wechart session, so that the next request needs a new sign-in.
      Fails when: after signing out, a page or API route still answers as that user.
- [x] AC-316 WHERE security is enabled, THE SYSTEM SHALL end a sign-in 12 hours after it began, whatever the activity, so that the next request needs a new sign-in (`[R24]`).
      Fails when: a session signed in more than 12 hours ago still answers as its user, or one signed in less than 12 hours ago is refused.
- [x] AC-317 WHERE security is enabled, IF a request that changes something (POST, PUT, PATCH or DELETE) comes from another site, as its `Sec-Fetch-Site: cross-site` header or an `Origin` other than wechart's public address says, THEN THE SYSTEM SHALL refuse it with 403 and change nothing, whatever session cookie it carries (`[R25]`).
      Fails when: such a request from another site changes something or answers other than 403, or the same request from wechart's own pages is refused.
- [ ] AC-254 WHILE security is disabled, THE SYSTEM SHALL run in single-user mode: no sign-in, and one user holding every permission, as a Super-Admin does. Workspaces and proposals SHALL work as with security on, and that user approves their own proposals (`[P2 input, R19]`). As with security on, a shared item SHALL be changed only through a copy in the workspace and a proposal, never in place (2026-10-01, the user's answer "Workspace-only now", `[R52]`).
      Fails when: a sign-in is asked for, or any permission is refused, while security is disabled; or a shared item's content is changed in place.
- [x] AC-255 WHILE security is enabled, WHEN a user belongs to 20 AD groups, THE SYSTEM SHALL grant them access through every one of them (`[R12, R19]`).
      Fails when: a folder granted only to the last of a 20-group user's groups is refused to them.
- [ ] AC-256 THE SYSTEM SHALL take the Super-Admin group's name from the deployment's configuration, and treat that group's members as Super-Admins (`[R18]`).
      Fails when: a member of the configured group lacks a Super-Admin permission, or someone outside it has one.
- [x] AC-318 WHERE security is enabled, IF the deployment names no Super-Admin group, THEN THE SYSTEM SHALL refuse to start and say that the Super-Admin group is missing, and the Helm chart SHALL refuse to render such a release (`[R26]`).
      Fails when: the API starts with security on and no Super-Admin group, its refusal doesn't name the missing setting, or `helm template` renders a release with security on and no Super-Admin group.
- [x] AC-257 WHERE security is enabled, THE SYSTEM SHALL sign users in through the development OIDC provider in docker-compose and in the Helm release on docker-desktop, with the provider running beside wechart (`[R14, R15]`).
      Fails when: signing in fails in either environment, or either environment needs a provider outside it.
- [ ] AC-258 WHEN wechart is configured against Microsoft Entra ID, or against on-prem AD through an OIDC broker, THE SYSTEM SHALL sign users in and resolve their AD groups as it does with the development provider. Checked once, at the end of phase 2 (`[R14, R15]`).
      Fails when: signing in fails, or the groups wechart resolves differ from the directory's.

## F26. Folder permissions and roles

Purpose: AD groups decide who sees and changes each folder, through inheritance down the tree and visibility up it.
Traces to: §P2.2, §P2.4, `[P2 input]`, `[R11, R12, R17, R18, R19]`.

- [x] AC-259 WHEN a Super-Admin, or a read-write member of a folder, creates a subfolder or edits a folder's permissions, THE SYSTEM SHALL let them set any number of AD groups with read-only access and any number with read-write access, each setting optional, and never an individual user (`[R11, R12]`).
      Fails when: a permission can name an individual user, or someone who isn't a Super-Admin or read-write member there can change it.
- [x] AC-260 WHILE a folder leaves its read-only or its read-write setting unset, THE SYSTEM SHALL use the parent's effective setting for it, each setting inherited on its own, and show the inherited groups with the folder they come from (`[R11]`).
      Fails when: an unset setting grants groups other than the parent's, or the inherited groups are shown without their source folder.
- [x] AC-261 WHEN an AD group has access to a folder, set or inherited, THE SYSTEM SHALL give its members the same access to every descendant folder, whatever groups the descendant sets (`[P2 input, R12]`).
      Fails when: a member of a group granted on /A is refused in /A/B/C, or given less access there, where /A/B sets a different group.
- [x] AC-262 WHEN a group has read-write access to a folder, THE SYSTEM SHALL let its members see, view-only, every dashboard, chart, model and data source in each ancestor folder up to the root (`[R12, R19]`).
      Fails when: an item in an ancestor is hidden from them, or they can change it without a proposal.
- [ ] AC-263 WHILE a user has only read-only access, THE SYSTEM SHALL show them the dashboards, and the charts on those dashboards, in the folders they may see (the folder, its descendants and its ancestors), and no models, data sources or library charts. ~~A chart on a dashboard they may see opens for them even when it is kept in a folder they can't see, without naming or linking that folder.~~ A dashboard shows only library charts found on its own folder's path: putting one from elsewhere on it makes it a chart of the dashboard's own (amended 2026-09-30, the user's answer, "Copy on use", `[R49]`; AC-371). Their dashboards query the cubes their charts were bound to at publish, which ~~Cube's generated policies~~ xcube's folder check (AC-320) admits them to (`[P2 input, R19]`; amended 2026-09-25, `[AD 3, AD 4, R27]`; ~~their dashboards still resolve cubes through the folder's path~~; the folder check, amended 2026-09-26, `[IP 6, X4]`).
      Fails when: a read-only user sees or opens a model, a data source or a library chart that is on none of their dashboards; a dashboard they may see fails because a model is hidden from them; or a chart opened through their dashboard names or links a folder they can't see.
- [ ] AC-264 IF a user belongs to no group with access to a folder (set, inherited, or reaching up from a grant on a descendant), THEN THE SYSTEM SHALL neither list nor open that folder, nor anything in it, except a chart on a dashboard they may see (AC-263).
      Fails when: the folder's name, or any of its items other than such a chart, appears to that user anywhere: the tree, a listing, search, a link or the API.
- [ ] AC-265 THE SYSTEM SHALL give Super-Admins read-write access to every folder, and every admin surface (Jobs, Schedules, Security, folder permissions and the audit trail) (`[P2 input, R12]`).
      Fails when: a Super-Admin is refused any folder or admin surface.
- [ ] AC-266 WHILE a user has only read-only access to a folder, THE SYSTEM SHALL let them read its dashboards (filter, mark, drill, export, bookmark) and change nothing in it.
      Fails when: a read-only user can create, change, move, delete or propose anything in the folder, or set its permissions.
- [ ] AC-267 WHEN security is first enabled on a deployment holding phase-1 content, THE SYSTEM SHALL keep that content as the shared tree with no groups set, visible only to Super-Admins until groups are assigned (`[R17]`).
      Fails when: anyone but a Super-Admin sees phase-1 content before a group is assigned to it.
- [x] AC-268 THE SYSTEM SHALL enforce folder access on every API route, not only in the UI. An automated suite SHALL ask every route as users in and out of each group, and nothing outside their permitted folders SHALL come back (S1, `[R13]`).
      Fails when: any route returns, lists, counts or finds by search an item the asking user may not see, or accepts a change they may not make.
- [ ] AC-320 WHERE security is enabled, THE SYSTEM SHALL have Cube itself refuse a query for a folder's cubes unless the token carries one of that folder's allowed groups: groups granted on it, on an ancestor or on a descendant, or the Super-Admin group. A folder no group reaches admits only Super-Admins. Row-level policies written in the model still apply within. xcube SHALL make this folder check for each request, in addition to the model's own policies, so a change to a folder's groups takes effect in Cube without recompiling any module (`[AD 4, AD 5, R27; IP 6, R28]`; amended 2026-09-26). wechart SHALL send every folder's allowed groups, and whether security is on, with the folder tree when it starts and after every permission or folder change, a folder no group reaches carrying the Super-Admin group; every Cube instance SHALL apply a change within 60 seconds. With security off, every token is admitted and only the model's own policies apply (`[X4]`, 2026-09-26).
      Fails when: a user token asked directly of Cube, past wechart's own check, returns data from a folder's cube although none of its groups is allowed there; a member of a group granted on /A/B is refused the /A cube that /A/B's chart is bound to; an admitted user gets rows an authored row-level policy withholds from them; a permission change recompiles a module, or hasn't reached a Cube instance 60 seconds after it is made; a folder no group reaches refuses a Super-Admin; or, with security off, a token is refused a published cube.

## F27. Folders hold models and data sources

Purpose: models and data sources become folder items like dashboards and charts, and the Model tab goes.
Traces to: §P2.6 C, `[P2 input]`, `[R19]`. Rewritten phase-1 criteria: AC-001, AC-131, AC-192, AC-194, AC-222, AC-233.

- [ ] AC-269 THE SYSTEM SHALL list a folder's models and data sources in Explore beside its dashboards and charts, each labelled with its kind, and SHALL open a model in the model editor, and a data source in its settings, from the folder.
      Fails when: a model or data source in a folder the user may see (as AC-263 allows) isn't listed there, or can't be opened from it.

## F28. Names and resolution per folder

Purpose: the same short name can mean different things in different folders. The whole deployment is one flat model under folder-prefixed names, and a short name inside an item is bound when the item is published, nearest first from the item's own folder.
Traces to: §P2.6 D, `[P2 input]`, `[R17, R19, R22]`, `[AD 2, AD 3, AD 5, AD 6, R27]` (amended 2026-09-25; `[R20]` superseded), `[IP 3, IP 5, plan, R28]` (amended 2026-09-26). Rewritten phase-1 criterion: AC-249.

- [x] AC-270 IF an item would take the name of an item of the same kind in the same folder (a cube, by cube name across the folder's models; a model file; a dashboard; or a data source), THEN THE SYSTEM SHALL refuse it and name the existing item. Drafts in My workspace may share a name, as an import's do (AC-357); they are held to it when proposed, where an approval replaces the item of its name (`[P2 input]`; the workspace, 2026-09-30, `[R44]`, T513's decision).
      Fails when: two items of one kind share a name in one shared folder, or the refusal doesn't name the existing item.
- [x] AC-271 THE SYSTEM SHALL let a cube, model, dashboard or data source share its name with one in another folder (`[P2 input]`).
      Fails when: a name is refused because a different folder uses it.
- [x] AC-272 WHEN a dashboard or chart is published into a folder, THE SYSTEM SHALL bind each cube it names: search nearest first from that folder up through its ancestors to the root, and store the full ~~prefixed~~ published name of the nearest definition (a root cube's short name, or another folder's `<folderId>__<shortName>`). It SHALL ask xcube's resolver for the cube the chart starts from, and bind each other cube the chart uses through the bindings that cube was published with, so a chart joins as its cube does. A cube defined only in a descendant or a sibling folder is not available to it, and a name found nowhere on the path is refused at publish, naming it. IF xcube can't be reached, THEN the save SHALL be refused, saying so, and nothing stored (`[P2 input, R17, AD 3, AD 5, R27]`; amended 2026-09-25: ~~resolve the name from that folder up … and use the nearest definition~~ at query time; amended 2026-09-26, `[X3, R30]`: xcube's resolver and the source cube's bindings; the refusal while xcube is unreachable, `[R31]`).
      Fails when: a chart published in /A/B binds /A's `sales` while /A/B defines its own; binds a cube defined only in /A/B/C or a sibling; publishes with a name found nowhere on its path; binds a second cube other than the one its source cube was published bound to; or, while xcube is unreachable, a chart or dashboard save in a folder is stored, or its refusal doesn't say xcube can't be reached.
- [x] AC-273 WHEN a model is published, THE SYSTEM SHALL bind each data source it names nearest first from the model's own folder, then each ancestor to the root, and store the full ~~prefixed~~ published name (a root data source's short name, another folder's `<folderId>__<name>`). A cube that extends another SHALL use its parent's data source. A name found nowhere on that path is refused at publish, naming it. A data source added nearer later SHALL bind a published cube only when that cube is next published: nothing is republished for it (`[P2 input, R19, AD 3, R27]`; amended 2026-09-25: ~~Only if none on that path has the name SHALL it use one in the model's descendants. It SHALL refuse a name found in two descendants and none on the path, naming both~~, dropped by R27; amended 2026-09-26, `[X6, R31]`: the published name, extends, and no rebinding).
      Fails when: a model in /A/B binds /A/B/C's `warehouse` or a sibling branch's; binds /A's while /A/B has one; publishes with a name found nowhere on its path; a cube that extends another queries a data source other than its parent's; or adding a nearer data source changes what an already-published cube queries.
- [x] AC-274 WHEN two folders define cubes of the same short name, THE SYSTEM SHALL publish them under different prefixed names, answer each folder's items from the cube they were bound to, and keep their pre-aggregations apart (`[P2 input, AD 2]`).
      Fails when: one folder's answer, or pre-aggregation, comes from the other folder's cube, or the two publish under the same name.
- [x] AC-275 WHEN a change to a model lands in a folder (approved, or a direct rename, move or delete), THE SYSTEM SHALL ~~rebind at that publish every item whose binding the change alters. A nearer definition takes over the items beneath it, and no item outside that folder's subtree changes. The whole model is checked (AC-321), so deleting something others are bound to is refused, naming what depends on it~~ leave every other published item bound as it was published. An item beneath a nearer new definition SHALL bind to it only when that item is next published. A delete or rename of a name that another published item still references SHALL be refused, naming those items (`[AD 3, AD 6, R27]`; amended 2026-09-25; amended 2026-09-26, `[IP 3, plan, R28]`: no rebinding).
      Fails when: publishing a nearer definition changes what an already-published item queries before that item is published again; an item published after it doesn't bind to it; a delete or rename leaves an item bound to something no longer there; or the refusal doesn't name the items that reference it.
- **AC-309 (retired 2026-09-25, superseded by decision 3 and R27; the ID stays and is never reused):** ~~WHEN a chart or dashboard uses a model defined in an ancestor of its folder, and that model names a cube (in a join, a view or an `extends`), THE SYSTEM SHALL resolve that name bottom-up from the chart's or dashboard's own folder, as AC-272 does (`[R20]`).~~ Names inside a model bind from the model's own folder when it is published. A child folder overrides by publishing its own item.
- [x] AC-310 WHEN a cube names no data source, THE SYSTEM SHALL bind it at publish to the data source named `default` nearest on its model's path: the model's folder, then each ancestor to the root. The deployment's own default connection is the shared root's `default` data source, stored and managed like any other and seeded ~~by the Helm values~~ on install by a post-install Job, which seals the database password from the chart's Secret with xcube's public key and creates the data source through wechart's API, so wechart never receives the password (`[R22, AD 3, R27]`; amended 2026-09-25: ~~and only when that path has none, the deployment's own default connection~~; the seeding Job, amended 2026-09-26, `[R31]`).
      Fails when: such a cube in /A/B binds the root's `default` while /A has one, or /A's while /A/B has one; the root's `default` can't be opened and changed in Data sources; after a fresh install the root's `default` is missing or can't connect; or a request to wechart's API, a row it stores or a log line holds the password.
- [x] AC-328 WHEN a cube, view or data source is published ~~in a folder other than the shared root~~ ~~any folder, the shared root included, THE SYSTEM SHALL publish it as `<folderId>__<shortName>`, the folder id written as `f` plus its letters and digits (a UUID's 32 hex digits; the root's `froot`). Every cube and pre-aggregation gets a short, stable `sql_alias`~~, THE SYSTEM SHALL publish it under its short name in the shared root, and as `<folderId>__<shortName>` in any other folder. The folder id is the xcube id stored with the folder: `f` plus the 32 hex digits of a folder with a UUID, and a new id for any other folder, allocated when the folder is made and never given to another. A folder's item gets a short, stable `sql_alias`, so the identifiers Cube builds in SQL stay within the database's limit, and a root item keeps its SQL and rollup names as they were, until its data source is moved to another target, when it takes an alias of that connection's identity (amended 2026-09-28, `[R38]`). ~~The shared root's keep their short names, and renaming~~ Renaming or moving a folder changes no published name (`[AD 2, R27]`; amended 2026-09-26, `[IP 3, plan, R28]`; amended again 2026-09-26, `[X3, user; X3A, R30]`).
      Fails when: two folders' same-named cubes publish under one name; a root item publishes under anything but its short name, or another folder's item under anything but `<folderId>__<shortName>`; two folders share an xcube id, or a removed folder's id is given to another; a table or column name Cube builds for it exceeds the database's identifier limit (63 bytes on Postgres); or renaming or moving a folder changes a published name, breaks a stored reference, or rebuilds a pre-aggregation.
- [ ] AC-329 WHEN the user picks a cube for a chart or dashboard, THE SYSTEM SHALL offer only the cubes found on the item's own folder path, each by its title with its folder path beside it, never by its prefixed name. For a workspace item, that path is the workspace, then its origin's or target's path, as AC-281 has it (`[R27]`; the folder path, `[plan]`, 2026-09-26).
      Fails when: the picker lists a cube from a descendant or sibling folder, shows a prefixed name, or shows a cube without its folder path.
- [ ] AC-342 WHEN a cube on the item's folder path is hidden by a nearer cube of the same name, THE SYSTEM SHALL list it in the cube picker dimmed and unselectable, saying which folder's cube hides it (`[R33]`, proposal 5 of the 2026-09-27 designs).
      Fails when: a hidden farther cube is missing from the list, can be picked, or doesn't say what hides it.
- **AC-331 (retired 2026-09-26, superseded by the user's decision recorded in `[X3]` and R30; the ID stays and is never reused):** ~~WHEN the prefixed names are introduced (slice 3), THE SYSTEM SHALL rewrite every stored reference to a member (in charts, dashboards, markings, bookmarks and links) to its prefixed name, and every existing dashboard SHALL render the same data as before (`[IP 3, plan, R28]`). Fails when: after the migration a stored reference still names a short cube name; or an existing dashboard shows different data, or an error, compared with before it.~~ The root keeps its bare names, so nothing stored is rewritten. That existing dashboards render as before is AC-336.

## F29. Workspaces

Purpose: every author works privately, starting from copies of shared content.
Traces to: §P2.2, §P2.6 E, `[P2 input]`, `[R12, R17, R18]`.

- [x] AC-276 THE SYSTEM SHALL give every Super-Admin and every member of any read-write group a private workspace, shown as "My workspace" in the folder tree. No other user, Super-Admins included, SHALL be able to list, open, search or reach it through the API (`[P2 input, R12]`).
      Fails when: anyone but its owner sees or opens anything in a workspace.
- [ ] AC-277 WHILE a user has only read-only access everywhere, THE SYSTEM SHALL give them no workspace and no action that creates or edits content (`[R12]`).
      Fails when: "My workspace", or any create or edit action, appears to them.
- [ ] AC-278 WHILE an item is in a shared folder, THE SYSTEM SHALL offer no editing of it in place. "Edit in my workspace" SHALL copy the item into the user's workspace, or open their copy already there, for editing (`[P2 input]`).
      Fails when: a shared dashboard, chart, model or data source can be changed without a proposal.
- [ ] AC-279 WHEN the user copies a dashboard into their workspace, THE SYSTEM SHALL copy it with its local charts and the library charts it uses, and no models or data sources unless the user also chooses them (`[P2 input, R18]`).
      Fails when: the copy lacks a chart it shows, or brings a model or data source the user didn't choose.
- [x] AC-280 WHEN the user copies a data source into their workspace, THE SYSTEM SHALL copy its connection settings and its credentials, the credentials still encrypted and never shown (`[R17]`). The copy SHALL keep its original's folder and name, so the workspace's previews query it in place of the original for every cube bound to it, with its encrypted credentials copied unchanged; they open only while its connection target is unchanged (AC-312). Its database type can't change (AC-161) (amended 2026-09-26, `[XOV, R31]`).
      Fails when: the copy can't connect, in a preview, without the credentials being entered again; a credential is shown or returned; a workspace preview of a cube bound to the original queries the original instead of the copy, or a published query reaches the copy; or the copy's type can be changed.
- [x] AC-281 WHEN an item in a workspace names a cube, THE SYSTEM SHALL resolve it in the workspace first. It then resolves along the path of the folder the item was copied from, or, for an item created in the workspace, the path of its target folder (`[R17]`). A name the item already holds, bound to a path's cube, SHALL be resolved again in the workspace's previews by its short name, so the workspace's own cube of that name answers there too; approval binds it where it lands (2026-10-01, the user's answer "Rebind in the workspace", `[R53]`).
      Fails when: a workspace dashboard uses a folder's cube while the workspace defines that name, whether the name was picked before or after the workspace's cube was made; or resolves along another folder's path.
- [x] AC-282 WHEN the user creates a dashboard, chart, model or data source in their workspace, THE SYSTEM SHALL ask for its target folder, among the folders where they have read-write access (`[R17]`). A data source created new SHALL not take a name its target folder already holds: only a copy replaces a folder's data source in previews (AC-280) (`[R31]`, 2026-09-26).
      Fails when: an item is created without a target folder, or with one the user can't write to; or a data source created in the workspace takes the name of one its target folder holds.
- [x] AC-283 WHILE the user works in their workspace, THE SYSTEM SHALL let them use the models, data sources, dashboards and charts of every folder they may see (`[P2 input]`). A model from a folder they may only read SHALL be copied into their workspace to use, marked as one that can't be proposed back to that folder; it may be proposed only to a folder they may write, as a new model (2026-10-01, the user's answer "Yes, use-only copy", `[R53]`).
      Fails when: an item they may see can't be used there, or one they may not see can; or a use-only copy is proposed back into the folder they may only read.

## F30. Proposals, approval and history

Purpose: work reaches a shared folder only through a proposal someone approves, and the folder keeps its recent history.
Traces to: §P2.6 E, `[P2 input]`, `[R12, R17, R18]`.

- [x] AC-284 WHEN the user proposes a workspace item into its target folder, THE SYSTEM SHALL record a proposal holding the item, the folder, the author, the time, and an optional description of at most 1,000 characters. The folder SHALL keep showing its current version (`[R12]`).
      Fails when: the folder changes before approval, or a description over 1,000 characters is accepted.
- [x] AC-285 IF a proposed dashboard's cubes resolve only through models in the author's workspace, THEN THE SYSTEM SHALL put those models in the same proposal, approved or rejected together with the dashboard (`[R18]`).
      Fails when: the dashboard lands without those models, or the models land without the dashboard.
- [ ] AC-286 THE SYSTEM SHALL let a proposal be approved or rejected only by its author, a read-write member of the target folder or a Super-Admin, and SHALL never let one land without an approval (`[R12, R17, R18]`).
      Fails when: a read-only member, or someone without access, can approve; or a proposal lands unapproved.
- [x] AC-287 THE SYSTEM SHALL show each user, in the app, the proposals they may approve, each with its item, folder, author and description, and their number in the top bar. There are no notices outside the app (`[R12]`).
      Fails when: a proposal the user may approve is missing, the number differs from the list, or a proposal is shown to someone who may not approve it.
- [ ] AC-288 WHEN a proposal is approved and ~~the whole model still compiles~~ every module it affects still compiles with it (AC-321), THE SYSTEM SHALL put its item into the folder, replacing any item of the same kind and name, and keep the replaced version in the item's history, a copy wechart holds (`[R17, AD 6, R27]`; amended 2026-09-25; amended 2026-09-26, `[IP 5]`).
      Fails when: the folder shows the old version after an approval that passed the check; the replaced version is missing from history; or an approval that fails the check changes the folder.
- [x] AC-289 THE SYSTEM SHALL keep an item's last 10 versions, each with its author, approver, time and description, show them to the folder's read-write members and to Super-Admins only, and SHALL let a read-write member restore one through a proposal (`[R17, R23]`).
      Fails when: an item that has had more than 10 versions keeps other than its last 10, a read-only user can open its history, or a restore lands without an approval.
- [x] AC-341 WHEN a proposed dashboard is drawn in its review, THE SYSTEM SHALL outline and label each tile the proposal changes ("Changed") or adds ("New") against the folder's current version (`[R33]`, proposal 4 of the 2026-09-27 designs).
      Fails when: a tile the proposal changes or adds carries no label, or an unchanged tile carries one.
- [x] AC-390 WHILE a proposal's review is open, THE SYSTEM SHALL let the reviewer collapse and expand its two side panels, the list of what is in the proposal and the panel about it, each by its own control, reachable by keyboard and saying whether it is open; a collapsed panel leaves a narrow rail with its control, and the item drawn takes the room. The review SHALL be drawn as design 05's main screen draws it: its head bar, the 240 / fluid / 360 panels as surfaces, the items with their icons and the chosen one tinted, uppercase section labels, the author with an avatar, the bundle and "moved on" notes as note bars, Approve and Reject in a footer at the panel's foot, and the item drawn with no folder breadcrumb (2026-10-01, the user: "Make both side panels collapsible. And also match styles with 05 design", `[R54]`).
      Fails when: a side panel can't be collapsed or expanded, or not by keyboard; its control doesn't say whether it is open; the drawn item doesn't widen when a panel collapses; or the review differs from design 05's main screen in one of the listed respects.
- [x] AC-290 WHEN a proposal is rejected, THE SYSTEM SHALL return it unchanged to the author's workspace, with the approver's reason of at most 1,000 characters, and leave the folder as it was (`[R18]`).
      Fails when: the folder changes, the author's workspace loses the work, or the author isn't shown the reason.
- [ ] AC-291 WHEN a read-write member creates a subfolder, sets permissions, or renames, moves or deletes an item in a folder they may write, THE SYSTEM SHALL apply it at once, without a proposal. A move SHALL need read-write access to both folders. A rename, move or delete touching a model, a data source or a folder holding them SHALL apply only if ~~the whole model still compiles~~ every module it affects still compiles (AC-321) (`[R17]`; amended 2026-09-25, `[AD 6, R27]`; amended 2026-09-26, `[IP 5]`).
      Fails when: one of these waits for an approval; is allowed without read-write access to the folders involved; or a change touching models or data sources applies although a module it affects then fails to compile.
- [ ] AC-321 WHEN a change would publish (a proposal made or approved, or a direct rename, move or delete touching a model, a data source or a folder holding them), THE SYSTEM SHALL ~~compile the whole model with the change applied and refuse the change if anything anywhere breaks~~ have xcube compile each module the change affects, with the change applied, in a throwaway compile, and refuse the change if any of them breaks. A refused change leaves every folder and the proposal as they were, and no published module changes. A proposal is checked when it is made, ~~as an overlay~~ by xcube's dry run of its changeset, and again at approval (`[AD 6, R27]`; amended 2026-09-26, `[IP 4, IP 5, plan]`; amended again 2026-09-26, `[X3]`: a proposal's check is the changeset's dry run until overlays, slice 5). Approval SHALL also be refused, naming the items, when any item would bind to a cube or data source other than the one it bound to ~~in the proposal's preview~~ when it was proposed, so what lands is what was submitted; the author then withdraws it and proposes again (amended 2026-10-01, `[R52]`). A proposal's data sources SHALL land first, and the rest be checked against them; a refused approval leaves those data sources landed (2026-10-01, the user's answer "Land data sources first", `[R52]`). With security on, the check's probes SHALL run as a token every probed folder admits (amended 2026-09-26, `[R31; X4]`).
      Fails when: a proposal is made, an approval lands or a direct change applies although an item in a module it affects then fails to compile; a module the change doesn't affect is recompiled; a refusal changes a folder, the proposal or a published module; an approval lands with an item bound otherwise than ~~in its preview~~ when it was proposed, or its refusal doesn't name the item (amended 2026-10-02 to match the criterion, `[R52]`); or, with security on, a change that breaks a rollup in a folder passes the check.
- [x] AC-322 WHEN the ~~whole-model~~ publish check refuses a change, THE SYSTEM SHALL name each break in the folders the user may see, with ~~Cube's error and its file~~ its error and its item, and the line and column where xcube gives them, and give only a count of the rest ("n items in folders you can't see would break"). A Super-Admin sees every break named, and the audit trail records every one (`[R27]`; amended 2026-09-26, `[plan]`).
      Fails when: a refusal names an item or folder the user can't see; omits a break they can see; names a break without its item; gives a count other than the hidden breaks'; or a break is missing from the audit trail.
- [x] AC-323 WHILE an item is in a workspace or in a proposal, THE SYSTEM SHALL let it be queried through an xcube overlay only by the workspace's owner, or, for a proposal, by its author, the target folder's read-write members and Super-Admins. Names resolve in the overlay first, then along the target's or origin's folder path. A proposal's overlay is dropped once it is approved or rejected (`[AD 8, R27]`). The overlay SHALL be named in the signed token, and only in the tokens of those it allows, so Cube refuses it to anyone else. It SHALL hold the workspace's items and its data sources, pushed on every save; a workspace's overlay is dropped once its content is published or discarded. A preview's field list SHALL be its overlay's. IF a publish leaves an overlay no longer applying, THEN its previews SHALL say which item no longer applies, rather than answer from the published model (amended 2026-09-26, `[X5, user; XOV]`).
      Fails when: anyone else gets data from the overlay, or a token for someone it doesn't allow names it; a name resolves outside the overlay while the overlay defines it; a query against a landed or rejected proposal's overlay, or a published or discarded workspace's, succeeds; a workspace preview's field list lacks a cube the workspace added, or shows one the workspace deleted; or a preview whose overlay no longer applies answers from the published model, or doesn't name the item.
- [x] AC-388 WHILE a workspace item is in an open proposal, THE SYSTEM SHALL refuse every change to it, saying it was submitted and that withdrawing the proposal lets it be changed and proposed again (2026-10-01, the user's answer: "No edits on something that was submitted.. if it has to change revert the submission, make changes and submit again", `[R52]`).
      Fails when: a dashboard, chart, model or data source in an open proposal is changed, or the refusal doesn't say to withdraw it first.
- [x] AC-389 WHEN a proposal is approved whose target folder has been deleted since, THE SYSTEM SHALL create the folder again, with its id, name, parent, description and groups as they were when it was deleted (and its deleted parents likewise), then land the items in it. A folder of the same name made in that parent since SHALL leave the recreated one a numbered name (2026-10-01, the user's answer: "Dont block.. when approved create the folder again and land the files", `[R52]`; the numbered name, Claude's call).
      Fails when: such an approval is refused or lands nowhere; the folder comes back with another id, name, parent or groups; a deleted parent isn't recreated; or two folders in one parent share a name.

## F31. Personal bookmarks

Purpose: bookmarks belong to the person who saved them, until they share one.
Traces to: §P2.6 F, `[R12]`.

- [x] AC-292 WHEN a user saves a bookmark, THE SYSTEM SHALL keep it theirs, listed on the dashboard for them alone.
      Fails when: another user sees a bookmark its owner hasn't shared.
- [x] AC-293 WHEN a user shares a bookmark, THE SYSTEM SHALL list it for everyone who may see the dashboard, labelled with who shared it. Only its owner SHALL be able to change or unshare it.
      Fails when: someone who may see the dashboard doesn't see a shared bookmark, or someone other than its owner can change or unshare it.

## F32. Audit trail

Purpose: Super-Admins can see who did what, where and when.
Traces to: §P2.4, `[R14, R18]`.

- [ ] AC-294 THE SYSTEM SHALL record every sign-in, permission change, proposal, approval, rejection, restore and data-source change, and every build started from Jobs ~~, cancel, and change to a wechart-owned schedule~~ or by Run now, every cancel or stop of a build, and every change to a wechart-owned schedule (made, changed, paused, resumed, suspended or deleted), each with who, what, which folder and when (the last three added 2026-09-28, `[R42]`). A suspension SHALL be recorded with "wechart's scheduler" as who, and the runs a schedule starts SHALL not be recorded there (amended 2026-10-02, `[R56]`: design 16's state I and Q12, with P1–P3).
      Fails when: an event of one of those kinds is missing from the record; a suspension names a person as who; or a run a schedule started is recorded as a build started.
- [x] AC-295 WHEN a Super-Admin opens the audit trail, THE SYSTEM SHALL list its records newest first, filterable by user, event and folder, and SHALL show it to no one else.
      Fails when: a user who isn't a Super-Admin can open it, or a filter returns a record that doesn't match it.
- [x] AC-296 THE SYSTEM SHALL remove audit records older than the retention the deployment configures, and one year when none is configured (`[R18]`).
      Fails when: a record older than the retention remains, or a younger one is removed.

## F33. Jobs and Schedules by folder

Purpose: read-write members run and schedule their own folders' rollups.
Traces to: `[R18]`; F17; design 16 `[R56]`.

- [ ] AC-297 WHILE a user is a read-write member of some folders and not a Super-Admin, THE SYSTEM SHALL show them in Jobs and Schedules only the pre-aggregations, builds, queue entries and schedules of the models in those folders, and only the query records of their own queries, and let them build and schedule those, with a note that only the folders they may write are shown, naming no other folder. Scheduling there means wechart-owned schedules (AC-234), which any read-write member of the pre-aggregation's folder, or a Super-Admin, may change, pause, resume or delete; a schedule belongs to its folder, and keeps running, still naming who made it, when the one who made it loses access. A Cube-owned schedule is a model's `refresh_key`, changed by a proposal like any model change. For everyone who may use them, Jobs' tabs and Schedules SHALL show each row's folder, with a Folder filter (amended 2026-09-28, `[R40]`; query records their own, `[R42]`; amended 2026-10-02, `[R56]`: design 16's Q10, and the Folder column and filter of rule 84).
      Fails when: they see, or act on, another folder's rollups, builds, queue entries or schedules, or another user's query records; ~~or~~ a change to a shared folder's `refresh_key` lands without an approved proposal; a read-write member of the folder can't change a schedule another member made, or a member of another folder can; a schedule stops running when its maker loses access; or a row shows no folder.

## F34. Credentials

Purpose: data-source credentials are readable only by xcube, which alone holds the private key; wechart keeps them, and their lifecycle, without ever decrypting them. ~~Data-source credentials are unreadable without the deployment's key.~~ (Amended 2026-09-25.)
Traces to: §P2.4, `[R14, R15, R21]`, `[AD 7, R27]`, `[IP 1, R28]`; F18's AC-164.

- [ ] AC-298 THE SYSTEM SHALL store data-source credentials in the metadata database encrypted to xcube's public key, so neither the database nor anything wechart holds can reveal them (amended 2026-09-25, `[AD 7]`: ~~encrypted with a key from the deployment's Secret, so the database alone can't reveal them~~).
      Fails when: a credential can be read from a dump of the metadata database, or from anything wechart holds, without xcube's private key.
- **AC-311 (retired 2026-09-25, superseded by decision 7 and R27; the ID stays and is never reused; see AC-324):** ~~IF the API starts without the encryption key, or with a key that can't decrypt the stored credentials, THEN THE SYSTEM SHALL refuse to start, and say which key is missing or can't decrypt them (`[R21]`).~~
- [x] AC-324 IF wechart's API starts without xcube's public key, or xcube starts without its private key or with one that can't decrypt a sample credential, THEN THE SYSTEM SHALL refuse to start and say which key is missing or can't decrypt (`[AD 7, R27]`). IF xcube answers that it holds no credential key with the id of wechart's public key, THEN wechart's API SHALL likewise refuse to start, naming that key id (amended 2026-09-26, `[X6]`: xcube lists its credential keys for this check).
      Fails when: either service serves requests without its key, or exits without naming the key problem; or wechart's API serves requests while xcube lists no key with its public key's id.
- [ ] AC-325 WHEN a user types a data source's secret, THE SYSTEM SHALL encrypt it in the browser, to xcube's public key, before sending it. No request to wechart, nothing wechart stores, and no log line SHALL hold the typed secret, the connection test included (`[AD 7, R27]`).
      Fails when: a request body to wechart's API, a stored row, or a log line contains the typed secret.
- [x] AC-312 WHEN a data source's connection target changes ~~(its host, port, account, workspace, warehouse, project or connect string)~~, THE SYSTEM SHALL clear its stored secret and require the secret again before the source can be tested or saved (`[R21]`). Its target is the fields xcube binds its secrets to, TLS settings included: host, port, `ssl`, `sslRejectUnauthorized` and `sslCa` for PostgreSQL, Redshift and MySQL; host, port, `encrypt` and `trustServerCertificate` for SQL Server; host, port, URL and `ssl` for Dremio; account, region and warehouse for Snowflake; the project for BigQuery; and the connect string, database, host and port for Oracle (amended 2026-09-26, `[X6]`; research `xcube-overlay-data-sources.md`, "The TLS binding").
      Fails when: after a target field changes, a test or save uses the previously stored secret; or a change to a field outside the target (a PostgreSQL database name, a user) clears it.

## F35. Charts from the UI review and R8

Purpose: the UI review's accepted chart gaps, and the two chart types from the Superset parity exercise.
Traces to: §P2.6 H, `[R8, R16, R19, R21, R22]`, `[backlog]` §5. Rewritten phase-1 criteria: AC-041, AC-220.

- [x] AC-299 WHEN a chart's value-axis labels would overlap at the tile's width, THE SYSTEM SHALL thin or abbreviate them so no two overlap (the UI review's gap 4).
      Fails when: two value-axis labels overlap in a drawn tile.
- [x] AC-300 WHEN the user orders a chart's series in Customize, THE SYSTEM SHALL draw, stack and list the series in that order, and keep it after a refresh (gap 7).
      Fails when: series stack alphabetically after another order was set, or the order changes on refresh.
- [x] AC-301 THE SYSTEM SHALL order a table's columns as the wells order its fields: time and dimensions first, then measures in the Metrics well's order (gap 9).
      Fails when: a table's columns differ from the wells' order.
- [x] AC-302 WHEN the user selects a markdown tile in edit mode, THE SYSTEM SHALL let them edit its text, and render the change (gap 12).
      Fails when: a markdown tile's text can't be changed in the UI.
- [x] AC-303 WHEN data labels are on for a pie or donut, THE SYSTEM SHALL draw each label whole, moving or hiding the labels that don't fit (gap 3).
      Fails when: a slice's label shows a truncated value such as "$…".
- [x] AC-304 WHILE the window is narrower than 1,024 pixels, THE SYSTEM SHALL fit the app bar within it, folding navigation and search into a menu (the UI review's narrow-shell change).
      Fails when: a page scrolls sideways at 390 pixels wide.
- [x] AC-305 WHEN a chart has one measure and a dimension holding ISO-3 country codes, THE SYSTEM SHALL offer a country map that colours each country by the measure on a sequential scale with a legend, and names any codes it can't place. Its boundaries are Natural Earth's 1:50m admin-0 units, so small states such as Singapore (SGP) are placed (`[R8, R22]`).
      Fails when: a country code in the data isn't coloured (SGP included), the map has no legend, or an unplaced code isn't named.
- [x] AC-313 THE SYSTEM SHALL treat a dimension as holding ISO-3 country codes when every non-empty value is an ISO 3166-1 alpha-3 code, unless the model marks it otherwise; a dimension the model marks as a country code counts whatever its values, and one it marks as not a country code never does (`[R22]`).
      Fails when: the map is offered for a dimension marked "not a country code", withheld from one marked as a country code, or withheld from an unmarked dimension whose values are all ISO-3 codes.
- [x] AC-306 WHEN the user draws a box plot of a numeric value by a category, THE SYSTEM SHALL draw one box per category with its median and quartiles, computed by linear interpolation (Hyndman–Fan type 7). Its whiskers follow a chart option: by default Tukey's, ending at the most extreme value within 1.5 × IQR of the box, with values beyond drawn as dots; or else the minimum and maximum (`[R8, R19]`).
      Fails when: a box's median or quartiles differ from type-7 quartiles of its values, or the whiskers don't follow the chosen option.
- [x] AC-314 WHEN the user sets a box plot's "Each point is" field (for example Order ID), THE SYSTEM SHALL compute the measure once per value of that field within each category, and draw the boxes from those values (`[R22]`).
      Fails when: with "Each point is" set to Order ID, a box's values are not one per order.
- [x] AC-315 IF a box plot's data has more rows than Cube returns in one query, THEN THE SYSTEM SHALL draw the boxes from the rows returned and show "computed from _n_ of _N_ rows" on the tile (`[R21]`).
      Fails when: a box plot drawn from fewer rows than the data holds shows no such warning, or its counts differ from the rows used and the query's total.

## F36. Phase 2's performance and regression

Purpose: security costs no speed, and phase 1 still works with security off.
Traces to: §P2.3, `[R13, R19]`.

- [ ] AC-307 WHILE security is enabled, WHEN a signed-in user opens a 10-chart dashboard in a folder with its own models, THE SYSTEM SHALL render every tile within 3 seconds at the 95th percentile (S2).
      Fails when: the p95 exceeds 3 seconds.
- [ ] AC-308 WHILE security is disabled, THE SYSTEM SHALL pass the phase-1 end-to-end suite, its editing steps going through the workspace and a self-approved proposal. Checked once, at the end of phase 2 (S3).
      Fails when: a phase-1 end-to-end test fails.
- [ ] AC-343 THE SYSTEM SHALL draw each phase-2 surface as its approved design in `docs/design/reviews/2026-09-27/designs/` (01–10), with the structure, placement, controls, wording and states the design and its notes give, in the tokens of direction.md §3–5 (`[R33]`: the user, 2026-09-27, "Approve all with proposals").
      Fails when: a surface a design covers differs from it in its layout or placement, its controls or their order, its wording, or a state the design draws. Each surface's task names the design it checks against.
- [ ] AC-352 THE SYSTEM SHALL draw the chart editor's inspector and results drawer, the dashboard view, the dashboard settings page, the chart page and Schedules as the 2026-09-24 designs 01, 02 and 04–07 draw them (`docs/design/reviews/2026-09-24/designs/`), with the structure, placement, controls, wording and states their notes give, in the tokens of direction.md §3–5 — except where a 2026-09-27 design draws the same surface differently, which it follows, and leaving out the items those designs mark as proposals, which the user has not decided (`[R37]`).
      Fails when: one of those surfaces differs from its design in its layout or placement, its controls or their order, its wording, or a state the design draws, and no 2026-09-27 design, recorded decision or backlog entry gives the reason. Each surface's task names the design it checks against.

## F37. The semantic service: Cube and xcube

Purpose: ~~Cube plus xcube own the published model, Cube's rules and the connection runtime.~~ wechart is the system of record, and xcube serves Cube a derived copy of what is published, compiled as modules (amended 2026-09-26, `[IP 1, IP 2, IP 4]`). wechart is their only caller and never their server. The query path survives losing one instance of each service.
Traces to: §P2.4 Architecture, `[AD 1, AD 10, AD 11, AD 12, R27]` (added 2026-09-25), `[IP 1, IP 2, IP 8, IP 9, plan, R28]` (amended 2026-09-26), and "Slice 2 as built", `[X2, R29]` (amended 2026-09-26; `docs/research/xcube-slice-2.md`), and "Slices 4–6 as built", `[X4, X5, X6, XD, XOV, R31]` (amended 2026-09-26; the note after AC-337).

- [ ] AC-319 WHILE the query path runs 2 Cube instances on the Cube Store queue and 2 wechart API replicas, WHEN one Cube instance and one API replica stop during use, THE SYSTEM SHALL keep every signed-in session and answer every query the web app retries. Any API replica SHALL serve any request, keeping no work of its own in memory. Cube Store stays single-node (`[AD 1, AD 11, R27]`).
      Fails when: after one Cube instance and one API replica stop, a signed-in user is asked to sign in again, or a query the web app retries fails; or work begun through one replica (a workspace edit, a proposal) can't be carried on through the other.
- [ ] AC-326 ~~WHERE security is enabled,~~ THE SYSTEM SHALL sign each token for ~~a signed-in user's~~ queries with RS256, with security off too, since xcube refuses any other token once keys are pushed (`[X4]`, 2026-09-26). WHERE security is enabled, a signed-in user's token SHALL carry their groups ~~and no other attribute of theirs~~ that some access policy names (AC-008) and the token's own kind, issuer, audience and expiry, and no other attribute of theirs: no subject. It SHALL push its public keys to xcube, through xcube's admin API, when it starts and whenever they rotate, and SHALL use the service credential for every call it makes on its own behalf (`[AD 12, R27]`; amended 2026-09-26, `[IP 8, R28]`). ~~Until slice 4, xcube's admin routes take xcube's static admin token in the service credential's place (`[X2, R29]`, AC-333).~~ A token expires at most an hour after it is issued. On a preview it also names the overlay it may query (AC-323). Keys are pushed as the whole set with a version that only rises; a rotation pushes the current and the next key, signs with the next only once that push is answered, and drops the current once its tokens have expired. The service credential is an RS256 token of its own key, whose public half xcube is given by configuration, and xcube's static admin token is retired (amended 2026-09-26, `[X4, X5]`: slice 4 as built).
      Fails when: a query token isn't RS256, security on or off; a user's token carries a subject or any other attribute of theirs beyond those groups and an overlay AC-323 allows them, or leaves out a group of theirs that some policy names; a token outlives its hour; a token signed with a new key is refused after a rotation, or one signed with the current key is refused during it; xcube gets a key by requesting it from wechart; an own-behalf call (introspection, a build or job, system partitions, health, an xcube admin call) uses a user's token or the static admin token; or a response to the browser contains the signing key or the service credential.
- [x] AC-327 THE SYSTEM SHALL publish, query, refresh and test connections with no request from Cube or xcube to wechart. Cube SHALL take its model and its connections from xcube, and only wechart's server SHALL call Cube or xcube (`[AD 1, AD 10]`).
      Fails when: any request from a Cube or xcube process reaches wechart during a publish, a query, a refresh or a connection test; wechart serves a route for Cube to read a model or a connection from; or the browser makes a request to Cube or xcube.
- [ ] AC-330 WHEN wechart's API starts, THE SYSTEM SHALL bring xcube's copy up to what wechart has published (folders, their allowed groups, model items and data sources), sending a full snapshot when xcube's copy is missing or behind. Cube SHALL then answer queries on published items with every API replica stopped (`[IP 1, IP 2, plan]`).
      Fails when: after xcube's copy is emptied and the API restarts, a published item can't be queried; or a query on a published item fails while every API replica is stopped.
- [x] AC-332 IF a model item is anything but YAML (a JavaScript or Python file, or YAML generated with Jinja), THEN THE SYSTEM SHALL refuse to publish it into a folder, saying that only YAML models can be published (`[R28]`).
      Fails when: such an item is published, or the refusal doesn't say that only YAML can be.

*Added 2026-09-26 for xcube's slice 2 as built (`[X2, R29]`). Slice 2 is one cut-over: xcube serves the model, and wechart's model store goes with it (AC-327's model half). AC-009, AC-136 and AC-137 keep their wording and their ticks: the cut-over re-runs their tests against xcube, and they are unticked if those fail. AC-235 is amended above.*

- [x] AC-333 WHEN wechart's API starts, a publish is committed, and every 60 seconds, THE SYSTEM SHALL compare xcube's current revision of the deployment's model (named by its configured model id) with wechart's published files, their plain YAML alone (AC-335), and, when ~~their content hashes differ, send the whole set as the model's next revision, recording the generation, revision and content hash xcube acknowledges~~ the items hash xcube reports differs from wechart's (each file one item, AC-337), send the whole item set as the model's next revision, recording the generation, revision and items hash xcube acknowledges. It SHALL push its folder tree (each published folder's xcube id and parent, AC-328) when it starts and after every folder change, and compare the tree's hash with the one xcube answers. It SHALL commit a publish to its own store before sending it, and SHALL call xcube's admin routes with ~~xcube's static admin token~~ the service credential (AC-326) (`[X2, R29]`; amended 2026-09-26, `[X3, R30]`: items mode, the items hash and the folder tree; unchecked until retested; the service credential in place of the static admin token, amended 2026-09-26, `[X4]`, and ticked again by T420: `xcube/client.test.ts`, `service-wiring.test.ts`, and the reconcile's e2e (`xcube-cutover.spec.ts`, `items-switch.spec.ts`) on the `ed08180c37` image with no static token set).
      Fails when: 60 seconds after a publish, or after a send lost between wechart's commit and xcube (the API stopped, or xcube unreachable), xcube's current ~~content hash differs from that of wechart's published plain YAML files~~ items hash differs from that of wechart's published items; after a folder change, the tree hash xcube answers differs from wechart's tree's; xcube serves a revision whose ~~files~~ items wechart's store doesn't hold; a publish through one deployment changes another deployment's model; or an admin call is made without ~~the admin token~~ the service credential, or with a user's token.
- [x] AC-334 WHEN a change is published through any API replica, THE SYSTEM SHALL answer every later query for that model, through any replica and on any Cube instance, from that revision or a newer one: each query token names the model and the oldest revision it may be answered from, and a Cube instance still catching up is waited for and asked again rather than answering from an older revision (`[X2]`; AC-319).
      Fails when: after a publish is acknowledged, a query or the field list, through the other replica or on the other Cube instance, answers from the previous revision (a new member missing, or a removed one still listed); or a Cube instance's 503 while it catches up reaches the user as an error.
- [x] AC-335 WHEN wechart sends its files to xcube (a snapshot, or a publish's check), THE SYSTEM SHALL send only plain YAML files. A JavaScript, Python or Jinja file already in wechart's store SHALL stay there, viewable read-only with its reason (AC-140), and SHALL never be sent (`[R29]`).
      Fails when: a snapshot or a check sent to xcube holds such a file, or xcube refuses a snapshot as holding one; or such a file can no longer be opened read-only.

*Added 2026-09-26 for xcube's slice 3 as built (`[X3, X3A, R30]`). wechart moves its model to xcube's items mode once, then publishes through changesets. The root keeps its bare names, so nothing stored changes. AC-009, AC-136 and AC-137 keep their wording and their ticks, and the slice-3 publish task re-runs their tests on items mode.*

- [x] AC-336 WHEN wechart first moves its model to xcube's items mode (one items snapshot of its published files, each file a root item), THE SYSTEM SHALL answer every existing dashboard with the same data as before, and change no stored chart, dashboard, marking, bookmark or link (`[X3, user; X3A, R30]`).
      Fails when: after the move an existing dashboard's tile shows different data, or an error, compared with before it; a stored chart, dashboard, marking, bookmark or link differs from before it; or a root cube's rollup is rebuilt because of the move.
- [x] AC-337 THE SYSTEM SHALL keep one cube or one view per model file: the move to items mode splits a file declaring several into one file each, named for what it declares, and a publish of a file declaring more than one is refused, naming them (`[X3A, R30]`).
      Fails when: after the move a stored model file declares two or more cubes or views, or a split file's cube serves different members than before; or a file declaring two cubes or views is published, or its refusal doesn't name them.
      Note (2026-09-26, T448): "a stored model file" means one that is published as an item. A Jinja template is read-only and never sent (AC-140, AC-335), so it is left as it is.

*Amended 2026-09-26 for xcube's slices 4–6 as built (`[X4, X5, X6, XD, XOV, R31]`; research `xcube-slice-4.md`, `xcube-slice-5.md`, `xcube-slice-6.md` and `xcube-overlay-data-sources.md`, the last correcting the others). No criterion is added: each behaviour the slices bring falls under one that exists, amended in place.*
- *Slice 4, the folder gate and tokens:* AC-320 (allowed groups and the security flag sent with the tree, applied within 60 seconds), AC-263, AC-326 (RS256 for every query token, an hour's life, key push and rotation, the service credential; the static admin token retired, so AC-333 is unticked until retested), AC-321 (probes a folder admits).
- *Slice 5, overlays:* AC-323 (named in the signed token, the workspace's data sources, the field list per overlay, an overlay that no longer applies), AC-321 (approval refused when an item would bind otherwise than in its preview).
- *Slice 6, connections:* AC-160 (eight drivers), AC-159 (the checks), AC-161 (per-instance health within the hour; no change of type), AC-273 (extends, no rebinding), AC-310 (the seeding Job), AC-312 (the target's fields, TLS included), AC-324 (the key id checked against xcube's), AC-280 and AC-282 (copies keep their name; only copies replace).
- *And:* AC-272 (a save refused while xcube is unreachable).

## F38. Exporting and importing a dashboard

Purpose: move a dashboard, with the dependencies its exporter chooses, from one wechart to another, or from one folder to another, without its data sources' secrets.
Traces to: `[R43]`; design `docs/design/reviews/2026-09-28/designs/13-dashboard-export-import.html`.

- [x] AC-354 WHEN a user exports a dashboard they may see, from the ⋯ menu in its header or its row's menu in Explore, THE SYSTEM SHALL offer as dependencies to include, each ticked to start, the library charts it shows, the models its charts use and the data sources those models bind to, each named with what uses it, of those the user may see; SHALL say how many it does not offer because they are in folders the user may not see, naming neither them nor their folders; and SHALL give one ~~file~~ JSON file, named after the dashboard as `<name>.wechart.json` and renamable before export, holding the dashboard, its own charts and the dependencies chosen (`[R43]`; amended 2026-09-28, `[R46]`).
      Fails when: a library chart, model or data source the dashboard uses, and the user may see, is not offered; one the user may not see is offered, named, or in the file; one not chosen is in the file; one of the dashboard's own charts is missing from it; or the file is not valid JSON.
- [x] AC-355 THE SYSTEM SHALL export a data source with its driver, settings and description, and never a secret of it, sealed or not (`[R43]`).
      Fails when: an export file holds a data source's password, key, token, sealed envelope or its revision, or lacks one of its settings.
- [ ] AC-356 WHEN a user with a workspace imports an export file, THE SYSTEM SHALL put what it holds into their workspace as new drafts, with the target folder they choose among those they may write, as New in My workspace does, to reach it by a proposal like any draft; ~~with sign-in off, into the chosen folder~~ with sign-in off too, into the single user's workspace, whose proposals they approve themselves (AC-254). An import SHALL never replace, rename or remove an item already saved (`[R43]`; amended 2026-09-28, `[R44]`).
      Fails when: an import changes a shared folder, or lands anywhere but the importer's workspace; an import replaces, renames or removes an item already saved; or a user with no workspace can import.
- [x] AC-357 ~~WHEN an imported item has the same kind and name as one where it would land, THE SYSTEM SHALL ask, for each such item, whether to replace it (by a proposal where shared), keep both (the import renamed), or skip it, and SHALL do what was chosen for each~~ BEFORE an import is made, THE SYSTEM SHALL warn, without blocking it, of each item it holds that has the same kind and name as one in the target folder or the importer's workspace, of each model defining a cube or view whose name the target folder already has, and of each data source whose name the target folder already has, naming the item, where the other is (a count only, for folders the user may not see), and what proposing it would do (`[R43]`; amended 2026-09-28, `[R44]`).
      Fails when: such an item is imported with no warning naming it; a warning blocks the import; or a warning names an item or folder the user may not see.
- [ ] AC-358 WHEN an import holds a data source, THE SYSTEM SHALL let the importer map it to an existing data source they may use, or create it ~~from~~ in their workspace from the exported settings with its secrets entered, tested before it is saved, under another name where the target folder already has its name (AC-282); and the imported models SHALL bind to the data source chosen (`[R43]`; amended 2026-09-28, `[R44]`).
      Fails when: an imported data source is saved without its secrets entered or without a passing test, or anywhere but the importer's workspace with sign-in on; or an imported model binds to a data source other than the one chosen for it.
- [x] AC-360 WHEN the exporter hovers over or focuses a dependency in the Export pane, THE SYSTEM SHALL outline the dashboard's tiles that use it (`[R46]`, design 13's P1).
      Fails when: hovering over or focusing a dependency outlines no tile that uses it, or outlines one that doesn't.
- [x] AC-361 WHEN an importer maps an imported data source to an existing one with a different driver, THE SYSTEM SHALL warn, without blocking, naming both drivers (`[R46]`, design 13's P5).
      Fails when: such a mapping shows no warning naming both drivers, or the warning blocks the import.
- [x] AC-359 IF an export file can't be read, or holds a kind, chart type or driver this wechart doesn't have, THEN THE SYSTEM SHALL refuse to import it, saying which part and why, and change nothing (`[R43]`).
      Fails when: an unreadable or unsupported file changes anything, or its refusal doesn't name the part.

## F39. Deleting, clearing and finding

Purpose: delete an item only when nothing depends on it, clear My workspace in one go, keep each edit's copies together in a project folder with a description, and narrow Explore to one kind of item.
Traces to: `[R48]`.

- [x] AC-362 WHEN a user deletes a library chart that a dashboard in a shared folder uses, THE SYSTEM SHALL refuse the delete, naming the dashboards that use it that the user may see and counting the rest, and SHALL delete a chart no such dashboard uses. A draft in a workspace doesn't hold it back: its tile shows the chart gone (`[R48-1]`; supersedes AC-023; drafts, 2026-09-30, `[R49]`).
      Fails when: a chart a shared folder's dashboard uses is deleted; the refusal names a dashboard the user may not see, or leaves out one they may; a draft keeps the chart from being deleted; or a chart no shared dashboard uses can't be deleted by a user who may change its folder.
- [x] AC-363 WHEN a user who may change a dashboard deletes it, THE SYSTEM SHALL remove it together with its own charts and its bookmarks (`[R48]`).
      Fails when: the dashboard, one of its own charts or one of its bookmarks is still there after the delete; or a user who may not change it can delete it.
- [x] AC-364 WHEN a user deletes a data source that a cube is bound to, THE SYSTEM SHALL refuse the delete, naming the cubes bound to it that the user may see and counting the rest, and SHALL delete a data source no cube is bound to (`[R48]`).
      Fails when: a data source a cube is bound to is deleted; the refusal names a cube the user may not see; or a data source no cube is bound to can't be deleted by a user who may change its folder.
- [x] AC-365 WHEN a user deletes a cube, or the model file holding it, THE SYSTEM SHALL refuse the delete while a view uses the cube, another cube joins to it, or a chart or dashboard is bound to it, naming each of those the user may see and counting the rest; and SHALL delete a cube nothing depends on (`[R48-2]`; with AC-275).
      Fails when: a cube a view, a join, a chart or a dashboard depends on is deleted; the refusal leaves out a dependent the user may see, or names one they may not; or a cube nothing depends on can't be deleted.
- [x] AC-366 WHEN a user who may delete a folder deletes it, THE SYSTEM SHALL delete it only if it holds nothing, no subfolder, dashboard, chart, model or data source; otherwise SHALL refuse, saying what it holds. Explore SHALL offer Delete on a folder only when it is empty (`[R48-3]`).
      Fails when: a folder holding anything is deleted; the refusal doesn't say what it holds; Delete is offered on a folder that holds something; or an empty folder the user may delete can't be deleted.
- [x] AC-367 WHEN a user clears My workspace, THE SYSTEM SHALL first ask them to confirm, naming how many items it removes and each open proposal it withdraws; once confirmed, it SHALL remove every item and folder in their workspace and withdraw those proposals, changing nothing outside the workspace (`[R48-4]`).
      Fails when: an item or folder is left in the workspace; an open proposal of one of its items stays open; the confirmation doesn't name an open proposal it withdraws; anything outside the user's workspace changes; or nothing is asked first.
- [x] AC-368 WHEN a user copies a shared item into their workspace with "Edit in my workspace", THE SYSTEM SHALL create one folder in My workspace named `project-YYYY-MM-DD-HHmm` in the user's time, and put the copy and everything copied with it there: the library charts' copies and the data sources chosen. A second copy in the same minute SHALL be named with `-2`, then `-3`. A new item made in My workspace SHALL get no project folder (`[R48-5]`).
      Fails when: a copy is made with no project folder, or outside it; one copy's items are split across folders; the folder's name isn't the copy's time in that form; two folders take the same name; or a new item made in My workspace gets a project folder.
- [x] AC-369 THE SYSTEM SHALL let a user who may change a folder give it a description, of up to 1,000 characters, shown under its name in Explore's header and as the second line of its row where a folder lists it. A project folder's description SHALL start prefilled with what is being edited and where it came from, for example "Editing Revenue overview from Sales / EMEA", and stay editable (`[R48-6]`; the row, design 14's P1, `[R49]`).
      Fails when: a saved description isn't shown under the folder's name or on its row; one who may not change the folder can change it; one over 1,000 characters is saved; or a project folder's description isn't prefilled with the item's title and its folder's path.
- [x] AC-370 WHEN the user chooses a kind in Explore's filter, one of All (the default), Dashboards and charts, Data sources and Models, THE SYSTEM SHALL list only the open folder's items of that kind, with its subfolders still listed to open, and leave the folder tree as it is. The kind SHALL be kept in the address and stay chosen as the user opens subfolders. A read-only user, who sees only dashboards and charts, gets no filter (`[R48-7]`; the address, design 14's P2, and readers, `[R49]`).
      Fails when: an item of another kind is listed; an item of the kind is left out; the filter starts on anything but All; the subfolders disappear from the list; the tree changes; the kind is lost on opening a subfolder or on reloading; or a read-only user is offered the filter.
- [x] AC-371 WHILE security is enabled, WHEN a user puts a library chart on a dashboard whose folder path doesn't hold the chart's folder, THE SYSTEM SHALL put a copy of it there as a chart of the dashboard's own, so no tile needs a folder the dashboard's readers can't see (`[R49]`, the user's answer on AC-263: "Copy on use"). The same SHALL hold when an approval lands a dashboard, and when moving a chart, a dashboard or a folder would leave a dashboard showing such a chart: each such dashboard gets its own copy, and the user who moved it is told which (amended 2026-10-01, the user's answer: "Copy on move + approval", `[R51]`). With security off there are no readers to keep out, so nothing is copied (scoped 2026-10-01, Claude's call from T359's report, overturnable, `[R53]`).
      Fails when: a dashboard shows a library chart kept in a folder off its own folder's path, after a save, an approval or a move; or a move that copied doesn't say which dashboards got copies.
- [x] AC-372 WHEN a user deletes an item in their workspace that waits in an open proposal, THE SYSTEM SHALL name that proposal in the confirmation, and withdraw it with the delete (`[R49]`, design 14's Q2).
      Fails when: such an item is deleted with its proposal still open, or the confirmation doesn't name the proposal.

## F40. The SQL runner

Purpose: run read-only SQL on a data source's own connection, or on Cube Store, through xcube, for those a Super-Admin allows, capped and recorded.
Traces to: `[R50]`; research `docs/research/sql-runner.md`.

- [x] AC-373 WHERE a Super-Admin has switched the SQL runner on for a data source in a folder, THE SYSTEM SHALL let Super-Admins and that folder's own read-write members run SQL on it, from a SQL tab on its page, and nobody else. On a data source not switched on, it SHALL let nobody run SQL, and the tab SHALL show those same people a panel saying the runner is off, with Turn on… for a Super-Admin (`[R50-1, R50-14]`; the off panel, design 15's P1, `[R51]`).
      Fails when: a member who sees the data source only as an ancestor's, a read-only member or a user of another folder can run SQL on it, by the tab or by the API, or sees the tab; anyone can run SQL on one not switched on; an allowed user finds no SQL tab; or the tab is shown greyed out instead of with the off panel.
- [x] AC-374 WHEN a Super-Admin switches the runner on for a data source or for Cube Store, THE SYSTEM SHALL first ask them to confirm that its credential is read-only, or, for Cube Store, that everyone allowed may read every folder's rollups with only wechart's check as guard; record who confirmed it and when; and record the switch on, and off, in the audit trail. Every data source, and Cube Store, SHALL start with the runner off, and an approved change to how a data source signs in (its user, host, database or a secret; the database, Claude's call from T531's review, since grants are per database) SHALL turn it off until confirmed again (`[R50-1, R50-2]`; the confirmation, Claude's call; Cube Store's (Q9), the audit (P4) and a changed login (Q4), `[R51]`).
      Fails when: the runner is on without that confirmation; the record lacks who or when; anyone but a Super-Admin can switch it; a data source starts with it on; switching on or off leaves no audit event; or it stays on after an approved change of user, host or secret.
- [x] AC-375 IF the SQL is anything but one `SELECT` (with `WITH … SELECT` and set operations) or one `EXPLAIN` without `ANALYZE`, THEN THE SYSTEM SHALL refuse it before anything reaches the database, saying it runs only SELECT and EXPLAIN (`[R50-2, R50-4]`).
      Fails when: an INSERT, UPDATE, DELETE, MERGE, CREATE TABLE or VIEW, `SELECT … INTO`, `SELECT … FOR UPDATE`, a `WITH` holding a write, `EXPLAIN ANALYZE`, or two statements in one run reaches the database; or the refusal doesn't say why.
- [x] AC-376 WHILE a run is on a PostgreSQL, Redshift, MySQL or Oracle data source, THE SYSTEM SHALL run it in a read-only transaction, so that a SELECT calling a function that writes fails and changes nothing (`[R50-2]`).
      Fails when: on the development PostgreSQL, a run of `SELECT nextval('<a sequence>')` advances that sequence.
- [x] AC-377 WHEN a run's result has more than 10,000 rows, or more than 10 MB, THE SYSTEM SHALL show only the first 10,000 rows, or as many as fit in 10 MB, and say which limit it reached (`[R50-7, R50-10]`).
      Fails when: more than 10,000 rows, or more than 10 MB, come back; or a cut result doesn't say it was cut and at which limit.
- [ ] AC-378 IF a run hasn't finished after 30 seconds, THEN THE SYSTEM SHALL stop it on the database and say it was stopped at 30 seconds, showing any rows that arrived before, marked as cut (`[R50-8]`; the rows, design 15's Q6, `[R51]`).
      Fails when: a statement of the run is still running on the database after the run is said to have stopped; no run is stopped at 30 seconds; or rows that arrived are dropped, or shown without saying they were cut.
- [ ] AC-379 WHILE a user has a run going, THE SYSTEM SHALL refuse them a second run, and offer Cancel, which stops the first on the database, showing any rows that arrived, marked as cut (`[R50-9]`; cancel, Claude's call; the rows, Q6, `[R51]`).
      Fails when: one user has two runs going at once; or after Cancel, its statement is still running on the database.
- [x] AC-380 WHEN a run finishes, THE SYSTEM SHALL show its rows in a grid headed by each column's name and its type as the database names it, with the row count and the time it took, and offer them as a CSV holding exactly those rows, with no second run (`[R50-11]`; the types, design 15's Q5, `[R51]`).
      Fails when: a column's type, the row count or the duration is missing; the CSV's rows differ from the grid's; or the CSV runs the SQL again.
- [x] AC-381 THE SYSTEM SHALL list a user's own past runs to them alone, each with its SQL, data source, time, outcome and row count, kept as long as audit records are: on a data source's page its own runs by default, or all of them, newest first, 50 at a time (`[R50-12]`; the retention, Claude's call; the list, design 15's Q2, `[R51]`).
      Fails when: a user's list shows another's run, or leaves out one of theirs within the audit retention; or the page's list starts on other data sources' runs.
- [x] AC-382 WHEN a user runs SQL, THE SYSTEM SHALL record an audit event of it with who, which data source and its folder, when, the outcome, the row count, the duration, and the SQL with every literal replaced (`[R50-13]`, with AC-294).
      Fails when: one of those is missing from the event, or the event holds a literal of the SQL, such as a value in its WHERE clause.
- [x] AC-383 WHEN the owner of a data source in My workspace, a copy or one made there, opens it, THE SYSTEM SHALL let them run SQL on it with no switch, and nobody else; except that a copy whose database, user or role differs from its original's SHALL need a Super-Admin's switch, as a shared data source does (`[R50-6]`; a repointed copy, design 15's Q8, `[R51]`).
      Fails when: its owner can't run SQL on an unchanged copy or one made new; another user can; or a copy pointed at another database, user or role runs SQL with no switch.
- [x] AC-384 WHERE a Super-Admin has switched the runner on for Cube Store, THE SYSTEM SHALL list Cube Store among the root's data sources, to Super-Admins and to those who may run SQL on a data source in a folder a Super-Admin switched on (a data source in My workspace doesn't count), and let them run only read-only SQL on it: SELECT and EXPLAIN. While it is off, a Super-Admin SHALL find Turn on… for it in the Data sources page's header ⋯ (`[R50-3, R50-5]`; who, design 15's Q7, and the switch, P5, `[R51]` (`[R50-3, R50-5]`; where it is listed, Claude's call; ~~SHOW, DESCRIBE~~ dropped 2026-10-01: Cube Store 1.7.45 has no SHOW TABLES or DESCRIBE, and its other SHOW statements return every row uncapped, xcube's answer `to-wechart/2026-10-01-1200-sql-runner-built.md`).
      Fails when: another user sees Cube Store listed or runs SQL on it; it runs any other command; or it is listed while switched off.
- [x] AC-385 THE SYSTEM SHALL say on the SQL tab, always above the editor and with no way to hide it, that the SQL runs on the database directly, past folder permissions and access policies (`[R50]`, research §5 S3; its place, design 15's Q3, `[R51]`).
      Fails when: the tab shows no such sentence, or it can be hidden.
- [ ] AC-386 WHILE the SQL tab is open, THE SYSTEM SHALL show beside the editor the data source's schemas, tables and columns with their types, as xcube's introspection lists them, and put a name chosen there into the editor (`[R51]`, design 15's P3).
      Fails when: a table or column the data source has is missing from the browser, or choosing one doesn't put its name in the editor.
- [x] AC-387 WHEN text is selected in the SQL editor, THE SYSTEM SHALL run only the selection, with Run reading "Run selection", from Run and from ⌘/Ctrl+Enter; with none selected, the whole text (`[R51]`, design 15's Q1).
      Fails when: a run with text selected runs anything but the selection, or Run doesn't say so.

## Non-goals (phase 1)

Copied from [requirements.md §7](./requirements.md):

- Users, groups, roles and SSO — phase 2. Group membership will come from the identity provider.
- AI and chat authoring.
- Scheduled delivery of dashboards, and alerts.
- Embedding wechart in other applications.
- Maps and geo charts.
- Automated `.dxp` migration. A `.dxp` inspection tool is planned for after phase 1.
- Spotfire Subsets, Tags and Lists, and data functions. The design must not rule them out later.
- Touch and tablet support.
- Spotfire-style controls inside text tiles.
- Cube's SQL API, and connecting external BI tools to it.
- Dynamic models: Jinja, Python and JavaScript generation. Such files are read-only (AC-140).
- Model import from a dbt manifest or from LookML.
- Multi-tenancy: per-tenant models and orchestrators.
- Advanced pre-aggregation types: `rollup_join`, `rollup_lambda`, `original_sql`, ksqlDB streaming.
- Cube Store internals: partition and chunk tables, `EXPLAIN ANALYZE`, cache clearing.
- Configuration, topology and environment-variable screens.
- Real-time subscriptions and auto-refreshing tiles.
- Selling, distributing or open-sourcing wechart.

## Non-goals (phase 2)

Copied from [requirements.md §P2.7](./requirements.md):

- Individual users on folders: folders take AD groups only.
- User attributes in Cube's security context: groups only, for now.
- Notices outside the app, such as email or chat.
- Testing more than one identity provider during development. Entra ID and brokers are checked once, at the end of phase 2 (AC-258).
- ~~Sharding the model: designed for 100–200 model-bearing folders; sharding is a later add-on `[AD 9]`.~~ Superseded 2026-09-26 `[IP 4]`: modules split the compile, and nothing further is planned for scale.
- Cube Store beyond one node `[AD 11]`.
- Anything but wechart's server calling Cube or xcube, for now `[AD 10]`.
- xcube's slice 7, and aliasing a file-set model's JavaScript, Jinja and Python cubes when their data source's target changes `[R39]`.
- Around the SQL runner `[R50]`:
  - a separate read-only login per data source (phase 3);
  - Cube's semantic SQL API;
  - saved or shared queries;
  - templating;
  - a cube or chart made from a run's results.

Phase 1's non-goals still stand, except these, which phase 2 brings in:
- users, groups, roles and SSO (F25–F26);
- maps, as the country map (AC-305);
- read-only SQL on Cube Store, the SQL runner's only reach into Cube Store's internals (AC-384).

~~Per-folder models (F28)~~ Folder-prefixed names in one flat model (F28) aren't multi-tenancy in phase 1's sense: they're one organisation's folders, not per-tenant deployments. That non-goal stands.

## Traceability

The criteria phase 1 moved to its backlog on 2026-09-25 are back in this spec under their own IDs (`[R16]`): AC-047 … AC-052, AC-093, AC-097, AC-104, AC-116, AC-145, AC-150, AC-151, AC-153 … AC-155, AC-157 … AC-161, AC-163, AC-164, AC-176, AC-180, AC-187, AC-201, AC-220, AC-234 and AC-246. Phase 2's own requirements are traced in the second table.

| Requirement                                                                                   | Acceptance criteria                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Problem: replace Spotfire, browser-based, no installed client `[R1]`                          | AC-001 … AC-006, AC-180                                               |
| Problem: data need not be loaded into the tool; live queries with acceleration `[R1]`, `[R4]` | AC-007 … AC-013, AC-142 … AC-148                                      |
| Users: analyst without SQL `[R2]`                                                             | AC-025 … AC-036, AC-047 … AC-052, AC-182, AC-183                      |
| Users: business consumer `[R2]`                                                               | AC-017 … AC-019, AC-084 … AC-106, AC-121 … AC-125, AC-171 … AC-173    |
| Users: semantic-layer engineer `[R2]`                                                         | AC-131 … AC-141, AC-142 … AC-148, AC-157 … AC-164                     |
| Users: platform operator `[R2]`                                                               | AC-149 … AC-156, AC-157 … AC-170                                      |
| M1: 50 analyses rebuilt and accepted `[R3]`                                                   | AC-037, AC-084 … AC-116 (Spotfire parity behaviours), AC-053 … AC-068, AC-184 … AC-186 |
| M2: 80% self-service authoring `[R3]`                                                         | AC-025 … AC-036, AC-047 … AC-052, AC-053 … AC-068, AC-182 … AC-186    |
| M3: p95 under 3 s for 10 charts `[R3]`                                                        | AC-174, AC-175, AC-104, AC-105                                        |
| M4: Spotfire parity checklist `[R3]`                                                          | AC-084 … AC-116                                                       |
| Constraint: wechart service owns Cube credentials `[R5]`                                      | AC-007, AC-008, AC-164                                                |
| Constraint: persistence survives restart `[R5]`                                               | AC-014, AC-015, AC-181                                                |
| Constraint: four database families `[R4]`                                                     | AC-160                                                                |
| Constraint: volumes vary; acceleration must be visible `[R4]`                                 | AC-013, AC-144, AC-147                                                |
| Constraint: single user, no login `[R4]`                                                      | AC-008, AC-165 … AC-170                                               |
| Constraint: desktop browsers only `[R7]`                                                      | AC-179, AC-180                                                        |
| Design direction accepted `[R7]`                                                              | AC-004, AC-005, AC-054, AC-096 … AC-099, AC-176 … AC-178, AC-187, AC-188 |
| Scope: Explore folders, no Dashboards nav `[docs/inputs §8]`                                  | AC-001, AC-017 … AC-024                                               |
| Scope: dashboard authoring `[docs/inputs §8, §9]`                                             | AC-053 … AC-068                                                       |
| Scope: markings, four per dashboard, 1,000 items `[docs/inputs §10–13]`, `[R7]`               | AC-084 … AC-116                                                       |
| Scope: range-based marking and bookmarks `[R7]`                                               | AC-093, AC-121 … AC-125                                               |
| Scope: interaction mode per dashboard `[docs/inputs §12]`                                     | AC-069 … AC-075, AC-117 … AC-120                                      |
| Scope: chart ownership, local and library `[docs/inputs §9]`                                  | AC-126 … AC-130                                                       |
| Scope: text tiles with live tokens `[R7]`                                                     | AC-058, AC-116                                                        |
| Scope: quick calculations plus request flow `[R7]`                                            | AC-047 … AC-052                                                       |
| Scope: model authoring with form and code `[docs/inputs §4b]`                                 | AC-131 … AC-141                                                       |
| Scope: generate cubes from database tables `[R7, R10]`                                        | AC-139, AC-249, AC-250                                                |
| Scope: pre-aggregations `[docs/inputs §1]`                                                    | AC-142 … AC-148, AC-189                                               |
| Scope: jobs, builds, schedules, run history `[docs/inputs §1, §7]`                            | AC-149 … AC-156, AC-234                                               |
| Scope: data sources with testing `[docs/inputs §1, §7]`                                       | AC-157 … AC-164                                                       |
| Scope: security policies and context preview `[docs/inputs §1, §7]`                           | AC-165 … AC-170                                                       |
| Scope: export `[R6]`                                                                          | AC-171 … AC-173                                                       |
| Scope: filters `[docs/inputs §2]`                                                             | AC-076 … AC-083                                                       |
| Scope: chart rendering and customisation `[docs/inputs §2]`                                   | AC-037 … AC-046                                                       |
| Scope: following the prototype's structure, "My workspace", global search scope `[R7, R9]`   | AC-187, AC-190 … AC-233                                               |
| Scope: a rollup Cube can't join is refused at publish (the user, 2026-09-25)                  | AC-235                                                                |
| Scope: the chart tile's menu, DSH-08 (the user, 2026-09-25)                                   | AC-199, AC-236 … AC-247                                               |
| Constraint: self-hosted Kubernetes; docker-desktop for e2e `[R4]`                             | AC-248                                                                |

**Phase 2** ([requirements.md](./requirements.md) Part 2)

| Requirement | Acceptance criteria |
|---|---|
| §P2.2 Sign-in for everyone when security is on `[R11]` | AC-251, AC-252, AC-253 |
| §P2.4 A sign-in lasts 12 hours `[R24]` | AC-316 |
| §P2.4 Requests from another site change nothing `[R25]` | AC-317 |
| §P2.4 Security off is single-user mode, with phase 2's flows `[P2 input, R19]` | AC-254 |
| §P2.2 Users in hundreds of groups; the test uses 20 `[R12, R19]` | AC-255 |
| §P2.2 The Super-Admin group, named in the deployment's configuration `[R18]` | AC-256, AC-265 |
| §P2.2 No Super-Admin group, no start `[R26]` | AC-318 |
| §P2.4 Any OIDC provider; the development provider; Entra ID or a broker at phase end `[R14, R15]` | AC-252, AC-257, AC-258 |
| §P2.2 Read-only and read-write groups per folder, inherited when unset, groups only `[P2 input, R11]` | AC-259, AC-260 |
| §P2.2 A grant reaches down to every descendant `[P2 input, R12]` | AC-261 |
| §P2.2 Visibility up the path; read-only users see dashboards only `[R12, R19]` | AC-262, AC-263 |
| §P2.2 No access means nothing shown `[P2 input]` | AC-264 |
| §P2.2 Roles: Super-Admin, Admin, User `[P2 input, R12]` | AC-001, AC-259, AC-265, AC-266, AC-277 |
| §P2.4 Phase 1's content, when security is first turned on `[R17]` | AC-267 |
| §P2.3 S1 Zero access leaks `[R13]` | AC-268, AC-264, AC-276 |
| §P2.6 C Folders hold models and data sources; no Model tab; a Data sources list `[P2 input, R19]` | AC-001, AC-131, AC-157, AC-192, AC-194, AC-222, AC-233, AC-269 |
| §P2.6 D Names unique per folder `[P2 input]` | AC-249, AC-270, AC-271 |
| §P2.6 D Names bound at publish from the item's own folder; ~~rebinding~~ no rebinding, and deletes and renames of referenced names refused; path-only; root `default` `[P2 input, R17, R19, R22, AD 3, AD 5, R27; IP 3, plan, R28]` (`[R20]` superseded; AC-309 retired) | AC-272, AC-273, AC-274, AC-275, AC-310, AC-329 |
| §P2.4, §P2.6 D One flat model, `<folderId>__<shortName>` for every folder but the root, ~~root unprefixed~~ ~~the root included~~ the root bare `[X3, user]`, short `sql_alias`es on folder items; ~~references migrated~~ nothing stored migrated; stored, never-reused folder ids `[AD 2, R27; IP 3, plan, R28; X3, X3A, R30]` | AC-274, AC-328, AC-336 (AC-331 retired) |
| §P2.4 Cube enforces folder access, ~~through generated policies~~ with a per-request folder check in xcube alongside the model's own policies `[AD 4, AD 5, R27; IP 6, R28]` | AC-320, AC-263 |
| §P2.4 ~~Whole-model check~~ Every affected module checked on every publish, with the refusal's wording `[AD 6, R27; IP 4, IP 5, plan]` | AC-321, AC-322, AC-275, AC-288, AC-291 |
| §P2.4 Only YAML models are published `[R28]` | AC-332, AC-140 |
| §P2.4 Workspace and proposal content as xcube overlays `[AD 8, R27; IP 7]` | AC-323, AC-281 |
| §P2.4 ~~Cube and xcube own the model and connections~~ wechart is the system of record, and xcube keeps a derived copy, rebuilt from a snapshot; nobody but wechart's server calls them; Cube never calls wechart `[AD 1, AD 10; IP 1, IP 2, plan]` | AC-327, AC-330, AC-251 |
| §P2.4 HA query path: 2+ Cube instances, 2+ stateless API replicas `[AD 11, R27; IP 9, plan]` | AC-319, AC-161 |
| §P2.4 Slice 2 as built: the model id and whole-set pushes, the dry-run check refusing every break, only YAML served, tokens naming model and revision, the store removed, the static admin token until slice 4 `[X2, R29]` | AC-333, AC-334, AC-335, AC-235, AC-326, AC-327 |
| §P2.4 Slice 3 as built: the move to items mode, one cube or view per file, the folder tree without workspaces until slice 5, changesets and the dry run on proposals, the items-hash reconcile, binding through xcube's resolver and the source cube's bindings, deletes checked, titles only, `/v1/meta` as the field list, the published image, the way back by re-import `[X3, X3A, R30]` | AC-336, AC-337, AC-328, AC-333, AC-272, AC-275, AC-321, AC-329, AC-009, AC-136, AC-137 |
| §P2.4 RS256 tokens carrying ~~groups only~~ the groups some policy names, and no subject; keys pushed to xcube; a service credential `[AD 12, R27; IP 8, R28]` | AC-326, AC-008, AC-166, AC-250 |
| §P2.4 Slices 4–6 as built: the folder gate with allowed groups and the security flag; RS256 for every query token, key push and rotation, the service credential; overlays named in the token, with the workspace's data sources, what lands being what was previewed; eight drivers; connections landed and health within the hour; no change of type; binding at publish with no rebinding; the seeding Job; the TLS target; the key-id check; only copies replace; saves refused while xcube is unreachable; the image `ed08180c37` `[X4, X5, X6, XD, XOV, R31]` | AC-320, AC-263, AC-326, AC-333, AC-321, AC-323, AC-160, AC-159, AC-161, AC-273, AC-310, AC-312, AC-324, AC-280, AC-282, AC-272 |
| §P2.6 E Workspaces: private, copy in, resolution, target folders `[P2 input, R12, R17, R18]` | AC-276 … AC-283 |
| §P2.6 E Proposals, approval, rejection, history, direct actions `[R12, R17, R18]`; a submitted item frozen, a deleted target folder recreated at approval `[R52]`; the review's collapsible panels, drawn as design 05 `[R54]` | AC-284 … AC-291, AC-388 … AC-390 |
| §P2.6 F Personal bookmarks, shareable `[R12]` | AC-292, AC-293 |
| §P2.4 Groups in Cube's security context `[R14, AD 12]` | AC-008, AC-326 |
| §P2.4 Audit trail and its retention `[R14, R18]` | AC-294, AC-295, AC-296 |
| §P2.2 Jobs and Schedules for a folder's read-write members `[R18]` | AC-297 |
| §P2.4 Credentials encrypted in the metadata database, to xcube's public key, in the browser; key checks at start `[R14, R15, R21, AD 7, R27]` (AC-311 retired); a stored key kept unless replaced, with a warning `[R42]` | AC-298, AC-164, AC-280, AC-312, AC-324, AC-325, AC-353 |
| §P2.6 G Data sources: all of F18, per folder `[R16]` | AC-157 … AC-161, AC-163, AC-164 |
| §P2.6 H Quick calculations (F6) `[R16]` | AC-047 … AC-052 |
| §P2.6 H Scheduling and build history (F17) `[R16]` | AC-145, AC-150, AC-151, AC-153 … AC-155, AC-234 |
| §P2.6 H Markings refinements and keyboard gaps `[R16]` | AC-093, AC-097, AC-104, AC-116, AC-176 |
| §P2.6 H Country map and box plot `[R8, R19, R21, R22]` | AC-305, AC-306, AC-313, AC-314, AC-315 |
| §P2.6 H The UI review's eight spec changes `[R16]` | AC-041, AC-220, AC-299 … AC-304 |
| §P2.6 H UI fixes: style conformance, AC-201/220/246, Edge `[R16]` | AC-187, AC-201, AC-220, AC-246, AC-180 |
| §P2.3 S2 Speed holds with security on `[R13]` | AC-307 |
| §P2.3 S3 Phase 1 intact with security off, at phase end `[R13, R19]` | AC-308 |
| The 2026-09-27 UI reviews: phase 2's ten designs approved, with their proposals `[R33]` | AC-338 … AC-343 |
| The Model workspace and Generate cubes to design 03, 11 and 12, as a priority `[R34]` | AC-344 |
| The model editor's YAML and join diagram popped out into a larger dialog `[R58]` | AC-420 |
| Designs 11 and 12's proposals, approved `[R36]` | AC-345 … AC-351 |
| Both UI reviews' designs, the 2026-09-27 ones first where they differ, as a priority `[R37]` | AC-343, AC-344, AC-352 |
| Exporting and importing a dashboard, with its chosen dependencies and no secrets `[R43]`; an import always into My workspace, with warnings `[R44]`; design 13's answers `[R46]` | AC-354 … AC-361 |
| §P2.6 I Deleting only what nothing depends on, only empty folders, clearing My workspace, a project folder per edit with a description, Explore filtered by kind `[R48]`; design 14's answers, a dashboard's library charts on its own path `[R49]` | AC-362 … AC-372 |
| §P2.6 J The SQL runner: who, the switch and its confirmation, SELECT and EXPLAIN only, the read-only transaction, the caps, one run per user, results and CSV, history, audit, workspace data sources, Cube Store, the warning `[R50]`; design 15 and its answers `[R51]` | AC-373 … AC-387 |
| Design 16, Jobs and Schedules, approved as drawn: partitions and each row's state, Run history, the queue and Cancel, wechart's schedules and their suspension, both kinds of schedule running, the refresh worker's status, the audit events, the Folder column and filter; its proposals P1–P5 and its drawn defaults Q1–Q12 `[R56]`; the refresh worker's own history still deferred `[R41]` | AC-145, AC-150, AC-151, AC-153 … AC-155, AC-234, AC-294, AC-297, AC-391 … AC-399 |
