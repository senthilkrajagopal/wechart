# Lane CLOSE's design decisions

Lane CLOSE's calls, made while closing ACs that no open task covered. They are kept apart so lanes don't conflict. The earlier ones, and everyone else's, are in [decisions-2026-10-08.md](./decisions-2026-10-08.md) under "Later decisions".

| ID | Question | Decision | Why | Departs |
|---|---|---|---|---|
| CLOSE-1 Cube Store's own page and a `{{ name }}` (AC-482) | Cube Store's page (`/explore/data-sources/cubestore`) still has an editor of its own (T823 kept it). Should it hold Run for SQL with a `{{ name }}`, the way the SQL runner workspace does? Before this call, Run there sent the SQL, and the API refused it with the reason. | **Hold it there too.** Run is disabled, and the run bar says "Parameters aren’t available on Cube Store. Write the value into the SQL to run it here." (T810's sentence). ⌘/Ctrl+Enter is held too. A `{{…}}` inside a string or a comment isn't a parameter, so that SQL runs as written. The parameter is found as the API finds it: `parameterNames`, read as standard SQL. Lane CLOSE's call, overturnable. | AC-482 says Cube Store "SHALL hold Run, saying parameters aren't available". It doesn't limit this to the workspace. | No |
