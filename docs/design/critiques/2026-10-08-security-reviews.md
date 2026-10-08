# Security and reviews critique (2026-10-08, T406)

**What this covers.** AC-343: Security and the audit trail (2026-09-27 design 08) and proposals and reviews (design 05).

**How it was judged.** Captures of the running app at 1,440 × 900, with sign-in on as a Super-Admin and with sign-in off.

**What the captures miss.** On the freshly prepared stack the To review list was empty, so these states were judged from the source:
- the review view (design 05's main screen and states G–L);
- the Propose dialog;
- the proposal band;
- Preview as groups;
- audit states A–D.

**Summary.** 27 findings: 2 major, 20 minor and 5 polish. Six questions for the user. Both majors are on the review view and are listed in status.md row 05 as left to build, but no open task covers them. status.md marks design 08 Complete, yet its inspector, rows and code face still differ from the drawing.

## Findings

| # | Sev. | Surface / pin | Design | App | Covered? |
|---|---|---|---|---|---|
| SEC-01 | minor | Audit inspector (08 pin 7) | A docked `<aside>` 380 px wide, full height under the top bar (`1fr 380px`); white, a left border only, no radius; a rule between sections (`.sect` 14/16) (08:148, 181–197) | A card at [1056,159,360,252]: 8 px radius, a border all round, sticky at 16 px, no rules | no |
| SEC-02 | minor | Inspector heading | `.ev.strong` 14/600; direction §3 uses only 400 and 600 | h3 14/**700** | no |
| SEC-03 | minor | Inspector fields | `.kv`: an 80 px label column, 12/16, "By" in the code face | `dt` 180 px wide; `dd` 14 px Inter | no |
| SEC-04 | minor | Audit rows (08 main) | `nowrap`, 34 px (also direction §4) | 37 px on one line, 49 px when wrapped; Event and Folder wrap; the 28 px summary button sets the floor | no |
| SEC-05 | minor | Identities and groups (08 pins 6, 4) | The User cell `td.mono`; "Group identifiers in the code face" | 12 px Inter; group names plain | no |
| SEC-06 | minor | Event icons (08 pin 5) | `text-secondary`; Proposal `i-send`, Rejection `i-xo`, Restore `i-hist` | text-primary; an up-arrow, a bare ✕, a clock without hands (`AuditTrail.tsx:224–247`) | no |
| SEC-07 | minor | Record count (08 pin 3) | "7 records · newest first" at the chips row's right end; counts written with a comma | On its own line at the left; "6787 records" (`String(total)`) | no |
| SEC-08 | polish | Time filter (08 pin 2) | 24 hours, 7 days, 30 days, All, Custom | All, Last 24 hours, Last 7 days, Last 30 days, Custom | The default "All" is an overturnable call; the order is not |
| SEC-09 | minor | User filter (08 pin 2) | "a combobox of identities in the records" | A native select; nothing can be typed | no (status.md holds back only Folder's tree picker) |
| SEC-10 | minor | Details summary (08 pin 6) | "A one-line summary" in a `nowrap` cell | An access change's summary wraps to two lines; its text starts 6 px right of its header | no |
| SEC-11 | minor | Data source change record (08 state A; not captured) | Password "Replaced" as a `.badge` with a lock; closes with an ok status line and icon, "Saved after a passing test · 14:21:07" | Plain text; secondary, with no icon and no time | The missing time is an overturnable call (Q6); the badge and icon are not covered |
| SEC-12 | minor | Access change's Before and After (08 inspector) | "Read-write groups" and "Read-only groups" as uppercase section heads, each with Before and After as two columns, one group per line; added groups green "+", removed groups red and struck through | A 56 px label grid; Before and After as rows with the groups inline | no |
| SEC-13 | polish | Security page spacing (08 main) | Main padding 14 24 (title at y 62); gap 10 | Title at y 72; 12 and 13 px gaps | no; possibly the shell's `workspace-title` |
| SEC-14 | minor | Policies' note (08 state F) | `.notebar` 12/16, the content's full width | 14/20; stops at about 744 px | no |
| SEC-15 | minor | Policies' identifiers (08 state F) | Cube, policy, group and row filter as `td.mono` | 12 px Inter (no `.query-log__query` rule exists) | no |
| SEC-16 | minor | Cubes with no policy (08 state F) | A row in secondary text: "No policy: open within its folder's groups" | A warning line with the warn triangle, 14 px, below the table | no; see Q2 |
| SEC-17 | minor | Reviews' tab strip (05 state D) | `.tabs` with no padding or ground, flush with the title | A white band at [24,110,1376,37] with 8 px side padding; ends at 1400, not 1416; Security's tabs are transparent and flush | no |
| SEC-18 | minor | To review count (05 state D) | `.count`: an accent fill, white 12/600, 18 px, radius 999 | accent-soft fill, accent text, 20 px, radius 9 | no |
| SEC-19 | minor | Top bar's Reviews control (05 state C) | `.reviews` at the body's 14/400, with the inbox icon | 12/600 with a document-and-check icon | no |
| SEC-20 | minor | "Waiting for review" (05 head, D, E, M; 2026-09-27 04 pin 4) | `.status.idle` with the clock `s-idle` ("Waiting for review (clock)") | `StatusIcon kind="run"`, the arc of running work (`reviews.ts:131`, `ReviewView.tsx:362`, `ProposalBand.tsx:105`) | no |
| SEC-21 | major | Review view (05 pin 3; not captured) | "Proposed \| Current, with Fit or Actual size": a second `.seg` | Proposed and Current only | status.md 05; no task |
| SEC-22 | major | Data source settings diff (05 state H; not captured) | "Test connection" runs the proposed settings, with "Passed when proposed · 14:21" | Not built (`SettingsDiff.tsx`) | status.md 05; no task |
| SEC-23 | minor | Reviews' summary (05 state D; not captured) | The head with its kind icon; "Dashboard → folder · replaces version n · with sales.yml"; sections PROPOSED BY and WHAT CHANGED; **Open review** last | Open review straight after the "where" line; "Proposed by" as a sentence; no icon | no |
| SEC-24 | minor | Reviews' list rows (05 state D) | An `itemicon` before each title | The title alone | no |
| SEC-25 | polish | Waiting band (05 state M) | "**Waiting for review since 14:05** · proposed to …", the lead bold | A plain `p` (the sentence after it is R52/AC-388) | weight not covered |
| SEC-26 | polish | "Proposed by" (05 pin 5) | The name, then the time on a line of its own, xs secondary | " · moment" inline | no |
| SEC-27 | polish | Preview as groups (08 state E; source only) | Opens straight on GROUPS, WHAT THESE GROUPS REACH, DASHBOARD TO PREVIEW; cube lines with no status icon | An extra h2 "Preview as groups"; a StatusIcon on each cube line | no; the dashboard beside the pane is held back |

## Measured and passing

**Security**
- Policies, Preview as groups and Audit trail are three tabs, each at its own address: 36 px, 12/600, the current one in accent with a 2 px rule.
- The page is not found for anyone but a Super-Admin.
- State F's two lines appear as drawn.
- Policy rows are 34 px.

**The audit trail**
- **Filters:** they are kept in the address. Event takes several kinds, all 12 of them, including designs 15 and 16's. Chips, "and subfolders" and Clear filters are there.
- **Times:** "Today", "Yesterday", then the date, to the second, with UTC in the title (T477). The inspector adds "(16:33:39 UTC)".
- **The table:** `aria-sort` on the Time column; records a page at a time; the selected row on accent-soft; headers 12/600 on bg-subtle.
- **The rest:** the retention is said; "Records can't be edited…"; state C's states; state B's "1 break named, 1 counted".

**Reviews**
- **The control:** hidden from those who may not decide; with no reviews waiting, its pill is hidden.
- **The page:** a third tab, Calculation requests (R60); the empty My proposals text matches; both tables' columns match; the user's own proposals are marked "Yours".

**The review view (source)**
- Back to the same row, with "n of m" and Previous/Next.
- The bundle's list, the changed-tile marks, "Folder moved on" and the publish-check line.
- The Approve confirmation, Reject's reason and its counter, "Approve my own proposal", Withdraw… and the collapsible panels (R54).

**The proposal band (source):** state M as drawn. The waiting sentence follows R52.

**Held back:**
- Folder's tree picker.
- Tiles a group doesn't reach.
- State E's dashboard beside the pane.
- Models bundled with their YAML diff (T350).

## Questions for the user

1. **What Security shows with sign-in off.** Design 08 is silent. The app shows phase 1's floating "Preview a security context" pane with JSON and an unexplained "Find a dashboard", which is UX-085. That was Claude's call, not the user's.
   - (a) Keep it.
   - (b) Show Preview as groups with sign-in off too.
   - (c) Keep the JSON preview, but dock it and explain "Find a dashboard".
2. **Policies' columns.**
   - State F draws: Cube or view, Policy, Groups, Rows, Members, with "No policy" as a row. Its text also says "Phase 1's listing stays (AC-165, AC-169, AC-170)".
   - The app keeps phase 1's: Cube / view, Group, Members, Rows, Conditions, Masked, Source.
   - (a) The drawn columns.
   - (b) Phase 1's, with the drawn "No policy" row.
3. **Cell padding and filter heights.**
   - Design 08 draws `td` padding 0 10, with filter buttons 28 px.
   - direction §4 says 8 px inline padding and 32 px controls.
   - The app has 8 px padding and 28 px filters.
   - (a) Design 08 for both.
   - (b) direction for both.
   - (c) Keep the mix.
4. **A refused publish's name.**
   - Design 08 state B: "Proposal · refused by the publish check", with the send icon.
   - Design 16 state I, which is later: "Publish refused". The app follows it, an overturnable call.
   - (a) Keep "Publish refused".
   - (b) State B's heading in the inspector, with "Publish refused" in the filter.
5. **The To review count at 0.** State C hides the top bar's pill at 0. State D is silent about the tab. The app shows "0".
   - (a) Hide it.
   - (b) Show 0.
6. **A data source change's test time.** State A shows "· 14:21:07"; the record doesn't keep it.
   - (a) Record and show it.
   - (b) Drop it from the design.

## Suggested grouping

| Group | Findings | Notes |
|---|---|---|
| The audit inspector as drawn | SEC-01, -02, -03, -11, -12 | AC-295 |
| The audit table and filter bar | SEC-04 to SEC-10 | AC-295, AC-294 |
| Policies as state F | SEC-14, -15, -16 | AC-165, AC-169; after Q2 |
| The Reviews page and the top bar's control | SEC-17, -18, -19, -23, -24 | AC-287, rule 76 |
| The proposal's status icon and band | SEC-20, -25 | AC-290, rule 79 |
| The review view's missing controls | SEC-21, -22, -26 | AC-343, AC-287; capture the review view with a proposal waiting |
| Preview as groups and the page's spacing | SEC-27, -13 | AC-166 |
