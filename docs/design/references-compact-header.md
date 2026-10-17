# Design references: a compact, expandable dashboard header

Date: 2026-10-17. Author: UI design agent, for the coordinator.
Inputs:
- `docs/inputs/2026-10-17-compact-dashboard-header.md`, the user's words: "nearly 30% of the page goes away for the dashboard header and the filters. Can we have a more compressed header that can be expanded with a slide down so that the complete header can be seen... default will be the compressed header."
- `docs/design/direction.md` (§2 Dashboard and Filter bar, §3 type, §4 density, §7d layout, rules 1, 3, 13, 14, 17, 40, 50, 59, 72, 85);
- `docs/design/decisions-2026-10-08.md`, dashboard-Q2 (state E's ownership line and actions, the description under the title);
- designs 04 (2026-09-24), 04 state E and F (2026-09-27), 06, 10 and 13 (2026-09-28);
- what is built: `packages/web/src/dashboard/edit/EditChrome.tsx` (the header), `DashboardView.tsx` (`headerActions`, `band`, `PageTabsRow`), `filters/FilterBar.tsx`, and `shell/styles.ts`.

**Status.** A proposal, drawn as design 19 (`reviews/2026-10-17/designs/19-compact-dashboard-header.html`). Nothing in it is decided until the user approves the design; its questions are in that review's `index.md`.

**Source notes.**
- This session's web-search budget had run out. Every product claim below comes from fetching the vendor's own documentation, or the product's source on GitHub, directly. Each claim carries a key that resolves in "Sources" at the end.
- The fetch tool returns an extract of each page. Text in quotation marks is a sentence or a code line as that extract returned it. Unquoted statements are paraphrases.
- **Spotfire is not covered.** Its user guide pages (`docs.tibco.com/pub/sfire-analyst/…/filters/…`) returned no content to the fetch tool, and the Spotfire cloud docs host didn't resolve. Nothing below relies on Spotfire. Five products are covered instead of six.
- **Tableau** is covered only through its Show/Hide buttons. The fetched dashboard pages say nothing about a collapsible header or a collapsed filter summary.
- **Metabase's** published docs say nothing about sticky filters. Its sticky behaviour comes from its frontend source and from `observations-local.md` (Metabase 0.63 measured locally on 2026-09-19).

## 1. Today's chrome, measured from the CSS

Computed from `packages/web/src/shell/styles.ts` (everything is `box-sizing: border-box`, line 14). The case is design 04 state E's: a shared dashboard with a description and an ownership line, signed in, not in My workspace.

| Part | Rule | Height |
|---|---|---|
| App bar | `.app-bar { height: var(--wc-app-bar-height) }`, `--wc-app-bar-height: 48px` | **48** |
| Header: top padding | `.dashboard__header { padding: 12px 24px 0; gap: 12px; flex-wrap: wrap }` | 12 |
| Header: crumbs row | `.item-crumbs` (flex-basis 100%), `.item-crumbs__back { height: 24px }` | 24 |
| Header: gap | row gap 12 | 12 |
| Header: title row | `h1` at `text-xl` 24/32; Edit, History and Bookmarks are 32 px | 32 |
| Header: description | gap 12 less `margin: -6px 0 0`, then 14/20 | 6 + 20 |
| Header: ownership line | gap 12 less `margin: -6px 0 0`, then 12/16 | 6 + 16 |
| **Header total** | | **128** |
| Page tabs | `.page-tabs { padding: 8px 24px 0; border-bottom: 1px }`, tabs 36 px | **45** |
| Filter bar | `.filter-bar { min-height: 53px; padding: 10px 24px; border-bottom: 1px }` (10 + 32 + 10 + 1) | **53** |
| **Chrome above the canvas** | | **274** |
| The canvas's own top padding | `.dashboard-page { padding: 16px 24px 40px }` | (16, not chrome) |

| Viewport | Chrome | Share | Canvas left for tiles |
|---|---|---|---|
| 1,440 × 900 | 274 px | **30.4 %** | 626 px |
| 1,280 × 720 | 274 px | **38.1 %** | 446 px |

The user's "nearly 30%" is the 1,440 × 900 figure. Variants of the same page:
- In My workspace, the band adds 32 px (`.workspace-band { min-height: 32px }`): 306 px, 34.0 % at 900 and 42.5 % at 720.
- Without a description: 248 px (27.6 % / 34.4 %). Without description or ownership line: 226 px (25.1 % / 31.4 %).
- A filter bar whose pills wrap adds 40 px a row (a 32 px pill and the 8 px gap).
- Below 1,024 px nothing folds today: the header's row wraps, so the chrome grows.

## 2. What each product does

### Power BI (service, reading view)

- **Collapsed versus expanded.** "The **Filters** pane appears on the right side of your report. If the pane is collapsed, select **Filters** on the right edge to expand it." [pbi-reader] The author chooses the starting state: "Define whether the Filters pane is open or collapsed by default when a consumer opens the report." [pbi-format]
- **Remembered.** "The pane's open, close, and visibility state are all bookmarkable." [pbi-format] Filter *values* persist: "The Power BI service automatically saves your filter changes" [pbi-reader].
- **A summary without the pane.** "Users can hover over any visual to see a read-only list of the filters or slicers affecting that visual." [pbi-format] Active filters are told apart in the pane: "Shaded filter cards indicate active filters that exclude some data." [pbi-reader]
- **Hidden entirely.** The author can hide the pane from readers with the eye icon next to Filters [pbi-format].
- **What wechart takes:** the author-set default is one candidate for persistence (Q2 (d)); the per-tile filter list is what wechart already has in each tile's filter indicator (direction §7, "Each tile's filter indicator lists every filter acting on it").

### Looker (dashboards)

- **Collapsed versus expanded, with a count.** "The filter bar, which contains the filters, may be set to collapsed or expanded by default." "Clicking the filters icon lets you switch the state of the filter bar between collapsed and expanded. When the filter bar is collapsed, an indicator appears next to the filters icon that shows the number of filters on the dashboard." [lk-view]
- **Overflow inside the bar.** Filters can be "inline filters," "popover filters," or "behind a **More** button"; "clicking on the filter value or the **More** button will reveal the full filter control." [lk-view]
- **Tabs.** "If you view a dashboard with tabs, a filter will only display on a tab if it is applied to at least one tile on that tab." [lk-view]
- **What wechart takes:** one control that both summarises (a count) and toggles, at the top of the dashboard. This is the closest published precedent for the user's request.

### Apache Superset (dashboards, master)

- **Sticky header.** The dashboard header is `position: sticky; top: 0; z-index: 99;` [ss-builder]; `MAIN_HEADER_HEIGHT` is `53` [ss-const].
- **Collapsible filter bar.** The vertical bar is `OPEN_FILTER_BAR_WIDTH` `260` and collapses to `CLOSED_FILTER_BAR_WIDTH` `32`, a rail [ss-const]. Measured locally: a collapsible left "Filters and controls" panel, 260 px (`observations-local.md`). Its open state lives in the page's Redux state (`state.dashboardState.nativeFiltersBarOpen ?? false`), with no `localStorage` [ss-state].
- **Default.** An effect opens the bar unless the `FilterBarClosedByDefault` feature flag is on and the URL sets no `expand_filters`, the URL sets `expand_filters` to false, or the dashboard has no filters [ss-state]. So it is not remembered per user: each visit starts from the flag and the URL.
- **Horizontal bar overflow with a count.** Filters that don't fit go behind `dropdownTriggerText={t('More filters')}` with `dropdownTriggerCount={activeOverflowedFiltersInScope.length}`, and its tooltip reads "No applied filters" or "Applied filters: %s". Cross-filters are counted in the same overflow [ss-controls].
- **What wechart takes:** a sticky one-row header; a count on the trigger that stands for filters you can't see, cross-filters included; and a state that isn't stored per user.

### Metabase (dashboards, master)

- **Sticky filters.** The parameter panel takes a sticky class when scrolled (`useIsParameterPanelSticky`); `isParametersWidgetContainersSticky` returns `true` on any screen that isn't small, and on a small screen only while `parameterCount <= 5` [mb-panel]. Measured locally (0.63): "A sticky filter bar runs across the top, holding filter widgets about 32px tall", with a multi-select summarised as "4 selections" (`observations-local.md`).
- **No filters, no bar.** "The panel completely unmounts when no visible parameters exist" [mb-panel].
- **What wechart takes:** a value summary on a collapsed control ("4 selections"), and that stickiness should give way on small screens rather than eat them.

### Tableau (Show/Hide buttons)

- "Show/Hide buttons let dashboard viewers toggle the visibility of dashboard objects, revealing them only when necessary." [tb-dash]
- "In most cases, you'll want to place objects you plan to hide in a Horizontal or Vertical layout container, because hidden objects will have their space filled in by other objects in the container." [tb-dash] That is a push layout: what's hidden gives its room back to its neighbours, and what's shown takes it from them.
- "When viewing a published dashboard, simply clicking a Show/Hide button toggles object visibility." [tb-dash] The docs fetched give no default state.
- **What wechart takes:** pushing, not overlaying, is the documented default for a panel that is shown and hidden inside a dashboard.

### Patterns and platform rules

- **Disclosure.** "The element that shows and hides the content has role button." "When the content is visible, the element with role `button` has aria-expanded set to `true`." "Enter: activates the disclosure control and toggles the visibility of the disclosure content." Space does the same. `aria-controls` is optional. Escape isn't part of the pattern [apg-disc]. wechart's Esc comes from its own rule 85 ("Every new panel, dialog and popover … closes on Esc"), not from APG.
- **Motion.** WCAG 2.2 SC 2.3.3: "Motion animation triggered by interaction can be disabled, unless the animation is essential" [wcag-233]. `prefers-reduced-motion: reduce` "Indicates that a user has enabled the setting on their device for reduced motion" [mdn-prm].
- **Durations and curves.** Fluent 2's tokens: `durationFast` 150ms, `durationNormal` 200ms; `curveDecelerateMid` `cubic-bezier(0,0,0,1)`, `curveAccelerateMid` `cubic-bezier(1,0,1,1)` [fl-dur], [fl-curve]. Fluent 2's motion guidance: "Ease-out animations start fast and then slow down"; "Give larger elements more time to animate than smaller elements" [fl-motion]. direction.md already takes its type ramp from Fluent, so its motion tokens are the consistent source. Fluent's guidance doesn't pair curves with entering and leaving; pairing decelerate with opening and accelerate with closing is wechart's choice.

## 3. What the five do, side by side

| | Collapsed state | Summary when collapsed | Push or overlay | Opened by / closed by | Default and memory |
|---|---|---|---|---|---|
| Power BI | Filters pane folds to the right edge | Per-visual hover list | Pane beside the canvas | "Filters" on the edge, both ways | Author sets open or collapsed; bookmarkable |
| Looker | Filter bar collapsed | **A count beside the filters icon** | Bar above the tiles | The filters icon, both ways | Author sets collapsed or expanded |
| Superset | Vertical bar to a 32 px rail; horizontal overflow behind "More filters" | **Count of applied filters out of sight**, names in its tooltip | Rail beside the canvas | Its arrow; the dropdown | Open unless a flag or `expand_filters` says otherwise; not stored |
| Metabase | None; the bar is sticky | "4 selections" on a widget | — | — | — |
| Tableau | Any object, by a Show/Hide button | — | **Push** in a container | The button, both ways | Not documented |

Every product that collapses filters keeps the control that reopens them where it was (Looker's icon, Power BI's edge, Superset's rail). None documents closing on a click outside. None but Power BI remembers the state for the reader, and Power BI does it only through bookmarks.

## 4. Direction for wechart

**One sticky row by default; one control both summarises and opens the rest; the rest pushes the tiles down; Esc or the control closes it; nothing is remembered past the visit.**

### The compact header (the default)

- **One row, 48 px**: the app bar's height (`--wc-app-bar-height`), a 32 px control (§4) with 8 px above and below. It's padded 24 px from the sides (§7d) and ruled off below in `border-subtle`, on `bg-page`, sticky under the app bar as today's band is.
- **In order:**
  1. **The way back** (AC-195): a 24 px ghost link, "← ‹folder›", naming the dashboard's folder. Its full path is in its accessible name and tooltip, and in the ownership line.
  2. **The title,** `text-lg` 20/26/600 (§3, "page titles"). It's cut short with "…" when it doesn't fit, with the whole of it in its tooltip and in the expanded sheet. It stays an `h1`.
  3. **The page tabs, inline:** the same tablist (13/600, §7d), each tab as tall as the row, with the 2 px accent underline on the row's rule. A 1 px rule separates them from the title. Tabs that don't fit go behind "More ▾" (Looker's and Superset's "More"), and the open page is never among them.
  4. **The interaction summary,** only while collapsed: one compact chip per non-empty marking (swatch, name and values, cut short at 240 px), or a compact cross-filter chip. Each keeps its menu and its × (AC-098, AC-119, AC-200). Beyond two, "+n".
  5. **The actions, as today, in today's order:** History, Bookmarks, the primary (Edit, Edit in my workspace, Open my copy, or Propose…), the gear when it shows today, and ⋯. At 1,024–1,279 px, History and Bookmarks lose their visible label and keep it as their name and tooltip.
  6. **The toggle,** last: a 32 px `.btn`: the funnel icon, "Filters", a count pill of the filters set, and a chevron. With no filters on the dashboard it reads "Details". It's a disclosure button with `aria-expanded`, the pattern Looker's filters icon follows [lk-view].
- **What the count counts:** the dashboard's filters holding a value, plus filters made from a marking. Its tooltip and accessible description say "3 of 4 filters set" and name them.

### The expanded sheet (opened with the toggle)

- Directly under the row, at full width, it **pushes the canvas down** (Tableau's container behaviour [tb-dash]). Nothing the reader is looking at is covered, the top row of KPIs, which a filter change moves first, included. The canvas keeps its scroll position (rule 40).
- **It holds:** the full title, only when the row cut it short; the description (`text-sm`, text-secondary, at most 860 px, dashboard-Q2); the ownership line (12/16); then today's filter bar, unchanged: pills with scope tags, the full marking or cross-filter chips at the right, and the hint while nothing is set (AC-196).
- **Heights:** the description and ownership block is 56 px (8 + 20 + 4 + 16 + 8), and the filter band 53 px. With both, the sheet is 109 px.
- **Motion:** it opens by growing its height over 200 ms (`durationNormal`, `curveDecelerateMid`), and closes over 150 ms (`durationFast`, `curveAccelerateMid`) [fl-dur], [fl-curve]. Under `prefers-reduced-motion: reduce` it appears and disappears at once [mdn-prm], [wcag-233]. Only the height moves: no fade, no slide of the contents.
- **Closing:** the toggle, or Esc while focus is inside the header (rule 85). Focus then returns to the toggle. A click outside doesn't close it: a click on a tile marks or cross-filters, and the reader wants to see that land in the open bar. No product studied closes on a click outside.
- **While a filter is edited:** the sheet stays open. A filter's popover opens over the tiles as today. Esc closes the popover first; a second Esc closes the sheet.
- **Esc's precedence on the page:** innermost first. An open popover or menu, then the sheet (only when focus is in the header), then today's dashboard-wide Esc (unmark all, or clear cross-filters). Esc with focus on a tile keeps unmarking that tile (AC-094) and never closes the sheet.

### Persistence

- **Recommended:** the choice is kept while the dashboard stays open (through page tabs, refreshes, bookmarks applied, and Edit and back), and every opening starts compact, as the user asked ("default will be the compressed header"). Superset doesn't store it either [ss-state].
- **Alternatives** (Q2): remembered per person per dashboard in this browser; remembered per person for every dashboard; or a per-dashboard default set by its author in Settings › Layout, as Power BI and Looker do [pbi-format], [lk-view].

### Edit mode

- The sheet is **open, and the toggle is gone, for as long as the session lasts**. The author arranges the filter bar (a pressed pill selects its filter, T468) and needs to see the description and ownership line that readers will open. The row reads "Editing ‹name›" (AC-206), with "+ Page tab" after the inline tabs. In edit mode, tabs that don't fit scroll within the strip, as they do today, so that every tab stays a drop target (AC-056), instead of going behind "More". Leaving edit mode restores the state the reader had.
- **Alternative** (Q3): keep the toggle while editing.

### Narrow widths

- **1,024–1,279 px:** one row. History and Bookmarks become icon buttons, with their names kept; more tabs go behind "More".
- **Below 1,024 px** (view only, §2): the row keeps the way back, the title, the toggle and ⋯; History and Bookmarks move into ⋯. With more than one page, the pages are a "Page: ‹name› ▾" menu button on a second 40 px row. The sheet opens the same way, full width, its pills one under another. This is the "sheet" direction §2 already names for the filter bar below 1,024 px.

### Feedback when a filter changes while collapsed

- A filter can change without the bar in view: "Filter to marked" or "Filter out marked" from a tile (AC-113), a cross-filter from a click, a marking, or a bookmark applied.
- **The text carries the change** (principle 5): the toggle's count goes from 3 to 4; a compact marking or cross-filter chip appears, changes or goes.
- **The count draws the eye for 2 s:** the count pill takes `accent-soft` and a 2 px `accent` ring, which then fades over 150 ms. There is no movement, so reduced motion keeps it.
- **One polite announcement,** through the dashboard's existing live region, for example: "Filter added: Product is Côte de Blaye or Raclette Courdavault. 4 filters set."
- The sheet never opens by itself (Q6 (b) is the alternative).

### Space saved

| | 1,440 × 900 | 1,280 × 720 |
|---|---|---|
| Today | 274 px · 30.4 % | 274 px · 38.1 % |
| Compact (default) | **96 px · 10.7 %** | **96 px · 13.3 %** |
| Saved | **178 px · 19.8 points** | **178 px · 24.7 points** |
| Canvas for tiles | 626 → 804 px (+28 %) | 446 → 624 px (+40 %) |
| Expanded | 205 px · 22.8 % | 205 px · 28.5 % |
| Compact in My workspace (+32 band) | 128 px · 14.2 % | 128 px · 17.8 % |

Even expanded, the chrome is 69 px shorter than today's, because the title row and the tab row become one.

### Tokens

No new colour, type size or weight. Every value reuses one:

| Use | Value | From |
|---|---|---|
| Compact row | 48 px, padded 0 24, `border-subtle` rule, `bg-page` | `--wc-app-bar-height`; §4 control 32 + 8 + 8; §7d 24 px sides |
| Title | `text-lg` 20/26/600 | §3 "page titles" |
| Page tabs | 13/600, full row height, 2 px `accent` underline | §7d (13 px on page tabs); today's `.page-tabs` |
| Toggle | 32 px `.btn`, radius 6; count pill 18 px, 12/600, `accent` on `text-on-accent` | §4, §7d radius; design 18's `.count` |
| Compact chips | 24 px, 999 radius, 12 px; marking chips bordered 1.5 px in the marking's colour, cross-filter in `crossfilter` | §4 chips; AC-200; `.mark-chip`, `.cross-chip` |
| Sheet | description `text-sm` text-secondary; ownership 12/16 text-secondary; filter band as built (53) | dashboard-Q2; `.dashboard__ownership`; `.filter-bar` |
| Motion | 200 ms `cubic-bezier(0,0,0,1)` opening; 150 ms `cubic-bezier(1,0,1,1)` closing; none under reduced motion | Fluent 2 tokens [fl-dur], [fl-curve] |
| Change highlight | `accent-soft` ground and a 2 px `accent` ring on the count, 2 s | existing tokens; the 2 s is wechart's choice (Q6) |

### Proposed checklist rules (numbered after approval)

- The dashboard header is one 48 px row by default. It holds the way back to the folder, the title, the page tabs, the interaction summary, the actions and the Filters toggle, and stays fixed above the scrolling tiles.
- The toggle is a disclosure button with `aria-expanded`. Its visible label names "Filters" and the number set, or "Details" when the dashboard has no filters.
- The expanded sheet pushes the tiles down, never covers them, and holds the description, the ownership line and the full filter bar. It closes with its toggle, or with Esc while focus is in the header, and focus returns to the toggle.
- Under `prefers-reduced-motion: reduce` the sheet opens and closes without animation.
- A filter changed while the sheet is closed changes the toggle's count, or a compact chip, and is announced politely.
- In edit mode the sheet is open and has no toggle.

## 5. Acceptance criteria a compact header would change

| AC | Today's text, in short | What changes |
|---|---|---|
| **AC-196** | Header, page tabs and filter bar fixed above the tiles; "show the filter bar at all times", with the hint while nothing is set | The compact row is fixed, with the filters' **summary** at all times. The full bar, hint included, is in the sheet. Needs amending. |
| **AC-200** | Each non-empty marking a chip "in the filter bar", naming the marking, its values, **the tile it came from**, with a menu and unmark | While collapsed, the chip is the compact one in the row. It names the marking and its values; the source tile is in its tooltip, accessible name and menu heading. Needs amending. |
| **AC-119** | The cross-filter chip names member, value **and the source tile**; cleared by dismissing it or by Escape | Same as AC-200 for the source tile. Esc's precedence: with focus in the header, Esc closes the sheet first. Needs amending. |
| **AC-098** | Every non-empty marking has a chip naming it and summarising its values | Holds, through the compact chip, which keeps name and values. No change if the compact chip is approved as drawn. |
| **AC-195** | A breadcrumb back to the folder | The crumbs row becomes "← ‹folder›", one step, with the full path in its name. Holds if a one-step back link counts as the breadcrumb; else amend (Q9). |
| **AC-206** | "Editing ‹name›", and "+ Page tab" in the tab row | Holds; the tab row is now the compact row. |
| **AC-207** | Empty dashboard or tab shows the page-tab strip | Holds; the tabs are inline. |
| **AC-352** | The dashboard view as 2026-09-24 design 04 draws it, unless a 2026-09-27 design differs | Design 04 keeps the header, tab row and filter band as separate rows. Needs "or design 19 (2026-10-17)" added. |
| **AC-343** | Phase-2 surfaces as 2026-09-27 designs 01–10 | Design 04 state E's crumbs row, title row and ownership line under it change. Needs design 19 named as overriding for the dashboard header. |
| **AC-187** | The dashboard header and page tabs in the prototype's styles | Its text already counts "a later approved design's value" as conformance, so no amendment is needed once design 19 is approved. The 24 px title and the 45 px tab row are what move. |
| **AC-176** | Keyboard reach kept | Holds: filters stay reachable (Tab to the toggle, Enter, Tab on). No shortcut is added (R75). |
| **AC-304** | No sideways scroll at 390 px | Holds, as drawn in state D. |

Decision dashboard-Q2 (the description under the title) moves the description into the sheet: it is amended with design 19, not overturned.

## Sources

- [pbi-reader] Microsoft Learn, "Filter Data in Power BI Reports" (updated 2026-07-23): https://learn.microsoft.com/en-us/power-bi/consumer/end-user-report-filter (canonical `…/explore-reports/end-user-report-filter`)
- [pbi-format] Microsoft Learn, "Format filters in Power BI reports" (updated 2026-07-23): https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-report-filter
- [lk-view] Google Cloud, Looker, "Viewing dashboards": https://docs.cloud.google.com/looker/docs/viewing-dashboards
- [ss-builder] Apache Superset, `superset-frontend/src/dashboard/components/DashboardBuilder/DashboardBuilder.tsx` (master): https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/components/DashboardBuilder/DashboardBuilder.tsx
- [ss-state] Apache Superset, `…/DashboardBuilder/state.ts` (master): https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/components/DashboardBuilder/state.ts
- [ss-const] Apache Superset, `superset-frontend/src/dashboard/constants.ts` (master): https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/constants.ts
- [ss-controls] Apache Superset, `…/nativeFilters/FilterBar/FilterControls/FilterControls.tsx` (master): https://github.com/apache/superset/blob/master/superset-frontend/src/dashboard/components/nativeFilters/FilterBar/FilterControls/FilterControls.tsx
- [mb-panel] Metabase, `frontend/src/metabase/dashboard/components/DashboardParameterPanel/DashboardParameterPanel.tsx` (master): https://github.com/metabase/metabase/blob/master/frontend/src/metabase/dashboard/components/DashboardParameterPanel/DashboardParameterPanel.tsx
- [tb-dash] Tableau Desktop help, "Create a Dashboard" (Show/Hide buttons): https://help.tableau.com/current/pro/desktop/en-us/dashboards_create.htm
- [apg-disc] W3C WAI-ARIA Authoring Practices, "Disclosure (Show/Hide) Pattern": https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
- [wcag-233] W3C, "Understanding SC 2.3.3: Animation from Interactions": https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
- [mdn-prm] MDN, "prefers-reduced-motion": https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- [fl-dur] Fluent UI, `packages/tokens/src/global/durations.ts` (master): https://github.com/microsoft/fluentui/blob/master/packages/tokens/src/global/durations.ts
- [fl-curve] Fluent UI, `packages/tokens/src/global/curves.ts` (master): https://github.com/microsoft/fluentui/blob/master/packages/tokens/src/global/curves.ts
- [fl-motion] Fluent 2, "Motion": https://fluent2.microsoft.design/motion
- Local: `docs/design/observations-local.md` (Superset 6.1 and Metabase 0.63, measured 2026-09-19).
