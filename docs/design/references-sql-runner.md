# Design references: the SQL runner as its own workspace

Date: 2026-10-17. Author: ui-researcher, for the coordinator.
Inputs:
- `docs/inputs/2026-10-17-sql-runner-and-ask-key.md`;
- `docs/spec.md` F40 (AC-373–AC-387), F29 (AC-276–AC-283) and AC-350;
- `docs/research/sql-runner.md`, `docs/research/xcube-sql-runner.md` and `docs/research/cube/introspection-api.md`;
- designs 15 and 16 (`docs/design/reviews/2026-10-01/designs/`);
- `docs/design/direction.md` (§1–§9, rules 1–89) and `docs/design/decisions-2026-10-08.md`;
- what is built today: `packages/web/src/workspaces/data-sources/SqlRunner.tsx`, `SqlEditor.tsx` and `SchemaBrowser.tsx`.

**Status.** This is a proposal for interview R78. The templating form, the keyboard items (R75) and the gaps are written as open questions, each with candidate answers and the recommended one first.

**Source notes.**
- This session's web-search budget had run out. Every product claim below comes from fetching the vendor's own documentation, or Superset's source at tag `6.1.0`, directly. Each claim carries a key that resolves in "Sources" at the end.
- The fetch tool returns an extract of each page. Text in quotation marks is UI text or a sentence as that extract returned it. Unquoted statements are paraphrases.
- The local Superset at :8088 was not opened or signed into. Superset claims come from its docs and its frontend source at tag `6.1.0`, which is the version that instance runs (`docs/research/sql-runner.md`, frontmatter).
- These pages returned 404, and nothing below relies on them:
  - DBeaver `Parameters-in-SQL-queries/` (its GitHub wiki page `SQL-Execution` was used instead);
  - Hex `sql-parameterization`;
  - DataGrip `query-parameters.html`, `query-history.html` and `in-editor-results.html`.
- **No product publishes type sizes or row heights for its SQL editor.** Superset's frontend constants are the only published pane sizes (§ Superset). Every other size below comes from direction.md's tokens, and says so.
- **Cube Cloud's SQL Runner** is the origin of F40 (`docs/research/sql-runner.md` §2). It isn't restudied here, because the user excluded Cube's own UI as a design reference (`references.md`, "Scope change").

## Products studied

| Product | Why chosen | Sources |
|---|---|---|
| **Apache Superset SQL Lab** (6.1.0; the docs and frontend source at that tag) | The user named it first ("check superset for the experience"). It already appears in `references.md` and runs locally. It is the only product studied that has every part the user asked for in one surface: a schema browser, a table preview, tabs, history, saved queries, Jinja templating, and "Create chart" / "Save dataset" from results. | [ss-explore], [ss-menu], [ss-const], [ss-layout], [ss-leftbar], [ss-tree], [ss-node], [ss-preview], [ss-editor], [ss-tabhead], [ss-run], [ss-keys], [ss-params], [ss-south], [ss-result], [ss-history], [ss-save], [ss-savebtn], [ss-dataset], [ss-chart], [ss-tmpl-user], [ss-tmpl-admin] |
| **Metabase native query editor** (docs for v0.64, "latest") | Already a wechart reference. It has the best-documented **typed variables** with widgets, optional clauses, **snippets**, a data reference sidebar, and SQL question → **model**. That last one is the closest analogue to "Make a cube". | [mb-sql], [mb-params], [mb-basic], [mb-optional], [mb-snippets], [mb-ref], [mb-models], [mb-saved] |
| **Hex SQL cells** (current docs; they describe an October 2025 change) | The user named it. It is the only product studied that documents **bound (prepared-statement) parameters** for its templating. It also has a data browser with Preview and Query, and charts made from SQL results. | [hex-sql], [hex-jinja], [hex-browser], [hex-chart] |
| **DBeaver** (current docs at dbeaver.com; the version isn't stated on the pages fetched) | The user named it. It is the desktop SQL tool engineers know: a navigator tree, script tabs bound to a connection, statement-at-cursor execution, a bind-parameters dialog, templates, a query manager, and connection types. | [db-exec], [db-editor], [db-nav], [db-data], [db-qm], [db-tmpl], [db-params], [db-types] |
| **JetBrains DataGrip** (current help; the version isn't stated on the pages fetched) | The user named it. It has consoles attached to one data source, a Database Explorer with key and index markers, user parameter patterns, a run-scope chooser, query history, and a per-source "Read-only" flag with an honest caveat. | [dg-console], [dg-run], [dg-explorer], [dg-params], [dg-ro], [dg-live] |

**Considered and not studied:**
- Cube Cloud's SQL Runner, which the user excluded (studied before in `sql-runner.md` §2).
- Mode, Redash and Snowflake Snowsight. The user named five tools, and those five cover every part of the brief.

## Observations per product

### Apache Superset SQL Lab 6.1.0

**Navigation and layout**
- A top-level **SQL** menu holds three links: "SQL Lab" (`/sqllab/`), "Saved Queries" (`/savedqueryview/list/`) and "Query History" (`/sqllab/history/`). Saved queries and history each also have a page of their own. [ss-menu]
- **Measured layout constants:**
  - left bar `SQL_EDITOR_LEFTBAR_WIDTH` **400 px**;
  - collapsed width **56 px**;
  - an optional right bar of **400 px**;
  - status bar **30 px**;
  - `INITIAL_NORTH_PERCENT` **30**, the editor's starting share above the results.
  
  [ss-const]
- The left bar's default and **minimum** width are both 400 px. It collapses, and below the `md` breakpoint it hides itself. Widths are kept per user. [ss-layout]
- The editor pane's minimum height is 200 px. [ss-editor]
- "The dividers between the SQL editor, schema browser, and results pane are draggable." [ss-explore]

**Schema browser**
- The left bar has three parts:
  - a database, catalog and schema chooser in a popover, "Select Database and Schema";
  - a divider;
  - a `TableExploreTree`. [ss-leftbar]
- The tree runs schemas → tables → columns and loads **lazily**: "nodes only fetch children when manually opened". [ss-tree]
  - Its search reads "Enter a part of the object name", and finding nothing says "No matching results found".
  - It has collapse and expand all, "Force refresh schema list", and pinned schemas kept in localStorage.
- **Node actions on hover** [ss-node]:
  - on a schema: refresh, pin;
  - on a table: "Copy SELECT statement to the clipboard", sort columns, "Refresh table schema", pin;
  - on a column: "Copy column name".
  - Views have their own icon.
- The docs: "click a schema to expand its tables, and click a table to see its columns and sample data inline." [ss-explore]

**Table preview**
- It opens as a tab in the results pane, labelled `schema.table`. [ss-south]
- Its tabs are "Columns (n)" (names, types, primary and foreign keys, comments), "Data preview", "Indexes (n)" and "Metadata". [ss-preview]
- Its actions are "Refresh table schema", "Copy SELECT statement" and "Show CREATE VIEW statement".
- The sample is capped by `PREVIEW_QUERY_LIMIT`, which is **100**. [ss-const]

**Editor and tabs**
- **Toolbar** [ss-editor]:
  - Run (or Stop);
  - the row-limit select;
  - Estimate cost, behind a flag;
  - Save query;
  - Share;
  - a kebab menu with "Render HTML", "Autocomplete" (a toggle kept in localStorage), the template parameters editor, "Format SQL", "Schedule the query periodically" and "Keyboard shortcuts".
  
  "Format SQL" keeps Jinja syntax. [ss-explore]
- **Run** reads "Run", "Run selection" when text is selected, and "Stop" while running. Its tooltip is "Run query (Ctrl + Return)". [ss-run]
- **Run current** (Ctrl+Shift+Enter) finds the semicolon-delimited statement at the cursor and runs only that. [ss-editor]
- **Keyboard shortcuts** [ss-keys]:
  - Ctrl+R, Ctrl+Enter and Alt+Enter run;
  - Ctrl+Shift+Enter runs the current statement;
  - Ctrl+X (Mac) or Ctrl+E stops;
  - Ctrl+T or Ctrl+Q opens a new tab;
  - Ctrl+[ and Ctrl+] switch tabs;
  - Ctrl+Shift+F formats;
  - ⌘/Ctrl+F finds and ⌘⌥F / Ctrl+H replaces.
  
  The docs call it "the Monaco find/replace widget". [ss-explore]
- **Tabs** [ss-tabhead]:
  - Each tab has a title and a **status icon that "maps query states to theme colors"**.
  - Its ⋯ menu offers "Close tab", "Rename tab", "Close all other tabs" and "Duplicate tab".
  - A code comment says the rename prompt is still the browser's native prompt.
- Tab state is kept on the server by default (`SQLLAB_BACKEND_PERSISTENCE`, `docs/research/sql-runner.md` §3, from `config.py` L769).
- **Autocomplete** ranks keywords (100), functions (90), schemas (60), tables (55) and columns (50). [ss-const]

**Results, history and saving**
- The results pane has the tabs "Results" and "Query history", plus one per pinned table preview. [ss-south]
- **The result head** [ss-result]:
  - "%(rows)d rows returned";
  - four limit messages that say which limit applied, for example "The number of rows displayed is limited to %(rows)d by the limit dropdown.";
  - "Filter results";
  - "Download to CSV";
  - "Copy to Clipboard";
  - "Create chart";
  - Save dataset.
  
  An empty result says "The query returned no data". An error is titled "Database error", and a stopped query says "Query was stopped".
- **Query history** [ss-history]:
  - Its columns are state, started, duration, progress, rows, SQL, results and actions.
  - It scrolls on with infinite scroll.
  - When empty it says "Run a query to display query history".
- **Save query** [ss-save]:
  - The dialog has Name and Description.
  - The button reads Save for a new query, or "Save as new" and "Update" for a saved one.
  - The title is "Save query".
- **"Create chart"** needs the database to allow subqueries [ss-chart]. It goes through **"Save or Overwrite Dataset"** [ss-dataset]:
  - "Save as new" (with a "Dataset name") or "Overwrite existing";
  - with templating on, an "Include Template Parameters" checkbox.
  
  The action buttons are "Save query" and "Save or Overwrite Dataset". [ss-savebtn]

**Templating**
- Jinja needs the flag `ENABLE_TEMPLATE_PROCESSING`. The docs warn: "this feature executes template code on the server … can be exploited as a Server-Side Template Injection (SSTI) vulnerability." [ss-tmpl-admin]
- Values are entered "via the **Parameters** menu as JSON" [ss-tmpl-user]. The dialog says: "Assign a set of parameters as JSON below (example: {"my_table": "foo"}), and they become available in your SQL (example: SELECT * FROM {{ my_table }})".
  - JSON and YAML are accepted.
  - The button shows a badge counting the parameters.
  - Bad JSON shows "Invalid JSON". [ss-params]
- The macros include:
  - `current_username()`, `current_user_id()`, `current_user_email()` and `current_user_roles()`;
  - `url_param()`, `filter_values()`, `get_filters()` and `get_time_filter()`;
  - `dataset()` and `metric()`.
  
  [ss-tmpl-admin]
- Values are **text substituted into the SQL**: the docs' own example puts a table name in (`FROM {{ my_table }}`). [ss-params]
- Two Superset CVEs concern Jinja: CVE-2023-49736 (SQL injection in the `where_in` macro) and CVE-2023-27523 (templates and data permissions) (`docs/research/sql-runner.md` §3, [ss-cves]).

**Type and density.** Not published for SQL Lab. Superset's measured theme values are already in `references.md`.

### Metabase native query editor (v0.64)

- **Opening and running** [mb-sql]:
  - It opens from **+ New › SQL query**, and the user picks the database first.
  - It runs with **ctrl+enter** / **⌘+return** or **Run query**.
  - "You can also highlight a portion of your query and run only that selection."
  - Formatting is not available for SQLite and SQL Server.
- **From SQL to a model or a chart:**
  - Saved SQL "can be saved, downloaded, converted to models, and added to dashboards", and a saved SQL question without parameters gets **Explore results**. [mb-sql]
  - "Turn this into a model" sits in the … menu. [mb-models]
  - **SQL models need column metadata set by hand:** "Column type" is "the most critical field", plus display name, description, the database column it maps to, visibility and display format. [mb-models]
- **Data reference** (the open book icon) [mb-ref]:
  - databases, then models and tables with descriptions;
  - columns with "data types and descriptions";
  - sample values;
  - "Connections" (foreign keys).
- **Variables** `{{name}}` [mb-params]:
  - Field filter, basic (Text, Number, Date, Boolean), time grouping and table variables.
  - The settings are "Filter widget type", "Filter widget label", "How should users filter on this variable?" and "Default filter widget value".
  - Values can also be set in the URL (`?name=value`).
- **Basic variables** need the operator in the SQL (`WHERE category = {{category}}`). **People can pick** allows several values with `IN`. [mb-basic]
- **Optional clauses** `[[ … ]]` are left out when no value is given. A default can go in a comment: `[[ {{p}} --]] default`. [mb-optional]
- **Not published:** whether basic variables are bound as database parameters or spliced in. The parameters page says nothing about injection or prepared statements (checked: [mb-params]).
- **Snippets** `{{snippet: name}}` [mb-snippets]:
  - made with "Save as snippet" or from the Snippets sidebar;
  - "Users with native editor access can view, create, and edit any snippet, regardless of their database permissions";
  - "If you edit a snippet and include broken code, you will break every question that uses that snippet."
- **Saved questions in SQL:** `{{#123-name}}` puts a saved question or model's SQL in as a subquery. [mb-saved]
- **Type and density:** not published.

### Hex SQL cells

- **A cell** has a data-connection selector, an output dataframe name, a result preview and Run (⌘/Ctrl+Enter). [hex-sql]
- **Query mode** fetches "only a preview of data … (the first 1k rows)". Results carry types, mapped to Pandas types. [hex-sql]
- **Bound values:** "For security and performance, we handle all parameterized SQL queries as prepared statements." [hex-jinja]
  - Arrays need `{{list | array}}`.
  - Identifiers need `{{column | sqlsafe}}`, with the warning: "If you use the `sqlsafe` flag … you are removing the protection that prepared statements offer against sql injection!"
- **Data browser** [hex-browser]:
  - databases, schemas, tables and columns with types, plus descriptions from the warehouse or dbt;
  - **Preview** ("100-row preview") and **Query** ("Open a SQL cell querying the selected table with a `limit 100` clause");
  - "Copy all columns";
  - refresh per connection.
- **Charts:** a chart cell is made from a dataframe with **"Visualize in chart"**. "Beginning in October 2025, it is also no longer possible to create visualizations directly within SQL cells." [hex-chart]
- **Type and density:** not published.

### DBeaver

- **Layout** [db-editor]:
  - a script panel, a toolbar, and a results panel whose tabs are Data Editors;
  - the active data source and schema chosen in the toolbar;
  - scripts kept in a Scripts folder, "associated with their original database connection".
- **Execution** [db-exec]:
  - **Ctrl+Enter** runs "the SQL query under the cursor or selected text".
  - **Alt+X** runs every statement, split on `;`.
  - Ctrl+\ puts the result in a new tab. Results tabs are often "named after the primary table".
- **Navigator:** a tree of connections, schemas, tables and views [db-nav]:
  - type-to-filter;
  - "Link with editor";
  - generate SQL;
  - "Read data in SQL console".
- **Data editor** [db-data]:
  - Grid, Text and Record views;
  - "column headers display data type information";
  - a row count with "Calculate total row count" and "Fetch all data";
  - a filter field.
- **Query Manager:** logs time, duration, rows and errors, filtered by time, connection, catalog and schema. History survives a restart only in paid editions. [db-qm]
- **Parameters** [db-params]:
  - `:name` and `?` are bound through a "Bind parameter(s)" window.
  - `${var}` is **text substitution**, with values set by `@set`.
- **Templates:** an abbreviation then Tab, managed in Preferences › SQL Editor › Templates. [db-tmpl]
- **Connection types:** Production has "Confirm SQL execution" on and is marked **brick red**, and "Connection type colors appear in the Connections, all related editors and tabs". [db-types]
- **Type and density:** not published.

### DataGrip

- **Consoles:** a query console is "attached to this data source by default", with a session of its own and a schema switcher in its toolbar. [dg-console]
- **Running** [dg-run]:
  - Ctrl+Enter offers the statement at the caret, the selection, or "all the statements".
  - **Ctrl+F2** cancels, and a second Cancel offers to terminate the remote process.
  - Each statement's result gets its own tab.
  - Parameters prompt for values before running.
  - Query History is Ctrl+Alt+E.
- **Database Explorer** [dg-explorer]:
  - columns with types;
  - primary keys, foreign keys, indexes and NOT NULL shown as **icon combinations, coloured gold and blue**;
  - a schema chooser ("N of M");
  - Ctrl+F5 to refresh, Ctrl+Q for quick documentation;
  - drag a table into the editor.
- **User parameters** are regex patterns such as `${value}`, `#field#` and `?69`, with an option to substitute inside strings. [dg-params]
- **Read-only:** a data source can be marked "Read-only", with the caveat that changes "might still be possible in the query console if the driver doesn't support the read-only status". [dg-ro]
- **Live templates:** `sel`, `ins` and `selc`, expanded with Tab. [dg-live]
- **Type and density:** not published.

### wechart today (the baseline, not a reference product)

- F40 is built inside each data source's page as a sixth tab, **SQL**. It holds:
  - the run line (database, host, login);
  - the switch record;
  - the always-shown warning;
  - the CodeMirror SQL editor (⌘/Ctrl+Enter, "Run selection");
  - the limits line;
  - the schema browser (T539: a tree of schemas → tables, 100 at a time, → columns with types; choosing a name puts it in at the cursor);
  - the result grid (24 px rows, name and type headers) with Download CSV;
  - **My runs** on the right.
  
  (`SqlRunner.tsx`, `SchemaBrowser.tsx`, design 15)
- Cube Store has no schema browser. A data source in My workspace is read through the workspace's preview, once its target folder is chosen (the API's 409 texts in `sql-catalog.test.ts`).
- Introspection also returns `primaryKey`, `foreignKeys` and Cube's general type (`time | number | string | boolean`) for each column (`introspection-api.md` L482–487). The browser shows neither today.
- xcube's run route takes `{ sql, runId, maxRows, timeoutMs, maxBytes }`. It has **no field for bound values** (`xcube-sql-runner.md` L76).

## Cross-product patterns

**What every product shares** (the expected baseline):
1. **A tree on the left and an editor over results in the centre.** Superset's left bar and south pane [ss-leftbar][ss-south], DBeaver's navigator and results panel [db-nav][db-editor], DataGrip's explorer and Services window [dg-explorer][dg-run], and Metabase's data reference [mb-ref]. Hex is the exception, being notebook-shaped [hex-sql].
2. **The tree is lazy** and goes schema → table → column, **with the column type shown**:
   - [ss-tree], [ss-preview], [dg-explorer], [hex-browser], [mb-ref];
   - keys marked: [ss-preview], [dg-explorer]; foreign keys: [mb-ref].
3. **A table gives "SELECT it" and "preview it" actions, capped at 100 rows** (Superset `PREVIEW_QUERY_LIMIT` 100 [ss-const]; Hex Preview and Query with `limit 100` [hex-browser]), along with copy or insert of names [ss-node][hex-browser].
4. **Each editor is bound to one data source** (a Superset tab's database [ss-leftbar], a DBeaver script [db-editor], a DataGrip console [dg-console], a Hex cell [hex-sql]), and **several tabs or consoles are open at once** [ss-tabhead][db-exec][dg-console].
5. **⌘/Ctrl+Enter runs, and a selection runs only itself.** [ss-run][mb-sql][db-exec][dg-run][hex-sql]
6. **Results say how many rows came back and which limit applied.** [ss-result][hex-sql][db-data]
7. **A per-user query history** [ss-history][db-qm][dg-run] and **named saved queries** [ss-save][db-editor].
8. **Results lead to a modelled object before a chart, except in Hex.**
   - Superset: "Create chart" goes through **Save dataset** [ss-dataset][ss-chart].
   - Metabase: SQL question → "Turn this into a model", with column types set by hand [mb-models].
   - Hex charts a dataframe directly [hex-chart], because its charts don't sit on a governed semantic layer.

**Where they differ** (the choices wechart has to make):

| Topic | Options seen |
|---|---|
| Templating | Server-side Jinja, spliced as text, with an SSTI warning [ss-tmpl-admin] · typed `{{var}}` widgets, binding not published [mb-basic] · Jinja **bound as prepared statements** [hex-jinja] · bind dialogs for `:name` and `?`, plus `${var}` text substitution [db-params][dg-params] |
| Reusable fragments | Shared snippets that anyone can edit [mb-snippets] · per-user templates expanded with Tab [db-tmpl][dg-live] |
| Run scope with several statements | Statement at the cursor [db-exec] · ask each time [dg-run] · whole text, with "Run current" on its own key [ss-editor] |
| Where history lives | A results tab [ss-south] · a separate page [ss-menu] · a dialog [dg-run] · a manager view [db-qm] |
| Run status on tabs | **Colour only** in Superset [ss-tabhead] and DBeaver's type colours [db-types], which rule 3 forbids |
| Read-only | Parser plus flags (Superset, `sql-runner.md` §3) · a driver read-only flag that "might" leak [dg-ro] · F40's layered check, read-only transaction and attestation |

## Direction: A "SQL runner" workspace beside Jobs and Schedules, laid out as wechart's three-pane workbench: a data source picker and lazy schema browser on the left; tabs bound to a data source in the centre, each with F40's warning, CodeMirror editor, typed and bound parameters, and a dense result grid; and Saved and History on the right. Make a cube and Make a chart turn a finished run into drafts in My workspace, and the data source's page keeps only the runner's switch and an "Open in SQL runner" link.

### Reasoning

- **It is the user's own ask, in the shape every tool shares.**
  - The user asked for "a seperate tab.. next to jobs, schedules called SQL runner that lets you see and select the datasource, introspect the datasource see the tables, columns".
  - Patterns 1–5 above are what all five tools agree on, so engineers coming from Superset, DBeaver or DataGrip find the layout they expect.
  - It is also direction.md's workbench: a typed tree on the left, a canvas in the centre, a docked pane on the right, and a bottom split (§2). So it adds no new shell.
- **The roles it serves:**
  - the **data or semantic-layer engineer**, who checks tables before modelling and debugs data (F40's purpose, R50);
  - the **analyst**, who makes a quick cube or chart from a query;
  - Super-Admins, who manage the switch.
  
  Consumers and read-only users never see it (R50-1, rule 84).
- **Safety carries over unchanged.** Every F40 rule stays, and stays per run, not per surface:
  - the switch, with its attestation (AC-374);
  - SELECT and EXPLAIN only (AC-375);
  - the read-only transaction (AC-376);
  - the caps (AC-377, AC-378);
  - one run per person (AC-379);
  - the audit (AC-382);
  - the always-shown warning (AC-385).
  
  The workspace changes where the editor sits, not who may run, on what, or how.
- **Bound parameters, not Jinja.**
  - Hex is the one product that documents its templating as prepared statements, and it calls them "robust against SQL injection" [hex-jinja].
  - Superset's own docs warn of SSTI [ss-tmpl-admin], and two of its CVEs are about Jinja [ss-cves].
  - Binding also keeps parameter values out of the SQL text. So AC-382's literal redaction holds by construction, and the audit never holds a value.
  - Metabase's typed widgets (Text, Number, Date, Boolean) [mb-basic] give the form. Hex's binding [hex-jinja] gives the mechanism.
- **Make a cube, not a chart on raw SQL.**
  - wechart charts query Cube, through engine-neutral specs, folder gates and access policies (F4, F26; `sql-runner.md` Q10).
  - A chart over raw runner SQL would show dashboard readers data read past every folder permission, which is the very thing AC-385 warns the author about.
  - Superset (Save dataset, then chart [ss-dataset]) and Metabase (Turn into a model [mb-models]) both put a modelled object between SQL and a chart. In Cube that object is a cube whose `sql` is the query: Cube's validator accepts exactly one of `sql_table` and `sql` (`data-modeling.md` L567–568).
  - The draft lands in My workspace, as F29 and principle 8 require, and the AC-350 / Generate cubes pattern already does this.
- **Saved queries stay personal and out of folders.** No sharing was the user's condition.
  - Superset and DataGrip keep saved queries and history per user [ss-menu][dg-run].
  - Metabase's snippets are shared with every native-editor user [mb-snippets], which is exactly what the user ruled out.
  - Saved queries therefore never enter Explore, folders or proposals. A proposal is how anything becomes shared (principle 8).
- **The switch stays on the data source page.**
  - It is a Super-Admin setting about one data source's login (AC-374). Design 15 placed it, and P1's off panel explains it, on that page.
  - The workspace only reads it. Super-Admins get the same dialog from the picker, for convenience.

### What this direction rejects

- **Keeping the runner inside each data source's page.** The user asked for it to move. One data source per page also blocks tabs across sources and a history across sources.
- **Server-side Jinja (Superset).** It executes template code on the server [ss-tmpl-admin], it has a CVE history [ss-cves], and it splices text. User fit doesn't need it: no studied tool needs code execution for parameters.
- **Text-substitution variables as the default** (DBeaver `${var}` [db-params], DataGrip patterns [dg-params], Superset's `{{ my_table }}` [ss-params]). Quoting and typing become the user's problem, and the values end up in the SQL text that is audited. Identifier parameters are left as open question Q3.
- **Shared snippets (Metabase).** They break the no-sharing rule, and "broken code … will break every question that uses that snippet" [mb-snippets].
- **Charts directly on SQL results (Hex [hex-chart]).** They bypass Cube's governance for every later reader (see Reasoning).
- **Colour-only run status on tabs** (Superset [ss-tabhead], DBeaver's connection colours [db-types]). Rule 3 requires an icon and a label.
- **Share links, scheduled queries, CTAS and Estimate cost** [ss-editor]. Share links are sharing. The others write, or reach beyond R50's scope.
- **Superset's 400 px minimum left bar** [ss-layout]. direction §2's 280 px (220–400) tree is used instead, so the editor keeps its 560 px minimum at 1,280 px.

### The experience, specified

**1. Place in the navigation**
- **The entry.** A new switcher entry, **SQL runner**, sits after Schedules: Explore · Data sources · Jobs · Schedules · **SQL runner** · Security.
  - It is shown to Super-Admins and read-write members, the same audience as Jobs and Schedules (AC-001). Any read-write member may run SQL on their own data sources in My workspace (AC-383), so the workspace applies to all of them.
  - Read-only users never see it.
  - Below 1,024 px it folds into the menu button with the rest of the switcher, as built (AC-304, design 16 G8).
- **The address** is `/sql`, plus the open tab's id. Reloading restores the tab, its data source and its text (AC-002).

**2. Layout** (sizes from direction §2; Superset's are shown for comparison)
```
┌ Top bar 48 ──────────────────────────────────────────────────────────────────────────┐
├ Left 280 (220–400, rail 40) ┬ Centre (fluid, min 560) ───────────┬ Right 320 (280–480) ┤
│ Data source  [emea_replica▾]│ [◍ Query 1 ✓] [◍ orders check ⟳] [+]│ [Saved] [History]   │
│ ◍ PostgreSQL · Sales / EMEA │ Runs on sales at pg-…:5432, as      │  Only me · newest   │
│ ⛨ SQL runner on             │ cube_reader · ⛨ on · Ada, 1 Oct     │  first              │
│ [Find a table…]             │ ⚠ This SQL runs on the database …   │  ✓ Finished 1,284   │
│ ▸ public                    │ ┌ SQL editor (CodeMirror) ─────────┐ │   rows · 14:32 ·    │
│ ▾ sales                     │ │ SELECT … WHERE region = {{region}}│ │   emea_replica      │
│   ▾ ▦ orders            ⋯   │ └───────────────────────────────────┘ │   SELECT o.order…   │
│      order_id int8   PK     │ Parameters: region [Text▾] [EMEA]   │  ⚠ Limited to       │
│      customer_id int8 FK    │ [▶ Run] ⌘↵   [Save…]  SELECT or …   │   10,000 rows …     │
│   ▸ ▦ customers             │ ═══════════ splitter ═══════════════ │                     │
│                             │ ✓ Finished · 1,284 rows · 0.84 s    │                     │
│                             │ [Make a cube…][Make a chart…][CSV]  │                     │
│                             │ # │order_id│customer│… (24 px rows)  │                     │
└─────────────────────────────┴─────────────────────────────────────┴─────────────────────┘
```
- **Left pane, the data source picker.** A custom listbox, not a native select, so it keeps the 12 px floor (§3).
  - It lists the data sources the person could run SQL on, grouped by folder path:
    - My workspace's own sources first, each with the "Yours" badge (AC-383, rule 72);
    - Cube Store at the root, once it is on (AC-384).
  - Each row shows the ◍ mark, the driver, and the runner's state as an icon and a label: "SQL runner on" or "Off".
  - Off sources are listed only to Super-Admins and to the read-write members of the source's own folder, the same people P1 shows the off panel to. Choosing one shows the off panel in the centre, with Turn on… for Super-Admins (the existing dialog).
- **Left pane, the schema browser.** The built tree (T539), extended:
  - "Find a table" filters the names already read. While a schema has unread pages, it says "Searching the n tables read".
  - Each column row shows the name, its type as the database names it, and **PK** / **FK** text tags from introspection's `primaryKey` and `foreignKeys`. An FK's tooltip names its target table.
  - Each table has a ⋯ menu:
    - **Insert name** (Enter, as built);
    - **Insert SELECT**, which writes `SELECT <columns> FROM schema.table` with the driver's own 100-row limit at the cursor, and doesn't run it;
    - **Preview 100 rows**, which opens a new tab holding that SELECT and runs it as an ordinary run: capped, audited and listed in History.
  
  The 100-row figure comes from Superset and Hex [ss-const][hex-browser].
  - **Nothing runs on expand** except the catalog reads.
  - Cube Store keeps the note that its tables are in `information_schema.tables` and `system.tables` (built).
- **Centre, the editor tabs.** Each tab is bound to exactly one data source, like a DataGrip console [dg-console] or a DBeaver script [db-editor].
  - A tab's label is its name ("Query 1", or the saved query's name) and its status as an icon and a label in its tooltip and accessible name, never colour alone.
  - "+" opens a new tab on the current data source.
  - Each tab's ⋯ offers Rename…, Duplicate, Close, and Close other tabs (Superset's set [ss-tabhead]).
  - Changing a tab's data source keeps its SQL and clears its result.
  - Tabs are kept on wechart's server per person, as Superset does by default.
  - Closing a tab whose text is neither saved nor the SQL of its last run asks first (rule 85).
- **Centre, above the editor.** design 15's run line and switch record, then the warning (AC-385). Both are always shown and name the tab's own data source and login.
- **Centre, the editor.** The built CodeMirror SQL editor, labelled "SQL for ‹source›", described by the warning and the limits, with Tab never trapped (design 15).
  - Under it sits the **parameters strip** (§4), then the Run bar: Run or Run selection, ⌘↵, Save…, and the limits line.
- **Centre, the editor/results split.** It starts at Superset's 30 : 70 [ss-const]. The editor's minimum is 200 px [ss-editor], and the results' is 160 px (direction §2, bottom drawer). It uses the shell's existing Splitter, with no new keys.
- **Centre, the results.** The built grid (24 px rows, name over type, row numbers, tabular numerals, NULL in muted italics), plus a head holding:
  - the outcome as an icon and a label, the row count, the duration, and the time;
  - **Make a cube…**, **Make a chart…** and **Download CSV**.
- **Right pane, Saved and History.** It docks the way the inspector does and collapses to a 40 px rail. Panes are reached with F6, as now (§7).

**3. Running, cancelling, the caps, and history**
- **Run states.** design 15's labels, each an icon and a label, in three places that always agree: the tab, the result head, and the History row.
  - Running · n s of 30
  - Finished
  - Limited to 10,000 rows
  - Limited to 10 MB
  - Stopped at 30 seconds (with the rows read, marked as cut)
  - Cancelled (with the rows read, marked as cut)
  - Not run (the refusal's two sentences)
  - Database error (redacted)
  - Busy (xcube's 503): "xcube is running as many queries as it can. Try again in a few seconds", with Retry
  - Cube Store still finishing, until the time xcube gives
- **One run per person, across every tab** (AC-379).
  - Other tabs' Run stays disabled, with the built note "You have a run going on ‹source›… Go to it · Cancel that run". "Go to it" now selects that tab.
  - Esc never cancels (design 15).
  - Leaving the workspace doesn't stop a run. Coming back shows it.
- **History** is AC-381's My runs. In the workspace it lists **All** by default, each row naming its data source and folder, with a "This data source" filter (Q8).
  - Choosing a row puts its SQL, and its parameter values, into the current tab, with Undo (as built).
  - If the row's data source differs from the tab's, it opens in a new tab on that data source instead.
  - Rows aren't kept, so seeing them means running again.

**4. Templating** (recommended form; the alternatives are Q1–Q4)
- **Detection.** A `{{name}}` outside string literals and comments, found with the SQL lexer the editor already has, is a parameter.
- **The strip.** The strip under the editor lists each parameter once, with:
  - a type: Text (the default), Number, Date or Boolean (Metabase's basic set [mb-basic]);
  - a value field.
- **Run.** Run stays held until every parameter has a value, and the strip says which ones don't.
- **Binding.** wechart replaces each `{{name}}` with the driver's placeholder and sends the values **bound** (Hex's model [hex-jinja]). A value is never written into the SQL text. So:
  - xcube's read-only check sees the statement's real shape;
  - the audit's SQL keeps `{{name}}` with no value (AC-382);
  - History keeps the values, for the owner alone (Q5).
- **Saved queries** keep each parameter's name, type and last value.
- **Build note** (a dependency, not an estimate): xcube's run route has no field for bound values (`xcube-sql-runner.md` L76). Cube's driver interface does take them (`query(sql, params, options)`, `sql-runner.md` §7). Placeholder syntax differs by driver, so each driver's syntax needs research before the spec.

**5. Saved queries** (personal)
- **Saving.** "Save…" opens a 520 px dialog with Name and Description (Superset's fields [ss-save]).
  - On a saved query, the bar shows **Save** (it updates) and **Save as new…** [ss-save].
  - A save never needs a proposal and is never audited, because it changes no data or access.
- **What it keeps:** the SQL, the data source, and the parameters' definitions and last values.
- **The Saved tab** lists them by name, each showing its data source and an "Only me" icon and label (rule 81's wording).
  - A row's ⋯ offers Open, Rename…, Duplicate and Delete. Delete shows an Undo toast (rule 38's pattern).
  - Saved queries are never listed in Explore, a folder, a proposal or a bookmark, and nobody else can reach them, Super-Admins included (as AC-276 does for workspaces).
- **A data source that's no longer available.** A saved query whose data source the person can no longer run on opens with no data source chosen: "Choose a data source: the one it was saved with isn't available to you." It doesn't name that source (principle 6).

**6. Make a cube… and Make a chart…** (both land in My workspace, F29)
- **When they are offered.** Only on a run that ended **Finished** or **Limited** (its columns are known and its SQL completed), of a SELECT, on a data source rather than Cube Store, to someone who may make a model (AC-350's audience). Elsewhere they are disabled, with the reason:
  - an EXPLAIN's plan: "isn't data to model";
  - Cube Store: "holds rollups Cube builds; model the source instead";
  - stopped or cancelled: "Run it to the end first";
  - repeated column names: "Two columns are named `a`: give each its own name with AS, and run it again".
- **Make a cube…** opens a docked 480 px pane, the shared pane head that Generate cubes and the data source wizard use (T691-4), headed "Make a cube from this query · in My workspace" with the person icon. It shows:
  - **Cube name.** Suggested grammar-safe (R73) and held to AC-422's name check.
  - **Folder it is to go to.** Read-write folders only (rule 74).
  - **Data source.** The run's, fixed.
  - **SQL.** The SQL that ran (only the selection, if a selection ran), read-only, in the code face. Parameters are written in as the run's values, and the pane says so (Q6).
  - **Columns.** One row per result column: include (checked), member name, **Dimension / Measure**, **Cube type** (string, number, time, boolean) proposed from the database's type and changeable, and **Primary key** (one, as a radio).
    - Metabase makes column types for SQL models a manual step [mb-models].
    - The pane adds a `count` measure, as Generate cubes does (AC-139).
  - **A note:** "Whoever queries this cube reads it through Cube, as the data source's serving login, with folder permissions and access policies applying. The SQL runner's caps don't apply."
  - **Add to My workspace** (primary). It adds an unpublished draft file to the workspace model (AC-345's pattern). The toast reads "‹cube› is in My workspace, unpublished · Open in Model". Nothing reaches a folder without a proposal (AC-284).
- **Make a chart…** is the same pane, with the primary **Add and make a chart**.
  - It saves the cube into the workspace model so that previews can query it.
  - It then opens the chart editor full-viewport on a new workspace chart, whose target folder is the cube's, with the new cube chosen in the field tree and "← Back to SQL runner".
  - What starts in the wells is Q7.

**7. Empty, loading and error states** (an icon and a sentence; a primary action where there is one)
- **No data source to run on** (member): "No data source runs SQL for you yet. A Super-Admin turns the SQL runner on for each data source. Your own data sources in My workspace need no switch." Link: Data sources.
- **First visit:** one tab, "Query 1", with no data source chosen, focus on the picker, and the centre reading "Choose a data source to write SQL against."
- **Empty editor:** the built placeholder, "SELECT … or EXPLAIN SELECT …".
- **No result yet:** the built line, "Run a SELECT or EXPLAIN to see its rows here."
- **No rows:** the column headers stay, with "No rows came back" (Superset's "The query returned no data" [ss-result]).
- **Schema browser:** as built: "Reading its schemas…", the two 409 notes, "Its login sees no schemas.", and errors with "Try again". The tree and History load as skeleton rows (§6's skeleton rule, applied to lists).
- **History empty:** "No runs yet."
- **Saved empty:** "No saved queries. Save… keeps a query here; only you can see it."
- **Access lost mid-session:**
  - the switch turned off: Run says "The SQL runner was turned off for ‹source›";
  - the folder's access removed: the tab's source becomes "isn't available to you" and isn't named again.
- **Database error:** shown as given, redacted. Where the database names a line or position, that line is marked in the editor's gutter with an icon (design 15 P2).

**8. Accessibility** (consistent with direction.md: principle 5, rules 1, 3, 17 and 85)
- **Panes.** The three panes are landmarks, cycled with F6 (existing).
- **The picker** is a combobox with a listbox (12 px floor).
- **The tree** keeps T539's single tab stop and its keys.
- **Editor tabs** are a `tablist`, reached and moved with ← → as the built tab lists are.
  - Each tab's close and ⋯ are separate buttons after it in the tab order. **No Delete key closes a tab** (R75).
  - Tab status is spoken: "Query 1, Finished, 1,284 rows".
- **The parameters strip** is a labelled group. Each field is labelled with its parameter's name, and a held Run gives its reason in its accessible description.
- **Announcements.** Run outcomes are announced in the existing polite live region. The Make a cube pane follows rule 85: focus on open, Esc closes and asks first if anything changed, and focus returns to its button.
- **Tokens.** No new colour, type size or weight.

### Tokens to derive

| Token use | Value | Provenance |
|---|---|---|
| Left pane (picker and browser) | 280 px, 220–400, rail 40 | direction §2 "Left tree". Superset's 400 px [ss-const] is rejected above |
| Right pane (Saved and History) | 320 px, 280–480, rail 40 | direction §2 "Right inspector". design 15 already places My runs at the right |
| Editor : results split | 30 : 70 at the start; editor ≥ 200 px, results ≥ 160 px | Superset `INITIAL_NORTH_PERCENT` 30 [ss-const], minimum north 200 [ss-editor]; direction §2 bottom drawer minimum 160 |
| Make a cube pane | 480 px, docked | design 01's data source wizard pane (direction §7e) and Generate cubes' shared head (T691-4) |
| Save dialog | 520 px | direction §7e, the workspace dialogs |
| Code face (editor and SQL in panes) | IBM Plex Mono 12/16 | direction §3; decisions model-Q2 #6 (12/16, not design 15's 12/18) |
| Tree rows (schemas, tables, columns) | 28 px, `text-xs` | direction §4 and rule 17; §3 note "field and file trees" |
| Result grid rows | 24 px dense, cells padded 8 px | direction §4; decisions dashboard-Q4, data-sources-Q1 |
| History and Saved rows | two-line rows as design 15's `rrow`, in `text-xs` / `text-sm` | design 15 screen 1 pin 12 (no new value) |
| Editor tabs | the built page-tab style (13 px, §7d) | direction §7d (13 px on page tabs) |
| Controls (Run, Save…, Make…, picker) | 32 px; parameter fields 28 px compact | direction §4; decisions components-Q1 |
| PK / FK tags | 12/16 text tags, `border-subtle`, radius 3 | direction §3 floor (absolute), §7d's scope-tag radius |
| Status | `status-success`, `status-warning`, `status-error` and idle, each an icon and a label | direction §5 and rule 3; design 15's state legend |
| "Yours" and "Only me" | the person icon plus a label, on the existing workspace badge | rules 72 and 81 |
| Preview and Insert SELECT limit | 100 rows | Superset `PREVIEW_QUERY_LIMIT` 100 [ss-const]; Hex "100-row preview" [hex-browser] |
| Run caps | 10,000 rows · 10 MB · 30 s · one run per person | R50-7 … R50-10, AC-377 … AC-379 (unchanged) |
| Data-viz palette | none here; Make a chart hands over to the chart editor | direction §5 |

No new colour, type size or weight is needed.

## How today's per-data-source runner maps into the workspace

| Part of today's SQL tab (design 15, as built) | In the SQL runner workspace | On the data source's page |
|---|---|---|
| The switch: off panel (P1), Turn on… with the attestation, Turn off, who and when (AC-373, AC-374) | Read-only: the picker shows on or off. For Super-Admins, an off source opens the same off panel and dialog | **Stays.** The tab is renamed **SQL runner**. It keeps the off panel, or the switch record with Turn off, and who may run, and gains the primary **Open in SQL runner** (Q14) |
| Run line and warning (AC-385) | **Moves**, above every tab's editor | Not repeated (the tab has no editor) |
| Editor, Run, ⌘/Ctrl+Enter, Run selection, limits (AC-387) | **Moves**, one per tab | — |
| Schema browser (AC-386) | **Moves** to the left pane, with PK/FK tags, search, Insert SELECT and Preview | — |
| Result grid and Download CSV (AC-380) | **Moves**, plus Make a cube… and Make a chart… | — |
| My runs (AC-381) | **Moves** to the right pane as **History**, All by default | — |
| "You have a run going… Go to it" | Points to the workspace tab | — |
| Workspace data source, with no switch (AC-383) | Listed first in the picker with "Yours" | Its page keeps the tab with "Open in SQL runner" |
| Cube Store (AC-384); its Turn on… in the Data sources header ⋯ (P5) | Listed at the root of the picker when on | Its page and the header ⋯ entry stay |
| Audit "SQL run" (AC-382) | Unchanged: every run, Preview included | — |
| Links in | — | "Open in SQL runner" in the page head's ⋯ and in each data source row's ⋯ (Data sources and Explore), opening a tab on that source |

**Criteria the spec writer will need to amend:**
- AC-373 ("from a SQL tab on its page");
- AC-381 (the default list);
- AC-385 ("on the SQL tab");
- AC-386 ("beside the editor");
- AC-001 (the switcher's entries).

None of the safety criteria changes.

## Open questions for the user (candidate answers; the recommended one first)

1. **What does "templating" mean?**
   - (a) **Typed `{{name}}` parameters (Text, Number, Date, Boolean), bound as database parameters, filled in a strip under the editor** [mb-basic][hex-jinja].
   - (b) Superset-style Jinja, with macros, run on the server [ss-tmpl-admin].
   - (c) Text substitution (`${name}`, as in DBeaver and DataGrip) [db-params][dg-params].
   - (d) Snippets only (Q4).
   - (e) Filled values from the dashboard's filters (Superset's `filter_values`). This doesn't apply, because runner queries aren't dashboard tiles.
2. **Optional clauses `[[ … ]]`** (Metabase [mb-optional])?
   - (a) **Not until asked.**
   - (b) Yes. The clause is left out when its value is empty, and its value is still bound.
3. **Parameters that stand for a table or column name?**
   - (a) **No.** Only values.
   - (b) Yes, picked from the introspected names, never typed.
   - (c) Free text, like Hex's `sqlsafe` [hex-jinja].
4. **Snippets?**
   - (a) **No. Personal saved queries cover reuse.**
   - (b) Personal snippets, `{{snippet: name}}`.
   - (c) Shared snippets [mb-snippets]. This breaks "no sharing".
5. **Where are parameter values kept?**
   - (a) **History and saved queries keep them, for the owner only. The audit keeps `{{name}}` only.**
   - (b) Nowhere but the open tab.
   - (c) The audit too.
6. **Make a cube from a query with parameters:**
   - (a) **Write the run's values in as literals, shown in the pane before adding.**
   - (b) Refuse until the parameters are removed.
   - (c) Map them to Cube's `FILTER_PARAMS` (needs research).
7. **What Make a chart starts with:**
   - (a) **The new cube chosen in the field tree and nothing placed, as a new chart starts.**
   - (b) Every column placed, with the recommender drawing it.
8. **History's default in the workspace:**
   - (a) **All my runs, each naming its data source and folder.**
   - (b) The active tab's data source (AC-381 as worded today).
9. **⌘/Ctrl+Enter with nothing selected and several statements in the editor** (this changes what the existing key does, so R75 needs the user's OK):
   - (a) **Run the statement at the cursor**, as DBeaver does [db-exec] and Superset's Run current does [ss-editor].
   - (b) Keep AC-387: run the whole text, which AC-375 then refuses.
10. **New shortcuts** (R75; each needs the user's yes):
    - (a) **Yes to ⌘/Ctrl+S for Save inside the workspace, and ⌘/Ctrl+F for find inside the editor** [ss-keys]. **No to the rest.**
    - (b) Also new, close and next/previous tab [ss-keys].
    - (c) Also Stop [ss-keys] and Format [ss-keys] (Format would need a formatter researched).
    - (d) None.
11. **Autocomplete from the introspected catalog** (CodeMirror's SQL completion; it changes what Enter does while its list is open, so R75 applies):
    - (a) **On. The list opens as you type, ↑ and ↓ choose, Enter accepts, Esc closes, and Tab still leaves the editor.**
    - (b) A toggle, off by default (Superset keeps a toggle [ss-editor]).
    - (c) None.
12. **Saved queries in ⌘K search?**
    - (a) **Yes, to their owner only, labelled "Saved query".**
    - (b) No.
13. **Cube's semantic SQL API (`/v1/cubesql`), now in scope:**
    - (a) **In this workspace, as a separate "Cube" group in the picker.** Its run line would say it goes through Cube, with your folder access and policies. It would have no bypass warning, and its browser would list cubes, views and members.
    - (b) A surface of its own.
    - (c) Not in this round.
14. **The data source page's tab:**
    - (a) **Keep it, renamed "SQL runner", holding the switch, its record and "Open in SQL runner".**
    - (b) Move the switch to the Connection tab and drop the tab.
    - (c) Drop the tab, so the switch lives only in the workspace picker.
15. **Who sees the switcher entry:**
    - (a) **Super-Admins and read-write members** (like Jobs and Schedules).
    - (b) Only people who have at least one data source they may run on.
16. **Copy results to the clipboard** (Superset's "Copy to Clipboard" [ss-result]):
    - (a) **No. CSV only, as R50-11 decided.**
    - (b) Yes, the same rows as the CSV.
17. **Where tabs are kept:**
    - (a) **On wechart's server, per person, across devices** (Superset's default).
    - (b) In the browser only.
18. **"Open in SQL runner" from a chart's View SQL** (`sql-runner.md` Q10c):
    - (a) **Not now.** It would run Cube's SQL past the policies the chart obeys.
    - (b) Yes, with the warning.
19. **Previewing a table:**
    - (a) **An explicit "Preview 100 rows" that is an ordinary, audited run.**
    - (b) Automatic when a table is opened, as Superset's table preview does [ss-preview].

## Checklist (extends direction.md §9)

The copilot study proposes rules 90–106 (`references-copilot.md`), so these start at 107. Renumber them if the copilot's rules aren't adopted.

107. The workspace switcher lists **SQL runner** after Schedules, to Super-Admins and read-write members only. Its address restores the open tab, its data source and its text.
108. The SQL runner has three panes:
     - left: the data source picker and schema browser (280 px, 220–400, rail 40);
     - centre: the editor tabs over the results;
     - right: Saved and History (320 px, 280–480, rail 40).
     
     F6 cycles them. The editor and the results split at 30 : 70 to start, with the editor at least 200 px and the results at least 160 px.
109. The picker lists only data sources the person may run SQL on, or could once a Super-Admin turns the runner on: their own My workspace sources first, then by folder path, then Cube Store at the root when it is on. Each row shows the driver and the runner's state as an icon and a label. An off source is listed only to Super-Admins and to its own folder's read-write members.
110. Every editor tab is bound to exactly one data source. A tab's run status appears as an icon and a label in its accessible name, never as colour alone. Changing a tab's data source keeps the SQL and clears the result.
111. Above every tab's editor stand the run line (database, host, login) and AC-385's warning, naming that tab's data source. Neither can be hidden.
112. The schema browser lists schemas → tables → columns, each column with its database type and PK or FK tags. Nothing runs when a node opens, except catalog reads. "Insert SELECT" writes a SELECT in the driver's dialect with a 100-row limit and doesn't run it. "Preview 100 rows" is an ordinary run: capped, audited and listed in History.
113. One person has at most one run going across every tab. Every other tab's Run is disabled, with "Go to it" and "Cancel that run". Esc never cancels a run.
114. Every run outcome uses design 15's labels as an icon and a label, the same in the tab, the result head and History. A result cut at any limit says which limit.
115. A `{{name}}` outside strings and comments is a parameter. It is listed under the editor with a type and a value, and Run is held, naming what is missing, until every parameter has a value. Values are sent bound and never written into the SQL text. The audit record's SQL keeps `{{name}}` and holds no value.
116. Saved queries are personal. Only their owner can list, open or find them, Super-Admins included. They never appear in Explore, a folder, a proposal or a bookmark. Each shows "Only me" as an icon and a label, and Delete offers Undo.
117. A saved query or History row whose data source the person can no longer use opens with no data source chosen, and never names the old one.
118. Make a cube… and Make a chart… are enabled only on a Finished or Limited SELECT run on a data source (not Cube Store), for someone who may make a model. Otherwise they are disabled, with the reason given.
119. Make a cube… opens a docked pane headed "in My workspace". It shows the name (held to AC-422), a target folder among read-write folders only, the run's data source, the SQL that ran (with parameter values written in, and saying so), and each column with include, member name, dimension or measure, Cube type and primary key. It adds a `count` measure, adds an unpublished draft, and publishes nothing to any folder.
120. Make a chart… does what rule 119 does, then opens the chart editor on a new chart in My workspace over that cube, with "← Back to SQL runner".
121. The SQL runner's empty, loading and error states each show an icon and one sentence, and an action where there is one. Lists load as skeleton rows. A database error is shown redacted, and marks its line in the editor where the database names one.
122. Closing a tab whose text is neither saved nor the SQL of its last run asks first. Tabs are kept per person across reloads.
123. A data source's page keeps the runner's switch, its record, the off panel and "Open in SQL runner", and holds no SQL editor.
124. The SQL runner adds no keyboard shortcut beyond ⌘/Ctrl+Enter and the built tree and tab keys, unless the user approves it (R75; open questions 9–11).
125. Every SQL runner pane, dialog and popover follows rule 85. The picker is a custom listbox that meets the 12 px floor. The workspace adds no colour, type size or weight.

## Sources

**Apache Superset 6.1.0** (docs and source at tag `6.1.0`)
- [ss-explore] https://raw.githubusercontent.com/apache/superset/6.1.0/docs/docs/using-superset/exploring-data.mdx ("SQL Lab Tips")
- [ss-tmpl-user] https://raw.githubusercontent.com/apache/superset/6.1.0/docs/docs/using-superset/sql-templating.mdx
- [ss-tmpl-admin] https://raw.githubusercontent.com/apache/superset/6.1.0/docs/admin_docs/configuration/sql-templating.mdx
- [ss-menu] https://github.com/apache/superset/blob/6.1.0/superset/initialization/__init__.py (the SQL menu links, ~L520–540)
- [ss-const] https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/SqlLab/constants.ts
- [ss-layout] https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/SqlLab/components/AppLayout/index.tsx
- [ss-leftbar] https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/SqlLab/components/SqlEditorLeftBar/index.tsx
- [ss-tree] https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/SqlLab/components/TableExploreTree/index.tsx
- [ss-node] https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/SqlLab/components/TableExploreTree/TreeNodeRenderer.tsx
- [ss-preview] https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/SqlLab/components/TablePreview/index.tsx
- [ss-editor] https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/SqlLab/components/SqlEditor/index.tsx
- [ss-tabhead] https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/SqlLab/components/SqlEditorTabHeader/index.tsx
- [ss-run] https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/SqlLab/components/RunQueryActionButton/index.tsx
- [ss-keys] https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/SqlLab/components/KeyboardShortcutButton/index.tsx
- [ss-params] https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/SqlLab/components/TemplateParamsEditor/index.tsx
- [ss-south] https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/SqlLab/components/SouthPane/index.tsx
- [ss-result] https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/SqlLab/components/ResultSet/index.tsx
- [ss-history] https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/SqlLab/components/QueryHistory/index.tsx
- [ss-save] https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/SqlLab/components/SaveQuery/index.tsx
- [ss-savebtn] https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/SqlLab/components/SaveDatasetActionButton/index.tsx
- [ss-dataset] https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/SqlLab/components/SaveDatasetModal/index.tsx
- [ss-chart] https://github.com/apache/superset/blob/6.1.0/superset-frontend/src/SqlLab/components/ExploreResultsButton/index.tsx
- [ss-cves] https://github.com/apache/superset/blob/6.1.0/docs/admin_docs/security/cves.mdx (as read for `docs/research/sql-runner.md` §3)
- `SQLLAB_BACKEND_PERSISTENCE` and `ENABLE_TEMPLATE_PROCESSING`: https://github.com/apache/superset/blob/6.1.0/superset/config.py L769 and L741 (as read for `docs/research/sql-runner.md` §3)

**Metabase** (docs "latest", stated as v0.64)
- [mb-sql] https://www.metabase.com/docs/latest/questions/native-editor/writing-sql
- [mb-params] https://www.metabase.com/docs/latest/questions/native-editor/sql-parameters
- [mb-basic] https://www.metabase.com/docs/latest/questions/native-editor/basic-sql-parameters
- [mb-optional] https://www.metabase.com/docs/latest/questions/native-editor/optional-variables
- [mb-snippets] https://www.metabase.com/docs/latest/questions/native-editor/snippets
- [mb-ref] https://www.metabase.com/docs/latest/exploration-and-organization/data-model-reference
- [mb-models] https://www.metabase.com/docs/latest/data-modeling/models/models
- [mb-saved] https://www.metabase.com/docs/latest/questions/native-editor/referencing-saved-questions-in-queries

**Hex**
- [hex-sql] https://learn.hex.tech/docs/explore-data/cells/sql-cells/sql-cells-introduction
- [hex-jinja] https://learn.hex.tech/docs/explore-data/cells/using-jinja (section "SQL parameterization")
- [hex-browser] https://learn.hex.tech/docs/explore-data/data-browser
- [hex-chart] https://learn.hex.tech/docs/explore-data/cells/visualization-cells/chart-cells

**DBeaver**
- [db-exec] https://dbeaver.com/docs/dbeaver/SQL-Execution/
- [db-editor] https://dbeaver.com/docs/dbeaver/SQL-Editor/
- [db-nav] https://dbeaver.com/docs/dbeaver/Database-Navigator/
- [db-data] https://dbeaver.com/docs/dbeaver/Data-Editor/
- [db-qm] https://dbeaver.com/docs/dbeaver/Query-Manager/
- [db-tmpl] https://dbeaver.com/docs/dbeaver/SQL-Templates/
- [db-params] https://github.com/dbeaver/dbeaver/wiki/SQL-Execution (parameters and variables)
- [db-types] https://dbeaver.com/docs/dbeaver/Connection-Types/

**DataGrip**
- [dg-console] https://www.jetbrains.com/help/datagrip/query-consoles.html
- [dg-run] https://www.jetbrains.com/help/datagrip/run-a-query.html
- [dg-explorer] https://www.jetbrains.com/help/datagrip/database-explorer.html
- [dg-params] https://www.jetbrains.com/help/datagrip/settings-tools-database-user-parameters.html
- [dg-ro] https://www.jetbrains.com/help/datagrip/data-sources-and-drivers-dialog.html
- [dg-live] https://www.jetbrains.com/help/datagrip/using-live-templates.html

**wechart**
- `/Users/srajagopal/Work/wechart/docs/spec.md`: F40 (L1349–1383), F29 (L1108–1128), AC-344–AC-350 (L898–912), AC-001 (L91)
- `/Users/srajagopal/Work/wechart/docs/requirements.md`: §P2.6 J (L615–636), the non-goals around the runner (L673–679), round R50 (L715–730)
- `/Users/srajagopal/Work/wechart/docs/research/sql-runner.md`, `/Users/srajagopal/Work/wechart/docs/research/xcube-sql-runner.md` (route request L76), `/Users/srajagopal/Work/wechart/docs/research/cube/introspection-api.md` (L482–487), `/Users/srajagopal/Work/wechart/docs/research/cube/data-modeling.md` (L567–568), `/Users/srajagopal/Work/wechart/docs/research/code-editor.md`
- `/Users/srajagopal/Work/wechart/docs/design/reviews/2026-10-01/designs/15-sql-runner.html`, `16-jobs-schedules.html` and `index.md`
- `/Users/srajagopal/Work/wechart/docs/design/direction.md`, `/Users/srajagopal/Work/wechart/docs/design/decisions-2026-10-08.md`, `/Users/srajagopal/Work/wechart/docs/design/references-copilot.md` (checklist numbering)
- `/Users/srajagopal/Work/wechart/packages/web/src/workspaces/data-sources/SqlRunner.tsx`, `SqlEditor.tsx` and `SchemaBrowser.tsx`; `/Users/srajagopal/Work/wechart/packages/api/src/routes/sql-catalog.test.ts` (the 409 texts)
