# wechart tasks: lane MCP's finished tasks' notes (archive), from T769 on; the rest are in [`tasks-done.md`](./tasks-done.md)

### P2.24 The MCP server and the SQL runner workspace (F41, F42, added 2026-10-17, `[R78]`)

- [x] T769 (AC-430, AC-468, AC-469, AC-479) The Access tokens page at `/account/tokens`, from the account menu and the single-user chip, with its list and the New token dialog, as design 18 screens 1 and 2 draw them
  - Lane: MCP
  - Files: `packages/web/src/account/AccessTokensPage.tsx` (+ test), `packages/web/src/account/NewTokenDialog.tsx` (+ test), `packages/web/src/account/tokensApi.ts`, `packages/web/src/shell/AccountMenu.tsx` (+ test), `packages/web/src/router/routes.tsx`, `e2e/security/access-tokens.spec.ts`, `e2e/access-tokens-single-user.spec.ts`.
  - Failing test: `NewTokenDialog.test.tsx`: the dialog offers a name, Read checked and locked, Workspace edit and Proposals and jobs, and 7, 30 or 90 days with 30 chosen at the start; for a user read-only in every folder, Workspace edit and Proposals and jobs are disabled with the reason (AC-468, AC-469); a refusal from the API is shown with its reason. `AccessTokensPage.test.tsx`: each working token's row shows its name, scopes as text tags, made, expires and last used, and never any part of its text (AC-430). `e2e/security/access-tokens.spec.ts`: "Access tokens" in the account menu opens the page, and a token made there is listed. `e2e/access-tokens-single-user.spec.ts`: with sign-in off, the single-user chip's menu opens the same page and a token can be made (AC-479).
  - Depends on: T767
  - **Built 2026-10-17** (lane MCP). **AC-468 is ticked.** The page offers 7, 30 or 90 days with 30 chosen (`NewTokenDialog.test.tsx` and the security e2e), and the API refuses 120 days (`routes/access-tokens.test.ts`). AC-430, AC-469 and AC-479 stay open for T770, the scope checks on the MCP tools, and `/mcp` respectively.
    - **The page:**
      - The heading, New token, the lead sentence, and the groups note. With sign-in off, state H's note replaces the groups note.
      - The working tokens in a `grid-table` named "Your tokens", with these columns:
        - Name;
        - Scopes, as 12 px outlined text tags in a list;
        - Made;
        - Expires, as "‹day› · in N days", rounded against clock drift, or "Expires today · HH:MM";
        - Last used, as "Today 14:05" or "Never".
      - The shown-once note, and "What a token can do".
      - Loading, "Your tokens couldn't be read." with Try again, and "No tokens yet".
      - New token is held until `/api/me` answers, so a read-write user never sees the read-only state.
    - **Left for later tasks:** "Connect a client" (the server URL and command) waits for T774's MCP host. The limits wait for the rate-limit tasks. Revoke and "No longer working" are T771.
    - **The dialog:**
      - It is 520 px wide, and focus starts on Name, which has `maxlength` 100.
      - Read is checked and disabled, with a lock and "Always included".
      - The other two scopes are offered unchecked. For a user without a My workspace (`hasWorkspace`), they are disabled, with design 18 A5's reason as their description.
      - "Expires in" is a radio group of native radios, styled as the segmented choice, with "on ‹day›" beside it and "No token lasts longer than 90 days." under it.
      - Create token is held until there is a name. A refusal shows the API's reason, and an unreachable API shows design 18 B3's words.
      - Cancel or Esc asks first, with the app's DiscardQuestion, once a name has been typed. Esc at that question keeps editing.
      - After Create token the dialog closes and the list refreshes. T770 turns this moment into the shown-once view.
    - **The account menu:** "Access tokens", with design 18's key icon, goes above Sign out, and after the heading in the single-user chip's menu. It opens `/account/tokens` through the menu's `navigate`. Focus on opening now lands on Access tokens, the first item, so that one existing assertion changed with it.
    - **Dates:** `dayOf` shows the year only when it isn't this year's (T477's one way of writing dates). Design 18 draws the year on every date; that difference is the lane's call.
    - **The signed-in e2e runs as `super`.** `writer` has a My workspace only in a folder that grants `sales-rw`, and a fresh stack has none. `reader` covers A5.
    - **Tests:**
      - Unit: `NewTokenDialog.test.tsx` (11), `AccessTokensPage.test.tsx` (8), `AccountMenu.test.tsx` (+2).
      - e2e on headless Chromium: `e2e/security/access-tokens.spec.ts` (2) and `e2e/access-tokens-single-user.spec.ts` (1).
