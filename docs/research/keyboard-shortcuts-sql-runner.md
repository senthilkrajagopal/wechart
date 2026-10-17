---
library: Browser and OS keyboard-shortcut reachability for the SQL runner (no package), with CodeMirror 6's keymaps
packages: []
version: "Chrome 156.0.8078.36, Edge 155.0.4283.62, Firefox 158.0, Safari 27 (behaviour read from trunk source and vendor help pages on 2026-10-17, not run in these builds); @codemirror/view 6.43.12 and @codemirror/commands 6.11.1 (installed), @codemirror/search 6.7.2 (registry latest, not installed), @codemirror/autocomplete 6.20.3 (installed)"
researched: 2026-10-17
sources: [https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/ui/accelerator_table.cc, https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/ui/browser_command_controller.cc, https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/global_keyboard_shortcuts_mac.mm, https://raw.githubusercontent.com/chromium/chromium/main/ui/events/keycodes/platform_key_map_win.cc, https://raw.githubusercontent.com/chromium/chromium/main/ui/events/event.cc, https://raw.githubusercontent.com/mozilla-firefox/firefox/main/browser/base/content/browser-sets.inc.xhtml, https://raw.githubusercontent.com/mozilla-firefox/firefox/main/dom/events/GlobalKeyListener.cpp, https://raw.githubusercontent.com/mozilla-firefox/firefox/main/widget/windows/KeyboardLayout.cpp, https://support.google.com/chrome/answer/157179, https://support.microsoft.com/en-us/microsoft-edge/keyboard-shortcuts-in-microsoft-edge-50d3edab-30d9-c7e4-21ce-37fe2713cfad, https://support.apple.com/guide/safari/keyboard-and-other-shortcuts-cpsh003/mac, https://support.apple.com/guide/voiceover/navigation-commands-cpvokys04/mac, https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/getModifierState, https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_code_values, https://devblogs.microsoft.com/oldnewthing/20040329-00/?p=40003, https://kbdlayout.info/]
---

# Keyboard shortcuts the SQL runner can receive (Chrome 156, Edge 155, Firefox 158, Safari 27)

## Summary

This doc checks whether the SQL runner's approved keys reach the page, so the page gets the `keydown` and can `preventDefault` it, in current Chrome, Edge, Firefox and Safari on macOS and Windows. It answers design 17's Q3 ("Do R78-12's keys reach the page?", `docs/design/reviews/2026-10-17/designs/index.md`). It covers AC-480 (Ctrl+Q, Ctrl+Alt+[ and ]), AC-455 (⌘/Ctrl+S, ⌘/Ctrl+F) and AC-387 (⌘/Ctrl+Enter). AC-456 (autocomplete) comes up only where its keymap meets these keys.

| Key (AC) | Reaches the page? | Recommended binding |
|---|---|---|
| Ctrl+Q, new tab (AC-480) | **Yes** on all eight browser and OS pairs in scope. Firefox reserves it only on Linux, which is out of scope. | Workspace `keydown`. Match the letter `q` on `event.key`, fall back to `code === 'KeyQ'` for non-Latin layouts, and require Control without Alt, Meta or Shift. |
| Ctrl+Alt+[ and Ctrl+Alt+], previous and next tab (AC-480) | **No, not everywhere.** On many Windows layouts these keys type a character. On macOS, VoiceOver uses Control+Option+[ and ]. | Match on `event.code` (`BracketLeft`/`BracketRight`) with `ctrlKey && altKey`. Where the key types a character or VoiceOver takes it, the fallback is the tab bar's own buttons. **This is a conflict, and per 17-Q3 it goes back to the user.** |
| ⌘/Ctrl+S, save (AC-455) | **Yes** in Chrome, Edge and Firefox, by source. Safari is UNVERIFIED. | Workspace `keydown`, always `preventDefault`. |
| ⌘/Ctrl+F, find in the editor (AC-455) | **Yes** in Chrome, Edge and Firefox, by source. Safari is UNVERIFIED. | `@codemirror/search`'s `Mod-f`. It returns `true`, so CodeMirror calls `preventDefault`. |
| ⌘/Ctrl+Enter, run (AC-387) | **Yes.** No browser binds it outside the address bar. | Keep the existing `Prec.highest` `Mod-Enter` in `SqlEditor.tsx`. |

## Install

Nothing new for the tab and Save keys; they use plain DOM `keydown`. For editor find (AC-455), `@codemirror/search` **6.7.2** (MIT) depends on `@codemirror/view ^6.37.0`, `@codemirror/state ^6.0.0` and `crelt ^1.0.5` ([registry](https://registry.npmjs.org/@codemirror/search/latest)). It is already listed in `docs/research/code-editor.md`'s `packages:` but has no pinned version there. The installed `@codemirror/view` 6.43.12 satisfies it. The registry's latest view is 6.43.14 ([registry](https://registry.npmjs.org/@codemirror/view/latest)), and `@codemirror/commands` 6.11.1 is still latest ([registry](https://registry.npmjs.org/@codemirror/commands/latest)).

## Init / auth pattern

No auth. Two places handle keys:

1. **Inside the editor:** CodeMirror keymaps. Its keydown handler is registered on the content element (`EditorView.domEventHandlers` doc, `node_modules/.pnpm/@codemirror+view@6.43.12/node_modules/@codemirror/view/dist/index.js:8720-8734`). When a handler returns `true`, CodeMirror calls `event.preventDefault()` (`view/dist/index.js:4576-4577`). It calls `stopPropagation()` only for bindings marked `stopPropagation` (`view/dist/index.js:9203-9211`, `9244-9245`).
2. **Workspace-wide (Ctrl+Q, Ctrl+Alt+[ ], ⌘/Ctrl+S):** one `keydown` listener on the workspace root. Editor keydowns bubble up to it, so it should skip `event.defaultPrevented` events, which the editor has already handled.

Check for a Mac the same way CodeMirror does, so the editor and the workspace agree on what Mod means. `w3c-keyname` tests `/Mac/.test(navigator.platform)` (`node_modules/.pnpm/w3c-keyname@2.2.8/node_modules/w3c-keyname/index.js:83`), and `@codemirror/view` maps `Mod` to Meta on `mac` and to Ctrl elsewhere (`view/dist/index.js:9037`, `9054-9059`).

## API surface we will use

### Where each key stands, per browser

**How browsers reserve keys**
- **Chromium (Chrome, Edge):** reserved commands are `IDC_CLOSE_TAB, IDC_CLOSE_WINDOW, IDC_NEW_INCOGNITO_WINDOW, IDC_NEW_ISOLATED_WINDOW, IDC_NEW_TAB, IDC_NEW_WINDOW, IDC_RESTORE_TAB, IDC_SELECT_NEXT_TAB, IDC_SELECT_PREVIOUS_TAB, IDC_CYCLE_TO_NEXT_TAB, IDC_CYCLE_TO_PREV_TAB, IDC_EXIT` ([accelerator_table.cc][cr-acc]; `IsReservedCommandOrKey` in [browser_command_controller.cc][cr-bcc]).
  - `PreHandleKeyboardEvent` lets the browser "handle keyboard events before sending to the renderer". `HandleKeyboardEvent` handles "unhandled keyboard messages coming back from the renderer" ([web_contents_delegate.h][cr-wcd]).
  - A non-reserved shortcut is "not handled and should be forwarded to the renderer" ([keyboard_event_processing_result.h][cr-kepr]).
  - So Save and Find go to the page first, and the browser acts only if the page didn't handle them.
  - In app windows (`TYPE_APP`), "no keys are reserved" ([cr-bcc]).
- **Firefox:** a `<key reserved="true">` is marked `MarkAsReservedByChrome()`. That calls `StopCrossProcessForwarding()` and sets `mOnlySystemGroupDispatchInContent = true`, so "event listeners added to the default group for non-chrome EventTarget won't be called" ([BasicEvents.h][ff-basic], [GlobalKeyListener.cpp][ff-gkl]). In other words, the page never sees a reserved key.
  - Firefox's reserved keys are `key_newNavigator`, `key_newNavigatorTab`, `key_close`, `key_closeWindow`, `key_privatebrowsing` and `key_quitApplication` ([browser-sets.inc.xhtml][ff-sets]).
  - Non-reserved shortcuts run in `WalkHandlers`, which returns early `if (aKeyEvent->DefaultPrevented())` ([GlobalKeyListener.cpp][ff-gkl]).

#### 1. Ctrl+Q (Control on macOS too)

| Browser | Windows | macOS |
|---|---|---|
| Chrome | Reaches the page. The only Ctrl+Q accelerator is in `kAndroidAcceleratorMap` under `#if BUILDFLAG(IS_ANDROID)` ([cr-acc]). Quit is "Alt + f then x" ([Chrome help][chrome-help]). | Reaches the page. Quit is "⌘ + q" ([chrome-help]), and no Control-only Q shortcut is in `GetShortcutsNotPresentInMainMenu` ([global_keyboard_shortcuts_mac.mm][cr-mac]). |
| Edge | Reaches the page. The help page lists no Ctrl+Q; Quit is "Command+Q" on macOS only ([Edge help][edge-help]). Edge-only accelerators beyond the help page are UNVERIFIED. | Reaches the page ([edge-help]). |
| Firefox | Reaches the page. Quit is `modifiers="accel,shift"` under `#ifdef XP_WIN`, so it's Ctrl+**Shift**+Q, and it's `reserved="true"` ([ff-sets]; key letter `Q` in [browserSets.ftl][ff-ftl]). | Reaches the page. Quit is `accel`+Q, `internal="true"` on `XP_MACOSX` ([ff-sets]). That `accel` means ⌘ on macOS is UNVERIFIED: Mozilla's support page didn't load. |
| Safari | Not applicable: Apple's shortcuts guide is for Mac only ([Safari help][safari-help]). | Reaches the page. Safari's Control shortcuts are Control-Tab, Control-Shift-Tab and Control-Command-1/2; none is Control-Q ([safari-help]). macOS's own is Control-**Command**-Q, "Lock your screen" ([Mac shortcuts][mac-shortcuts]). |

- **Firefox on Linux (outside the matrix):** Ctrl+Q is quit (`accel`, not `XP_WIN`) and reserved, so the page never gets it ([ff-sets], [ff-basic]). That answers "Ctrl+Q quits Firefox on Linux and Windows?": **Linux yes, and reserved. Windows no: there it's Ctrl+Shift+Q.**
- **⌘ must not count.** ⌘Q quits Chrome, Edge and Firefox on macOS (see the macOS column). AC-480 already says Control rather than ⌘.
- **CodeMirror binds no Ctrl-q** in `defaultKeymap`, `standardKeymap`, the Mac emacs bindings or `historyKeymap` (`@codemirror/commands/dist/index.js:570-574`, `1695-1709`, `1743-1817`), nor in `searchKeymap` ([search 6.7.2 dist][cm-search]).
- **Match on `key`, not `code`.** MDN warns that `code` "KeyQ" is "the A key on AZERTY keyboards" ([MDN code][mdn-code]). The French layout puts the letter Q on scan code 1e ([KBDFR klc][klc-fr]), and MDN maps 0x0010 to "KeyQ" ([MDN code values][mdn-codevals]). So use `event.key` and fall back to `code === 'KeyQ'` only when `key` isn't a Latin letter. CodeMirror falls back the same way, from `key` to `keyCode` (`view/dist/index.js:9221-9234`).
- **AltGr+Q** (German "@", `10 Q … 0040` in [KBDGR klc][klc-gr]) arrives without Control (see AltGr below), so a Ctrl+Q check that requires `!altKey` never sees it.

#### 2. Ctrl+Alt+[ and Ctrl+Alt+] (Control+Option on macOS)

**Windows: AltGr is Ctrl+Alt.**
- Raymond Chen: "Ctrl+Alt is also known as AltGr, and it acts as an alternate shift key"; German "@" is AltGr+Q ([Old New Thing][oldnew]).
- Chromium won't ship Ctrl+Alt accelerators on Windows. The check is `DCHECK((mapping.modifiers & kCtrlAlt) != kCtrlAlt) << "Accelerators with Ctrl+Alt are reserved by Windows."` ([cr-acc]).

**What the page sees when Ctrl+Alt (or AltGr) types a character:**
- **Chromium, Windows:**
  - `DomKeyFromKeyboardCode` says: "If this is an AltGraph modified key then |flags| will have Control+Alt removed, and AltGraph set" ([platform_key_map_win][cr-pkm]).
  - `KeyEvent` applies those flags to the keydown under `#elif BUILDFLAG(IS_WIN)` ([event.cc][cr-event]).
  - `EF_ALTGR_DOWN` becomes `kAltGrKey`, and Control and Alt are no longer set ([blink_event_util.cc][cr-blink]).
  - So the page gets `key: "["`, `ctrlKey: false`, `altKey: false` and `getModifierState('AltGraph') === true`. This is read from source; it wasn't observed in a browser.
- **Firefox, Windows:**
  - The real AltGr key (`VK_RMENU` on a layout with AltGr) sets only `MODIFIER_ALTGRAPH`.
  - Pressing Ctrl and Alt sets both. Then, if "the key produces character(s) or a dead key with AltGraph modifier", Firefox runs `mModKeyState.Unset(MODIFIER_CONTROL | MODIFIER_ALT); mModKeyState.Set(MODIFIER_ALTGRAPH);` on keydown.
  - The comment adds: "if Ctrl and/or Alt are pressed (not to emulate to press AltGr), we need to set actual modifiers to eKeyDown and eKeyUp" ([KeyboardLayout.cpp][ff-kl]).
  - MDN's Firefox table says `AltGraph` on Windows is "Both Alt and Ctrl keys are pressed, or AltGr key is pressed" ([MDN getModifierState][mdn-gms]).
- **`code` names the physical key.** It is "not affected by the current keyboard layout or modifier state" ([UI Events][uievents]). Scan codes 0x001A and 0x001B are `BracketLeft` and `BracketRight` in Firefox and Chrome ([mdn-codevals]).

**So on Windows,** `ctrlKey && altKey` is true only when the keys type nothing on the active layout. A check on `code` plus `ctrlKey && altKey` therefore never takes a typed character from the user. On layouts where those keys do type something, though, the shortcut can't be reached at all. Here is the AltGr (Ctrl+Alt) column for the two keys on each layout, from Microsoft's layout files as published by kbdlayout.info:

| Windows layout | AltGr + `BracketLeft` (scan 1a) | AltGr + `BracketRight` (scan 1b) | Ctrl+Alt+[ reachable | Ctrl+Alt+] reachable | Source |
|---|---|---|---|---|---|
| United Kingdom | nothing | nothing | yes | yes | [KBDUK][klc-uk] |
| Polish (Programmers) | nothing | nothing | yes | yes | [KBDPL1][klc-pl1] |
| Dutch | nothing | nothing | yes | yes | [KBDNE][klc-ne] |
| German | nothing (ü key) | `~` | yes | **no** | [KBDGR][klc-gr] (`[` `]` are AltGr+8/9) |
| French | nothing (`^` dead key) | `¤` | yes | **no** | [KBDFR][klc-fr] (`[` is AltGr+5, `]` AltGr on scan 0c) |
| Swedish / Finnish | nothing (å) | `~` (dead) | yes | **no** | [KBDSW][klc-sw], [KBDFI][klc-fi] |
| Danish / Norwegian | nothing (å) | `~` (dead) | yes | **no** | [KBDDA][klc-da], [KBDNO][klc-no] |
| Brazilian (ABNT) | nothing | `ª` | yes | **no** | [KBDBR][klc-br] |
| Portuguese | `¨` (dead) | `]` | **no** | **no** | [KBDPO][klc-po] |
| Swiss German | `[` | `]` | **no** | **no** | [KBDSG][klc-sg] |
| Belgian French | `[` | `]` | **no** | **no** | [KBDBE][klc-be] |
| Spanish | `[` | `]` | **no** | **no** | [KBDSP][klc-sp] |
| Italian | `[` | `]` | **no** | **no** | [KBDIT][klc-it] |
| Hungarian | `÷` | `×` | **no** | **no** | [KBDHU][klc-hu] |
| United States-International | `«` | `»` | **no** | **no** | [KBDUSX][klc-usx] |

- **Matching on `key` instead is worse.** Where `[` comes from AltGr+8 (German, Nordic), `key` is `"["` but Control and Alt have been cleared, so a `key === '['` + `ctrlKey && altKey` check fails. Where the bracket key itself types something, `key` isn't `"["`.
- **CodeMirror skips its `keyCode` fallback under Ctrl+Alt on Windows.** The source comment says "Ctrl-Alt may be used for AltGr on Windows" (`view/dist/index.js:9221-9223`). So a CodeMirror `"Ctrl-Alt-["` binding matches only when `event.key` is `"["`, which makes it a `key`-based match too.

**macOS**
- **No browser or system binding.** None of Chrome's macOS-only shortcuts uses Control+Option with [ or ] ([cr-mac]). Safari's bracket shortcuts all use ⌘ (Command-[ and ] for back and forward, Shift-Command-[ and ] for tabs) ([safari-help]). Apple's system list has no Control+bracket shortcut ([mac-shortcuts]). Firefox's only Control and Ctrl+Alt keys are X and U, for sidebars ([ff-sets], [ff-ftl]).
- **VoiceOver takes both keys.** "VO represents the VoiceOver modifier… By default, you can press Control and Option together or just press Caps Lock" ([VoiceOver general][vo-general]). "VO-Left Bracket" and "VO-Right Bracket" move to the previous and next window spot ([VoiceOver navigation][vo-nav]). With VoiceOver on, Control+Option+[ and ] go to VoiceOver unless the user passes them through with "VO-Tab", which tells "VoiceOver to ignore the next key or key combination you press" ([vo-general]). That is a direct conflict with AC-176 keyboard use for screen-reader users.
- **Option changes `key`.** Option types other characters ("To see additional characters and symbols you can type, press one or more modifier keys (such as Option and Shift)", [Keyboard Viewer][mac-kv]). CodeMirror notes that "Alt-combinations on macOS tend to be typed characters" (`view/dist/index.js:9224-9225`). What `event.key` reports for Control+Option+[ is UNVERIFIED. `code` is `BracketLeft`/`BracketRight` for `kVK_ANSI_LeftBracket`/`RightBracket` in Firefox and Chromium ([mdn-codevals]).
- **Firefox on macOS** reports `getModifierState('AltGraph')` as true whenever "⌥ Option key pressed" ([mdn-gms]). So an `AltGraph` guard written for Windows would block the shortcut on a Mac.
- **The printed key can differ.** On a German Mac layout, the physical `BracketLeft` key isn't labelled `[`. To show the right legend, `navigator.keyboard.getLayoutMap()` works in Chrome and Edge 69+, but not in Firefox or Safari ([BCD][bcd-kb]). It needs a secure context and may be blocked by a permissions policy ([MDN getLayoutMap][mdn-glm]).

**Other keys that would collide**
- Chrome reserves `IDC_SELECT_NEXT_TAB`/`PREVIOUS_TAB` (Ctrl+PageDown/PageUp) and `IDC_NEW_TAB` (Ctrl/⌘+T) ([cr-acc]). On macOS it also binds ⌘+Shift+[ ] and ⌘+Option+←/→ to switch tabs ([cr-mac]).
- Safari uses ⌘-[ and ] (back and forward) and Shift-⌘-[ and ] (tabs) ([safari-help]).
- Firefox binds `accel`+[ and ] (back and forward) under `#ifdef XP_UNIX` (`goBackKb2`/`goForwardKb2`, [ff-sets], [ff-ftl]).
- CodeMirror binds `Mod-[` and `Mod-]` to `indentLess`/`indentMore` (`@codemirror/commands/dist/index.js:1809-1810`).
- Any second binding (17-Q3's option b) would need the same per-layout check.

#### 3. ⌘/Ctrl+S and ⌘/Ctrl+F

- **Chrome:** `IDC_SAVE_PAGE` and `IDC_FIND` are `EF_PLATFORM_ACCELERATOR` + S or F ([cr-acc]). Neither is in `kReservedCommandIds` ([cr-acc]), so the page gets them first and can `preventDefault` them ([cr-wcd], [cr-kepr]).
- **Edge:** same Chromium code. Edge-only overrides are UNVERIFIED. Its help page lists Ctrl+S "Save the current page" and Ctrl+F "Open find on page" ([edge-help]).
- **Firefox:** `key_savePage` (accel+S) and `key_find` (accel+F) carry no `reserved` ([ff-sets]), and `WalkHandlers` skips them when the page called `preventDefault` ([ff-gkl]).
- **Safari:** UNVERIFIED. Fetching WebKit's `WebViewImpl::performKeyEquivalent` failed at both paths tried, so whether a page's `preventDefault` stops Safari's ⌘S and ⌘F menu items isn't sourced. It needs a manual check in Safari 27. Playwright's WebKit build doesn't run Safari's menus; that point is itself UNVERIFIED.
- **Editor find:** `searchKeymap` binds `{ key: "Mod-f", run: openSearchPanel, scope: "editor search-panel" }` ([cm-search]), and `openSearchPanel` returns `true` on every path ([cm-search]). So CodeMirror calls `preventDefault` (`view/dist/index.js:4576-4577`). Outside the editor, the browser's own find stays, as AC-455 requires.

#### 4. ⌘/Ctrl+Enter

- **Browsers:** Chrome, Edge and Safari bind it only in the address bar: "Type a site name + Ctrl + Enter" ([chrome-help]), "text typed in the address bar" ([edge-help]) and "Command-Return after typing in the Smart Search field" ([safari-help]). Firefox's `browser-sets.inc.xhtml` has no `VK_RETURN` key ([ff-sets]).
- **CodeMirror:** `defaultKeymap` binds `Mod-Enter` to `insertBlankLine` (`@codemirror/commands/dist/index.js:1806`). `SqlEditor.tsx:70-74` already overrides it at `Prec.highest`.
- **Autocomplete:** `completionKeymap` is also `Prec.highest`, but it binds plain `Enter` (accept) plus `Ctrl-Space`, and on macOS `Alt-\`` and `Alt-i` (`@codemirror/autocomplete@6.20.3/dist/index.js:2063-2074`). Neither binds `Mod-Enter`.

### CodeMirror: adding or overriding a key

- **Order:** "the ones specified early or with high priority get checked first. When a handler has returned `true` for a given key, no further handlers are called" (`keymap` doc, `view/dist/index.js:9089-9097`).
  - So `Prec.high(keymap.of([...]))` or `Prec.highest(...)` goes ahead of `keymap.of(defaultKeymap)`.
  - `completionKeymap` is itself `Prec.highest` (`autocomplete/dist/index.js:2074`). Among highest-precedence extensions, the one listed first wins.
- **Matching:** the event name is built as `Shift-`, `Meta-`, `Ctrl-`, `Alt-` plus `key` (`view/dist/index.js:9073-9083`), and `Mod` becomes Meta on a Mac and Ctrl elsewhere (`9054-9059`).
- **`preventDefault: true`** on a binding prevents the default even when `run` returns `false` (`view/dist/index.js:9208-9212`). `scope` defaults to `"editor"` (`9162`).
- Example for find, in the editor only:

```ts
import { search, searchKeymap } from '@codemirror/search';
extensions: [ search({ top: true }), Prec.high(keymap.of(searchKeymap)), keymap.of([...defaultKeymap, ...historyKeymap]) ]
```

`searchKeymap` also binds F3/`Mod-g` (find next), `Escape` (close panel), `Mod-Shift-l`, `Mod-Alt-g` (go to line) and `Mod-d` (select next occurrence, `preventDefault: true`) ([cm-search]). Include all of it, or only `Mod-f`, as planning decides.

### Recommended bindings (workspace `keydown` listener)

```ts
const isMac = /Mac/.test(navigator.platform);              // same test as w3c-keyname
const letter = (e: KeyboardEvent, l: string, code: string) =>
  e.key.toLowerCase() === l || (!/^[a-z]$/i.test(e.key) && e.code === code);

function onWorkspaceKeyDown(e: KeyboardEvent) {
  if (e.defaultPrevented || e.isComposing) return;
  const onlyCtrl = e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
  const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (onlyCtrl && letter(e, 'q', 'KeyQ')) { e.preventDefault(); newTab(); }          // AC-480
  else if (e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey &&
           (e.code === 'BracketLeft' || e.code === 'BracketRight')) {              // AC-480
    e.preventDefault(); e.code === 'BracketLeft' ? prevTab() : nextTab();
  } else if (mod && !e.altKey && !e.shiftKey && letter(e, 's', 'KeyS')) { e.preventDefault(); save(); } // AC-455
}
```

- **The tab keys use `code`, because `key` fails on AltGr layouts and under Option.** Using `ctrlKey && altKey` (not `AltGraph`) yields to typing on Windows, because Chromium and Firefox clear both flags whenever the keys type something ([cr-pkm], [ff-kl]). It also still works on a Mac, where Firefox sets `AltGraph` for Option ([mdn-gms]).
- **Fallback:** where the table shows "no", or VoiceOver is on, the tab bar's buttons are the way in. Per 17-Q3 (a), this conflict goes back to the user, who can accept the fallback or approve a second binding (17-Q3 b).
- **`isComposing`** is a guard I added, not a sourced finding: an IME composition shouldn't fire shortcuts. Its use here is UNVERIFIED.

## Gotchas

- **Dead keys on Nordic and Portuguese layouts.** Firefox clears Ctrl and Alt for a dead key too (`mKeyNameIndex == KEY_NAME_INDEX_Dead`, [ff-kl]). Chromium's comment talks about "AltGraph modified key" and doesn't mention dead keys ([cr-pkm]). Whether Chrome and Edge report `ctrlKey && altKey` for AltGr+`BracketRight` on a Nordic layout is UNVERIFIED. If they do, the code-based check would fire "next tab" and swallow the `~` dead key.
- **Ctrl+Alt is still Ctrl+Alt where it types nothing.** On UK, US, Dutch or Polish (Programmers) layouts, `key` under Ctrl+Alt is UNVERIFIED, which is one reason to match on `code`.
- **Firefox on Linux reserves Ctrl+Q** ([ff-sets], [ff-basic]). That's out of scope, but if Linux is ever in scope, Ctrl+Q can't work there.
- **Installed apps.** In a Chromium app window "no keys are reserved" ([cr-bcc]). In fullscreen, everything but `IDC_FULLSCREEN` and `IDC_EXIT` goes to the page ([cr-bcc]). Neither changes the keys here.
- **jsdom** isn't a Mac, so `Mod` is Ctrl in unit tests (`docs/research/code-editor.md`, 2026-10-01 addendum). AltGr layouts, VoiceOver and Safari's ⌘S/⌘F can't be shown in jsdom. Whether Playwright can emulate a Windows AltGr layout is UNVERIFIED, so these need manual checks.
- **The visible hint.** Showing "Ctrl+Alt+[" misleads German, French and Nordic users, whose physical key has another legend. Only Chrome and Edge can read the layout ([bcd-kb]).
- **Event order.** The editor's keydown runs before the workspace listener and doesn't stop propagation. Without the `defaultPrevented` check, a `Mod-Enter` handled in the editor could also reach workspace handlers.

## Alternatives considered

Not asked for. The other bindings that are ruled out are listed under "Other keys that would collide" (Ctrl+PageUp/PageDown, Ctrl/⌘+T, ⌘+Shift+[ ], `Mod-[`/`]`), each with its source.

## Open questions / unverified

- **For the user (17-Q3):** on Windows, Ctrl+Alt+] can't be reached on the German, French, Nordic, Brazilian, Swiss, Belgian, Spanish, Italian, Portuguese, Hungarian and US-International layouts, and Ctrl+Alt+[ can't on the last seven. On macOS, VoiceOver takes both keys. Which layouts does the enterprise use? And should we keep the tab-bar fallback only, or approve a second binding (17-Q3 b)?
- UNVERIFIED: Safari 27 honouring `preventDefault` on ⌘S and ⌘F. The WebKit source fetch failed at `Source/WebKit/UIProcess/mac/WebViewImpl.mm` (function not in the truncated text) and at `.../Cocoa/WebViewImpl.mm` (404).
- UNVERIFIED: `event.key` for Control+Option+[ on macOS, and for Ctrl+Alt+[ on Windows layouts where it types nothing.
- UNVERIFIED: Chromium's handling of AltGr dead keys (see Gotchas).
- UNVERIFIED: that `accel` is ⌘ in Firefox on macOS. support.mozilla.org didn't load.
- UNVERIFIED: Edge-only accelerators beyond Chromium's and the Edge help page. Edge's source isn't public.
- UNVERIFIED: whether a VoiceOver user can drop Control+Option as the VO modifier. Apple's page says only that "by default" both Control+Option and Caps Lock work.
- Not checked: Windows screen readers (NVDA, JAWS, Narrator) and vendor hotkey utilities on Ctrl+Alt+[ and ].
- Behaviour was read from trunk source (`main`) and vendor help pages on 2026-10-17, not run in each browser and OS. The frontmatter versions are the stable releases current that day: [Chrome][v-cr] 156.0.8078.36, [Edge][v-edge] 155.0.4283.62 (2026-10-16), [Firefox][v-ff] 158.0 (2026-10-13), [Safari][v-sf] 27 (27.2 is in beta).

[cr-acc]: https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/ui/accelerator_table.cc
[cr-bcc]: https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/ui/browser_command_controller.cc
[cr-mac]: https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/global_keyboard_shortcuts_mac.mm
[cr-wcd]: https://raw.githubusercontent.com/chromium/chromium/main/content/public/browser/web_contents_delegate.h
[cr-kepr]: https://raw.githubusercontent.com/chromium/chromium/main/content/public/browser/keyboard_event_processing_result.h
[cr-pkm]: https://raw.githubusercontent.com/chromium/chromium/main/ui/events/keycodes/platform_key_map_win.h
[cr-event]: https://raw.githubusercontent.com/chromium/chromium/main/ui/events/event.cc
[cr-blink]: https://raw.githubusercontent.com/chromium/chromium/main/ui/events/blink/blink_event_util.cc
[ff-sets]: https://raw.githubusercontent.com/mozilla-firefox/firefox/main/browser/base/content/browser-sets.inc.xhtml
[ff-ftl]: https://raw.githubusercontent.com/mozilla-firefox/firefox/main/browser/locales/en-US/browser/browserSets.ftl
[ff-gkl]: https://raw.githubusercontent.com/mozilla-firefox/firefox/main/dom/events/GlobalKeyListener.cpp
[ff-basic]: https://raw.githubusercontent.com/mozilla-firefox/firefox/main/widget/BasicEvents.h
[ff-kl]: https://raw.githubusercontent.com/mozilla-firefox/firefox/main/widget/windows/KeyboardLayout.cpp
[chrome-help]: https://support.google.com/chrome/answer/157179?hl=en&co=GENIE.Platform%3DDesktop
[edge-help]: https://support.microsoft.com/en-us/microsoft-edge/keyboard-shortcuts-in-microsoft-edge-50d3edab-30d9-c7e4-21ce-37fe2713cfad
[safari-help]: https://support.apple.com/guide/safari/keyboard-and-other-shortcuts-cpsh003/mac
[mac-shortcuts]: https://support.apple.com/en-us/102650
[mac-kv]: https://support.apple.com/guide/mac-help/use-the-keyboard-viewer-on-mac-mchlp1015/mac
[vo-general]: https://support.apple.com/guide/voiceover/general-commands-cpvokys01/mac
[vo-nav]: https://support.apple.com/guide/voiceover/navigation-commands-cpvokys04/mac
[mdn-gms]: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/getModifierState
[mdn-code]: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
[mdn-codevals]: https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_code_values
[mdn-glm]: https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/getLayoutMap
[bcd-kb]: https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Keyboard.json
[uievents]: https://w3c.github.io/uievents/
[oldnew]: https://devblogs.microsoft.com/oldnewthing/20040329-00/?p=40003
[cm-search]: https://unpkg.com/@codemirror/search@6.7.2/dist/index.js
[klc-uk]: https://kbdlayout.info/kbduk/download/klc
[klc-pl1]: https://kbdlayout.info/kbdpl1/download/klc
[klc-ne]: https://kbdlayout.info/kbdne/download/klc
[klc-gr]: https://kbdlayout.info/kbdgr/download/klc
[klc-fr]: https://kbdlayout.info/kbdfr/download/klc
[klc-sw]: https://kbdlayout.info/kbdsw/download/klc
[klc-fi]: https://kbdlayout.info/kbdfi/download/klc
[klc-da]: https://kbdlayout.info/kbdda/download/klc
[klc-no]: https://kbdlayout.info/kbdno/download/klc
[klc-br]: https://kbdlayout.info/kbdbr/download/klc
[klc-po]: https://kbdlayout.info/kbdpo/download/klc
[klc-sg]: https://kbdlayout.info/kbdsg/download/klc
[klc-be]: https://kbdlayout.info/kbdbe/download/klc
[klc-sp]: https://kbdlayout.info/kbdsp/download/klc
[klc-it]: https://kbdlayout.info/kbdit/download/klc
[klc-hu]: https://kbdlayout.info/kbdhu/download/klc
[klc-usx]: https://kbdlayout.info/kbdusx/download/klc
[v-cr]: https://versionhistory.googleapis.com/v1/chrome/platforms/win/channels/stable/versions?pageSize=3
[v-edge]: https://edgeupdates.microsoft.com/api/products
[v-ff]: https://product-details.mozilla.org/1.0/firefox_versions.json
[v-sf]: https://developer.apple.com/tutorials/data/documentation/safari-release-notes.json
