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
- [ ] AC-034 WHEN the editor is opened from a dashboard tile, THE SYSTEM SHALL offer a preview at the tile's own size and a preview that fills the editor, and SHALL return to the dashboard with the tile updated.
      Fails when: the preview ignores the tile's width and height, or the dashboard tile does not reflect the applied changes.
- [x] AC-035 WHEN the user changes the chart in the editor, THE SYSTEM SHALL support undo and redo of every change made since the editor opened, and a "Discard changes" that restores the chart as it was.
      Fails when: any change cannot be undone, or Discard leaves a change applied.
- [x] AC-036 WHEN the user opens the results drawer, THE SYSTEM SHALL show the result rows, the underlying rows, and the Cube query JSON for the current chart.
      Fails when: any of the three views is missing, or shows data from a different query than the chart rendered.
- [ ] AC-182 WHEN the chart editor is opened on an existing chart, THE SYSTEM SHALL load that chart's cube, fields, chart type and axis settings into the editor.
      Fails when: the editor opens with empty wells, or with a chart type other than the one saved.
- [ ] AC-183 WHEN a chart edited from a dashboard tile is applied, THE SYSTEM SHALL hold the edit in the dashboard's edit session and write the chart document only when the dashboard is saved (direction.md §2 Layout: "Save dashboard (applies the chart and saves the dashboard)").
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
- [ ] AC-043 WHEN a query returns no rows, THE SYSTEM SHALL show an empty state naming the filters that are in effect.
      Fails when: the tile renders blank axes with no message, or the message omits an active filter.
- [x] AC-044 WHEN the user sorts a chart, THE SYSTEM SHALL order categories by value ascending, value descending or label, and keep that order after a data refresh.
      Fails when: the order is not applied, or changes after a refresh with unchanged data.
- [x] AC-045 WHEN a trellis chart is rendered, THE SYSTEM SHALL lay panels out in a grid with a shared scale by default and a per-panel title, and cap the panels at 20 (direction.md rule 6).
      Fails when: panels use different scales while the shared setting is on, or more than 20 panels render.
- [x] AC-046 THE SYSTEM SHALL format every value with its member's format from the Cube model, including currency and percentage, in axes, labels, tooltips and tables.
      Fails when: a value renders without its declared format in any of those places.

## F6. Quick calculations and calculation requests

Purpose: give analysts who do not write SQL the common derived measures, and a path for everything else.
Traces to: `[R7]`, `[R2]`, `[research/cube/data-modeling.md]`.

- [ ] AC-047 WHEN the user opens the menu on a measure in the chart editor, THE SYSTEM SHALL offer % of total, difference from previous period, % difference from previous period, running total, rank and moving average.
      Fails when: any of the six is missing from the menu.
- [ ] AC-048 WHEN a quick calculation is applied, THE SYSTEM SHALL compute it in Cube as a multi-stage measure rather than in the browser, and the tile SHALL label the measure with the calculation applied.
      Fails when: the value is computed from the already-fetched rows, or the label does not name the calculation.
- [ ] AC-049 WHEN a quick calculation needs a time dimension and the chart has none, THE SYSTEM SHALL disable it and say which field is missing.
      Fails when: the calculation is offered and produces an error, or gives no reason when disabled.
- [ ] AC-050 WHEN the user requests a calculation the menu cannot express, THE SYSTEM SHALL record a request carrying the chart, the fields in use and the user's description, and show it in the Model workspace.
      Fails when: the request is stored without the chart reference, or does not appear in the Model workspace.
- [ ] AC-051 WHEN a semantic-layer engineer opens a calculation request, THE SYSTEM SHALL open the target cube in the model editor with the request visible beside it.
      Fails when: the editor opens without the request, or on a different cube than the request names.
- [ ] AC-052 WHEN a requested measure is added to the model and published, THE SYSTEM SHALL mark the request as resolved and name the member that resolves it.
      Fails when: the request stays open after the member exists, or names no member.

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
- [x] AC-058 WHEN the user adds an element from the sidebar, THE SYSTEM SHALL offer chart, chart from folders, section, tab group, markdown, header, divider, image, link and filter, and insert the chosen one after the selection or into the chosen "+ Add" slot.
      Fails when: an element type is missing, or an insert lands somewhere other than the stated position.
- [x] AC-059 WHEN a tab group would be added outside a section, THE SYSTEM SHALL wrap it in a new section and say so (direction.md rule 37).
      Fails when: a tab group is created directly on a page tab, or no message explains the wrapping.
- [x] AC-060 WHEN the user deletes a tile, section, page tab or tab, THE SYSTEM SHALL offer an undo in a toast and through Undo, restoring the element and its contents (direction.md rule 38).
      Fails when: an undo restores the element without its contents, or no undo is offered.
- [x] AC-061 WHEN the user deletes a section that contains tiles, THE SYSTEM SHALL ask whether to delete its contents or keep them, and apply the choice.
      Fails when: the contents are deleted without asking, or "keep" loses a tile.
- [ ] AC-062 WHEN the user duplicates a chart tile, THE SYSTEM SHALL give the copy its own dashboard-local chart, so editing one tile leaves the other unchanged.
      Fails when: editing the copy changes the original tile.
- [ ] AC-063 WHEN an image tile has no alternative text, THE SYSTEM SHALL show a warning on the tile in edit mode, and SHALL accept only PNG, JPEG, WebP, GIF and SVG files of at most 2 MB (direction.md rule 42).
      Fails when: a tile without alt text shows no warning, or a file of another type or over 2 MB is accepted.
- [ ] AC-064 WHEN a link tile targets a dashboard, THE SYSTEM SHALL open that dashboard, carrying the current filters when "pass the current filters" is on; WHEN it targets a URL, THE SYSTEM SHALL accept only http and https and open it in a new tab (direction.md rule 42).
      Fails when: a non-http(s) URL is accepted, or the target dashboard opens without the filters while the option is on.
- [x] AC-065 WHEN the user saves a dashboard, THE SYSTEM SHALL persist the layout, tile settings, dashboard settings and marking definitions, and leave edit mode.
      Fails when: any of those is missing after reopening the dashboard.
- [x] AC-066 WHEN the user discards an edit session, THE SYSTEM SHALL restore the dashboard, its chart specs and its settings to their state when editing began.
      Fails when: any change made during the session survives the discard.
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
- [ ] AC-071 WHEN the interaction mode changes and the settings are saved, THE SYSTEM SHALL clear current marks and cross-filters.
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

- [ ] AC-076 THE SYSTEM SHALL offer filter widgets for a date range with presets, a list with search, a numeric range, and a checkbox list.
      Fails when: a listed widget type cannot be added to a dashboard.
- [ ] AC-077 WHEN a filter is added, THE SYSTEM SHALL scope it to the dashboard, a page tab or named tiles, and show its scope on the widget (direction.md rule 14).
      Fails when: the widget does not show its scope, or a tab-scoped filter changes a tile on another tab.
- [ ] AC-078 WHEN a filter value changes, THE SYSTEM SHALL re-query every tile in its scope and leave tiles outside the scope unchanged.
      Fails when: a tile outside the scope re-queries, or a tile inside it keeps the previous result.
- [ ] AC-079 WHEN a filter's member is not reachable from a tile's cube or view, THE SYSTEM SHALL leave that tile unfiltered and mark it as not covered by the filter.
      Fails when: the tile shows a query error, or is silently left unfiltered with no indication.
- [ ] AC-080 WHEN the user clears a filter, THE SYSTEM SHALL return every tile in its scope to the unfiltered result.
      Fails when: any tile still reflects the cleared filter.
- [ ] AC-081 WHEN filters are active, THE SYSTEM SHALL include them in the dashboard's URL so that opening that URL reproduces them.
      Fails when: opening the URL in a new session produces different filter values.
- [ ] AC-082 THE SYSTEM SHALL combine dashboard, tab and tile filters with marking limits using AND (direction.md rule 20).
      Fails when: a tile's rows satisfy only one of the two and are still shown.
- [ ] AC-083 WHEN a date filter uses a relative preset such as "last 30 days", THE SYSTEM SHALL send it to Cube as that relative range rather than as fixed dates.
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
- [ ] AC-085 WHEN a chart tile is created, THE SYSTEM SHALL set it to mark with the dashboard's default marking, and the tile's Marking setting SHALL also offer "(None)" and every other marking (direction.md rule 44).
      Fails when: a new chart tile marks with no marking, or "(None)" is missing from the setting.
- [x] AC-086 THE SYSTEM SHALL store a marking only as a predicate over Cube dimension members — tuples of member, granularity and value, or bounded ranges — and never as row numbers or result positions (direction.md rule 46).
      Fails when: a stored marking references a row index or a position in a result set.
- [ ] AC-087 WHEN the user clicks an item in a tile that marks, THE SYSTEM SHALL replace that marking with the clicked item; WHEN the user Ctrl-clicks or ⌘-clicks, THE SYSTEM SHALL toggle that item and leave the rest (direction.md rule 47).
      Fails when: a plain click adds to the marking, or a modified click replaces it.
- [ ] AC-088 WHEN the user drags a rectangle, or Alt-drags a lasso, over a tile that marks, THE SYSTEM SHALL mark every item the shape touches, and a press-and-release without movement SHALL be treated as a click, not a selection.
      Fails when: a drag of at least 5 pixels is treated as a click, or a click is treated as an empty selection.
- [ ] AC-089 WHEN the user Ctrl-drags or ⌘-drags a shape, THE SYSTEM SHALL toggle the enclosed items when all or none of them are marked, and otherwise add them (direction.md rule 47).
      Fails when: a Ctrl-drag over a partly marked set unmarks items instead of adding them.
- [ ] AC-090 WHEN the user clicks a legend entry's text in a tile that marks, THE SYSTEM SHALL mark every item of that category, and Ctrl-click or ⌘-click SHALL add further categories; series visibility SHALL be changed elsewhere (direction.md rule 7 of §7a).
      Fails when: a legend click hides the series, or does not mark it.
- [ ] AC-091 WHEN the user clicks a trellis panel header, THE SYSTEM SHALL mark every item in that panel.
      Fails when: the click marks a single item, or nothing.
- [ ] AC-092 WHEN the user clicks a row in a table tile, THE SYSTEM SHALL mark it; Shift-click SHALL mark the range from the anchor row; and rows SHALL be markable only when the cube's primary key is available (direction.md rule 10 of §7a).
      Fails when: Shift-click marks a single row, or rows are markable without a primary key.
- [ ] AC-093 WHILE a marking is in range mode, THE SYSTEM SHALL let the user drag along an axis to mark a continuous range, show it as a coloured stripe on that axis, and keep its bounds when filters change (direction.md rule 30 of §7a; `[R7]`).
      Fails when: the stripe does not appear, or the bounds move when a filter changes.
- [ ] AC-094 WHEN the user clicks an empty plot area, or presses Escape on a focused tile, THE SYSTEM SHALL unmark that tile's marking and leave other markings unchanged.
      Fails when: another marking is cleared, or the marking survives.
- [ ] AC-095 WHEN a marking changes, THE SYSTEM SHALL update every tile that uses it or is limited by it, on every page tab of the dashboard (direction.md rule 48).
      Fails when: a tile on another page tab still shows the previous marking state when opened.
- [ ] AC-096 WHEN a tile shows a marking, THE SYSTEM SHALL draw marked items in their own colour with an outline in the marking's colour and fade unmarked items (direction.md rule 49).
      Fails when: unmarked items render at full strength, or marked items carry no outline.
- [ ] AC-097 WHEN an item is partly marked and its measure is additive, THE SYSTEM SHALL draw the marked share from the baseline at full strength and fade the remainder; WHEN the measure is not additive, THE SYSTEM SHALL draw the whole item with a pattern and show the marked and total values in its tooltip (direction.md rule 49; `[docs/inputs §11]`).
      Fails when: a partial average or distinct count is drawn as a sub-length, or a partly marked sum shows no marked share.
- [ ] AC-098 THE SYSTEM SHALL convey marking state by more than colour: every tile using a non-empty marking shows a badge naming the marking and the number of marked items, and every non-empty marking has a chip naming it and summarising its values (direction.md rule 50).
      Fails when: a tile or chip conveys the marking only through colour.
- [x] AC-099 THE SYSTEM SHALL keep every marking colour at least ΔE 15 from every categorical series colour under normal vision, and at least ΔE 8 under protan and deutan simulation, in both themes (direction.md rule 51).
      Fails when: the palette validator reports a marking colour below either threshold against any series colour.
- [ ] AC-100 WHEN a tile has keyboard focus in view mode, THE SYSTEM SHALL move between its items with the arrow keys without changing the marking, mark the focused item with Space, toggle it with Ctrl+Space or ⌘+Space, and extend the marking with Shift and the arrow keys (direction.md rule 52).
      Fails when: an arrow key changes the marking, or Space does not mark the focused item.
- [ ] AC-101 WHEN a marking changes, THE SYSTEM SHALL announce the marking's name, the number of marked items and the source tile in a polite live region (direction.md rule 52).
      Fails when: no announcement is made, or it omits the count.
- [ ] AC-102 IF a marking would exceed 1,000 items, THEN THE SYSTEM SHALL refuse the additional items and explain the limit; "Mark all" SHALL be exempt because it stores the tile's filter rather than a list (`[R7]`, direction.md rule 29 of §7a).
      Fails when: a marking exceeds 1,000 stored items, or "Mark all" is refused.
- [ ] AC-103 WHEN a tile's cube or view cannot resolve every member of a marking's predicate, THE SYSTEM SHALL leave that tile unmarked and label it as not linked to that marking (direction.md rule 18 of §7a).
      Fails when: the tile shows a query error, or is silently left unbrushed with no label.
- [ ] AC-104 WHEN a tile needs the marked share and the marking's members are not among its own groupings, THE SYSTEM SHALL obtain it with one additional query per tile and keep the unmarked result cached across marking changes.
      Fails when: more than one extra query per tile is issued for a marking change, or the base result is re-fetched when only the marking changed.
- [ ] AC-105 WHEN the same set of items is marked again, THE SYSTEM SHALL produce an identical Cube query to the previous time, so the result can be served from cache.
      Fails when: two identical markings produce different query JSON.
- [ ] AC-106 WHILE a dashboard is in edit mode, THE SYSTEM SHALL select the tile on click and change no marking.
      Fails when: clicking a chart in edit mode changes a marking.

## F11. Details tiles and marked-rows actions

Purpose: Spotfire's master-detail workflow and the operations on a selection.
Traces to: `[docs/inputs §11]`, direction.md §7a, rules 33, 53, 55.

- [ ] AC-107 WHEN a tile is limited by one or more markings, THE SYSTEM SHALL restrict its query to those markings, combined as All markings (AND) or Any marking (OR) according to its setting, and SHALL skip markings that are empty (direction.md rule 33).
      Fails when: a tile limited by two markings with one empty returns no rows, or OR behaves as AND.
- [ ] AC-108 THE SYSTEM SHALL prevent a tile from being limited by the marking it marks with, and SHALL state the reason where that option is offered (direction.md rule 45).
      Fails when: a tile can be limited by its own marking.
- [ ] AC-109 WHEN every marking limiting a tile is empty, THE SYSTEM SHALL show the tile's nothing-marked state: all data, an empty visualization, or a message on an empty background, as set on the tile (direction.md rule 33).
      Fails when: the tile shows a state other than the one configured.
- [ ] AC-110 WHEN a tile is first limited by a marking, THE SYSTEM SHALL set its nothing-marked state to the message option and pre-fill the message with the names of the tiles that mark with those markings (direction.md rule 58).
      Fails when: the default is another option, or the message is empty.
- [ ] AC-111 IF a limiting marking is not empty but its items are excluded by the active filters, THEN THE SYSTEM SHALL say the marked items are hidden by the filters rather than showing the nothing-marked state (direction.md rule 55).
      Fails when: the tile shows its nothing-marked state in that situation.
- [ ] AC-112 WHEN the user chooses "Create details tile" on a tile, THE SYSTEM SHALL add a tile limited by that tile's marking, with its nothing-marked message pre-filled.
      Fails when: the new tile is not limited by the marking, or has no message.
- [ ] AC-113 WHEN the user chooses "Filter to marked" or "Filter out marked", THE SYSTEM SHALL create a removable dashboard filter equivalent to the marking's predicate, or its negation, and then clear the marking (direction.md rule 53).
      Fails when: the filter is not removable, the marking survives, or the rows kept differ from the marked rows.
- [ ] AC-114 WHEN the user chooses "View marked rows", THE SYSTEM SHALL show the underlying rows behind the marked items, state the total number of rows, and offer an export of them (direction.md rule 53).
      Fails when: the rows shown do not match the marking, or the total is absent.
- [ ] AC-115 WHEN the user chooses Invert marking or Mark all on a tile, THE SYSTEM SHALL mark exactly the tile's unmarked items, or all of its items, and leave other tiles' contributions to that marking unchanged.
      Fails when: an inverted marking keeps a previously marked item, or Mark all misses a visible item.
- [ ] AC-116 WHEN a text tile contains a marking token, THE SYSTEM SHALL render the marking's summary or count, and a measure token limited by a marking SHALL show the measure over the marked rows, or over all data when nothing is marked.
      Fails when: a token renders as literal text, or a limited measure ignores the marking.

## F12. Cross-filtering and cross-highlighting

Purpose: the alternative interaction mode for dashboards that prefer it.
Traces to: `[docs/inputs §12]`, direction.md §7, rules 13, 32.

- [ ] AC-117 WHILE a dashboard is in cross-filter mode, WHEN the user clicks a mark, THE SYSTEM SHALL apply the action set for that source and target pair: filter the target, highlight it, or leave it unchanged.
      Fails when: a pair set to None changes, or a pair set to Filter only highlights.
- [ ] AC-118 THE SYSTEM SHALL apply the dashboard's default pair action to pairs the author has not set, and show that default in the settings page (direction.md rule 32).
      Fails when: an unset pair behaves differently from the stated default.
- [ ] AC-119 WHEN a cross-filter is active, THE SYSTEM SHALL show a chip naming the member and value and the source tile, and clear it when the chip is dismissed or Escape is pressed.
      Fails when: the chip omits the source tile, or dismissing it leaves a tile filtered.
- [ ] AC-120 WHILE a dashboard is in cross-filter mode, THE SYSTEM SHALL offer no marking controls, chips or badges anywhere in that dashboard.
      Fails when: a marking control appears in cross-filter mode.

## F13. Bookmarks and shareable links

Purpose: return to a state, and send it to someone.
Traces to: `[R7]`, direction.md §7a.

- [ ] AC-121 WHEN the user saves a bookmark, THE SYSTEM SHALL store the page tab, the filter values and the current marks under a name the user gives.
      Fails when: applying the bookmark restores a different tab, filter value or mark set.
- [ ] AC-122 WHEN the user applies a bookmark, THE SYSTEM SHALL restore that state without changing the dashboard's saved definition.
      Fails when: applying a bookmark modifies the dashboard for other users.
- [ ] AC-123 WHEN the user copies a link with marks, THE SYSTEM SHALL produce a URL that reproduces the current filters and marks when opened.
      Fails when: opening the link produces different marks or filters.
- [ ] AC-124 WHEN a dashboard is opened without a bookmark or link parameters, THE SYSTEM SHALL open it with no marks (direction.md rule 54).
      Fails when: a dashboard opens with marks the author left behind.
- [ ] AC-125 THE SYSTEM SHALL save marking definitions — names, colours, the default, which tile marks with which, and the limits — with the dashboard, and never the marked items (direction.md rule 54).
      Fails when: reopening a saved dashboard restores marked items.

## F14. Chart ownership: local and library charts

Purpose: editing a chart must never change a dashboard the author did not open.
Traces to: `[docs/inputs §9]`, direction.md §2, rule 41.

- [ ] AC-126 WHEN a chart is created on a dashboard, THE SYSTEM SHALL make it local to that dashboard and keep it out of Explore folders and search.
      Fails when: a dashboard-local chart appears in a folder listing or in search results.
- [ ] AC-127 WHEN the user saves a local chart to a folder, THE SYSTEM SHALL make it a library chart reusable by other dashboards, and say where it was saved.
      Fails when: the chart stays local, or the confirmation does not name the folder.
- [ ] AC-128 WHEN a library chart is opened for editing from a dashboard, THE SYSTEM SHALL state that it is shared and on how many dashboards, and offer to make a local copy before changes spread (direction.md rule 41).
      Fails when: the editor gives no shared indication for a library chart used by more than one dashboard.
- [ ] AC-129 WHEN the user makes a local copy of a shared chart, THE SYSTEM SHALL repoint that tile to the copy, keep edits made so far, and leave the shared chart unchanged.
      Fails when: the shared chart changes, or the edits are lost.
- [ ] AC-130 WHEN a local chart is edited, THE SYSTEM SHALL change no other dashboard (direction.md rule 41).
      Fails when: another dashboard's rendering changes after editing a local chart.

## F15. Model editor (Cube YAML)

Purpose: author the semantic model in a form and in code, with the same file underneath.
Traces to: `[docs/inputs §4b]`, direction.md §7b, rules 20, 26–28; `[research/cube/data-modeling.md]`.

- [ ] AC-131 WHEN the user opens the Model workspace, THE SYSTEM SHALL list the model files and show the cubes, views, measures, dimensions, segments, hierarchies, joins and pre-aggregations each file defines.
      Fails when: a file's object is missing from the listing.
- [ ] AC-132 THE SYSTEM SHALL offer a form for every key Cube's validator accepts on a cube or a view, with enumerations offering exactly the validator's allowed values (direction.md rule 26).
      Fails when: a key the validator accepts has no form field, or an enumeration offers a value the validator rejects.
- [ ] AC-133 WHEN the user edits a field in the form, THE SYSTEM SHALL update the YAML view within one render, and WHEN the user edits valid YAML, THE SYSTEM SHALL update the form within 500 milliseconds (direction.md rule 27).
      Fails when: either view still shows the previous value after that point.
- [ ] AC-134 IF switching from code to form would lose information, such as comments or anchors, THEN THE SYSTEM SHALL warn and name what would be lost before applying the change (direction.md rule 20).
      Fails when: comments disappear from a file with no warning.
- [ ] AC-135 IF the YAML fails to parse, THEN THE SYSTEM SHALL name the file and line in a problems list and keep the form read-only until it parses (direction.md rule 28).
      Fails when: the form stays editable on unparseable YAML, or the problem names no line.
- [ ] AC-136 WHEN the user saves model changes, THE SYSTEM SHALL validate them against Cube before publishing and refuse to publish a model Cube rejects, showing Cube's error per file.
      Fails when: an invalid model is published, or the error is not attributed to a file.
- [ ] AC-137 WHEN a valid model is published, THE SYSTEM SHALL make the new members available to the chart builder without restarting Cube.
      Fails when: a published member is missing from the field list while Cube reports the new schema version.
- [ ] AC-138 WHEN the user opens the join editor for a cube, THE SYSTEM SHALL show the join graph with each relationship's direction and let the user add a join by choosing the target cube, the relationship and the condition.
      Fails when: the diagram omits a declared join, or shows a direction the model does not declare.
- [ ] AC-139 WHEN the user generates cubes from a data source, THE SYSTEM SHALL browse that connection's schemas and tables and create a cube per selected table with its columns mapped to dimensions and a count measure (`[R7]`).
      Fails when: a selected table produces no cube, or a column is dropped without saying so.
- [ ] AC-140 WHEN a model file uses Jinja, Python or JavaScript generation, THE SYSTEM SHALL open it read-only in the code view and say why it cannot be edited as a form.
      Fails when: such a file opens in an editable form, or gives no reason.
- [ ] AC-141 WHEN the user edits a member that charts use, THE SYSTEM SHALL list the charts and dashboards that reference it before saving.
      Fails when: a referencing chart is missing from that list.

## F16. Pre-aggregations

Purpose: make acceleration visible and editable, because data volumes vary widely.
Traces to: `[R4]`, `[docs/inputs §1]`, direction.md §7c; `[research/cube/pre-aggregations.md]`.

- [ ] AC-142 WHEN the user opens a cube's pre-aggregations, THE SYSTEM SHALL list each rollup with its measures, dimensions, time dimension, granularity, partition granularity and indexes.
      Fails when: a declared rollup or any of those attributes is missing.
- [ ] AC-143 WHEN the user edits a rollup in the form, THE SYSTEM SHALL write it into the model file as YAML, subject to the same validation and publishing as any model change.
      Fails when: the change is applied to Cube without being written to the model file.
- [ ] AC-144 WHEN the user opens a chart's acceleration panel, THE SYSTEM SHALL say whether the chart's query matches a pre-aggregation, and when it does not, name the member that prevents the match.
      Fails when: the panel reports a match that Cube does not use, or names no reason for a miss.
- [ ] AC-145 WHEN a rollup is partitioned, THE SYSTEM SHALL list its partitions with their build state and last build time, and allow a rebuild of selected partitions.
      Fails when: a partition is missing, or a rebuild applies to partitions the user did not select.
- [ ] AC-146 WHEN the user defines an index on a rollup, THE SYSTEM SHALL let the columns be ordered and mark aggregate indexes as such.
      Fails when: the column order cannot be changed, or an aggregate index is written as a regular one.
- [ ] AC-147 IF a query would fail under rollup-only mode, THEN THE SYSTEM SHALL warn on the chart that it depends on the source database.
      Fails when: such a chart shows no warning.
- [ ] AC-148 WHEN the user asks to refresh a chart's data, THE SYSTEM SHALL re-query Cube bypassing wechart's cached result and show the new data-as-of time.
      Fails when: the previous result is shown again with an unchanged timestamp.

## F17. Jobs, builds and scheduling

Purpose: run and watch pre-aggregation builds, since Cube Core keeps only 24 hours of job records.
Traces to: `[docs/inputs §7]`, direction.md §7c, rules 22, 34; `[research/cube/refresh-jobs-caching.md]`.

- [ ] AC-149 WHEN the user starts a build for a pre-aggregation, THE SYSTEM SHALL submit it to Cube, show the job token, and poll until the job reports done, missing partition, failure or not found.
      Fails when: the job's terminal state is never shown, or the token is absent.
- [ ] AC-150 WHEN a build finishes, THE SYSTEM SHALL record it in wechart's own history with its target, partitions, duration, outcome and log, and keep that record beyond Cube's 24-hour window.
      Fails when: a build older than 24 hours is missing from the history.
- [ ] AC-151 THE SYSTEM SHALL show the build queue with each entry's pre-aggregation, partition, state and token, and allow cancelling a queued entry.
      Fails when: a queued build is missing, or cancelling leaves it queued.
- [ ] AC-152 THE SYSTEM SHALL show every job and schedule with an icon and a text label for its state, never colour alone (direction.md rule 22).
      Fails when: a state is conveyed only by colour.
- [ ] AC-153 WHEN the user creates a schedule for a pre-aggregation build or a cache warm-up, THE SYSTEM SHALL accept a cron expression, show the next runs it implies, and run it at those times.
      Fails when: the next runs shown do not match the expression, or a due run does not start.
- [ ] AC-154 THE SYSTEM SHALL label each schedule with its owner, Cube's refresh worker or wechart's scheduler, and show Cube-owned schedules as read-only (direction.md rule 34).
      Fails when: a `refresh_key` schedule is editable in wechart, or is unlabelled.
- [ ] AC-155 IF a scheduled build fails repeatedly, THEN THE SYSTEM SHALL suspend the schedule after the configured number of consecutive failures, say so on the schedule, and offer Resume.
      Fails when: the schedule keeps running after the limit, or offers no Resume.
- [ ] AC-156 THE SYSTEM SHALL show the refresh worker's state and the Cube deployment's health, and mark the deployment as down when Cube's health endpoint does not report healthy.
      Fails when: the indicator stays healthy while Cube reports otherwise.

## F18. Data sources and connections

Purpose: add, test and assign connections, which Cube Core cannot do through an API.
Traces to: `[R4]`, `[docs/inputs §7]`, direction.md §7c, rules 23, 35; `[research/cube/data-sources.md]`.

- [ ] AC-157 THE SYSTEM SHALL list every configured data source with its driver type, its health from the last test, and the cubes assigned to it.
      Fails when: a configured source is missing, or the cube list disagrees with the model.
- [ ] AC-158 WHEN the user adds a data source, THE SYSTEM SHALL take the driver type, the connection fields for that driver, a Test step and a name, and SHALL refuse to create it until the test passes or the user explicitly overrides (direction.md rules 23, 35).
      Fails when: a source is created with a failing test and no override.
- [ ] AC-159 WHEN the user runs a connection test, THE SYSTEM SHALL run it from the wechart service, show each check's result, and show the driver's error text when a check fails.
      Fails when: the test runs in the browser, or a failure shows no error text.
- [ ] AC-160 THE SYSTEM SHALL offer PostgreSQL, Snowflake, Databricks, BigQuery, SQL Server and Oracle as driver types, with each driver's own authentication fields (`[R4]`).
      Fails when: a listed driver is absent, or its form omits an authentication method the driver requires.
- [ ] AC-161 WHEN a connection's settings change, THE SYSTEM SHALL say that Cube must restart before they take effect, and show whether the running Cube has picked them up.
      Fails when: the UI claims the change is live while Cube still uses the previous settings.
- [ ] AC-162 WHEN the user assigns a cube to a data source, THE SYSTEM SHALL write `data_source` into that cube's model file.
      Fails when: the assignment is stored only in wechart and not in the model.
- [ ] AC-163 THE SYSTEM SHALL record the result of each connection test over time and show that history per source.
      Fails when: a test result is missing from the history.
- [ ] AC-164 THE SYSTEM SHALL never show a stored credential in plain text after it is saved, and SHALL never send it to the browser.
      Fails when: a saved secret is readable in the UI or in a response to the browser.

## F19. Security: policies and context preview

Purpose: see what Cube's access policies do, and preview a dashboard as a security context. Users and groups are phase 2.
Traces to: `[R4]`, `[docs/inputs §7]`, direction.md §7c, rule 21; `[research/cube/access-control.md]`.

- [ ] AC-165 THE SYSTEM SHALL list every access policy in the model with its role, member-level rules, row-level filters, conditions and masking, as declared.
      Fails when: a declared policy or rule is missing from the listing.
- [ ] AC-166 WHEN the user edits a security context and previews a dashboard, THE SYSTEM SHALL run that dashboard's queries with the edited context and show a persistent banner naming the context in effect (direction.md rule 21).
      Fails when: the queries use the default context, or no banner is shown.
- [ ] AC-167 WHEN a preview context hides a member a chart uses, THE SYSTEM SHALL show that tile as unavailable to the context rather than as an error.
      Fails when: the tile shows a raw Cube error.
- [ ] AC-168 THE SYSTEM SHALL show the generated SQL and the effective filters for a chart under the previewed context.
      Fails when: the SQL shown omits the row-level filters the policy adds.
- [ ] AC-169 IF Cube would accept unauthenticated requests, because authentication checks are not enforced, THEN THE SYSTEM SHALL show a persistent warning in the Security workspace.
      Fails when: no warning is shown while Cube accepts an unauthenticated request.
- [ ] AC-170 THE SYSTEM SHALL show which API scopes the configured context has, and mark a screen as unavailable when its scope is missing.
      Fails when: a screen fails with an error instead of reporting the missing scope.

## F20. Export

Purpose: get data out, without a server renderer.
Traces to: `[R6]`, direction.md §7c.

- [ ] AC-171 WHEN the user exports a chart or a marked-rows view, THE SYSTEM SHALL produce a CSV whose rows and columns match what the tile shows, including the applied filters and marking limits.
      Fails when: the CSV contains rows the tile excluded, or omits a displayed column.
- [ ] AC-172 WHEN an export exceeds the row limit Cube returns, THE SYSTEM SHALL say how many rows were exported and that the result was truncated.
      Fails when: a truncated export claims to be complete.
- [ ] AC-173 THE SYSTEM SHALL format exported values with their member formats, and SHALL write raw numeric values for measures so the file can be re-analysed.
      Fails when: a measure is exported only as a formatted string.

## F21. Performance, accessibility and design conformance

Purpose: the cross-cutting bars every surface must meet.
Traces to: `[R3]`, `[R7]`, direction.md rules 1–5, 39, 52.

- [ ] AC-174 WHEN a dashboard of 10 charts on live warehouse data is opened, THE SYSTEM SHALL render every tile within 3 seconds at the 95th percentile, measured from wechart's own query timings.
      Fails when: the p95 across a repeated run exceeds 3 seconds.
- [ ] AC-175 WHEN a marking changes on a dashboard of 10 charts, THE SYSTEM SHALL update every affected tile within 3 seconds at the 95th percentile.
      Fails when: the p95 update time exceeds 3 seconds.
- [ ] AC-176 THE SYSTEM SHALL make every action reachable from the keyboard: navigation, authoring, marking, filtering and every dialog, with a visible focus indicator distinct from the marking outline (direction.md rules 39, 52).
      Fails when: an action can be performed only with a pointer, or focus is invisible on any control.
- [ ] AC-177 THE SYSTEM SHALL pair every status, validation and job state with an icon and a text label (direction.md rule 3).
      Fails when: any state is conveyed by colour alone.
- [x] AC-178 THE SYSTEM SHALL provide a table view of every chart's data, reachable from the tile (direction.md rule 5).
      Fails when: a chart type offers no table view.
- [ ] AC-179 THE SYSTEM SHALL render dashboards, the chart editor and the model editor without horizontal scrolling at a viewport width of 1,280 pixels.
      Fails when: any of those surfaces scrolls horizontally at that width.
- [ ] AC-180 THE SYSTEM SHALL work in current Chrome, Edge, Firefox and Safari on desktop (`[R7]`).
      Fails when: any acceptance test in this spec fails in one of those browsers.

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

| Requirement                                                                                   | Acceptance criteria                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Problem: replace Spotfire, browser-based, no installed client `[R1]`                          | AC-001 … AC-006, AC-180                                               |
| Problem: data need not be loaded into the tool; live queries with acceleration `[R1]`, `[R4]` | AC-007 … AC-013, AC-142 … AC-148                                      |
| Users: analyst without SQL `[R2]`                                                             | AC-025 … AC-036, AC-047 … AC-052, AC-182, AC-183                      |
| Users: business consumer `[R2]`                                                               | AC-017 … AC-019, AC-084 … AC-106, AC-121 … AC-125, AC-171 … AC-173    |
| Users: semantic-layer engineer `[R2]`                                                         | AC-131 … AC-141, AC-142 … AC-148, AC-157 … AC-164                     |
| Users: platform operator `[R2]`                                                               | AC-149 … AC-156, AC-157 … AC-170                                      |
| M1: 50 analyses rebuilt and accepted `[R3]`                                                   | AC-037, AC-084 … AC-116 (Spotfire parity behaviours), AC-053 … AC-068 |
| M2: 80% self-service authoring `[R3]`                                                         | AC-025 … AC-036, AC-047 … AC-052, AC-053 … AC-068, AC-182, AC-183     |
| M3: p95 under 3 s for 10 charts `[R3]`                                                        | AC-174, AC-175, AC-104, AC-105                                        |
| M4: Spotfire parity checklist `[R3]`                                                          | AC-084 … AC-116                                                       |
| Constraint: wechart service owns Cube credentials `[R5]`                                      | AC-007, AC-008, AC-164                                                |
| Constraint: persistence survives restart `[R5]`                                               | AC-014, AC-015, AC-181                                                |
| Constraint: four database families `[R4]`                                                     | AC-160                                                                |
| Constraint: volumes vary; acceleration must be visible `[R4]`                                 | AC-013, AC-144, AC-147                                                |
| Constraint: single user, no login `[R4]`                                                      | AC-008, AC-165 … AC-170                                               |
| Constraint: desktop browsers only `[R7]`                                                      | AC-179, AC-180                                                        |
| Design direction accepted `[R7]`                                                              | AC-004, AC-005, AC-054, AC-096 … AC-099, AC-176 … AC-178              |
| Scope: Explore folders, no Dashboards nav `[docs/inputs §8]`                                  | AC-001, AC-017 … AC-024                                               |
| Scope: dashboard authoring `[docs/inputs §8, §9]`                                             | AC-053 … AC-068                                                       |
| Scope: markings, four per dashboard, 1,000 items `[docs/inputs §10–13]`, `[R7]`               | AC-084 … AC-116                                                       |
| Scope: range-based marking and bookmarks `[R7]`                                               | AC-093, AC-121 … AC-125                                               |
| Scope: interaction mode per dashboard `[docs/inputs §12]`                                     | AC-069 … AC-075, AC-117 … AC-120                                      |
| Scope: chart ownership, local and library `[docs/inputs §9]`                                  | AC-126 … AC-130                                                       |
| Scope: text tiles with live tokens `[R7]`                                                     | AC-058, AC-116                                                        |
| Scope: quick calculations plus request flow `[R7]`                                            | AC-047 … AC-052                                                       |
| Scope: model authoring with form and code `[docs/inputs §4b]`                                 | AC-131 … AC-141                                                       |
| Scope: generate cubes from database tables `[R7]`                                             | AC-139                                                                |
| Scope: pre-aggregations `[docs/inputs §1]`                                                    | AC-142 … AC-148                                                       |
| Scope: jobs, builds, schedules, run history `[docs/inputs §1, §7]`                            | AC-149 … AC-156                                                       |
| Scope: data sources with testing `[docs/inputs §1, §7]`                                       | AC-157 … AC-164                                                       |
| Scope: security policies and context preview `[docs/inputs §1, §7]`                           | AC-165 … AC-170                                                       |
| Scope: export `[R6]`                                                                          | AC-171 … AC-173                                                       |
| Scope: filters `[docs/inputs §2]`                                                             | AC-076 … AC-083                                                       |
| Scope: chart rendering and customisation `[docs/inputs §2]`                                   | AC-037 … AC-046                                                       |
