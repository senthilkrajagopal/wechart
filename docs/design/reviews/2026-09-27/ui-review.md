# wechart UI review: phase 2 surfaces and the New data source wizard (2026-09-27)

**Reviewer's brief:** you said "the ui for the wizard looks bad". The brief was to review phase 2's screens as a senior designer of enterprise BI tools, say specifically why the wizard looks bad (measured where possible), and design what phase 2 still needs from the spec, for you to approve. Applying the designs is a later step.

**What was compared**

- **App:** http://localhost:8089, Helm revision 30 on docker-desktop (deployed 2026-09-27 03:27), with sign-in on (Dex). Driven with Playwright 1.63 and system Chrome at 1440 × 900, light and dark, and at 390 × 844. It was signed in as `super`, `writer`, `reader`, `manager`, `many` and `nobody` from `infra/dex/test-users.json`. Values quoted as "measured" come from `getComputedStyle` / `getBoundingClientRect`.
- **Approved prototype:** http://127.0.0.1:5500 (`docs/design/prototype/`), especially `admin-sources.js`: the list, the detail pane and the add-connection wizard in a right-hand pane.
- **Rules:** `docs/design/direction.md` (§3–5 tokens, §7c, §7e, rules 59–89), `docs/design/references.md` › Phase 2 › Surfaces 1–10, `docs/spec.md` F18 and F25–F36, `docs/requirements.md` Part 2, and T363 / T461 in `docs/tasks.md`.
- **Code read** for what couldn't be reached live: `packages/web/src/workspaces/data-sources/{NewSourceWizard,ConnectionForm,CubeState,DataSourcesPage}.tsx`, `packages/core/src/data-sources/drivers.ts`, `e2e/security/new-data-source.spec.ts`, `workspaces/explore/{ExplorePage,CreateMenu,NewItemDialog,roots}.tsx` and `access/AccessPanel.tsx`.
- **Screenshots:** `screens/` (77 files; index in §3). `app-*` is the app, `proto-*` the prototype, and `dark-*` and `narrow-*` are the dark theme and 390 px checks.
- **Designs:** `designs/` (10 mockups and `designs/index.md`).

**What the review changed in the app.** Nothing was created, saved, approved or deleted: every dialog was cancelled, and no folder, dashboard or data source was made.

- **One connection test was run** in the wizard: PostgreSQL against `superset-postgresql.superset.svc.cluster.local:5432/northwind` as `postgres`, with a wrong password and TLS off. As built (T363), a test for a source not yet made is kept as a "trial" row in the metadata database, so that row exists now.
- **Signing in** each test user recorded their sign-ins.
- **One sign-out** was done, for `nobody`, in its own browser session.

**What couldn't be checked live.** The wizard's Name step, since it needs a passing test and the review had no password. Every role's intended view, since no folder in this environment grants any group, so `writer`, `reader`, `manager`, `many` and `nobody` all see the same thing. Proposals, Reviews, History and the audit trail, which aren't built.

**Labels.**

- **Severity:** *critical* means a core task breaks, work is lost or access leaks; *major* means real friction or confusion on a main path, or something you called out; then *minor* and *polish*.
- **Class:** *usability*, *aesthetics*, *consistency*, *accessibility*, *prototype-mismatch* or *spec-gap*. *spec-gap* means an acceptance criterion's visible behaviour isn't there yet.
- **Proposal — needs the user's approval** marks any recommendation that would add something not in `docs/spec.md`.

---

## 1. Summary

**Why the wizard looks bad.** It's functionally right: eight drivers, each driver's own sign-in methods, a Test step that shows xcube's checks, and no way past Test without a pass. It looks and feels bad for five measurable reasons:

1. **It never holds still.** The dialog is centred and sized to its content, so its top moves 277 → 91 → 32 → 163 → 227 px and its height 347 → 868 px as you move through steps and drivers. The primary button jumps between y 592, 642, 705, 778 and 836 (UX-201).
2. **It scrolls inside itself.** The Snowflake key pair (873 of 836 px), PostgreSQL client certificate (987) and MySQL client certificate (1,015) scroll under a sticky footer that cuts the last field (UX-202).
3. **The first choice is eight identical grey buttons.** Each is 261 × 32 at 14/400, with no mark and no hint of how the driver signs in. The selected one differs only by an outline and a pale tint, and a focused tile looks the same (UX-203, UX-216).
4. **The forms aren't grouped by what they ask.** TLS checkboxes (Chrome blue) sit between Database and Sign in. A 94 px CA box is always shown. Ways to sign in hide in a native select. Dremio shows the Cloud URL and the Software host together; Oracle shows a connect string and host/port/service with no "or" (UX-204 … UX-206).
5. **The Test step is prose.** Nothing is shown before running. After it: "Passed: Open the secrets · 1 ms" rows, the driver's error run on after an em dash, and the outcome repeated under the button (UX-208). The title is 21/700, off the type scale (UX-209). Esc throws away a typed connection and a passed test without asking (UX-211).

**Beyond the wizard,** phase 2's structure is mostly missing from the running app, and some of what's missing is an access problem, not a look:

- Every signed-in user sees the full switcher, Model included. Security opens for a reader, and Model shows a reader New cube and Generate cubes (UX-231).
- Shared folders offer ＋ New › Dashboard/Chart and "+ Folder" to users who can't write, `nobody` included (UX-230, UX-233).
- Shared items are edited in place ("Edit" on a shared dashboard; a model opens in `/model` with Save & reload Cube) (UX-241).
- My workspace is the last root with no band (UX-234).
- There's no Reviews control, no Propose, no History, no audit trail, and no data-source settings page (UX-222, UX-260, UX-270).

**The 10 most important changes**

1. **Rebuild the wizard as a fixed-height docked pane,** as the approved prototype has it. Add a step rail, a pinned footer, recognisable type tiles, forms grouped *where → how it signs in → TLS*, and a Test step you can read (UX-201 … UX-216). Designs 01, 02.
2. **Make either/or connections explicit:** Dremio Cloud or Software, and Oracle's connect string or host and service name (UX-206). Design 02.
3. **Shape the shell by role:** the switcher per AC-001, no Model entry, Security for Super-Admins only, and no create affordances for anyone who can't create (UX-230, UX-231). Designs 04, 09.
4. **Give a stored data source its settings page** (T461): type fixed, secrets as "Stored · encrypted", test history, usage, Cube state. Put the test gate beside the form so "test, then save" is visible while editing (UX-222). Design 03.
5. **Make My workspace a place:** first in the tree, banded, with each item's origin, target and status, and New with Model and a real target picker (UX-234 … UX-236). Design 04.
6. **Stop in-place editing of shared items.** "Edit in my workspace" / "Open my copy", History, and read-only models under the folder breadcrumb (UX-241). Designs 04, 06.
7. **Build proposals end to end:** Propose, the Reviews count, the Reviews page, and a review view that draws the item, with Approve (confirmed) and Reject with a reason (UX-270). Design 05.
8. **Redraw the Access panel's editing:** Add group inside each list, help lines, pending changes marked, Cancel with Save *n* changes, and the audit note (UX-250, UX-251). Design 07.
9. **Split Security into Policies, Preview as groups and Audit trail,** reworded for phase 2 (UX-260). Design 08.
10. **Fix the listing's Owner column:** it shows a raw identity 614 px wide and makes Explore scroll sideways (UX-237).

---

## 2. Findings by screen

### 2.1 New data source wizard: your note

Reached from Data sources › "+ Data source" and from Explore › My workspace › ＋ New › Data source. Screens `app-14`, `app-21` … `app-29`, `dark-20`, `dark-23`, `narrow-03`, `narrow-04`; prototype `proto-01` … `proto-07`.

**UX-201 · major · usability — The dialog changes size and position at every step and driver**
- **Measured:**

  | Step or driver | Top (px) | Height (px) |
  |---|---|---|
  | Type | 277 | 347 |
  | PostgreSQL | 91 | 719 |
  | Redshift | 102 | 695 |
  | MySQL | 163 | 574 |
  | Snowflake | 32 | 836 (capped) |
  | BigQuery | 188 | 525 |
  | SQL Server | 152 | 597 |
  | Oracle | 159 | 583 |
  | Dremio | 163 | 574 |
  | Test, failed | 227 | 447 |

  The primary button moves with it: y 592 (Type), 778 (PostgreSQL), 836 (Snowflake), 705 (Dremio), 642 (Test).
- **Why it matters:** Next, Back and Cancel are the controls used on every step. When they move, you have to find them again each time, and a click aimed at Next can land on Cancel. It also reads as unstable and unfinished, which is much of "looks bad".
- **Recommend:** a fixed frame. A full-height docked pane, with the header and step rail pinned at the top and the actions pinned at the bottom (UX-213). Order the actions Back on the left, then Cancel and the primary on the right; today it's Cancel, Back, Next. Name the primary for where it goes ("Next: Test"). **Design 01.**

**UX-202 · major · usability — Long forms scroll inside the dialog, under a sticky footer**
- **Measured at 900 px high:**

  | Form | Content height (px) | Visible (px) |
  |---|---|---|
  | Snowflake, key pair | 873 | 836 |
  | PostgreSQL, client certificate | 987 | 836 |
  | MySQL, client certificate | 1,015 | 836 |

  The footer covers "Client key (PEM)" (`app-24-…-client-certificate`, `app-23-wizard-conn-snowflake`).
- **Recommend:** the fixed pane scrolls only its body, with the footer outside the scroll. Collapse the CA box (UX-204) and pasted keys (Design 02) so the common forms fit without scrolling. **Designs 01, 02.**

**UX-203 · major · aesthetics / usability — Driver choice is eight identical text buttons**
- **Measured:** 261 × 32 px buttons, 14/400, `border-strong`, no icon. Selected: accent border and `accent-soft` fill, weight unchanged. The group is a `fieldset` of `aria-pressed` toggles, each its own Tab stop; it isn't a radio group. Its "Type" legend repeats the step pill "1. Type".
- **Prototype:** the same two-column grid of buttons, so the prototype is no better here. Superset and Metabase both show database marks.
- **Why it matters:** the choice fixes the data source's type for good (AC-161). It deserves to be recognisable and to say what each driver needs, especially how it signs in, which decides whether you can connect at all.
- **Recommend:** 64 px tiles with a mark, the name, and the driver's ways to sign in from `drivers.ts` ("Key pair, OAuth token or password"). Make them a radio group (arrow keys move, Enter continues), and add a line that the type can't change later. **Design 01, state A.** **Proposal — needs the user's approval:** use each vendor's own logo from its brand kit once licence terms are checked, with the monogram as the fallback.

**UX-204 · major · usability — Fields aren't grouped by what they ask**
- **Saw:** a "Connection" legend over host, port, database, then "Use TLS", "Verify the server's certificate" and a 94 px "CA certificate (PEM)" box, then a "Sign in" legend. TLS for SQL Server is "Encrypt the connection" / "Trust the server's certificate", between Database and Sign in. Legends are 14/600 and sit 2 px left of their fields.
- **Why it matters:** where it connects, how it signs in, and how the channel is secured are three separate questions with different owners (DBA, security, network). Mixing them makes the form read as one long list.
- **Recommend:** three groups, **Where it connects**, **How it signs in** and **TLS**, with section headings in the prototype's style (12/600 uppercase, `text-secondary`). Show the CA box only through "Add a CA certificate (PEM)". **Designs 01, 02.**

**UX-205 · major · usability — Ways to sign in are hidden in a native select**
- **Saw:** "Sign in with" is a native select for PostgreSQL, MySQL, Snowflake (3 methods), SQL Server (3) and Dremio (2). A driver with one method shows its name as a plain paragraph ("Password").
- **Why it matters:** the method decides the whole lower half of the form, yet it looks like a minor field. The alternatives can't be seen without opening it. The closed select is 11 px in WebKit (direction §3).
- **Recommend:** a segmented control for two methods and radio rows for three. A single method is stated, not offered. **Design 02.**

**UX-206 · major · usability — Either/or connections are shown as "fill everything"**
- **Saw:** Dremio shows "Dremio Cloud project URL", "Host (Dremio Software)", Port, "Use HTTPS (Dremio Software)" and Database at once (`app-23-wizard-conn-dremio`). The Password method's "Dremio Software only" note appears only after it's chosen. Oracle shows "Connect string", Host, Port and "Service name" with no "or" (`app-23-wizard-conn-oracle`).
- **Research:** xcube needs a Dremio `url` *or* `host`, and a `url` takes only a token. Oracle needs `connectString`, *or* `host` and `database` (`docs/research/xcube-slice-6.md`). The wrong mix is refused only at Test.
- **Recommend:** ask first. Dremio gets two cards, Cloud or Software, each saying what it takes. Oracle gets a segmented "Connect string | Host and service name". Show only the chosen shape's fields. **Design 02.** **Proposal — needs the user's approval:** warn when a Dremio Cloud URL starts with `http://` (research Gotcha 19 and your open question 6 in that doc).

**UX-207 · major · usability — Nothing is required until the driver says so**
- **Saw:** no field is marked required. Next on the Connection step is enabled with every field empty (`NewSourceWizard.tsx`: `canNext` is true at step 1), so a missing host surfaces as a driver error at Test.
- **Recommend:** "· required" in each label (text, not just an asterisk). Next checks the required fields, marks each missing one with its reason, and moves focus to the first. **Design 01, state B.**

**UX-208 · major · usability — The Test step is hard to read before, during and after**
- **Before** (`app-26`): a heading, "xcube connects with Cube's own driver for it, and says how each check went", and a secondary "Run test". There's no list of what will be checked and no summary of what's being tested.
- **After** (`app-28`): rows "Passed: Open the secrets · 1 ms" at 14 px. The failure is one 60 px row: "Failed: Connect · 4 ms — Unable to connect to the database (postgres#xcube_connection_test): password authentication failed for user "postgres"", in the UI face, not code. The outcome is said again under "Run again" ("The test failed at Connect."). There's no path back to the field to fix.
- **Also:** the copy names **xcube**, an internal component users don't know.
- **Recommend:**
  - Before: a "What will be tested" summary with Edit, and AC-159's four checks listed as not run, with the rule stated once. Make **Test connection** the primary.
  - During: checks tick off.
  - After: a one-line outcome at the top. The failed check opens in place with a line on what to check, the driver's text in the code face (as xcube redacted it), and links back to the right group.
  - Say "Cube" rather than "xcube".
  - **Design 01, states C–F, L.**

**UX-209 · minor · aesthetics — Off-scale title, and step pills that don't show progress**
- **Measured:** the dialog `h2` is 21 px / 700, the browser's default. Direction §3 has no 21 px size and allows weights 400 and 600 only. Step pills are 12/400 and 26 px tall; only the current one differs, by an accent border. Done steps aren't marked, and the pills can't be clicked.
- **Recommend:** a 16/600 pane title and a numbered step rail: done steps show a check and can be clicked to go back; the current step is filled. **Design 01.**

**UX-210 · minor · consistency / accessibility — TLS uses native checkboxes in Chrome's blue**
- **Measured:** `accent-color: auto`, 13 × 13 px. The same off-brand blue the phase-1 review flagged on radios (UX-035). The prototype uses switches.
- **Recommend:** switches, as the prototype has them. **Design 01.**

**UX-211 · major · usability — Esc and Cancel discard work without asking**
- **Measured:** after typing and choosing a type, Escape closed the dialog at once (dialog count 0 afterwards). A passed test, and the secret typed for it, would go the same way.
- **Rule 85:** Esc closes, "asking first when there are unsaved changes".
- **Recommend:** "Discard this data source?" with the focus on Keep editing. **Design 01, state I.**

**UX-212 · minor · usability — Repeated and stale hints**
- **Saw:** "Encrypted in your browser before it is sent, and never shown again." appears under every secret, twice for a Snowflake key pair. For MySQL's client certificate, "Sent only over TLS: turn on Use TLS." shows when the form has already turned TLS on.
- **Recommend:** one hint per group with a lock icon. A client certificate turns TLS on and locks the switch, giving the reason. **Designs 01, 02.**

**UX-213 · major · prototype-mismatch — A modal over the list, where the approved prototype has a pane beside it**
- **Prototype:** `admin-sources.js` puts the wizard in a 400 px right pane beside the Data sources list (`proto-02` … `proto-05`).
- **Decision on the evidence:** a pane. Reasons:
  - It matches the approved prototype and the other phase-2 panels (Access, History).
  - It gives a stable frame (UX-201).
  - The list stays visible while naming (AC-270, AC-282).
  - Its one risk, losing typed work to a stray click, is handled by the discard question (UX-211).
  - The full comparison is in Design 01.
- **Recommend:** 480 px (the top of direction §2's inspector range), full height. In Explore it docks where the Access panel docks. Below 1,024 px it becomes a full-screen sheet. **Design 01.**

**UX-214 · minor · usability — The Name step (from code; not reachable without a passing test)**
- **Code:** the name hint is long and in prose. The target folder is a native select of path labels, so the same list as the New dashboard dialog shows two "New folder" entries here. A 409 for a name the target already holds (AC-282) comes back as a generic error line under the step.
- **Recommend:** the target as a tree of full paths (read-write folders only), the name's preview `data_source: name`, a "Tested" summary, "Create in My workspace", and the 409 shown on the field, naming the existing item (AC-270). **Design 01, states G–H.**

**UX-215 · polish — The Type step's legend and the step pill both say "Type"** (`app-21`). Drop the legend, or make it the question ("Which database?"). **Design 01.**

**UX-216 · minor · accessibility — Focus and selection look alike on the tiles**
- **Saw (`app-29`):** Tab moved focus to Amazon Redshift while PostgreSQL was selected. Both show an accent outline; only the faint fill tells them apart.
- **Recommend:** a radio group with one Tab stop and arrow keys, a check or filled mark for the selected tile, and a separate focus ring. **Design 01, state A.**

### 2.2 Data sources page

Screens `app-20`, `app-52`, `app-55-reader-sources`, `dark-20`, `narrow-02`.

**UX-220 · minor · usability — "Used by" makes one source a 204 px row**
- **Measured:** the `default` row is 204 px tall, because each of its nine cubes gets its own line with its folder repeated ("categories · Shared" …).
- **Recommend:** a count ("9 cubes"). Hovering or focusing it lists the cubes with their folders. **Design 01.**

**UX-221 · minor · usability — Health and Updated are timestamps to the second**
- **Saw:** "Passed · 9/27/2026, 3:27:56 AM" and "9/27/2026, 1:12:49 AM".
- **Recommend:** "Passed · 2 h ago", with the exact time in a tooltip (references surface 4). **Design 01.**

**UX-222 · major · spec-gap — Data sources don't open anywhere**
- **Saw:** a data source's row in Explore has `cursor: pointer` but opens nothing (`app-06`). In Data sources the name isn't a link either. There's no settings page (T461: AC-269's open half, AC-161's fixed type and Cube state, AC-163's history).
- **Why it matters:** the affordance promises something it doesn't do, and without the page there's no way to see a source's history or whether Cube uses its settings.
- **Recommend:** Design 03. Until T461 lands, drop the pointer cursor on those rows.

**UX-223 · polish · aesthetics — Filters and the note**
- **Saw:** filter labels are 12 px text beside native selects, baseline misaligned ("Folder", "Driver", "Health"). The page note uses the clock ("idle") icon for information. Names aren't in the code face.
- **Recommend:** filter buttons like the other admin pages, an info icon, and names in the code face. **Design 01.**

### 2.3 Explore, My workspace and New

Screens `app-02` … `app-14`, `app-42`, `app-43`, `app-50-*`, `app-56`, `dark-01`, `narrow-01`.

**UX-230 · critical · usability — Create actions are offered to people who can't create**
- **Saw:** with no folder granting them anything:
  - `writer`, `reader`, `manager`, `many` and `nobody` all see "+ Folder" and "＋ New ▾" in the Shared root, and New offers Dashboard, Chart and Folder (`app-50-*`, `app-56-reader-new-menu`).
  - The reader's Model page offers New cube, New view and Generate cubes (`app-55-reader-model`).
  - The review didn't click them, so whether the API refuses wasn't checked.
- **Rules:** rule 68 and AC-277: a read-only user has "no '+ Folder', New menu, My workspace, Access, History or pencil".
- **Why it matters:** offering an action that fails, or worse, succeeds, undermines trust in the permission model on the first screen.
- **Recommend:** render create actions only where the user may create. **Designs 04 (state G), 09 (state G).**

**UX-231 · major · spec-gap — The switcher shows every workspace to every role, and Security opens for anyone**
- **Saw:** every role's switcher reads Explore · Model · Data sources · Jobs · Schedules · Security (`app-50-*`).
- **Security as a reader** (`app-55-reader-security`) renders the Access policies page, with the warning "Could not tell whether Cube refuses requests without a valid token". For `super` the same page, a minute apart, says "Cube refuses requests without a valid token". The review didn't trace why the check answers differently for a non-Super-Admin.
- **AC-001:** Explore to everyone; Data sources, Jobs and Schedules to Super-Admins and read-write members; Security to Super-Admins; no Model entry.
- **Recommend:** the switcher per role (**Design 09, state A**), and Not found for `/security` when not a Super-Admin (**Design 08, state D**). This is T331's.

**UX-232 · major · usability — Signed in with access to nothing, the page names a folder and invites creating**
- **Saw (`app-50-nobody`):** a root named "Shared", "+ Folder", ＋ New, and "This folder is empty. Use ＋ New to add a dashboard or chart."
- **Rule 61:** an empty state "that names no folder and says access comes from AD groups".
- **Recommend:** surface 1's text. **Design 09, state G.**

**UX-233 · major · spec-gap — A shared folder's New menu offers Dashboard and Chart**
- **Saw:** in the Shared root (a shared folder), New lists Dashboard, Chart and Folder (`app-04`). Per `ExplorePage.tsx`, Dashboard or Chart makes one on the spot in the shared folder.
- **AC-192:** in a shared folder the menu offers Folder only; references add the footnote pointing to My workspace.
- **Recommend:** Folder only, and the footnote. **Design 04, state C.**

**UX-234 · major · prototype-mismatch — My workspace isn't a place yet**
- **Saw (`app-11`):**
  - It's the last root, below the shared tree, with the folder-style ◉ and no divider.
  - There's no "My workspace · only you can see this" band.
  - The empty state is the generic "This folder is empty. Use ＋ New to add a dashboard or chart."
  - The footnote is phase 1's "Charts are shared…".
  - The listing has no Status, and no origin or target lines.
- **Rules:** 72 and 73; references surface 5.
- **Recommend:** **Design 04.**

**UX-235 · major · spec-gap — New in My workspace lacks Model**
- **Saw (`app-12`):** Dashboard, Chart, Data source, Folder.
- **AC-192:** Dashboard, Chart, Model, Data source, Folder (T347).
- **Recommend:** **Design 04.**

**UX-236 · major · usability — "New dashboard in My workspace": a select that can't be read**
- **Measured (`app-13`):** 520 px dialog; title 21/700.
- **Saw:** Target folder is a native select listing "Shared", "New folder", "New folder / New folder", so two entries read "New folder". With three targets nothing is preselected, and Create stays disabled without saying why. The note says "until you propose it to this folder" before any folder is chosen.
- **Recommend:** a tree of full paths, read-write folders only, with a filter past about ten (references surface 5). The note names the chosen folder, and the title is 16/600. **Design 04, states A–B.**

**UX-237 · major · usability — Owner shows a raw identity and makes Explore scroll sideways**
- **Measured (`app-02`):** Owner cells are 614 px wide ("78688298da09:CiQwMDAwMDAwMC0w…"), so the table is 1,627 px in a 1,180 px pane, and the scroller is 1,675 px wide. Opening the Access panel left the listing scrolled so the Name column was out of view (`app-07`).
- **Decision 8:** Owner is the author of the current version.
- **Recommend:** the author's display name, ellipsized, with the identity in a tooltip. **Designs 04, 09.**

**UX-238 · minor · spec-gap / aesthetics — The folder header lacks the access chip, and its notice has no icon**
- **Measured (`app-02`):** "Only Super-Admins can see this folder" is 12/400 `text-muted` text. "Access" is a 12 px borderless button with no lock icon. There's no Super-Admin / Read-write / View only chip.
- **Rules:** 63 and 69.
- **Recommend:** chips with icon and label, and Access with its lock icon. **Designs 04, 07, 09.**

**UX-239 · minor · usability — Tree counts leave out models, data sources and folders**
- **Saw:** Shared reads "1 · 1 item" while its listing holds 13 items (1 folder, 1 dashboard, 10 models, 1 data source).
- **AC-194:** counts "how many items it and its subfolders hold".
- **Recommend:** count every visible item.

**UX-240 · minor · consistency — Search and footnote wording from phase 1**
- **Saw:** "Search dashboards and charts" in folders holding models and data sources, and "Charts are shared: a chart used on several dashboards is edited once…" under every listing, empty roots and My workspace included.
- **Recommend:** "Search *folder*", and a footnote per place (Design 04).

**UX-241 · major · spec-gap — Shared items are edited in place**
- **Saw:**
  - A shared dashboard's primary action is **Edit** (`app-42`).
  - A model opened from Explore goes to `/model/files/cubes%2Forders.yml` with the Model tab active, "Save & reload Cube", New cube and New view, and no folder breadcrumb (`app-43`).
  - Nothing offers Edit in my workspace, Open my copy or History.
- **Rules:** AC-278, rules 70 and 71.
- **Recommend:** **Designs 04 (states C, E, F) and 06.**

**UX-242 · polish — Row menus**
- **Saw:** a dashboard's row menu has Rename and Move to… only (`app-05`). Model and data-source rows have no menu.
- **Recommend:** Open, Edit in my workspace / Open my copy, History, Rename, Move to…, Delete… (Design 04, state C).

### 2.4 Access panel

Screens `app-07`, `app-09`, `app-10`, `dark-07`. Its behaviour is built (T330): counted Save, outranked notes, Undo, the self-lockout question. The findings are about layout and wording.

**UX-250 · major · usability — One add form under both lists, and no suggestions**
- **Saw:** below both lists sit an "AD group" input, an "Access" native select (Read-write / Read-only) and "Add". The labels are 14 px, inline to the left of the controls. Focusing the group box shows no suggestions (`app-10`).
- **Surface 2:** "+ Add group" in each list, with "Your groups" and "Used on other folders" suggestions.
- **Recommend:** Add group inside each list (the list is the level), the combobox with its two suggestion groups, and free entry "as typed". **Design 07, state A.**

**UX-251 · minor · usability / aesthetics — No help, no Cancel, no audit note; the title doesn't carry the path**
- **Saw:** the title is "Folder access · Shared" at 14/600. There are no help lines for what each level allows, and the "Only Super-Admins…" notice has no icon. The footer is a lone "Save", with no Cancel and no "recorded in the audit trail" note.
- **Recommend:** surface 2's title, help lines and footer, and pending changes marked "Adding" / "Removing" with Keep. **Design 07.**

**UX-252 · polish — Empty inherited lists read "None."** where the surface says "Not set here. Inherits from *folder*." (only the Set here half says it today). **Design 07, state B.**

### 2.5 Security

Screens `app-40`, `app-54`, `app-55-reader-security`.

**UX-260 · major · spec-gap — One page, phase-1 copy, a JSON context, and no audit trail**
- **Saw:**
  - No tabs.
  - "Users and groups come in phase 2. In phase 1, policies are authored in the model…".
  - A "Security context (JSON)" editor, where AC-166 (amended) chooses groups.
  - "Find a dashboard" with no stated purpose, in a pane floating on a white card (UX-085, still open).
  - No audit trail (AC-295).
- **Recommend:** Policies · Preview as groups · Audit trail. **Design 08.**

### 2.6 Proposals, Reviews, History and bookmarks

**UX-270 · major · spec-gap — Not built**
- **Saw:** `/reviews` answers Not found (`app-46`). The top bar has no Reviews control. Nothing offers Propose or History.
- **Recommend:** **Designs 05 and 06.** Bookmarks' Mine/Shared popover (AC-293) wasn't reviewed live; it's drawn in **Design 10**.

### 2.7 Sign-in and account

**UX-280 · polish — The account menu is good** (`app-03`, `app-57`): name, identity, a Super-Admin badge for Super-Admins only, and Sign out (rule 59). Keep it. The only gap is the missing Reviews control beside it (UX-270).

**UX-281 · minor · usability — Signing out lands on the provider's form**
- **Saw (`app-58`):** Sign out goes straight to Dex's "Log in to Your Account" (`app-01`).
- **Surface 1:** wechart's own "You've signed out of wechart. [Sign in again]".
- **Why it matters:** on a shared machine the next person sees a sign-in form rather than a clear signed-out state. Surface 1 also has four more wechart-rendered states: sign-in failed, no group list, session ended, and no access.
- **Recommend:** **Design 09, states C–G.** Dex's own page is the development provider's and out of scope; production uses Entra ID.

### 2.8 What each role sees today

No folder in revision 30 grants any group, so every non-Super-Admin sees the same thing. That is itself the evidence for UX-230 … UX-232.

| Test user | Groups | Switcher | Explore | Data sources | Security | Model |
|---|---|---|---|---|---|---|
| `super` | wechart-super-admins | all six, Model included | Shared tree, then My workspace last; every item; New offers Dashboard, Chart, Folder; Access | list and "+ Data source" | opens | opens, editable |
| `writer` | sales-rw (granted nowhere) | all six | an empty "Shared", "+ Folder", ＋ New | "Data sources are available to read-write members of a folder", no "+ Data source" | opens, warning "Could not tell whether Cube refuses…" | not opened |
| `reader` | sales-ro (granted nowhere) | all six | same as writer; New offers Dashboard, Chart, Folder | same note | opens, same warning | New cube, New view, Generate cubes; "There are no model files." |
| `manager`, `many`, `nobody` | managers; g01–g20; none | all six | same as writer | not opened | not opened | not opened |

`/api/me` gives `readWrite: false` for every one of them, and `/api/folders/targets` returns `[]`. The designs draw each role as the spec intends: Designs 04 (read-write member, reader) and 09 (switcher per role, no access).

### 2.9 Dark theme and narrow windows

**UX-290 · polish — Dark theme** (`dark-01`, `dark-07`, `dark-20`, `dark-23`): complete, and no dark-only defects. The wizard's native checkboxes and selects keep the platform's chrome, and the modal has no border against the dark backdrop. Design 01, state J, shows the pane in dark.

**UX-291 · minor · usability — 390 px**
- **Wizard:** fits (358 px wide, 739 of 780 px tall; `narrow-04`).
- **Explore** (`narrow-01`): the tree keeps 260 of 390 px, leaving about 130 px for the listing (phase-1 UX-092, still open; AC-304 covers only the app bar).
- **Recommend:** Design 01, state K, for the wizard. Explore below 1,024 px still needs your decision, as the 2026-09-24 review said.

### 2.10 Accessibility (cross-cutting)

- **UX-216:** focus and selection look alike on the type tiles (above).
- **UX-205:** native selects render at 11 px in WebKit: the sign-in method, the target folder, the Access level, and the Data sources filters.
- **UX-211:** Esc discards the wizard without asking (rule 85).
- **Rule 3:** every status in the designs pairs an icon with a label. The as-built Test checks do too ("Passed:" plus icon), so there's no regression to fix there.

---

## 3. Screenshot index

| File | Shows |
|---|---|
| app-01-signin-dex | The development provider's sign-in form (Dex) |
| app-02-explore-super | Explore as Super-Admin: My workspace last, Owner overflow, header without chips |
| app-03-account-menu-super | Account menu: name, identity, Super-Admin badge, Sign out |
| app-04-new-menu-shared-root | New in a shared folder offers Dashboard, Chart, Folder |
| app-05-row-menu-dashboard | A dashboard's row menu: Rename, Move to… |
| app-06-row-hover-data-source | A data source's row: pointer cursor, opens nothing |
| app-07-access-panel-root | Access panel on the root; listing scrolled sideways |
| app-08-explore-subfolder | A subfolder (Rename, notice, Access) |
| app-09-access-panel-subfolder / app-10-access-panel-combobox | Access panel on a subfolder; the group box focused, no suggestions |
| app-11-my-workspace-super | My workspace: no band, generic empty state |
| app-12-new-menu-my-workspace | New in My workspace: no Model |
| app-13-new-dashboard-dialog | New dashboard in My workspace: title 21/700, ambiguous target select |
| app-14-wizard-from-workspace | The wizard opened from Explore |
| app-20-data-sources-super | Data sources: 204 px row, absolute times |
| app-21-wizard-type / app-22-wizard-type-selected | Type step; a type selected |
| app-23-wizard-conn-* | Connection step for each driver (postgres, redshift, mysql, snowflake + bottom, bigquery, mssql, oracle, dremio) |
| app-24-wizard-conn-* | Each further sign-in method (postgres and mysql client certificate + bottom, snowflake oauth and password, mssql ntlm and entra, dremio password) |
| app-25-wizard-conn-postgres-filled-tls-off | The form filled for the review's test |
| app-26 / app-27 / app-28-wizard-test-* | Test step: before, running, failed at Connect |
| app-29-wizard-type-focus | Focus on a tile while another is selected |
| app-40-security-super | Security as Super-Admin |
| app-42-dashboard-shared-super | A shared dashboard with in-place Edit |
| app-43-model-from-explore | A shared model opened in /model, editable |
| app-44-jobs-super / app-45-schedules-super | Jobs and Schedules (no pre-aggregations, no Folder column) |
| app-46-reviews-route | /reviews: Not found |
| app-50-explore-{writer,reader,manager,many,nobody} | Explore per test user: the same empty Shared with create actions |
| app-52-data-sources-writer | Data sources for a user without read-write folders |
| app-54-security-writer | Security opened by writer |
| app-55-reader-{sources,jobs,model,security} | What a reader can open |
| app-56-reader-new-menu / app-57-reader-account-menu | A reader's New menu; a reader's account menu |
| app-58-signed-out | After Sign out: the provider's form |
| dark-01, dark-07, dark-20, dark-23 | Dark: Explore, Access panel, Data sources, wizard (Snowflake) |
| narrow-01 … narrow-04 | 390 × 844: Explore, Data sources, wizard Type and Connection |
| proto-01 … proto-07 | Prototype Data sources: list, wizard Type / Connection / Test / Name, detail Connection and Test |
| proto-08, proto-09 | Prototype Explore and Security |

## 4. Designs

See `designs/index.md`. Ten mockups:

1. New data source wizard
2. Driver forms
3. Data source settings (T461)
4. My workspace
5. Proposals and Reviews
6. History and restore
7. Access panel
8. Security and the audit trail
9. Sign-in, account and roles
10. Jobs by folder, bookmarks and the cube picker
