---
library: d3-time-format
packages: [d3-time-format, "@types/d3-time-format"]
version: 4.1.0
researched: 2026-09-21
sources:
  - https://d3js.org/d3-time-format
  - https://github.com/d3/d3-time-format/blob/v4.1.0/README.md
  - https://github.com/d3/d3-time-format/blob/v4.1.0/src/locale.js
  - https://github.com/d3/d3-time-format/blob/v4.1.0/src/defaultLocale.js
  - https://registry.npmjs.org/d3-time-format/latest
  - https://registry.npmjs.org/@types/d3-time-format/latest
  - https://unpkg.com/@types/d3-time-format@4.0.3/index.d.ts
  - https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/dimensions.mdx
  - https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts
  - https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeToMetaTransformer.ts
  - https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/format.ts
---

# d3-time-format 4.1.0

## Summary

d3-time-format is D3's strftime/strptime-style time formatter and parser ([npm-latest], [docs]). wechart uses it in `packages/core/src/format.ts` to render a time dimension's model format. That format arrives from Cube 1.7.42's `/v1/meta` as `{type: 'custom-time', value: '<pattern>'}` ([cube-meta]). This serves:

- **AC-046:** every value is written with its member's format from the Cube model.
- **AC-188:** a time dimension is written by its granularity "unless the member's model format says otherwise".

Why this library and not another:

- Cube documents time formats as "POSIX strftime format strings with d3-time-format extensions" and links to d3js.org/d3-time-format ([cube-dims]).
- Cube's own client formatter renders `custom-time` with d3-time-format's `timeFormat` ([cube-client-format]).
- `@cubejs-client/core@1.7.42` depends on `d3-time-format ^4.1.0` ([npm-cube-core]).
- Rendering with the same library is therefore the only way to match Cube's directive semantics exactly.

Pins:

- `d3-time-format@4.1.0`. It is the latest dist-tag ([npm-latest]) and was published 2021-12-04 ([rel-410]).
- `@types/d3-time-format@4.0.3` (dev). It is the latest dist-tag ([npm-types]).

## Install

```sh
pnpm --filter @wechart/core add --save-exact d3-time-format@4.1.0
pnpm --filter @wechart/core add --save-exact -D @types/d3-time-format@4.0.3
```

`--save-exact` writes an exact version rather than a range, and `-D` saves to devDependencies ([pnpm-add]). This matches how `@wechart/core` already pins `d3-format` 3.1.2 and `@types/d3-format` 3.0.4 (`/Users/srajagopal/Work/wechart/packages/core/package.json`).

**d3-time-format 4.1.0 package facts** ([npm-latest])

| Field | Value |
|---|---|
| License | ISC. `LICENSE` reads "Copyright 2010-2021 Mike Bostock" ([license]) |
| Module format | ESM only: `"type": "module"`, `main`/`module` point at `src/index.js` |
| `exports` | `{ ".": { "umd": "./dist/d3-time-format.min.js", "default": "./src/index.js" }, "./locale/*": "./locale/*.json" }` |
| Dependencies | `d3-time: "1 - 3"`. No peer dependencies |
| `engines.node` | `>=12` |
| `sideEffects` | `["./src/defaultLocale.js"]` |
| Types | None bundled: no `types`/`typings` field |

**Transitive dependencies**

- `d3-time@3.1.0`: ISC, ESM, `sideEffects: false`, depends on `d3-array "2 - 3"` ([npm-d3-time]). 3.1.0 was published 2022-12-03 ([d3-time-rel]).
- `d3-array@3.2.4`: ISC, ESM, depends on `internmap "1 - 2"` ([npm-d3-array]).
- `internmap@2.0.3`: ISC, no dependencies ([npm-internmap]).

**Types: `@types/d3-time-format@4.0.3`** ([npm-types], [npm-types-all], [types-dts])

- MIT, no dependencies, `typeScriptVersion: "4.5"`, `types: "index.d.ts"`.
- The `ts6.0` dist-tag points at 4.0.3, so it covers the repo's TypeScript 6.0.3.
- The header says "Last module patch version validated against: 4.0.0". 4.1.0 only added the exported locale JSON files ([rel-410]), which the typings do not declare.

**Bundle size.** Bundlephobia reports 11,806 B minified and 3,668 B gzip for d3-time-format 4.1.0 including d3-time. Its `dependencySizes` lists only d3-time-format and d3-time ([bundlephobia]).

**Maintenance**

- `main` is 4 commits ahead of `v4.1.0`, and none of them touch `src/`. They are two README changes, a README restructure (2023-10-06) and a new `vi-VN` locale file ([compare]).
- The published code has been unchanged since 2021-12-04.
- Open issues include #120 (ISO week at the year edge), #123 (years ≥ 10000 in parsing) and #125 (Temporal/Intl) ([issues]).

## Init / auth pattern

There is no auth or init. The module sets up a U.S. English default locale when it loads ([src-default]).

For wechart, build a private en-US locale with `timeFormatLocale` instead of relying on the module-global `utcFormat`:

- `timeFormatDefaultLocale(def)` reassigns the exported `timeFormat`/`timeParse`/`utcFormat`/`utcParse` bindings for every importer ([src-default], [docs]).
- `@cubejs-client/core` also imports this package ([npm-cube-core]).

Sketch (not executed):

```ts
import { timeFormatLocale, type TimeLocaleDefinition } from 'd3-time-format';

// Copied from d3-time-format 4.1.0 locale/en-US.json (identical to the built-in default).
const EN_US: TimeLocaleDefinition = {
  dateTime: '%x, %X',
  date: '%-m/%-d/%Y',
  time: '%-I:%M:%S %p',
  periods: ['AM', 'PM'],
  days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  shortDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
           'September', 'October', 'November', 'December'],
  shortMonths: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

const TIME = timeFormatLocale(EN_US);
const byPattern = new Map<string, (date: Date) => string>();

export function utcPattern(pattern: string): (date: Date) => string {
  let write = byPattern.get(pattern);
  if (write === undefined) {
    write = TIME.utcFormat(pattern);
    byPattern.set(pattern, write);
  }
  return write;
}
```

- **Locale values.** The en-US values match both `locale/en-US.json` ([en-US]) and the built-in default in `defaultLocale.js` ([src-default]).
- **Tuple types.** `TimeLocaleDefinition` types `days`/`shortDays` as 7-tuples, `months`/`shortMonths` as 12-tuples and `periods` as a 2-tuple ([types-dts]). A contextually typed literal (annotation or `satisfies`) is needed, because a widened `string[]` will not assign.
- **Type-only imports.** The repo's `tsconfig.base.json` sets `verbatimModuleSyntax: true` (`/Users/srajagopal/Work/wechart/tsconfig.base.json`). Under that setting, type-only imports need `import type` or an inline `type` modifier ([ts-vms]).

## API surface we will use

All signatures below are from `@types/d3-time-format@4.0.3` ([types-dts]). Behaviour is from the docs ([docs], [readme]) and the 4.1.0 source ([src-locale]).

### `timeFormatLocale(definition: TimeLocaleDefinition): TimeLocaleObject`

- Returns `{ format, parse, utcFormat, utcParse }` for that definition ([docs]).
- Required fields: `dateTime` (`%c`), `date` (`%x`), `time` (`%X`), `periods`, `days`, `shortDays`, `months` and `shortMonths` ([docs]).
- `%c`, `%x` and `%X` are compiled once, when the locale is created ([src-locale]).

### `locale.utcFormat(specifier: string): (date: Date) => string` (use this one)

- "Equivalent to locale.format, except all directives are interpreted as Coordinated Universal Time (UTC) rather than local time" ([docs]).
- **Creating a formatter** only closes over the specifier. The specifier is coerced with `+= ""`, and the function's `toString()` returns the specifier ([src-locale]). Nothing is pre-compiled: the specifier is scanned on every call (`newFormat`) ([src-locale]). Caching one formatter per pattern (as above) is fine but not required for correctness.
- **Input coercion.** The returned function does `if (!(date instanceof Date)) date = new Date(+date);` ([src-locale]):
  - A number (epoch ms) works.
  - `null` and `""` coerce to 0, so they print 1970-01-01. `+null` is 0 ([mdn-unary-plus]).
  - A non-numeric string such as Cube's `2026-01-01T00:00:00.000` coerces to NaN, giving an Invalid Date. The formatter does not parse strings.
  - The TS type accepts only `Date`.
- **Unknown directives.** The loop is `if (format = formats[c]) c = format(date, pad); string.push(c);` ([src-locale]). An unknown directive letter is emitted as the bare letter with the `%` dropped, so `%n` gives `n` and `%-n` also gives `n`. A lone trailing `%` emits nothing, because `charAt(n)` is `""`. This is a reading of the source; it is not stated in the docs.
- **Invalid Date: does it throw?** There is no validity check in `newFormat` ([src-locale]). The numeric directives call `getUTC*`, which return `NaN` on an invalid Date ([mdn-getutcfullyear]), and `pad` stringifies the result. The output therefore contains `NaN` fragments rather than throwing. Name directives such as `%b` index an array with NaN and give `undefined`. Derived from the source, not executed: `utcFormat('%Y-%m')(new Date(NaN))` would be `"0NaN-NaN"`.
  - Guard with `Number.isNaN(date.getTime())` first. Cube's own client does this, returning `'Invalid date'` ([cube-client-format]).
- **Other throws.** The only throw paths are inputs whose unary `+` throws, such as BigInt ([mdn-unary-plus]). Note that `isoFormat` (not planned for use) delegates to `Date.prototype.toISOString` ([src-iso]), which throws `RangeError` on an invalid date ([mdn-toisostring]).

### `locale.format(specifier)` / global `timeFormat(specifier)`

Same as `utcFormat`, but the directives read local-time getters (`getFullYear`, `getDay`, `getTimezoneOffset` …) ([src-locale]). Do not use it for wechart's UTC-written values (see Gotchas).

### `locale.utcParse(specifier: string): (dateString: string) => Date | null` (optional)

An option for turning Cube's offset-less string into a UTC `Date`, replacing the hand-written regex plus `Date.UTC` in `format.ts`.

- **Strict.** It returns `null` unless the whole string matches ([docs]). Try several parsers in sequence for flexible input ([readme]).
- **UTC default.** With no `%Z` in the specifier, the offset defaults to 0 (`if (Z && !("Z" in d)) d.Z = 0`) ([src-locale]).
- **Years 0–99** are handled with `setUTCFullYear` ([src-locale]).
- **Field widths.** `%Y` reads up to 4 digits, `%L` up to 3, and `%m`/`%d`/`%H`/`%M`/`%S` up to 2, each via `/^\s*\d+/` ([src-locale]).

Example (derived, not executed):

```ts
const readCube = TIME.utcParse('%Y-%m-%dT%H:%M:%S.%L');
readCube('2026-01-01T00:00:00.000'); // Date at 2026-01-01T00:00:00Z
readCube('2026-01-01');              // null (strict)
```

### Other exports

`timeFormatDefaultLocale`, `timeParse`, `utcParse`, `isoFormat` and `isoParse` are also exported ([src-index]). wechart should not call `timeFormatDefaultLocale` (see Init).

### Directive list (d3-time-format 4.1.0) and Cube 1.7.42's validator

The d3 meanings are from [docs] and [src-locale]. The "Cube accepts" column comes from `TIME_SPECIFIERS` plus `customTimeFormatSchema` in [cube-validator].

| Directive | d3-time-format meaning | Cube accepts? | Notes |
|---|---|---|---|
| `%a` / `%A` | abbreviated / full weekday name* | yes | en-US: `Sun`… / `Sunday`… |
| `%b` / `%B` | abbreviated / full month name* | yes | `Jan`… / `January`… |
| `%c` | locale date and time* | yes | en-US `%x, %X`, e.g. `1/1/1990, 12:00:00 AM` ([test-utc]) |
| `%d` | zero-padded day of month [01,31] | yes | |
| `%e` | space-padded day of month [ 1,31], same as `%_d` | yes | `" 1"` ([test-utc]) |
| `%f` | microseconds [000000,999999] | yes | Implemented as milliseconds + `"000"` ([src-locale]) |
| `%g` / `%G` | ISO 8601 week-based year, 2-digit / full | yes | Pair with `%V` |
| `%H` | hour, 24-hour clock [00,23] | yes | |
| `%I` | hour, 12-hour clock [01,12] | yes | `getUTCHours() % 12 \|\| 12` ([src-locale]) |
| `%j` | day of year [001,366] | yes | |
| `%L` | milliseconds [000,999] | yes | |
| `%m` | month [01,12] | yes | |
| `%M` | minute [00,59] | yes | |
| `%p` | AM or PM* | yes | `periods[+(hours >= 12)]` ([src-locale]) |
| `%q` | quarter [1,4] | yes | Not padded ([src-locale]) |
| `%Q` | milliseconds since the UNIX epoch | yes | |
| `%s` | seconds since the UNIX epoch | yes | `Math.floor(+d / 1000)` |
| `%S` | second [00,61] | yes | |
| `%u` | Monday-based weekday [1,7] | yes | |
| `%U` | Sunday-based week of year [00,53] | yes | Days before the first Sunday are week 0 |
| `%V` | ISO 8601 week of year [01,53] | yes | |
| `%w` | Sunday-based weekday [0,6] | yes | |
| `%W` | Monday-based week of year [00,53] | yes | Days before the first Monday are week 0 |
| `%x` / `%X` | locale date / time* | yes | en-US `%-m/%-d/%Y` / `%-I:%M:%S %p` ([en-US]) |
| `%y` / `%Y` | year without century [00,99] / with century | yes | `%Y` is `year % 10000`, padded to 4 ([src-locale]) |
| `%Z` | time zone offset | yes | Format emits `±HHMM`. **`utcFormat` always emits `+0000`** ([src-locale], [test-utc]) |
| `%%` | literal `%` | yes | Does not count as the "at least one specifier" Cube requires |
| `%n`, `%t` | **not implemented**: emitted as the literal `n` / `t` | **yes** (listed as POSIX) | POSIX defines them as newline and tab ([posix-strftime]) |
| padding `%-x`, `%_x`, `%0x` | disable / space / zero padding ([docs]) | **no** | Cube reads only the one character after `%`, and `-`, `_`, `0` are not in `TIME_SPECIFIERS`, so a model using them fails validation ([cube-validator]) |
| POSIX `%C %D %F %h %r %R %T` | not implemented by d3 | **no** | Defined by POSIX ([posix-strftime]). Rejected as "Unknown specifier" ([cube-validator]) |

\* The directive depends on the locale definition ([docs]).

**Cube's "d3-time-format extensions".**

- Cube's validator comments label `e f g G L q Q s u V` as "d3-time-format extensions", and label the rest as "POSIX standard" ([cube-validator]).
- The labels are loose: `%e`, `%g`, `%G`, `%u` and `%V` are also POSIX strftime conversions ([posix-strftime]).
- Every directive Cube accepts other than `%n`/`%t` is implemented by d3-time-format with the meanings above. Cube's own client renders them with d3's `timeFormat` ([cube-client-format]), so no directive has Cube-specific semantics.
- The docs link the phrase "POSIX strftime" to the POSIX 2004 **strptime** page ([cube-dims], [cube-strptime-link]).

**Other Cube validator rules** ([cube-validator])

- A trailing `%` gives the error `Incomplete specifier at end of string`.
- A string with no specifier other than `%%` gives `Format must contain at least one strptime specifier`.
- A time dimension's `format` can also be one of the base named formats: `imageUrl`, `link`, `currency`, `percent`, `number`, `id` or `{type: link, label}`.

**Cube's documented examples** ([cube-dims]). Useful as test fixtures:

| Pattern | Cube's example output |
|---|---|
| `%m/%d/%Y %H:%M` | `12/04/2025 14:30` |
| `%Y-%m-%d %H:%M:%S` | `2025-12-04 14:30:00` |
| `%B %d, %Y` | `December 04, 2025` |
| `%b %d, %Y` | `Dec 04, 2025` |
| `%I:%M %p` | `02:30 PM` |
| `%A, %B %d` | `Thursday, December 04` |
| `Q%q %Y` | `Q4 2025` |
| `Week %V, %Y` | `Week 49, 2025` |

## Gotchas

1. **Use `utcFormat`, never `timeFormat`, for values wechart reads as UTC.**
   - `timeFormat` reads local getters ([src-locale]).
   - A `Date` built with `Date.UTC(...)` or parsed with `Z`, then formatted with `timeFormat` in a zone west of UTC, shows the previous day, month or year. Derived; e.g. `2026-01-01T00:00Z` with `%Y-%m` would print `2025-12` in America/Los_Angeles.
   - d3's maintainer gave the same diagnosis in issue #115: "you should be using d3.utcFormat because you are passing in a UTC date" ([i115]).
   - UTC intervals also avoid local daylight-saving irregularities ([d3-time-docs]).
2. **The formatter does not parse strings.** Cube values (`YYYY-MM-DDTHH:mm:ss.SSS`, no offset; see `docs/research/cube/data-apis.md`, "The values that come back") must become a `Date` first. Passing the string gives an Invalid Date, and `null`/`""` give 1970 ([src-locale], [mdn-unary-plus]).
   - Do not use `new Date(text)` for them: a date-time string with no offset is interpreted as **local** time ([mdn-date-string]). Use `utcParse`, `Date.UTC`, or append `Z`.
3. **`Date.UTC` maps years 0–99 to 1900–1999** ([mdn-utc]). `format.ts`'s `new Date(Date.UTC(Number(year), …))` inherits this. `utcParse` does not, because it fixes the year with `setUTCFullYear` ([src-locale]).
4. **Invalid Dates format as `NaN` text rather than throwing.** Guard before formatting (see the API section).
5. **ISO week numbers need `%G`, not `%Y`.**
   - `%V`/`%G`/`%g` follow ISO 8601: "If the ISO week number belongs to the previous or next year, that year is used instead" ([docs]).
   - A maintainer confirmed in #120 that the rollover (e.g. Dec 30–31, 2019 being week 01) is correct ([i120]).
   - Cube's `week` buckets start on Monday and can start in the previous year: the observed `2025-12-29` (`docs/research/cube/data-apis.md`).
   - Derived, not executed: 2026-01-01 is a Thursday, so `2025-12-29` is ISO week 01 of 2026. Cube's own documented example `Week %V, %Y` would print `Week 01, 2025` for it, while `Week %V, %G` prints `Week 01, 2026`.
   - wechart renders whatever pattern the model declares. This is a model-authoring pitfall, which the model editor could warn about.
6. **`%U`/`%W` start at week 00** for days before the year's first Sunday/Monday. "2015-52 and 2016-00 represent Monday, December 28, 2015" ([docs]).
7. **`%Z`, `%s` and `%Q` are only truthful when the query timezone is UTC.**
   - `utcFormat`'s `%Z` is hard-coded to `+0000` ([src-locale]).
   - wechart treats Cube's wall-clock value (which is in the query's timezone) as UTC. Under a non-UTC `timezone`, these three would print the offset or epoch of that reinterpreted instant, not the real one. Derived from the sources above.
   - Cube's own client parses the string as local and formats with local `timeFormat` ([cube-client-format]), so it prints the viewer's offset. It does not print the query's either.
8. **`%n` and `%t` pass Cube's validator but render as literal `n`/`t`** ([cube-validator], [src-locale]). Pre-substitute them if wechart wants POSIX behaviour (see Open questions).
9. **A time dimension with `format: link` becomes `{type: 'custom-time', value: 'link'}` in meta.**
   - Cube's validator accepts `link` for time dimensions ([cube-validator]).
   - `transformDimensionFormat` keeps only `imageUrl`, `currency`, `percent`, `number` and `id` as strings. Any other string on a `time` dimension becomes `{type: 'custom-time', value}` ([cube-meta]).
   - d3 would then print the constant `link` for every value.
   - Derived from source reading, not observed against the running Cube.
10. **The default locale is a mutable module singleton.** `timeFormatDefaultLocale` rewrites the exported formatters for all importers ([src-default]). Use a private `timeFormatLocale(...)` object.
11. **Output is deterministic across engines.** `locale.js` imports only d3-time and builds names from the locale arrays, not `Intl` ([src-locale]). So `%p`/`%X` always use a plain space before `AM`/`PM`, unlike the ICU-dependent `Intl` output noted in `format.ts`.
12. **Locale JSON subpath.** `exports["./locale/*"]` maps to `./locale/*.json` ([npm-latest]), and Node substitutes `*` literally ([node-packages]). So the specifier is `d3-time-format/locale/en-US` without `.json`.
    - Node requires `with { type: 'json' }` for JSON imports ([node-json]).
    - `@types/d3-time-format` does not declare this subpath ([types-dts]).
    - Inline the definition instead (see Init).
13. **Years ≥ 10000 wrap in `%Y`** because of `% 10000` ([src-locale]). Parsing 5-digit years fails, per open issue #123 ([i123]).
14. **Node 26 and Vite 8 run it unchanged.**
    - Node resolves the `default` condition and ignores unknown conditions such as `umd` ([node-packages]).
    - `require()` of ESM is stable in Node 26 for modules without top-level await ([node-require-esm]). This is not needed, because `@wechart/core` is `"type": "module"` (`/Users/srajagopal/Work/wechart/packages/core/package.json`).
    - Vite 8.3.0 always applies the `import` and `default` conditions ([vite-conditions]). The repo uses Vite 8.3.0.
    - `d3-format@3.1.2`, which `format.ts` already imports, has the identical packaging shape: `type: module`, `exports {umd, default}`, `./locale/*` and the same `sideEffects` (`/Users/srajagopal/Work/wechart/node_modules/.pnpm/d3-format@3.1.2/node_modules/d3-format/package.json`).
    - The code is ES2015+ and dropped IE in v3 ([releases]), so it suits evergreen browsers.

## Open questions / unverified

- **UNVERIFIED (not executed):** every example output marked "derived" above, i.e. the `NaN` output, the week-edge example and the LA-timezone example. No JS runtime was available in this research session. The first TDD tests should pin them.
- **UNVERIFIED:** whether Cube ever returns time values with more than 3 fractional digits. A strict `utcParse('%Y-%m-%dT%H:%M:%S.%L')` would return `null` for them. Only `.SSS` has been observed (`docs/research/cube/data-apis.md`).
- **UNVERIFIED:** that no module in d3-time's graph uses top-level await. I read only d3-time-format's `index.js`, `defaultLocale.js`, `locale.js` and `isoFormat.js`. This only matters if something `require()`s the package.
- **UNVERIFIED:** that d3-array is pulled in only by d3-time's `ticks.js`. This is inferred from the export list ([d3-time-index]) and Bundlephobia's dependency sizes, not by reading `ticks.js`.
- **UNVERIFIED:** how to force a non-UTC zone in a Vitest run, to prove the `utcFormat`-vs-`timeFormat` test fails for the right reason. The Node 26 `TZ` docs section could not be fetched. WebSearch budget was exhausted, so it was not searched.
- **UNVERIFIED:** the `format: link` → `{type:'custom-time', value:'link'}` path. It comes from source reading only, and has not been checked with a curl of `/v1/meta` on the local Cube.
- **For the user or caller to decide:**
  - Should wechart map `%n`/`%t` to newline/tab (POSIX) or leave d3's literal letters?
  - Should a `custom-time` value with no recognised `%` directive (the `link` case) fall back to the granularity form?
  - What should `%Z`/`%s`/`%Q` show when a query's `timezone` is not UTC?

[npm-latest]: https://registry.npmjs.org/d3-time-format/latest
[npm-types]: https://registry.npmjs.org/@types/d3-time-format/latest
[npm-types-all]: https://registry.npmjs.org/@types/d3-time-format
[types-dts]: https://unpkg.com/@types/d3-time-format@4.0.3/index.d.ts
[docs]: https://d3js.org/d3-time-format
[readme]: https://github.com/d3/d3-time-format/blob/v4.1.0/README.md
[src-locale]: https://github.com/d3/d3-time-format/blob/v4.1.0/src/locale.js
[src-default]: https://github.com/d3/d3-time-format/blob/v4.1.0/src/defaultLocale.js
[src-index]: https://github.com/d3/d3-time-format/blob/v4.1.0/src/index.js
[src-iso]: https://github.com/d3/d3-time-format/blob/v4.1.0/src/isoFormat.js
[en-US]: https://github.com/d3/d3-time-format/blob/v4.1.0/locale/en-US.json
[test-utc]: https://github.com/d3/d3-time-format/blob/v4.1.0/test/utcFormat-test.js
[license]: https://github.com/d3/d3-time-format/blob/v4.1.0/LICENSE
[rel-410]: https://api.github.com/repos/d3/d3-time-format/releases/tags/v4.1.0
[releases]: https://github.com/d3/d3-time-format/releases
[compare]: https://github.com/d3/d3-time-format/compare/v4.1.0...main
[issues]: https://github.com/d3/d3-time-format/issues
[i115]: https://github.com/d3/d3-time-format/issues/115
[i120]: https://github.com/d3/d3-time-format/issues/120
[i123]: https://github.com/d3/d3-time-format/issues/123
[bundlephobia]: https://bundlephobia.com/api/size?package=d3-time-format@4.1.0
[npm-d3-time]: https://registry.npmjs.org/d3-time/latest
[d3-time-rel]: https://github.com/d3/d3-time/releases
[d3-time-index]: https://github.com/d3/d3-time/blob/v3.1.0/src/index.js
[d3-time-docs]: https://d3js.org/d3-time
[npm-d3-array]: https://registry.npmjs.org/d3-array/latest
[npm-internmap]: https://registry.npmjs.org/internmap/latest
[cube-dims]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/dimensions.mdx
[cube-validator]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts
[cube-meta]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeToMetaTransformer.ts
[cube-client-format]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-client-core/src/format.ts
[npm-cube-core]: https://registry.npmjs.org/@cubejs-client/core/1.7.42
[posix-strftime]: https://pubs.opengroup.org/onlinepubs/9799919799/functions/strftime.html
[cube-strptime-link]: https://pubs.opengroup.org/onlinepubs/009695399/functions/strptime.html
[mdn-utc]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/UTC
[mdn-date-string]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date#date_time_string_format
[mdn-getutcfullyear]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getUTCFullYear
[mdn-toisostring]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString
[mdn-unary-plus]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Unary_plus
[node-require-esm]: https://nodejs.org/docs/latest-v26.x/api/modules.html#loading-ecmascript-modules-using-require
[node-packages]: https://nodejs.org/docs/latest-v26.x/api/packages.html
[node-json]: https://nodejs.org/docs/latest-v26.x/api/esm.html#json-modules
[vite-conditions]: https://vite.dev/config/shared-options.html#resolve-conditions
[ts-vms]: https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html
[pnpm-add]: https://pnpm.io/cli/add
