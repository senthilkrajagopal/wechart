> **Superseded 2026-09-26** by [`2026-09-26-integration-plan-decisions.md`](2026-09-26-integration-plan-decisions.md), the final wechart ↔ Cube integration plan. The text below is kept verbatim as the record.

Several architecture decisions were made on 2026-09-25 that change what your docs record. First, save this message verbatim as docs/inputs/2026-09-25-architecture-decisions.md (raw input for project-interview). Then correct the docs through your normal gates.

Decisions:
1. Semantic service. Cube plus "xcube" (the Cube-side package in ~/Work/bi/cube, renamed from cube-introspection) owns the published model, Cube's rules (validation, access policies) and connection runtime. wechart is its client and owns workflow, folders, permissions, users/groups, dashboards and UI. Cube never calls wechart at runtime: no /api/cube-model callbacks, and no drafts in API memory.
2. Flat namespace. Every cube, view and data source gets a unique name prefixed by its folder path, so the whole deployment is one flat model. Access is an overlay on it, from folder permissions.
3. Name binding. A short name inside an item (a join target, a data_source) is resolved when the item is published: nearest-first from the item's OWN folder, then stored as the full prefixed name. Viewer-folder binding (AC-309) is dropped. A child folder overrides by publishing its own item.
4. Enforcement. wechart authorizes every request against folder permissions, and Cube enforces too: xcube generates access policies from each folder's allowed groups.
5. xcube knows the folder tree (ids and parents, no permissions beyond each folder's allowed groups) and does the name resolution.
6. Every publish compiles the whole model and is refused if anything, anywhere, breaks.
7. Credentials stay in wechart's database, but encrypted to xcube's public key. wechart keeps their lifecycle (copy into a workspace AC-280, clear on target change AC-312) but can never decrypt them; only xcube does.
8. Unpublished workspace and proposal content is pushed to xcube as short-lived overlays.
9. Scale: design for 100–200 model-bearing folders; sharding stays a later add-on.
10. Only wechart's server calls Cube or xcube, for now.
11. HA query path: 2+ Cube instances with the Cube Store queue, and a stateless wechart API on 2+ replicas. Cube Store stays single-node for now.
12. Tokens carry groups only, for now. wechart signs RS256 and publishes a JWKS; admin calls use a separate service credential.

What to do:
1. List every place in requirements.md, spec.md, design/, research/ and tasks.md that contradicts a decision. Expect at least: AC-272, AC-273, AC-309, AC-310, AC-298, AC-311, R14, R21, research/cube/per-folder-models.md (Layout B), T337–T341, T339, T361. For each, give the decision number and the change you propose. Show me this list before editing anything.
2. After I confirm, go through project-interview → write-spec → component-research → plan-tasks to amend them. Mark superseded research and decisions as superseded, with a link to this input; don't delete them.
3. Don't change code in this pass. Don't change Cube from this repo.
