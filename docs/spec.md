# wechart specification (phase 1)

## Overview

wechart is a browser BI tool on the Cube semantic layer, built to replace Spotfire for one organisation: analysts build charts and dashboards, mark data and drill into details without writing SQL, while semantic-layer engineers and platform operators run the Cube model, its pre-aggregations, jobs and connections from the same application. This spec covers phase 1 and traces to [docs/requirements.md](./requirements.md); design rules it cites by number live in [docs/design/direction.md](./design/direction.md).

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
| **Security context**         | The claims wechart sends with a query; Cube uses them for row-level policies and masking.                                                                                          |
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

---

## F1. Application shell and navigation

Purpose: one workbench for authoring and administration, addressable by URL.
Traces to: `[R2]`, `[docs/inputs §8]`, direction.md §2.

- [x] AC-001 WHEN the application loads, THE SYSTEM SHALL show a top bar whose workspace switcher lists exactly Explore, Model, Data sources, Jobs, Schedules and Security.
      Fails when: the switcher shows a "Dashboards" entry, or any of the six entries is absent.
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
- [x] AC-008 WHEN wechart queries Cube, THE SYSTEM SHALL attach the configured phase-1 security context to every request.
      Fails when: a request reaches Cube without the configured security context.
- [x] AC-009 WHEN Cube reports a new `schemaVersion`, THE SYSTEM SHALL serve metadata from the new model within 60 seconds without a restart.
      Fails when: 60 seconds after the change, a metadata request still returns members from the previous model.
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
- [x] AC-023 WHEN the user deletes a library chart that dashboards use, THE SYSTEM SHALL name those dashboards and require confirmation before deleting.
      Fails when: the chart is deleted without naming the dashboards that use it.
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
- [x] AC-041 WHEN a categorical chart exceeds its top-N setting, THE SYSTEM SHALL aggregate the remainder into a single "Other (n)" item and label it with the number of members it covers.
      Fails when: the chart renders more categories than the setting, or the remainder is unlabelled.
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

> **Moved to phase 2** (the user's decision, 2026-09-25): AC-047, AC-048, AC-049, AC-050, AC-051 and AC-052, word for word in `docs/phase-2/backlog.md` §1.

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
> **Moved to phase 2** (2026-09-25): AC-093, in `docs/phase-2/backlog.md` §1.
- [x] AC-094 WHEN the user clicks an empty plot area, or presses Escape on a focused tile, THE SYSTEM SHALL unmark that tile's marking and leave other markings unchanged.
      Fails when: another marking is cleared, or the marking survives.
- [x] AC-095 WHEN a marking changes, THE SYSTEM SHALL update every tile that uses it or is limited by it, on every page tab of the dashboard (direction.md rule 48).
      Fails when: a tile on another page tab still shows the previous marking state when opened.
- [x] AC-096 WHEN a tile shows a marking, THE SYSTEM SHALL draw marked items in their own colour with an outline in the marking's colour and fade unmarked items (direction.md rule 49).
      Fails when: unmarked items render at full strength, or marked items carry no outline.
> **Moved to phase 2** (2026-09-25): AC-097, in `docs/phase-2/backlog.md` §1.
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
> **Moved to phase 2** (2026-09-25): AC-104, in `docs/phase-2/backlog.md` §1.
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
> **Moved to phase 2** (2026-09-25): AC-116, in `docs/phase-2/backlog.md` §1.

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

- [x] AC-131 WHEN the user opens the Model workspace, THE SYSTEM SHALL list the model files and show the cubes, views, measures, dimensions, segments, hierarchies, joins and pre-aggregations each file defines.
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
- [x] AC-137 WHEN a valid model is published, THE SYSTEM SHALL make the new members available to the chart builder without restarting Cube.
      Fails when: a published member is missing from the field list while Cube reports the new schema version.
- [x] AC-138 WHEN the user opens the join editor for a cube, THE SYSTEM SHALL show the join graph with each relationship's direction and let the user add a join by choosing the target cube, the relationship and the condition.
      Fails when: the diagram omits a declared join, or shows a direction the model does not declare.
- [x] AC-139 WHEN the user generates cubes from a data source, THE SYSTEM SHALL browse that connection's schemas and tables and create a cube per selected table with its columns mapped to dimensions and a count measure (`[R7]`).
      Fails when: a selected table produces no cube, or a column is dropped without saying so.
      > Deferred 2026-09-21 with F18, at the user's direction ("for requirements that dont work with cube defer"). Browsing a connection's tables is Cube's drivers called from wechart's server, not a Cube API (`research/cube-capabilities.md` §6).
      > **Un-deferred 2026-09-25 `[R10]`.** Browsing and generating go through the data-source introspection API in the user's Cube fork (`research/cube/introspection-api.md`). The generated YAML is shown with the columns Cube left unmapped and each one's reason, saved to wechart's model store, and published as any model change is (AC-136, AC-137).
- [x] AC-249 IF a cube generated from a data source has the name or file name of a cube or file already in the model store, THEN THE SYSTEM SHALL refuse to save it, name the existing cube or file, and leave the existing one unchanged (`[R10]`).
      Fails when: an existing model file changes, or a clashing cube is saved, or the refusal does not name what it clashes with.
- [x] AC-250 THE SYSTEM SHALL grant Cube's `introspection` scope only to the short-lived tokens its API signs to browse a data source and generate cubes, never to a draft's token or to any other request's token, and never to the browser (`[R10]`).
      Fails when: a token signed for a query, a publish or a draft is granted `introspection`, or a response to the browser carries a token that has it.
- [x] AC-140 WHEN a model file uses Jinja, Python or JavaScript generation, THE SYSTEM SHALL open it read-only in the code view and say why it cannot be edited as a form.
      Fails when: such a file opens in an editable form, or gives no reason.
- [x] AC-141 WHEN the user edits a member that charts use, THE SYSTEM SHALL list the charts and dashboards that reference it before saving.
      Fails when: a referencing chart is missing from that list.

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
> **Moved to phase 2** (2026-09-25): AC-145, in `docs/phase-2/backlog.md` §1.
- [x] AC-146 WHEN the user defines an index on a rollup, THE SYSTEM SHALL let the columns be ordered and mark aggregate indexes as such.
      Fails when: the column order cannot be changed, or an aggregate index is written as a regular one.
- [x] AC-147 IF a query would fail under rollup-only mode, THEN THE SYSTEM SHALL warn on the chart that it depends on the source database.
      Fails when: such a chart shows no warning.
- [x] AC-148 WHEN the user asks to refresh a chart's data, THE SYSTEM SHALL re-query Cube bypassing wechart's cached result and show the new data-as-of time; and WHEN a pre-aggregation serves the chart, THE SYSTEM SHALL say that its data is as of that pre-aggregation's last build, and name the Jobs workspace as where to rebuild it.
      Fails when: a chart the database serves shows its previous result again with an unchanged timestamp after a refresh; or a refreshed chart a pre-aggregation serves shows no message naming that pre-aggregation, saying its data is as of the last build, and linking to the Jobs workspace.
      > Reworded 2026-09-22 at the user's decision: Cube answers a refresh of a rollup-served chart from the rollup as last built, so its data-as-of time need not move (research/cube/refresh-jobs-caching.md). The refresh says so rather than rebuilding it.
- [x] AC-235 WHEN the user publishes a model change in which a rollup names members of cubes Cube cannot join, THE SYSTEM SHALL refuse the publish, name the rollup and its file, and give Cube's reason.
      Fails when: such a change is published, or the refusal names no rollup or gives no reason.
      > Added 2026-09-25 at the user's direction: "if it is not possible to rollup.. then refuse providing reason why it cannot be done". Cube compiles such a rollup, then its refresh worker aborts its run for the whole model at it, so no scheduled refresh in that model happens (research/cube/refresh-key-schedule.md; seen in T159). How Cube decides a rollup can be joined is in research/cube/rollup-join-paths.md.

## F17. Jobs, builds and scheduling

Purpose: run and watch pre-aggregation builds, since Cube Core keeps only 24 hours of job records.
Traces to: `[docs/inputs §7]`, direction.md §7c, rules 22, 34; `[research/cube/refresh-jobs-caching.md]`.

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
> **AC-151 deferred too, 2026-09-21, at the user's direction.** Cube's
> documented jobs API starts builds and reports on tokens, but it can't list the
> queue or cancel an entry. Only the undocumented `/cubejs-system/*` routes and
> Cube Store's MySQL interface can, and the user deferred both (see F16's
> status note, AC-145).

- [x] AC-149 WHEN the user starts a build for a pre-aggregation, THE SYSTEM SHALL submit it to Cube, show the job token, and poll until the job reports done, missing partition, failure or not found.
      Fails when: the job's terminal state is never shown, or the token is absent.
> **Moved to phase 2** (2026-09-25): AC-150 and AC-151, in `docs/phase-2/backlog.md` §1.

- [x] AC-152 THE SYSTEM SHALL show every job and schedule with an icon and a text label for its state, never colour alone (direction.md rule 22).
      Fails when: a state is conveyed only by colour.
> **Moved to phase 2** (2026-09-25): AC-153, AC-154, AC-155 and AC-234, in `docs/phase-2/backlog.md` §1.

- [x] AC-156 THE SYSTEM SHALL show the refresh worker's state and the Cube deployment's health, and mark the deployment as down when Cube's health endpoint does not report healthy.
      Fails when: the indicator stays healthy while Cube reports otherwise.

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

> **Moved to phase 2** (2026-09-25): AC-157, AC-158, AC-159, AC-160, AC-161, AC-163 and AC-164, in `docs/phase-2/backlog.md` §1.

- [x] AC-162 WHEN the user assigns a cube to a data source, THE SYSTEM SHALL write `data_source` into that cube's model file.
      Fails when: the assignment is stored only in wechart and not in the model.

## F19. Security: policies and context preview

Purpose: see what Cube's access policies do, and preview a dashboard as a security context. Users and groups are phase 2.
Traces to: `[R4]`, `[docs/inputs §7]`, direction.md §7c, rule 21; `[research/cube/access-control.md]`.

- [x] AC-165 THE SYSTEM SHALL list every access policy in the model with its role, member-level rules, row-level filters, conditions and masking, as declared.
      Fails when: a declared policy or rule is missing from the listing.
- [x] AC-166 WHEN the user edits a security context and previews a dashboard, THE SYSTEM SHALL run that dashboard's queries with the edited context and show a persistent banner naming the context in effect (direction.md rule 21).
      Fails when: the queries use the default context, or no banner is shown.
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
> **Moved to phase 2** (2026-09-25): AC-176, in `docs/phase-2/backlog.md` §1.
- [x] AC-177 THE SYSTEM SHALL pair every status, validation and job state with an icon and a text label (direction.md rule 3).
      Fails when: any state is conveyed by colour alone.
- [x] AC-178 THE SYSTEM SHALL provide a table view of every chart's data, reachable from the tile (direction.md rule 5).
      Fails when: a chart type offers no table view.
- [x] AC-179 THE SYSTEM SHALL render dashboards, the chart editor and the model editor without horizontal scrolling at a viewport width of 1,280 pixels.
      Fails when: any of those surfaces scrolls horizontally at that width.
> **Moved to phase 2** (2026-09-25): AC-180, in `docs/phase-2/backlog.md` §1, with
> its 2026-09-22 status: deferred at the user's direction, as Edge needs the
> `msedge` channel (its install asks for the machine's password) or a CI run.
- [x] AC-188 THE SYSTEM SHALL write a time dimension's values by their granularity — a year as "2026", a quarter as "Q1 2026", a month as "Jan 2026", a week as "Week of Jan 5, 2026", a day as "Jan 2, 2026", and an hour or finer with the time — in axes, labels, tooltips and tables, unless the member's model format says otherwise.
      Fails when: a time value shows as a raw timestamp such as "2026-01-02T00:00:00.000".
> **Moved to phase 2** (2026-09-25): AC-187, in `docs/phase-2/backlog.md` §1, with the 2026-09-25 re-critiques' measured differences.

## F22. Following the design prototype's structure

Purpose: the prototype's structure, layout and interaction, which the user accepted, on every surface — not only its component styles, which AC-187 covers.
Traces to: `[R7]`, `[R9]`; the critiques in `docs/design/critiques/2026-09-24-*.md`, which measured each gap against `docs/design/prototype/`.

Application shell and search:

- [x] AC-190 THE SYSTEM SHALL show at the right of the top bar a search field that names the platform's shortcut (⌘K or Ctrl+K) and opens the search palette when clicked, and an identity avatar at the far right.
      Fails when: the top bar offers no visible way to open search, or the avatar is missing.
- [x] AC-191 WHEN the user types in the search palette, THE SYSTEM SHALL list the matching dashboards, library charts, Cube fields and model files, each with its type, move the active result with the arrow keys, open it with Enter, and return focus to where it was when the palette closes (`[R9]`).
      Fails when: a matching field or model file is missing, a result has no type, the arrow keys do not move the active result, or focus is not returned on close.

Explore:

- [x] AC-192 WHEN the user opens a folder in Explore, THE SYSTEM SHALL show a breadcrumb of its ancestors, the folder's name as the page heading with Rename beside it, the Explore search box, and a single "New" menu offering Dashboard, Chart and Folder.
      Fails when: the folder's name is not the page heading, a breadcrumb ancestor does not open that folder, or creating is offered other than through the New menu.
- [x] AC-193 THE SYSTEM SHALL list a folder's contents under the columns Name, Type, Built on, Updated and Owner — subfolders first, then dashboards, then charts — showing a dashboard's description beneath its name and its number of page tabs, a chart's chart type and the cube or view it is built on, and a subfolder's item count, and SHALL offer rename and move through a menu on each row.
      Fails when: a column is missing, a chart's type reads only "Chart", a row shows a rename or move control before its menu is opened, or a move offers the item's own folder or, for a folder, itself or a folder inside it.
- [x] AC-194 THE SYSTEM SHALL show the folder tree as a full-height pane headed "Folders" with a "+ Folder" action, holding a shared root and a personal "My workspace" root, each folder showing the number of items it holds including those in its subfolders (`[R9]`).
      Fails when: "My workspace" is missing, a count leaves out items in subfolders, or the tree scrolls away with the contents.
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
> **Moved to phase 2** (2026-09-25): AC-201, in `docs/phase-2/backlog.md` §1. It shipped; the 2026-09-25 re-critique measured a marked KPI tile whose title is squeezed to nothing.
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
> **Moved to phase 2** (2026-09-25): AC-220, in `docs/phase-2/backlog.md` §1. It shipped; the 2026-09-25 re-critique found the Acceleration tab naming `orders.count`.
- [x] AC-221 WHEN a pie or donut is drawn, THE SYSTEM SHALL list every slice in its legend.
      Fails when: a slice has no legend entry.

Model workspace:

- [x] AC-222 WHILE the Model workspace is open, THE SYSTEM SHALL show a tree of the model's files beside the editor, open the chosen file in place with its path in the URL, offer New cube and New view from the tree, and mark each file that has problems.
      Fails when: moving to another file requires leaving the editor, New cube or New view is missing, or a file with an error carries no mark in the tree.
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

Jobs, Security, Schedules and Data sources:

- [x] AC-228 THE SYSTEM SHALL lay out Jobs and Security as a list beside a full-height inspector pane, and WHEN the user selects a pre-aggregation in Jobs, THE SYSTEM SHALL show in that pane its state, its trigger, a Build action and a way to open it in Model.
      Fails when: selecting a pre-aggregation shows nothing, or the pane is not full height.
- [x] AC-229 THE SYSTEM SHALL list each pre-aggregation in Jobs with its state as an icon and a label, the refresh key that triggers it, and its name linking to its definition in Model, and SHALL show a started build's progress in that row (direction.md rule 22).
      Fails when: a row has no state or no trigger, the name does not open Model, or a build's progress appears only outside its row.
- [x] AC-230 THE SYSTEM SHALL let the user narrow the query log by outcome, source and time range and sort it, keep its column headers in view while it scrolls, and render no more than a page of rows at a time.
      Fails when: the headers scroll out of view, a filter does not narrow the rows, or more than one page of rows is rendered at once.
- [x] AC-231 THE SYSTEM SHALL draw the workspaces' page titles in direction.md's page-title style, and their tables as cards with a header band, rows of 34 pixels, 12-pixel cells and tabular numerals (direction.md rule 1).
      Fails when: a workspace page title is not 20 px at weight 600, or a workspace table's numbers are not tabular.
- [x] AC-232 WHEN the user opens Security, THE SYSTEM SHALL offer a preset context for each group the policies name, list every cube and view with the access the current context gives it and why, start a dashboard preview from a bounded list of dashboards that says when nothing matches, link each policy to its file in Model, and keep the edited context for the session.
      Fails when: effective access is missing, a search with no match shows nothing, a policy's source does not open Model, or the context is reset after a preview.
- [x] AC-233 WHEN the user opens Schedules or Data sources, THE SYSTEM SHALL show the page's title and a note saying what the page is for, on Data sources that managing connections is not part of this phase, and SHALL treat "/sources" as Data sources.
      Fails when: either page renders nothing, or "/sources" shows Not found.

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
> **Moved to phase 2** (2026-09-25): AC-246, in `docs/phase-2/backlog.md` §1. It shipped; the 2026-09-25 re-critique found Shift+F10 doing nothing on a chart tile with no fields yet.
- [x] AC-247 WHILE the tile's marking holds items, THE SYSTEM SHALL head the tile's menu with the marking's name, the marked values by their members' titles, and the count marked out of the tile's items.
      Fails when: the heading omits the values, or either count differs from the marked items or the tile's items.

## F24. Deployment to Kubernetes

Purpose: run wechart, Cube and Cube Store on Kubernetes as production will, and on docker-desktop for end-to-end tests.
Traces to: `[R4]` ("self-hosted Kubernetes … running wechart, Cube and Cube Store as containers"); requirements.md, Deployment (docker-desktop, namespace `wechart`); the user, 2026-09-25 ("create the helm charts.. so that you are able to deploy wechart into docker-desktop k8s context. Use the same northwind database that superset uses").

> **Status, 2026-09-25: added at the user's direction**, before the Superset-parity
> test. Its data source is set in the chart's values, in Cube's environment, as data
> sources are configured today while F18 is deferred.

- [x] AC-248 WHEN the wechart Helm chart is installed into a Kubernetes cluster, THE SYSTEM SHALL run the web app, the API, its metadata database, Cube's API, Cube's refresh worker and Cube Store there, with Cube's data source taken from the chart's values, and SHALL serve the web app at the address the values name.
      Fails when: after the install a component is not Ready, the web app's address does not load, or a query from the web app does not reach the data source the values name.

---

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

## Traceability

The table still names the criteria moved to phase 2 on 2026-09-25, since those requirements trace to them: AC-047 … AC-052, AC-093, AC-097, AC-104, AC-116, AC-145, AC-150, AC-151, AC-153 … AC-155, AC-157 … AC-161, AC-163, AC-164, AC-176, AC-180, AC-187, AC-201, AC-220, AC-234 and AC-246. Their text is in `docs/phase-2/backlog.md` §1.

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
