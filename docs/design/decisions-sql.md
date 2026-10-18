# Lane SQL's design decisions

Lane SQL's calls since T805, kept apart so lanes don't conflict; the earlier ones, and everyone else's, are in [decisions-2026-10-08.md](./decisions-2026-10-08.md) under "Later decisions".

| ID | Question | Decision | Why | Departs |
|---|---|---|---|---|
| T805-1 the schema browser in the left pane (AC-386, design 17 C, C5) | Is the left pane's browser a new tree or the data source page's? What does it show on Cube Store, on an off source, or with no source chosen? Where does a chosen name go? | **The data source page's tree (T539), shared, under the pane's own "Schema" heading, so T806 and T807 extend one tree for both places. On Cube Store, C5's note as built: "Cube Store has no catalog to browse. Its tables are listed in information_schema.tables and system.tables." 17-P3's Insert a SELECT of information_schema.tables is a proposal and isn't built. An off source, or none, shows nothing under Schema. A chosen name goes into the tab that was open when it was chosen, at its cursor, once: opening that tab again doesn't put it in twice.** Lane SQL's call, overturnable. | Design 17 says the tree "moves" to the left pane (screen 1, C), and C5 keeps Cube Store as built. | No |
