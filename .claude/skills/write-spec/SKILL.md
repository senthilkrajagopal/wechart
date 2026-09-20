---
name: write-spec
description: Turns docs/requirements.md into docs/spec.md with EARS-style acceptance criteria, each with an explicit failing state; rejects criteria that cannot fail. Use after project-interview, or when requirements change.
---

# Write spec

Input: `docs/requirements.md`. Output: `docs/spec.md`. This skill writes nothing else.

## Preconditions

- `docs/requirements.md` exists. If it doesn't, stop and use project-interview.
- Its Open questions section is empty. If it isn't, resolve each question with the user (AskUserQuestion) and update requirements.md first.
- Never carry an unknown into the spec. `TBD` and `[NEEDS CLARIFICATION: …]` are allowed only as a temporary marker while you are asking the user. The spec gate blocks every edit outside `docs/` while either marker is present.

## Structure of docs/spec.md

1. **Overview**: one paragraph, with a link to requirements.md.
2. **Glossary**: the domain terms the criteria use (e.g. measure, dimension, pre-aggregation, global filter, cross-filter, trellis).
3. **Features**: one `## F<n>. <name>` section for each capability group in the requirements' Scope. Each section has a one-line purpose, the requirement references it traces to (`[R4]`, `[docs/inputs/…]`), and its acceptance criteria.
4. **Non-goals**: copied from requirements.md.
5. **Traceability**: a table mapping each requirement to its AC IDs. Every in-scope requirement has at least one AC.

## Acceptance criterion format (parsed by hooks; see CLAUDE.md)

```
- [ ] AC-001 WHEN <trigger>, THE SYSTEM SHALL <observable response>.
  Fails when: <the specific observation that proves the criterion is not met>
```

IDs are global and sequential, and a retired ID is never reused.

| EARS pattern | Template |
|---|---|
| Ubiquitous | THE SYSTEM SHALL <response> |
| Event-driven | WHEN <trigger>, THE SYSTEM SHALL <response> |
| State-driven | WHILE <state>, THE SYSTEM SHALL <response> |
| Unwanted behavior | IF <condition>, THEN THE SYSTEM SHALL <response> |
| Optional feature | WHERE <feature is enabled>, THE SYSTEM SHALL <response> |
| Complex | WHILE <state>, WHEN <trigger>, THE SYSTEM SHALL <response> |

## Falsifiability gate (run on every criterion before writing it)

Reject any criterion that can't fail, and either rewrite it or drop it. That includes:

- No observable output: internal structure, "uses library X", "is well-architected".
- Unmeasurable qualifiers such as *fast, intuitive, modern, appealing, responsive, scalable, user-friendly, seamless*. Replace them with a number or a checkable property ("p95 < 800 ms for …", "shows a legend when there are 2 or more series").
- "SHALL support / allow / handle X" with no defined behavior.
- Tautologies, or a response that just restates the trigger.
- A `Fails when:` line that only negates the sentence ("it doesn't work"). The failing state must name one specific observation a test can make: a value, element, message, status code, row count, or timing.
- Anything that needs human judgment to verify, unless it names the checklist to judge against, such as a rule in docs/design/direction.md.

If a requirement is inherently subjective ("visually appealing dashboards"), ask the user to choose checkable proxies, such as conformance to the design-direction checklist, spacing and type tokens, or contrast ratios. Don't write a criterion that can't fail.

Order features by dependency and user value. Don't include effort estimates, sizes, or effort-based priorities.

## Finish

Report the number of features and ACs, any requirement left without an AC (there should be none), and every criterion you rejected with the reason. Then stop. Task planning is a separate step (plan-tasks).
