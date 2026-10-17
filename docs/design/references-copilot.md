# Design references: the copilot (chat) panel

Date: 2026-10-17. Author: ui-researcher, for the coordinator.
Inputs: `docs/inputs/2026-10-17-copilot-chat.md`, `docs/inputs/2026-10-17-mcp-server.md`, `docs/spec.md` F29–F30, `docs/design/direction.md` (§1–§9, rules 1–89), and `docs/design/decisions-2026-10-08.md`.

**Status.** This is a proposal. No requirement, AC or spec text exists for the copilot yet, and the user asked to brainstorm first. Everything under "Direction" waits for the user, and the open questions at the end are written as candidate answers.

**Source notes.**
- This session's web-search budget had run out. Every product claim below comes from fetching the vendor's own documentation page directly; each page is linked at the end.
- The fetch tool returns an extract of each page. Text in quotation marks is what that extract returned as quoted UI text. Unquoted statements are paraphrases of the page.
- These pages returned 404 and were not studied, so nothing below relies on them:
  - Looker's LookML assistant page (`/looker/docs/lookml-assistant`, `/gemini-lookml-asst`);
  - Sigma's `ai-in-sigma` page;
  - ThoughtSpot's admin and bring-your-own-LLM pages;
  - Tableau's "Tableau Agent in Dashboards (Beta)" page.
- **No product publishes the width of its chat pane, its type sizes or its row heights.** Every size below is derived from direction.md's tokens, and each one says so.
- **Cube Cloud's AI features** (Analytics Chat, workbook agents; `docs/research/cube/cloud-product-features.md`) are left out, because the user excluded Cube's own UI as a design reference (`references.md`, "Scope change").

## Products studied

| Product | Why chosen | Sources |
|---|---|---|
| **Power BI Copilot**: the report pane, web modeling (preview) and DAX query view. Docs dated Jul–Oct 2026. | The most common enterprise BI tool. It is the only product here that edits **both** reports and the semantic model by chat. It also has a diff-then-Keep pattern on code (DAX), citations, and tenant-level admin settings. | [pbi-intro], [pbi-create], [pbi-summ], [pbi-narr], [pbi-model], [pbi-dax], [fab-admin] |
| **Tableau Agent**: web authoring, with per-site AI settings. | Analysts know it best. It changes the viz directly on the canvas, and Show Me (already a wechart reference) sits next to it. | [tab-agent], [tab-admin] |
| **Looker with Gemini**: Conversational Analytics, dashboard agents (GA 2026-10-08), Insight Assistant, the VS Code extension with Looker's MCP server. | BI on a semantic model, the closest analog to wechart. It shows its reasoning ("How was this calculated?"), and its MCP-plus-validator workflow for LookML matches the user's planned MCP server. | [lk-ca], [lk-dash], [lk-insight], [lk-vscode], [lk-admin], [lk-rn] |
| **ThoughtSpot Spotter**: Spotter, SpotterViz (Liveboards), SpotterModel. | Builds dashboards (SpotterViz) and models (SpotterModel) by chat. Its interpretation tokens, checkpoints and step-by-step model suggestions are all relevant. | [ts-overview], [ts-start], [ts-viz], [ts-model] |
| **Hex**: Notebook Agent, Modeling Agent, BYOK. | The clearest "pending changes" review (Confirm/Undo per cell). It has an agent for semantic models and admin-supplied API keys (BYOK). | [hex-ai], [hex-agent], [hex-model], [hex-admin], [hex-byok] |
| **Sigma Assistant** | Builds workbooks by chat, with a build/plan mode switch and @-mentions of elements. Admins choose a provider hosted in the warehouse or outside it. | [sig-build], [sig-wb], [sig-admin] |
| **Metabase Metabot** | Already a wechart reference. Its **admin model is closest to the user's ask**: a Super-Admin picks the provider (Anthropic, OpenAI, Azure, Bedrock, Gemini), the models and the key, and sets usage limits and AI auditing. | [mb-bot], [mb-settings], [mb-limits], [mb-audit] |
| **Code-editor agents**: GitHub Copilot in VS Code and its cloud agent, plus the browser tools in Cursor and Claude Code. | The diff-then-Keep/Undo pattern for code-like files such as Cube YAML, checkpoints, the agent-to-pull-request hand-off, and the only documented **visual self-checks** (the agent looks at the rendered page). Claude Code with Chrome is what the user saw. | [vsc-review], [vsc-agent], [gh-agent], [cursor-browser], [cc-chrome] |

**Considered and not studied:** Cube Cloud (excluded by the user), and Omni and Lightdash (less familiar to this audience). The eight products above cover dashboards, models, admin settings and visual checks.

## Observations per product

### Power BI Copilot

- **Placement and opening**
  - "The report agent Copilot pane available on the right side of reports is generally available." A standalone, full-screen Copilot opens from the left nav and is in preview. [pbi-intro]
  - It opens from the **Copilot** icon in the ribbon. To create pages in the service, the user selects **Edit** first. [pbi-create]
  - In web modeling it opens from the ribbon, but only in **Editing mode**. The icon is disabled in Viewing mode. [pbi-intro], [pbi-model]
  - DAX query view opens it with the Copilot button or **Ctrl+I**. [pbi-dax]
- **Context**
  - The pane "only answers questions about the report you currently have open". [pbi-intro]
  - A visual-header **Copilot summary** icon scopes the request to one visual, and "the Copilot response clearly indicates that the summary is scoped to the specific visual". The shortcut is marked temporarily unavailable. [pbi-summ]
  - In DAX query view, "the background shading highlights what is being sent with the request". [pbi-dax]
  - In web modeling, Copilot can edit only the open model. It reads other models in the workspace read-only. [pbi-model]
- **Previewing and applying a change**
  - **Reports:** Copilot "generates a report page" directly. It can add, change and delete visuals, and the docs say "Use undo and redo to reverse recent Copilot actions". It doesn't do styling changes. [pbi-create]
  - **DAX:** "the diff styling in the DAX query editor shows exactly what Copilot has changed". The user can **Run** the query, then **Keep query** or **Discard** it. [pbi-dax]
  - **Web modeling:**
    - A one-time permission prompt opens each session, "to ensure no updates are made without your approval".
    - Copilot then "creates a restore checkpoint at the start of the session using semantic model version history", which reverts everything that session changed. [pbi-model]
- **Errors.** Generated DAX gets a syntax check and one automatic retry. After that the user sees: "This query contains errors. Rephrase your request and try again or try fixing it yourself." [pbi-dax]
- **Citations**
  - Summaries carry citations to the visuals they used. A citation to another page navigates there. [pbi-summ]
  - Hovering a narrative footnote highlights the visual it refers to. [pbi-narr]
- **Streaming.** The user can "watch it update as it writes the response". The input stays enabled while Copilot works, but a new prompt can't be submitted until the current one finishes. [pbi-summ]
- **Visual self-check.** Not published.
- **Admin**
  - Tenant settings include "Users can use Copilot and other features powered by Azure OpenAI" (on by default), settings for processing and storing data outside the region, and a standalone-experience switch. [fab-admin]
  - Admins don't choose a model or supply a key; it is Azure OpenAI.
  - Copilot needs F2/P1 capacity or higher, and usage shows in the Capacity Metrics app. [pbi-intro]
  - Prompts can be up to 10,000 characters. [pbi-intro]
- **Trust signals**
  - Thumbs up/down with "Attach diagnostics" and "Preview diagnostics". [pbi-summ]
  - "Clear chat". [pbi-intro]
  - Conversation history in data agents is kept 28 days unless the user clears it. [fab-admin]

### Tableau Agent

- **Placement and opening.** "Select the Tableau Agent icon in the toolbar next to Show Me". Which side the pane opens on is not published. [tab-agent]
- **Context**
  - The agent indexes the primary data source: field captions and aliases, and up to 1,000 unique string values sampled per field.
  - "If you change to a new sheet, this starts a new conversation." Closing the workbook clears it. [tab-agent]
- **Applying a change**
  - Changes land directly on the canvas.
  - **Retry with Tableau Agent** asks the model again.
  - **Recreate** returns to an earlier viz "without querying the LLM".
  - No undo specific to the agent is documented. [tab-agent]
- **Errors.** The agent may ask the user to pick values for filters with many values, and offers retry. [tab-agent]
- **Admin**
  - **Settings > AI Setting by Feature**, per site, can be set for one group or all users. Settings include "Tableau Agent in Authoring" and "Tableau Agent in Dashboards (Beta)".
  - "No model or provider choices". The Einstein Trust Layer masks PII, and audit data can be kept in Data Cloud. [tab-admin]
- **Trust.** A disclaimer is acknowledged with **Got It**, and there is thumbs feedback. [tab-agent]
- **Visual self-check.** Not published.

### Looker with Gemini

- **Placement**
  - Conversations live on their own page: **Conversations** in the nav, or **Create > Conversation**. [lk-ca]
  - Dashboards open a panel with **"Chat with this dashboard"**. The agent queries the dashboard's tiles and uses its filters. [lk-dash]
- **Showing its work**
  - **Fast** mode is the default. **Thinking** mode "streams a thoughts summary directly in the chat", behind **Show reasoning**. [lk-ca], [lk-rn]
  - **"How was this calculated?"** gives "field names, calculations, filters, and sort order". [lk-ca]
  - Dashboard agents add **Show thinking** and **Show debug info**. [lk-dash]
  - Insight Assistant shows its work, then folds it under **Show thinking**, and lists "the fields from your Explore that it used". Its actions are **Insert**, **Edit** and **New Chat**. [lk-insight]
- **Code-like artifacts**
  - The VS Code extension connects an outside AI agent to a "Looker-managed MCP server".
  - The agent can "propose and apply changes to your code locally" and "run LookML validation to self-correct before you commit".
  - Changes go to a development branch and are deployed through Git. [lk-vscode]
- **Admin**
  - **Enable Gemini in Looker**, then feature toggles: **Conversational Analytics**, **Dashboard agents**, **Looker Assistants**. LookML Assistant sits under the trusted-tester toggles.
  - Users need the `gemini_in_looker` permission. No model choice is listed. [lk-admin]
  - Token-usage metrics are in System Activity (preview, 26.12). [lk-rn]
- **Visual self-check.** Not published.

### ThoughtSpot Spotter

- **Placement**
  - Spotter opens from Insights > Home, from Insights > Spotter, or from a **Spotter** button on a Liveboard visualization when the pointer is over it.
  - The selected data source shows "as a context chip in the search bar". [ts-start]
- **Interpretation**
  - Spotter shows its reading of a question as search tokens, and "highlights the changes it made in search tokens" on follow-ups.
  - Edit Answer offers **Done editing** and **Discard changes**. There is a double-check icon.
  - Feedback is "visible to your administrator in the Spotter Conversations Liveboard". [ts-start]
- **Dashboards (SpotterViz)**
  - A sidebar while a Liveboard is in edit mode. "The Liveboard reloads, with a new answer added."
  - No preview step is published. "You can revert to a previous checkpoint, with a limitation of the past ten checkpoints." [ts-viz]
- **Models (SpotterModel)**
  - A panel "on the right side" of the Data model editor.
  - It suggests in steps, each with confidence scores, and each step is accepted explicitly: **Add selected tables to canvas**, **Create joins**, **Select columns**, **Add to canvas**. [ts-model]
- **Admin and keys.** Not found (the pages returned 404).
- **Visual self-check.** Not published.

### Hex

- **Placement.** **Agent** in the project header opens a sidebar. **+** starts a new thread, and old threads are reached from the thread title. [hex-agent]
- **Context.** The current notebook, @-mentioned cells and tables, other projects by URL, and a workspace rules file. [hex-agent]
- **Review**
  - "All changes that the agent suggests must be accepted into the Notebook (**Confirm**) or rejected (**Undo**)."
  - A **Pending changes** modal "will sequentially guide you through the changes".
  - Deleting cells asks **Accept** or **Deny**, with **Don't ask again in this thread**. [hex-agent]
- **Errors.** **Fix with agent** and **Quick fix**. [hex-agent]
- **Models.** The Modeling Agent writes semantic-model YAML. "You can accept or undo these changes at any time." A publish preview then shows validation, references and a preview. [hex-model]
- **Admin**
  - A master switch under **Settings > AI & agents**, plus **Allow agent web search**. [hex-admin]
  - BYOK through **Add an API key**, for Anthropic, OpenAI, AWS Bedrock and Google, and only by the Admin role. "BYOK applies to your entire workspace."
  - Data retention is zero by default. [hex-byok]
  - Users can pick a model per thread with the **Model & Effort Picker**. [hex-agent]

### Sigma Assistant

- **Placement and opening**
  - The Assistant icon in the workbook header, or **⌘K / Ctrl+K**.
  - **Ask or edit with prompt** on an element's toolbar.
  - A prompt bar on an empty workbook. [sig-build]
- **Modes and context.** **Build** mode is the default, and **plan** mode "outlines strategy without making changes". Users can @-mention pages and elements, and attach up to 8 images. [sig-build]
- **Applying**
  - **Add to workbook** inserts a chart the Assistant made. Users can "Review the step-by-step decision logic". [sig-wb]
  - How a build-mode change is previewed or undone is **not published**. [sig-build]
- **Permissions.** "Assistant inherits your permissions." [sig-build]
- **Admin**
  - Admin only, under **Administration portal → AI settings**.
  - Models hosted in the warehouse (Snowflake, Databricks) or outside it. "You cannot choose which model Sigma uses."
  - Per-feature permissions, such as **Use Assistant**, and a table that feeds an AI usage dashboard. [sig-admin]

### Metabase Metabot

- **Placement and opening.** A sidebar, opened with **Cmd/Ctrl+E** or the icon at the top right. "If you start a new chat, Metabase will discard the previous conversation." [mb-bot]
- **Context and scope**
  - "Metabot will keep the context of the current question."
  - It can't edit dashboards. Charts it makes can be saved to a dashboard by the user. [mb-bot]
- **Code**
  - An inline SQL prompt (**Cmd/Ctrl+Shift+I**): "Accept or reject the change. Always review the code before running it (AI is not magic)."
  - **Have Metabot fix it** on a failed query. [mb-bot]
- **Admin**
  - **Admin > AI > Add a provider**: Anthropic, OpenAI, Azure, Amazon Bedrock, Google Gemini.
  - Pasting a key picks the provider. "Metabase keeps the stored key unless you replace it."
  - A **Models** card sets a **Default model** and a **Mini model**.
  - **Enable Metabot** and **Disable all AI features**. Metabot can be limited to verified content, and keys can also come from environment variables.
  - "Metabot inherits the permissions of the person it's chatting with." [mb-settings]
- **Limits.** Per-group access columns (**AI features**, **Chat and NLQ**, **SQL generation**, **Other tools**). Usage limits by tokens or messages, reset Daily, Weekly or Monthly, set for the instance, a group or a tenant, with a custom **Quota-reached message**. [mb-limits]
- **Auditing.** **Monitor > AI auditing**: usage statistics plus a filterable list of conversations with transcripts, for admins only, on Pro/Enterprise. [mb-audit]

### Code-editor agents (VS Code Copilot, GitHub's cloud agent, Cursor, Claude Code)

- **Diff review (VS Code)**
  - A pill above the input shows how many files changed, with diff statistics, and opens a multi-diff editor.
  - Each change has **Keep** and **Undo**, and so does each file. **Mark as Reviewed** tracks files.
  - "Before processing each request, VS Code creates a snapshot". **Restore Checkpoint** reverts the files and the turns after it.
  - `chat.editing.autoAcceptDelay` accepts edits automatically. [vsc-review]
- **Progress (VS Code)**
  - Tool calls stay visible while they run and fold into expandable summaries.
  - A running request offers **Add to Queue**, **Steer with Message** and **Stop and Send**.
  - "Stopping a request doesn't undo file edits" that already happened. [vsc-agent]
- **From chat to review (GitHub's cloud agent)**
  - The agent works on a branch and opens a pull request, and the user can "review changes and request refinements before creating a pull request".
  - "Session logs show the work and tools used". "Logs do not replace your own review and testing." [gh-agent]
- **Visual self-check**
  - **Cursor:** the agent navigates, clicks, takes screenshots that are shown in the chat, and reads console logs. Browser actions need approval by default (Manual, Allow-listed or Auto-run), and auto-run carries a warning. [cursor-browser]
  - **Claude Code with Chrome:** "Design verification: build a UI from a Figma mock, then open it in the browser to verify it matches". It works in visible tabs, and permission prompts begin "Claude in Chrome wants to". [cc-chrome]
  - **VS Code:** users can add "HTML, CSS, and screenshot context" from an integrated browser. [vsc-agent]

## Cross-product patterns

**Shared by most products**

1. **A pane docked beside the editing surface, not a separate app.** Seen in Power BI (right), SpotterModel (right), Hex, Metabase, Sigma and Tableau. A full-page chat exists as well only for Q&A that spans items (Power BI standalone, Looker Conversations, the Spotter page).
2. **Context is the open item, narrowed by a selection or a mention.**
   - The item: Power BI's report and model, Tableau's sheet.
   - The selection: Power BI's visual-header icon and DAX selection shading, Sigma's element toolbar.
   - Mentions: @-mentions in Hex and Sigma.
   - A visible chip: ThoughtSpot.
3. **Permissions are inherited from the user, never extended.** Metabase, Sigma, and Power BI web modeling (Write permission, other models read-only).
4. **Undo or restore at the level of a session or step.** Power BI's undo/redo and restore checkpoint, SpotterViz's 10 checkpoints, VS Code's Restore Checkpoint, Tableau's Recreate.
5. **Showing the work.** Looker's "How was this calculated?" and its list of fields used, Power BI's citations that highlight the visual, ThoughtSpot's tokens, Sigma's decision logic.
6. **Thumbs feedback** on every answer (Power BI, Tableau, Looker, ThoughtSpot, Metabase).
7. **Admin controls:** a master switch, toggles per feature and per group (Tableau, Looker, Metabase), and usage reporting (Power BI, Looker, Metabase, Sigma).

**What sets individual products apart**

- **Review before apply** (DAX Keep/Discard with a diff, Hex Confirm/Undo, VS Code Keep/Undo, Metabase accept/reject, SpotterModel's step-by-step accepts) **versus direct apply** (Power BI report pages, SpotterViz, Tableau). On code-like artifacts, every product reviews before applying.
- **Validating its own output:** Power BI's DAX syntax check with one retry, Looker's agent running the LookML validator before commit, Hex's Fix with agent.
- **The admin chooses provider, model and key** only in Metabase (several providers, Default and Mini models), Hex (BYOK) and Sigma (warehouse or external). Power BI, Tableau and Looker give no choice.
- **Usage limits with a message to the user** only in Metabase.
- **A reviewed hand-off** (chat → pull request) only in GitHub's cloud agent.
- **The agent looking at the rendered result** only in the code agents (Cursor, Claude Code, VS Code). **No BI product studied documents a visual self-check.**

## Direction: a docked Copilot pane at the right edge of every authoring surface, where each edit arrives as a change card that the user applies into My workspace

> In full: every edit arrives as a **change card** (preview or diff, plus the check against Cube's rules) that the user **applies into My workspace**. After a dashboard is applied, Copilot **looks at the rendered result** and reports what it saw with thumbnails. Every change has its own **Undo**, and the chat has a checkpoint to restore to. Work reaches a shared folder only through the existing **Propose** dialog, which the user submits.

### Reasoning

**Who it serves**
- **Analysts** edit dashboards with the pane beside the canvas they are changing.
- **Semantic-layer engineers** edit cubes with a YAML diff and Cube's rule check before applying.
- **Super-Admins** set the provider, the model, the key and the limits.
- **Reviewers** see the item itself in the existing review view, labelled as made with Copilot.

**Why each part**
- **Docked, not a separate page.** Principle 1 (one object, many views) and the user's "the visual editor stays". The chat is a second way to change the object on the canvas, so the canvas stays visible beside it. Five of the six BI products dock the editing assistant beside the editor (Power BI, SpotterModel, Hex, Metabase, Sigma).
- **Change cards and an explicit Apply.** Principle 2 (never override silently). Every product that edits code-like artifacts reviews before applying (DAX, Hex, VS Code, Metabase SQL, SpotterModel). Products that apply directly need checkpoints to recover (SpotterViz, Power BI web modeling).
- **Apply writes to My workspace.** This is the user's own rule ("all edits will happen in the workspace") and F29's rule (AC-278: nothing is edited in place in a shared folder).
- **Apply saves the item there.** A workspace save pushes the overlay (AC-323), so the rendered check sees exactly what the user now has. The proposal remains the true gate (principle 8, AC-284–AC-286).
- **The rendered check is the user's own request.** Only the code agents have it ([cursor-browser], [cc-chrome]). The thumbnails show the user exactly what Copilot judged, which no BI product offers.
- **Show the work.** Looker, Power BI and ThoughtSpot do it, and it meets principle 5 (every state has a shape). Each answer lists the items, members and queries it used.
- **Super-Admin settings modelled on Metabase.** Metabase is the only studied product that matches "superadmin can set globally the api keys, models". Its limits and quota message add the safety the user's settings need. Keys follow rule 83: stored, never shown.
- **One set of operations shared with the planned MCP server.** Looker's agent works through a Looker-managed MCP server plus a validator ([lk-vscode]). Copilot and MCP clients get the same permission checks, the same checks before apply, and the same audit.

**Criteria it keeps:** AC-276–AC-283, AC-284–AC-291, AC-321–AC-323, AC-341, AC-388, principles 1, 2, 5, 6, 8 and 9, and rules 1–3, 17, 18, 38, 71–79, 83 and 85.

### What this direction rejects

- **A full-page chat as the main surface** (Power BI standalone, Looker Conversations, the Spotter page). It takes the user away from the canvas they are changing, which breaks principle 1. Q&A across items is a separate question.
- **Edits that land without a card** (SpotterViz's reload, Power BI's page creation, Tableau's in-place change). They break principle 2, and recovery then depends on checkpoints alone.
- **Auto-apply by default** (Cursor's auto-run, VS Code's `autoAcceptDelay`). Both vendors attach warnings or review steps to it. It remains an open question as an opt-in.
- **An applied-but-pending state** (VS Code's and Hex's Keep/Undo after the edit is made). In wechart a pending edit would already be in the workspace overlay, so previews would show unconfirmed changes. An explicit Apply plus Undo per change gives the same control without that ambiguity.
- **Copilot approving, rejecting, changing access or touching credentials.** GitHub keeps human review on agent pull requests ([gh-agent]). Rules 77, 83 and 85 and AC-286 put approval with people.
- **A per-user model picker** (Hex's Model & Effort Picker). The user asked for the Super-Admin to set models globally.
- **An "AI colour", sparkle branding or a floating chat bubble.** §7e adds no new colour, every state is an icon plus a label (rule 3), and a floating bubble covers the canvas and doesn't dock.
- **Separate conversations per sheet** (Tableau). Analysts move between a dashboard and its cubes in one task, so the conversation follows the user and records each change of context.

### The experience, specified

**1. Placement and size**

| Width | Behaviour |
|---|---|
| ≥ 1,280 px | Docked at the right edge, outside the inspector or edit sidebar. Default **360 px**, resizable **320–560 px** with the existing Splitter, and the width is remembered per user. If docking would leave the canvas under its 560 px minimum (§2), the left tree collapses to its 40 px rail first, then the inspector. Both come back when the pane closes. |
| 1,024–1,279 px | Overlays the canvas from the right, 360 px wide, as the inspector does at this width (§2). Only one overlay is open at a time. |
| < 1,024 px | A full-viewport sheet, as the filter bar becomes one (§2). The conversation can be read and continued. Change cards show their diff, but **Apply** is disabled with its reason: "Editing needs a window at least 1,024 px wide." Below 1,024 the app is view-only (§2). |

- Only one 360 px docked panel is open at a time: Copilot, Access or History. Opening one closes the other. A running Copilot request carries on, and the top-bar button shows it.

**2. Opening and closing**

- **Top-bar button "Copilot"** in the right group, before Reviews.
  - At ≥ 1,280 px it shows the icon and the label. Below that it shows the icon only, with the label in its accessible name and tooltip (the components-Q4 rule).
  - It is a toggle with `aria-expanded` and `aria-controls`.
  - While a request runs, its accessible name and tooltip add "· working".
- **Entry points in context** open the pane with a context chip set:
  - the tile's ⋯ menu: **"Ask Copilot about this tile…"**;
  - a model file's head ⋯: **"Ask Copilot about this file…"**.
  - Precedent: Power BI's visual-header icon and Sigma's "Ask or edit with prompt".
- **Closing:** ✕ in the pane head, or Esc while focus is in the pane (rule 85). An unsent message is kept, so closing asks nothing. Focus returns to the control that opened the pane.
- **Keyboard shortcut:** none is proposed, because of R75. See open question 2.

**3. Pane head and context chips**

- **Head:** 44 px, the shared pane head (T691-4). It holds the title "Copilot" at `text-md`, then 32 px icon buttons: History (past chats), New chat, ⋯ (**Restore to before this chat…**, **Delete this chat…**) and ✕.
- **Context row**, above the composer. It always shows what the next message acts on:
  - One chip per item: ▦ dashboard, ◇ model file, ◍ data source. Each shows the item name and where it is: "My workspace", or "Shared · edits go to your copy".
  - An optional selection chip, such as "Tile: Revenue by region".
  - Chips are 24 px with a 999 px radius (rule 17).
  - Each chip has × to remove it, and **＋ Context** adds one from a picker. Typing `@` in the composer opens the same picker.
  - The picker lists only items the user may see (principle 6, rule 67).
- **When the user navigates,** the chips follow the page. The log adds a one-line marker: "Now on ◇ cubes/orders.yml".

**4. Message types.** Every message is left-aligned under an author line ("You" or "Copilot", `text-xs-strong`). Body text is `text-sm`.

| Type | Content and states |
|---|---|
| **Text** | A Markdown subset with no raw HTML (the rule 25 analog). Member names show as field pills with role icons (Σ, Aa), as in the field tree. |
| **Steps** (tool calls) | 28 px rows at `text-xs`, each with a status icon and label: Running, Done, Failed, Skipped. For example "Read cubes/orders.yml", "Queried Orders · 12 rows", "Checked against Cube's rules". They collapse into "n steps" when the answer arrives (VS Code [vsc-agent], Looker [lk-insight]). |
| **Clarifying question** | One sentence plus choice buttons, for example "Which Revenue? · Orders Revenue · Invoices Revenue" (Tableau asks the user to pick values [tab-agent]). Every choice can also be typed. |
| **Change card**, proposed | See §5. |
| **Change card**, applied | Folds to "✓ Applied to My workspace · 14:02" with **Open in editor** and **Undo**. The diff stays one disclosure away. |
| **Change card**, discarded | "✕ Discarded" in `text-secondary`, with the diff one disclosure away. |
| **Change card**, superseded | "Replaced by a later change" with a link to it. Its Apply is removed. |
| **Change card**, undone | "↶ Undone · 14:05", with **Apply again**. |
| **Rendered check** | See §6. |
| **Proposal draft** | See §8. |
| **Error** | A status icon, one sentence, a **Details** disclosure and **Retry** (rule 18). |
| **Used** (citations) | A disclosure under each answer that used data or the model. It lists the items as links, the members as pills, and the queries, each of which opens in the results drawer's Query info. A tile citation scrolls to the tile and outlines it (as Power BI's footnotes do [pbi-narr]). |

- Every answer has Copy and thumbs up/down. Thumbs-down asks for an optional comment.

**5. The change card**

- **Container:** `bg-surface`, a 1 px `border-subtle` border, 6 px radius, 12 px padding, no shadow, with an `h3` heading.
- **Head** (32 px): the item-kind icon, the item name at `text-sm-strong`, and a 24 px location chip ("My workspace", "New · target: _folder_", or "Shared → your copy").
- **Operations:** one 28 px row each, with an icon and a label. For example "＋ Tile 'Revenue by region' (bar)", "✎ 'Orders' bar → line", "− Tile 'Old KPI'", "＋ Measure `orders.aov`".
- **Preview**
  - **Dashboard:** a schematic of the 12-column grid. Each tile the change adds, changes or removes is outlined and labelled **New**, **Changed** or **Removed**, the labels the review view uses (AC-341).
  - **Preview on canvas** draws the proposed dashboard in the canvas with the review view's **Proposed / Current** switch (rule 77) and a bar reading "Previewing Copilot's change · Apply · Discard · Exit preview".
  - If the change also edits a model, the card says "Preview after Apply: this change also edits _cubes/orders.yml_", because previews of a model draft need the saved overlay (AC-323).
- **Diff**
  - **Model:** the review view's YamlDiff in IBM Plex Mono 12/16. It shows up to 12 lines, then "Show all _n_ lines". **Open full diff** opens it in the model editor's YAML pane.
  - **Data source:** the settings diff, with no credential values (rule 83).
- **Check row:** "✓ No problems", "⚠ 2 warnings" or "✕ 1 error · line 14". It uses the model editor's own check ("Checked against Cube's rules as you type", model-Q2 call 5).
  - **An error blocks Apply.** The card then offers **Fix** (Copilot tries again) and **Open in model editor**, which opens the proposed text as an unsaved edit there.
- **Actions** (32 px): **Apply** (primary), **Discard**, and **Preview on canvas** or **Open full diff**. The accessible names include the item, for example "Apply change to Sales overview".
- **Placement rules**
  - **A shared item:** Apply first opens the existing **Edit in my workspace** dialog (rule 73, AC-279), then applies to the copy.
  - **An item in an open proposal:** Copilot refuses, with AC-388's wording, that it was submitted and that withdrawing the proposal lets it be changed.
  - **A use-only model:** Copilot offers **Request a change…** (AC-283) and no Apply.
  - **A new item:** the card holds the TargetPicker, listing read-write folders only (rule 74). Apply is disabled until a target is chosen.
  - **Unsaved edits in the item's editor:** Apply is disabled, with "Save or discard your changes in the editor first" and a link to the editor.

**6. "Checking the rendered dashboard"**

- **When it runs:** automatically after each dashboard Apply (open question 6), or when the user asks.
- **How it shows:** a step row with a running indicator, "Rendering 6 tiles…", which becomes "✓ Checked 6 tiles · 1 finding" or "⚠ …".
- **Thumbnails:** **144 × 96 px**, two per row. They are the **exact images the model was given**. Each is a button with alt text written from the check (for example "Bar chart, Revenue by region, 7 bars and Other, legend at top"). It opens a larger view in a dialog.
- **Findings:** each has an icon, a label and a link to its tile. They cover what the model saw, plus the structural rules wechart can test itself:
  - a query error or an empty result;
  - more than 8 colours (rule 6);
  - a legend on a single series (rule 4);
  - a dual axis (rule 30);
  - an image without alt text (rule 42);
  - a row-limit warning (rule 89).
- **A finding is never fixed silently.** Copilot offers a new change card (principle 2).
- **When the configured model can't take images,** or a Super-Admin turns images off, only the structural check runs, and the step says so.

**7. Applying, the link to the editor, and undo**

- **Apply** saves the change into the workspace item. That is one save, and it pushes the overlay (AC-323).
  - A toast reads "Applied to _Sales overview_ · Undo" (rule 38's pattern).
  - The card's **Open in editor** opens the dashboard in edit mode, or the model file. The tiles or members Copilot changed carry the **New** / **Changed** outline until the next save made by hand.
- **Undo on a card** returns the item to its state just before that Apply. If the item has changed since, Undo first lists what would also be lost and asks (rule 20's pattern).
- **Restore to before this chat…** (pane ⋯) lists every item the conversation changed and restores each to its state before the conversation's first Apply, after one confirmation. Precedents: Power BI's restore checkpoint [pbi-model], VS Code's Restore Checkpoint [vsc-review], SpotterViz's checkpoints [ts-viz].

**8. From a chat to a proposal**

- The user asks ("propose this to Sales / Reports") or chooses **Propose…** on an applied card. Copilot then opens the **existing Propose dialog** (rule 75), filled in:
  - the target, and whether the item is new or replaces version _n_;
  - the bundled workspace models (AC-285);
  - a description Copilot drafted from the applied changes, labelled "Drafted by Copilot · edit before you propose", with its "_n_ / 1,000" counter.
- **Only the user's click on Propose submits.** Copilot never submits, approves, rejects or withdraws.
- The proposal carries a **"Made with Copilot"** label (an icon and a label in `text-secondary`) in My proposals, To review and the review view. The review still draws the item itself (principle 9).

**9. Super-Admin settings: Admin › Copilot**

The page is shown to Super-Admins only. It has a left nav, a "Save _n_ changes" button, and the Esc rules of rule 85.

- **General**
  - **Enable Copilot.** When it is off, no one sees the top-bar button.
  - **Who can use it.** The default is everyone with a workspace (AC-276, AC-277). See open question 9.
- **Provider**
  - **Provider** (open question 7 lists the candidates), and an endpoint for Azure-style or compatible services.
  - **API key**, write-only. After saving it shows "Stored · encrypted" with **Replace…** (rule 83; Metabase keeps the stored key [mb-settings]).
  - **Default model** and **Fast model**, Metabase's Default and Mini split [mb-settings].
  - **Test connection**, which shows each check with an icon and a label: reachable, key accepted, model available, tools supported, images supported. **Settings can't be saved until the test passes,** as with data sources (rules 23 and 35).
- **Limits**
  - Per-user messages or tokens per Day, Week or Month, and an instance-wide cap [mb-limits].
  - A **Quota-reached message**, counted "_n_ / 280" (the cap is a candidate, see open question 11).
  - The maximum number of steps per request.
- **Data sent to the provider**
  - Model metadata is always sent, and the page says so.
  - Switches for **Query results** and **Images of rendered tiles**.
  - **Conversation retention** (open question 12).
  - The page states that credentials are never sent.
- **Usage**
  - A 34 px-row table: User, Conversations, Messages, Tokens, Last used, filtered by time [mb-audit].
  - Settings changes go to Security › Audit trail (open question 13).

**10. Empty, loading and failure states**

- **Empty** (new chat):
  - One sentence saying what Copilot can do with the current context.
  - Up to 3 starter prompts for that context as buttons (Power BI's suggested prompts [pbi-summ], Tableau's Suggestions [tab-agent]).
  - The line "Changes go to My workspace. Nothing reaches a shared folder without a proposal."
  - A muted line: "Uses _model_ · set by your Super-Admin".
- **Loading history:** a skeleton of message rows.
- **Sending:** the user's message appears at once, followed by a step row "Working…" with the running icon. **Stop** replaces Send while a request runs. The composer stays editable but can't send (Power BI [pbi-summ]).
- **Failures,** each with an icon, one sentence, Details and Retry:
  - the provider can't be reached;
  - the key is rejected ("Tell your Super-Admin"; Super-Admins get a link to Admin › Copilot);
  - the quota is reached (the Super-Admin's message);
  - the request is too large;
  - a step failed (Copilot says which and what it did next).
  - Details never include the key, or any stack traces.
- **Copilot off or not set up:** the button doesn't show (principle 6's spirit). Super-Admins reach the settings from Admin.

**11. Accessibility** (consistent with direction.md)

- The pane is `<aside aria-label="Copilot">` and joins the F6 pane cycle (§7).
- On open, focus goes to the composer. Esc closes it and focus returns to the opener (rule 85).
- The message list is `role="log"` with an accessible name. Its implicit `aria-live` is polite ([mdn-log]).
  - A message that is still streaming has `aria-busy="true"` until it is complete, so it is announced once, not word by word ([mdn-busy]).
- Applied, Undone, Discarded and the end of the check are announced in a polite live region. A failed Apply uses `role="alert"`.
- Every card is a heading-led group. Every action in it is a native button, reachable by Tab.
- **No single-key shortcut** applies, discards, proposes or undoes (rule 85).
- **Sending:** Enter sends and Shift+Enter starts a new line (Power BI's "Send or press Enter" [pbi-dax]). Because of R75 this is confirmed with the user (open question 3).
- Everything follows the 12 px floor, the 400 and 600 weights, the contrast table (rules 1–2) and an icon plus a label for every state (rule 3).
- Under `prefers-reduced-motion`, streaming shows no animated caret.

### Tokens to derive

There are no new colours or type sizes. Every value is an existing token or is derived from one.

| Item | Value | Provenance |
|---|---|---|
| Pane width | 360 px default, 320–560 px resizable | §7e's docked panels (Access, History) are 360. The 320 lower bound is the inspector's default (§2). 560 is derived here, so a full YAML diff line fits. |
| Pane head | 44 px; 32 px icon buttons | dashboard-Q5 and T691-4 |
| Pane title | `text-md` 16/22, 600 | §3, pane headers |
| Message body | `text-sm` 14/20, 400 | §3, Markdown body |
| Author line, card section labels | `text-xs-strong` 12/16, 600 | §3 |
| Step rows, operation rows | 28 px, `text-xs` 12/16 | §4, compact row |
| Diff and code | IBM Plex Mono 12/16 | §3, model-Q2 call 6 |
| Context chips, location chips, "Made with Copilot" label | 24 px, 999 px radius | §4 |
| Buttons, composer Send/Stop | 32 px, 6 px radius | §4, §7d |
| Card | 12 px padding, 6 px radius, 1 px `border-subtle`, no shadow | §4 radius and border. The 12 px padding is derived here; it is on the spacing scale. |
| Space between messages | 16 px; 8 px inside a message | §4 spacing scale |
| Composer | min 76 px (three 20 px lines plus 8 px padding), grows to 9 lines, then scrolls | derived from `text-sm` and the 4 px base |
| Thumbnails | 144 × 96 px, 8 px gap, two per row | derived here: two fit the 360 px pane's 302 px card interior |
| Colours | `accent`, `text-secondary`, `status-*` with their icons; diff colours are YamlDiff's | §5; nothing new (§7e) |
| Data-viz palette | not applicable; thumbnails show tiles as rendered | §5 |

## Open questions for the user (candidate answers; the recommended one first)

1. **Name.** (a) "Copilot", the user's word. (b) "Assistant" (Sigma, Looker). (c) "Agent" (Tableau, Hex).
2. **A keyboard shortcut to open it** (R75 holds back new keyboard work). (a) None: the top-bar button and F6. (b) ⌘I/Ctrl+I, Power BI's DAX Copilot precedent [pbi-dax]. (c) ⌘E/Ctrl+E, Metabase's [mb-bot]. ⌘K is wechart's search, so Sigma's choice is out.
3. **Sending.** (a) Enter sends and Shift+Enter starts a new line. (b) ⌘Enter sends.
4. **How Apply works.** (a) An explicit Apply on each card. (b) Also a per-chat switch, "Apply automatically in My workspace", off by default. (c) Apply automatically, with Keep/Undo afterwards (VS Code, Hex).
5. **How the rendered check gets its images.**
   - (a) wechart renders the saved workspace dashboard from its spec on the server, with ECharts SSR. That is the path `packages/charts/src/testing/renderToSvg.ts` already uses (`docs/research/echarts-text-and-grid.md`), and the MCP server could use the same route.
   - (b) Capture the user's live canvas in their browser (`renderToSVGString`, the Copy › Image path in `docs/research/clipboard-and-image-export.md`).
   - (c) A headless browser on the server.
   - Either (a) or (b) needs component research before it is built. (a) leaves Markdown, Image and Link tiles to the structural check.
6. **When the check runs.** (a) Automatically after each dashboard Apply. (b) Only when asked.
7. **Providers.**
   - (a) Anthropic, OpenAI, Azure OpenAI, Amazon Bedrock and Google (Metabase's list [mb-settings]), plus an endpoint compatible with OpenAI's API.
   - (b) Anthropic only.
   - Either way, the model must support tool use. It must also take images, or the visual check falls back to the structural check.
8. **Where the API key is kept.**
   - (a) wechart's API stores it encrypted at rest with a key held by the server, decrypts it only to call the provider, and never returns it. Unlike data-source secrets, which wechart can't open (`docs/research/credential-sealing.md`), wechart itself makes these calls.
   - (b) The key is sealed to xcube, and the LLM calls go through xcube.
   - (c) The key comes only from a deployment secret (environment or Helm), with no entry in the UI.
9. **Who can use it.** (a) Everyone with a workspace (AC-276). (b) AD groups the Super-Admin chooses (Tableau [tab-admin], Metabase [mb-limits]).
10. **Read-only users.** (a) No Copilot, in line with AC-277. (b) Copilot for Q&A only.
11. **Limits.** (a) Per-user messages per day, with the Super-Admin's quota message, capped at 280 characters. (b) Tokens per month. (c) No limits.
12. **How long conversations are kept.** (a) 28 days (Fabric's precedent [fab-admin]). (b) 90 days. (c) Until the user deletes them.
13. **The audit trail.** (a) Record Copilot settings changes, and mark proposals drafted with Copilot; not individual messages. (b) Also record every Apply. (c) Give Super-Admins full transcripts (Metabase [mb-audit]).
14. **What the reviewer sees.** (a) The "Made with Copilot" label only. (b) The author may also attach the transcript.
15. **Approving through MCP.** (a) Neither Copilot nor MCP clients ever approve or reject. (b) MCP may, behind a confirmation in the app.
16. **Prompt length.** (a) 10,000 characters with a counter (Power BI [pbi-intro]). (b) 4,000.
17. **Data sources by chat.** (a) Copilot drafts a data source without credentials, and hands off to the wizard's Connection step for the user to type the secret. (b) No data sources by chat.
18. **Conversations across pages.** (a) One conversation follows the user, with a marker at each change of context. (b) A new conversation per item (Tableau [tab-agent]).

## Checklist (extends direction.md §9)

90. The Copilot button sits in the top bar's right group, before Reviews. It shows its icon and label at 1,280 px and wider, and its icon only below that, with the label in its accessible name and tooltip. It appears only when a Super-Admin has enabled Copilot, and only to users who have a workspace.
91. At 1,280 px and wider the pane docks at the right edge, 360 px by default and resizable from 320 to 560 px. Docking never leaves the canvas narrower than 560 px: the left tree collapses to its rail first, then the inspector. Between 1,024 and 1,279 px the pane overlays the canvas. Below 1,024 px it is a full sheet, where Apply is disabled and states why.
92. The composer always shows context chips naming what the next message acts on. Each chip can be removed. The "＋ Context" picker and `@` list only items the user may see.
93. Nothing changes until the user presses Apply. Every change appears as a card naming the item, where it will land, each operation (with an icon and a label), a preview or diff, and the check result.
94. Apply writes only to My workspace.
    - For a shared item, Apply first opens Edit in my workspace.
    - For an item in an open proposal, it refuses with AC-388's wording.
    - A use-only model offers Request a change… and no Apply.
    - A new item needs a target folder chosen from read-write folders.
95. A model change whose check finds an error can't be applied. The card names the line and offers Fix and Open in model editor.
96. After Apply, the card reads "Applied to My workspace" with the time, Open in editor and Undo. The editor outlines and labels what Copilot changed, using New / Changed.
97. Undo on a card restores the item as it was before that Apply. If the item has changed since, Undo first lists what else would be lost. "Restore to before this chat…" lists every item the chat changed and asks once.
98. The rendered check shows thumbnails that are exactly the images the model received. Each thumbnail has alt text and opens larger. Each finding has an icon, a label and a link to its tile. A finding never changes anything until it becomes a new card that the user applies.
99. Every answer that used data or the model has a "Used" disclosure listing the items, members (with role icons) and queries. A tile citation scrolls to the tile and outlines it.
100. While a request runs, its steps show an icon and a label for their status, and Stop is always available. The message list is `role="log"` with a name. A streaming message has `aria-busy="true"` until complete. Results are announced politely, and a failed Apply uses `role="alert"`.
101. Copilot never approves, rejects, withdraws, changes access, or reads, shows or sends a credential. Propose… opens the existing Propose dialog, filled in, with its description labelled "Drafted by Copilot". Only the user's click submits it.
102. A proposal drafted from a chat carries "Made with Copilot" (an icon and a label) in My proposals, To review and the review view.
103. Admin › Copilot is shown to Super-Admins only.
     - The API key is write-only and reads "Stored · encrypted" once saved.
     - Settings can't be saved until Test connection passes, and the test shows each check's result.
     - The page sets limits and the quota-reached message, and says what data is sent to the provider.
104. Every failure shows an icon, one sentence, Details and Retry, and never shows a key or a stack trace. Reaching the quota shows the Super-Admin's message.
105. A new chat shows one sentence on what Copilot can do in this context, at most 3 starter prompts, and "Changes go to My workspace. Nothing reaches a shared folder without a proposal."
106. On open, the pane puts focus in the composer. Esc closes it and keeps an unsent message, and focus returns to the opener. The pane is in the F6 cycle. No single key applies, discards, proposes or undoes. The pane adds no colour and no type size, and keeps the 12 px floor.

## Sources

[pbi-intro]: https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-introduction
[pbi-create]: https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-create-reports
[pbi-summ]: https://learn.microsoft.com/en-us/power-bi/explore-reports/copilot-pane-summarize-content
[pbi-narr]: https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-create-narrative
[pbi-model]: https://learn.microsoft.com/en-us/power-bi/transform-model/copilot-web-modeling
[pbi-dax]: https://learn.microsoft.com/en-us/dax/dax-copilot
[fab-admin]: https://learn.microsoft.com/en-us/fabric/admin/service-admin-portal-copilot
[tab-agent]: https://help.tableau.com/current/online/en-us/web_author_einstein.htm
[tab-admin]: https://help.tableau.com/current/online/en-us/setup_tabAI_site_setting.htm
[lk-ca]: https://docs.cloud.google.com/looker/docs/conversational-analytics-looker-data
[lk-dash]: https://docs.cloud.google.com/looker/docs/conversational-analytics-looker-data-agents-dashboards
[lk-insight]: https://docs.cloud.google.com/looker/docs/gemini-insight-asst
[lk-vscode]: https://docs.cloud.google.com/looker/docs/ai-assisted-development-vscode
[lk-admin]: https://docs.cloud.google.com/looker/docs/admin-panel-platform-gil
[lk-rn]: https://docs.cloud.google.com/looker/docs/release-notes
[ts-overview]: https://docs.thoughtspot.com/cloud/latest/spotter
[ts-start]: https://docs.thoughtspot.com/cloud/latest/spotter-getting-started
[ts-viz]: https://docs.thoughtspot.com/cloud/latest/spotter-viz
[ts-model]: https://docs.thoughtspot.com/cloud/latest/spotter-model-create
[hex-ai]: https://learn.hex.tech/docs/getting-started/ai-overview
[hex-agent]: https://learn.hex.tech/docs/explore-data/notebook-view/notebook-agent
[hex-model]: https://learn.hex.tech/docs/connect-to-data/semantic-models/semantic-authoring/semantic-authoring-overview
[hex-admin]: https://learn.hex.tech/docs/administration/workspace_settings/enable-ai-and-agents
[hex-byok]: https://learn.hex.tech/docs/trust/ai-data-privacy
[sig-build]: https://help.sigmacomputing.com/docs/use-ai-to-build-dashboards-and-apps
[sig-wb]: https://help.sigmacomputing.com/docs/sigma-assistant-in-the-workbook
[sig-admin]: https://help.sigmacomputing.com/docs/configure-ai-features-for-your-organization
[mb-bot]: https://www.metabase.com/docs/latest/ai/metabot
[mb-settings]: https://www.metabase.com/docs/latest/ai/settings
[mb-limits]: https://www.metabase.com/docs/latest/ai/usage-controls
[mb-audit]: https://www.metabase.com/docs/latest/ai/usage-auditing
[vsc-review]: https://code.visualstudio.com/docs/copilot/chat/review-code-edits
[vsc-agent]: https://code.visualstudio.com/docs/copilot/chat/chat-agent-mode
[gh-agent]: https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent
[cursor-browser]: https://cursor.com/docs/agent/browser
[cc-chrome]: https://code.claude.com/docs/en/chrome
[mdn-log]: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/log_role
[mdn-busy]: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy

- [Power BI Copilot overview](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-introduction)
- [Create and edit reports with Copilot](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-create-reports)
- [Summarize a report with Copilot](https://learn.microsoft.com/en-us/power-bi/explore-reports/copilot-pane-summarize-content)
- [Narrative visual with Copilot](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-create-narrative)
- [Copilot in web modeling](https://learn.microsoft.com/en-us/power-bi/transform-model/copilot-web-modeling)
- [DAX queries with Copilot](https://learn.microsoft.com/en-us/dax/dax-copilot)
- [Fabric Copilot admin settings](https://learn.microsoft.com/en-us/fabric/admin/service-admin-portal-copilot)
- [Tableau Agent in web authoring](https://help.tableau.com/current/online/en-us/web_author_einstein.htm)
- [Tableau AI site settings](https://help.tableau.com/current/online/en-us/setup_tabAI_site_setting.htm)
- [Looker Conversational Analytics](https://docs.cloud.google.com/looker/docs/conversational-analytics-looker-data)
- [Looker dashboard agents](https://docs.cloud.google.com/looker/docs/conversational-analytics-looker-data-agents-dashboards)
- [Looker Insight Assistant](https://docs.cloud.google.com/looker/docs/gemini-insight-asst)
- [Looker VS Code AI-assisted development](https://docs.cloud.google.com/looker/docs/ai-assisted-development-vscode)
- [Gemini in Looker admin](https://docs.cloud.google.com/looker/docs/admin-panel-platform-gil)
- [Looker release notes](https://docs.cloud.google.com/looker/docs/release-notes)
- [Spotter overview](https://docs.thoughtspot.com/cloud/latest/spotter)
- [Spotter getting started](https://docs.thoughtspot.com/cloud/latest/spotter-getting-started)
- [SpotterViz](https://docs.thoughtspot.com/cloud/latest/spotter-viz)
- [SpotterModel](https://docs.thoughtspot.com/cloud/latest/spotter-model-create)
- [Hex AI overview](https://learn.hex.tech/docs/getting-started/ai-overview)
- [Hex Notebook Agent](https://learn.hex.tech/docs/explore-data/notebook-view/notebook-agent)
- [Hex semantic authoring and Modeling Agent](https://learn.hex.tech/docs/connect-to-data/semantic-models/semantic-authoring/semantic-authoring-overview)
- [Hex Enable AI & Agents](https://learn.hex.tech/docs/administration/workspace_settings/enable-ai-and-agents)
- [Hex AI data privacy and BYOK](https://learn.hex.tech/docs/trust/ai-data-privacy)
- [Sigma: build with Assistant](https://help.sigmacomputing.com/docs/use-ai-to-build-dashboards-and-apps)
- [Sigma Assistant in the workbook](https://help.sigmacomputing.com/docs/sigma-assistant-in-the-workbook)
- [Sigma AI configuration](https://help.sigmacomputing.com/docs/configure-ai-features-for-your-organization)
- [Metabot](https://www.metabase.com/docs/latest/ai/metabot)
- [Metabot settings](https://www.metabase.com/docs/latest/ai/settings)
- [Metabase AI usage controls](https://www.metabase.com/docs/latest/ai/usage-controls)
- [Metabase AI usage auditing](https://www.metabase.com/docs/latest/ai/usage-auditing)
- [VS Code: review code edits](https://code.visualstudio.com/docs/copilot/chat/review-code-edits)
- [VS Code agent mode](https://code.visualstudio.com/docs/copilot/chat/chat-agent-mode)
- [GitHub Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent)
- [Cursor browser tool](https://cursor.com/docs/agent/browser)
- [Claude Code with Chrome](https://code.claude.com/docs/en/chrome)
- [MDN: ARIA log role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/log_role)
- [MDN: aria-busy](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy)

**Repository files this builds on** (all absolute):
- /Users/srajagopal/Work/wechart/docs/design/direction.md
- /Users/srajagopal/Work/wechart/docs/design/references.md
- /Users/srajagopal/Work/wechart/docs/design/decisions-2026-10-08.md
- /Users/srajagopal/Work/wechart/docs/spec.md (F29, F30)
- /Users/srajagopal/Work/wechart/docs/inputs/2026-10-17-copilot-chat.md
- /Users/srajagopal/Work/wechart/docs/inputs/2026-10-17-mcp-server.md
- /Users/srajagopal/Work/wechart/docs/research/clipboard-and-image-export.md
- /Users/srajagopal/Work/wechart/docs/research/echarts-text-and-grid.md
- /Users/srajagopal/Work/wechart/docs/research/credential-sealing.md
