---
name: project-interview
description: Interviews the user in rounds (problem, users, success metric, constraints, stack, non-goals) and writes docs/requirements.md. Use at the start of any new project or feature, before any spec, design, or code.
when_to_use: >-
  Requests like "new project", "new feature", "I want to build…", "let's add…", or "start requirements",
  and whenever docs/requirements.md is missing or doesn't cover the requested work.
---

# Project interview

Produce `docs/requirements.md` from a structured interview. This skill writes that one file and nothing else: no code, no config, no other docs.

## Before round 1

1. Read what already exists: `docs/requirements.md` (when extending), every file in `docs/inputs/`, `CLAUDE.md`, and any capability inventory in `docs/research/` (e.g. `cube-capabilities.md`).
2. If a platform's capabilities define the scope (for wechart, Cube) and `docs/research/` has no inventory for that platform, run the component-research skill in inventory mode first. The user can't scope features they haven't seen listed.
3. Note which topics the inputs already answer. For those topics the round confirms or corrects the existing answer instead of asking from a blank slate.

## Rounds: one topic per round, in this order

| Round | Topic | The answer is complete when it names |
|---|---|---|
| R1 | Problem | who hits it, in what situation, what they do today, and why that fails |
| R2 | Users | concrete roles (e.g. "analyst building a weekly revenue dashboard"), their skill level, and how many there are |
| R3 | Success metric | observable outcomes, each with a number and the way it is measured |
| R4 | Constraints | hard limits: platforms, data volumes, security and compliance, deployment, performance budgets, compatibility |
| R5 | Stack | what is decided and what is open; for each open item, the requirement that will decide it |
| R6 | Non-goals | explicit exclusions for this phase |

In every round:

- Ask with AskUserQuestion, one topic per call (1–4 questions, all on that topic). Offer 2–4 concrete candidate answers drawn from the inputs. The user can always choose Other.
- **Check every answer for vagueness.** An answer is vague if it has no concrete actor, number, or observable outcome, or if it leans on words like *fast, modern, intuitive, scalable, seamless, robust, easy, etc., and more, things like*. When an answer is vague, stop and ask a sharper follow-up on the same topic before moving on. For example, "fast" becomes "what p95 load time, for a dashboard with how many charts?" Never fill the gap with your own assumption.
- If the user explicitly defers an item, record it verbatim under Open questions. Never record it as a decided fact.
- Don't ask for or record estimates of human effort, time to build, or build complexity as inputs to decisions (see CLAUDE.md).

When the input already says "almost everything" (for example "integrate almost all Cube features"), invert the scope question: show the capability inventory grouped by area, and ask which items are excluded or deferred rather than which are included.

## Write docs/requirements.md

Sections, in order:

1. Problem
2. Users
3. Success metrics
4. Constraints
5. Stack (Decided / Open)
6. Scope (in-scope capabilities, grouped)
7. Non-goals
8. Open questions
9. Interview log (each round's question and the user's answer, verbatim)

Every statement must trace to a round (e.g. `[R3]`) or an input file (e.g. `[docs/inputs/…]`). Show the user a short summary of the file and ask whether anything is wrong or missing. Then stop. Writing the spec is a separate step (write-spec).
