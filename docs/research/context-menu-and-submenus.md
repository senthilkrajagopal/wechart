---
library: WAI-ARIA APG menu pattern and the contextmenu event
packages: []
version: "WAI-ARIA 1.2 (W3C Recommendation 2023-06-06); APG Menu and Menubar and Menu Button patterns at w3c/aria-practices 457f47a (2025-09-02); APG Developing a Keyboard Interface at b20627c (2026-05-27); Pointer Events Level 3 (W3C Recommendation 2026-06-30)"
researched: 2026-09-25
sources:
  - https://www.w3.org/WAI/ARIA/apg/patterns/menubar/
  - https://github.com/w3c/aria-practices/blob/main/content/patterns/menubar/menu-and-menubar-pattern.html
  - https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/
  - https://github.com/w3c/aria-practices/blob/main/content/patterns/menu-button/menu-button-pattern.html
  - https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/examples/menu-button-actions/
  - https://www.w3.org/WAI/ARIA/apg/patterns/menubar/examples/menubar-editor/
  - https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/
  - https://www.w3.org/TR/wai-aria-1.2/
  - https://www.w3.org/WAI/standards-guidelines/act/rules/bc4a75/proposed/
  - https://www.w3.org/TR/accname-1.2/
  - https://www.w3.org/TR/pointerevents3/
  - https://w3c.github.io/pointerevents/
  - https://github.com/w3c/pointerevents/issues/581
  - https://w3c.github.io/uievents-key/
  - https://w3c.github.io/uievents-code/
  - https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event
  - https://bcd.developer.mozilla.org/bcd/api/v0/current/api.Element.contextmenu_event.json
  - https://developer.mozilla.org/en-US/docs/Web/API/Element/auxclick_event
  - https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
  - https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/browserSettings/contextMenuShowEvent
  - https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/frame/web_frame_widget_impl.cc
  - https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/input/event_handler.cc
  - https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/frame/settings.json5
  - https://bugzilla.mozilla.org/show_bug.cgi?id=1338369
  - https://bugzilla.mozilla.org/show_bug.cgi?id=801812
  - https://bugzilla.mozilla.org/show_bug.cgi?id=1936928
  - https://bugs.webkit.org/show_bug.cgi?id=213953
  - https://github.com/ecomfe/zrender/blob/6.1.0/src/dom/HandlerProxy.ts
  - https://github.com/ecomfe/zrender/blob/6.1.0/src/Handler.ts
  - https://github.com/ecomfe/zrender/blob/6.1.0/src/core/env.ts
  - https://github.com/apache/echarts/blob/6.1.0/src/core/echarts.ts
  - https://github.com/apache/echarts-handbook/blob/master/contents/en/concepts/event.md
  - https://playwright.dev/docs/api/class-locator#locator-click
  - https://playwright.dev/docs/api/class-keyboard
  - https://github.com/microsoft/playwright/blob/v1.63.0/packages/playwright-core/src/server/usKeyboardLayout.ts
  - https://github.com/microsoft/playwright/blob/v1.63.0/tests/page/page-click.spec.ts
  - https://github.com/microsoft/playwright/issues/10833
  - https://react.dev/reference/react-dom/createPortal
  - https://react.dev/reference/react-dom/components/common
  - https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using
  - https://drafts.csswg.org/css-position-4/#top-layer
---

# WAI-ARIA APG menu pattern and the contextmenu event (ARIA 1.2 / APG @457f47a / Pointer Events 3)

## Summary

**What this covers.** This doc covers two things:

- the APG **Menu** pattern, used for the tile menu and its submenus, and the **Menu Button** pattern, used for its ⋯ opener;
- the browser's **`contextmenu`** event and the Shift+F10 and Menu keys, used as the other two openers.

**What it serves.** It serves F23 in `docs/spec.md`:

- **AC-246**: right-click on the plot, Shift+F10 or the Menu key opens the tile's menu, and the browser's own menu stays shut. It fails when "a right-click changes a marking" (spec.md:813–814).
- **AC-247**: the heading shows the marking's name, its values and "n of N" (spec.md:815).
- **The submenus**: Drill by (AC-236, AC-237), Copy (AC-241–AC-243), Export (AC-244) and Data as of (AC-245).
- **The "Details panel" toggle** (AC-240).
- **AC-199**: the menu's content (spec.md:695).
- **AC-176**: every action reachable from the keyboard, with a visible focus indicator (spec.md:643).

It has to fit beside AC-100 and AC-094: a focused tile already answers the arrow keys, Space and Escape.

**Where the code is today:**

- `packages/web/src/dashboard/TileViewMenu.tsx:176–323` is a disclosure list of `<button>`s, not `role="menu"`.
- `packages/web/src/shell/MenuButton.tsx` is a flat APG menu button. It has no submenus, checkbox items, groups, separators or point anchor.

**Recommendation** (derived from the sources below):

1. **One menu component with three openers:**
   - the ⋯ button (Menu Button pattern);
   - `contextmenu` on the tile;
   - Shift+F10 or the Menu key on the focused tile.

   The APG itself names that last route: a menu is opened "by invoking a command, such as Shift + F10 in Windows, that opens a context specific menu" ([apg-menu-src]).
2. **Roving DOM focus**, not `aria-activedescendant`. Each item gets `tabindex="-1"` and `element.focus()`, as `MenuButton` already does. The APG notes that with roving focus "the user agent will scroll the newly focused element into view"; with `aria-activedescendant` the author must do that ([apg-kbd]).
3. **Handle Shift+F10 and ContextMenu on the tile's `keydown` with `preventDefault()`**, and also handle `contextmenu` on the tile. Two facts force this:
   - Chromium on macOS never turns Shift+F10 into `contextmenu` ([cr-widget]), and Firefox declined Shift+F10 on macOS ([bz-801812]). So the app's own keydown is the only way Shift+F10 works there.
   - Chromium generates the keyboard `contextmenu` only when the key event was *not handled*, so the keydown `preventDefault()` stops a second open ([cr-widget]).

   Guard `contextmenu` so it opens nothing while the menu is open: Chromium on Windows fires the Menu key's `contextmenu` on **keyup** ([cr-widget]).
4. **Stop right-clicks from marking.** ECharts and zrender 6.1.0 dispatch `mousedown` and `mouseup` for every button ([zr-proxy], [zr-handler]). wechart's series handlers and the wrapper's empty-area release don't check the button (`ChartCanvas.tsx:158–173`, `:355–375`). So today a right-click marks an item, or unmarks on empty plot area, which breaks AC-246. Two fixes:
   - filter out any button other than 0;
   - drop a pending press when `contextmenu` arrives before its release. This is macOS Ctrl+click: `mousedown` with button 0 and ctrlKey, then `contextmenu` ([cr-widget], [pe-581]).
5. **Put non-interactive content outside `role="menu"`.** That means the heading and the Data-as-of facts. Link it back with `aria-labelledby` or `aria-describedby`. The menu's keyboard model reaches only items; separators are "not focusable or interactive" ([apg-menu-src]).
6. **Render the menu in the top layer, but keep it inside the tile's DOM.** Use `popover="manual"` + `showPopover()`: the menu then escapes the canvas's clipping and ancestor transforms ([css-pos4]), while the React tree and DOM order stay where they are.
7. **Extract a shared `Menu` core** (menu list, keyboard, submenus, item kinds). `MenuButton` and the tile menu both use it (§9).

**No package is recommended.** The one widely used context-menu primitive checked, Radix ContextMenu, documents only right-click and long-press as openers ([radix-cm]). It would not cover AC-246's keyboard path on macOS. wechart already owns an APG menu (`MenuButton.tsx`).

### Key map (recommended; APG-required unless marked optional)

| Where focus is | Key | Does | Source |
|---|---|---|---|
| Focused chart tile (view mode) | Shift+F10 (no Ctrl, Alt or Meta), or ContextMenu (no modifiers) | Opens the tile menu and focuses its first item | [apg-menu-src], [apg-kbd] (Shift+F10 is the Windows/Linux "open context menu" convention; the macOS cell is empty) |
| Focused chart tile | Arrows, Space, Ctrl/⌘+Space, Shift+arrows, Escape | Unchanged (AC-100, AC-094) | spec.md:323, :335 |
| ⋯ button | Enter or Space | Opens and focuses the first item | [apg-mb-src] |
| ⋯ button | ↓ (optional) / ↑ (optional) | Opens and focuses the first / last item | [apg-mb-src] |
| Any menu | ↓ / ↑ | Next / previous item, "optionally wrapping". Disabled items are included. | [apg-menu-src] |
| Any menu | Home / End | First / last item. Required only "if arrow key wrapping is not supported"; APG's own example does both | [apg-menu-src], [apg-mb-actions] |
| Any menu | A printable character (optional) | Next item whose label starts with it | [apg-menu-src] |
| Item with a submenu | Enter, Space or → | Opens the submenu and focuses its first item | [apg-menu-src] |
| Plain item | Enter | Activates it and closes the menu | [apg-menu-src] |
| Plain item | Space (optional) | Activates it and closes the menu | [apg-menu-src] |
| `menuitemcheckbox` (Details panel) | Space (optional) | "changes the state without closing the menu" | [apg-menu-src], [apg-editor] |
| `menuitemcheckbox` | Enter | Activates it and closes the menu (the "Otherwise" branch) | [apg-menu-src], [apg-editor] |
| Inside a submenu | ← | Closes the submenu and returns focus to its parent item | [apg-menu-src] |
| Any menu | Escape | "Close the menu that contains focus and return focus to the element or context… from which the menu was opened": a submenu returns to its parent item; the top level returns to ⋯ or the tile | [apg-menu-src] |
| Any menu | Tab / Shift+Tab | "move focus out of the menu… and close all menus and submenus" | [apg-menu-src] |
| Any menu | → on a plain item, ← at the top level | Nothing: the APG defines these only for a menubar, and this menu has none | [apg-menu-src] |
| Menu open | ContextMenu, Shift+F10, `contextmenu` | Swallowed with `preventDefault()`; no second open. **wechart design, not APG.** | [cr-widget] (why) |

## Install

**Nothing to install.** `packages: []`.

The work uses what is already pinned:

- `react`/`react-dom` 19.3.0 (`packages/web/package.json:31–32`);
- ECharts 6.1.0 (`docs/research/echarts.md`);
- `@playwright/test` 1.63.0, `@testing-library/user-event` 14.6.7 and `jsdom` 30.1.0 (`docs/research/test-stack.md`, `packages/web/package.json:41`).

**Platform features relied on:**

- **`contextmenu` as a `PointerEvent`:** Chrome and Edge 92, Firefox 129, Safari 18.2. Safari on iOS has no `contextmenu` at all ([bcd-contextmenu]).
- **The Popover API:** Chrome and Edge 114, Firefox 125, Safari 17 ([bcd-popover]).
- **Not relied on: CSS anchor positioning.** `position-anchor` is listed at Chrome 151 (2026-07-28), Firefox 151 and Safari 27 (2026-09-14). Earlier versions carry partial-implementation notes on the initial value ([bcd-anchor]), so measure in JS instead (§7).

## Init / auth pattern

These are sketches for our runtime (React 19, Vite). Each piece is tied to a sourced behaviour.

**1. The tile's openers.** The code goes next to the existing `onKeyDown` guard in `dashboard/grid/Canvas.tsx:351–365`, which already ignores keys that only bubbled up from inside the tile.

```tsx
const opensMenu = (e: React.KeyboardEvent) =>
  !e.ctrlKey && !e.altKey && !e.metaKey &&
  ((e.key === 'F10' && e.shiftKey) || (e.key === 'ContextMenu' && !e.shiftKey));

onKeyDown={(e) => {
  if (e.target !== e.currentTarget) return;           // existing guard
  if (opensMenu(e)) {
    e.preventDefault();  // Chromium then skips its own keyboard contextmenu [cr-widget]
    openTileMenu({ from: 'keyboard' });               // anchored at the tile / focused item
    return;
  }
  onTileKey(e, tile);                                  // AC-100 / AC-094, unchanged
}}
onContextMenu={(e) => {
  const t = e.target as Node;
  const inPlot = plotRef.current?.contains(t) === true;
  const inMenu = menuRef.current?.contains(t) === true;
  const onTile = e.target === e.currentTarget;         // keyboard- or VoiceOver-generated, at the focused tile
  if (!inPlot && !inMenu && !onTile) return;           // leave the browser menu elsewhere on the tile
  e.preventDefault();                                  // suppresses the native menu [mdn-auxclick]
  if (isOpen || inMenu) return;                        // Windows Menu-key keyup, Firefox, a right-click on the menu
  openTileMenu(onTile ? { from: 'keyboard' } : { from: 'point', x: e.clientX, y: e.clientY });
}}
```

**2. Keeping right-clicks and Ctrl+click from marking** (AC-246 "Fails when… a right-click changes a marking"), in `tiles/ChartCanvas.tsx`:

- **Skip non-primary buttons in the series handlers.** zrender puts the native event on `params.event.event` ([zr-handler] `makeEventPacket`), so check `params.event?.event?.button === 0` in `onDown`/`onUp` and skip anything else.
- **Do the same in the wrapper.** Return early from `onMouseDown`/`onMouseUp` when `event.button !== 0`. `button` 2 is "Secondary button, usually the right button" ([mdn-button]).
- **Cancel pending presses on `contextmenu`.** Add a `contextmenu` listener on the canvas element that cancels pending presses in `itemClicks`, `panelClicks` and `dragGesture`, and removes the window `mousemove`/`mouseup` listeners. This needs a new `cancel()` on `itemClicks` (`charts/src/interaction/itemClick.ts`). It is what catches macOS Ctrl+click: Chromium sends `mousedown` with button 0 and `ctrlKey`, then `contextmenu` ([cr-widget] `IS_MAC` branch). Today `itemClicks` would turn that into a toggle mark (`toggle = ctrlKey || metaKey`, `ChartCanvas.tsx:156`).
- The rectangle and lasso path already ignores `button !== 0` (`ChartCanvas.tsx:275`).

**3. The menu's markup.** This follows APG rules for roles, submenu placement, labelling, group names and separators ([apg-menu-src], [apg-editor], [act-owned]).

```html
<div class="tile-ctx" popover="manual">                 <!-- in the tile's DOM, shown in the top layer -->
  <div id="t-title">Revenue by region</div>             <!-- heading: OUTSIDE role=menu (AC-247) -->
  <div id="t-marking">Marking · Country = Germany, United States · 2 of 6 marked</div>
  <div role="menu" aria-labelledby="t-title" aria-describedby="t-marking">
    <div role="group" aria-labelledby="t-marking">
      <div role="menuitem" tabindex="-1" aria-keyshortcuts="Control+M">
        Filter to marked<span aria-hidden="true">Ctrl+M</span></div>
      …
    </div>
    <div role="separator" aria-orientation="horizontal"></div>
    <div role="none">
      <div role="menuitem" tabindex="-1" id="t-drill" aria-haspopup="menu" aria-expanded="false">Drill by</div>
      <!-- when open, the immediately following sibling: -->
      <div role="menu" aria-labelledby="t-drill">…</div>
    </div>
    <div role="menuitemcheckbox" tabindex="-1" aria-checked="true">Details panel</div>
    <div role="none">
      <div role="menuitem" tabindex="-1" id="t-asof" aria-haspopup="menu" aria-expanded="false">
        Data as of 09:04 today · Pre-aggregation · every hour</div>
      <div role="menu" aria-labelledby="t-asof" aria-describedby="t-asof-facts">…Refresh now, Open in Jobs, Edit schedule…</div>
      <div id="t-asof-facts" aria-hidden="true">…name, last build, schedule, next run…</div>
    </div>
  </div>
</div>
```

## API surface we will use

### 1. Roles, states and properties

| Thing | Markup | Source |
|---|---|---|
| Menu container | `role="menu"`, named by `aria-labelledby` (pointing at the controlling button or menuitem) or `aria-label`; orientation defaults to vertical | [apg-menu-src], [apg-mb-actions] |
| Items | `menuitem`, `menuitemcheckbox`, `menuitemradio` | [apg-menu-src] |
| Checkbox item | `aria-checked="true"` when checked. The attribute is required on `menuitemcheckbox` (axe 4.13.0 lists it under `requiredAttrs`: local `node_modules/.pnpm/axe-core@4.13.0/.../axe.js:13335–13343`) | [apg-menu-src] |
| Parent of a submenu | `aria-haspopup="menu"` (or `true`, which "is the same as `menu`") and `aria-expanded` true or false | [apg-menu-src], [mdn-haspopup] |
| Submenu placement | "Contained inside the same `menu` element as its parent `menuitem`" and "the sibling element immediately following its parent `menuitem`" | [apg-menu-src] |
| Disabled item | `aria-disabled="true"`. "Disabled menu items are focusable but cannot be activated." | [apg-menu-src], [apg-kbd] |
| Separator | `role="separator"` between groups; "not focusable or interactive"; set `aria-orientation` to match its direction | [apg-menu-src] |
| Group | `role="group"` with `aria-label` or `aria-labelledby`. ARIA 1.2's required owned elements for `menu` include `group → menuitem…`: a menu may own groups that themselves own only menu items. `role="none"` wrappers are not counted as owned. | [act-owned], [apg-editor] |
| ⋯ opener | `role` button, `aria-haspopup="menu"` (or `true`), `aria-expanded` true or false, optional `aria-controls` | [apg-mb-src] |
| Focus model | Either the container has `tabindex` and `aria-activedescendant`, or every item has `tabindex="-1"`. Recommended: the latter. | [apg-menu-src], [apg-kbd] |
| Shortcut hints | `aria-keyshortcuts="Control+Shift+M"` exposes a shortcut; it "has no effect on the functionality" | [mdn-keyshortcuts] |

**Where the stricter checks sit.** axe-core 4.13.0 (installed) allows `group`, `menuitem`, `menuitemcheckbox`, `menuitemradio`, `menu` and `separator` as children of `menu` (`axe.js:13315–13320`). Its `aria-required-children` check:

- flags *elements* whose role is not in that list;
- treats elements with no role and no global ARIA attribute as transparent;
- skips text nodes (`axe.js:27718–27802`).

It exempts a non-focusable separator from `aria-valuenow` (`axe.js:27865–27867`). A `role="status"`, heading or other role inside the menu is therefore flagged.

### 2. Non-interactive content inside a menu (heading, "Data as of", marking line)

**Anything inside the menu that isn't an item is unreachable by the keys.** The arrows move only between items, and separators are "not focusable or interactive" ([apg-menu-src]).

- **Heading (AC-247).** Put it outside the `role="menu"` element, in the popup container. Reference it with the menu's `aria-labelledby`/`aria-describedby` and the marked group's `aria-labelledby`. `aria-labelledby` and `aria-describedby` may point at any element.
- **"Data as of …".** In the mockup this is a submenu parent, so it is a `menuitem` with `aria-haspopup="menu"` whose name carries the time. No status line is needed at the top level.
- **The Data-as-of submenu's facts (AC-245):** name, last build, schedule and next run.
  - Render them after the submenu's `role="menu"` element, with `aria-hidden="true"`, and reference them from the submenu's `aria-describedby`.
  - AccName 1.2 (Working Draft, 2026-09-23) makes a hidden node count when it is directly referenced by `aria-describedby`: step 2A excludes hidden nodes only when "not part of an `aria-labelledby` or `aria-describedby` traversal" ([accname]).
  - How NVDA, JAWS and VoiceOver announce a description on a `menu` is **UNVERIFIED**.
- **A reason for a disabled item** ("needs a marking"). Use `aria-describedby` on the focusable, `aria-disabled` item. `TileViewMenu.tsx:300–302` already notes that `title` on a natively disabled button is out of the keyboard's reach.

### 3. The `contextmenu` event

**What it is.** It "fires when the user attempts to open a context menu… typically triggered by clicking the right mouse button, or by pressing the context menu key" ([mdn-contextmenu]). Pointer Events 3 (REC 2026-06-30) makes `click`, `auxclick` and `contextmenu` `PointerEvent`s ([pe3]).

**Keyboard-generated events.** When the event comes from "a non-pointing device (such as voice recognition software or a keyboard interaction), `pointerId` MUST be `-1` and `pointerType` MUST be an empty string" ([pe3]). Whether each engine conforms is **UNVERIFIED**, so the design above doesn't depend on it.

**Suppressing the native menu.** Call `preventDefault()` on `contextmenu`. Preventing `auxclick` is not enough, "due to timing differences between operating systems" ([mdn-auxclick]).

**Clicks and buttons.** `click` is primary-button only; other buttons get `auxclick` ([mdn-auxclick]). So a right-button release over a menu item can never activate it, provided items activate on `click`.

**Event order on a right-click:**

| Engine / platform | Order | Source |
|---|---|---|
| Chromium on Windows | `mousedown` → `mouseup` → `contextmenu`. `showContextMenuOnMouseUp` is "Typically enabled on Windows". | [cr-settings], [cr-widget], [pw-click-test] |
| Chromium on macOS and Linux | `mousedown` → `contextmenu` → `mouseup`. The DOM `mousedown` is dispatched before `MouseContextMenu()`. | [cr-widget], [pw-click-test] |
| Chromium on macOS, Ctrl + left click | `mousedown` (button 0, ctrlKey) → `contextmenu`; no `click` | [cr-widget], [pe-581] |
| Firefox | Its context menu shows on `mouseup` on Windows and on `mousedown` on macOS and Linux. That the DOM event follows the same timing is **UNVERIFIED**. | [moz-ctxshow] |
| Firefox on macOS, Ctrl+click | Reported `button=2` on `mousedown`/`mouseup` in the release channel. The report is from 2020; the current state is **UNVERIFIED**. | [pe-581] |
| WebKit on macOS, Ctrl+click | Also sends `click` | [pe-581] |
| Playwright 1.63, all engines except Chromium on Windows | `mousedown` → `contextmenu` → `mouseup`. This includes Playwright's Firefox on Windows, unlike real Firefox on Windows. | [pw-click-test] |

The guards in Init §2 hold under every one of these orders: the button filter, plus cancelling a pending press on `contextmenu`.

### 4. Keyboard openers

**The key values:**

- `KeyboardEvent.key` `"ContextMenu"`: "Toggle display of the on-screen menu" ([uievents-key]);
- `code` `"ContextMenu"`, "typically found between the right `Meta` key and the right `Control` key" ([uievents-code]);
- Shift+F10 is `key === "F10"` with `shiftKey` ([uievents-key]).

**Does the browser fire `contextmenu` for these keys?**

| Browser / OS | Shift+F10 | Menu key | Target and position | Suppressed by our handler? |
|---|---|---|---|---|
| Chromium on Windows | On keydown (`kRawKeyDown`), only if not handled | On **keyup** (`kKeyUp`), only if not handled | The focused element, at the centre of its visible rectangle | Shift+F10: yes, by keydown `preventDefault()`. Menu key: no, because keyup triggers it, so the open-menu guard (or a `preventDefault()` on the ContextMenu keyup) is needed. [cr-widget], [cr-eventhandler] |
| Chromium on Linux | On keydown | On keydown | Same | Yes [cr-widget] |
| Chromium on macOS | Never: `is_shift_f10 = false` under `IS_MAC` | Only for a `VKEY_APPS` keydown; Mac keyboards have none (see below) | n/a | n/a [cr-widget] |
| Firefox on Windows and Linux | Dispatched to content since Firefox 55; the Shift state is stripped so pages can handle it | **UNVERIFIED** | MDN: "bottom left of the focused element" | Whether a keydown `preventDefault()` stops it is **UNVERIFIED**; the open-menu guard covers it. [bz-1338369], [mdn-contextmenu] |
| Firefox on macOS | Shift+F10 was declined (WONTFIX). macOS 15+ Ctrl+Enter opens the context menu at the focused element from Firefox 136. | n/a | Whether a DOM event reaches the page is **UNVERIFIED** | [bz-801812], [bz-1936928] |
| Safari on macOS | **UNVERIFIED**. The APG "open context menu" row has no macOS key. | n/a | VoiceOver's VO+Shift+M fires `contextmenu` | [apg-kbd], [wk-213953] |

**macOS specifics:**

- **Right-click.** Apple's guide gives Control-click: "Press and hold the Control key, then click an item to perform a right click" ([apple-rightclick]).
- **No Menu key.** That Apple keyboards lack one is inferred from the empty APG cell and Chromium's `IS_MAC` handling. No Apple page read here says so directly: **UNVERIFIED**.
- **F10 needs Fn.** It sends F10 only with Fn held, unless "Use F1, F2, etc. keys as standard function keys" is set ([apple-fn]).

So on macOS, Shift+F10 works only because wechart handles the keydown itself.

### 5. ECharts 6.1.0 and zrender 6.1.0

- **What zrender listens to.** It listens on its root element to `click, dblclick, mousewheel, wheel, mouseout, mouseup, mousedown, mousemove, contextmenu`. Its `mousedown`/`mouseup` handlers don't check `button` or `which` ([zr-proxy]).
- **Pointer events on Edge.** zrender uses pointer events when `browser.edge` matches `/Edge?\/([\d.]+)/` ([zr-env]), which also matches Chromium Edge's `Edg/`. On Edge, `params.event.event` is then a `PointerEvent`.
- **No button filtering.** `Handler.prototype` handles `'click','mousedown','mouseup','mousewheel','dblclick','contextmenu'` without any button filter ([zr-handler]).
- **ECharts exposes `'contextmenu'`.** It is a documented mouse event ([ec-handbook-event]). The event packet carries `event` (the native event) and `which` ([zr-handler] `makeEventPacket`). ECharts' mouse-event wiring calls neither `preventDefault` nor `stopPropagation` ([ec-core]), so ECharts never suppresses the browser's menu.
- **Blank areas.** Chart events fire only on graphic elements; blank areas need `getZr().on(...)` ([ec-handbook-event]). The tile's DOM `onContextMenu` covers both.
- **Listener order.** React attaches its listeners at the root container ([react-17]), so zrender's own listener on its inner element runs first. `chart.on('contextmenu', 'series', …)` could therefore record the item under the pointer before React's handler opens the menu. Nothing in F23 asks for that today.

### 6. Opening at a point and keeping it on screen

**The APG says nothing on this.** The pattern page covers neither hover nor positioning; its Editor Menubar example opens submenus on hover "only if another submenu is already open", and that is in a *menubar* ([apg-menu-src], [apg-editor]).

**Use the top layer, with the element still inside the tile's DOM:** `popover="manual"`, then `showPopover()`.

- **Why the top layer.** Top-layer elements "generate boxes as if they were siblings of the root element". "Ancestor elements with overflow, opacity, mask, etc. cannot affect it." For `position: fixed`, "its containing block is the viewport" ([css-pos4]).
- **Why `manual`.** Manual popovers are not light-dismissed ([mdn-popover]). wechart keeps its own Escape and outside-press rules.
- **Why not position: fixed without the top layer.** An in-flow `position: fixed` element uses its nearest ancestor with a `transform`, `translate`, `filter`, `contain` (and more) as its containing block instead of the viewport ([mdn-cb]). `useKeepInside` sets `translate` on the current tile menu (`keepInside.ts:25`), and divider tiles `transform` `.tile-menu` (`shell/styles.ts:1792–1795`).
- **Submenus.** They can be `position: fixed` children of the top-layer menu. `overflow` doesn't clip "descendant elements… whose containing block is the viewport" ([css21-overflow]). Keep `transform`, `translate` and `filter` off the menu surfaces ([mdn-cb]).

**Placement (wechart convention, not sourced):**

- **At a point.** The top-left at `(clientX, clientY)`. After layout, measure `getBoundingClientRect()`:
  - flip left of the pointer if it overflows the right edge;
  - flip above the pointer if it overflows the bottom;
  - if it is taller than the viewport, cap `max-height` and scroll. Roving focus scrolls the focused item into view ([apg-kbd]).
- **From the keyboard.** At the tile ("at the tile", AC-246), or at the keyboard-focused item via `convertToPixel` (`docs/research/echarts.md`). For reference:
  - Chromium's own keyboard menu sits at the centre of the focused element ([cr-eventhandler]);
  - MDN describes "bottom left of the focused element" ([mdn-contextmenu]).
- **Submenus.** Align with the parent item's top at the parent menu's right edge; flip to its left edge on overflow; shift up at the bottom edge.

### 7. Testing

**Playwright 1.63:**

- **Right-click.** `locator.click({ button: 'right', position: {x, y} })`. `button` is `"left" | "right" | "middle"`; `position` is relative to the padding box ([pw-locator-click]). Playwright's own tests assert that a right-click fires `contextmenu` ([pw-click-test]).
- **Keys.** `page.keyboard.press('Shift+F10')` and `page.keyboard.press('ContextMenu')`. Shortcuts like `"Control+Shift+T"` are supported ([pw-keyboard]). The docs don't list `ContextMenu`, but the v1.63.0 layout defines `'ContextMenu': { 'keyCode': 93, 'key': 'ContextMenu' }` and `'F10': { 'keyCode': 121 }` ([pw-layout]).
- **Browser-generated keyboard `contextmenu` is unreliable here.** On Windows, at Playwright 1.17.1, Shift+F10 fired it in Chromium but not Firefox, and ContextMenu in neither ([pw-10833]); it has not been re-checked at 1.63. Chromium on a macOS host never does it for Shift+F10 ([cr-widget]). So tests must drive the app's own keydown path.
- **Asserting suppression.** A headless run shows no native menu. Assert `defaultPrevented` instead, with a document-level bubble listener, which runs after React's root-container listener ([react-17]). Use Playwright's own register-then-poll pattern ([pw-click-test]):

```ts
await page.evaluate(() => {
  (window as any).__cm = [];
  document.addEventListener('contextmenu', (e) => (window as any).__cm.push(e.defaultPrevented));
});
await plot.click({ button: 'right', position: { x: 40, y: 40 } });
await expect.poll(() => page.evaluate(() => (window as any).__cm)).toEqual([true]);
await expect(page.getByRole('menu', { name: /Revenue by region/ })).toBeVisible();
await expect(page.getByRole('menuitem').first()).toBeFocused();
// then: the marking badge is unchanged (AC-246), and after Shift+F10 on the focused tile, toHaveCount(1) menus
```

`toBeFocused` and `toHaveCount` are auto-retrying assertions ([pw-assert]).

**Vitest with user-event 14.6.7** (read in the installed package):

- `pointer({ keys: '[MouseRight]', target })` dispatches `mousedown` and then `contextmenu` for button 2 (`dist/esm/system/pointer/mouse.js:76–77`). The release sends `auxclick`, not `click` (`:96`).
- The keymap has `ContextMenu` (`dist/esm/keyboard/keyMap.js:99–100`). The keyboard never generates `contextmenu`, which suits testing the keydown path.
- **jsdom 30.1.0 has no `showPopover`:** there is no match anywhere under `node_modules/.pnpm/jsdom@30.1.0/.../lib`. Components must feature-test it, or those tests must run in Vitest browser mode.

### 8. `MenuButton`: extend it, or give the tile menu its own component?

**What `MenuButton` already does per the APG:**

- `aria-haspopup="menu"` and `aria-expanded`;
- focus on the first item when it opens;
- wrapping arrows, Home and End;
- `aria-disabled` items that stay focusable;
- Escape returns focus to the button and stops propagation;
- Tab closes it (`MenuButton.tsx:82–133`, `:157–163`).

**What the tile menu needs that it lacks:**

- submenus (→ ←, `aria-haspopup` and `aria-expanded` on items, Escape closing only the innermost menu);
- `menuitemcheckbox` (Space keeps the menu open, Enter closes it);
- groups and separators;
- a heading outside the menu;
- opening at a point or from the keyboard, with no button;
- the optional ↑-opens-at-last and type-ahead;
- top-layer placement.

**Recommendation (correctness and accessibility): split the menu from its opener.**

- A shared `Menu` renders `role="menu"` and owns the key map in the Summary, including submenus, for a tree of entries: `item | checkbox | submenu | group | separator`.
- `MenuButton` keeps its API and becomes the "opener = button" wrapper, so its tests stand.
- The tile menu is `Menu` with three openers.

Two menus with separate key handling could disagree on the same keys. That is exactly what AC-176 would catch, and one implementation can't diverge from itself.

**Test changes.** `TileViewMenu.test.tsx` queries `button` roles, so those queries become `menuitem` one for one. That is the same kind of change tasks.md:3367 recorded for combobox.

## Gotchas

1. **A right-click marks today.**
   - The series `mousedown`/`mouseup` and the wrapper's empty-area release take any button (`ChartCanvas.tsx:158–173`, `:355–375`; [zr-proxy]).
   - On macOS, Ctrl+click is button 0 with `ctrlKey`, which wechart reads as "toggle" (`ChartCanvas.tsx:156`, `:373`) at the same moment Chromium opens the context menu ([cr-widget]).
   - Both break AC-246. Fix both as in Init §2.
2. **Double open.**
   - On Windows, Chromium fires the Menu key's `contextmenu` on keyup, *after* our keydown opened the menu. It is dispatched at the focused element, which is by then the first menu item ([cr-widget], [cr-eventhandler]).
   - Firefox's behaviour after a prevented keydown is **UNVERIFIED**.
   - `contextmenu` must therefore be idempotent while the menu is open, and prevented when it lands on the menu.
3. **Chart tiles take focus in view mode only in Markings mode.** `markKeys` is passed only `if (marking)` (`DashboardView.tsx:3723`), and the tile's `tabIndex` depends on it (`Canvas.tsx:327`). AC-246's "Shift+F10… on a focused chart tile" is impossible in cross-filter mode until chart tiles are focusable whenever they have a menu. The tile's spoken key list (`describeItem`) should then add "Shift+F10 opens its menu". `aria-haspopup` is not supported on role `group` ([mdn-haspopup]).
4. **Where the menu lives in the DOM.**
   - Keep it outside `.chart-canvas`. Otherwise its `mouseup` reaches the wrapper's "empty plot area → unmark" handler, and zrender's root listeners.
   - Events from a portal propagate "according to the React tree rather than the DOM tree" ([react-portal]). A body portal therefore still bubbles to the tile's React handlers. The tile's key guard (`Canvas.tsx:363`) already ignores keys that bubbled up.
   - A body portal would also move the menu to the end of the Tab order.
5. **Where Tab lands.** The APG says Tab moves focus out and closes all menus ([apg-menu-src]). If closing removes or hides the focused item during the keydown, where focus ends up is engine behaviour: **UNVERIFIED**. The e2e test should assert the focus target after Tab in Chromium, Firefox and WebKit. `MenuButton`'s own test only checks that the menu is gone (`MenuButton.test.tsx:144–151`).
6. **Escape vs. the "Unmark · Esc" hint.** The mockup shows "Esc" on Unmark. Inside the menu, Escape closes the menu ([apg-menu-src]), and Escape unmarks only on the focused tile (AC-094). Show the hint as the tile's key, or drop it.
7. **Shortcut hints that collide with the browser.**
   - Ctrl+Shift+M is Chrome's "Log in a different user or browse as a Guest" on Windows/Linux ([chrome-keys]).
   - It is Firefox's Responsive Design Mode toggle on Windows/Linux ([ff-devtools-keys]).
   - Whether a page can take either is **UNVERIFIED**.
   - For any shortcut shown, add `aria-keyshortcuts` and put `aria-hidden` on the visible hint, so it isn't read as part of the item's name ([mdn-keyshortcuts]).
8. **The user can still override the suppression.**
   - In Firefox, Shift+right-click shows the native menu without firing `contextmenu` ([mdn-contextmenu]).
   - Firefox users can also stop pages from overriding the menu with `dom.event.contextmenu.enabled`. The source is a Mozilla support forum thread, not docs ([moz-forum]).
   - AC-246 can only be tested with default settings.
9. **The focus indicator.** `:focus-visible` matches on UA heuristics ([mdn-focus-visible]), and a menu opened by right-click is a pointer interaction. Also style `[role^=menuitem]:focus`, so the current item is always visible and distinct from the marking outline (AC-176).
10. **Native `<button>` items and Space/Enter.** `MenuButton` relies on the native button's Enter/Space → `click`. Whether preventing default on a Space keydown stops a `<button>`'s activation in every engine is **UNVERIFIED**, and the checkbox item needs Space and Enter to differ. Handle Enter and Space in the menu's own keydown, or use non-button items as the APG example does (`<li role="menuitem" tabindex="-1">`, [apg-mb-actions]).
11. **Popover default styles.** `[popover]` has UA styles that the menu must override. Details are **UNVERIFIED**; no UA stylesheet was read. jsdom lacks `showPopover` (§7).
12. **Keyboard-origin fields.** The keyboard `contextmenu`'s `button` value (Chromium builds it with `kNoButton`, [cr-eventhandler]) and whether engines set `pointerType` to `""` ([pe3]) are **UNVERIFIED**. Don't branch on either. Choose the anchor by *where the event landed*: the focused tile itself, or a point inside the plot.

## Open questions / unverified

- **Keyboard `contextmenu` outside Chromium:**
  - Safari on macOS: whether Shift+F10 or macOS 15's Ctrl+Return produces a DOM `contextmenu` (tried: WebKit's `sendContextMenuEventForKey` source was too large to fetch; the search found only VoiceOver, [wk-213953]);
  - Firefox: its Menu key on Windows/Linux, and whether a prevented keydown stops its `contextmenu`.
- **Ctrl+Return on macOS 15+.** Whether wechart should also bind it ([bz-1936928]) is a product decision; AC-246 names only Shift+F10 and the Menu key. **Ask the user.**
- **Firefox Ctrl+click on macOS today:** `button` 0 or 2 ([pe-581] reports 2 in 2020).
- **Screen-reader announcements.** How NVDA, JAWS and VoiceOver announce `aria-describedby` on a `menu`, a group's name inside a menu, and an `aria-disabled` item's description. Check manually.
- **Hover.** Whether pointer hover opens submenus, and with what delay. The APG is silent for menus ([apg-menu-src]). This is design's call (ui-design).
- **Where keyboard-opened menus sit.** At the keyboard-focused item or at the ⋯ anchor. AC-246 says "at the tile". Design's call.
- **Where Tab lands** after closing a top-layer, manual popover menu whose focused item is hidden or removed during the keydown (Gotcha 5).
- **Apple keyboards and the Menu key.** No Apple page states outright that they have none; this is inferred from [apg-kbd] and [cr-widget].
- **Pinning.** The Chromium source was read from `main` on 2026-09-25, not from a stable tag. The stable Chrome in users' hands may differ in detail.
- **ARIA 1.2's text.** The spec was not quoted directly on menu children: the page was too large to fetch whole. Menu/group ownership rests on the ACT rule's quotation of ARIA 1.2's `group → menuitemradio` required owned elements ([act-owned]), the APG, and axe 4.13.0's table.

[apg-menu-src]: https://github.com/w3c/aria-practices/blob/main/content/patterns/menubar/menu-and-menubar-pattern.html
[apg-mb-src]: https://github.com/w3c/aria-practices/blob/main/content/patterns/menu-button/menu-button-pattern.html
[apg-mb-actions]: https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/examples/menu-button-actions/
[apg-editor]: https://www.w3.org/WAI/ARIA/apg/patterns/menubar/examples/menubar-editor/
[apg-kbd]: https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/
[act-owned]: https://www.w3.org/WAI/standards-guidelines/act/rules/bc4a75/proposed/
[accname]: https://www.w3.org/TR/accname-1.2/
[pe3]: https://www.w3.org/TR/pointerevents3/
[pe-581]: https://github.com/w3c/pointerevents/issues/581
[uievents-key]: https://w3c.github.io/uievents-key/
[uievents-code]: https://w3c.github.io/uievents-code/
[mdn-contextmenu]: https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event
[bcd-contextmenu]: https://bcd.developer.mozilla.org/bcd/api/v0/current/api.Element.contextmenu_event.json
[mdn-auxclick]: https://developer.mozilla.org/en-US/docs/Web/API/Element/auxclick_event
[mdn-button]: https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
[mdn-haspopup]: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-haspopup
[mdn-keyshortcuts]: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-keyshortcuts
[mdn-focus-visible]: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/:focus-visible
[moz-ctxshow]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/browserSettings/contextMenuShowEvent
[moz-forum]: https://support.mozilla.org/en-US/questions/1290242
[cr-widget]: https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/frame/web_frame_widget_impl.cc
[cr-eventhandler]: https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/input/event_handler.cc
[cr-settings]: https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/frame/settings.json5
[bz-1338369]: https://bugzilla.mozilla.org/show_bug.cgi?id=1338369
[bz-801812]: https://bugzilla.mozilla.org/show_bug.cgi?id=801812
[bz-1936928]: https://bugzilla.mozilla.org/show_bug.cgi?id=1936928
[wk-213953]: https://bugs.webkit.org/show_bug.cgi?id=213953
[apple-rightclick]: https://support.apple.com/en-ae/guide/mac-help/cpmh0152/mac
[apple-fn]: https://support.apple.com/en-us/102439
[zr-proxy]: https://github.com/ecomfe/zrender/blob/6.1.0/src/dom/HandlerProxy.ts
[zr-handler]: https://github.com/ecomfe/zrender/blob/6.1.0/src/Handler.ts
[zr-env]: https://github.com/ecomfe/zrender/blob/6.1.0/src/core/env.ts
[ec-core]: https://github.com/apache/echarts/blob/6.1.0/src/core/echarts.ts
[ec-handbook-event]: https://github.com/apache/echarts-handbook/blob/master/contents/en/concepts/event.md
[pw-locator-click]: https://playwright.dev/docs/api/class-locator#locator-click
[pw-keyboard]: https://playwright.dev/docs/api/class-keyboard
[pw-layout]: https://github.com/microsoft/playwright/blob/v1.63.0/packages/playwright-core/src/server/usKeyboardLayout.ts
[pw-click-test]: https://github.com/microsoft/playwright/blob/v1.63.0/tests/page/page-click.spec.ts
[pw-10833]: https://github.com/microsoft/playwright/issues/10833
[pw-assert]: https://playwright.dev/docs/test-assertions
[react-portal]: https://react.dev/reference/react-dom/createPortal
[react-17]: https://legacy.reactjs.org/blog/2020/08/10/react-v17-rc.html
[mdn-popover]: https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using
[bcd-popover]: https://bcd.developer.mozilla.org/bcd/api/v0/current/api.HTMLElement.popover.json
[bcd-anchor]: https://bcd.developer.mozilla.org/bcd/api/v0/current/css.properties.position-anchor.json
[css-pos4]: https://drafts.csswg.org/css-position-4/#top-layer
[css21-overflow]: https://www.w3.org/TR/CSS2/visufx.html#overflow
[mdn-cb]: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Display/Containing_block
[radix-cm]: https://www.radix-ui.com/primitives/docs/components/context-menu
[chrome-keys]: https://support.google.com/chrome/answer/157179
[ff-devtools-keys]: https://firefox-source-docs.mozilla.org/devtools-user/keyboard_shortcuts/index.html
