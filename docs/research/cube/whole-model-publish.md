---
library: Cube whole-model publish check
packages: []
version: 1.7.45
researched: 2026-09-25
sources:
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/PrepareCompiler.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/DataSchemaCompiler.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/ErrorReporter.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CompileError.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/YamlCompiler.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/transpilers/transpiler_worker.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/JoinGraph.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeDictionary.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/ViewCompilationGate.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/CompilerApi.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OptsHandler.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/env.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/FileRepository.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/admin/deployment/warm-up.mdx
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/embedding/multitenancy.mdx
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/environment-variables.mdx
  - https://github.com/cube-js/cube/pull/11995
  - https://github.com/cube-js/cube/issues/8318
  - https://github.com/josdejong/workerpool#pool
  - /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/ (fork branch spike/xcube-feasibility, commit db087e0)
  - /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/ (same branch)
---
# Cube whole-model publish check 1.7.45

> **Superseded in part, 2026-09-26**, by the final integration plan ([docs/inputs/2026-09-26-integration-plan-decisions.md](../../inputs/2026-09-26-integration-plan-decisions.md), decisions 4 and 5; [the plan's snapshot](../../inputs/2026-09-26-integration-plan.md), "Modules" and "Flows"; requirements §P2.4, round R28). The researcher's text below is kept as written.
> - **Replaced: one whole-model compile per publish.** xcube groups cubes that reference each other into modules. A publish compiles only the modules it affects, each in a throwaway compile, and a break in any refuses it (AC-321). The costs in "Cost" become the cost of one module of a few hundred cubes, not the deployment's.
> - **Replaced: rebinding (R27, AC-275).** A published item keeps its binding until it is next published (R28 Q2). "Where hidden breaks come from" reasons from rebinding, and needs re-reading on that basis.
> - **Replaced: phase-1-style root names.** The shared root is prefixed like every folder (R28 Q1).
> - **Still holds, per module:**
>   - the compile API and its phases;
>   - what compile checks and what it doesn't;
>   - error attribution: Cube's list is not a complete per-file count, so an index of references is needed;
>   - the rollup gate needing no database;
>   - landing by compare-and-swap on a revision (the plan's `409` on a stale base revision);
>   - the transpile-cache and worker gotchas.

## Summary

**What this covers.** Every publish compiles the whole flat Cube 1.7.45 model with the change applied, and is refused if anything anywhere breaks.
- Decisions: AD 6, AD 8 and AD 9, plus round R27 (`docs/inputs/2026-09-25-architecture-decisions.md` L9, L11, L12; `docs/requirements.md` L480–L490).
- Criteria: AC-321, AC-322, AC-275, AC-288, AC-291, AC-136 and AC-235 (`docs/spec.md` L1032–L1035, L979, L1024, L1030, L470, L537).
- The doc has three parts: (a) cost at 100–200 model-bearing folders; (b) per-file errors, split by who may see them; (c) the rollup join-path gate inside the check.

**How this was checked.**
- **Source reading.** The Cube source was read in the local checkout `/Users/srajagopal/Work/bi/cube` at HEAD db087e0 (branch `spike/xcube-feasibility`).
  - Its Cube-owned files descend from f2c28b8, which is tag v1.7.45 (`.git/logs/HEAD` L2, L15, L18). The two later commits' messages describe only `cube-introspection/` changes. I did not diff them.
  - The published npm `@cubejs-backend/schema-compiler@1.7.45` has `gitHead: f2c28b8` ([npm-pkg] L86). It contains the same `validDefinitions` cache and worker bulk path that the checkout has ([npm-cv] L1159).
  - Links point at the v1.7.45 tag, with line numbers from the checkout.
- **Measurements.** Timings come from a throwaway scale spike already in that fork branch: "Spike A" (`cube-introspection/spikes/a-scale`) and "Spike C" (multi-instance).
  - Spike A ran the published `@cubejs-backend/*@1.7.45` packages on a synthetic flat model ([sA-readme] L3–L5).
  - I did not run anything. Each spike number comes from a single run, with no variance recorded.
- **Nothing was probed for this doc.** The probe design is under Cost.

**Findings**

1. **Compile API.** `compile(repo, options)` from `@cubejs-backend/schema-compiler` runs four phases over every file ([pc] L138–L142; [dsc] L513–L523).
   - Errors are collected in one `ErrorReporter` and thrown once at the end, as `CompileError("Compile errors:\n…")` ([dsc] L548–L567; [ce] L6).
   - Two kinds of error escape that collection:
     - a YAML syntax error aborts the whole compile with a raw `YAMLException`;
     - an error *thrown* inside a phase stops that phase for every remaining cube.
   - Nothing in compile touches a database.
   - Compile checks names, member references, join targets and keys, views, access-policy member paths and the Joi schema.
   - It does not check pre-aggregation references or join paths, refresh-key crons, `sql_table`, columns, or data-source reachability.
2. **Cost.** Spike A measured a synthetic model of 200 folders, with 20% as many views as cubes, access policies on every cube and view, and rollups on 10% of cubes ([sA-cm] L1–L9):
   - 1,000 cubes: **3.1 s**, peak RSS 2.7 GiB;
   - 3,000 cubes: **7.1 s**, peak 3.6 GiB;
   - 6,000 cubes: **13.8 s**, peak 5.5 GiB.

   These are on macOS with Cube's default transpile threads. With one thread they are 6.6 s, 16.9 s and 38.7 s, at ≤1.4 GiB. AD 9's range (100–200 folders × 5–20 cubes, so 500–4,000 cubes) sits inside this.
   - Cube has no incremental compile. The caches that survive between compiles trim about 15–20% (arithmetic on [sA-ov3] and [sA-ov3s]).
   - After a publish lands, every Cube process compiles again. Queries on that process wait for it: 2.4–12.4 s in Spike A ([sA-s5] L56–L57, [sA-s30] L56–L57). That misses M3/S2's 3 s p95 unless the new version is compiled before it is switched in.
3. **Attribution.** Cube's error list is not a complete per-file list, so it cannot supply the count AC-322 needs:
   - only YAML-transpile errors carry a file;
   - most errors carry only a `<cube> cube:` prefix;
   - thrown reference errors carry neither, and they name the *missing target*, not the file that references it;
   - identical texts collapse into one.

   With folder-id prefixes (AC-328), a cube's name yields its folder. The count of hidden breaks has to come from a reverse-reference index that xcube keeps. Compiling each affected folder's dependency closure yields Cube's own text per file, at 0.2–0.9 s per closure ([sA-cl5], [sA-cl30]).
4. **Rollup gate.** It runs without any data source or Cube Store. Spike A's `/v1/sql` against a dummy host returned a matched rollup ([sA-svb] L31; [sA-s15] L26–L28).
   - Under AD 6's invariant (nothing broken is ever published), only rollups whose dependency closure touches the change need rechecking. The full gate belongs at bootstrap and at Cube upgrades.
   - Over HTTP each call cost 35/83/132 ms at 1k/3k/6k cubes. The cost grows with model size because each `/v1/sql` response carried a 1.8/5.4/10.9 MB `canUseTransformedQuery` field ([sA-s5] L19, [sA-s15] L19, [sA-s30] L19).
   - In-process planning of a query took 3–11 ms ([sA-cl5] L66, [sA-cl30] L66). Rollup compile time in-process is UNVERIFIED.
5. **Concurrency.** Cube offers no transactional publish, and reads the version and the files at different moments ([capi] L216–L237; [dsc] L256).
   - A check is only true for the exact snapshot it compiled. xcube must land it by compare-and-swap on the head version, or by serialising lands, and re-check on conflict.
   - wechart's phase-1 publish has exactly this race ([w-pub] L208, L322).
6. **Outside Cube's reach.** Charts and dashboards are wechart items, not Cube model items. A delete or rename that breaks a chart's binding does not fail Cube's compile. AC-275's "refused, naming what depends on it" needs wechart's own binding check as part of the whole-model check (inference from AD 1 and `requirements.md` L547).

## Compile API

### Entry points (in `@cubejs-backend/schema-compiler` 1.7.45)

```ts
// PrepareCompiler.ts L30-L43, L49-L59, L61-L136, L138-L142
type PrepareCompilerOptions = {
  nativeInstance?: NativeInstance; allowNodeRequire?: boolean; allowJsDuplicatePropsInSchema?: boolean;
  maxQueryCacheSize?: number; maxQueryCacheAge?: number; compileContext?: any; standalone?: boolean;
  headCommitId?: string; adapter?: string;
  compiledScriptCache?: LRUCache<string, vm.Script>;   // default: new LRU, max 250 (L77)
  compiledYamlCache?: LRUCache<string, string>;        // default: new LRU, max 250 (L78)
  compiledJinjaCache?: LRUCache<string, string>;       // default: new LRU, max 250 (L79)
};
type Compiler = { compiler: DataSchemaCompiler; metaTransformer; cubeEvaluator; contextEvaluator;
                  viewGroupEvaluator; joinGraph: JoinGraph; compilerCache; headCommitId?; compilerId: string };
function prepareCompiler(repo: SchemaFileRepository, options?: PrepareCompilerOptions): Compiler;
function compile(repo: SchemaFileRepository, options?: PrepareCompilerOptions): Promise<Compiler>; // throws CompileError

// @cubejs-backend/shared FileRepository.ts L4-L14
interface FileContent { fileName: string; content: string; readOnly?: boolean; isModule?: boolean }
interface SchemaFileRepository { localPath(): string; dataSchemaFiles(includeDependencies?: boolean): Promise<FileContent[]> }
```

- **`options` is spread into `DataSchemaCompiler`** ([pc] L122).
  - Its `omitErrors` works even though `PrepareCompilerOptions` doesn't declare it ([dsc] L69, L208, L551–L553). In TypeScript it needs a cast.
- **`standalone: true`** makes any `COMPILE_CONTEXT` read throw a `UserError` ([dsc] L1029–L1035).
  - Cube's server sets `standalone = false` once `contextToAppId` is set ([srv] L223–L226).
  - A checker running standalone therefore disagrees with the servers about any model that uses `COMPILE_CONTEXT`.
- **Structured errors are private.**
  - `DataSchemaCompiler.errorsReporter` is private ([dsc] L164). Its `getErrors()` returns `{message, plainMessage?, fileName?, lineNumber?, position?}[]` ([er] L13–L19, L221–L223).
  - Spike A read it from JavaScript as `compilers.compiler.errorsReporter?.getErrors?.()` ([sA-cb] L18).
  - The public surface is the thrown `CompileError`: text grouped `"<file> Errors:"`, sorted by file, with unfiled errors under a bare `"Errors:"` ([er] L175–L219).
- **Through server-core.** `CompilerApi` is exported ([sc-index] L13), with `new CompilerApi(repository, dbType, options)` ([capi] L141).
  - `getCompilers()` compiles when the version changes ([capi] L216–L240).
  - `compileSchema` logs `Compiling schema completed` with `duration` ([capi] L257–L294).
  - `compileSchema` then calls `createQueryFactory`, which asks `dbType` for every cube's `data_source` ([capi] L296–L310). A bare `prepareCompiler` never does that.
  - `createCompilerInstances()` returns compilers without compiling ([capi] L242–L255).
  - `getSql(query)` is the planner path that `/v1/sql` uses ([capi] L355–L384).

### The phases

| Phase | Compilers | What it does | Source |
|---|---|---|---|
| 0 | `CubeDictionary` | Transpiles YAML to JS once (no symbols yet), then records names. Reports `Found duplicate cube name` and `Found conflicting cube and view name`. | [dsc] L495–L502, L513; [cd] L17–L33 |
| 1 | `CubeSymbols`, `CubeValidator`, `ViewCompilationGate` | Builds symbols and runs Joi validation of every cube and view. Reports member names `defined more than once`, and view includes that aren't defined. | [pc] L96; [dsc] L514; [cv] L1476–L1516; [cs] L571–L573, L909–L911 |
| 2 | view `CubeSymbols` | **Runs only if some view has an `access_policy`.** The code calls it "a significant performance penalty". xcube's generated policies (AD 4) will always trigger it. | [dsc] L515–L517; [vcg] L7–L23 |
| 3 | `CubeEvaluator`, `JoinGraph`; context, view-group and meta compilers | Evaluates member `sql` references, checks foreign-cube members, access-policy paths, folders and hierarchies, and builds join edges (target exists, primary key present, no duplicate join). | [pc] L103; [dsc] L518–L523; [cev] L221–L267, L805–L834; [jg] L64–L168 |

- Each phase's compilers are chained, with **one** `catch` at the end ([dsc] L224–L236).
  - A compiler that *throws* skips the rest of its chain. If `CubeEvaluator` throws, `JoinGraph` never runs.
  - `CubeEvaluator.compile` loops over cubes with no per-cube `try` ([cev] L233–L235). So a throw also skips every later cube.

### What the compile validates, and what it doesn't

| Checked at compile | Not checked at compile |
|---|---|
| YAML syntax. It aborts the compile ([yc] L90, no `try`; [dsc] L876 and L340, no `catch`) | Pre-aggregation member references: their functions aren't called at compile ([r-rr] Q3) |
| Duplicate cube, view and member names; unknown top-level YAML keys ([yc] L99–L120, L437–L443) | Rollup join paths, and `rollup_join`/`rollup_lambda` sources ([r-rjp] Q4) |
| The Joi schema of every cube and view ([cv] L1482–L1516) | Refresh-key cron shapes, index columns, build SQL ([r-rjp] Q5, "What it misses") |
| Member `sql` references: a name that doesn't resolve throws ([cev] L818, L1124–L1154; [cs] L1523, L1592) | `sql_table` and column existence, SQL validity, credentials |
| Foreign-cube members, and views defining their own members ([cev] L832, L837) | Whether a data source is reachable, or exists at all, in the bare `prepareCompiler` path |
| Join targets, primary keys, duplicate joins ([jg] L128–L210) | Whether a view's `join_path` follows real join edges (UNVERIFIED, [r-rjp] Q6) |
| Access-policy member paths ([cev] L362–L426) | Group names in policies (plain strings) |

### What needs a live database

- **Nothing in the compile, and nothing in planning.**
  - `prepareCompiler` takes only a repository ([pc] L61).
  - Server-core's `dbType` only reads `.type` from the `driverFactory` config, without connecting ([opts] L185–L207).
  - Spike A ran `/v1/sql`, a rollup-matched query included, with `driverFactory: () => ({ type: 'postgres', host: 'dummy.invalid' })` and no Cube Store ([sA-svb] L31, L71; [sA-s15] L1, L26–L28; [sA-readme] L13 "Needs no DB").
- **Correction to the brief.** Rollup join paths need Cube's *planner*, not a database (see Rollup gate).
- **`sql_table`, columns and SQL syntax** are checked only when SQL runs against the source. Neither compile nor `/v1/sql` does that (above). Whether "breaks" (AD 6) includes these is a question for the user (Open questions).

### Minimal checker call (sketch, not run)

```ts
import { prepareCompiler, type Compiler } from '@cubejs-backend/schema-compiler';
import type { FileContent } from '@cubejs-backend/shared';

type CubeError = { message: string; fileName?: string };
type Checked = { ok: true; compilers: Compiler } | { ok: false; errors: CubeError[]; aborted?: string };

export async function compileWhole(files: FileContent[]): Promise<Checked> {
  const compilers = prepareCompiler({ localPath: () => '/', dataSchemaFiles: async () => files },
    { standalone: true, allowNodeRequire: false });
  const inner = compilers.compiler as unknown as {
    errorsReporter?: { getErrors(): CubeError[] };          // private in 1.7.45 (DataSchemaCompiler L164)
    workerPool?: { terminate(): Promise<void> } | null;     // private (L174)
  };
  try {
    await compilers.compiler.compile();
    return { ok: true, compilers };
  } catch (e) {
    const errors = inner.errorsReporter?.getErrors() ?? [];
    // A YAMLException rejects before the list is thrown (YamlCompiler L90): no file, and nothing else reported.
    return { ok: false, errors, ...(e instanceof Error && e.name === 'YAMLException' ? { aborted: e.message } : {}) };
  } finally {
    await inner.workerPool?.terminate();   // the success path terminates it (L542-L544); an abort does not (Spike A lib.js L41 does this)
  }
}
```

## Cost

### Measured (Spike A, synthetic model, not wechart's)

**The model** ([sA-gen] L12–L141):
- 200 folders in a tree (10 roots, parent `floor(i/4)`), one YAML file per folder;
- per cube: 15 dimensions and 8 measures;
- joins: 1–3 per cube (in-folder, and to a parent-folder cube);
- access policies on every cube and view, with a row-level filter on every 4th cube;
- views: 20% as many as cubes, with join paths into the parent folder;
- a `day` rollup on every 10th cube, over **its own cube's members only**, so no rollup exercises a join.

**Where each run ran.**
- macOS host: the thread count was not recorded ([sA-rcm] L10).
- Linux: in Docker (`node:22-bookworm-slim`, `--cpus=8 -m 16g`), where `nproc` printed 12 ([sA-lxsh] L5–L9; [sA-lx] L1).

Spike A's matrix script, compile only ([sA-cm], [sA-lx]):

| Cubes + views (YAML) | Threads | macOS compile | macOS peak RSS | Heap after | Linux compile | Linux peak RSS | Linux RSS 10 s later |
|---|---|---|---|---|---|---|---|
| 1,000 + 200 (2.3 MB) | default | 3,085 ms | 2,695 MiB | 121 MiB | n/a | n/a | n/a |
| | 1 | 6,616 ms | 727 MiB | 121 MiB | n/a | n/a | n/a |
| | 2 | 4,197 ms | 925 MiB | 121 MiB | n/a | n/a | n/a |
| 3,000 + 600 (7.0 MB) | default | 7,094 ms | 3,583 MiB | 294 MiB | 10,929 ms | 3,262 MiB | 600 MiB |
| | 1 | 16,941 ms | 883 MiB | 293 MiB | 22,436 ms | 1,034 MiB | 369 MiB |
| | 2 | 12,141 ms | 1,545 MiB | 293 MiB | 13,229 ms | 984 MiB | 530 MiB |
| | 4 | n/a | n/a | n/a | 9,724 ms | 1,796 MiB | 423 MiB |
| 6,000 + 1,200 (13.9 MB) | default | 13,777 ms | 5,488 MiB | 533 MiB | 20,894 ms | 3,830 MiB | 980 MiB |
| | 1 | 38,673 ms | 1,365 MiB | 443 MiB | 46,707 ms | 1,204 MiB | 897 MiB |
| | 2 | 23,615 ms | 1,517 MiB | 486 MiB | 29,103 ms | 1,691 MiB | 593 MiB |
| | 4 | n/a | n/a | n/a | 20,190 ms | 2,540 MiB | 927 MiB |

Spike A through a real `CubejsServerCore` (Tesseract, default threads), using Cube's own `Compiling schema completed` duration ([sA-s5] L72–L77, [sA-s15] L72–L77, [sA-s30] L72–L77, [sA-s30t2] L72–L77, [sA-s30l] L73–L78):

| Cubes | First compile | Recompile after one file changed | Warm `/v1/sql` (simple/join/view) | `/v1/sql` for a rollup-matched query |
|---|---|---|---|---|
| 1,000 | 2,910 ms | 2,356 ms | 24–41 ms | 35 ms |
| 3,000 | 7,296 ms | 5,551 ms | 63–93 ms | 83 ms |
| 6,000 | 13,941 ms | 12,204 ms | 121–171 ms | 132 ms |
| 6,000, 2 threads | 22,715 ms | 22,283 ms | 128–273 ms | 150 ms |
| 6,000, JS planner | 13,464 ms | 12,499 ms | 89–106 ms | 104 ms |

Spike A's overlays (2 threads, all held in one process; [sA-rov] L4):

| Case | Result | Source |
|---|---|---|
| 3,000 cubes, 10 overlays in turn, each with its own caches | published 11.5 s; each overlay 10.5–11.1 s; +96 MiB heap per resident overlay | [sA-ov3] L1 |
| The same, with shared YAML/script/Jinja caches | overlays 8.8–9.2 s (two outliers of 15.1 and 16.0 s); +87 MiB each | [sA-ov3s] L1 |
| 3,000 cubes, 5 overlays in parallel | 22.9 s wall for all five; peak RSS 4,883 MiB | [sA-ov3p] L1 |
| 6,000 cubes, in turn, shared caches | published 22.5 s; overlays 17.0–17.9 s (one outlier of 31.4 s); +182 MiB each | [sA-ov6s] L1 |
| 6,000 cubes, 5 in parallel, shared caches | 35.4 s wall; peak RSS 5,400 MiB | [sA-ov6p] L1 |
| Dependency-closure compile (changed items plus a dashboard's cubes and everything they reference) | 205–313 ms at 1k cubes, 245–875 ms at 6k. Generated SQL identical to the full model's for all 8 queries. Indexing every file took 505 ms at 1k and 3,157 ms at 6k | [sA-cl5] L5–L63; [sA-cl30] L5–L63 |

**External evidence**
- Cube's docs: compilation "might take from a few milliseconds to a few seconds", depending on "the number of cubes, views, and their members" ([d-warm] L38–L40).
- Cube's docs put a compiled model's footprint at "single-digit MBs on the lower end and dozens of MBs on the higher end" ([d-mt] L202–L209).
  - Spike A's 121–533 MiB heap per model shows that figure doesn't describe models of this size.
- **PR #11995** is in 1.7.45: merged 2026-09-25T02:47Z ([pr]; GitHub API). The published 1.7.45 build contains its validator cache ([npm-cv] L1159).
  - It added a process-wide validator cache, memoised meta names, a YAML fast path and bulk worker transpilation.
  - Its benchmark: "100 distinct cubes × 100 members, multiplied to 100k members". The YAML case went from 26.9 s to 4.4 s.
  - These figures were read through a summarising fetch of the PR page and API. The table wasn't copied verbatim.
- **Issue #8318** (open since 2024-06-03): "it appears to be a full compilation every time" as model files grow. It asks whether incremental compilation is possible. The fetch showed no maintainer reply ([i8318]).

### What the numbers mean for AD 9 (inference)

- **Compile time.** 100–200 folders × 5–20 cubes is 500–4,000 cubes, inside the measured range.
  - Linear interpolation of the macOS default-thread column gives about 1.5–2 s at 500 cubes and about 9.3 s at 4,000.
  - Measure wechart's real cube shape rather than trusting this.
- **Memory.**
  - A resident compiled model holds roughly 90 MiB of heap per 1,000 cubes (121/294/533 MiB).
  - Transpile workers add transient RSS in proportion to their count. Default threads peaked 2–4× higher than 1–2 threads.
  - The default is workerpool's CPUs − 1 ([dsc] L295–L300; [env] L376–L378; [wp] "maxWorkers"). A CPU quota did not reduce the CPU count seen (`nproc` 12 under `--cpus=8`, [sA-lx] L1).
  - So in a memory-limited pod, set `CUBEJS_TRANSPILATION_WORKER_THREADS_COUNT` explicitly.
- **macOS RSS is not the container's.** After the same compile, RSS stayed at 2.5–5.2 GiB on macOS but fell to 0.4–1.0 GiB on Linux ([sA-cm] vs [sA-lx]). Size pods from Linux runs.

### Incremental or cached?

- **There is no incremental compile.** Every compile re-reads all files and runs all phases over them ([dsc] L256–L279, L513–L523). Issue #8318 asks for incremental compilation and is still open.
  - The `filesToCompile` option restricts the file list ([dsc] L71, L207, L265–L267). Any reference to a file outside the list then fails, so it is a subset compile, not an incremental one.
- **What does carry across compiles:**
  - **Transpiled YAML**, keyed by the md5 of the file's content ([dsc] L835–L884). In phase 0 no symbols exist yet, so the output depends on the file alone ([dsc] L495–L500; inference).
  - **`vm.Script`s**, keyed by content ([dsc] L979–L989).
  - **Rendered Jinja** ([dsc] L886–L916).
  - **A process-wide LRU of 50,000 fingerprints of definitions that passed Joi** ([cv] L1463–L1496). "Failures are always validated again".
- **Where those caches live.**
  - In `CompilerApi` the three transpile LRUs belong to each instance ([capi] L162–L176). A new app id starts cold.
  - A checker can pass shared LRUs in ([pc] L40–L42).
  - Spike A's gain from sharing them was about 10.7 s → 8.9 s at 3k cubes ([sA-ov3] vs [sA-ov3s]).
  - The caches don't touch the evaluation or join phases.
- **A shared YAML cache hides errors** (see Gotchas, "The transpile cache replays").

### What one publish costs in total (arithmetic on the numbers above)

| Step | Compiles | Source |
|---|---|---|
| Proposal: overlay check | 1 | AC-321 |
| Approval: check again | 1 | AC-321 (R27) |
| Landing: every Cube process switches version and compiles again (≥2 API instances plus the refresh worker, AD 11) | ≥3, in parallel across processes | [capi] L231–L237 |
| Rollup gate on the affected rollups | planner calls, not compiles | Rollup gate |

**The landing stall.** When the version changes, `getCompilers` replaces the compile promise, and every request on that instance awaits the new compile ([capi] L231–L239). No last-good model is served meanwhile. Spike A's first query after a one-file change took:

| Cubes | First query after the change |
|---|---|
| 1,000 | 2.4 s |
| 3,000 | 5.7 s |
| 6,000 | 12.4 s |

Sources: [sA-s5] L56–L57, [sA-s15] L56–L57, [sA-s30] L56–L57.

- M3/S2 require dashboards under 3 s at p95 (`requirements.md` L49, L425). Beyond about 1,000 cubes, every dashboard opened on an instance during that window misses it.
- **Mitigation (design inference, UNVERIFIED): compile first, then switch.**
  - Put the model version in the app id.
  - Have each instance compile the new app id before its version pointer flips.
  - Keep `compilerCacheSize` ≥ 2 ([env] L329–L332).
  - Memory holds two models while both are resident: 1,015 MiB heap at 6k cubes, against 777 MiB after eviction ([sA-s30] L62–L71).
- **The compile also blocks its host (inference).** The evaluator and script-run phases are synchronous on the main thread ([cev] L233–L235; [dsc] L1012–L1014). A check that runs inside a query-serving Cube process stalls that process's queries. Run checks in a process that serves no queries.

### Probe design (not run)

**Where it runs:** docker-desktop, image `cubejs/cube:v1.7.45` (linux/arm64). Run it under the xcube pod's limits, not on the macOS host, because RSS behaves differently there.
- The pod size isn't decided. Run two points: 2 CPU / 4 GiB and 4 CPU / 8 GiB.

**What to generate** (a fork of Spike A's `gen.js`, reshaped to wechart's model):
1. Folders F ∈ {100, 150, 200}, in a tree at least four deep, as in `gen.js` L12–L22. Cubes per folder k ∈ {5, 10, 20}: from 500 to 4,000 cubes.
2. Names prefixed by folder id, with root cubes unprefixed (AC-328).
   - One file per wechart model item.
   - Two variants, 1 and 5 cubes per file, because file count changes worker chunking and cache hits ([dsc] L702–L748).
3. Joins as in `gen.js` L26–L31, plus 10% of cubes joining a grandparent-folder cube.
4. Views at 20% of cubes, with `join_path`s into parent folders.
5. xcube-style generated access policies on every cube and view, so phase 2 runs.
6. Rollups on 10% of cubes. Half of them name a joined ancestor cube's dimension, so the join gate is exercised. Add a few `rollup_join`s.
7. Multi-stage quick-calculation measures on 5% of measures.
8. One `data_source` per top-level folder.

**Scenarios, as candidate models against a published head:**
- (a) edit one cube in a leaf folder;
- (b) edit one cube in a top folder with many dependents;
- (c) delete a cube referenced from n descendant folders;
- (d) rename a member that rollups in 3 other folders use;
- (e) remove a join a rollup elsewhere needs;
- (f) a YAML syntax error;
- (g) k independent breaks injected in k folders;
- (h) two approvals at once, on overlapping and on disjoint folders.

**What to time:**
- T1: cold whole-model compile in a fresh process, plus Cube's `Compiling schema completed.duration`.
- T2: warm check compile in the same process, with the validator cache warm, with and without shared transpile caches.
- T3: time to refusal for (c)–(g). Record how many of the k injected breaks Cube's list names (completeness), and which carry a file.
- T4: the rollup gate.
  - Owners O, gated in-process with `CompilerApi.getSql` per owner, over the full set and over the affected set.
  - For comparison, HTTP `/v1/sql`.
  - Per-rollup attribution with `joinGraph.buildJoin`.
- T5: build and update the reference index. Look up reverse dependencies.
- T6: closure compile per affected folder, and whether its error text equals the full compile's.
- T7: from commit to every Cube instance (2 API plus the worker) serving the new version. The first-query stall on each instance, with and without compile-then-switch. Event-loop lag on a serving instance while a check compiles.
- T8: peak RSS and heap of the checker with 1, 2 and 5 concurrent overlay checks, and heap per resident overlay (AD 8).
- T9: `CUBEJS_TRANSPILATION_WORKER_THREADS_COUNT` ∈ {1, 2, 4, unset} × `CUBEJS_TRANSPILATION_NATIVE` ∈ {false, true}. Native was never measured by Spike A ([sA-cm] `"native":"false"`).

**The budget is the user's to set.**
- No requirement bounds how long a publish takes. §P2.3 has S1–S3, and Part 1 has M1–M4 (`requirements.md` L47–L50, L420–L429).
- The one existing anchor is M3/S2, 3 s p95 for dashboards, and it applies to the landing stall T7.
- The probe should report T1–T9 so the user can choose limits for proposal-time and approval-time checks, and a memory limit for the checker.

## Error attribution

### Which errors carry a file and a line

| Error kind | `fileName` in `getErrors()` | Grouped under the file in the text | Line | Source |
|---|---|---|---|---|
| YAML syntax (`YAMLException`) | none; it isn't in the list | not a list: the compile rejects with it | `(line:col)` and a snippet, in the message | [yc] L90; [dsc] L340, L876; [r-spike] §1a L87 |
| YAML transpile: duplicate names, unknown key, "must be defined as array", Python parse failure, missing `name` | **yes** | yes | no | [dsc] L876–L878; [tw] L74–L90; [yc] L99–L120, L372–L377, L425–L448 |
| Duplicate cube/view name across files (phase 0) | no | no | no | [cd] L21–L29 |
| Joi, `CubeSymbols`, `JoinGraph` edge errors | no. The message is prefixed `"<cube> cube: "`: `inContext` children have no file ([er] L44, L141–L142, L155–L157) | no | no | [cv] L1478; [cs] L328; [jg] L74 |
| Duplicate joins to one cube | **yes** (`cube.fileName`) | yes | no | [jg] L198–L205 |
| `CubeEvaluator` reported errors | no, and no prefix (the root reporter is passed, [cev] L234). Most texts name the cube; some (`Member 'x' included in folder 'f' not found`) don't | no | no | [cev] L297–L500 |
| Thrown during a phase: `ReferenceError x is not defined`, `UserError … cannot be resolved` | no file, no prefix. Stops that phase for the rest | bare `Errors:` | no | [dsc] L224–L236; [cev] L233–L235, L1124–L1154; [cs] L1523, L1592 |
| JS syntax (wechart publishes no JS) | yes | yes | Babel code frame | [er] L108–L138 |

- **No compiler call passes `lineNumber`.** `error()` accepts it ([er] L140), but no caller in `schema-compiler/src` supplies one (search for `lineNumber`).
- **Every cube records its `fileName`** ([dsc] L405, L415), and `CubeEvaluator.byFileName` groups them ([cev] L237). So a cube name maps to a file even where the error has none.

### When one file breaks another's reference

Derived from the code; each row is for probe T3 to confirm. B is the changed file (folder Y); A is an unchanged file (folder X) that depends on it.

| B's change | What A's break looks like in Cube | Names the referrer? | Stops later errors? | Source |
|---|---|---|---|---|
| Deletes a cube that A **joins** | `"<A cube> cube: Cube <B cube> doesn't exist"` | yes, by prefix | no (reported) | [jg] L74, L138–L139 |
| Removes a member that A's **view includes** | `"<A view> cube: Member '<m>' is included in '<A view>' but not defined in any cube"` | yes | no | [cs] L909–L911 |
| Deletes or renames a cube or member that A's **member `sql`** references | `"<B cube>.<m> cube cannot be resolved. There's no such member or cube."`, or V8's `"<B cube> is not defined"` | **no**: names B's missing target | **yes**: aborts `CubeEvaluator` and skips `JoinGraph` | [cev] L818, L1124–L1154; [cs] L1523, L1592; [dsc] L224–L236 |
| (Observed at v1.7.42) an undefined name | `"Compile errors:\nErrors:\nno_such_member is not defined"` | no | n/a | [r-spike] §1a L86 |
| Removes a member or join that A's **rollup** needs | **the compile passes**; only the rollup gate or a query fails | n/a | n/a | [r-rr] Q3; [r-rjp] Q4 |
| Deletes a data source A's cubes name | bare `prepareCompiler` passes. Through `CompilerApi` it fails in `createQueryFactory` if the `driverFactory` throws for an unknown name, as a plain `Error`, not a `CompileError` | no | yes | [capi] L296–L310; [opts] L185–L207 |
| A chart or dashboard (a wechart item) bound to a deleted cube | **nothing**: it isn't in Cube's model | n/a | n/a | AD 1 |

### Why Cube's list can't be the count AC-322 needs

1. **Thrown errors stop the phase.** A second, third or n-th referrer never appears.
2. **A YAML syntax error aborts the whole compile**, so nothing else is reported.
3. **Identical texts collapse.** `error()` drops a message already recorded, whatever its file ([er] L143–L145). The transpile worker's reporter does the same across the files of one compile ([tw] L27, L38–L41).
4. **A shared YAML cache replays results without their errors** (Gotchas).
5. **Thrown reference errors name the missing thing, not the file that breaks.**
   - wechart's current attribution (`validate.ts`) puts an unfiled error on the *changed* file holding the name, or on every changed file ([w-val] L37–L45, L82).
   - That assumed "the live model compiled, so a draft's error is in what the draft changed" ([w-val] L10–L12).
   - Under AD 6 the broken file is usually an unchanged one elsewhere. So that attribution names the wrong file, and misses the breaks.

### Attribution design (derived; xcube builds it, UNVERIFIED)

1. **Name generated files after their item.** xcube's generated files should be named by folder id and item id, so any `fileName` and any cube name map straight back to a wechart item and folder.
   - Keep an explicit name→folder map rather than parsing prefixes. A root cube is unprefixed (AC-328).
2. **Parse every file first.** Parse each changed and generated file's YAML before compiling, and attribute syntax errors per file, since Cube would abort on the first.
3. **Compile the whole candidate.** If it passes, go on to the rollup gate. If it fails:
   - **Filed errors:** map each to its item (by `fileName`, or by the cube prefix).
   - **Everything else:** compute the reverse-dependency closure of every added, changed, removed or rebound name over a **reference index**. That is joins, view `join_path`s, `extends`, `{cube.member}` references, rollup references and data sources. Spike A's `closure.js` builds the forward version from YAML ([sA-clo] L8–L58).
   - **Cube's own text for each affected folder:** compile that folder's items plus their forward closure (0.2–0.9 s each, [sA-cl5], [sA-cl30]). Spike A verified the closure compile's SQL, not its error text (probe T6).
4. **Return and split.** xcube returns every break with its folder id and Cube's text. wechart, which owns permissions (AD 1), names the ones in folders the user may see, counts the rest, and audits all of them (AC-322).
5. **Charts and dashboards** bound to removed or renamed names come from wechart's own binding index. Cube cannot report them.

**Where hidden breaks come from (inference from R27, to confirm with the user).**
- Binding is path-only ("Children's items are never used", `requirements.md` L545, L548). Grants reach every descendant (L399).
- So a change in folder X can only break items in X's subtree, all of which X's read-write members can see.
- A non-zero "n items in folders you can't see" then comes mainly from breaks that already exist elsewhere. Examples: after a Cube upgrade, or content that predates AD 6. The count is still needed for those.

**Error text shows prefixed names.** Cube's messages carry prefixed names. R27 says "the prefixed name shows only in YAML and SQL" (`requirements.md` L549), while AC-322 asks for "Cube's error". How to show one without the other is the user's call (Open questions).

## Rollup gate

### It needs no live data source, and no Cube Store

- `/v1/sql` builds SQL and pre-aggregation descriptions and executes nothing ([capi] L355–L384; [r-rjp] Q5).
- `dbType` comes from the `driverFactory` config without connecting ([opts] L185–L207).
- Observed: Spike A's server ran against `host: 'dummy.invalid'` with no Cube Store. A rollup-matched `/v1/sql` returned `preaggUsed: ["ops_3__billing_12__orders_0.daily"]` ([sA-svb] L31, L71, L82; [sA-s15] L1, L26–L28).
- Spike A's rollups never joined, so join-path failures were not exercised (probe T4).

### Every rollup, or only the ones the change touches

- **What Cube compiles.**
  - Tesseract compiles **every** pre-aggregation of each cube in a query's plan before matching. So one `getSql` per owning cube compiles all of that cube's rollups, join trees included ([r-rjp] Q4, Q5).
  - It stops at the first failure on that cube, and its text names cubes, not the rollup.
  - Per-rollup attribution uses the rule in [r-rjp] "The rule wechart would implement". Or call `joinGraph.buildJoin(hints)` directly on the checked compile: it is the same function Tesseract calls back into, and it is memoised by hint list ([jg] L223–L260; [r-rjp] finding 2).
- **Only the affected rollups need it (inference).** Joinability depends only on the model (joins, members, views). AD 6 means the published head never holds a failing rollup.
  - So a rollup can start failing only if its dependency closure contains a changed, removed or rebound name.
  - That affected set is: rollups whose owning cube's forward closure intersects the change, which is the reverse closure of the change.
  - It includes rollups in *unchanged* files that reference a changed file's members or joins.
  - Under path-only binding it lies within the changed folder's subtree.
- **Run the full gate at bootstrap, at every Cube upgrade, and as an audit.** Its result depends on Cube's planner version and on `CUBEJS_TESSERACT_SQL_PLANNER`: Tesseract and the JS planner differ in hint order and multi-fact handling ([r-rjp] Q2; [env] reference in [r-rjp]).
- **`rollup-join-paths.md` Gotcha 2 ("refuse only new failures") is superseded by AD 6.** Its implementation probes each owner twice, under the draft and under the live model ([w-pub] L285–L296). The second probe can go.

### Cost

- **Full gate over HTTP, one call after another,** at Spike A's 10% owner rate: owners × per-call time.
  - 1k cubes: about 100 × 35 ms ≈ **3.5 s**;
  - 3k cubes: 300 × 83 ms ≈ **25 s**;
  - 6k cubes: 600 × 132 ms ≈ **79 s**.

  (Arithmetic on [sA-s5] L36, [sA-s15] L36, [sA-s30] L36.)
- **Why HTTP costs this much.** A *repeated* identical `/v1/sql`, a planner-cache hit, still took 24/63/130 ms ([sA-s5] L30, [sA-s15] L30, [sA-s30] L30). Each response carried a `canUseTransformedQuery` field of 1.8/5.4/10.9 MB ([sA-s5] L19, [sA-s15] L19, [sA-s30] L19).
  - So transport and serialisation, which grow with the model, dominate (inference).
  - Why that field is so large is UNVERIFIED.
- **In-process.** `CompilerApi.getSql` (or `queryClass` plus `buildSqlAndParams`) on the checked compile avoids that. Spike A's in-process planning took 3 ms at 1k and 11 ms at 6k per query ([sA-cl5] L66, [sA-cl30] L66). Those queries hit no rollup-owning cube, so rollup compile time in-process is UNVERIFIED (T4).
- **The affected-set gate** for a leaf-folder change covers the few owners in that subtree (inference).

### Order inside a publish (derived)

1. Parse YAML per file.
2. Bind names and generate access policies (xcube, AD 3–AD 5).
3. Compile the whole candidate through a `CompilerApi` that the checker constructs itself, outside the server's LRU.
   - That path matches the servers, including per-data-source `dbType` ([capi] L296–L310).
   - To keep the error list, a subclass can override `compileSchema` (public, [capi] L257) to hold on to the `Compiler` handle.
4. If the compile fails, attribute as above.
5. Run the rollup gate on the affected owners, in-process, and attribute each failing rollup with `buildJoin`.
6. Run wechart's binding check for charts and dashboards.
7. Land by compare-and-swap (Gotchas).

The checker must run the same `@cubejs-backend/*` build and the same planner and transpiler environment as the serving Cube instances.

## Gotchas

### Two publishes at once (question 5)

**Cube facts**
- **The version and the files are read at different moments.** `getCompilers` reads `schemaVersion()` first ([capi] L217–L220); the files are read later, inside the compile ([dsc] L256).
  - Spike C's `cube.js` reads one module-level `version` for both ([sC-cube] L90–L102).
  - A switch between the two reads compiles new files under the old label. The next request sees the new version and compiles again (inference).
  - So the repository must serve **immutable snapshots addressed by the version it reports**.
- **No fallback.** A failed compile resets the compile promise, and every request fails until a good model is published ([capi] L231–L235; observed in [r-spike] §1 L55).
- **Instances switch independently.** Spike C, with 2 API instances and a worker, switching on Postgres `LISTEN/NOTIFY`:
  - 233–407 ms to switch, with ≤29 ms skew;
  - 2.0–4.7 s through the 5-s re-sync poll alone, with up to 1.26 s skew ([sC-t5] L3–L12; [sC-t5w] L4–L12).
  - During that skew, instances serve different versions (inference).

**What xcube needs (design, derived; xcube's store isn't chosen yet)**
- **What a check result is valid for.** It holds only for the triple (base head version, candidate snapshot hash, Cube build and planner configuration). Any intervening land invalidates it: B+Δ passing and B+Δ′ passing does not make B+Δ+Δ′ pass.
- **Landing an approval or a direct change** (AC-288, AC-291) is one serialised step per deployment:
  1. take the land lock, or read the head for compare-and-swap;
  2. rebind against that head (AC-275);
  3. compile, and run the gate;
  4. commit head n → n+1, only if the head is still n;
  5. release, then tell the Cube instances.

  On a lost compare-and-swap, re-check. With more than one xcube replica, the lock or the version row must live in shared storage.
- **Proposal-time overlay checks** (AC-321, AD 8) may run concurrently, stamped with the base they saw. They are advisory; the approval check decides.
  - Bound their concurrency by memory: 5 parallel 3k-cube compiles peaked at 4.9 GiB RSS ([sA-ov3p]).
- **On wechart's side,** the proposal carries a content version. An approval approves the content that was checked; an edit after the check forces a new check.
- **Throughput.** Lands are serialised, so throughput is at most one per (compile + gate) time. That is roughly 1 per 3–4 s at 1k cubes and 1 per 7–9 s at 3k (arithmetic on the tables above). Conflicts cost repeat compiles.
- **Reusing a check.** A proposal-time result can be reused at approval when the triple is unchanged, because the compile is deterministic with no Jinja, JS or `COMPILE_CONTEXT`. R27 says "again at approval", so whether reuse counts as checking again is the user's call.
- **The phase-1 race.** Phase 1's publish reads `live` (L208), checks `live + changed`, then writes only `changed` (L322) ([w-pub]). A publish landing between those steps yields a model that was never compiled. The phase-1 note accepted overwrites for now. AD 6 now requires that what lands is exactly what was checked.

### Other gotchas

1. **The transpile cache replays without errors.**
   - `transpileYamlFile` caches its output even when the transpile reported errors, and a cache hit returns content without re-adding them ([dsc] L840–L846, L876–L882).
   - So a second compile of the same content in the same `CompilerApi`, or with a shared cache, would not report duplicate members, unknown keys or Python-parse failures. Duplicates merge last-wins ([yc] L483).
   - This is inference from code and UNVERIFIED. Probe: publish a duplicate member, then call `/v1/meta` twice.
   - A checker that shares caches must evict the content hashes of files that produced errors, or use fresh YAML caches.
2. **A YAML syntax error hides everything else, and leaks transpile workers**, since `workerPool.terminate()` runs only on the success path ([dsc] L524–L545; Spike A terminates it itself, [sA-lib] L41).
3. **Structured errors are private API** (`errorsReporter`, `workerPool`). Pin 1.7.45 and cover them with a test that fails on upgrade.
4. **Phase 2 always runs** once xcube generates policies on views. Its cost is in Spike A's numbers, because `gen.js` puts policies on views (L121–L124).
5. **The default thread count follows the node's CPUs, not the pod's limit.** Peak RSS scales with it. Set `CUBEJS_TRANSPILATION_WORKER_THREADS_COUNT` in xcube and in the Cube pods.
6. **Pre-existing breaks block every publish.** Under AD 6 ("anything, anywhere"), a break already in the model refuses every unrelated publish until someone fixes it.
   - Examples: phase-1 content with a failing rollup, which Gotcha 2 used to tolerate; or a new validation rule after a Cube upgrade (PR #11995 reordered Joi alternatives, [pr]).
   - Run the full check and full gate before enabling AD 6 and before each Cube upgrade.
7. **Charts and dashboards aren't in Cube's model.** AC-275's refusal of a delete that others depend on needs wechart's binding check (inference from AD 1).
8. **Checker and servers must agree.** A standalone checker throws on `COMPILE_CONTEXT` where the servers don't ([dsc] L1029–L1035; [srv] L223–L226). A different `CUBEJS_TESSERACT_SQL_PLANNER` changes rollup join results ([r-rjp] Q2).
9. **Overlays stay resident.** An overlay kept queryable (AD 8) holds about 87–182 MiB of heap at 3k–6k cubes ([sA-ov3s], [sA-ov6s]). Check memory grows with the number of live overlays.

## Open questions / unverified

1. **The budget.** No requirement sets a publish-time or checker-memory budget. The user picks them after probe T1–T9. M3/S2 (3 s p95) is the only anchor, for the landing stall.
2. **Does "breaks" include SQL against the source?** That is `sql_table` and column existence, which only a live query can test. It would make publishes depend on warehouse availability.
3. **Reusing a proposal-time result at approval** when (base, candidate, Cube build) is unchanged: does R27's "again at approval" allow it?
4. **How to show Cube's error text** (prefixed names) alongside R27's rule that prefixed names show only in YAML and SQL.
5. **Do permission changes count?** They alter xcube's generated policies. Should they go through the whole-model check? R27 lists renames, moves and deletes only.
6. **Where xcube runs the check** (a process that serves no queries?) and where the land lock or version row lives with more than one xcube replica.
7. **UNVERIFIED (probe):**
   - the error texts and completeness in the cross-file table (T3);
   - the YAML-cache error replay (Gotcha 1);
   - in-process rollup-gate cost (T4);
   - whether closure compiles reproduce the full compile's error text (T6);
   - native transpilation's speed and error attribution (T9);
   - why `/v1/sql` returns a multi-MB `canUseTransformedQuery`;
   - compile-then-switch (T7);
   - whether Node's `os.cpus()` inside a pod reports host CPUs (only `nproc` was seen);
   - Spike A's host CPU count;
   - wechart's real cube shape against the synthetic one.
8. **The PR #11995 benchmark** was read through a summarising fetch, not quoted verbatim.

[pc]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/PrepareCompiler.ts
[dsc]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/DataSchemaCompiler.ts
[er]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/ErrorReporter.ts
[ce]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CompileError.ts
[yc]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/YamlCompiler.ts
[tw]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/transpilers/transpiler_worker.ts
[cv]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts
[cs]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts
[cev]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts
[jg]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/JoinGraph.ts
[cd]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeDictionary.ts
[vcg]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/ViewCompilationGate.ts
[capi]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/CompilerApi.ts
[srv]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts
[opts]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OptsHandler.ts
[sc-index]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/index.ts
[env]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/env.ts
[fr]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/FileRepository.ts
[d-warm]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/admin/deployment/warm-up.mdx
[d-mt]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/embedding/multitenancy.mdx
[pr]: https://github.com/cube-js/cube/pull/11995
[i8318]: https://github.com/cube-js/cube/issues/8318
[wp]: https://github.com/josdejong/workerpool#pool
[npm-pkg]: /Users/srajagopal/Work/bi/cube/cube-introspection/node_modules/@cubejs-backend/schema-compiler/package.json
[npm-cv]: /Users/srajagopal/Work/bi/cube/cube-introspection/node_modules/@cubejs-backend/schema-compiler/dist/src/compiler/CubeValidator.js
[sA-readme]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/README.md
[sA-gen]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/gen.js
[sA-lib]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/lib.js
[sA-cb]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/compile-bench.js
[sA-rcm]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/run-compile-matrix.sh
[sA-cm]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/compile-matrix.jsonl
[sA-lxsh]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/linux-compile.sh
[sA-lx]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/linux-compile.jsonl
[sA-svb]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/server-bench.js
[sA-s5]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/server-200x5.json
[sA-s15]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/server-200x15.json
[sA-s30]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/server-200x30.json
[sA-s30t2]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/server-200x30-t2.json
[sA-s30l]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/server-200x30-legacy.json
[sA-rov]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/run-overlay.sh
[sA-ov3]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/overlay-3000-seq10.json
[sA-ov3s]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/overlay-3000-seq10-shared.json
[sA-ov3p]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/overlay-3000-par5.json
[sA-ov6s]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/overlay-6000-seq10-shared.json
[sA-ov6p]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/overlay-6000-par5-shared.json
[sA-cl5]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/closure-200x5.json
[sA-cl30]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/results/closure-200x30.json
[sA-clo]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/a-scale/closure.js
[sC-cube]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/conf/cube.js
[sC-t5]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/out/t5-version.txt
[sC-t5w]: /Users/srajagopal/Work/bi/cube/cube-introspection/spikes/c-multi-instance/out/t5-version-with-worker.txt
[r-rjp]: /Users/srajagopal/Work/wechart/docs/research/cube/rollup-join-paths.md
[r-rr]: /Users/srajagopal/Work/wechart/docs/research/cube/rollup-references.md
[r-spike]: /Users/srajagopal/Work/wechart/docs/research/cube/spike-model-store-and-quick-calcs.md
[w-pub]: /Users/srajagopal/Work/wechart/packages/api/src/model/publish.ts
[w-val]: /Users/srajagopal/Work/wechart/packages/api/src/model/validate.ts
