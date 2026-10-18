# Finished tasks' notes: P2.25, the compact dashboard header (lane HEADER)

Lane HEADER's ticked tasks from `docs/tasks.md` §P2.25 (F43), their sub-lines word for word, kept apart from `tasks-done.md` while the lanes run in parallel. Each task keeps its one line in `docs/tasks.md`.

- [x] T828 [P] (AC-196, AC-486, AC-487, AC-490) Move the description, the ownership line and the filter bar into a header sheet, closed whenever a dashboard opens, opened and closed by a Filters disclosure toggle with `aria-expanded` and `aria-controls`, and hidden from focus and assistive technology while closed
  - Files: `packages/web/src/dashboard/header/HeaderSheet.tsx` (+ test), `packages/web/src/dashboard/header/FiltersToggle.tsx` (+ test; the label only, the count is T831's), `packages/web/src/dashboard/edit/EditChrome.tsx`, `packages/web/src/dashboard/DashboardView.tsx` (`band`: the filter bar into the sheet), `packages/web/src/shell/styles.ts`, `packages/web/src/dashboard/header/testing.ts` (`openHeaderSheet`), `e2e/dashboardHeader.ts` (`openHeaderSheet`), and the tests that reach the filter bar: `packages/web/src/filters/*.test.tsx`, `packages/web/src/dashboard/DashboardView.test.tsx`, `e2e/{filters,markings,crossfilter,marked-share,dashboard,dashboard-edit,keyboard-coverage,text-tokens,tiles,titles,design-conformance}.spec.ts`.
  - Failing test: `HeaderSheet.test.tsx`: a dashboard renders with the toggle at `aria-expanded="false"`, its `aria-controls` naming the sheet, and no pill, description or ownership line focusable or in the accessibility tree (AC-487); a click, Enter or Space on the toggle opens the sheet with the description, the ownership line and the filter bar, its hint shown while nothing is set, `aria-expanded="true"` and focus still on the toggle (AC-486, AC-196); pressing it again closes it; unmounting and mounting the dashboard again starts closed (AC-490).
  - Depends on: none

- [x] T829 (AC-484, AC-196, AC-496) The compact row: one 48 px row fixed above the tiles holding the way back, the title, the page tabs, the actions as today and the Filters toggle last
  - Files: `packages/web/src/dashboard/edit/EditChrome.tsx`, `packages/web/src/dashboard/DashboardView.tsx` (`PageTabsRow` from `band` into the row), `packages/web/src/shell/styles.ts` (`.dashboard__header` as the row, `.page-tabs` at the row's height), `packages/web/src/dashboard/header/CompactRow.test.tsx`, `e2e/dashboard-header.spec.ts`.
  - Failing test: `CompactRow.test.tsx`: in view mode the header holds, in order, the way back, the `h1`, the page tablist, History, Bookmarks, the primary action, the gear where shown, ⋯ and the toggle, and no description, ownership line or pill (AC-484). The e2e at 1,440 × 900 and 1,280 × 720: the row's box is 48 px tall; scrolling the canvas by 600 px leaves the row and its tabs where they were (AC-484, AC-196); the canvas's top edge is at most 96 px below the viewport's top (AC-496).
  - Depends on: T828

- [x] T830 (AC-485, AC-195) The way back "← ‹folder›" naming the whole path, and the title at `text-lg`, cut short with its tooltip and shown whole at the top of the open sheet only when cut
  - Files: `packages/web/src/dashboard/header/BackToFolder.tsx` (+ test; the path as `workspaces/explore/FolderCrumbs.tsx` builds it), `packages/web/src/dashboard/header/HeaderTitle.tsx` (+ test), `packages/web/src/dashboard/edit/EditChrome.tsx`, `packages/web/src/dashboard/header/HeaderSheet.tsx`, `packages/web/src/shell/styles.ts`, `e2e/dashboard-header.spec.ts`.
  - Failing test: `BackToFolder.test.tsx`: for a dashboard in Shared / Sales / EMEA it reads "← EMEA", its accessible name and tooltip are "Back to Shared / Sales / EMEA", and activating it opens Explore on that folder (AC-485, AC-195). The e2e at 1,440 × 900: the `h1` is 20 px at weight 600; with a 120-character title it stays one line at least 160 px wide, is cut with an ellipsis (`scrollWidth > clientWidth`), keeps the whole title in its `title` and accessible name, every tab and action stays in the row, and the open sheet starts with the whole title; with a short title the sheet shows none (AC-485).
  - Depends on: T829

- [x] T831 (AC-486) The toggle's count of filters set, its name and description, "Filters, none set", and "Details" on a dashboard with no filters
  - Files: `packages/web/src/dashboard/header/filtersSet.ts` (+ test), `packages/web/src/dashboard/header/FiltersToggle.tsx` (+ test), `packages/web/src/dashboard/DashboardView.tsx`.
  - Failing test: `filtersSet.test.ts`: four dashboard filters, three holding a value, and one filter made from a marking count 4 of 5, named in the bar's order. `FiltersToggle.test.tsx`: it shows "Filters" and 4, its accessible name is "Filters, 4 set" and its description and tooltip "4 of 5 filters set: Ordered at, Country, Category, Product"; with filters but none set, "Filters, none set" and no count; with no filters at all, "Details" with the info icon and no count (AC-486).
  - Depends on: T828

- [x] T832 (AC-487) The open sheet pushes the tiles down, covers none of them, keeps the canvas's scroll position, and grows as its pills wrap
  - Files: `packages/web/src/dashboard/header/HeaderSheet.tsx`, `packages/web/src/dashboard/edit/EditChrome.tsx`, `packages/web/src/shell/styles.ts`, `e2e/dashboard-header.spec.ts`.
  - Failing test: the e2e at 1,440 × 900: with the canvas scrolled 300 px, opening the sheet leaves its `scrollTop` at 300 and moves the canvas's top down by the sheet's height, and no tile's box intersects the sheet's; the sheet holds the description, the ownership line and the bar in that order; with 12 filters the bar wraps onto more rows, every pill wholly in view, and the sheet is as tall as its contents (AC-487).
  - Depends on: T829

- [x] T833 (AC-488) Open the sheet by its height over 200 ms decelerating and close it over 150 ms accelerating, its contents inert while it moves, and with no animation under reduced motion
  - Files: `packages/web/src/dashboard/header/HeaderSheet.tsx` (+ test), `packages/web/src/shell/styles.ts`, `e2e/dashboard-header.spec.ts`.
  - Failing test: `HeaderSheet.test.tsx`: while it moves, the sheet's contents are `inert`. The e2e: the sheet's computed `transition-property` is `height`, `0.2s` with `cubic-bezier(0, 0, 0, 1)` while opening and `0.15s` with `cubic-bezier(1, 0, 1, 1)` while closing; mid-opening, Tab doesn't reach a pill; with `page.emulateMedia({ reducedMotion: 'reduce' })` the duration is `0s` and the sheet has its full height in the first animation frame after the toggle is pressed (AC-488).
  - Depends on: T832

- [x] T834 (AC-489, AC-119) Close the sheet with its toggle or with Escape in the header, innermost first and ahead of the dashboard's own Escape, focus to the toggle; a click on the tiles leaves it open
  - Files: `packages/web/src/dashboard/header/HeaderSheet.tsx` (+ test), `packages/web/src/dashboard/DashboardView.tsx` (the dashboard-wide Escape that clears cross-filters, held while focus is in the open header), `e2e/dashboard-header.spec.ts`.
  - Failing test: `HeaderSheet.test.tsx`, on a dashboard: with a filter's popover open, Escape closes it with focus back on its pill and the sheet still open, and a second Escape closes the sheet with focus on the toggle; with a cross-filter set and focus in the open sheet, Escape closes the sheet and the cross-filter stays, and Escape with focus outside the header then clears it (AC-489, AC-119); Escape on a focused tile unmarks that tile and the sheet stays open; a click on a tile leaves it open (AC-489). The e2e repeats the popover and cross-filter cases in Chrome.
  - Depends on: T828

- [x] T835 (AC-490) Keep the sheet open or closed for the visit only, across page tabs, a bookmark applied and a refresh, storing it nowhere
  - Files: `packages/web/src/dashboard/header/useHeaderSheet.ts` (+ test), `packages/web/src/dashboard/DashboardView.tsx`, `e2e/dashboard-header.spec.ts`.
  - Failing test: `useHeaderSheet.test.tsx`: opened, the sheet stays open across a page tab change, a bookmark applied and Refresh; closed, it stays closed across the same. The e2e: open the sheet, then reload: it's closed; open it, go to Explore and back: it's closed; `localStorage`, `sessionStorage` and IndexedDB hold no key they didn't before, the address is unchanged, and no API request carries the state (AC-490).
  - Depends on: T828

- [x] T836 (AC-491, AC-206, AC-056) In edit mode, show the sheet open with no toggle, "Editing ‹name›" and "+ Page tab" in the row, page tabs scrolling with no "More ▾", and the reader's state back when editing ends
  - Files: `packages/web/src/dashboard/edit/EditChrome.tsx`, `packages/web/src/dashboard/header/useHeaderSheet.ts`, `packages/web/src/dashboard/DashboardView.tsx` (`PageTabsRow` while editing), `packages/web/src/dashboard/edit/enterEdit.test.tsx`, `e2e/dashboard-edit.spec.ts`.
  - Failing test: `enterEdit.test.tsx`: with the sheet closed, Edit shows it open and no toggle, the row reading "Editing ‹name›" with "+ Page tab" after the tabs; Discard puts it back closed; with it open before Edit, Save leaves it open (AC-491, AC-206). The e2e at 1,152 px with 12 page tabs: the strip scrolls, no "More ▾" shows, and a tile dropped on the last tab moves into it (AC-491, AC-056).
  - Depends on: T829, T835

- [x] T837 (AC-492) In view mode, put the page tabs that don't fit behind "More ▾", the open page always inline, the strip never scrolling
  - Files: `packages/web/src/dashboard/header/tabsThatFit.ts` (+ test), `packages/web/src/dashboard/header/PageTabsMore.tsx` (+ test; through `shell/MenuButton.tsx`), `packages/web/src/dashboard/DashboardView.tsx` (`PageTabsRow`), `packages/web/src/shell/styles.ts`, `e2e/dashboard-header.spec.ts`.
  - Failing test: `tabsThatFit.test.ts`: given the tabs' widths and the room left, it keeps inline as many as fit, in order, with the open page taking the last inline place when it would otherwise fall in the menu, and puts none in the menu when all fit. `PageTabsMore.test.tsx`: "More ▾" lists the rest, and choosing one opens that page. The e2e at 1,152 px with 8 tabs and the 7th open: the 7th is inline and in view, the strip's `scrollWidth` equals its `clientWidth`, and every tab is either inline or in the menu (AC-492).
  - Depends on: T829

- [x] T838 (AC-200, AC-119, AC-098) While the sheet is closed, show compact marking chips, at most two then "+n", or the first cross-filter's compact chip then "+n", each with its menu and ×, the source tile in its tooltip, accessible name and menu heading
  - Files: `packages/web/src/dashboard/header/CompactChips.tsx` (+ test; from `dashboard/markings/MarkChip.tsx` and `dashboard/crossfilter/CrossFilterChip.tsx`), `packages/web/src/dashboard/DashboardView.tsx`, `packages/web/src/shell/styles.ts`, `e2e/markings.spec.ts`, `e2e/crossfilter.spec.ts`.
  - Failing test: `CompactChips.test.tsx`: with the sheet closed and three non-empty markings, two compact chips then "+1"; each names its marking and its values by the members' titles, cut at 240 px, has "from ‹tile›" in its tooltip, accessible name and menu heading, and its × unmarks (AC-200, AC-098); with two cross-filters, the first's chip then "+1", naming member and value, the source tile in its tooltip, accessible name and menu heading, its × clearing it (AC-119); with the sheet open, no compact chip in the row and the full chips in the bar. The e2e specs mark and cross-filter with the sheet closed and check the compact chips.
  - Depends on: T829

- [x] T839 (AC-493) Highlight the toggle's count for 2 s when its number changes while the sheet is closed, under reduced motion too
  - Files: `packages/web/src/dashboard/header/FiltersToggle.tsx` (+ test), `packages/web/src/shell/styles.ts`.
  - Failing test: `FiltersToggle.test.tsx`, with fake timers: when the number goes from 3 to 4 with the sheet closed, the count takes its changed state (the `accent-soft` ground and `accent` border), still has it at 1,800 ms and has lost it by 2,200 ms; it does so with reduced motion too; a render with the same number, or a change with the sheet open, doesn't highlight it (AC-493).
  - Depends on: T831

- [x] T840 (AC-493) Announce each change made while the sheet is closed exactly once, politely, with the new number, and leave the sheet closed
  - Files: `packages/web/src/dashboard/header/filterChangeSaid.ts` (+ test), `packages/web/src/dashboard/DashboardView.tsx` (the existing `MarkingAnnouncer` region), `packages/web/src/dashboard/bookmarks/Bookmarks.tsx`, `e2e/dashboard-header.spec.ts`.
  - Failing test: `filterChangeSaid.test.ts`: "Filter added: Product is Côte de Blaye or Raclette Courdavault. 4 filters set."; a removal, "Filter removed: … 3 filters set."; a bookmark, "Bookmark applied: Q3 review. Page By country. 2 filters set. Nothing marked.". The e2e: with the sheet closed, Filter to marked from a tile's ⋯ turns the toggle's number to 4 and the compact chip goes; the page's polite live regions together receive exactly one new message, holding "4 filters set"; the toggle stays `aria-expanded="false"`; a bookmark applied is said once (AC-493).
  - Depends on: T831, T838

- [x] T841 (AC-494) From 1,024 to 1,279 px, keep one 48 px row, History and Bookmarks as icon buttons named in their accessible names and tooltips
  - Files: `packages/web/src/dashboard/DashboardView.tsx` (`headerActions`), `packages/web/src/dashboard/bookmarks/Bookmarks.tsx`, `packages/web/src/shell/styles.ts`, `e2e/dashboard-header.spec.ts`.
  - Failing test: the e2e at 1,024 and 1,152 px: the row is 48 px tall and one line; History and Bookmarks show no visible text, and their accessible names and `title`s are "History" and "Bookmarks"; the document's `scrollWidth` equals its `clientWidth` (AC-494).
  - Depends on: T837
