The wechart ↔ Cube integration plan is final. It is the shared working doc "wechart ↔ Cube integration plan" (https://claude.ai/code/artifact/18e15cb7-61fe-4f04-9a33-d6f3eef664b8); read it with the docs connector if you can. Save this message verbatim as docs/inputs/2026-09-26-integration-plan-decisions.md (raw input for project-interview). If docs/inputs/2026-09-25-architecture-decisions.md exists, note that this input supersedes it.

Decisions:
1. wechart is the system of record for everything people author and manage: folders, cube/view items as written, drafts, workspaces, proposals, the 10-version history, permissions, dashboards, and credentials (encrypted to xcube's public key; wechart cannot decrypt them).
2. xcube is the Cube-side package in ~/Work/bi/cube (branch feat/xcube, renamed from cube-introspection). It keeps a derived runtime projection in its own "xcube" schema and database role on wechart's Postgres cluster. Cube Core stays unmodified, and Cube never calls wechart at runtime.
3. Names are <folderId>__<shortName>, using stable folder ids (not paths). Short names resolve at publish, nearest-first from the item's own folder. Viewer-folder binding (AC-309) is dropped. Chart and dashboard documents will reference the prefixed names (migrated in slice 3).
4. Modules: xcube groups cubes and views that reference each other (connected components), and compiles and versions each module separately, so adding or changing a cube recompiles only its module.
5. Every publish validates the modules it affects; any break refuses it.
6. Permissions are enforced by wechart, and also by Cube through policies xcube generates from each folder's allowed groups.
7. Previews of workspaces and proposals reach xcube as short-lived overlays.
8. Tokens carry groups only. wechart signs RS256 and publishes a JWKS (slice 4); admin calls use a separate service credential.
9. HA: 2+ Cube instances on the Cube Store queue, and a stateless wechart API on 2+ replicas.

Do now, through your gates:
1. List every place in requirements.md, spec.md, design/, research/ and tasks.md that contradicts a decision. Expect at least AC-272, 273, 309, 310, 298, 311, 136, 137, R14, R21, research/cube/per-folder-models.md (Layout B), T337–T341, T339 and T361. For each, give the decision number and the change you propose. Show me this list before editing anything; after I confirm, amend through project-interview → write-spec → component-research → plan-tasks, marking superseded text as superseded rather than deleting it.
2. Slice 0 (can go ahead in parallel): switch the Cube image to xcube.
   - Build it from ~/Work/bi/cube/xcube with: docker build -t xcube:v1.7.45-$(git rev-parse --short=10 HEAD) .   (at commit a13b9cff43 the tag is xcube:v1.7.45-a13b9cff43)
   - Use it for both cube and cube-refresh-worker in docker-compose.yml and in deploy/helm/values/docker-desktop.yaml.
   - Update docs/deploy.md's build command.
   - Don't override the container command.
   - The HTTP API is unchanged from the image you run today (verified byte for byte), so no code changes are expected; confirm with your introspection tests and a live check.
3. Don't change Cube from this repo. Don't touch uncommitted work that isn't yours.

The slice-2 design workflow is still running (readers done or nearly, then designs, judges and synthesis). I'll bring you the spec when it lands.
