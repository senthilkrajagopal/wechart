---
library: yaml (eemeli)
packages: [yaml, yaml/util]
version: 2.9.1
researched: 2026-09-19
sources:
  [
    https://eemeli.org/yaml/,
    https://github.com/eemeli/yaml,
    https://registry.npmjs.org/yaml/latest,
    https://github.com/nodeca/js-yaml,
    https://registry.npmjs.org/js-yaml/latest,
    https://docs.cube.dev/docs/data-modeling/dynamic/jinja,
    https://yaml.org/spec/1.2.2/,
  ]
---

# yaml 2.9.1

## Summary

`yaml` (eemeli) is the YAML library for the Cube model editor. It is the only one of the two candidates that reads comments out of source and writes them back, which is what AC-134 ("warn and name what would be lost, such as comments or anchors") needs, and it collects errors instead of throwing, which is what AC-135 (problems list, form read-only until it parses) and the 500 ms live round trip of AC-133 need. Form-driven writes for AC-143 (rollups) go through the same `Document` tree, so untouched parts of the file keep their comments.

- `yaml` "supports parsing, modifying, and writing YAML comments and blank lines" and "can accept any string as input without throwing, parsing as much YAML out of it as it can" ([README](https://github.com/eemeli/yaml#readme)).
- js-yaml cannot do this: its parser only skips `#` comments and never stores them ([src/parser/parser.ts](https://raw.githubusercontent.com/nodeca/js-yaml/master/src/parser/parser.ts)), and the maintainer's answer to the feature request is "Sorry, that's impossible without full parser rewrite" ([issue #624](https://github.com/nodeca/js-yaml/issues/624)).

## Install

```bash
pnpm add yaml@2.9.1
```

- Zero runtime dependencies; `engines.node: ">= 14.6"`; license ISC ([registry manifest 2.9.1](https://registry.npmjs.org/yaml/2.9.1)).
- Dual entry points via `exports`: `node` → `./dist/index.js`, `default` (browser/bundler) → `./browser/index.js`, plus `./util` and typings at `./dist/index.d.ts` ([same manifest](https://registry.npmjs.org/yaml/2.9.1)). Vite picks the browser condition automatically; Node 26 picks `dist`.
- Typings require TypeScript >= 5.9 ("The minimum supported TypeScript version of the included typings is 5.9", [README](https://github.com/eemeli/yaml#readme)).
- Browser cost, whole-package import: 103.2 kB minified / 31.3 kB min+gzip, 0 dependencies ([bundlephobia yaml@2.9.1](https://bundlephobia.com/api/size?package=yaml@2.9.1)).
- Latest stable is 2.9.1 (2026-09-11). A `3.0.0-2` prerelease exists (ESM-only build, `node.toJSON()` removed, `NodeBase` becomes an interface) — do not pin it ([releases](https://github.com/eemeli/yaml/releases)).

## Init / auth pattern

No auth. One shared options object so the editor parses what Cube parses. Cube's `YamlCompiler` calls `js-yaml` `load()` with default options and `js-yaml@^4.1.0` ([YamlCompiler.ts](https://raw.githubusercontent.com/cube-js/cube/master/packages/cubejs-schema-compiler/src/compiler/YamlCompiler.ts), [package.json](https://raw.githubusercontent.com/cube-js/cube/master/packages/cubejs-schema-compiler/package.json)); js-yaml 4's `DEFAULT_SCHEMA` has `merge` and `timestamp` as implicit types ([lib/schema/default.js@4.1.0](https://raw.githubusercontent.com/nodeca/js-yaml/4.1.0/lib/schema/default.js)), while `yaml`'s defaults are `version: '1.2'`, `schema: 'core'`, `merge: false` ([Options](https://eemeli.org/yaml/#options)). So:

```ts
import { parseDocument, parseAllDocuments, visit, isAlias, LineCounter, type Document } from 'yaml';

export const CUBE_PARSE: Parameters<typeof parseDocument>[1] = {
  merge: true, // Cube's parser resolves '<<'
  customTags: ['timestamp'], // Cube's parser yields Date for unquoted timestamps
  keepSourceTokens: true, // enables CST-level in-place edits
  prettyErrors: true, // adds linePos {line, col} to errors
};
```

`merge`, `customTags` (`'timestamp'` among the YAML 1.1 tag ids), `keepSourceTokens` and `prettyErrors` are all documented options ([Options](https://eemeli.org/yaml/#options), [Custom Data Types](https://eemeli.org/yaml/#custom-data-types)).

## API surface we will use

### Parsing (AC-135)

- `parseDocument(str, options?): Document` and `parseAllDocuments(str, options?): Document[]`. Both collect problems in `doc.errors` / `doc.warnings` rather than raising ([Documents](https://eemeli.org/yaml/#documents)).
- Errors are `YAMLParseError` / `YAMLWarning` with `name`, `code`, `message`, `pos: [number, number]` and, with `prettyErrors`, `linePos: [{line, col}, {line, col}]` ([Errors](https://eemeli.org/yaml/#errors)). 1-based `line`/`col` come from `LineCounter` / `linePos(offset)` ([Errors](https://eemeli.org/yaml/#errors)).
- Multiple errors per document: the composer's `onError` pushes into `this.errors` and composition continues; the array is then assigned to `doc.errors` ([src/compose/composer.ts](https://raw.githubusercontent.com/eemeli/yaml/main/src/compose/composer.ts)). That is exactly the "problems list" shape AC-135 asks for.
- Gate the form on `doc.errors.length === 0`; `doc.toString()` throws when `errors` is non-empty anyway ([Documents](https://eemeli.org/yaml/#documents)).

### Reading into the form (AC-133)

- `doc.toJS(options?)`: `mapAsMap`, `reviver`, `onAnchor`, `maxAliasCount` (default 100, limits alias expansion) ([Options](https://eemeli.org/yaml/#options)). Aliases are expanded in the JS view, so the form sees resolved values — this is the loss AC-134 must name before a form-authored write replaces them.

### Writing from the form (AC-133, AC-143)

- Collections and `Document` share `get/getIn(path, keep?)`, `set/setIn`, `has/hasIn`, `add/addIn`, `delete/deleteIn` ([Modifying Nodes](https://eemeli.org/yaml/#modifying-nodes)). A rollup write is `doc.setIn(['cubes', i, 'pre_aggregations'], value)`.
- `doc.createNode(value, options?)` "recursively wraps input in appropriate node containers" ([Documents](https://eemeli.org/yaml/#documents)); new nodes carry no comments, so replacing a whole subtree discards the comments that were inside it (follows from `createNode`'s documented behaviour, and is the case to warn about rather than the whole-file case).
- `doc.toString(options?)` re-emits the tree with comments and anchors intact ([Documents](https://eemeli.org/yaml/#documents)).

### Comments and anchors (AC-134)

- Every `Scalar`, `YAMLMap`, `YAMLSeq` and the `Document` has `comment`, `commentBefore` and `spaceBefore` ([Comments and Blank Lines](https://eemeli.org/yaml/#comments-and-blank-lines)).
- A `YAMLSeq`'s `items` is a plain, writable array of its item nodes. The installed 2.9.1 types declare `items: T[]` on `YAMLSeq` and `items: unknown[]` on `Collection` (`node_modules/yaml/dist/nodes/YAMLSeq.d.ts`, `Collection.d.ts`). So reordering the array moves each item's node, with its comments and anchor, rather than rewriting values in place (T152's review).
- `visit(node, visitor)` walks depth-first with per-kind visitors (`Map`, `Pair`, `Seq`, `Scalar`, `Alias`, `Collection`, `Value`, `Node`) and control values `visit.SKIP`, `visit.BREAK`, `visit.REMOVE` ([Modifying Nodes](https://eemeli.org/yaml/#modifying-nodes)). Use it to enumerate, for the AC-134 warning, every node carrying `comment`/`commentBefore`/`spaceBefore`, every `anchor`, every `Alias`, and any explicit tag.
- `Alias` has `source: string` and `resolve(doc)`; anchors parsed from `&name` are kept on the node, and `doc.createAlias(node, name?)` mints new ones ([Alias Nodes](https://eemeli.org/yaml/#alias-nodes)). Caveats from the same page: alias nodes cannot have their own anchor or tag, and a node referenced by an alias must be added to the document before the alias.
- Merge keys (`<<`) are a YAML 1.1 feature enabled by `merge` ([Alias Nodes](https://eemeli.org/yaml/#alias-nodes)); 2.9.1 added a limit on recursive merge aliases ([v2.9.1 notes](https://github.com/eemeli/yaml/releases/tag/v2.9.1)).

### Editing one node without reformatting the rest

- With `keepSourceTokens: true` each node gets `srcToken`, the CST token it was composed from ([CST Parser](https://eemeli.org/yaml/#cst-parser)).
- The CST "retains every character of the input, including whitespace"; `CST.setScalarValue(token, value)` overwrites a scalar's contents, `CST.visit()` walks the CST, `CST.createScalarToken()` builds new tokens and `CST.stringify()` renders back to text ([CST Parser](https://eemeli.org/yaml/#cst-parser)).
- Use this path for single-field form edits when the file's layout must survive byte-for-byte; use `doc.toString()` for structural edits (adding a rollup).

### Multi-document files

- `parseAllDocuments` handles streams and returns one `Document` per document, each with its own `errors`, `warnings` and `directives` (which cover `%YAML`/`%TAG` and the doc-start marker) ([Documents](https://eemeli.org/yaml/#documents)). Stringify per document and concatenate.

## Gotchas

- **Round-trip is a re-render, not a byte-preserving edit.** `toString()` applies `indent` (default 2), `lineWidth` (default 80, "set to `0` to disable folding"), `indentSeq`, `blockQuote`, `defaultStringType: 'PLAIN'` ([toString options](https://eemeli.org/yaml/#tostring-options)). A 4-space-indented or long-line file comes back reflowed. Set `lineWidth: 0` and match the file's indent, or take the CST path.
  - A single-line flow collection comes back padded, `{name: id}` as `{ name: id }`: `flowCollectionPadding` "When true, a single space of padding will be added inside the delimiters of non-empty single-line flow collections. Default: `true`" (read in the installed 2.9.1, `dist/options.d.ts` L273-279, used in `dist/stringify/stringifyCollection.js` L64; 2026-10-08, T734). Set it `false` to keep Cube's scaffold's `{name: id, …}`.
  - `Document.toString()` throws when the document has errors: "Document with errors cannot be stringified" (`dist/doc/Document.js` L322, read 2026-10-08 for T734's review). Check `doc.errors` first.
- **Comment attachment is not perfectly stable.** "Due to implementation details, the library's comment handling is not completely stable, in particular for trailing comments. When creating, writing, and then reading a YAML file, comments may sometimes be associated with a different node." ([Comments and Blank Lines](https://eemeli.org/yaml/#comments-and-blank-lines)). Treat a full-file diff after a write as a check, not an assumption.
- **`parseDocument` is not absolutely throw-free.** As of 2.9.0 the docs say malicious input can still trigger stack exhaustion, and such reports are handled as ordinary bugs ([v2.9.0 notes](https://github.com/eemeli/yaml/releases/tag/v2.9.0)). Wrap editor parses in try/catch anyway.
- **Some problems show only in `toJS()`, not in `doc.errors`** (read in the installed 2.9.1, 2026-09-21; found by T141's review).
  - Composing reports an alias only if its name is empty or ends in `:` (`dist/compose/compose-node.js`).
  - An alias to no anchor throws from `toJS()`: `ReferenceError: Unresolved alias (the anchor must be set before the alias): <name>`. So does a document past `maxAliasCount` (`dist/nodes/Alias.js`).
  - As a merge source, `<<: *missing` throws "Merge sources must be maps or map aliases" instead. That message was observed in `problems.test.ts`.
  - So a problems list must also call `toJS()` in a try/catch. It finds the place from the first `Alias` whose `resolve(doc)` is `undefined`.
  - Whether Cube's js-yaml rejects the same input was not checked.
- **Defaults differ from Cube's parser.** With `yaml`'s defaults, `<<` is an ordinary key (`merge: false` at version 1.2) and `2026-01-01` stays a string, while Cube's js-yaml 4 `DEFAULT_SCHEMA` resolves both ([Options](https://eemeli.org/yaml/#options); [default.js@4.1.0](https://raw.githubusercontent.com/nodeca/js-yaml/4.1.0/lib/schema/default.js)). Use `CUBE_PARSE` above everywhere, including in the Node API writer, or the form and Cube will disagree.
- **YAML 1.1 vs 1.2 booleans/octals.** Under 1.2 core only `true`/`false` are booleans; `yes`, `no`, `on`, `off`, `y`, `n` are strings, and unprefixed octal (`014`) and sexagesimals are 1.1-only ([Options](https://eemeli.org/yaml/#options)). js-yaml 4 — what Cube runs — also resolves only `true/True/TRUE/false/False/FALSE` ([lib/type/bool.js@4.1.0](https://raw.githubusercontent.com/nodeca/js-yaml/4.1.0/lib/type/bool.js)). So the two agree on booleans; a Cube model writing `sql: on` gets the string `"on"` in both. Do not switch `version: '1.1'`; that would diverge from Cube.
- **Complex keys.** When `mapAsMap` is false, a collection key is stringified with the warning "Keys with collection values will be stringified due to JS Object restrictions: … Set mapAsMap: true to use a Map instead." ([src/nodes/addPairToJSMap.ts](https://raw.githubusercontent.com/eemeli/yaml/main/src/nodes/addPairToJSMap.ts)). This is how Jinja `{{ }}` values surface (below).
- **Jinja files.** Cube renders Jinja before YAML parsing — "Jinja is supported in all YAML data model files", with `{{ }}`, `{% %}`, `{# #}` and `model/globals.py` ([Cube docs](https://docs.cube.dev/docs/data-modeling/dynamic/jinja)). Pre-render source is not YAML: `%` is a reserved indicator and "Reserved indicators can't start a plain scalar" ([YAML 1.2.2 §5.3](https://yaml.org/spec/1.2.2/#53-indicator-characters)), so `{% for … %}` is a syntax error for any conforming parser. `{{ x }}` is a different problem: it is syntactically a flow mapping inside a flow mapping, so it parses and produces a collection-valued key that gets stringified with the warning above rather than an error. Detect `{{`, `{%`, `{#` in the raw text before parsing and hold those files read-only (as the spec already requires) instead of relying on the parser to flag them; `yaml` will not reliably error on `{{ }}`.
  - **Corrected 2026-09-21 (T146's review):** detect by Cube's own test, `/{%|%}|{{|}}/`, from its source (research/cube/data-modeling.md, "How each file type is compiled"). Cube doesn't render a file whose only brace is `{#`, so that file is plain YAML to Cube. wechart now treats a file as a template exactly when Cube would render it, when listing (`objects.ts`) and when publishing (`publish.ts`).
- **`yaml` v3 is in prerelease** and changes the node model (ESM-only, `NodeBase` becomes an interface, `node.toJSON()` removed) ([releases](https://github.com/eemeli/yaml/releases)). Pin 2.9.1 and revisit when 3.x is stable.
- `sideEffects` is absent from the manifest ([registry manifest](https://registry.npmjs.org/yaml/2.9.1)), so bundlers cannot tree-shake on that signal; expect the ~31 kB gzip figure in the editor chunk.

## Alternatives considered

**js-yaml 5.4.2** (MIT, dep `argparse@^2.0.1`, CJS `dist/js-yaml.cjs.js` + ESM `dist/js-yaml.mjs` + browser UMD/ESM builds; [registry](https://registry.npmjs.org/js-yaml/latest)). 59.8 kB minified / 17.9 kB gzip ([bundlephobia js-yaml@5.4.2](https://bundlephobia.com/api/size?package=js-yaml@5.4.2)) — smaller than `yaml`, and more downloaded (214.5M vs 145.2M weekly, [npm](https://api.npmjs.org/downloads/point/last-week/js-yaml), [npm](https://api.npmjs.org/downloads/point/last-week/yaml)). Both are actively released (js-yaml 5.4.2 on 2026-09-13, yaml 2.9.1 on 2026-09-11). v5 is a TypeScript rewrite with a real AST and visitor layer: `eventsToAst`, `jsToAst`, `present`, `visit`, `Document`, `ScalarNode`, `MappingNode`, `AliasNode` ([src/index.ts](https://raw.githubusercontent.com/nodeca/js-yaml/master/src/index.ts)), and its `NodeBase` even has `commentBefore`, `comment`, `commentAfter`, `blankBefore` ([src/ast/nodes.ts](https://raw.githubusercontent.com/nodeca/js-yaml/master/src/ast/nodes.ts)). Rejected on three grounds:

1. **Comments are write-only.** Parse events carry offsets, styles, anchors and tags but no comments ([src/parser/events.ts](https://raw.githubusercontent.com/nodeca/js-yaml/master/src/parser/events.ts)); the parser only skips `#` ([parser.ts](https://raw.githubusercontent.com/nodeca/js-yaml/master/src/parser/parser.ts)); `eventsToAst` keeps "the original styles, tags and anchors" and never sets a comment field ([src/ast/from_events.ts](https://raw.githubusercontent.com/nodeca/js-yaml/master/src/ast/from_events.ts)). A parse → edit → present round trip drops every comment in the file, which fails AC-134 outright and fails AC-143 for any commented model file.
2. **No error recovery, one error at a time.** `throwError()` calls `YAMLException.throwAt(...)` and throws immediately ([parser.ts](https://raw.githubusercontent.com/nodeca/js-yaml/master/src/parser/parser.ts)); the exception carries a single `mark` with 0-based `line`/`column`, `position`, `buffer`, optional `name` and rendered `snippet` ([src/common/snippet.ts](https://raw.githubusercontent.com/nodeca/js-yaml/master/src/common/snippet.ts)). AC-135's problems list would only ever show the first error, and a half-typed buffer gives no partial tree for the form.
3. **Sharper edges for a live editor.** `load('')` throws in v5 instead of returning `undefined`, the default is `CORE_SCHEMA` so `<<` merge keys are off unless `mergeTag` is added, complex keys throw instead of coercing, and legacy 1.1 tags need `YAML11_SCHEMA` ([migrate_v4_to_v5](https://raw.githubusercontent.com/nodeca/js-yaml/master/docs/migrate_v4_to_v5.md)). Note the v5 complex-key change means js-yaml 5 would _throw_ on `{{ jinja }}` where Cube's own js-yaml 4 coerces it.

js-yaml stays relevant as documentation of Cube's own semantics (Cube depends on `js-yaml@^4.1.0`; it also already depends on `yaml@^2.7.1`, [package.json](https://raw.githubusercontent.com/cube-js/cube/master/packages/cubejs-schema-compiler/package.json)), but wechart should not import it.

## Open questions / unverified

- UNVERIFIED: parse/stringify latency for our model-file sizes against AC-133's 500 ms budget. I found no published benchmark from either project (checked both READMEs, the `yaml` docs site, and both release feeds); `yaml` 3.0.0-x prereleases mention performance work ([releases](https://github.com/eemeli/yaml/releases)) but give no numbers. Measure with real Cube model files during implementation; there is no Bash in this research session to run one.
- UNVERIFIED: whether Cube accepts multi-document model files. `YamlCompiler` calls `load()`, documented as parsing "a single YAML document" ([usage.md](https://raw.githubusercontent.com/nodeca/js-yaml/master/docs/usage.md), [YamlCompiler.ts](https://raw.githubusercontent.com/cube-js/cube/master/packages/cubejs-schema-compiler/src/compiler/YamlCompiler.ts)), which suggests `---` streams are rejected, but I did not find an explicit statement or the exact error. Confirm before the editor offers multi-document files.
- UNVERIFIED: exact `yaml` behaviour on a full Jinja-templated Cube file (how many `doc.errors`, and whether `{{ }}` ever errors rather than warning). Reasoned from the YAML 1.2.2 indicator rules and `addPairToJSMap`, not observed. The recommended text-level Jinja detection does not depend on the answer.
- Open question for the caller: when the CST in-place path and the `Document` path disagree (structural edit to a file whose layout we want preserved), which wins? The spec does not say whether a rollup insert may reflow the file.

## Addendum 2026-09-27: a node's place in the text (T482)

- **A parsed node's `range`.** It is "the `[start, value-end, node-end]` character offsets for the part of the source parsed into this node (undefined if not parsed). The `value-end` and `node-end` positions are themselves not included in their respective ranges." (`NodeBase.range?: Range | null`, `type Range = [number, number, number]`, in the installed 2.9.1's `node_modules/.pnpm/yaml@2.9.1/node_modules/yaml/dist/nodes/Node.d.ts`). `problems.ts` and `validate.ts` already read it.
- **`doc.getIn(path, true)` returns that node** rather than its value (`keep`, above). T482 reads a member's lines from it: `['cubes', i, list, j]` gives the member's map, and the member's lines run from its `range[0]` to `range[1]`.
- **Comment lines are read from the text, not from the nodes.** Comments are strings on `comment`/`commentBefore`, with no offsets of their own. `annotations.ts` reads them line by line: outside quotes, and outside a block scalar's lines.
