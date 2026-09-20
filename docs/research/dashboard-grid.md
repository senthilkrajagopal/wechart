---
library: dashboard grid and drag-and-drop
packages: [react-grid-layout, @dnd-kit/core, @dnd-kit/react]
version: react-grid-layout@2.2.4, @dnd-kit/core@6.3.1, @dnd-kit/react@0.5.0
researched: 2026-09-19
sources: [https://github.com/react-grid-layout/react-grid-layout, https://registry.npmjs.org/react-grid-layout/latest, https://dndkit.com/legacy/api-documentation/context-provider/dnd-context, https://dndkit.com/guides/accessibility, https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events, https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html]
---

# Dashboard grid and drag-and-drop — candidate evaluation

## Summary

Decides how AC-054 … AC-057, AC-059 and AC-067 are implemented: a 12-column canvas with 8 px row
units, edge/corner resize with a live readout, grip-drag with a drop marker that also accepts page-tab
and tab-group labels, keyboard move/resize/edit/delete, a nested tree (page tabs → sections → tab groups
→ tiles), and scroll preservation across re-renders. Candidates: `react-grid-layout`, `@dnd-kit/core`
(plus the successor `@dnd-kit/react`) and an in-house pointer-event implementation like the one in
`/Users/srajagopal/Work/wechart/docs/design/prototype/dashboard.js`. **Recommendation: in-house.**

## Install

Nothing is installed if the recommendation stands. For reference, the pinned candidates are:

- `pnpm add react-grid-layout@2.2.4` — MIT; peer `react`/`react-dom` `>=16.3.0` in package.json, while the
  README states "React 18+, TypeScript" for v2.0.0+; pulls `react-draggable@^4.4.6`, `react-resizable@^3.2.0`,
  `clsx`, `fast-equals`, `prop-types`, `resize-observer-polyfill`; ships `./core`, `./react`, `./legacy`,
  `./extras`, `./css/styles.css` entry points ([package.json](https://raw.githubusercontent.com/react-grid-layout/react-grid-layout/master/package.json), [README](https://github.com/react-grid-layout/react-grid-layout)).
- `pnpm add @dnd-kit/core@6.3.1` — MIT; peer `react`/`react-dom` `>=16.8.0`; deps `tslib`, `@dnd-kit/utilities`,
  `@dnd-kit/accessibility` ([registry](https://registry.npmjs.org/@dnd-kit/core/latest)).
- `pnpm add @dnd-kit/react@0.5.0` — MIT; peer `react`/`react-dom` `^18.0.0 || ^19.0.0` ([registry](https://registry.npmjs.org/@dnd-kit/react/latest)).

## Init / auth pattern

Not applicable — no service or credentials. Runtime notes for React 19 + Vite are under _Gotchas_.

## API surface we will use

### 1. Versions, React 19, licence, maintenance, size

|                                | react-grid-layout            | @dnd-kit/core              | @dnd-kit/react |
| ------------------------------ | ---------------------------- | -------------------------- | -------------- |
| Pinned                         | 2.2.4                        | 6.3.1                      | 0.5.0          |
| Published                      | 2026-07-29                   | 2024-12-05                 | 2026-06-11     |
| Licence                        | MIT                          | MIT                        | MIT            |
| Downloads, wk of 2026-09-12…18 | 2,737,366                    | 18,112,427                 | 916,577        |
| Bundle (bundlephobia)          | 73,474 B min / 22,825 B gzip | 43.7 KB min / 14.2 KB gzip | not measured   |

Publish dates and download counts: npm registry search API for [react-grid-layout](https://registry.npmjs.org/-/v1/search?text=react-grid-layout&size=1),
[@dnd-kit/core](https://registry.npmjs.org/-/v1/search?text=%40dnd-kit%2Fcore&size=1),
[@dnd-kit/react](https://registry.npmjs.org/-/v1/search?text=%40dnd-kit%2Freact&size=1) and the npm downloads API
([rgl](https://api.npmjs.org/downloads/point/last-week/react-grid-layout), [core](https://api.npmjs.org/downloads/point/last-week/@dnd-kit/core), [react](https://api.npmjs.org/downloads/point/last-week/@dnd-kit/react)).
Sizes: [bundlephobia rgl](https://bundlephobia.com/api/size?package=react-grid-layout@2.2.4&record=true), [bundlephobia core](https://bundlephobia.com/api/size?package=@dnd-kit/core@6.3.1&record=true).

- **react-grid-layout** v2.0.0 (2025-12-09) was a rewrite: `width` required, `verticalCompact` and Flow removed,
  UMD dropped, first-class TypeScript, hooks (`useContainerWidth`, `useGridLayout`, `useResponsiveLayout`),
  pluggable compactors and position strategies ([CHANGELOG](https://github.com/react-grid-layout/react-grid-layout/blob/master/CHANGELOG.md)).
  React 19 is never named; the README says React 18+ ([README](https://github.com/react-grid-layout/react-grid-layout)).
  Its `react-draggable` dependency does claim React 19 support from 4.6.0 ("Support React 19 (dependency upgrade
  and nodeRef-based browser tests)"), and `findDOMNode` was superseded by `nodeRef` back in 4.4.0
  ([react-draggable CHANGELOG](https://github.com/react-grid-layout/react-draggable/blob/master/CHANGELOG.md)) — but the floating `^4.4.6` range has already broken
  RGL once: issue [#2268 "Resizing and moving no longer works with react-draggable 4.6.0"](https://github.com/react-grid-layout/react-grid-layout/issues?q=is%3Aissue+React+19) (closed 2026-07-29).
  UNVERIFIED: an explicit statement from RGL that 2.2.4 is tested on React 19; the README, CHANGELOG and
  release notes do not say so.
- **@dnd-kit/core** has had no release since 2024-12-05 (6.3.1 added `Tab` to the keycodes that end a drag;
  6.3.0 added `onDragPending`/`onDragAbort`) ([CHANGELOG](https://github.com/clauderic/dnd-kit/blob/master/packages/core/CHANGELOG.md)). Development moved to the 0.x line.
- **@dnd-kit/react** is pre-1.0 and carries open React-19 bugs: [#2116 "React 19: DragDropProvider manager is
  destroyed during Strict Mode replay"](https://github.com/clauderic/dnd-kit/issues?q=is%3Aissue+React+19) and [#1654 "Add 'use client' to DragDropProvider for React 19 compatibility"](https://github.com/clauderic/dnd-kit/issues?q=is%3Aissue+React+19).

### 2. Nested container tree, and drops on targets outside the grid

- **react-grid-layout** models one flat array of `{i, x, y, w, h, …}` items with optional `minW/maxW/minH/maxH`,
  `static`, `isDraggable`, `isResizable`, `resizeHandles` ([README](https://raw.githubusercontent.com/react-grid-layout/react-grid-layout/master/README.md)). Nested grids are not documented
  ("the documentation doesn't explicitly cover nested grids"). Items are positioned by JS, not by flow: the
  default `positionStrategy` is `transformStrategy` (CSS transforms), with `absoluteStrategy` as the
  alternative, and the shipped stylesheet transitions `left, top, width, height` on `.react-grid-item` inside a
  `position: relative` container ([styles.css](https://unpkg.com/react-grid-layout@2.2.4/css/styles.css)). That is the opposite of AC-059's nested tree over CSS grid flow.
  Its `dropConfig` handles drops _into_ the grid from outside (`enabled`, `defaultItem`, `onDragOver`, `onDrop`,
  `onDropDragOver`, `onDropDragLeave`); there is no API for dropping a grid item _onto_ a target outside the
  grid such as a tab label. `DragConfig.bounded` is "Keep items within container (default: false)", so an item
  can be dragged visually past the edge, but the callbacks still report grid coordinates.
- **@dnd-kit/core** nests explicitly: "You may also nest `<DndContext>` providers within other `<DndContext>`
  providers to achieve nested draggable/droppable interfaces that are independent of one another", with the
  caveat that "the `useDroppable` and `useDraggable` hooks will only have access to the other draggable and
  droppable nodes within that context", and "events will be captured by the first `DndContext` that contains a
  Sensor that is activated by that event" ([DndContext](https://dndkit.com/legacy/api-documentation/context-provider/dnd-context)). Any element can be a droppable — `useDroppable` "isn't
  opinionated about how you should structure your application"; it only needs a unique `id` and its own node
  ([useDroppable](https://dndkit.com/legacy/api-documentation/droppable)) — so a page-tab button is a legal target for AC-056. dnd-kit supplies **no** layout model;
  all grid maths, drop markers and ordering are ours.
- **In-house** already does this in the prototype: `dropTarget(x, y, dragId)` calls `document.elementFromPoint`,
  then `closest('[data-droptab]')` for tab and tab-group labels before `closest('[data-container]')` for the
  nested grids, and returns a rect for the drop marker (`/Users/srajagopal/Work/wechart/docs/design/prototype/dashboard.js` lines 400–409).

### 3. Keyboard accessibility and screen-reader announcements

- **react-grid-layout**: no keyboard or accessibility support is documented in the README, CHANGELOG or release
  notes; issue [#1907](https://github.com/react-grid-layout/react-grid-layout/issues?q=is%3Aissue+keyboard+accessibility) ("Resizable handle … is not accessible through keyboard", open since 2023-07-11) is still
  open. AC-057 would be entirely ours.
- **@dnd-kit/core**: the KeyboardSensor starts and ends a drag on `Space`/`Enter`, cancels on `Escape`, and moves
  25 px per arrow-key press by default; `getNextCoordinates` can be replaced to move by grid cell instead;
  `scrollBehavior` is `smooth` by default ([KeyboardSensor](https://dndkit.com/api-documentation/sensors/keyboard)). `useDraggable` sets `role="button"`,
  `aria-roledescription="draggable"`, `aria-describedby` and `tabindex="0"`, ships default screen-reader
  instructions ("To pick up a draggable item, press space or enter. While dragging, use the arrow keys to move
  the item in any given direction. Press space or enter again to drop the item in its new position, or press
  escape to cancel.") and default live-region announcements for `onDragStart` ("Picked up draggable item [id]."),
  `onDragOver`, `onDragEnd` and `onDragCancel`, all overridable via `announcements` ([accessibility guide](https://dndkit.com/guides/accessibility)).
  This covers _moving_ only. Resize, `E` and `Delete` are outside its scope.
- **In-house**: all of it is ours, and the prototype already sets `tabindex="0"`, `role="group"` and an
  aria-label naming the shortcuts on every tile, with an `S.live` string for a polite live region
  (`dashboard.js` line 104, and the resize handler at line 425 setting `S.live = "Resized to …"`).
- Applies to every option: WCAG 2.2 **SC 2.5.7 Dragging Movements (Level AA)** — "All functionality that uses a
  dragging movement for operation can be achieved by a single pointer without dragging, unless dragging is
  essential…" ([Understanding 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)). The tile ⋯ menu's "Move to" list (direction.md §2, prototype `tileMenu`)
  is that alternative; it must exist whichever option we pick.

### 4. Resize: edges, corners, snapping, live dimensions

- **react-grid-layout**: `resizeConfig.handles` accepts `['s','w','e','n','sw','nw','se','ne']`, overridable per
  item via `resizeHandles`; snapping to columns and `rowHeight` is inherent to the model; `onResizeStart`,
  `onResize`, `onResizeStop` fire during the gesture, and 2.2.4 "Passed native events to resize callbacks", so a
  live "cols · % · px" readout is feasible ([README](https://raw.githubusercontent.com/react-grid-layout/react-grid-layout/master/README.md), [releases](https://github.com/react-grid-layout/react-grid-layout/releases)). This is RGL's strongest fit to AC-055.
- **@dnd-kit/core / @dnd-kit/react**: no resize primitive exists — dnd-kit is a drag-and-drop toolkit, and the
  KeyboardSensor documentation "contains no mention of resize functionality" ([KeyboardSensor](https://dndkit.com/api-documentation/sensors/keyboard)). AC-055 is entirely ours.
- **In-house**: the prototype computes the column pitch from the container rect
  (`col = (width - 48 - 16*11)/12 + 16`), snaps with `Math.round(dx/col)` and `Math.round(dy/8)`, clamps to
  `[2,12]` columns and `[minH,120]` rows, writes `gridColumn: span w` and `height: h*8px` directly, and paints
  the readout `"${w} / 12 cols · ${pct}% · ${h*8} px"` at the pointer (`dashboard.js` lines 415, 420). It
  already exposes `e` / `s` / `se` handles (line 101); `w`, `n` and the remaining corners are additive.

### 5. Collision and compaction

- **react-grid-layout** v2 makes compaction pluggable via the `Compactor` interface with `verticalCompactor`
  (default), `horizontalCompactor` and `noCompactor`, plus `preventCollision` ("blocks movement causing
  overlap") and `allowOverlap` ("permits items to stack") ([README](https://github.com/react-grid-layout/react-grid-layout), [CHANGELOG](https://github.com/react-grid-layout/react-grid-layout/blob/master/CHANGELOG.md)). So compaction _can_ be turned off — but
  the underlying model stays absolute `x/y` placement, which is a second source of truth next to CSS grid flow.
- **@dnd-kit/core** has no layout model; `collisionDetection` is hit-testing between the dragged node and
  droppables, not layout collision ([DndContext](https://dndkit.com/legacy/api-documentation/context-provider/dnd-context)). Nothing to turn off.
- **In-house**: CSS grid flow does the packing. A tile contributes `grid-column: span N`, where `span` means
  "the corresponding edge of the grid item's grid area is n lines from the opposite edge" ([MDN grid-column](https://developer.mozilla.org/en-US/docs/Web/CSS/grid-column));
  order in the container array is the only position state. There is no collision model to disable.

### 6. In-house: the browser APIs and their pitfalls

- **Pointer Events** (`pointerdown` on the container, `pointermove`/`pointerup` on `window`) — this is what the
  prototype does (`dashboard.js` lines 411–427), so no capture is needed for the move itself.
- **`setPointerCapture`** targets all later events for that pointer at one element; it is "implicitly released
  after a `pointerup` or `pointercancel` event", and while capture is set `pointerover/enter/leave/out` do not
  fire ([MDN Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)). **Pitfall with re-renders:** MDN warns "If you need to move an element in the DOM,
  then make sure to call `setPointerCapture()` **after DOM movements** so that `setPointerCapture()` will not lose
  track of it." A React re-render that moves or replaces the captured node during a drag therefore drops the
  capture. Mitigations: keep listening on `window` (prototype's approach), or capture on a stable drag overlay
  that React never reorders.
- **`pointercancel`** must be handled as an abort path: it fires on app switching, orientation change, palm
  rejection, `touch-action` preventing the input, or too many simultaneous pointers ([MDN pointercancel](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointercancel_event)).
- **Drag vs click threshold:** the prototype uses 5 px (`Math.hypot(...) < 5`, line 419), matching direction.md
  rule 47 ("A drag of 5 px or more is never treated as a click"). For comparison, RGL v2 fires `onDragStart`
  after 3 px ([CHANGELOG](https://github.com/react-grid-layout/react-grid-layout/blob/master/CHANGELOG.md)); RGL's own open issue [#2291](https://github.com/react-grid-layout/react-grid-layout/issues?q=is%3Aissue+React+19) shows threshold handling is subtle
  ("onDragStop is dropped when the release arrives before the threshold-crossing move renders").
- **Scroll containers:** hit-testing uses `document.elementFromPoint(clientX, clientY)`, whose coordinates are
  viewport-relative and which returns `null` when "the specified point is outside the visible bounds of the
  document or either coordinate is negative"; it also skips `pointer-events: none` elements ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/elementFromPoint)) — useful for
  making the drag ghost transparent to hit-testing, and a reason to guard the `null` case and add our own
  edge auto-scroll.
- **AC-067 (scroll preservation):** in React this is mostly free — "React will keep the state around for as long
  as you render the same component at the same position in the tree", and state (including the DOM node) is
  discarded only when the component is removed or a different type is rendered at that position
  ([react.dev](https://react.dev/learn/preserving-and-resetting-state)). The scroll container's `scrollTop` survives as long as we do not change its `key` or its
  wrapper element type. The prototype needs its explicit save/restore (lines 202, 226) only because it rewrites
  `container.innerHTML` on every render.
- **CSS grid** supplies the 12-column snap (`grid-template-columns` + `grid-column: span N`); the 8 px row unit
  is an explicit pixel height on the tile, not a grid row, in the prototype.

## Gotchas

- RGL's `^4.4.6` range on `react-draggable` (now 4.7.2, 2026-09-16) has already produced a silent break
  ([#2268](https://github.com/react-grid-layout/react-grid-layout/issues?q=is%3Aissue+React+19)); adopting RGL would mean pinning transitive versions.
- RGL v2 removed the UMD build and requires `width` to be supplied (or `useContainerWidth`, which uses
  `ResizeObserver`); 2.2.3 had to defer state updates to stop `ResizeObserver` loop errors ([CHANGELOG](https://github.com/react-grid-layout/react-grid-layout/blob/master/CHANGELOG.md)).
- RGL drag-from-outside has two open bugs: [#2263](https://github.com/react-grid-layout/react-grid-layout/issues?q=is%3Aissue+React+19) (placeholder freezes) and [#2262](https://github.com/react-grid-layout/react-grid-layout/issues?q=is%3Aissue+React+19) (`droppingItem` not removed on
  leaving the grid) — both on the path AC-056 needs for the palette drag.
- dnd-kit's nested-context caveat means a tile in a tab group and a page-tab label in an outer context cannot
  see each other unless they share one `DndContext`; a single top-level context plus our own collision
  detection is the only shape that satisfies AC-056.
- `@dnd-kit/core` 6.3.1 is 21 months old at this date and its successor is 0.x; neither is a stable base.
- dnd-kit advises `touch-action: none` on draggables ("the only way to reliably prevent scrolling for pointer
  events") ([PointerSensor](https://dndkit.com/legacy/api-documentation/sensors/pointer)). We are desktop-only, so this matters only if touch is added later.
- Whichever option wins, SC 2.5.7 forbids drag-only paths; the ⋯ "Move to" menu must stay.

## Alternatives considered

Covered above: `react-grid-layout@2.2.4`, `@dnd-kit/core@6.3.1`, `@dnd-kit/react@0.5.0`, in-house.

**Recommendation: in-house**, on these grounds.

1. **Fit to AC-059 and AC-054.** The layout is a nested tree rendered by CSS grid flow. RGL's only model is a
   flat array of absolutely-positioned `{x,y,w,h}` items, with nesting undocumented — it would add a second,
   conflicting source of truth. dnd-kit brings no layout model at all, so the grid maths is ours either way.
2. **Fit to AC-056.** Dropping onto a page tab or tab-group label is a drop outside the grid. RGL has no API for
   it. dnd-kit can express it, but only inside one flat `DndContext` with custom collision detection, i.e. the
   same hit-testing we would write by hand.
3. **Fit to AC-055.** Only RGL offers resize; dnd-kit offers none. But RGL's resize reports grid units in its own
   model, which we would then have to translate back into the tree.
4. **Fit to AC-057.** No candidate covers keyboard _resize_, `E` or `Delete`. dnd-kit covers keyboard _move_ plus
   ARIA attributes and live-region announcements — the one real advantage of a library here, and it is
   replicable with `aria-roledescription`, a described-by instructions node and an `aria-live="polite"` region
   (the prototype already has the tile ARIA labels and an `S.live` string).
5. **Correctness and maintenance risk.** Adopting either library means carrying its open bugs on exactly the
   paths the ACs exercise (RGL #2262/#2263/#2291; dnd-kit #2116/#1654) and, for dnd-kit, a frozen 6.x or a
   pre-1.0 successor.
6. **Licence** is MIT for all three, so it separates nothing.
7. Effort was not weighed; the decision rests on the model mismatch, the drop-target requirement and the
   keyboard requirements above.

**Condition on the recommendation:** the in-house implementation must ship dnd-kit's accessibility baseline —
`role`/`aria-roledescription` on the grip, persistent screen-reader instructions referenced by `aria-describedby`,
and polite live-region announcements on pick-up, move, drop, cancel and resize.

## Open questions / unverified

- UNVERIFIED: an explicit react-grid-layout statement that 2.2.4 supports React 19. Checked README, CHANGELOG,
  releases and the issue tracker; only "React 18+" appears, and `react-draggable` 4.6.0's React 19 note is a
  dependency-level claim.
- UNVERIFIED: whether react-grid-layout v2 passes `nodeRef` to `react-draggable` (i.e. avoids `findDOMNode`
  under React 19). The dist bundle was not read; issue [#2073](https://github.com/react-grid-layout/react-grid-layout/issues?q=is%3Aissue+React+19) about the findDOMNode warning is closed but the
  resolution comment was not retrievable.
- UNVERIFIED: how issue [#1795 "Accessibility support for React-Grid-Layout"](https://github.com/react-grid-layout/react-grid-layout/issues/1795) was resolved; GitHub shows it
  closed as completed on 2025-12-30, but the comment thread was not retrievable and no keyboard support appears
  in the v2 docs.
- For the user: should the drag threshold stay at 5 px (direction.md rule 47) for tile drags as well as for
  marking gestures, or should tile drags use a smaller value?
- For the user: do we need the ⋯ "Move to" menu to also cover resize (a non-drag path to size a tile), given
  AC-055 forbids numeric width/height fields and SC 2.5.7 asks for a non-drag alternative to dragging?
