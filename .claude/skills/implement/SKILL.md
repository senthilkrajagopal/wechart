---
name: implement
description: Works through docs/tasks.md one task at a time with strict TDD, a cold spec review, and one commit per task. Use when docs/tasks.md has unchecked tasks and implementation should proceed.
---

# Implement

## Preconditions

`docs/spec.md` has no `TBD` or `[NEEDS CLARIFICATION`, `docs/tasks.md` exists, and the directory is a git repo. If any of these is missing, stop and name the step that produces it.

## Loop: one task at a time

1. **Pick.** Take the first unchecked task in `docs/tasks.md` whose dependencies are all checked. State its ID, title, and ACs.
2. **Red.** Follow the test-driven-development skill. Write the failing test the task names, then run it. Confirm it fails for the expected reason: missing behavior, not a typo or an import error. Show the failing output.
3. **Green.** Write the minimum code that makes the test pass. Run the task's test, then the full suite (`pnpm test`).
4. **Hook feedback.** quality-check and test-integrity report after each edit. Resolve every report before continuing. Never weaken, skip, or delete a test to get to green. If a test is wrong, stop and tell the user why.
5. **Refactor** while green, re-running the suite after each change.
6. **Review.** Dispatch spec-reviewer with the task ID, its AC IDs, and the diff range (`git diff HEAD` for the uncommitted task). Fix every finding it marks as a spec violation, and report the rest to the user.
7. **Verify.** Follow the verification-before-completion skill: rerun the task's test, the full suite, and typecheck and lint, and show the output.
8. **Check off.** Tick the task. Tick an AC only when a passing test demonstrates it, and name that test. If any part of an AC isn't demonstrated, leave it unchecked.
9. **Commit.** Stage only this task's files and the updated `docs/tasks.md` and `docs/spec.md`. Message: `T00N: <title> (AC-00x, AC-00y)`. Don't push.
10. **Next task.** The Stop hook keeps the session going while ACs are still open and the suite passes.

If the same failure happens twice, switch to the systematic-debugging skill. If a task turns out to need behavior the spec doesn't describe, stop and propose a spec change to the user rather than implementing behavior no AC traces to.
