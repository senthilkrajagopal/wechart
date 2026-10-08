# wechart

wechart is an enterprise BI tool built on Cube (the Cube.js semantic layer plus Cube Store).

- **Phase 1:** the charting and dashboard-authoring layer, plus UI for managing the Cube semantic layer.
- **Scope goal:** surface nearly every Cube capability in the UI (see `docs/inputs/` and `docs/research/cube-capabilities.md`).

## Stack (decided; changing any item needs the user's approval)

- pnpm workspace monorepo, Node 26, TypeScript in strict mode everywhere.
- Web app: Vite + React. Chart renderer: Apache ECharts. Chart definitions are saved as engine-neutral data specs, not renderer code.
- Local dev: docker-compose runs the Cube API, Cube Store, a seeded sample Postgres, and wechart's own metadata DB.
- Every package defines `test` and `typecheck` scripts, because the hooks call them. The TypeScript configs exclude `.claude/`.

## Workflow (hooks enforce the order)

1. project-interview → `docs/requirements.md`
2. write-spec → `docs/spec.md`
3. component-research → `docs/research/`
4. ui-design → `docs/design/`
5. plan-tasks → `docs/tasks.md`
6. implement → code and tests, one commit per task

Rules that go with it:

- Edits outside `docs/` are blocked until `docs/spec.md` exists and contains no `TBD` or `[NEEDS CLARIFICATION`.
- Code can't import a package until a `docs/research/` doc covers it.
- Don't write or modify files through Bash (heredocs, `sed -i`, `tee`, `cp` or `mv` over files) to get around the Edit/Write hooks. Bash is for running tools.
- If a request would skip a step, name the gate it hits and ask the user how to proceed.

## Artifact contracts (the hooks parse these exact shapes)

- An acceptance criterion in `docs/spec.md`:
  ```
  - [ ] AC-001 WHEN <trigger>, THE SYSTEM SHALL <response>.
    Fails when: <observable failing state>
  ```
- Unresolved markers are `TBD` and `[NEEDS CLARIFICATION: …]`. Don't use either string anywhere else in the spec.
- A task in `docs/tasks.md`: `- [ ] T001 [P] (AC-001, AC-004) <title>`
- A research doc `docs/research/<name>.md` has frontmatter with `packages:` (every import name it covers), `version:` (exact), and `researched:` (date).
- `docs/inputs/` holds raw material from the user. It feeds the interview but is not itself requirements, and claims in it must be verified by research.

## Decisions

- Never let human effort, developer time, build complexity, or effort and time estimates decide anything: build vs. buy, library choice, design direction, task order, or scope. Decide on correctness, user value, risk, performance, security, maintainability, and fit. Don't write estimates, sizes, or points in any doc.
- When a requirement is vague or missing, ask the user. Never invent requirements, metrics, or defaults and present them as decided.
- Every claim about third-party behavior needs a source in `docs/research/`. Memory is not a source.

## Testing

- Use TDD: write a failing test, confirm it fails for the right reason, then write the code.
- Never get to green by adding skip, only, todo, xfail or @Ignore, by commenting out or deleting assertions, or by switching to a weaker matcher. If a test is wrong, tell the user.
- Check an AC only when a passing test demonstrates it.

## Git

- One commit per task, with the message `T00N: <title> (AC-…)`. Stage only that task's files.
- Don't push, force, or rewrite history unless the user asks.

## Harness

- `.claude/hooks/*.mjs` are the workflow gates. `.claude/state/` holds runtime state and is gitignored.
- `.claude/skills/{test-driven-development,verification-before-completion,systematic-debugging}` are copied verbatim from superpowers v6.4.1 (see `.claude/skills/VENDORED.md`). Don't edit them.
- Don't install the superpowers plugin. Its SessionStart hook and brainstorming flow conflict with this workflow.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
