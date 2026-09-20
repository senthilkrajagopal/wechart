---
library: wechart front-end toolchain (pnpm workspaces, TypeScript, Vite, React)
packages: [react, react-dom, vite, '@vitejs/plugin-react', typescript, pnpm]
version: 'pnpm 12.5.1; typescript 7.0.2; vite 8.3.0; @vitejs/plugin-react 6.1.1; react 19.3.0; react-dom 19.3.0'
researched: 2026-09-19
sources:
  [
    https://registry.npmjs.org/pnpm/latest,
    https://registry.npmjs.org/typescript/7.0.2,
    https://registry.npmjs.org/vite/latest,
    https://registry.npmjs.org/react/latest,
    https://registry.npmjs.org/react-dom/latest,
    https://registry.npmjs.org/@vitejs/plugin-react/latest,
    https://github.com/microsoft/TypeScript/releases,
    https://nodejs.org/en/about/previous-releases,
    https://github.com/nodejs/Release,
    https://devblogs.microsoft.com/typescript/announcing-typescript-native-previews/,
    https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/,
    https://www.typescriptlang.org/tsconfig/,
    https://www.typescriptlang.org/docs/handbook/project-references.html,
    https://pnpm.io/workspaces,
    https://pnpm.io/filtering,
    https://pnpm.io/pnpm-workspace_yaml,
    https://pnpm.io/installation,
    https://vite.dev/guide/,
    https://vite.dev/config/server-options.html,
    https://vite.dev/guide/env-and-mode,
    https://vite.dev/guide/build.html,
    https://vite.dev/config/build-options.html,
    https://vite.dev/blog/announcing-vite8.html,
    https://react.dev/reference/react/useSyncExternalStore,
    https://react.dev/reference/react/StrictMode,
    https://react.dev/learn/manipulating-the-dom-with-refs,
    https://react.dev/blog/2024/12/05/react-19,
    https://github.com/hustcc/echarts-for-react,
    https://echarts.apache.org/handbook/en/basics/import,
    https://github.com/vitejs/vite-plugin-react,
  ]
---

# wechart front-end toolchain — pnpm 12.5.1 / TypeScript 7.0.2 / Vite 8.3.0 / React 19.3.0

## Summary

Toolchain for the `apps/web` (React SPA) and `apps/api` packages plus shared `packages/*`, decided in `CLAUDE.md`. Covers routing/reload persistence (AC-002), cross-browser support (AC-180), and the per-package `test`/`typecheck` script contract. All versions below are the exact `latest` dist-tag on npm as of 2026-09-19 ([pnpm](https://registry.npmjs.org/pnpm/latest), [typescript](https://registry.npmjs.org/typescript/7.0.2), [vite](https://registry.npmjs.org/vite/latest), [react](https://registry.npmjs.org/react/latest), [react-dom](https://registry.npmjs.org/react-dom/latest), [@vitejs/plugin-react](https://registry.npmjs.org/@vitejs/plugin-react/latest)).

**Node 26 fit**: pnpm requires Node `>=18` (npm registry engines field); Vite 8 requires Node `^20.19.0 || >=22.12.0` ([Vite 8 announcement](https://vite.dev/blog/announcing-vite8.html)); TypeScript 7.0.2 requires Node `>=16.20.0` (npm registry engines field). Node 26 satisfies all three. Node 26 itself is currently the **Current** release, not yet LTS — it enters Active LTS on 2026-10-28 per the [Node.js Release schedule](https://github.com/nodejs/Release); this doesn't block using it, but pin Node 26.x exactly and re-check the schedule near GA of the LTS line.

## Install

```bash
corepack enable
# pin pnpm exactly via package.json "packageManager" field; `pnpm self-update` then only updates that pin
# https://pnpm.io/installation
echo '{ "packageManager": "pnpm@12.5.1" }' # illustrative; set in root package.json, not via shell
pnpm create vite@latest apps/web -- --template react-ts   # https://vite.dev/guide/
pnpm add react@19.3.0 react-dom@19.3.0 -w --filter web
pnpm add -D typescript@7.0.2 vite@8.3.0 @vitejs/plugin-react@6.1.1 --filter web
```

`@vitejs/plugin-react@6.1.1` peer-requires `vite@^8.0.0` (npm registry `peerDependencies`), matching the pinned Vite 8.3.0. It also has optional peers `oxc-transform-react`, `@rolldown/plugin-babel`, `babel-plugin-react-compiler` — Babel-based Fast Refresh is the default; oxc/Rolldown are opt-in ([@vitejs/plugin-react README](https://github.com/vitejs/vite-plugin-react)).

## Init / auth pattern

**pnpm workspace** (`pnpm-workspace.yaml` at repo root — pnpm no longer reads `package.json#workspaces`, and warns if you rely on it, [pnpm-workspace.yaml docs](https://pnpm.io/pnpm-workspace_yaml)):

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

Internal deps use the `workspace:` protocol, e.g. `"@wechart/ui": "workspace:*"` in `apps/web/package.json`; pnpm fails install if the local package isn't present, and rewrites the range to a real semver on publish ([pnpm workspaces docs](https://pnpm.io/workspaces)).

**Running per-package `test`/`typecheck` from root** (required by `CLAUDE.md` hooks), via `--filter` ([pnpm filtering docs](https://pnpm.io/filtering)):

```bash
pnpm --filter web test
pnpm --filter "./apps/*" typecheck     # all apps
pnpm -r run typecheck                  # every workspace package (recursive)
```

**Vite React scaffold** — `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } } },
});
```

`server.proxy` maps `/api/*` dev requests to the local `apps/api` server ([Vite server options](https://vite.dev/config/server-options.html)).

## API surface we will use

- **`pnpm --filter <selector> <script>`**: selector matches by name, glob, or graph relation (`foo...` = foo + deps, `...foo` = foo + dependents); combine multiple `--filter` flags, union semantics ([pnpm filtering](https://pnpm.io/filtering)).
- **`server.proxy`** (Vite): `{ [pathPrefix]: string | { target, changeOrigin, rewrite, ws } }` ([Vite server options](https://vite.dev/config/server-options.html)).
- **`import.meta.env`**: only `VITE_`-prefixed vars from `.env`/`.env.local`/`.env.[mode].local` reach client code; built-ins `MODE`, `DEV`, `PROD`, `BASE_URL`, `SSR` ([Vite env docs](https://vite.dev/guide/env-and-mode)).
- **`build.target`**: defaults to `'baseline-widely-available'`, resolved per Vite major release date (currently → Chrome 111, Edge 111, Firefox 114, Safari 16.4 as a floor) ([Vite build options](https://vite.dev/config/build-options.html)). This already covers AC-180's "current Chrome/Edge/Firefox/Safari" since it's a compatibility floor, not a ceiling; since AC-180 doesn't require legacy support, consider `build.target: 'esnext'` for smaller/faster bundles — a performance decision, not an effort one.
- **Code splitting**: automatic per dynamic `import()`; for Rolldown-based Vite 8, custom chunking goes through `build.rolldownOptions.output` ([Vite build guide](https://vite.dev/guide/build.html)); route-level splitting (needed for AC-002's per-surface URLs) is achieved by dynamically importing each route's component.
- **`useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?)`**: for subscribing to state that lives outside React (e.g., a Cube query-result cache or an ECharts-instance-derived value). `getSnapshot` must return referentially stable data (`Object.is`); this app has no SSR, so `getServerSnapshot` is unnecessary ([React docs](https://react.dev/reference/react/useSyncExternalStore)).
- **`<StrictMode>`**: dev-only; double-invokes render, and runs each Effect/ref-callback as setup→cleanup→setup, to surface missing cleanup ([React docs](https://react.dev/reference/react/StrictMode)).
- **Refs for imperative/canvas libraries**: React's guidance is to designate a DOM node React never touches internally, hand it to the library via `ref`, and keep all imperative calls in effects/callbacks, not render ([Manipulating the DOM with Refs](https://react.dev/learn/manipulating-the-dom-with-refs)).

## Gotchas

- **TypeScript 7 is a from-scratch Go port ("Corsa"), GA 2026-07-08** — not a semver-minor bump from 6.x ([TS 7.0 GA announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)). Confirmed at GA: project references and `tsc --build` are supported (plus a new `--builders` flag for parallel monorepo builds); declaration emit works. Breaking vs 5.x/6.x: `strict: true` is now the tsconfig default, `module` defaults to `esnext`, and `target: es5`, `downlevelIteration`, classic `moduleResolution`, and `baseUrl` are removed. `paths` has not required `baseUrl` since TS 4.1 and now resolves relative to the tsconfig file, so path aliases keep working ([tsconfig `paths`](https://www.typescriptlang.org/tsconfig/#paths)). Embedded-language tooling (Vue/MDX/Svelte/Astro/Angular) isn't supported yet, pending a 7.1 API — irrelevant here since this stack is plain `.ts`/`.tsx`.
- **Project references vs single tsconfig**: use a "solution" root `tsconfig.json` with empty `files` and `references` to each `apps/*`/`packages/*` project (each needs `composite: true`, which forces `declaration: true`); `tsc` without `-b` will not build references — always invoke as `tsc -b` in the `typecheck` script ([TS project references handbook](https://www.typescriptlang.org/docs/handbook/project-references.html)).
- **Excluding `.claude/`**: `exclude` only filters what `include` picks up — it doesn't stop `.claude/` files from being pulled in by an explicit `import`, so also keep `.claude/` out of any `include` globs, not just `exclude` ([tsconfig reference](https://www.typescriptlang.org/tsconfig/)).
- **`exactOptionalPropertyTypes`** (TS-recommended: on) makes `{ foo: undefined }` an error for `foo?: T` unless `undefined` is in `T` — will surface in any props/options object built by spreading partial state ([tsconfig reference](https://www.typescriptlang.org/tsconfig/)).
- **`verbatimModuleSyntax`** forces explicit `import type`/`export type` for type-only imports and preserves import/export syntax verbatim in emit — combined with TS7's `module: esnext` default, this is what keeps Vite's own ESM-only transform working correctly ([tsconfig reference](https://www.typescriptlang.org/tsconfig/)).
- **Vite 8 defaults to Rolldown** (Rust bundler) instead of esbuild(dev)/Rollup(build); most plugins are compatible, but custom `rollupOptions`-style chunking now goes through `build.rolldownOptions` ([Vite 8 announcement](https://vite.dev/blog/announcing-vite8.html)).
- **`@vitejs/plugin-react` Fast Refresh** requires files to export only React components (plus simple constants) — mixed-export modules break HMR ([plugin README](https://github.com/vitejs/vite-plugin-react)).
- **React 19 ref-callback cleanup**: a ref callback that implicitly returns a non-`undefined` value is now type-checked as if it returned a cleanup function — write `ref={(el) => { instance.current = el; }}` with a block body, not an implicit-return arrow, when wiring refs into chart containers ([React 19 blog](https://react.dev/blog/2024/12/05/react-19)).
- **ECharts (or any canvas-owning chart lib) + concurrent React**: never let a component render JSX children into the div ECharts manages ([Manipulating the DOM with Refs](https://react.dev/learn/manipulating-the-dom-with-refs)); call `echarts.init`/`setOption`/`dispose` only from effects, never in the render body, because render can run twice under StrictMode and can be interrupted by concurrent features. Because StrictMode runs setup→cleanup→setup on mount in dev, the effect that calls `echarts.init(dom)` must have a matching cleanup that disposes the instance, or dev mode will attempt to re-init onto a live instance ([StrictMode docs](https://react.dev/reference/react/StrictMode); `init`/lifecycle shown in [ECharts handbook](https://echarts.apache.org/handbook/en/basics/import)).
- **`echarts-for-react` peer range**: its published `peerDependencies` list `react ^15 || ^16 || ^17` ([repo](https://github.com/hustcc/echarts-for-react)) — not verified against React 19; if used, confirm compatibility or wrap ECharts directly with the ref/effect pattern above instead of depending on it.
- **`useSyncExternalStore` + transitions**: store updates that fire during a `startTransition` fall back to a blocking (synchronous) update rather than being deferred — relevant if a Cube query-cache store is wired through `useSyncExternalStore` alongside transition-based navigation for AC-002 ([React docs](https://react.dev/reference/react/useSyncExternalStore)).

## Open questions / unverified

- No router package was in scope for this doc (only `react`/`react-dom`/`vite`/`@vitejs/plugin-react`/`typescript`/`pnpm`); AC-002's URL-restoration behavior will need its own research doc once a router is chosen. _(Covered separately in `router.md`.)_
- `echarts-for-react` React-19 compatibility is UNVERIFIED — the repo's peer range fetch didn't confirm React 18/19 support explicitly; verify directly or avoid the wrapper before importing it.
- TypeScript 7's stated support for "any editor" language service was described in the GA blog summary but the exact VS Code/other-editor extension mechanics weren't independently verified beyond that summary — check before relying on non-VS Code editor integration.
