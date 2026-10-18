---
library: Server-side LLM provider integration (direct SDKs vs the Vercel AI SDK)
packages: ["@anthropic-ai/sdk", "@anthropic-ai/sdk/helpers/zod", "@anthropic-ai/sdk/helpers/json-schema", openai, "openai/helpers/zod", "@google/genai", "@aws-sdk/client-bedrock-runtime", "@anthropic-ai/bedrock-sdk", ai, "ai/test", "@ai-sdk/anthropic", "@ai-sdk/openai", "@ai-sdk/azure", "@ai-sdk/amazon-bedrock", "@ai-sdk/google", msw]
version: "@anthropic-ai/sdk@0.135.0; openai@7.38.0; @google/genai@2.30.0; @aws-sdk/client-bedrock-runtime@3.1152.0; @anthropic-ai/bedrock-sdk@0.35.0; ai@7.0.143; @ai-sdk/anthropic@4.0.82; @ai-sdk/openai@4.0.96; @ai-sdk/azure@4.0.104; @ai-sdk/amazon-bedrock@5.0.118; @ai-sdk/google@4.0.99; msw@3.0.3 (alternative only); zod@4.6.5 (already in pnpm-lock.yaml, covered by supporting-utilities.md)"
researched: 2026-10-18
sources: [https://registry.npmjs.org/@anthropic-ai/sdk/latest, https://registry.npmjs.org/openai/latest, https://registry.npmjs.org/@google/genai/latest, https://registry.npmjs.org/@aws-sdk/client-bedrock-runtime/latest, https://registry.npmjs.org/@anthropic-ai/bedrock-sdk/latest, https://registry.npmjs.org/ai/latest, https://registry.npmjs.org/@ai-sdk/anthropic/latest, https://registry.npmjs.org/@ai-sdk/openai/latest, https://registry.npmjs.org/@ai-sdk/azure/latest, https://registry.npmjs.org/@ai-sdk/amazon-bedrock/latest, https://registry.npmjs.org/@ai-sdk/google/latest, https://registry.npmjs.org/msw/latest, https://registry.npmjs.org/zod/latest, https://platform.claude.com/docs/en/about-claude/models/overview, https://platform.claude.com/docs/en/build-with-claude/structured-outputs, https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools, https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock, https://platform.claude.com/docs/en/api/sdks/typescript, https://platform.claude.com/docs/en/api/rate-limits, https://github.com/anthropics/anthropic-sdk-typescript, https://raw.githubusercontent.com/openai/openai-node/master/README.md, https://developers.openai.com/api/docs/guides/structured-outputs, https://developers.openai.com/api/docs/models, https://developers.openai.com/api/reference/resources/responses/methods/create, https://developers.openai.com/api/docs/guides/your-data, https://learn.microsoft.com/en-us/azure/ai-foundry/openai/api-version-lifecycle, https://googleapis.github.io/js-genai/release_docs/index.html, https://ai.google.dev/gemini-api/docs/structured-output, https://ai.google.dev/gemini-api/docs/models, https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html, https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html, https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html, https://github.com/vercel/ai/tree/ai@7.0.0/content, https://genai.owasp.org/llmrisk/llm01-prompt-injection/, https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/, https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/]
---
# Server-side LLM provider integration (AI narrative, then the copilot)

## Summary

**What this covers.** This doc covers how `packages/api` (Fastify 5.12.5 on Node 26, `"type": "module"`; `/Users/srajagopal/Work/wechart/packages/api/package.json`) calls an LLM provider server-side for the AI narrative in rich text tiles. Round R80 decided "AI-written narrative in rich tiles? A: 'Now, with LLM settings'" (`/Users/srajagopal/Work/wechart/docs/requirements-log.md` L239). The later copilot uses the same integration. Its Super-Admin page already sketches Provider, write-only API key, Default and Fast model, Test connection, Limits and Usage (`/Users/srajagopal/Work/wechart/docs/design/references-copilot.md` L364–387).

**Requirements this serves.** No AC IDs exist yet for the narrative or the LLM settings: `docs/spec.md` has none (grep for "narrative" and "LLM" finds only the MCP glossary row and AC-443). The constraints come from R80 and the caller:
- facts are computed through Cube;
- every number is a live-value token, and a draft with a digit outside a token is rejected;
- the author reviews the draft, and nothing regenerates silently;
- the Super-Admin sets the provider, model and key globally;
- the key is encrypted at rest, never shown again, and used only server-side.

**Recommendation**
1. **Use the first-party SDKs directly, behind a small wechart `LlmProvider` port. Don't add the Vercel AI SDK.** The rule "every number is a token" depends on provider-specific constrained decoding. Each provider exposes that differently, and the direct SDKs expose it first and in full:
   - Anthropic's `output_config.format`;
   - OpenAI's strict `json_schema` plus `store: false`.

   The AI SDK adds a layer whose fallbacks can weaken the guarantee or fail on current models (see "Alternatives considered"). wechart's own validation, which the rule needs regardless, makes the AI SDK's post-hoc validation redundant.
2. **Day-one providers (proposal for the user to confirm; copilot open question 7, `references-copilot.md` L454–457):**
   - **Anthropic** (Claude API) through `@anthropic-ai/sdk@0.135.0`;
   - **OpenAI** and **Azure OpenAI**, both through `openai@7.38.0`. Azure goes through its v1 API `baseURL`, so one package covers both.

   Each of these has GA, schema-constrained output for its current models (sources below).
3. **Defer Amazon Bedrock and Google Gemini.**
   - **Bedrock:** current Claude models on Bedrock run on the "Claude in Amazon Bedrock" (Mantle) endpoint, which supports neither structured outputs nor, for the 5.5 models, forced tool use. Bedrock's production auth model is IAM roles rather than a pasted key (Gotchas 3 and 4).
   - **Gemini:** its structured-output surface is mid-transition: the docs lead with a new Interactions API, and the SDK marks `responseMimeType` deprecated (Gotcha 6).
4. **Key at rest:** AES-256-GCM through `node:crypto`, reusing the scheme already researched in `/Users/srajagopal/Work/wechart/docs/research/credential-encryption.md`. That doc is superseded only for *data-source* secrets, which wechart must not be able to open. For LLM keys wechart itself makes the calls, so the server-held-key design fits (`references-copilot.md` L458–461, option (a)). Load the key-encryption key through the existing `keyOf(env, setting)` / `_FILE` pattern (`/Users/srajagopal/Work/wechart/packages/api/src/config.ts` L323–332). Bind each ciphertext to its provider and endpoint (§ Key handling).
5. **Testing:** no live calls in CI.
   - Point each SDK's `baseURL` at an in-process fake provider server, following the existing xcube fake (`/Users/srajagopal/Work/wechart/packages/api/src/xcube/fake.ts`).
   - Replay recorded, scrubbed response fixtures.
   - MSW 3.0.3 is a sourced alternative that isn't needed.

## Install

Day one (recommended):
```sh
pnpm --filter @wechart/api add @anthropic-ai/sdk@0.135.0 openai@7.38.0
# zod@4.6.5 is already resolved in pnpm-lock.yaml (L2725); add it as a direct dependency of @wechart/api
pnpm --filter @wechart/api add zod@4.6.5
```

**Package facts.** Each claim is from the registry `latest` document unless noted.

| Package | Version | License | Module format | Node | Runtime deps / peers |
|---|---|---|---|---|---|
| `@anthropic-ai/sdk` | 0.135.0 | MIT | Dual: `main ./index.js`, `module ./index.mjs`, exports map for both ([npm][npm-anth]) | "Node.js 20 LTS or later ([non-EOL]) versions" ([TS SDK docs][anth-ts]); no `engines` field ([npm][npm-anth]) | `standardwebhooks`, `json-schema-to-ts`, `@opentelemetry/api`; optional peer `zod ^3.25.0 \|\| ^4.0.0` ([npm][npm-anth]) |
| `openai` | 7.38.0 | Apache-2.0 | Dual, through the exports map; subpaths include `azure`, `helpers`, `providers` ([npm][npm-openai]) | `engines` `>=22.0.0` ([npm][npm-openai]). README: "Node.js 22 and 24 LTS. Node.js 22 is the minimum supported version" ([README][openai-readme]). **Node 26 is not named** (Open questions) | All peers optional: `ws`, `zod ^3.25 \|\| ^4.0`, `undici >=5 <9`, `@smithy/*`, `@aws-sdk/credential-provider-node` ([npm][npm-openai]) |
| `@google/genai` | 2.30.0 | Apache-2.0 | `type: module`; node `import` → `dist/node/index.mjs`, `require` → `.cjs` ([npm][npm-genai]) | `>=20.0.0` | `ws`, `p-retry`, `protobufjs`, `google-auth-library`; optional peer `@modelcontextprotocol/sdk` ([npm][npm-genai]) |
| `@aws-sdk/client-bedrock-runtime` | 3.1152.0 | Apache-2.0 | `main ./dist-cjs`, `module ./dist-es` ([npm][npm-bedrock]) | `>=20.0.0` | 12 `@aws-sdk/*` and `@smithy/*` packages, including `credential-provider-node` and `token-providers` ([npm][npm-bedrock]) |
| `@anthropic-ai/bedrock-sdk` | 0.35.0 | MIT | `type: commonjs`, with ESM entry points ([npm][npm-anth-bedrock]) | none listed | `@anthropic-ai/sdk >=0.115.1 <1`, `@aws-sdk/client-bedrock-runtime ^3.797.0`, `@aws-sdk/credential-providers` and more ([npm][npm-anth-bedrock]) |
| `ai` | 7.0.143 | Apache-2.0 | ESM (`type: module`); subpaths `./test`, `./internal` ([npm][npm-ai]) | `>=22` | `@ai-sdk/gateway 4.0.116`, `@ai-sdk/provider 4.0.29`, `@ai-sdk/provider-utils 5.0.62`; peer `zod ^3.25.76 \|\| ^4.1.8` ([npm][npm-ai]) |
| `@ai-sdk/anthropic` / `openai` / `azure` / `amazon-bedrock` / `google` | 4.0.82 / 4.0.96 / 4.0.104 / 5.0.118 / 4.0.99 | Apache-2.0 | ESM | `>=22` | Pinned `@ai-sdk/provider 4.0.29` and `provider-utils 5.0.62`. `azure` also pulls `@ai-sdk/openai` and `@ai-sdk/deepseek`. `amazon-bedrock` pulls `@ai-sdk/openai`, `@ai-sdk/anthropic`, `aws4fetch` and `@smithy/*` ([npm anth][npm-aisdk-anth], [openai][npm-aisdk-openai], [azure][npm-aisdk-azure], [bedrock][npm-aisdk-bedrock], [google][npm-aisdk-google]) |
| `msw` (alternative test tool) | 3.0.3 | MIT | ESM | `>=22.12.0` | optional peers `vite`, `graphql`, `typescript` ([npm][npm-msw]) |
| `zod` | 4.6.7 latest ([npm][npm-zod]); **4.6.5 in the lockfile** | MIT | ESM | — | 4.6.5 satisfies every peer range above |

**Versioning caveat (Anthropic).** "This package generally follows SemVer conventions, though certain backward-incompatible changes may be released as minor versions" ([TS SDK docs][anth-ts]). It is also 0.x. Pin it exactly, which wechart already does for every dependency.

## Init / auth pattern

Every client is built **per call** (or cached per settings revision) from the settings row. The decrypted key is passed explicitly, and so is every option the SDK would otherwise read from the environment.

**Why the options must be explicit.**
- **Anthropic.**
  - `apiKey` defaults to `process.env['ANTHROPIC_API_KEY']` ([TS SDK docs][anth-ts]).
  - `baseURL` defaults to `readEnv('ANTHROPIC_BASE_URL')`, then `https://api.anthropic.com` ([client.ts via Context7][anth-client]).
  - The log level comes from `ANTHROPIC_LOG` unless `logLevel` is set ([TS SDK docs][anth-ts]).
  - OpenTelemetry options come from `ANTHROPIC_OPEN_TELEMETRY*` variables unless the `openTelemetry` option is set ("A client with the option does not read them") ([README via Context7][anth-otel]).
- **OpenAI** reads `OPENAI_API_KEY` ([README][openai-readme]). Microsoft documents `OPENAI_BASE_URL` too ([Azure v1][az-v1]). The log level comes from `OPENAI_LOG` unless `logLevel` is set ([README][openai-readme]).
- **Gemini** reads `GOOGLE_API_KEY`. `GOOGLE_GENAI_USE_ENTERPRISE`, `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` switch it to the Vertex/Enterprise platform ([genai docs][genai-docs]).
- **AWS:** explicit client configuration outranks environment variables, which outrank `~/.aws/config` ([AWS retry behavior][aws-retry]; the precedence section is general to AWS SDK settings).

A stray `*_BASE_URL` in the pod's environment would otherwise send the decrypted key to another host. A stray `*_LOG=debug` would log bodies: at debug, Anthropic logs "all HTTP requests and responses… including headers and bodies" ([TS SDK docs][anth-ts]).

```ts
// packages/api/src/llm/clients.ts (sketch)
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export interface LlmSettings {
  readonly provider: 'anthropic' | 'openai' | 'azure-openai';
  readonly baseURL: string;        // stored, shown to the Super-Admin, bound into the key's AAD
  readonly model: string;          // e.g. 'claude-sonnet-5-5', or an Azure deployment name
}

const COMMON = { maxRetries: 0, timeout: /* a spec decision, ms */ 60_000, logLevel: 'off' } as const;

export function anthropicClient(s: LlmSettings, apiKey: string): Anthropic {
  return new Anthropic({
    ...COMMON,
    apiKey,
    baseURL: s.baseURL,                                   // never left to ANTHROPIC_BASE_URL
    openTelemetry: { traces: { contentMode: 'metadata_only' }, propagation: false },
  });
}

export function openaiClient(s: LlmSettings, apiKey: string): OpenAI {
  // OpenAI: https://api.openai.com/v1 ; Azure v1: https://<resource>.openai.azure.com/openai/v1/
  return new OpenAI({ ...COMMON, apiKey, baseURL: s.baseURL });
}
```

Sources for the sketch:
- `maxRetries`, `timeout`, `logLevel`, `logger` and `fetchOptions` are client options ([TS SDK docs][anth-ts]).
- `openTelemetry` options ([README via Context7][anth-otel]).
- OpenAI exposes the same `maxRetries`, `timeout` and `logLevel` names ([README][openai-readme]).
- The Azure v1 `baseURL` form and `apiKey` usage: `new OpenAI({ baseURL: "https://YOUR-RESOURCE-NAME.openai.azure.com/openai/v1/", apiKey: "{your-api-key}" })`; "`api-version` is no longer a required parameter with the v1 GA API" ([Azure v1][az-v1]).
- `baseURL` "accepts both `https://YOUR-RESOURCE-NAME.openai.azure.com/openai/v1/` and `https://YOUR-RESOURCE-NAME.services.ai.azure.com/openai/v1/`" ([Azure v1][az-v1]).
- The 60 s value is a placeholder: the timeout is a spec decision (Open questions).

**Azure with Entra ID instead of a key.** The same `OpenAI` client takes a token provider as `apiKey` (`getBearerTokenProvider(new DefaultAzureCredential(), 'https://ai.azure.com/.default')`) ([Azure v1][az-v1]). That would need `@azure/identity`, which is not researched here; with it no key would be stored at all (Open questions).

**Current model IDs.** The Super-Admin chooses, so these are inputs, not defaults.
- **Anthropic** current lineup ([models overview][anth-models]):

  | Model | API ID | Bedrock ID | Pricing (in / out, per MTok) |
  |---|---|---|---|
  | Claude Fable 5.1 | `claude-fable-5-1` | `anthropic.claude-fable-5-1` | $10 / $50 |
  | Claude Opus 5.5 | `claude-opus-5-5` | `anthropic.claude-opus-5-5` | $4 / $20 |
  | Claude Sonnet 5.5 | `claude-sonnet-5-5` | `anthropic.claude-sonnet-5-5` | $2 / $10 |
  | Claude Haiku 5.5 | `claude-haiku-5-5` | `anthropic.claude-haiku-5-5` | from $0.10 / from $0.50 |

  - "Every Claude model ID is a pinned snapshot, including the dateless IDs used from the 4.6 generation on" ([models overview][anth-models]).
  - Each model's `capabilities` can be read from the Models API ([models overview][anth-models]). Test connection can use that.
- **OpenAI:** `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-luna` ([OpenAI models][oai-models]).
  - Structured Outputs "is available in our latest large language models, starting with GPT-4o" ([OpenAI structured outputs][oai-so]).
  - Per-model confirmation for the GPT-6 family is UNVERIFIED: the models page summary didn't state it.
- **Azure:** the `model` field is the **deployment name** ("Replace with your model deployment name") ([Azure v1][az-v1]).

## API surface we will use

### 1. The narrative contract: typed segments

The model returns JSON only, never prose. Every number comes from a fact wechart computed through Cube and is referenced by id:

```ts
import * as z from 'zod';

export const Segment = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string() }),
  z.object({ kind: z.literal('value'), ref: z.string() }),   // a fact id wechart issued for this request
]);
export const Narrative = z.object({ segments: z.array(Segment) });
```

**Why it is shaped this way:**
- **Root object, all properties required, `additionalProperties: false`.**
  - OpenAI strict mode requires a root object, every property required and `additionalProperties: false` ([OpenAI structured outputs][oai-so]).
  - Anthropic requires `additionalProperties: false` on objects ([Anthropic structured outputs][anth-so]).
  - Anthropic also puts "required properties… first, followed by optional properties". Marking all properties required keeps the order ([Anthropic structured outputs][anth-so]).
- **`anyOf` for the union, not `oneOf`.**
  - Anthropic supports "`anyOf` and `allOf` (with limitations…)", and `oneOf` is in neither its supported nor its unsupported list ([Anthropic structured outputs][anth-so]).
  - OpenAI allows `anyOf` except at the root ([OpenAI structured outputs][oai-so]).
  - Check that zod 4.6.5's JSON Schema output for `discriminatedUnion` is `anyOf` and not `oneOf` (UNVERIFIED; test it).
- **No `minLength`, `maxLength`, `minimum` or `maximum`, and `minItems` only 0 or 1.** Anthropic doesn't support these ([Anthropic structured outputs][anth-so]), nor does Bedrock ([Bedrock structured outputs][br-so]).
- **`ref` is a plain string rather than a per-request `enum` of fact ids.**
  - Anthropic compiles a grammar per schema, with "additional latency" the first time, cached 24 h. "The cache is invalidated if you change: The JSON schema structure" ([Anthropic structured outputs][anth-so]).
  - Whether changing only `enum` members counts as a structure change is UNVERIFIED.
  - A static schema keeps the grammar cached; membership is enforced by wechart's validator below.
- **Digits in `text`.** A schema `pattern` like `^[^0-9]*$` could enforce "no digit outside a token" at decode time on Anthropic, which supports `pattern` with listed exclusions (backreferences, lookaround, `\b`, large `{n,m}`) ([Anthropic structured outputs][anth-so]).
  - Gemini's supported-keyword list has no `pattern` ([genai GenerateContentConfig][genai-cfg]).
  - OpenAI's pattern support was not retrieved (UNVERIFIED).
  - So the **authoritative check is wechart's validator on every provider**. The schema pattern is defence in depth where supported.

**wechart's validator (after parsing, before anything is stored or shown).** OWASP LLM05: "Treat the model as any other user, adopting a zero-trust approach, and apply proper input validation on responses" ([OWASP LLM05][owasp-05]). Reject the draft when any of these holds:
1. it doesn't parse against `Narrative`;
2. a `value.ref` isn't in this request's fact set;
3. a `text` segment matches `/\p{Nd}/u`. That catches any Unicode decimal digit, not just ASCII 0–9. Whether spelled-out numbers ("twelve") also count is a spec question (Open questions);
4. the provider's stop reason is a refusal or a length cut-off (§ 2 and § 3).

### 2. Anthropic: `@anthropic-ai/sdk@0.135.0`

**JSON outputs (GA)**
- The request field is `output_config.format: { type: 'json_schema', schema }`, with no beta header. The older `output_format` "is deprecated" and needs the `structured-outputs-2025-11-13` beta header ([Anthropic structured outputs][anth-so]).
- The helper is `client.messages.parse({ …, output_config: { format: zodOutputFormat(Schema) } })`, which returns `response.parsed_output`. Import `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod`, or `jsonSchemaOutputFormat` from `@anthropic-ai/sdk/helpers/json-schema` ([Anthropic structured outputs][anth-so]).
- **Supported models:** `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` and `claude-fable-5-1`, back to Opus 4.6 ([Anthropic structured outputs][anth-so]).
- **Refusal:** "`stop_reason: "refusal"`… 200 status code… billed… The output may not match your schema." Treat it as a failed draft.
- **Length:** with "`stop_reason: "max_tokens"`… The output may be incomplete and not match your schema" ([Anthropic structured outputs][anth-so]).
- **Streaming** works, but the full response must be accumulated before parsing ([Anthropic structured outputs][anth-so]). The narrative needs no streaming.
- **Limits:** "20 strict tools per request; 24 optional parameters total across all strict schemas; 16 parameters with union types" ([Anthropic structured outputs][anth-so]).
- **Data retention:** "Prompts and responses are processed with ZDR when using structured outputs. However, the JSON schema itself is temporarily cached for up to 24 hours" ([Anthropic structured outputs][anth-so]). Our schema holds no user data.

**Tools (for the copilot)**
- Set `strict: true` per tool for schema-valid inputs ([Anthropic structured outputs][anth-so]).
- **Forced tool choice fails on the current flagship models.** For "Claude Opus 5.5, Claude Sonnet 5.5, Claude Fable 5.1, and Claude Mythos 5.1", `any` and `tool` "return a 400 error". Use "`auto` with strict tool use… or structured outputs when you need a response in a fixed JSON shape" ([define tools][anth-tools]).
- So the narrative must use `output_config.format`, not a forced "json" tool.

**Usage**
- `message.usage` carries `input_tokens` and `output_tokens` ([TS SDK docs][anth-ts]), plus `cache_creation_input_tokens` and `cache_read_input_tokens`. Total input is `cache_read_input_tokens + cache_creation_input_tokens + input_tokens` ([rate limits][anth-rl]).
- `message._request_id` is filled from the `request-id` header ([TS SDK docs][anth-ts]).

**Errors**
- `APIError` subclasses by status: 400 `BadRequestError`, 401 `AuthenticationError`, 403 `PermissionDeniedError`, 404 `NotFoundError`, 409 `ConflictError`, 422 `UnprocessableEntityError`, 429 `RateLimitError`, ≥500 `InternalServerError`, and `APIConnectionError`. A timeout throws `APIConnectionTimeoutError` ([TS SDK docs][anth-ts]).
- Detect an abort with `isAbortError` rather than `instanceof` ([CLAUDE.md via Context7][anth-claude-md]).

**Retries and timeouts**
- Requests are "retried 2 times by default"; connection errors, 408, 409, 429 and ≥500 are retried ([TS SDK docs][anth-ts]).
- The default timeout is 10 minutes, scaled up for large non-streaming `max_tokens`. "Requests that time out are retried twice by default" ([TS SDK docs][anth-ts]).

```ts
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const res = await anthropicClient(s, key).messages.parse(
  {
    model: s.model,
    max_tokens: 1024,                          // a spec decision
    system: SYSTEM_PROMPT,                     // fixed text; nothing users wrote
    messages: [{ role: 'user', content: renderFacts(facts) }],   // § Gotcha 9
    output_config: { format: zodOutputFormat(Narrative) },
  },
  { signal },                                   // RequestOptions.signal (AbortSignal)
);
if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') throw new DraftRejected(res.stop_reason);
const draft = validateNarrative(res.parsed_output, facts);  // § 1
record({ usage: res.usage, requestId: res._request_id });
```

`RequestOptions` has `timeout`, `maxRetries` and `signal` per request ([request-options.ts via Context7][anth-reqopts]).

### 3. OpenAI and Azure OpenAI: `openai@7.38.0`

**API choice:** "The **Responses API** is the recommended primary interface", and Chat Completions "remains supported indefinitely" ([README][openai-readme]). Microsoft also recommends the Responses API for Azure OpenAI models ([Azure v1][az-v1]).

**Structured Outputs**
- The request field is `text: { format: { type: 'json_schema', strict: true, schema } }`.
- The helper is `openai.responses.parse({ …, text: { format: zodTextFormat(Schema, 'name') } })`, which returns `response.output_parsed`. Import `zodTextFormat` from `openai/helpers/zod` ([OpenAI structured outputs][oai-so]).
- "Structured Outputs ensure schema adherence", unlike JSON mode, which only guarantees valid JSON ([OpenAI structured outputs][oai-so]).
- **Refusals** come back as `{ type: "refusal", "refusal": "message" }` and must be handled in code ([OpenAI structured outputs][oai-so]).
- **Incomplete responses:** check `status` and `incomplete_details`, which are fields of the response object ([Responses create][oai-create]). The exact `incomplete_details.reason` values were not retrieved (UNVERIFIED).

**Data retention: send `store: false`.** "`store`… Defaults to true when omitted. If set to true, response data will be stored for at least 30 days" ([Responses create][oai-create]; [Your data][oai-data]). The narrative is stateless and needs no stored responses.

**Usage:** `usage.input_tokens`, `input_tokens_details.cached_tokens`, `output_tokens`, `output_tokens_details.reasoning_tokens` and `total_tokens` ([Responses create][oai-create]). `_request_id` comes from `x-request-id` ([README][openai-readme]).

**Retries and timeouts:** the same defaults as Anthropic. Two retries for connection errors, 408, 409, 429 and 5xx; a 10-minute default timeout; `APIConnectionTimeoutError` ([README][openai-readme]).

**Logging:** at `debug`, "HTTP request and response metadata and headers are logged. Authentication-related headers are redacted" ([README][openai-readme]).

**Azure**
- The README still documents an `AzureOpenAI` class with `azureADTokenProvider` and `apiVersion`, and warns that "static types for responses / params won't always be correct" ([README][openai-readme]).
- Microsoft's v1 GA API instead uses the plain `OpenAI` client with `baseURL …/openai/v1/` ([Azure v1][az-v1]). **Use the v1 path** with the plain `OpenAI` client. That one code path then serves OpenAI and Azure.
- Whether Azure's v1 Responses API accepts `text.format` json_schema `strict` for every deployed model is UNVERIFIED. The 2024-08-01-preview changelog lists "Structured outputs support" ([Azure v1][az-v1]). Test connection must exercise it (§ 7).

```ts
import { zodTextFormat } from 'openai/helpers/zod';

const res = await openaiClient(s, key).responses.parse(
  {
    model: s.model,                 // the Azure deployment name on Azure
    instructions: SYSTEM_PROMPT,
    input: renderFacts(facts),
    text: { format: zodTextFormat(Narrative, 'narrative') },
    store: false,
  },
  { signal },
);
```

`instructions` and `input` as Responses fields: the field list was read from the create reference ([Responses create][oai-create]). That `instructions` behaves as a system message is UNVERIFIED from the summary retrieved.

### 4. Amazon Bedrock (deferred; facts for the decision)

There are **two Claude integrations**:
- **"Claude in Amazon Bedrock" (Mantle)**, `https://bedrock-mantle.{region}.api.aws/anthropic/v1/messages`.
  - It uses the same Messages API shape, through `AnthropicBedrockMantle` from `@anthropic-ai/bedrock-sdk` ([Claude in Bedrock][anth-bedrock]).
  - Its unsupported features include "Structured outputs" ([Claude in Bedrock][anth-bedrock]).
  - AWS: "The output_config.format parameter is rejected with a 400 error. To use structured outputs with Anthropic Claude models, send the request through the Converse API or the InvokeModel API on the bedrock-runtime endpoint" ([Bedrock structured outputs][br-so]).
- **The legacy `InvokeModel` / `Converse` path** (`AnthropicBedrock`, or `@aws-sdk/client-bedrock-runtime`).
  - Anthropic lists Bedrock structured outputs only "on the legacy… integration for Claude Opus 4.6, Claude Sonnet 4.6, Claude Sonnet 4.5, Claude Opus 4.5, and Claude Haiku 4.5" ([Anthropic structured outputs][anth-so]).
  - The models overview says the Bedrock IDs it lists are for "Bedrock's Messages-API endpoint (Claude Opus 4.7 and later…)" ([models overview][anth-models]).
  - So whether `claude-*-5-5` can be reached through Converse with `outputConfig.textFormat` is **UNVERIFIED and doubtful**.
- **Converse structured output:** `outputConfig.textFormat: { type: 'json_schema', structure: { jsonSchema: { schema: '<JSON string>', name } } }`, and strict tools through `toolSpec.strict: true` ([Bedrock structured outputs][br-so]).
  - "For new schemas, Amazon Bedrock compiles the grammar, which may take up to a few minutes", then caches it for 24 h ([Bedrock structured outputs][br-so]).

**Auth: a poor fit for "the Super-Admin pastes a key".**
- Bedrock API keys: short-term keys are "Recommended for production use", up to 12 h. Long-term keys are "Recommended only for exploration": "Long-term keys are for exploration only. For production, use short-term keys" ([Bedrock API keys][br-keys]).
- Anthropic ranks bearer tokens as "least preferred" for Mantle and recommends a Bedrock service role or IAM assumed roles ([Claude in Bedrock][anth-bedrock]).
- A pod IAM role (no stored key at all) would be the secure design. That changes the settings UI (Open questions).
- Whether `@aws-sdk/client-bedrock-runtime` accepts a bearer API key as a constructor option is UNVERIFIED. Its README doesn't mention it ([client README][br-readme]). It depends on `@aws-sdk/token-providers` ([npm][npm-bedrock]), and AWS documents `AWS_BEARER_TOKEN_BEDROCK` and `Authorization: Bearer` ([Bedrock API keys][br-keys]).

**Retries:** the AWS SDK's standard mode is the default, with "Max attempts… 3", a retry quota, and an 8 s… (no: a 20 s) backoff cap ([AWS retry behavior][aws-retry]). The page also says the updated behaviour "requires opting in… Set `AWS_NEW_RETRIES_2026=true`" ([AWS retry behavior][aws-retry]).

### 5. Google Gemini (deferred; facts for the decision)

- **Client:** `new GoogleGenAI({ apiKey, httpOptions })`. `httpOptions` has `baseUrl`, `headers`, `timeout` (ms) and `retryOptions` ([genai GoogleGenAIOptions][genai-opts]; [HttpOptions][genai-http]).
- **Retries:** `HttpRetryOptions.attempts` is the "Maximum number of attempts, including the original request… If not specified, default to 5" ([HttpRetryOptions][genai-retry]).
- **Structured output through `models.generateContent`:** `config.responseJsonSchema` with `responseMimeType: 'application/json'`. Only the listed keywords are supported, `oneOf` is "interpreted the same as `anyOf`", and `pattern` isn't in the list ([GenerateContentConfig][genai-cfg]).
- **The surface is in flux:**
  - `GenerationConfig.responseMimeType` is marked "Deprecated: Use `response_format` instead" ([GenerationConfig][genai-gencfg]).
  - Google's structured-output page now shows `client.interactions.create({ model: 'gemini-3.8-flash', response_format: { type: 'text', mime_type: 'application/json', schema } })` ([Gemini structured output][gem-so]).
- **Validation:** Google advises "While output is syntactically correct JSON, always validate values in your application" ([Gemini structured output][gem-so]).
- **Models:** stable IDs include `gemini-4-argon` and `gemini-3.8-flash` ([Gemini models][gem-models]). Per-model structured-output support was not listed on that page (UNVERIFIED).
- **Usage:** `usageMetadata.candidatesTokenCount` ([genai usage][genai-usage]). `promptTokenCount` and `totalTokenCount` are UNVERIFIED from the pages read.

### 6. The Vercel AI SDK `ai@7.0.143` (evaluated, not recommended)

- **Structured output.** `generateObject` is deprecated; use `generateText({ model, output: Output.object({ schema }) })` and read `result.output` ([AI SDK common errors][aisdk-errors]). A failure throws `NoObjectGeneratedError`, carrying `text`, `response`, `usage` and `cause` ([AI SDK structured data][aisdk-struct]). AI SDK 7 removed `experimental_output` ([AI SDK 7 migration][aisdk-mig]).
- **Retries:** "Maximum number of retries… Default: 2" ([generateText reference][aisdk-gt]).
- **Timeouts:** `timeout` as a number, or `{ totalMs, stepMs, toolMs, tools }` ([generateText reference][aisdk-gt]).
- **Testing:** `MockLanguageModelV4` from `ai/test`, plus `simulateReadableStream` ([AI SDK testing][aisdk-test]).
- **Anthropic provider:** `structuredOutputMode: "outputFormat" | "jsonTool" | "auto"`; `auto` means "Use `outputFormat` when supported, otherwise fall back to `jsonTool`" ([AI SDK Anthropic][aisdk-anth]).
- **Schema sanitising:** the Anthropic adapter removes `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `minItems` and more from the schema it sends, "encodes them as human-readable description text", and validates the full schema afterwards ([sanitize-json-schema.ts][aisdk-sanitize]).
- **OpenAI-compatible adapter:** when `supportsStructuredOutputs` isn't true it falls back to `{ type: 'json_object' }` "with the schema dropped" ([openai-compatible model][aisdk-compat]).
- **The default global provider:** a plain string model ID "uses the global provider (defaults to gateway)", the Vercel AI Gateway ([provider management][aisdk-provider]). `ai` depends on `@ai-sdk/gateway` regardless ([npm][npm-ai]).
- **Telemetry** is opt-out once an integration is registered: "all AI SDK calls emit telemetry events by default" ([AI SDK 7 migration][aisdk-mig]). The OpenTelemetry integration records `gen_ai.input.messages` and `gen_ai.output.messages` under `recordInputs` / `recordOutputs` ([otel source][aisdk-otel]).

### 7. Test connection (the Super-Admin page)

Make one real call, with a small fixed fact set and the production `Narrative` schema. Map the outcome to the check rows the copilot design lists: "reachable, key accepted, model available, tools supported…" (`references-copilot.md` L375).
- `APIConnectionError` → not reachable.
- `AuthenticationError` → key rejected.
- `NotFoundError` → model unknown. That mapping is an inference from the error table ([TS SDK docs][anth-ts]); the provider's `error.type` should be checked too.
- A 400 naming `output_config`, or forced tool use → structured output not supported.
- A parse or validation failure → the model can't follow the contract.

## Key handling

### What exists in wechart today

- **No AES-GCM code exists** in `packages/` (grep for `createCipheriv`, `aes-256-gcm` and `createDecipheriv` finds nothing).
- **`credential-encryption.md`** has a complete `node:crypto` AES-256-GCM design (keyring, key id, AAD, rotation, dump test). It was superseded **for data-source secrets only**, because of decision 7: wechart must not be able to decrypt those (`/Users/srajagopal/Work/wechart/docs/research/credential-encryption.md` L10–17).
- **`credential-sealing.md` (HPKE to xcube) doesn't fit LLM keys.** wechart's API must use the plaintext key itself to call the provider. Sealing to xcube would mean routing every LLM call through xcube. That is the copilot design's option (b) (`references-copilot.md` L460), and xcube has no such route.
- **Config already loads secrets** through `keyOf(env, setting)`: a value, or the file `${setting}_FILE` names (`/Users/srajagopal/Work/wechart/packages/api/src/config.ts` L323–332).
- **There is a rotation precedent:** `WECHART_SIGNING_KEY` with `WECHART_SIGNING_NEXT_KEY` (`config.ts` L113–120).

### Recommended scheme

Reuse `credential-encryption.md`'s scheme v1 verbatim, with three changes:
1. **Its own key.** A new key-encryption key, e.g. `WECHART_LLM_KEY_KEYRING_FILE` naming a mounted Secret directory. The names are proposals.
   - It is separate from the service, signing and seed keys. NIST: a GCM key "shall be used exclusively for GCM with the chosen block cipher" (cited there, [SP 800-38D §5.1][nist-gcm]).
   - "Encryption keys should be stored in a separate location from encrypted data" (OWASP, cited there).
2. **AAD binds the provider and the endpoint,** not only the row id:
   `"wechart/llm-api-key/v1" \0 <settings id> \0 <provider> \0 <normalized baseURL origin>`.
   - **Why.** Someone who can write wechart's database, or a Super-Admin session hijack, could otherwise point the stored key at a host they control by editing `baseURL` and pressing Test.
   - This is the same threat `credential-sealing.md` closes for data sources by binding the connection target (L182–234).
   - **Rule for the spec:** changing the provider or the endpoint clears the stored key and demands it again. A changed AAD makes the old ciphertext fail `final()`.
3. **Rotation:** follow `credential-encryption.md` § "Key rotation and re-encryption" (L253–265):
   - add `k2`, make it active, and roll the API;
   - re-seal rows still on `k1` with a compare-and-swap;
   - check that no row still uses `k1`, then retire it.

   There is one row per deployment (global settings), so the re-seal is trivial. Keep retired KEKs for as long as backups made before the re-seal are kept.
   - **Rotating the provider key itself** is the Super-Admin's **Replace…** action (`references-copilot.md` L373). Re-test before save.

**Everything else carries over from `credential-encryption.md`:**
- the GCM rules: `authTagLength: 16` on both sides, a random 12-byte IV per seal, at most 2^32 seals per key;
- the `bytea` storage;
- the separate table, so `SELECT *` on settings never loads it;
- the dump test with a canary;
- Gotchas 1–12.

### Never log keys or prompts

- **Fastify/pino.** `main.ts` sets `logger: true` (`/Users/srajagopal/Work/wechart/packages/api/src/main.ts` L334). Request bodies aren't serialised by the default `req` serializer (`credential-encryption.md` Gotcha 6, citing Fastify 5.12 Logging).
  - Don't add body logging to the settings route or the narrative route.
  - Add pino `redact` paths for any header that might carry a key.
  - The settings response schema omits the key, so Fastify's response serialisation drops it (`credential-encryption.md` § AC-164, citing `api-framework.md`).
- **SDK logging.**
  - Set `logLevel: 'off'` explicitly. "At the `'debug'` level, all HTTP requests and responses are logged, including headers and bodies. Some authentication-related headers are redacted, but sensitive data in request and response bodies may still be visible" ([TS SDK docs][anth-ts]).
  - The option "overrides the environment variable if set" ([TS SDK docs][anth-ts]), so `ANTHROPIC_LOG=debug` in the pod can't turn it on.
  - The same holds for OpenAI's `OPENAI_LOG` ([README][openai-readme]).
- **SDK tracing.**
  - The Anthropic SDK creates spans by default once a tracer provider is registered, with `contentMode` defaulting to `'metadata_only'` ([tracing.ts via Context7][anth-tracing]). wechart registers none today (UNVERIFIED beyond grepping `packages/api/package.json`, which has no `@opentelemetry/*`).
  - Pass the `openTelemetry` option explicitly, so `ANTHROPIC_OPEN_TELEMETRY_TRACES_CONTENT_MODE=content` can't add prompt content to spans ([README via Context7][anth-otel]).
  - `propagation: false` stops trace headers going to the provider ([README via Context7][anth-otel]).
- **Error text.** Store and return only wechart's own messages and the provider's `request_id`. Never the raw `APIError.message` or headers, which may echo request content (UNVERIFIED whether they do; scrub regardless).
  - Before anything is stored, replace the decrypted key's exact string in any captured text. That is the same discipline as xcube's redaction (`credential-sealing.md` Gotcha 12).
- **Usage records** keep user, provider, model, token counts, request id, duration and outcome. They never keep prompt text, fact values or the draft. Whether drafts are audited is open question 13 in `references-copilot.md` (L466).

## Gotchas

1. **Forced tool use returns a 400 on Opus 5.5, Sonnet 5.5, Fable 5.1 and Mythos 5.1** ([define tools][anth-tools]). Never build the narrative on `tool_choice: {type:'tool'}` "JSON tool" tricks. Use `output_config.format`.
2. **Anthropic structured outputs: refusal and `max_tokens` stops return 200 and may not match the schema** ([Anthropic structured outputs][anth-so]). Check `stop_reason` before trusting `parsed_output`.
3. **Bedrock's current Claude endpoint (Mantle) has no structured outputs.** It is rejected "with a 400 error" ([Bedrock structured outputs][br-so]; [Claude in Bedrock][anth-bedrock]).
4. **Bedrock long-term API keys are "for exploration only"** ([Bedrock API keys][br-keys]). A pasted-key model for Bedrock contradicts AWS's own guidance.
5. **OpenAI Responses stores data by default** (`store` "Defaults to true… stored for at least 30 days") ([Responses create][oai-create]). Always send `store: false`.
6. **Gemini's structured-output API is mid-migration.**
   - `responseMimeType` is deprecated in favour of `response_format` ([GenerationConfig][genai-gencfg]).
   - The docs lead with `client.interactions.create` ([Gemini structured output][gem-so]).
   - Google tells apps to "always validate values".
7. **SDKs read keys, base URLs, log levels and tracing from environment variables.** Pass every one explicitly (§ Init). A stray `ANTHROPIC_BASE_URL` or `OPENAI_BASE_URL` would send the decrypted key elsewhere ([client.ts][anth-client]; [Azure v1][az-v1]).
8. **Retries multiply cost and latency, and some retries are futile.**
   - SDK defaults: Anthropic 2 retries, OpenAI 2 retries, Gemini 5 attempts, AWS 3 attempts, and the AI SDK 2 retries (sources in § API surface).
   - Timeouts are also retried ([TS SDK docs][anth-ts]).
   - **Recommendation:** `maxRetries: 0` in the SDK, and one wechart-owned retry policy honouring `retry-after`.
   - **Spend-cap 429:** "the response has no `retry-after` header. Retrying, including the SDK's automatic retries, fails until access resumes", with `error.details.error_code` `enforced_spend_limit_reached` ([rate limits][anth-rl]). Map it to the "quota reached" state, with no retry.
9. **Prompt injection from data.** Dashboard titles, member names and fact labels are untrusted.
   - OWASP LLM01 calls this indirect prompt injection. Its mitigations include "Constrain model behavior", "Define and validate expected output formats", "Segregate and identify external content" and "Require human approval for high-risk actions" ([OWASP LLM01][owasp-01]).
   - **Fixed system prompt** with nothing users wrote, mirroring AC-443 for MCP (`docs/spec.md` L1428).
   - **Facts as a delimited JSON data block** labelled as untrusted data.
   - **No tools on the narrative call,** so injected text can't trigger an action.
   - **Output is data only** (§ 1). It is rendered as text nodes, never HTML (R80: "no raw HTML or scripts", `requirements-log.md` L248).
   - **Author review** before anything is published (R80, L239).
   - Injection can still bias the *wording* of text segments. It can't introduce numbers, because those fail validation.
10. **Unbounded consumption.** OWASP LLM10 mitigations include input size limits, "Rate Limiting… user quotas" and "Timeouts and Throttling" ([OWASP LLM10][owasp-10]).
    - Cap the facts per request and the characters per label, and set `max_tokens` / `max_output_tokens`. The values are a spec decision.
    - Rate-limit the narrative route with the already-researched `@fastify/rate-limit` 11.2.1 (`/Users/srajagopal/Work/wechart/docs/research/fastify-rate-limit.md`; installed per `packages/api/package.json` L24).
11. **Grammar compilation latency.** The first use of a new schema compiles a grammar. On Anthropic the cache lasts 24 h from last use ([Anthropic structured outputs][anth-so]). On Bedrock it "may take up to a few minutes" ([Bedrock structured outputs][br-so]). Keep the schema static (§ 1).
12. **The AI SDK defaults to the Vercel AI Gateway for string model IDs** ([provider management][aisdk-provider]). That is a data-egress hazard if adopted.
13. **Node 26.** OpenAI's README names Node 22 and 24 only; its `engines` is `>=22` ([README][openai-readme]; [npm][npm-openai]). Anthropic supports "Node.js 20 LTS or later (non-EOL)" ([TS SDK docs][anth-ts]). Run the fake-server suite on Node 26 to confirm.

## Testing (no live calls in CI)

1. **A fake provider server** (recommended; no new dependency). Start a Fastify instance on `127.0.0.1:0` in the test. It serves `POST /v1/messages` (Anthropic) and `POST /v1/responses` (OpenAI and Azure v1) from fixtures. Point `baseURL` at it.
   - Both SDKs take `baseURL` ([client.ts][anth-client]; [Azure v1][az-v1]).
   - This matches the existing `packages/api/src/xcube/fake.ts` pattern, and exercises the real SDK code paths: headers, retries, error classes, `parse()` helpers.
   - Assert on the requests the fake receives:
     - the key header is present and equals the decrypted test key;
     - `store: false` is sent (OpenAI);
     - `output_config.format` is present (Anthropic);
     - the system prompt holds no fixture title.
2. **Recorded fixtures.** Response JSON shaped like the providers' documented examples (Anthropic `usage`, `stop_reason`, `_request_id` header; OpenAI `output`, `usage`, `store`, `status`) ([TS SDK docs][anth-ts]; [Responses create][oai-create]).
   - **Capture:** record once against the real API outside CI, scrubbed of keys and request ids, and commit the files.
   - **Cases to include:**
     - success;
     - refusal (`stop_reason: "refusal"`);
     - `max_tokens` cut-off;
     - 401;
     - 429 with and without `retry-after`, including the `enforced_spend_limit_reached` body ([rate limits][anth-rl]);
     - 500;
     - a slow response, for the timeout.
3. **Adversarial validator tests (Vitest), with no network:**
   - digits in text (ASCII and `\p{Nd}`, e.g. Arabic-Indic);
   - an unknown `ref`;
   - extra properties;
   - a non-array `segments`;
   - injection strings in fact labels, which must never appear in the system prompt.
4. **Key tests,** from `credential-encryption.md` § Testing:
   - the round trip;
   - an AAD mismatch when the endpoint changes;
   - the `pg_dump` canary test;
   - a log scan for the canary key;
   - a test that an `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_LOG=debug` set in the test environment changes nothing.
5. **A guard against live calls.** CI provides no provider keys. The client factory rejects any `baseURL` not on an allow-list in test mode (design proposal).
6. **Alternatives:**
   - `msw@3.0.3` (MIT, Node `>=22.12.0`) intercepts at the request layer ([npm][npm-msw]);
   - the AI SDK's `MockLanguageModelV4` only applies if the AI SDK is adopted ([AI SDK testing][aisdk-test]).

   Neither is needed with the fake server.

## Alternatives considered

| Criterion | Direct SDKs behind a wechart port (**recommended**) | Vercel AI SDK `ai@7.0.143` + `@ai-sdk/*` |
|---|---|---|
| **Correctness of "every number a token"** | Uses each provider's own constrained decoding (`output_config.format`, strict `json_schema`) and gets refusal and stop signals directly | `auto` may fall back to a "json" tool on Anthropic ([AI SDK Anthropic][aisdk-anth]); whether that forces `tool_choice`, which 400s on 5.5 models ([define tools][anth-tools]), is UNVERIFIED. Constraint keywords are moved into descriptions ([sanitize][aisdk-sanitize]). The OpenAI-compatible adapter drops the schema to `json_object` without structured-output support ([compat][aisdk-compat]) |
| **Security** | No gateway in the dependency tree. Logging and tracing are set explicitly per client | Depends on `@ai-sdk/gateway`. Bare string IDs route to the gateway ([provider mgmt][aisdk-provider]). Telemetry records prompts once any integration is registered ([migration][aisdk-mig]; [otel][aisdk-otel]) |
| **Maintenance** | Two packages on day one, each first-party. Anthropic is 0.x and may break in minors ([TS SDK docs][anth-ts]) | Three majors kept alive (`ai-v5`, `ai-v6` and `latest` 7.x dist-tags, [npm][npm-ai-full]). AI SDK 7 removed `experimental_output` ([migration][aisdk-mig]). Provider packages pin internal versions exactly ([npm][npm-aisdk-anth]) |
| **Validation** | wechart's Zod validator, which the rule requires regardless | Validates against the schema (`NoObjectGeneratedError`), but wechart's ref and digit checks are still needed |
| **License** | MIT (Anthropic), Apache-2.0 (OpenAI) | Apache-2.0 |
| **Breadth** | Adding Gemini or Bedrock later means another adapter | One API across all five providers |

Bedrock and Gemini were also weighed as **day-one providers**. Their gaps are Gotchas 3, 4 and 6.

## Open questions / unverified

**For the user and the spec**
- **Providers on day one.** Anthropic + OpenAI + Azure OpenAI as recommended? Or the copilot's (a) all five, or (b) Anthropic only (`references-copilot.md` L454–457)?
  - Is an "OpenAI-compatible endpoint" wanted? Its structured-output support can't be known in advance, so Test connection would have to prove it.
- **Bedrock auth.** If Bedrock is wanted later, should it use the pod's IAM role (no stored key) rather than a pasted key ([Bedrock API keys][br-keys])?
- **Azure auth.** API key only, or also Entra ID (no stored key; needs `@azure/identity` research)?
- **"Digit outside a token."** Does "every number" also cover spelled-out numbers ("twelve", "a third") and ordinals? The validator can only enforce what the spec defines.
- **A rejected draft.** Is one automatic retry with the rejection reason allowed, or does R80's "no silent regeneration" (L239) forbid it, so the author sees the failure and clicks again?
- **Timeout, `max_tokens`, facts per request, label length and per-user limits:** values for the spec. The 60 s and 1,024 in the sketches are placeholders, not decisions.
- **Does changing the endpoint clear the stored key?** Recommended yes (§ Key handling); this needs a spec rule like AC-312.

**UNVERIFIED (tried, not confirmed)**
- Whether `anthropic.claude-*-5-5` is reachable through Bedrock Converse / InvokeModel with structured outputs. The AWS and Anthropic pages disagree in emphasis ([br-so]; [anth-so]; [anth-models]).
- Whether zod 4.6.5 emits `anyOf` (not `oneOf`) for `discriminatedUnion`, and whether `zodOutputFormat` / `zodTextFormat` accept it unchanged. Write a unit test.
- Whether an `enum` change on `ref` invalidates Anthropic's grammar cache.
- OpenAI's strict-mode numeric limits (properties, nesting, enum sizes) and its `pattern` support. The "Supported schemas" section wasn't returned by the fetch.
- GPT-6 family structured-output support per model.
- Azure v1 Responses `strict` json_schema for every deployment type.
- Whether the AI SDK's Anthropic `jsonTool` mode forces `tool_choice`.
- `@aws-sdk/client-bedrock-runtime`'s constructor option for a bearer API key, and its `endpoint` option for a fake server.
- Gemini `usageMetadata.promptTokenCount` / `totalTokenCount`; Bedrock Converse usage field names.
- OpenAI `incomplete_details.reason` values.
- Whether provider `APIError` messages echo request content. Scrub anyway.
- Publish dates of the pinned versions: the registry documents fetched were truncated before their `time` objects.
- Node 26 for `openai@7.38.0`. Prove it with the fake-server suite.

[npm-anth]: https://registry.npmjs.org/@anthropic-ai/sdk/latest
[npm-openai]: https://registry.npmjs.org/openai/latest
[npm-genai]: https://registry.npmjs.org/@google/genai/latest
[npm-bedrock]: https://registry.npmjs.org/@aws-sdk/client-bedrock-runtime/latest
[npm-anth-bedrock]: https://registry.npmjs.org/@anthropic-ai/bedrock-sdk/latest
[npm-ai]: https://registry.npmjs.org/ai/latest
[npm-ai-full]: https://registry.npmjs.org/ai
[npm-aisdk-anth]: https://registry.npmjs.org/@ai-sdk/anthropic/latest
[npm-aisdk-openai]: https://registry.npmjs.org/@ai-sdk/openai/latest
[npm-aisdk-azure]: https://registry.npmjs.org/@ai-sdk/azure/latest
[npm-aisdk-bedrock]: https://registry.npmjs.org/@ai-sdk/amazon-bedrock/latest
[npm-aisdk-google]: https://registry.npmjs.org/@ai-sdk/google/latest
[npm-msw]: https://registry.npmjs.org/msw/latest
[npm-zod]: https://registry.npmjs.org/zod/latest
[anth-models]: https://platform.claude.com/docs/en/about-claude/models/overview
[anth-so]: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
[anth-tools]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools
[anth-bedrock]: https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock
[anth-ts]: https://platform.claude.com/docs/en/api/sdks/typescript
[anth-rl]: https://platform.claude.com/docs/en/api/rate-limits
[anth-client]: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/client.ts
[anth-reqopts]: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/internal/request-options.ts
[anth-otel]: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/README.md
[anth-tracing]: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/internal/tracing.ts
[anth-claude-md]: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/CLAUDE.md
[openai-readme]: https://raw.githubusercontent.com/openai/openai-node/master/README.md
[oai-so]: https://developers.openai.com/api/docs/guides/structured-outputs
[oai-models]: https://developers.openai.com/api/docs/models
[oai-create]: https://developers.openai.com/api/reference/resources/responses/methods/create
[oai-data]: https://developers.openai.com/api/docs/guides/your-data
[az-v1]: https://learn.microsoft.com/en-us/azure/ai-foundry/openai/api-version-lifecycle
[genai-docs]: https://googleapis.github.io/js-genai/release_docs/index.html
[genai-opts]: https://googleapis.github.io/js-genai/release_docs/interfaces/client.GoogleGenAIOptions.html
[genai-http]: https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpOptions.html
[genai-retry]: https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpRetryOptions.html
[genai-cfg]: https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html
[genai-gencfg]: https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerationConfig.html
[genai-usage]: https://googleapis.github.io/js-genai/release_docs/classes/types.GenerateContentResponseUsageMetadata.html
[gem-so]: https://ai.google.dev/gemini-api/docs/structured-output
[gem-models]: https://ai.google.dev/gemini-api/docs/models
[br-so]: https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html
[br-keys]: https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html
[br-readme]: https://raw.githubusercontent.com/aws/aws-sdk-js-v3/main/clients/client-bedrock-runtime/README.md
[aws-retry]: https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html
[aisdk-errors]: https://github.com/vercel/ai/blob/ai@7.0.0/skills/use-ai-sdk/references/common-errors.md
[aisdk-struct]: https://github.com/vercel/ai/blob/ai@7.0.0/content/docs/03-ai-sdk-core/10-generating-structured-data.mdx
[aisdk-mig]: https://github.com/vercel/ai/blob/ai@7.0.0/content/docs/08-migration-guides/23-migration-guide-7-0.mdx
[aisdk-gt]: https://github.com/vercel/ai/blob/ai@7.0.0/content/docs/07-reference/01-ai-sdk-core/01-generate-text.mdx
[aisdk-test]: https://github.com/vercel/ai/blob/ai@7.0.0/content/docs/03-ai-sdk-core/55-testing.mdx
[aisdk-anth]: https://github.com/vercel/ai/blob/ai@7.0.0/content/providers/01-ai-sdk-providers/05-anthropic.mdx
[aisdk-sanitize]: https://github.com/vercel/ai/blob/main/packages/anthropic/src/sanitize-json-schema.ts
[aisdk-compat]: https://github.com/vercel/ai/blob/main/packages/openai-compatible/src/chat/openai-compatible-chat-language-model.ts
[aisdk-provider]: https://github.com/vercel/ai/blob/ai@7.0.0/content/docs/03-ai-sdk-core/45-provider-management.mdx
[aisdk-otel]: https://github.com/vercel/ai/blob/main/packages/otel/src/open-telemetry.ts
[owasp-01]: https://genai.owasp.org/llmrisk/llm01-prompt-injection/
[owasp-05]: https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/
[owasp-10]: https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/
[nist-gcm]: https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf

---

**Notes for the caller (not part of the doc):**
- **One stray phrase to delete before saving.** In § 4 "Retries", delete "an 8 s… (no: a 20 s)", so the line reads "a 20 s backoff cap".
- **WebSearch was exhausted for this session** (200 of 200). Every source above came from direct fetches of known URLs or from Context7.
- **The finding most likely to change plans:** forced `tool_choice` returns a 400 on Opus 5.5, Sonnet 5.5 and Fable 5.1, and Claude-on-Bedrock (Mantle) has no structured outputs. So the narrative must use Anthropic's `output_config.format` on the first-party API, and Bedrock is the weakest day-one option.
- **Local files this builds on:**
  - `/Users/srajagopal/Work/wechart/docs/research/credential-encryption.md` (the AES-GCM scheme to reuse);
  - `/Users/srajagopal/Work/wechart/docs/research/credential-sealing.md` (why HPKE doesn't fit LLM keys);
  - `/Users/srajagopal/Work/wechart/docs/design/references-copilot.md` (L364–387, L454–461);
  - `/Users/srajagopal/Work/wechart/docs/requirements-log.md` (L226–251);
  - `/Users/srajagopal/Work/wechart/packages/api/src/config.ts` (L323–332);
  - `/Users/srajagopal/Work/wechart/packages/api/src/xcube/fake.ts`.