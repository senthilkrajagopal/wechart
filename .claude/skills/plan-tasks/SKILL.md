---
name: plan-tasks
description: Turns docs/spec.md (plus docs/research/ and docs/design/) into docs/tasks.md, an ordered list of single-behavior TDD tasks that each map to acceptance criteria. Use after write-spec, component-research, and ui-design, before implement.
---

# Plan tasks

Inputs: `docs/spec.md`, `docs/research/*.md`, `docs/design/*.md`. Output: `docs/tasks.md`.

## Preconditions

- `docs/spec.md` exists and contains no `TBD` or `[NEEDS CLARIFICATION`.
- Every external package a task will import has an entry in `docs/research/`. If one is missing, run component-research first, because the research gate will block that import.
- If there are UI tasks, `docs/design/direction.md` must exist. If it doesn't, run ui-design first.

## Task format (parsed by hooks; see CLAUDE.md)

```
- [ ] T001 [P] (AC-001, AC-004) <imperative title>
  - Files: <paths to create or modify>
  - Failing test: <test file>: <what it asserts, and which AC it demonstrates>
  - Depends on: T000 | none
```

`[P]` means the task depends on no unfinished task, so it can run in parallel with others.

## Rules

- Every AC is covered by at least one task, and every task cites at least one AC. End tasks.md with an AC → tasks coverage table.
- One task produces one observable behavior and one commit. If a task needs two unrelated tests, split it.
- The first tasks build the scaffold: pnpm workspace, test runner, lint, format, and typecheck. Every package defines `test` and `typecheck` scripts, because the hooks call them. The TypeScript configs exclude `.claude/`.
- Order tasks by dependency first, then by user value. Never order, split, merge, or drop tasks based on estimated effort, and don't put estimates, sizes, or points in the file.
- A task may only change behavior that the spec describes. If a behavior is needed but has no AC, stop and propose a spec amendment to the user. Don't add a task that doesn't trace to an AC.
