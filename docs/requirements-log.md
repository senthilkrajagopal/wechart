# wechart requirements: the interview log

The rounds of questions and the user's answers behind [`docs/requirements.md`](./requirements.md), word for word. Moved out of that file on 2026-10-17 (the user's decision) to keep it small. These are live decisions, not history: `[R76]` in the spec or tasks means round R76 here.

# Phase 1

### 9. Interview log

Questions are Claude's; answers are the user's, verbatim.

**R1 — Problem**

- Q: "What problem does wechart solve, and for whom?" (options: replace Spotfire on Cube / Cube has no real BI front end / other BI tools bypass the model / no UI for running Cube)
  A: "Create a BI tool that is better than what exists today.. leveraging cube to the best possible way"
- Q (follow-up, vagueness): better than which tool, and for whom?
  A: "Superset and Metabase, Spotfire"
- Q (clarification asked by the user, answered in their own words):
  A: "Idea is to build a BI tool.. that can eventually replace spotfire. By my analysis, cubes model is almost similar to spotfire so going with cube."
- Q: "What makes replacing Spotfire worth doing?"
  A: "Desktop client and IT overhead, Licence cost per seat, Data has to be loaded into it"
- Q: "Who is wechart being built for?"
  A: "Your own organisation"

**R2 — Users**

- Q: "Which roles will use wechart in your organisation?"
  A: "Analyst / author, Business consumer, Semantic-layer engineer, Platform operator"
- Q: "Roughly how many people, once it replaces Spotfire?"
  A: "500 or more"
- Q: "What can your typical analyst do without help?"
  A: "Spotfire power user, no SQL"

**R3 — Success metrics**

- Q: "What observable outcome would show wechart is succeeding?"
  A: "Analyses rebuilt and accepted, Self-service authoring"
- Q: "What performance bar must a dashboard meet?"
  A: "p95 under 3 s, 10 charts"
- Q: "How will you know the Spotfire replacement actually happened?"
  A: "Feature parity checklist"

**R4 — Constraints**

- Q: "Where will wechart run in production?"
  A: "Self-hosted Kubernetes"
- Q: "Which databases must Cube connect to?"
  A: "PostgreSQL, Snowflake, Databricks or BigQuery, SQL Server or Oracle"
- Q: "How big is the data behind a typical analysis?"
  A: "Varies widely"
- Q: "What must phase 1 do about login and access?"
  A: "Single user, no login"

**R5 — Stack**

- Q: "Does wechart have its own backend in phase 1?"
  A: "Node/TypeScript API + Postgres"
- Q: "How should the chart recommender be built?"
  A: "TypeScript rules + weights"
- Q: "How should the UI be built?"
  A: "Build everything ourselv3es, but make it modular so that we can add more dialogs, menus, combobox, charts.."
- Q: "Two libraries with real consequences. How do you want them chosen?"
  A: "Open-source only, research picks"

**R6 — Non-goals**

- Q: "Which product capabilities are out of scope for phase 1?"
  A: "AI and chat authoring, Scheduled delivery and alerts, Maps and geo charts, Embedding in other apps"
- Q: "Which Cube areas should phase 1 skip?"
  A: "SQL API and BI connections, Dynamic models (Jinja, Python, JS)"
- Q: "And these? Same question, the operational surfaces."
  A: "Advanced pre-aggregation types, Cube Store internals, Deployment and config screens, Real-time and live dashboards"
- Q: "What happens with the roughly 5,000 Spotfire .dxp analyses in phase 1?"
  A: "Nothing automated"

**R6 follow-up — unselected scope items**

- Q: "Model import — dbt, LookML, or database tables. In phase 1?"
  A: "Only from database tables"
- Q: "Multi-tenancy — per-tenant models and orchestrators. In phase 1?"
  A: "Defer it"

**R7 — resolving the open questions** (asked before writing the spec, because write-spec requires no open questions)

- Q: Marking wording, "tile" or "visualization"? A: "Keep \"visualization\""
- Q: How many markings at once? A: "Four"
- Q: Marked-item cap? A: "1,000, like Spotfire"
- Q: Range-based marking, bookmarks or touch in phase 1? A: "Range-based marking, Bookmarks, Touch support"
- Q (conflict: touch chosen, desktop-only chosen): A: "Drop touch"
- Q: Markdown text tiles? A: "Keep them"
- Q: Browsers and devices? A: "Desktop browsers only"
- Q: Is the design direction accepted? A: "Accept, revisit visuals later"
- Q: What replaces Spotfire's expression language for non-SQL analysts? A: "Quick calculations plus a request flow"
- Q: Which Spotfire features must eventually reach wechart? A: "Subsets, Tags and Lists, Data functions"
- Q: Who owns group membership in phase 2? A: "Identity provider owns it"
- Q: A `.dxp` inspection tool? A: "Yes, after phase 1"

**R8 — chart types for the Superset parity exercise** (2026-09-24, asked because Superset's dashboards use two types AC-037 does not list)

- Q: World map — the two country charts (Revenue by Customer Country, Orders by Ship Country). What should wechart do? (options: add a country map type / substitute a sorted bar / defer maps to phase 2)
  A: "Add a country map type (Recommended)"
- Q: Box plot — Days to Ship Distribution by Shipper. What should wechart do? (options: add a box plot type / substitute a bar of the average / defer to phase 2)
  A: "Add a box plot type (Recommended)"

**R9 — the prototype-alignment pass** (2026-09-24, after the user compared the running Explore with `docs/design/prototype/` and found it structurally different)

- Q: When should the prototype-alignment pass happen? (options: now, before more features / Explore now, the rest later / after the remaining ACs)
  A: "Go with Option 1.. and after that continue with the handoff"
- Q: The prototype's folder tree has two roots, a shared one and a personal "My workspace"; wechart has one. Phase 1 is single-user. What should the tree have? (options: both roots now / one shared root for now)
  A: "Both roots now (Recommended)"
- Q: The prototype's top-bar search says "Search fields, charts, models"; the ⌘K palette searches dashboards and charts only. What should global search cover? (options: dashboards, charts, fields and models / dashboards and charts only)
  A: "Dashboards, charts, fields and models (Recommended)"
- Q: The prototype puts a "History" button on every model file; wechart keeps only each file's current version, and a publish overwrites it. Should the Model workspace have history? (options: yes — versions, diff, restore / not in phase 1)
  A: "Not in phase 1"

**R10 — generating cubes through Cube's introspection API** (2026-09-25, after the user added the API to a fork of Cube and wrote `docs/inputs/2026-09-25-cube-introspection-api.md`)

- The user: "Use this ffor unblocking creating models form datasouce by introspections docs/inputs/2026-09-25-cube-introspection-api.md"
- Q: Where should the fork's Cube image come from? The Helm chart and docker-compose would both switch cube and the refresh worker to it. (options: local build only / push to a registry)
  A: "Local build only (Recommended)"
- Q: Who may generate cubes from a data source? The introspection scope exposes the warehouse catalog. (options: anyone, phase 1 / model engineers only)
  A: "Anyone, phase 1 (Recommended)"
- Q: When a generated cube's name or file name matches one already in the model store, what should happen? (options: refuse and say which / rename automatically / ask per clash)
  A: "Refuse and say which (Recommended)"

---


# Phase 2

### P2.9 Interview log

Questions are Claude's; answers are the user's, verbatim.

**R11 — Problem**
- Q: What stops phase 1 from being rolled out today, and who is the first rollout group? *(The user asked to clarify instead.)*
  A: "we are not rolling out today.. we are building on phase 1.. based on the inputs i provided. If security is enabled, then security credentials have to be present for the super-admin/admin and users to use the application. when folder is created and permissions are set/edited.. the user can optionally set the AD group that has read permissions only or read-write permissions. if any of the permission are not set on the folder it will be inherited from parent. you can start with your interview now"

**R12 — Users and roles**
- Q: A group has read-write on /Sales; /Sales/EMEA sets its own read-write group. Does the /Sales group still have read-write in /Sales/EMEA? A: "Yes, write flows down too"
- Q: A group is granted on /Sales/EMEA. In the ancestors, what do its members see? A: "Everything, view-only"
- Q: What does a Super-Admin get? A: "Read-write everywhere + admin"
- Q: Who can create folders and set or edit their AD-group permissions? A: "Super-Admin + read-write groups"
- Q: Does a read-only user get a private workspace? A: "Read-write members only"
- Q: Copying from a workspace into a shared folder requires what? A: "Read-write + an approval"
- Q: How many AD groups can one user belong to? A: "Can be hundreds"
- Q: Bookmarks: whose are they now? A: "Personal, can be shared"
- Q (follow-up, the approval): Who can approve? A: "Another RW member or Super-Admin"
- Q: While a copy waits, what do the folder's readers see? A: "The old version"
- Q: How is an approver told? A: "In-app only"
- Q: What does the approver review? A: "The proposed item + description of the change that the promoting user can type in.. (It can be empty. The description will be less than 1000 characters)"

**R13 — Success metrics**
- Q: Which outcomes should phase 2 be measured by? A: "Zero access leaks, "Phase 1 intact, security off", Speed holds with security on, "hase 1 intact, security off - this will be end of phase check.. dont waste iterations in terms of testing this every time.. focus on phase 2 security. After phase 2 is complete we can check \"Phase 1 intact, security off\"""
- Q: A folder-listing budget? A: "No separate budget"
- Q: Do phase 1's M1–M4 carry into phase 2? A: "Keep all four"

**R14 — Constraints**
- Q: Which identity provider issues the users and AD groups? A: "Any oidc provider.. for testing.. we will pick up keycloak... or if there are other options similar to keycloak that are smaller and lighter than we can use that. The end state deployment is Microsoft Entra ID or On-prem AD via a broker... we will do all testing on a single oidc provider that we select for development.. we dont have to test on all possible oidc providers during development."
- Q: Do AD groups also limit the data inside a cube? A: "Yes pass groups to cube. We will add user attributes later on... but for now we will assume it is groups only"
- Q: Where are data-source credentials kept? A: "For development we will use wechart DB, encrypted.."
- Q: Is an audit trail needed in phase 2? A: "Yes, Super-Admin view"

**R15 — Stack**
- Q: How should sign-in be built? A: "Option 1 Research decides. Like i said.. we will test with any one oice provider.. we dont have to do "and working with both Entra ID and a broker" we can defer this to the end of phase.. where we will see if it works."
- Q: Development OIDC provider? A: "Research picks lightest"
- Q: Data-source credentials in production? A: "Same as development"
- Q: May the Cube fork change if Cube's hooks can't do per-folder models cleanly? A: "Yes, via the Cube agent"

**R16 — Non-goals and the backlog**
- Q: Data sources (backlog F18): how much comes into phase 2? A: "All of F18, per folder"
- Q: The design and UI fixes: phase 2? A: "In phase 2"
- Q (asked again, the first answers came back empty): Which backlog groups are in phase 2? A: "All of them"
- Q: Which of these are phase-2 non-goals (individual users on folders; user attributes in Cube; outside notifications; multi-IdP testing in development)? A: "All four"

**R17 — Scope details**
- Q: In a workspace, which folders' cubes does an item resolve against? A: "Its origin folder's path"
- Q: A dashboard in a folder: which cubes can it use? A: "Current folder, then ancestors"
- Q: An approved copy lands on a same-named item. What happens? A: "Replaces it, keeps history"
- Q: Copying a data source into a workspace: its credentials? A: "Copied, never shown"
- Q: When security is first turned on, what happens to phase 1's content? A: "Also lets have self approve.. but any change has to be approved even if it self approve. also for this questions Stays, Super-Admin only"
- Q: With security off, how do workspaces and approval work? A: "Same flows, self-approve"
- Q: Which changes to a shared folder need approval? A: "Content copies only"
- Q: How much history does a replaced item keep? A: "Last 10 versions"

**R18 — resolving the open questions** (asked before writing the spec, because write-spec requires no open questions)
- Q: Where is the Super-Admin AD group named? A: "Deployment configuration"
- Q: A dashboard that uses library charts is copied into a workspace. What happens to those charts? A: "Copied with it"
- Q: A proposed dashboard's cubes resolve only through the workspace's models. What happens? A: "One proposal together"
- Q: A folder's pre-aggregation jobs and schedules: who can use them? A: "Also the folder's RW"
- Q: What does rejecting a proposal do? A: "Back with a reason"
- Q: How long are audit records kept? A: "Configurable" (the option read: "A deployment setting, default 1 year")
- Q: With security on, may the author approve their own proposal? A: "Yes, always"

**R19 — asked while writing the spec** (conflicts and gaps that would otherwise have been invented)
- Q (conflict: R17 "same flows" against R13's "phase 1 intact"): Security off, which holds? A: "Phase 2 flows, self-approve"
- Q: Model goes from the top bar; what about the rest? A: "Data sources stay as a list"
- Q: In a folder where a user has read-only access, what can they see? A: "Dashboards only"
- Q: 'warehouse' in /A and in /A/B/C, and a model in /A/B names it. Which is used? A: "Resolution bottom up.. not top down"
- Q (follow-up, the example): Which is used? A: "/A's — up from the model"
- Q: Box plot whiskers? A: "Make it a configurable option while building the chart"
- Q (follow-up): The default? A: "1.5 × IQR, dots beyond"
- Q: What count should the test use to prove 'hundreds of groups'? A: "maybe 20 groups"

**R20 — choices after component research** (each with a side-by-side comparison and a recommendation)
- Q: How should sign-in be built when security is on? A: "API signs in itself (Recommended)"
- Q: Which development identity provider should docker-compose and the docker-desktop Helm release use? A: "Dex 2.45.1 (Recommended)"
- Q: Where should a data source's connection test run (AC-159 says 'from the wechart service')? A: "In Cube, at wechart's request (Recommended)"
- Q: A model defined in /A is used from /A/B; a join inside it names cube `orders`, and /A/B has its own `orders`. Which is used? A: "The viewer's folder (Recommended)"
  - *Superseded 2026-09-25 by decision 3 (`docs/inputs/2026-09-25-architecture-decisions.md`): names bind at publish from the item's own folder.*

**R21 — credentials and the box plot's row limit**
- Q (first wording, about a "gitignored" development key file): *(The user asked to clarify.)* "I did not understand this question.. what git are we talking about is it the user workspace? if we are using per user git folder, how will multi pod deployment work?" Claude explained that "gitignored" referred to wechart's own source repository, that wechart uses no git at runtime, and that every pod shares the key from the deployment's Secret; the question was about developer laptops only.
- Q: For a developer running wechart on their laptop with docker-compose, where should the encryption key come from? A: "One fixed key in the repo"
  - *Superseded 2026-09-25 by decision 7: wechart holds no decryption key; development uses a fixed xcube key pair (R27).*
- Q: What should a wechart API pod do if it starts without the encryption key, or with the wrong one? A: "Refuse to start (Recommended)"
  - *Superseded 2026-09-25 by decision 7 and R27: wechart refuses without xcube's public key, xcube without its private key.*
- Q: A read-write member changes where a data source connects. Must they type the password again? A: "Yes, re-enter it (Recommended)"
- Q: What should a box plot do when the data has more rows than Cube returns? A: "Use part, with a warning"

**R22 — box plot, country map and default data source**
- Q: Should wechart's box plot let the user choose what one observation is (e.g. one per order)? A: "Yes, an 'Each point is' setting (Recommended)"
- Q: How should wechart decide that a dimension holds ISO-3 country codes? A: "Values, plus a model override (Recommended)"
- Q: Which world map detail should the country map use? A: "Medium detail, 242 countries (Recommended)"
- Q: A cube in a folder's model doesn't name a data source. Which one should it use? A: "Folder source named 'default' (Recommended)"

**R78 — new work: the MCP server and the SQL runner workspace first; the copilot later** (2026-10-17, the user; inputs `docs/inputs/2026-10-17-{mcp-server,copilot-chat,sql-runner-and-ask-key}.md`; research `docs/research/mcp-typescript-sdk.md`; designs `docs/design/references-{sql-runner,copilot}.md`)
- **Scope and order.**
  - "we need to build two more things.. one is a mcp server that lets claude code or other llms.. manage datasources, dashboards, cubes, approval and review flows and anything else that i missed out."
  - The copilot: "i want to build a coilot/chat interface … (remember that all edits will happen in the workspace).. superadmin can set globally the api keys, models for the llm".
  - The SQL runner: "templating; making a chart or a cube from a query's results.. and saved queries (no sharing)". Also: "The SQL running is seen within the datasource. Instead have a seperate tab.. next to jobs, schedules called SQL runner that lets you see and select the datasource, introspect the datasource see the tables, columns.. check superset for the experience".
  - The pending items: "yes ad the other pending items". These are the coordinator's list: a read-only login per data source; Cube's semantic SQL API; the phase 3 keyboard items (backlog §7); the refresh worker's build history (R41); xcube's slice 7; and the 4 Northwind bugs.
  - The ask shortcut: "IN another app that i am building ask functionality is done using #J key.. can we add that as well". This is read as ⌘J/Ctrl+J, opening the copilot.
  - Order: "start with MCP, SQL Runner changes like Superset, keep Ask/Copilot pending for now."
  - The phase-1 non-goal "AI and chat authoring" is lifted for the copilot, when it is taken up.
- **MCP:**
  - Q: How should an MCP client sign in and act as a user? A: "Personal tokens (Recommended)": each user creates a scoped, expiring, revocable access token in wechart and acts with their own folder permissions.
  - Q: Which clients must work on day one? A: "Claude Code, Claude.ai / Desktop". Claude.ai and Desktop connectors call from Anthropic's cloud, so `/mcp` must be reachable from the public internet; how it is exposed is for the spec to settle.
  - Q: May an MCP client approve or reject proposals? A: "Never (Recommended)".
  - Q: Which operations in the first release? A: "Read and explore, Edit in My workspace, Proposals and jobs". Data sources by MCP were not chosen.
- **SQL runner workspace:**
  - Q: What does "templating" mean? A: "Typed parameters (Recommended)": `{{name}}` typed Text, Number, Date or Boolean, filled in a strip under the editor and bound as database parameters.
  - Q: Cube's semantic SQL API? A: "In the runner (Recommended)", as a separate "Cube" group in the picker.
  - Q: Which keyboard behaviour may it add (R75)? A: "Run statement at cursor, Save and Find, Autocomplete, Tab shortcuts".
  - Q: Where are open tabs kept? A: "Browser only".
  - Questions 2–8 and 12–19 of `references-sql-runner.md` were not asked. They take the recommended answers, which are the coordinator's call and overturnable:
    - no optional clauses;
    - values only, no table or column parameters;
    - no snippets;
    - parameter values kept for the owner only, with the audit keeping names only;
    - Make a cube writes the run's values in as literals;
    - Make a chart starts with the new cube and nothing placed;
    - History shows all my runs;
    - saved queries appear in ⌘K for their owner;
    - the data source page keeps a "SQL runner" tab with its switch and "Open in SQL runner";
    - the workspace is shown to Super-Admins and read-write members;
    - CSV only, with no clipboard copy;
    - no "Open in SQL runner" from a chart's View SQL;
    - Preview 100 rows only on request, as an audited run.
- **The open questions R78-1 … R78-15** (2026-10-17, the user; raised while writing the spec, requirements §P2.8):
  - Q: Which groups does a token's call use? A: "Latest web sign-in (Recommended)" (R78-3).
  - Q: The rate limit's store? A: "Postgres (Recommended)" (R78-5). The option's text named the rest: limited per token, every MCP call counts, fail closed when the store fails, 60 calls a minute as a deployment setting, and an IP limit on bad-token traffic.
  - Q: How is `/mcp` exposed? A: "Separate host + allow-list (Recommended)" (R78-7).
  - Q: "Accept the recommended answers for the other questions?" A: "Accept all (Recommended)". So each of R78-1, 2, 4, 6, 8, 9, 10, 11, 12, 13, 14 and 15 takes its option (a):
    - R78-1: the owner picks 7, 30 or 90 days, 30 by default, 90 at most;
    - R78-2: three fixed scopes, read, workspace-edit, and proposals-and-jobs, with read always included;
    - R78-4: Super-Admins may list and revoke any user's tokens;
    - R78-6: a query tool returns at most 1,000 rows and under 50,000 characters, says when it was cut, and pages;
    - R78-8: jobs, builds and schedules listed, with Run now and Cancel as the owner may in the UI, and no schedule edits;
    - R78-9: every MCP tool call is audited, reads included, with the tool, the token and the outcome, and no argument values;
    - R78-10: with sign-in off, tokens work and act as the single user;
    - R78-11: no SQL runner through MCP in the first release;
    - R78-12: Ctrl+Q opens a new tab, Ctrl+Alt+[ and Ctrl+Alt+] go to the previous and next tab, and a tab closes with its × button;
    - R78-13: the "Cube" group is shown to everyone who sees the workspace, with no switch, R50's caps, audited as a SQL run marked "Cube", listed in History, and Make a cube disabled there;
    - R78-14: parameters are offered only where research shows binding works; elsewhere Run is held, saying parameters aren't available on that source;
    - R78-15: a saved query's name is required, unique per owner and at most 100 characters; its description is optional, at most 1,000 characters.
- **Six more answers** (2026-10-17, the user; from the research `docs/research/mcp-deployment-and-tokens.md` and `docs/research/sql-parameter-binding.md`, and two design leftovers):
  1. Q: On Team/Enterprise a connector's fixed token is organisation-wide, so how should Claude.ai/Desktop work? A: "Defer Claude.ai". *Day one is Claude Code only. Claude.ai and Desktop wait, since a token an organisation Owner enters is sent for every member, so the calls couldn't act as each member (research finding 1). AC-445 is retired; the allow-list covers the enterprise network, with Anthropic's `160.79.104.0/21` kept as a documented Helm value, off by default.*
  2. Q: The chart has no ingress and ingress-nginx is retired; which? A: "Gateway API (Recommended)". *`/mcp` is exposed through a Gateway API HTTPRoute on a configurable Gateway. Which implementation is still being researched.*
  3. Q: The per-IP limit on bad-token traffic? A: "20 per minute (Recommended)". *AC-474's default, changeable per deployment.*
  4. Q: History's Current row where no version was kept (T695-1)? A: "View opens it as now (Recommended)". *This overturns T695-1's "no View": View opens the item as it is now.*
  5. Q: Parameters on Dremio, which binds none? A: "Hold Run, say why (Recommended)". *As on Cube Store and in the "Cube" group (R78-14).*
  6. Q: The seed fixtures' flat picker list (T742-2)? A: "Keep as built (Recommended)". *No criterion changes.*
- *The coordinator's call, overturnable:* a parameter is written `{{ name }}`, with optional spaces inside the braces; its name matches `[A-Za-z_][A-Za-z0-9_]*` and is case-sensitive.

**R77 — closing design conformance faster** (2026-10-08, the user)
- The user, choosing all three options Claude offered: "Accept small visual differences and Skip the review round on pure-styling tasks and Close AC-187, the overall prototype check, on the per-surface results."
- *Decided:*
  1. **Small visual differences are accepted** and recorded rather than fixed. A difference is small when all of these hold:
     - it is at most 4 px in a size, spacing or position;
     - any colour stays within the same token role;
     - it changes no structure, control, wording, state or behaviour the design draws;
     - it breaks no hard rule: the 12 px floor, WCAG AA contrast, the 400/600 weights, or no horizontal scroll at 390 px.

     Each one accepted is listed, with the task, in `docs/design/accepted-differences.md`. That list counts as the recorded decision that AC-343, AC-344 and AC-352's escape clause asks for.
  2. **A task that changes only styling** (CSS and tokens, with no change to behaviour, wording, structure or a test's logic) skips the cold spec-review round. Its tests still fail first and pass after. Any task touching behaviour keeps its review.
  3. **AC-187 closes on the per-surface results.** It is ticked once T682–T698 and T742 have landed and AC-343, AC-344 and AC-352 are ticked. T406's full re-critique is not repeated.

**R76 — the design critique's 56 questions, decided under the user's delegation** (2026-10-08)
- The user: "Go ahead and make decisions.. if you think the design is incorrect.. do the right thing and make your own decisions. If you need help in answering the question.. use combination of cube expert and ui expert."
- *A UI-expert agent decided each of the 56 questions (the 2026-10-08 critiques, design 10's included, and design 16's J1–J3 from T613). The coordinator reviewed them, and the Cube expert answered the one Cube question. They can be overturned like any other decision.*
- *The principles:*
  1. *R37: the latest approved design wins on structure, placement, controls, wording and states.*
  2. *AC-343 and AC-352 bind those designs "in the tokens of direction.md §3–5". Where a design draws a value off the token scale and no exception is recorded, the nearest token wins: 15 px type, 10 px cell padding, 20 px padding, an 8 px card radius. Where a design picks one existing token over another, the design wins: 14 px tree rows, 24 px dense rows.*
  3. *The 12 px floor (rule 1, AC-004) and the 400/600 weights (§3) beat any drawing.*
  4. *R75 holds: no decision adds new keyboard behaviour. Where an option needs it, the option that needs none is taken.*
  5. *A drawing that contradicts its own caption, or doesn't fit the space it is drawn for, gives way to the caption or the space.*
- *Each decision, with its reason and whether it departs from a design, is in `docs/design/decisions-2026-10-08.md`. The tasks that waited on them (T681–T691, T693, T695, T696, T698, T699, T742, and T613's design-16 note) name the decisions that settle them.*
- *Criteria amended, each unticked until retested:*
  - *AC-217 (chart-editor-Q2): the "Auto" quick pick, pressed while the recommended type is drawn, replaces "Back to recommended" (design 01 pin 4, design 02 pin 7).*
  - *AC-032 (chart-editor-Q2): a manual pick holds until the user chooses Auto, or Use on the Recommended card.*
  - *AC-029 (chart-editor-Q3): "Why this recommendation?" is a ✓/⚠ checklist of the rules that decided, with every hard rule for every type one link away. AC-220 names the checklist and its table in place of "the 'Why this chart?' trace".*
  - *AC-147 (chart-editor-Q4): the chart's badge reads "Live", with the rollup-only sentence in its tooltip, and the Acceleration tab says Cube would refuse the chart in rollup-only mode. A banner shows only where wechart knows the mode is on.*
    - *The Cube expert's answer (`to-wechart/2026-10-08-1830-rollup-only-mode.md`): Cube 1.7.45 reports rollup-only mode nowhere. "No pre-aggregation table has been built for this query yet" is thrown only in rollup-only mode; a matched but unbuilt rollup gives different text. xcube will add `rollupOnly`, per model, to `GET …/revision`.*
    - *So the banner shows where the revision route reports `rollupOnly: true`, or, until that image is pinned, once a query has failed with that exact error. The revision-route part waits on the xcube image.*
  - *AC-190 (explore-Q1): with sign-in off, the "Single-user mode" chip takes the avatar's place, and no avatar shows beside it.*
- *direction.md changes (each marked "(R76, 2026-10-08)"):*
  - *principle 2 and rules 10 and 29 take the amended words of AC-032 and AC-029, and §6's recommendation panel drops its "Pinned · Back to recommended" chip;*
  - *§3's tree-rows note names only the field and file trees, since Explore's folder tree is 14 px with a 16 px heading (explore-Q2);*
  - *§4's table-tile rows are 24 px dense, not 34 (dashboard-Q4);*
  - *the 12 px floor is absolute, and no 11 px glyph chip is an exception (components-Q5). The WebKit native select stays §3's one platform exception.*
- *model-Q2: the Model workspace's eight "left as built" calls, recorded in backlog §6(a), are accepted as recorded decisions. model-Q1 decides that list's read-only shared model file as design 03 state A draws a data source's.*

**R75 — keyboard reach as built** (2026-10-08, the user)
- The user: "AC-176 change this for now.. every action need not be reachable by keyboard. Whatever is already done is great. If anything new has to be done.. please check with me before proceeding. Dont want t waste iterations on this."
- *AC-176 is amended to keep the keyboard reach built through T640, and ticked on its passing tests. T743 (four gaps the re-audit found: Tab kept in four narrow sheets, and focus given back after Import's "Keep going", Explore's heading Rename and the version view's "Back to current") is not built. Any further keyboard work needs the user's approval first.*

**R74 — ancestors are visible, the shared root included** (2026-10-08, the user)
- Q (from AC-267's check): under R12's ancestor rule, with a grant on a subfolder counting as assigned, a group granted on any top-level folder sees every root-level phase-1 dashboard, view-only. Is that wanted? A: "Yes, as R12 says". *Ancestors are visible, view-only, to anyone granted below them, the shared root included.*

**R73 — gaps found while planning R71/R72's tasks** (2026-10-07, the coordinator's calls under the standing instruction, overturnable)
- **An import naming a draft already in the workspace.** One name means one item, so the imported item maps to that draft, as it would map to a landed item (R72). Review lists it as mapped.
- **An import mapped to a landed item off the target folder's path.** The imported charts couldn't use it (R72's path rule). Review names those items, and the import can't be made until the importer picks a target on that item's path or leaves those charts out.
- **The use-only copy.** Its dialog no longer asks for a folder to propose to, since the copy can't be proposed. Its page offers "Request a change", which opens the calculation request (AC-050) for its cube.
- **A landed model file's name.** It is named for its cube (AC-337), and the cube's name is fixed, so a landed model file offers no Rename either. A draft's file name follows its cube's name until it lands.
- **Generate cubes from a table whose name breaks the grammar** (`user__events`, `class`, `2024_orders`). The cube's name is suggested in the grammar: `__` becomes `_`, and a reserved word or a leading digit gets a `t_` prefix. The user can edit it before saving, and it is checked as any draft name is.
- **The picker's mark for the user's copy.** A "Your copy" chip, in the existing chip style of design 03's tree.

**R72 — R71's details: references stay on the folder path, imports map by name, the name grammar** (2026-10-07, the user and the coordinator)
- Q: now that names are global, may an item refer to a cube or data source outside its own folder path? A: "Own folder or above (Recommended)". *Every reference must point to an item in the referrer's own folder or an ancestor:*
  - *a chart or dashboard to a cube or view;*
  - *a join, an `extends` or a view to a cube;*
  - *a cube to its data source, including one it inherits through `extends`.*

  *A move that would break this is refused, naming what breaks. Names are shown for folders the mover can see, and a count for the rest, as AC-322 does. A reader who may see a dashboard can therefore always query its cubes (AC-263).*
- Q: an import holds a model or data source whose name has already landed. A: "Map to existing (Recommended)". *The imported item is left out. The imported charts use the landed item of that name, as AC-358 already does for data sources. Review lists what was mapped.*
- **The grammar, from xcube's answer** (`to-wechart/2026-10-07-2005-global-names-grammar-and-extends.md`; the coordinator's call, overturnable):
  - *A name is an ASCII letter, then ASCII letters, digits and underscores. It may not contain `__` or end in `_`, and is at most 40 characters.*
  - *A cube or view name may not be a reserved word, compared ignoring case: Python's keywords, `None`, `True`, `False`, or Cube's own names such as `CUBE`, `TABLE` and `SECURITY_CONTEXT`. Data source names are exempt, but only the root may have `default`.*
  - *Upper case is allowed, and every comparison ignores case. xcube gives a name with upper case a lower-case SQL alias.*
  - *The names Cube makes for a view's `split: true` cubes (`<view>_<cube alias>`) count as names too.*
- **Smaller calls (the coordinator, overturnable):**
  - *A data source has no separate title; its description is enough.*
  - *R71's "request to the folder's owners" is the existing calculation request (AC-050), which already carries a free-text description.*
  - *Renaming a draft is checked as making one is.*
  - *A model file's name stays per folder: each file declares one cube and is named for it, so the cube's global name keeps them apart.*
  - *In the cube picker, a workspace copy is listed in place of the landed cube, marked as the user's copy.*
  - *Whether non-root items keep a short `sql_alias` follows xcube's answer to ask 1.2.*

**R71 — one name per item across the whole system: cubes, views and data sources** (2026-10-07, the user, after a brainstorm on naming, modules and workspaces)
- The user: "datasources will have unique names and the names will not changes." Then: "okay.. lets have unique name for both datasources as well as cubes across the entire system." Then: "There is no migration, since we are in development and this is not yet in production.. we can delete all tables/dashboards/cubes and recreate them." Then, on Claude's seven decisions: "we dont need the name to be locked.. the first publish wins is this doable? all other decisions are good with me." Then: "okay proceed with these changes first before we do any other changes".
- *Decided:*
  1. **One namespace system-wide.** Cubes and views share one namespace, as Cube requires. Data sources have their own. Each namespace is unique across every folder, the shared root and every workspace's landed items. This replaces per-folder names (AC-270, AC-271), nearest-first resolution (AC-273, AC-281, AC-310), folder-prefixed published names (AC-328) and R70's rebinding on move: a name means the same item wherever it is used.
  2. **Tenancy is not needed now.** Per-folder overrides go: a subfolder can no longer redefine an ancestor's cube or data source under the same name. If one model over several identical databases is needed later, it is a feature of its own, using Cube's security-context multitenancy (a tenant key in the token, allowed by AD groups; one data source with a connection per tenant). That needs xcube's support. Not in scope.
  3. **Names are fixed, titles are editable.** An item's name is set when it is created and never changes once it has landed. Its title can change at any time. No rename of a landed cube, view or data source: AC-291's rename of those kinds goes.
  4. **A deleted item's name may be used again.** A delete is already refused while anything uses the item.
  5. **The first to land wins; names are not reserved.**
     - A draft is checked against landed names when it is made, when it is proposed, and when it is approved.
     - Drafts in different workspaces may share a new name. Two drafts in one workspace may not, since xcube refuses an overlay holding two items of one name.
     - A later approval of a name already landed is refused, and nothing of it lands.
     - A draft's name stays editable until it lands.
     - Editing an existing item never takes a name: its copy keeps the original's and lands over it.
  6. **Names compare case-insensitively.** "Orders" and "orders" are the same name. A name is a letter followed by letters, digits and underscores. A refusal says only that the name is in use, never where, so a folder the user can't see is never revealed.
  7. **Only the shared root has a `default` data source.** A cube that names no data source uses it. Any other data source is named explicitly. A cube may use a data source only in its own folder or an ancestor of it. This holds when the cube or the data source is published, moved or landed.
  8. **A cube from a folder the user may only read.** The user gets a use-only copy for previews in their workspace. To change the shared cube, they send a request to the folder's owners. The copy can't be proposed anywhere. A variant of their own is a new cube with a new name. This supersedes R53's "proposed to a folder they may write, as a new model".
  9. **No migration.** Development data (wechart's metadata database, xcube's schema, dashboards, charts and models) is dropped and seeded again.

**R70 — a moved folder's bindings, and which data-source changes warn of a rebuild** (2026-10-07, the user)
- *Superseded in part by R71:* with one name per item system-wide, a move changes no binding. Only the rule that a cube's data source is in its folder or an ancestor is checked.
- Q (from group 3's AC-263 pass): a moved folder's own charts keep their bindings (AC-275, no rebinding). xcube admits a query by the cube's folder, so a reader granted only on the new path is refused those tiles. A: "Rebind on move (Recommended)". *A move rebinds the moved folder's items along its new path, as copy-on-move does for copies. Where a name doesn't resolve on the new path, the move is refused, naming the items. This is an exception to "no rebinding", for moves only.*
- Q (from T509's review): changing a saved data source's connection identity rebuilds its rollups (research `xcube-bc18f82c01.md`, "A connection's identity"). Which changes warn? A: "Any identity change (Recommended)". *Before Save, warn on any change that moves the identity: the sign-in method, host, database, user or key holder. AC-353 is amended accordingly.*

**R69 — when Auto may leave a metric out** (2026-10-07, the user)
- Q (from T510): should Auto also avoid a form that drops a metric of the same scale, such as a KPI of two counts? A: "Only across scales (Recommended)". *As built: metrics on different scales are never drawn on one axis. Elsewhere a metric a form can't draw has its pill say "not drawn", offering Small multiples and Table.*

**R68 — two lines of design 16 kept as built** (2026-10-07, the user)
- Q (from T610's audit): a rollup with no `refresh_key`. The design says "Cube's default · no refresh_key declared · depends on the cube's keys"; research shows Cube's hourly default. A: "Keep as built (Recommended)". *"Cube's default: every hour", with the computed runs.*
- Q (from T610's audit): Run history's gap line, where the design says "wechart's API was stopped". A: "Keep as built (Recommended)". *"wechart didn't see how it ended".*

**R67 — metrics on two scales, the dashboards' pick, and the horizontal bar** (2026-10-07, the user)
- Q (from T510): an unsplit bar, line or area with two metrics on different scales. A: "Draw the first only (Recommended)". *The second's pill says "not drawn · on another scale", offering Small multiples and Table (design 01-5), and the axis keeps the first's format. T195's one-axis decision is superseded.*
- Q (from T510): picking per-metric small multiples needs formats, which dashboards don't have when they pick. A: "Pass formats to dashboards (Recommended)". *The editor and the tile pick the same chart (T193).*
- Q (from T516): when should the horizontal bar be the runner-up? A: "Promote when labels hide (Recommended)". *It's second when more than half the labels would be hidden at the tile's width; otherwise today's order stands.*

**R66 — the Stop hook, Jobs' summary links, and two keyboard paths** (2026-10-07, the user)
- Q: the Stop hook runs the API suite without the tests' lock, polluting wechart_test. A: "Hook takes the test lock (Recommended)". *It runs under the lock without waiting, and isn't cut short (3bdc94c).*
- Q (from T558): the summary's building, queued and suspended links have no drawn filter to land on. A: "State filter pills (Recommended by agent)". *A State pill on Queue (Any, Building, Queued, Stalled) and on Schedules (Any, Active, Paused, Suspended), set from the link.*
- Q (from T405): range marking from the keyboard? A: ""Mark range…" in tile menu (Recommended)". *T636.*
- Q (from T405): the YAML diff's collapsed lines from the keyboard? A: ""Show all lines" toggle (Recommended)". *T637.*
- *Claude's calls, overturnable:*
  - a trellis header's Ctrl/⌘-click adds its panel to the marking (T635);
  - a wechart schedule starts one run per time; a late every-minute run folds into the next (T556's follow-up).

**R65 — resuming, and AC-378 for router queries** (the user)
- After the pause: "okay lets complete groups 1 and 2". *Group 1: the built work waiting on the security e2e, T590 and T633. Group 2: Jobs and Schedules (T554–T560), keyboard (T634, T405), and design conformance (T476, T477, T510, T516, T406).*
- Q: AC-378 says a stopped Cube Store run says "until when"; a router query has no end time. Amend it? A: "Keep as written". *For a router run xcube reports no end, and the page says it runs to its end.*

**R64 — views' requests, the filter bar's picker, adding by keyboard, and Cube Store's router queries** (2026-10-04, the user)
- Q (from T385): a request on a view can't be resolved by R63's rule. A: "Resolve via the view's cubes (Recommended)". *A taker's approved measure on any cube on the view's join paths resolves it. T590.*
- Q (from T475): should the dashboard filter bar's field picker be design 10's grouped picker? A: "Yes, same picker (Recommended)". *T633.*
- Q (from T631): how does a keyboard user add a series or category to a marking? A: "Ctrl+Enter adds (Recommended)". *On a "Mark series ›" or "Mark panel ›" entry. T634.*
- Q (from T548): refuse, before it runs, a Cube Store query with a join outside its select workers? A: "Yes, refuse them (Recommended)". *Asked of xcube (`to-xcube/2026-10-04-2200-cube-store-refuse-router-joins.md`). T650 waits on its image.*
- Q (from T548): Cancel on Cube Store's page? A: "No Cancel on Cube Store (Recommended)". *AC-379 is amended.*
- *Claude's calls, overturnable:* design 08 E's preview opens the dashboard at its own address under the banner (T630). A stopped refresh worker's newer error counts as failing until a worker on the current revision has a good run (T553).
- **Paused 2026-10-04 at the user's word:** "complete for all research that you already have response for and then pause .. running out of tokens.. os will need to stop for couple of days".

**R63 — keyboard paths to a series or panel, and resolving a calculation request** (2026-10-04, the user)
- Q (from T405): marking a whole legend category or trellis panel is pointer-only. Which keyboard path? A: "Tile ⋯ menu entries (Recommended)". *The tile's ⋯ menu (Shift+F10) gains "Mark series ›" and "Mark panel ›". The same path serves a scatter's points and cross-filtering by series or panel, where a click means the series or panel (`clickedValue`'s BY_SERIES).*
- Q (from T385): a request is free text. What resolves it? A: "The member who took it up (Recommended)". *An approved proposal from the member who opened the request in their workspace, adding a measure to the request's cube, resolves it, naming those measures. AC-052 is amended.*
- *Claude's call, overturnable:* design 08's state E (Preview as) is drawn as designed, since AC-343 binds the design. T630.

**R62 — Cube Store's stop, as xcube can give it** (2026-10-04, the user)
- xcube answered that Cube Store can't stop a running query. Its protocol and SQL have no cancel, and its only limit is the process-wide `CUBESTORE_QUERY_TIMEOUT`. `2099b13f2d` instead answers a stopped run at once with `stillRunning` and `endsBy`, keeps the run "stopping" until Cube Store ends it, and adds `GET …/sql/runs/{runId}` (`to-wechart/2026-10-04-1900-cube-store-cancel.md`).
- Q: How should AC-378 stand for Cube Store? A: "Say it, and hold Run (Recommended)". *AC-378 is amended: the result says the query is still finishing in Cube Store until its end, and the next run waits. No deployment change. T548.*
- *Claude's calls from T451's review, overturnable:*
  - AC-322 is amended to R60's choice: a proposal refused when made is said in the Propose dialog as a count, and the breaks are named at a refused approval (state L) and in the audit trail.
  - AC-189's amendment (R60) also drops the names marked on the rollup's row, which only the in-place save gave.

**R61 — shared bookmarks, the credential tests, and moves in the audit trail** (2026-10-04, the user)
- Q (from T367): a shared bookmark carries its owner's filter values and marks, including values on members a viewer's Cube rules hide (their queries still run as themselves). A: "Apply as saved". *No change: a shared bookmark applies as its owner saved it.*
- Q (from T367): an owner who loses access to the dashboard leaves a shared bookmark nobody can unshare or delete. A: "Super-Admin can remove it (Recommended)". *A Super-Admin may delete any shared bookmark; it stays listed until then. AC-293 is amended; T580.*
- Q (from T368): must a test read wechart's and xcube's logs for the canary before AC-298 and AC-325 are ticked? A: "No, requests suffice". *The ticks rest on the remaining flows of `credential-sealing.md`'s plan, without reading the logs.*
- Q (from T368): should a move that changes the groups reaching a folder be recorded as a permission change? A: "No, a move is a move". *AC-294 waits only on T505.*
- *Claude's calls from T367, overturnable:* "newest first" is by when a bookmark was first saved; deleting one's own bookmark doesn't ask first; a calculation paused for want of a time field says so in the editor only (R45.4).

**R60 — calculation requests, rollup refusals after the switch, and Cube Store's stop** (2026-10-04, the user)
- Q (from T383): where should a folder's read-write members see calculation requests? A: "Reviews tab + count (Recommended)". *A third Reviews tab, "Calculation requests", and the Reviews count in the top bar includes open requests. Design 05, direction.md rule 76 and AC-287's count are amended.*
- Q (from T451): a rollup that names a member the model doesn't have saves in My workspace and is refused only when proposed. Should the workspace save check it? A: "No, at proposal only". *AC-189 is amended: refused at proposal or approval.*
- Q (from T451): when a proposal is refused for a rollup Cube can't join, what does the Propose dialog show? A: "Just the count". *The breaks are named on the review page (state L). AC-235 is amended.*
- Q (from T536): Cube Store has no cancel, so a stopped Cube Store run can run on until its own 120 s limit. A: "Ask xcube for a cancel". *Requested from xcube; T548 waits on its image.*

**R59 — Run now, pausing, and the schema browser's scope** (2026-10-02, the user)
- Q: When a Run now on a wechart schedule fails, does it count toward the schedule's suspension limit? A: "No, scheduled runs only (Recommended)". *A Run now neither counts nor resets the count (AC-155, AC-395).*
- Q: Is Run now offered on a schedule that is paused or suspended? A: "Yes, on both (Recommended)". *A Run now is a one-off build; it doesn't resume the schedule (AC-395).*
- Q: When a paused schedule is resumed, does its count of consecutive failed runs go back to zero? A: "No, keep the count". *Pausing and resuming leave the count as it was. Resuming a suspended schedule still resets it, as AC-155 says (AC-396).*
- Q: The SQL runner's schema browser can't yet list a data source made new in My workspace, or a copy pointed elsewhere. Keep AC-386 as written, or scope it to landed data sources? A: "Keep it, wait for xcube (Recommended)". *xcube's overlay introspection was published on 2026-10-02 (`v1.7.45-93a5f7a73b`); T547 finishes AC-386.*
- *Claude's call, overturnable:* AC-153's note says "about five and a half minutes", research's figure (`cube/refresh-key-schedule.md`, Lateness), rather than "about five minutes".

**R58 — a bigger YAML and join diagram** (2026-10-02, the user)
- The user: "can you add functionality to see join diagram and yaml in a bigger model screen... you should be able to popout into modal and closing should pop back into place..". *AC-420, T600.*
- *Claude's calls, overturnable:*
  - the whole right-hand pane pops out: its switch, Wrap and problems go with the editor or diagram, so either view is reachable in the dialog;
  - the dialog takes most of the window;
  - the pane is drawn once and moved, so nothing in it is reset.

**R57 — Generate cubes for a demo** (2026-10-02, the user)
- The user: "please work on T492.. i have a demo tomorrow.. and need the generate cube functionality. Put the generate cube functionality also in the workspace home. It can be in the Workspace home page along with New Dashboard/chart/folder .....", then "take the generate cube as a priority".
- Claude explained that a generated cube in My workspace must name the shared folder it is to go to. The user: "oh okay... in that case.. add generate cube within the datasource details page..", "you dont have to add it on the workspace home", and "Also clicking on the [...] on datasource in explore view also should have generate cube". *AC-350 amended; T492.*

**R56 — design 16 approved: Jobs and Schedules** (2026-10-02, the user)
- Q: Approve design 16 (`docs/design/reviews/2026-10-01/designs/16-jobs-schedules.html`, T504)? A: "Approve as drawn (Recommended)".
- Q: Which of its proposals P1–P5 should be built? A: "All five (Recommended)". *The five:*
  - *P1: Stop a build that is already building, for builds wechart started.*
  - *P2: Run now on a wechart schedule.*
  - *P3: Pause and resume a wechart schedule by hand.*
  - *P4: Schedules' owner filter, with counts.*
  - *P5: Jobs' header summary, each count linking to its tab.*
- Q: Its 12 questions each have a drawn default. Accept them? A: "Accept all defaults (Recommended)". *Each question is built as drawn:*
  - *Q1: only builds wechart started can be cancelled.*
  - *Q2: a refresh key and a wechart schedule on one rollup both run, one row each, and nothing offers `scheduled_refresh: false`.*
  - *Q3: a refresh key's next runs are listed up to a daylight-saving change, then a warning; a wechart schedule's runs are listed across it in local time.*
  - *Q4: one refresh-worker badge for everyone; modules' errors go to Super-Admins only.*
  - *Q5: "—" for the token of a build Cube started, with who started it.*
  - *Q6: one Run history record per start, listing its partitions.*
  - *Q7: a scheduled run builds every partition.*
  - *Q8: a missed run is a choice on each schedule, defaulting to "run it once when wechart is back".*
  - *Q9: a run counts as failed when Cube refuses it, or when any partition ends Failed or Missing; the limit is a whole number of 1 or more, with no "Never".*
  - *Q10: any read-write member of the folder, or a Super-Admin, may change a schedule; it belongs to the folder and keeps running if its maker loses access.*
  - *Q11: a cron a refresh key could run is accepted, with a note.*
  - *Q12: a suspension is recorded as a schedule change by "wechart's scheduler"; scheduled runs aren't recorded; a person's actions are.*

**R55 — where a member's references are listed, and a SQL runner gap left for later** (2026-10-02, the user)
- Q (from T451): models now land only through My workspace and a proposal, and with sign-in off that is true for the single user too. So AC-141 has no surface left: a measure renamed in a copy lands silently and breaks shared charts. Where should the warning live? A: "Workspace Save warns (Recommended)". *Saving a workspace model lists the shared charts and dashboards that landing it would change. AC-141 amended.*
- Q (from T532's review): an unchanged workspace copy runs SQL on its original's login even while the original's runner is off. On Snowflake, SQL Server and Dremio, the attestation is the only guard against a writing function. A: "Not a problem. Ignore this for now. Track it in a backlog.. it will not be addressed in this phase or in phase 3". *`docs/phase-2/backlog.md` §8.*

**R54 — the review view's side panels, and design 05** (2026-10-01, the user, with a screenshot of a proposal's review)
- The user: "Make both side panels collapsible. And also match styles with 05 design". *AC-390, T544.*

**R53 — names in the workspace, and models one may only read** (2026-10-01, the user)
- Q (from T347): a chart stores the full name of the cube it was bound to. A workspace cube of the same short name, landing elsewhere, isn't used by tiles saved before it was made. Rebind stored names in the workspace? A: "Rebind in the workspace (Recommended)". *AC-281 amended.*
- Q (from T347): may someone who may only read a folder copy its model into their workspace just to use it? A: "Yes, use-only copy (Recommended)". *A use-only copy can't be proposed back to that folder. AC-283 amended.*
- Claude's calls from T359's report, each overturnable:
  - with security off, models stay editable in place until approval can land them (T451), then become workspace-only like the rest;
  - with security off, an item in no folder is the single user's own;
  - copy on use stays off with security off (AC-371 scoped).

**R52 — design 5's approval questions, and security off** (2026-10-01, the user)
- Asked while T451, T456 and T359 were planned:
  - Q: A proposal can bring a data source with the models that use it, and xcube's dry run binds only to landed data sources. What then? A: "Land data sources first". *A refused approval leaves them landed; AC-321 amended.*
  - Q: AC-321 compares bindings with the proposal's preview: at approval, or as the approver saw it? A: "No edits on something that was submitted.. if it has to change revert the submission, make changes and submit again". *A workspace item in an open proposal is frozen (AC-388), and an approval is judged against the bindings recorded when it was proposed (AC-321 amended).*
  - Q: An empty shared folder can be deleted while a workspace item or an open proposal still targets it. Block the delete? A: "Dont block.. when approved create the folder again and land the files (will that work)?"
    - *Claude answered that it works if wechart keeps a record of each deleted folder: its id, name, parent, description and groups. xcube never reuses a folder's id, so the same id maps back. A deleted parent is recreated the same way.*
    - *Claude's call, overturnable: a same-named folder made since leaves the recreated one a numbered name. AC-389.*
  - Q: With security off, shared items are edited in place today, though R19 chose phase 2's flows (AC-308). Switch now, or at the end of phase 2? A: "Workspace-only now". *AC-254 amended. The phase-1 suite's editing steps are rewritten to go through the workspace now, in T359.*
- From T531's review, Claude's call, overturnable: a change of a data source's database also turns its SQL runner off (AC-374), since grants are per database.

**R51 — design 15 approved; copy on move; its questions** (2026-10-01, the user)
- T527's review found a dashboard can still come to show a library chart off its folder's path: by a move, or by approving a copy no save judged. Asked what then: "Copy on move + approval (Recommended)". *AC-371 amended; T537.*
- Design 15 (`docs/design/reviews/2026-10-01/designs/15-sql-runner.html`): "Approve (Recommended)".
  - P1, while off: "Tab with an off panel (Recommended)".
  - Proposals: "P2 CodeMirror SQL editor, P3 Schema browser, P4 Audit the switch, P5 Cube Store switch in ⋯".
  - Q4, a change of login: "Turns off until reconfirmed (Recommended)".
  - Q1: "The selection (Recommended)".
  - Q2: "This source's, 50 at a time (Recommended)".
  - Q3: "Always above the editor (Recommended)".
  - Q5: "The database's own (Recommended)".
  - Q6, rows before a stop: "Show them, marked cut".
  - Q7, Cube Store and workspace owners: "No, switched-on folders only (Recommended)".
  - Q8, a repointed copy: "Needs the switch if repointed (Recommended)".
  - Q9, Cube Store's confirmation: "That everyone allowed reads all rollups (Recommended)".

**R50 — the SQL runner** (2026-09-30 to 2026-10-01, the user)
- The user: "3. Build a SQL runner into wechart through xcube. This would be a guarded admin route that runs read-only SQL on a model's connection, like Cube Cloud's SQL Runner. have any independent agent do analysis on on Cube Cloud's SQL Runner and Superset SQL Lab. You can use superset instance on localhost:8088. (This is a dev instance so you can get the password from the config files if required)"
- *An independent agent studied both (`docs/research/sql-runner.md`). Claude asked its questions:*
  - R50-1, who may run SQL on a data source: "Own-folder writers, if enabled"
  - R50-2, which credential runs it: "Is there anyway to ensure only read-only operations are done on the datastore for example on select queries.. no update, delete, insert queries or not create table create view kind of operation if that is doable we can do that... for phase 3.. we can just go with otion 3 here"
    - *Option 3 was "Serving login, admin attests". Claude answered that read-only can be enforced in layers. Only single SELECT or EXPLAIN statements parse; a read-only transaction applies where the database has one; there is one statement per run, and BigQuery gets a dry run. One gap remains: on Snowflake, SQL Server and Dremio, a SELECT calling a writing function passes the parse, and only a SELECT-only login closes that (phase 3). Recorded so in §P2.6 J.*
  - R50-3, what it can target: "Landed data sources, My workspace's copies, "Cube Store, read-only""
  - R50-4, which statements run: "SELECT and EXPLAIN only"
  - R50-7, row cap: "10,000 rows"
  - R50-8, time cap: "30 seconds"
  - R50-9, concurrency: "1 per user"
  - R50-10, result size: "10 MB"
  - R50-5, who may run SQL on Cube Store: "Same switch as sources"
  - R50-6, a copy in My workspace: "Always, for its owner"
  - R50-11, results: "CSV up to the row cap"
  - R50-12, history: "My own run history"
  - R50-13, audit: "The event + SQL, literals redacted"
  - R50-14, where it lives: "A tab on each data source (Recommended)"

**R49 — design 14 approved; its questions; a restored data source's test; xcube's tokens and the sample policy** (2026-09-30, the user)
- Design 14 (`docs/design/reviews/2026-09-30/designs/14-deleting-clearing-finding.html`): "Approve (Recommended)".
- Its proposals: "P1 Description in rows, P2 Kind in the address". *A folder row's second line shows its description; the chosen kind is kept in the address (`?kind=`) and stays as subfolders open. P3 (auditing deletes) is not adopted.*
- Q1, another user's draft dashboard showing a shared chart: "No, drafts don't block". *Only a dashboard in a shared folder blocks a library chart's delete; a draft that showed the chart loses the tile.*
- Q2, deleting one workspace item that has an open proposal: "Withdraw it, named (Recommended)". *The confirmation names the proposal, and deleting withdraws it, as Clear My workspace does.*
- Q3, readers and the kind filter: "Readers see only Dashboards and chart that they are entitled to.. no filters for readers".
- Q4, permanent deletes: "Permanent, said so (Recommended)". *Every delete confirmation ends "You can't undo this."*
- A data source's version restored as a draft (T515) and AC-158: "Test before proposing (Recommended)". *The draft is saved as the version had it and proposed only once a test of exactly its settings passes; AC-158 is amended so.*
- xcube's query tokens carry only groups (T437), so the phase-1 sample policy's `securityContext.is_employee` can never hold: "Rewrite on groups (Recommended)". *The sample model's policy and the two phase-1 tests (T172, T174) use a group instead.*
- AC-263, a library chart kept in a folder a reader can't see, on a dashboard they may see: once xcube gates folders (T436), Cube refuses its tile. The user chose "Copy on use". *A dashboard shows only library charts found on its own folder's path; putting one from elsewhere on it makes it a chart of the dashboard's own, so no tile ever needs a folder its readers can't see.*

**R48 — deleting, clearing the workspace, a folder per edit, filtering Explore by kind** (2026-09-30, the user; to requirements only, not to be worked on yet)
- The user: "Let us add the option of deleting empty folders, or deleting individual artifacts. Example if charts can be deleted if no dashboards are using it, dashboards can be deleted because nothing else depends on it, datasources can be deleted if no cubes depend on it, and cubes can be deleted if there are no views connecting to it. In workspaece there should be option to clear the entire workspace, when editing a resource from folder view, it should create a project<date+time> folder (And if possible have folder comments on what resource is being modified).. Also in the explore view there should be option to filter resources only by dashboards and charts, or only by datasources, or only by models. Add it the requirements.. dont work on it right now"
- *Folded into §P2.6 I. A data source is already refused a delete while a cube is bound to it.*
- On resuming, the user: "okay lets resume.. first we will tackle the most recent requirements and go on to implementing.. 1. Workspaces and proposals (finishing the edit-in-a-copy flow) and in parallel request 2. Cube enforcing access itself (xcube) ... then we will start with 3. Jobs and Schedules and 5. Audit trail and bookmarks and then 6"
- Claude asked the seven questions. The user's answers:
  - R48-1, a chart some dashboards use: "Refuse until unused (Recommended)"
  - R48-2, what blocks deleting a cube: "Anything depending on it (Recommended)"
  - R48-3, a folder that isn't empty: "Only empty folders (Recommended)"
  - R48-4, clearing My workspace with open proposals: "Withdraw them too (Recommended)"
  - R48-5, the project folder: "One per edit, all copies in it (Recommended)"
  - R48-5b, a new item made in My workspace: "No, only edits (Recommended)"
  - R48-6, the folder's comment: "Editable description, prefilled (Recommended)"
  - R48-7, Explore's kind filter: "The open folder (Recommended)"

**R47 — Jobs: the pre-aggregation's name as plain text** (2026-09-28, the user)
- UX-080 against AC-229: "Plain text, amend AC-229". *A row click only selects. The docked pane's "Open in Model", deep-linking to the pre-aggregation, is the way to its definition. AC-229's "name linking to its definition in Model" is amended to "a way from its row" (T469's follow-up).*

**R46 — design 13 approved; quick calculations on demand; three chart-editor answers** (2026-09-28, the user)
- **Design 13 (export and import):**
  - Claude asked design 13's open questions. The user chose:
    - Q4, the file: "JSON, *.wechart.json". *Named after the dashboard, and renamable before export.*
    - Q5, dependencies in folders the user may not see: "Show the count". *A count with its reason, naming neither them nor their folders (AC-354).*
    - Proposals adopted:
      - P1, "Outline tiles on hover" (AC-360);
      - P5, "Driver-mismatch warning" (AC-361);
      - "Import in My workspace › New", under a divider (AC-192);
      - "⋯ menu in dashboard header", holding Export, as do Explore's row menus (AC-354).
    - Not adopted: P2 (auditing exports and imports), P3 ("imported from *file*"), P4 (editing settings before the test).
  - Then: "Approve". *T508 is split into build tasks.*
- **Quick calculations:** xcube advised generating the companion measures at serve time on the same cube (`to-wechart/2026-09-28-1500-quick-calcs.md`, option c′). The user chose which measures get them: "On demand". *The first request for a measure's calculation recompiles that module once. xcube runs its spike, then builds and publishes an image.*
  - *Claude disables, with the reason, each calculation xcube's table shows would be wrong or change meaning for a measure type. The list is in `to-xcube/2026-09-28-1600-quick-calcs-decision.md`.*
- **T467's UX-057:** a second metric is on another scale when "Its format differs". For two or more such metrics, Auto draws "per-metric small multiples", which are to be built.
- **T468's UX-031:** "Properties panel for filters". *Selecting or adding a filter shows its field, scope and Remove in Properties, with focus in the field picker. The pill's popover keeps the value.*
- **T453's box plot tooltip:** "Keep n: 120 · Marked: 40".

**R45 — quick calculations: four answers** (2026-09-28, the user; T380 and T381 built, T382 next)
- Claude asked four questions. The user chose the recommended answer to each:
  1. **What a calculation does to its measure:** "Replace in place". *One calculation per measure; the pill names it, and the chart draws the calculated measure. To see both, add the measure twice.*
  2. **Rank's scope:** "Across all rows". *One ranking over every row the chart shows (Cube's `grain: {keep_only: []}`), with competition ranking for ties (2026-09-24).*
  3. **% of total with two dimensions:** "Of the grand total". *Each cell's share of everything shown, which is the filtered total (2026-09-24).*
  4. **The chart's last time field removed while a period calculation is applied:** "Keep it, draw plain + note". *The calculation stays chosen but paused. The chart draws the plain measure with a note naming the field it needs, and resumes when a time field returns.*
- *Still open, asked of xcube first (`to-xcube/2026-09-28-1400-quick-calcs.md`): where the companion measures live under the items model; a running total starting at the chart's range (the user's 2026-09-24 answer); which calculations are correct per measure type. Who publishes companions, and when, follows xcube's answer.*

**R44 — an import always lands in My workspace, with warnings; and design 13's first answers** (2026-09-28, the user)
- On design 13, Claude asked four questions. The user chose the recommended answer to each:
  1. **A data source whose name the target already has:** "Map or create". *No Replace for a data source: map it to the existing one, or create it under another name.*
  2. **Skip, for a library chart on the imported dashboard:** "Target's same-named chart".
  3. **Replace with sign-in off:** "Yes, keep it in History".
  4. **Dependencies in Export:** "Ticked". *They start ticked, so the file works wherever it goes.*
- Then the user: "lets have imports always going to the users workspace.. and from there it can follow the usual flow when it is moved to a folder. Does that make sense? will it make the implementation easier and less confusing. While imorting.. show warnings on which resources may be impacted.. for example.. duplicate model or duplicate datasource for instance.. if this makes sense update the import workflow. and also update the ui design.. have a seperate agent work on this"
  - *An import puts everything it holds into the importer's workspace as new drafts. It never replaces, renames or skips a shared item. R43.3's "Ask per item" is superseded, and with it answers 2 and 3 above.*
  - *From the workspace, each item follows the usual flow. Its target is chosen as New in My workspace chooses one. It reaches a shared folder only by Propose and Approve, whose check says what it replaces and refuses what can't land (AC-278, AC-284, AC-288).*
  - *Before importing, wechart warns, without blocking, of what the drafts may affect when proposed:*
    - *an item of the same kind and name in the target or the workspace;*
    - *a model defining a cube or view whose name the target already has (AC-270);*
    - *a data source whose name the target already has (AC-282). Mapping to that one instead is offered beside the warning.*
  - *Answer 1 stands: a data source is mapped to an existing one, or created in the workspace with its secrets entered and a passing test. Where the target has its name, it is created under another name, as AC-282 already requires.*
  - *With sign-in off, the import also goes to the single user's workspace, and they approve their own proposals (R19, AC-254). An earlier note here said sign-in off has no workspace; that was Claude's error, caught by the design agent.*
  - *The design agent redraws design 13's Import to this.*

**R43 — exporting and importing a dashboard; and two answers for markings** (2026-09-28, the user)
- The user: "can we add requirement for export and import dashboard. while exporting dashboard it should give option to select the dependencies.. for datasource, everything can be exported except for the secrets. have any ui agent create a ui-design for this functionality."
- Claude asked four questions. The user chose the recommended answer to each, and all three optional dependencies:
  1. **Where an import lands:** "My workspace, then propose". *Imported items go into the importer's workspace, with the target folder they choose, and reach it by a proposal like any change (AC-278). With sign-in off, straight into the chosen folder.*
  2. **The dependencies offered at export:** "Library charts it shows, Models its charts use, Data sources". *The dashboard's own charts always go with it. Bookmarks are not exported.*
  3. **A same-named item where an import lands:** "Ask per item". *Replace (by proposal where shared), keep both (the import renamed), or skip.* *Superseded by R44: an import lands as new drafts in the workspace, with warnings.*
  4. **An exported data source on import:** "Map or create". *Map it to an existing data source the importer may use, or create it from the exported settings with its secrets entered, tested before saving.*
- *A data source is exported with everything but its secrets: its driver, settings and description; never a secret, sealed or not.*
- *One file holds the export.*
- *A UI design comes first: `docs/design/reviews/2026-09-28/designs/13-dashboard-export-import.html`.*
- *Importing models waits on workspace models (T347, T350). Until then an import holds dashboards, charts and data sources, and the models go by proposal once T347 is built.*
- *For markings (AC-097, T453), the user answered two questions:*
  - *a partly marked table row: "Rule and marked value", the prototype's left rule in the secondary colour, and the marked share beside each measure ("10 · Marked: 4");*
  - *a partly marked scatter point, box plot or map region: "Outlined, hatched, tooltip", as pies and treemaps are drawn. A box plot's box is partly marked when some of its rows are, and each outlier is marked or not.*

**R42 — the waiting questions, in two batches** (2026-09-28, the user, after asking why criteria closed slowly)
- The user chose all four ways to close criteria faster: "Finish chains to close ACs", "Parallel agents in worktrees", "Pin xcube only when needed", "Batch the open questions now".
- Claude put eight of the backlog's questions to the user in two batches. The user chose the recommended answer to each.
  1. **A rejected proposal's Dismiss** (design 05, state M): "Until proposed again". *Stored for the user on every device; the band stays gone until the item is proposed again (T358).*
  2. **Jobs' Trigger column** (AC-229 against design 10): "Both: Trigger + Started by". *"Trigger" stays the refresh key in words (AC-229). "Started by" is added for the builds wechart records (AC-150). The refresh worker's builds show no starter until their history comes, next phase (R41).*
  3. **AC-234's cache warm-up:** "Pre-aggregations only". *A wechart schedule builds pre-aggregations. Result-cache warm-ups are dropped, since they would need tokens per group set (AC-008).*
  4. **AC-155's suspension:** "wechart's, after 3, per schedule". *Only wechart-owned schedules suspend. The number of consecutive failures is set per schedule, 3 by default. Cube's refresh keys keep Cube's own retry with backoff.*
  5. **A BigQuery key, Snowflake OAuth token or Dremio token entered again:** "Warn before replacing". *The form keeps the stored secret unless the user chooses to replace it, and says that replacing it rebuilds the data source's rollups.*
  6. **Query records for a read-write member:** "Their own queries". *wechart records who ran each query. A read-write member sees their own in Jobs; a Super-Admin sees every one (T371).*
  7. **Data as of for a reader:** "Freshness only". *A reader sees what served the tile, how fresh it is and its schedule in words. "Open in Jobs" and "Edit schedule" show only to those who may use them. No refresh-key SQL or file reaches a reader (T371's review).*
  8. **Auditing builds:** "Yes, all three". *A build started from Jobs, a cancel, and a change to a wechart schedule are recorded in the audit trail (AC-294).*

**R41 — the refresh worker's build history, deferred; the rest worked out with xcube** (2026-09-28, the user)
- The user sent xcube's analysis of Jobs and Schedules (`docs/inputs/2026-09-28-jobs-schedules-analysis.md`): "please review it.. and work with cube for implementing these..".
- Then: "History of the refresh worker's build.. we can defer this to the next phase.. and anything else blocked by it to next phase".
  - *Deferred to the next phase, and no task builds them in phase 2:*
    - *the refresh worker's builds in wechart's history: AC-150's worker half, and T373;*
    - *what only that history supplies, for builds Cube starts on its own:*
      - *design 10's "Failed", "Duration vs average", "Trigger: Schedule" and "Recent builds" for such builds;*
      - *design 07's last build outcome, and who started it;*
      - *a "* * * * *" rollup in Run history within one check period (AC-150's Fails-when).*
  - *R40.3's first ask of xcube, the build-event route, is withdrawn.*
  - *Asked of xcube now (`to-xcube/2026-09-28-1200-jobs-schedules-routes.md`):*
    - *the build queue with cancel, R40.3's second ask, with each entry's pre-aggregation (AC-151);*
    - *hidden cubes on the admin meta, so every rollup is listed (AC-154);*
    - *the refresh worker's status: the revision it serves, its last tick and its errors (AC-156).*
  - *wechart moves Jobs' and Schedules' field list to xcube's admin `…/meta?revision=` before security goes on (the analysis; T371 and T437).*
  - *The analysis's options for AC-234's cache warm-up go to the backlog question (R40).*

**R40 — Jobs and Schedules, after an independent sync check** (2026-09-28, the user: "can we have independent ui-expert as well as bi tools/cube expert analyze the jobs and schedules.. and see if the ui designs and the requirements are in sync"; the reports are in `docs/design/reviews/2026-09-28-jobs-schedules/`)
- Claude asked four questions from the two reports. The user chose the recommended answer to each.
  1. **Every Jobs and Schedules route was open to any signed-in user** (a reader could list every folder's rollups, start builds, and read everyone's queries). The user: "Build T371 properly next".
     - *Jobs and Schedules are scoped to Super-Admins and each folder's read-write members, for their own folders, as AC-297 says. T371 is built next, ahead of the rest of designs 05 and 06. Data as of keeps a narrow answer for readers.*
  2. **Design 10 says "building and scheduling need no proposal", but a Cube-owned schedule is a `refresh_key` in the model.** The user: "Schedule edits go by proposal".
     - *Changing a `refresh_key` is a model change: workspace, propose, approve (§P2.6 E, AC-278). "Direct" covers only building now and wechart-owned schedules (AC-234). AC-297's "schedule" reads so. Design 10's note (pin 6, and the pane's note) and `references.md` are superseded on this point.*
  3. **AC-150's history of the refresh worker's builds, and AC-151's queue and cancel, need xcube routes that don't exist.** The user: "Ask xcube for both".
     - *Asked of xcube, through the Cube-expert agent, in `to-xcube/2026-09-28-1100-build-events-and-queue.md`:*
       - *a model-scoped route listing build outcomes (pre-aggregation, table or partition, who started it, start, end, duration, outcome with error, module and epoch);*
       - *a queue route with cancel.*
     - *wechart builds on them once the image is published (R35).*
  4. **Partitions (AC-145), Run history (AC-150), the queue (AC-151), suspend and Resume (AC-155) and wechart's own schedules (AC-234) have no approved design.** The user: "Draw new designs first".
     - *A UI design round draws them, with every state (loading, error, empty, refused), and reconciles designs 10 and 07, before they are built.*
- *The reports' other questions wait in `docs/phase-2/backlog.md` §6, to be asked when their work is reached:*
  - *the meaning of "Trigger" (AC-229);*
  - *what "cache warm-up" is (AC-234);*
  - *whose schedules AC-155 suspends, and the configured number;*
  - *a rollup with both kinds of schedule;*
  - *next runs across DST;*
  - *the refresh worker's indicator;*
  - *readers' Data as of links;*
  - *auditing builds.*

**R39 — xcube's slice 7, and JavaScript, Jinja and Python cubes on a changed target, deferred** (2026-09-28, the user, after Claude reported them still open)
- The user: "requirements and functionality relating to "Lets defer this "Still open: Slice 7 stays deferred, and the file-set gap from before is unchanged: JavaScript, Jinja and Python cubes still aren't renamed when their target changes." it will not be done in this phase." will be deferred and not done in this phase"
  - *Not done in phase 2, and no task builds them:*
    - *xcube's slice 7, the plan's optional slice: Cube's own answers in place of the rules wechart re-implements.*
    - *Aliasing a file-set model's JavaScript, Jinja and Python cubes when their data source's target changes (`to-wechart/2026-09-28-0100-changed-in-place.md`: such a cube keeps its alias, so its rollups renew only on their refresh keys).*
  - *Neither touches what wechart serves: its models are items, and it publishes only YAML (AC-332, AC-335). Both are in `docs/phase-2/backlog.md` §7.*

**R38 — a root item's names, and a data source changed in place** (2026-09-28, the user, asked when xcube `bc18f82c01` renamed every root cube on the stored `default`)
- Claude asked: xcube's new image serves a moved data source from its new target by aliasing each cube by its connection's identity. That also renames the root's cubes and rebuilds their rollups once at upgrade, which breaks AC-328 ("root items keep their names, SQL and rollup tables; no rollup rebuilt"). Options: alias only after a change; accept identity aliases; keep AC-328 strictly.
- The user chose: "Alias only after a change (Recommended)".
  - *A cube keeps the names it has while its connection still has the identity it was first served with. It takes an identity alias only once that connection's target changes (host, database, user or key holder; a password doesn't count), when its rollups are rebuilt anyway. Moved back, it has its first names again. Nothing is renamed or rebuilt at upgrade.*
  - *This keeps `[X3A]`'s "Nothing Cube serves changes for the root's items" until the root's data source is moved to another target. It also keeps the 2026-09-27 answer ("No and No"): a moved data source never answers from its old target's cache or rollups.*
  - *Asked of xcube in `to-xcube/2026-09-28-0700-alias-only-after-a-change.md`. wechart pins the image that carries it, not `bc18f82c01` (T501).*

**R37 — both UI reviews' designs, as a priority** (2026-09-27, the user, while design 03's check ran)
- The user: "after your current work.. please work on designs in /Users/srajagopal/Work/wechart/docs/design/reviews/2026-09-27/designs and /Users/srajagopal/Work/wechart/docs/design/reviews/2026-09-24/designs if there is a conflict.. designs on 2026-09-27 will take precedence and supersede the ones on 2026-09-24. Make this a priority. If any of them is blocked because of decisions to be made, or because of xcube, or because some of the foundational decisions or apis have not been implemented then put them into backlog and continue with the rest.."
- Then: "after completing 03.. deploy to kubernetes.. and the same with all the other pages.. some of them should already be implemented.. keep track of which designs are completed to completion"
  - *The 2026-09-24 designs are to be built as drawn. This supersedes R33's "Bugs and consistency only" for designs 01, 02 and 04–07. Design 03 was approved by R34 and design 08 on 2026-09-25 (F23).*
  - *Where a 2026-09-24 design and a 2026-09-27 design differ, the 2026-09-27 one is built.*
  - *A design's items marked "proposal — needs the user's approval" that the user never decided stay undecided. The same goes for other open questions (a design against an earlier answer, say). All of these go to the backlog, with what is to be decided.*
  - *An item that waits on xcube, or on wechart work not yet built (the proposal chain, the audit trail, build history), goes to the backlog with what it waits on. The rest is built.*
  - *Each design is finished in turn and then deployed to docker-desktop. `docs/design/reviews/status.md` tracks each design's state.*

**R36 — the proposals of designs 11 and 12, and the markings flake** (2026-09-27, the user, after Claude listed the open proposals)
- The user: "okay for both Your OK to fix the flaky markings test's expected count. - The open proposals in 11 and 12 and MW-19... first let me know what is the open proposal for designs 11 and 12 and MW19.. for flaky markings test put in backlog.. we will do it after we complete other things"
  - *The markings test's expectation is to be corrected, later: it is in `docs/phase-2/backlog.md` §2.*
- Claude listed design 11's five proposals and design 12's MW-19. The user: "sure okay for all", then "proveed".
  - *Approved, all six:*
    1. *Generate cubes adds the generated cubes as unpublished drafts in the tree, saved with "Save & reload Cube" as New cube's are, instead of publishing them. This settles the critique's D4, which had been left as built pending the user (AC-345).*
    2. *The Tables step marks a table a cube in the model already reads from as "In model", before generating (AC-347).*
    3. *The Source step shows each data source's health, from Data sources (AC-348).*
    4. *A select-all checkbox for the page in the table list's header (AC-349).*
    5. *With security on, the pane's head says "in My workspace", as design 01's does (AC-350).*
    6. *MW-19: New view writes no `cubes` and opens on its Cubes tab, ready to add one (AC-351).*
  - *What follows from 1, decided by Claude as the one way the drafts compile:* Cube refuses a join to a cube it doesn't have, at compile ("Cube <name> doesn't exist", research/cube/rollup-join-paths.md and whole-model-publish.md), and Generate's cubes often join one another. So saving a draft publishes with it the unpublished drafts it joins, named beside Save before it is pressed (AC-346).
  - *Proposal 2's mark reads the model's `sql_table`s, not a predicted cube name: Cube's scaffolder names a cube by its whole batch (research/cube/introspection-api.md, "Cube names depend on the batch"). The clash check after generating is unchanged (AC-249).*

**R35 — designs 11 and 12, and what the backend can't yet do** (2026-09-27, the user, after seeing designs 11 and 12)
- The user: "i checked the ui design.. and it looks great.. if any of the ui is not based on the backend design., and if it requires redesigning any of the backend (xcube) then it can be put in the backlog. If it is achievable by simple changes in the backend.. then we should do it..."
  - *Read as the approval of designs 11 (Generate cubes) and 12 (the Model overview), as drawn. Their "Proposals (need approval)" notes stay proposals.*
  - *Where a design draws something the backend does not provide:*
    - *if it takes a simple change in wechart's API or in xcube, make it;*
    - *if it needs xcube redesigned, put it in `docs/phase-2/backlog.md` and draw the UI without it.*
  - *Changes to xcube still go through the Cube-expert agent, and are built on only once its image is published.*

**R34 — the Model workspace and Generate cubes, as a priority** (2026-09-27, the user, after T472)
- The user: "Cleanup the models page.. add models page and generate cube page.. all of them are not in sync with the rest of the app and the ui design.. if required use an ui expert agent. take this as a priority. since the app is already running the ui expert can use that to check the experience."
  - *Read as the approval, for the Model workspace, of phase-1 design 03 (`docs/design/reviews/2026-09-24/designs/03-model-workspace.html`), which R33's "bugs and consistency only" had left unapplied. It covers:*
    - *the Model overview;*
    - *a model file's editor;*
    - *"New cube" and "New view", the "add models page";*
    - *Generate cubes, the "generate cube page".*
  - *These are to be brought in line with that design and with the rest of the app as rebuilt since.*
  - *A UI expert's critique of the running app is at `docs/design/critiques/2026-09-27-model-workspace.md`.*
  - *It goes ahead of the other UI work.*

**R33 — the UI reviews of 2026-09-27** (`docs/design/reviews/2026-09-27/`: `ui-review.md` with designs 01–10 for phase 2, and `phase-1-recheck.md`; asked after the user's "The ui for the wizard looks bad.. go back to the ui design review that was run in phase 1.. and clean up the entire ui when we get a chance.. and also for phase 2 requirements run it through a ui expert, get the designs and apply the designs to our screens")
- Q: How should I treat the ten phase-2 designs? A: "Approve all with proposals"
  - *All ten designs are approved as drawn, with their five proposals: vendor logos on the driver tiles (AC-338), the `http://` Dremio Cloud warning (AC-339), BigQuery's `client_email` read in the browser (AC-340), changed and new tiles marked in a review (AC-341), and a hidden same-named cube listed dimmed (AC-342). AC-343 holds every phase-2 surface to its design.*
- Q: The phase-1 designs 01–07 were never approved, and 25 findings are still open. What should the cleanup cover? A: "Bugs and consistency only"
  - *The re-check's broken flows and cross-screen inconsistencies are fixed. The editor's inspector and drawer are not rebuilt to phase-1 designs 01–02.*
- Q: What order should the UI work take relative to the remaining xcube integration? A: "UI first (Recommended)"
  - *The critical bugs first, then the data-source wizard and settings, then the rest of the UI, then T437 (RS256 keys, paused in a stash) and T347 (overlays).*

**R32 — asked after T363's review** (2026-09-27; its cold review found rule 35 and the approved prototype at odds with AC-158's override)
- Q: Test first, or allow "without a test"? Design rule 35 and the approved prototype say a new data source can't be made until its test passes. AC-158 and the task allow an explicit "without a test". Keep the override, or remove it?
  A: "test first, and dont save if test fails.. both in create new as well as edit.."
  - *AC-158 and rule 23 are amended: no override, for a create and for a change to a data source's connection (T461).*
- Q: Wizard tests never used: tests run in a wizard that was then cancelled stay stored, attached to no data source. Should they be cleaned up after some time, or kept?
  A: *(answered with the question above; not separately)*
  - *They are kept for now. A cancelled wizard's tests belong to no data source; those of a wizard that makes one join its history.*

**R31 — what xcube's slices 4–6, as built, left open** (`docs/inputs/2026-09-26-xcube-slice-{4,5,6}-contract.md`, `…-connections-drivers.md` and `…-xcube-overlay-data-sources.md`, checked in `docs/research/xcube-slice-{4,5,6}.md` and `xcube-overlay-data-sources.md`; asked in the conversation, 2026-09-26, numbered as the handoff numbers them)
- Q18: Which xcube image to pin for slices 4–6? The TLS binding exists only from `1249dda9ca` on; `ed08180c37` has it too, with overlay data sources. A: "use the latest one.. whichever was built last"
- Q19 (xcube's question): a workspace copy of a data source can change its driver in a preview, but landing it answers `409 driver_change`. Should the workspace refuse the change up front? A: "Yes"
- Q20: AC-161: xcube never removes the health rows of Cube instances that are gone. Until it does, what should the UI show when stale rows are present? For example, hide rows older than a limit. A: "For example, hide rows older than a limit", then, asked for the limit: "lets do it 1 hr..."
- Q21: AC-273, AC-310: xcube binds a data source only at publish. When a nearer `default` or source appears on a cube's path, should wechart republish the cubes it would now bind differently? A: "No"
- Q22: Dremio Cloud: require `https:` URLs (the token would travel in clear otherwise)? A: "No"
- Q25: Should a chart or dashboard save in a folder be refused while xcube is unreachable (it is now, with a 502), or stored unbound and bound at the next save? A: "Yres" (read as yes, refuse)
- Then asked together (AskUserQuestion, 2026-09-26):
  - Q: How should the shared root's `default` data source get its sealed secret? wechart may never see a plaintext password, but today the chart feeds the database password to Cube's environment. A: "Post-install Job (Recommended)"
  - Q: A data source created new in a workspace, under a published one's full name (same folder, same short name), would replace the published one in the workspace's previews, for published cubes too. Allow that? A: "Copies only (Recommended)"
  - Q: In a proposal's preview, names resolve among the overlay's items first, whatever their folder; once landed they resolve nearest-first along each item's path. So a proposal whose preview worked can land bound to other cubes. What should approval do? A: "Refuse on a difference (Recommended)"

**R30 — what xcube's slice 3, as built, left open** (`docs/inputs/2026-09-26-xcube-slice-3a-contract.md`, checked in `docs/research/xcube-slice-3a.md`; xcube's answers `docs/inputs/2026-09-26-xcube-answers-slice-3.md`, checked in `docs/research/xcube-slice-3b.md`; 2026-09-26)
- The user's brief, before the round, recorded as `[X3, user]`:
  - "Root items keep their bare names. Only items in other folders are <folderId>__<shortName>. Amend AC-328 accordingly and drop AC-331's reference migration: no stored chart, dashboard, bookmark or URL changes, and every dashboard renders unchanged by construction (keep T430's comparison as a check)."
  - "Slice 3 ships as 3a (names) and 3b (modules). 3b needs nothing from wechart: queries, /v1/meta and jobs are routed to modules transparently."
  - "Use image xcube:v1.7.45-f9f833d324."
- Claude listed what the contract changes in the plan; the user answered "go ahead" and "withe interview round R30".
- First asking (folder ids, workspaces, model files, rollback): the user answered each "Please check what is implemented in ~/Work/bi/cube/xcube branch feat/xcube".
- Claude read the fork at `f9f833d324` and reported: folder ids checked only by form, with no mapping; no overlays; exactly one cube or view per item, nothing split; the slice-2 image refused once 3a has run. The rephrased questions were declined with "The user wants to clarify these questions", and the user then said: "If you any questions give it to me as a prompt and i will work with the agent in cube that will answer it for you.."
- Claude wrote the eight questions as a prompt; xcube's answers came back as `[X3A]`. The user then asked that the two sessions work directly through `~/Work/xcube-exchange/`, and: "Build against the published image, ghcr.io/senthilkrajagopal/xcube (amd64 and arm64), pulled by digest."
- Q: xcube's answer: wechart allocates folder ids; they must be stable, unique and never reused, and any injective encoding works (UUIDs as `f` + 32 hex; others e.g. `f` + 24 hex of SHA-256, or a stored counter). Which for wechart's non-UUID ids (seed and workspace)? A: "Stored id per folder (Recommended)"
- Q: xcube's answer: splitting multi-cube files into items when sending is supported, but one cube or view per file keeps error placement and the items hash simple, and is its recommended layout. wechart's model store: A: "One per file (Recommended)"
- Q: xcube's answer: overlays are slice 5 and not built; until then workspaces should stay out of the folder tree, since anything in it is published and served. For slice 3: A: "Out until slice 5 (Recommended)"
- Q: AC-331 (rewrite every stored reference to its prefixed name) no longer applies: root names stay bare, so nothing stored changes. What should the spec do? A: "Retire it, add a new one (Recommended)"
- Q: xcube's answer: there's no xcube field-list route; Cube's /v1/meta, merged across modules and keyed by x-xcube-revision, is the field list (slice 4 plans an own-behalf admin read). T432 ('serve metadata from xcube's merged field list') therefore has nothing new to build. What happens to it? A: "Retire it into T426 (Recommended)"
- Q: xcube's answer: the slice-2 image refuses a schema migrated by 3a or 3b, but xcube's schema is derived data, so the way back is dropping it and letting the slice-2 release re-import its file set (or restoring a pg_dump taken before the first 3a start). For the switch: A: "Drop and re-import (Recommended)"

**R29 — what xcube's slice 2, as built, left open or contradicted** (`docs/inputs/2026-09-26-xcube-slice-2-contract.md`, checked in `docs/research/xcube-slice-2.md`; asked together, 2026-09-26)
- Q: xcube takes only plain YAML by default. The seed model holds one Jinja file, cubes/product_catalog.yml, which AC-140 shows read-only and model.spec checks Cube compiles. What happens to non-YAML files when wechart pushes its whole model to xcube? A: "Leave them out (Recommended)"
  - *The option read: "Only YAML files go into xcube's snapshot. Non-YAML files already stored stay viewable read-only (AC-140) but are never served. The seed's template is rewritten as plain YAML so product_catalog keeps working."*
- Q: A publish's rollup probes: the fork session's contract sends compare: true so a rollup already refused before the change doesn't block it. The requirements (AD 6, then IP 5) say a publish is refused if any module it affects breaks, and the research says the second probe can go. Which holds? A: "Refuse every break (Recommended)"
- Q: When do Cube's model callbacks go: /api/cube-model/*, the publish_drafts table (T418's interim fix), the CUBE route class, WECHART_MODEL_STORES/KEY and the draft claims? A: "In slice 2's cut-over (Recommended)"
- Q: xcube's admin routes take a static token from XCUBE_ADMIN_TOKENS (32+ characters, rotatable as a list), which slice 4 replaces with the service credential. AC-326 says every own-behalf call uses the service credential. For slice 2: A: "Static token until slice 4 (Recommended)"

**R28 — the questions the 2026-09-26 integration plan left open** (`docs/inputs/2026-09-26-integration-plan-decisions.md`; the list of places it contradicts went to the user first, and the user answered all ten in one message, then asked that the whole list be worked through)
- Q1: The shared root: R27 kept its names unprefixed, with nothing migrated. Decision 3 and the plan prefix every name and migrate chart and dashboard references in slice 3. Should the root be prefixed too? A: "keep it consistent... no special handling for root"
- Q2: Overrides: when a child folder publishes its own `orders`, do its existing items switch at once (R27, AC-275) or when each is next published (the plan)? A: "agree.. only when it is next published"
- Q3: Folder ids in names: wechart's folder ids are UUIDs, which Cube names reject. Recommended: `f` plus the UUID's 32 hex digits, with xcube's short `sql_alias` keeping database names short. A: "sql_alias"
- Q4: Token claims: groups trimmed to those some policy names, plus `role`, and no `sub`? A: "sounds good"
- Q5: Keys: wechart pushes its JWKS to xcube through an admin route, never fetched from wechart? A: "okay"
- Q6: Folder access in Cube: gate policy evaluation by folder inside xcube, rather than write folder policies into the model, where Cube would OR them with authored ones? A: "okay"
- Q7: Model files: xcube accepts YAML only, with Node's `require` off, because model code runs where credentials are decrypted? A: "okay"
- Q8: Libraries: `jose` 6.2.12 to sign tokens, `hpke` 1.1.7 to encrypt credentials in the browser? A: "okay"
- Q9: AC-136, AC-137 and AC-009 stay ticked until slice 3 changes how publishing works, then are retested? A: "okay"
- Q10: Which branch for the xcube slices? A: "feat/xcube all work with be in feat/xcube until i merge to main explicitly"
- Claude's reading of Q3, stated to the user before writing: Cube names can't hold a raw UUID, so a name is `f` plus the UUID's 32 hex digits, and xcube's `sql_alias` keeps database identifiers short.
- The user, after the answers: "We now have to work though all of this" (the list, pasted back).

**R27 — the questions the 2026-09-25 architecture decisions left open** (`docs/inputs/2026-09-25-architecture-decisions.md`; the user confirmed the list of places they contradict, then answered)
- Q: Rebinding (decision 3): when a nearer cube, data source or `default` is published after other items already bound a farther one, or a bound item is deleted, what happens to the items already bound? A: "Rebind at that publish (Recommended)"
- Q: Prefix (decision 2): what is a published cube's, view's or data source's prefix built from? A: "Folder ids (Recommended)"
- Q: AC-309 (decision 3 drops binding from the viewer's folder): what should the criterion become? A: "Retire it (Recommended)"
- Q: Descendants (AC-273, R19): today a data source can come from a descendant folder when no folder on the path up has the name, and a name found in two descendants is refused. Keep that? A: "Drop it (Recommended)"
- Q: Default connection (AC-310, R22): where does the deployment's own `default` data source live? A: "A root data source (Recommended)"
- Q: Crossing folders (AC-025, AC-283): may an item use a cube outside its own folder path by naming the cube's full prefixed name? A: "No: its path only (Recommended)"
- Q: Phase-1 names: charts, dashboards, markings, bookmarks and links from phase 1 name members by short cube names. How do they keep working? A: "The root has no prefix (Recommended)"
- Q: Model history (AC-289): does wechart keep copies of the model files it publishes? A: "Yes, per version (Recommended)"
- Q: Generated policies (decisions 4, 5): which groups does xcube's generated access policy admit to a folder's cubes? Items in /A/B bind cubes from /A, so /A's cubes are queried for /A/B's members too. A: "Reaching it or beneath (Recommended)"
- Q: Preview (AC-166, rule 21): with tokens carrying groups only, what does a Super-Admin's "Preview as" set? A: "Groups only (Recommended)"
- Q: Keys (decisions 1 and 12): Cube must verify wechart's RS256 tokens, but never calls wechart at runtime. How does it get wechart's public keys? A: "Pushed to xcube (Recommended)"
- Q: Hidden folders (AC-263 against AC-264): may a read-only user open a chart that is kept in a folder they can't see, when it's on a dashboard they can? A: "Yes, via the dashboard (Recommended)"
- Q: Credentials (decision 7): where is a newly typed secret encrypted to xcube's public key? A: "In the browser (Recommended)"
- Q: Start-up checks (AC-311 is retired): what should the services check about keys when they start? A: "Both refuse (Recommended)"
- Q: Whole-model refusals (decision 6): when a publish breaks something in a folder the publisher can't see, what does the refusal tell them? A: "Count elsewhere (Recommended)"
- Q: When is the whole-model check run for a proposal? A: "At propose and approve (Recommended)"
- Q: Overlays (decision 8): who may query a workspace's or a proposal's overlay, and how long does it live? A: "Owner, then deciders (Recommended)"
- Q: Build history (AC-150): Cube's refresh worker can no longer post its builds to wechart. How does wechart learn of the builds it starts? A: "Pull from xcube (Recommended)"
- Q: Direct changes (AC-291): do renaming, moving and deleting models, data sources, or folders holding them count as publishes, compiled whole and refused if anything breaks? A: "Yes (Recommended)"
- Q: HA (decision 11): should the query path's high availability get its own acceptance criterion? A: "Yes, testable (Recommended)"
- Claude's reading of decision 12, stated to the user before writing: the service credential covers every call wechart makes on its own behalf rather than for a signed-in user (introspection, builds and jobs, system partitions, health, and every xcube admin call).

**R26 — asked after T323** (its cold review raised it)
- Q: With sign-in on and no Super-Admin group configured, should the API refuse to start? A: "yes"

**R25 — asked while implementing T318–T322** (the cold reviews raised them)
- Q: AC-251 exempts only "health routes", but sign-in's own routes and the model routes Cube reads with its key are exempt too. Reword AC-251? A: "yes go ahead and change it"
  - *The model routes go with decision 1 (2026-09-25): Cube never calls wechart.*
- Q: Add a cross-site check (`Sec-Fetch-Site` / `Origin`) on requests that change something, which the research suggests and no task holds? A: "yes"
- Q: T322 reads AC-008's "every request" as every request made for a signed-in user, wechart's own requests keeping the configured context. Confirm, or reword AC-008? A: "reword to match with the requirements provided"
  - *wechart's own requests use the service credential from decision 12 (2026-09-25).*

**R24 — asked while implementing T316** (the research left it open, and the spec set none)
- Q: With security on, how long should a sign-in last before wechart asks the user to sign in again? A: "12 hours, no idle limit"

**R23 — accepting the phase-2 design direction** (`docs/design/direction.md` §7e)
- Q: Do you accept the phase-2 design direction, including the listed defaults? A: "Accept (Recommended)"
- Q: How should the Access panel show a group? A: "Exactly as the token sends it (Recommended)"
- Q: Should read-only users see a dashboard's or model's version History? A: "No, read-write and Super-Admin only (Recommended)"
- Q: AC-001 lists the Data sources page for every user, but read-only users may see no data sources. What should they get? A: "Hide it from read-only users (Recommended)"

