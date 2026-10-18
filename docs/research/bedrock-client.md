---
library: Anthropic Bedrock SDK (Claude on Amazon Bedrock) with the AWS credential chain
packages: ["@anthropic-ai/bedrock-sdk", "@aws-sdk/credential-providers"]
version: "@anthropic-ai/bedrock-sdk@0.35.0; @aws-sdk/credential-providers@3.1152.0"
researched: 2026-10-18
sources: [https://registry.npmjs.org/@anthropic-ai/bedrock-sdk/latest, https://unpkg.com/@anthropic-ai/bedrock-sdk@0.35.0/client.d.ts, https://unpkg.com/@anthropic-ai/bedrock-sdk@0.35.0/mantle-client.d.ts, https://unpkg.com/@anthropic-ai/bedrock-sdk@0.35.0/src/client.ts, https://unpkg.com/@anthropic-ai/bedrock-sdk@0.35.0/src/mantle-client.ts, https://unpkg.com/@anthropic-ai/bedrock-sdk@0.35.0/src/core/aws-auth.ts, https://unpkg.com/@anthropic-ai/bedrock-sdk@0.35.0/CHANGELOG.md, https://github.com/anthropics/anthropic-sdk-typescript/blob/main/packages/bedrock-sdk/README.md, https://registry.npmjs.org/@aws-sdk/credential-providers/latest, https://raw.githubusercontent.com/aws/aws-sdk-js-v3/main/packages/credential-providers/README.md, https://raw.githubusercontent.com/aws/aws-sdk-js-v3/main/packages/credential-providers/src/fromNodeProviderChain.ts, https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock, https://docs.aws.amazon.com/bedrock/latest/userguide/endpoints.html, https://docs.aws.amazon.com/bedrock/latest/userguide/models-endpoint-availability.html, https://docs.aws.amazon.com/bedrock/latest/userguide/inference-messages-api.html, https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html, https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-5-5.html, https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html, https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-fable-5-1.html, https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html, https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-structured-outputs.html, https://docs.aws.amazon.com/bedrock/latest/userguide/inference-prereq.html, https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html, https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html, https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-runtime.html, https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-mantle.html, https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-token-burndown.html, https://docs.aws.amazon.com/bedrock/latest/userguide/troubleshooting-api-error-codes.html, https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html, https://docs.aws.amazon.com/eks/latest/userguide/associate-service-account-role.html, https://docs.aws.amazon.com/eks/latest/userguide/pod-configuration.html, https://raw.githubusercontent.com/aws/amazon-eks-pod-identity-webhook/master/README.md, https://docs.aws.amazon.com/eks/latest/userguide/pod-id-how-it-works.html, https://docs.aws.amazon.com/eks/latest/userguide/pod-id-role.html, https://docs.aws.amazon.com/eks/latest/userguide/pod-id-association.html, https://docs.aws.amazon.com/eks/latest/userguide/pod-id-minimum-sdk.html, https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html, https://helm.sh/docs/chart_best_practices/rbac/]
---
# @anthropic-ai/bedrock-sdk 0.35.0: Claude on Amazon Bedrock in wechart

## Summary

**What it is.** `@anthropic-ai/bedrock-sdk` is Anthropic's Bedrock adapter for its TypeScript SDK. It exports two clients:
- **`AnthropicBedrock`** calls `bedrock-runtime`. It rewrites `POST /v1/messages` to `POST /model/{model}/invoke`, or to `/invoke-with-response-stream` when streaming, and signs the request with SigV4 for service `bedrock` ([client.ts][c-src]; [aws-auth.ts][auth-src]).
- **`AnthropicBedrockMantle`** calls `https://bedrock-mantle.{region}.api.aws/anthropic`. It signs with SigV4 for service `bedrock-mantle`, and "Only the `messages` and `beta.messages` resources are supported" ([mantle-client.d.ts][m-dts]).

**Why wechart uses it.** The spec lists Amazon Bedrock as an AI provider (glossary "AI provider", F48, `[R80]`). It serves AC-547, AC-549, AC-551, AC-558 and AC-538 ("on Bedrock by validation alone"), and tasks T905, T908 and T915 (`docs/spec.md`, `docs/tasks.md`). Credentials are the pod's IAM role (preferred and offered first, per AC-547's "Fails when") or an access key pair stored encrypted.

**Recommendation**
1. **Use `AnthropicBedrock` (`bedrock-runtime`), not `AnthropicBedrockMantle`.**
   - AWS: "For new applications, we recommend the `bedrock-runtime` endpoint" ([endpoint availability][br-ep-avail]).
   - All four current models are supported on `bedrock-runtime` ([same][br-ep-avail]).
   - Cross-Region inference (geo and global profiles) is supported on `bedrock-runtime` and not on `bedrock-mantle` ([endpoints][br-endpoints]).
   - AWS's model cards list Mantle availability for Sonnet 5.5 and Haiku 5.5 only in `us-gov-west-1` ([Sonnet 5.5][card-s55]; [Haiku 5.5][card-h55]).
   - This conflicts with T905 as planned, which names `AnthropicBedrockMantle`. See Open questions.
2. **The model field holds an inference-profile ID,** such as `global.anthropic.claude-sonnet-5-5` or `us.anthropic.claude-sonnet-5-5`. On `bedrock-runtime` the 5.5 cards show In-Region "N/A" for the endpoint URL, and In-Region unsupported in almost every Region ([Sonnet 5.5][card-s55]; [Opus 5.5][card-o55]).
3. **No structured outputs on Bedrock for the 5.5 models,** on either endpoint ([Sonnet 5.5][card-s55]; [Opus 5.5][card-o55]; [Haiku 5.5][card-h55]). wechart's validator is the sole guard (AC-538). This matches T905's test: "no `output_config.format` is sent".
4. **Credentials**
   - **IAM-role mode:** pass `providerChainResolver` returning one process-wide `fromNodeProviderChain()`. That chain covers IRSA (web-identity token file) and EKS Pod Identity (container credentials).
   - **Key-pair mode:** pass `awsAccessKey` and `awsSecretKey` explicitly. The chain is then never consulted ([aws-auth.ts][auth-src]).

## Install

```sh
pnpm --filter @wechart/api add @anthropic-ai/bedrock-sdk@0.35.0 @aws-sdk/credential-providers@3.1152.0
```

- **`@anthropic-ai/bedrock-sdk` 0.35.0** ([npm][npm-bsdk])
  - License MIT; `type: commonjs`, with ESM entry points in the exports map.
  - No `engines` field. The README lists "Node.js 18+" among supported runtimes ([README][readme]).
  - Dependencies:
    - `@anthropic-ai/sdk >=0.115.1 <1`; wechart already pins 0.135.0 per `llm-providers.md`;
    - `@aws-sdk/client-bedrock-runtime ^3.797.0`;
    - `@aws-sdk/credential-providers ^3.796.0`;
    - `@smithy/signature-v4 ^3.1.1`;
    - `@smithy/types ^2.3.4`;
    - `@smithy/fetch-http-handler ^5.0.4`;
    - `@aws-crypto/sha256-js ^4.0.0`;
    - `@opentelemetry/api ^1.4.1`;
    - and other `@smithy/*` packages.
  - Released 2026-10-14 ("add OpenTelemetry spans for API calls") ([CHANGELOG][changelog]).
- **`@aws-sdk/credential-providers` 3.1152.0** ([npm][npm-cp])
  - License Apache-2.0; `engines` `node >=20.0.0`.
  - Depends on `@aws-sdk/credential-provider-node`, `-web-identity`, `-http`, `@smithy/credential-provider-imds` and others.
  - wechart needs it as a **direct** dependency only to pass a long-lived provider (Gotcha 1). It is already a transitive dependency of the bedrock SDK.
- **Pod Identity's minimum JavaScript v3 SDK** is v3.458.0 ([EKS minimum SDK][podid-sdk]). 3.1152.0 is later.

## Init / auth pattern

All options are passed explicitly. The SDK otherwise reads `AWS_REGION` (defaulting to `'us-east-1'`), `ANTHROPIC_BEDROCK_BASE_URL` and `AWS_BEARER_TOKEN_BEDROCK` from the environment ([client.ts][c-src]). It also reads the core SDK's `ANTHROPIC_LOG` and OpenTelemetry variables (`llm-providers.md` § Init).

```ts
// packages/api/src/ai/bedrock.ts (sketch)
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

// One provider per process: fromNodeProviderChain returns a memoized provider (Gotcha 1).
const podRoleCredentials = fromNodeProviderChain();

export interface BedrockSettings {
  readonly region: string;   // e.g. 'us-east-1'; also the SigV4 signing region
  readonly model: string;    // an inference-profile ID, e.g. 'global.anthropic.claude-sonnet-5-5'
  readonly credentials: 'iam-role' | 'key-pair';
}
export interface AwsKeyPair { readonly accessKeyId: string; readonly secretAccessKey: string; readonly sessionToken?: string }

export function bedrockClient(s: BedrockSettings, pair: AwsKeyPair | null, baseURL?: string): AnthropicBedrock {
  const common = {
    awsRegion: s.region,                                                   // never left to AWS_REGION
    baseURL: baseURL ?? `https://bedrock-runtime.${s.region}.amazonaws.com`, // never left to ANTHROPIC_BEDROCK_BASE_URL
    maxRetries: 0, timeout: 60_000, logLevel: 'off' as const,              // as in llm-providers.md; values are spec decisions
  };
  if (s.credentials === 'key-pair') {
    if (!pair) throw new Error('Bedrock key pair missing');
    return new AnthropicBedrock({
      ...common,
      awsAccessKey: pair.accessKeyId,
      awsSecretKey: pair.secretAccessKey,                 // NB: Mantle names this awsSecretAccessKey
      awsSessionToken: pair.sessionToken ?? null,
    });
  }
  return new AnthropicBedrock({ ...common, providerChainResolver: async () => podRoleCredentials });
}
```

**Option facts (0.35.0)**
- **`ClientOptions`** is `Omit<CoreClientOptions, 'apiKey' | 'authToken'>` plus these fields ([client.d.ts][c-dts]):
  - `apiKey?` ("Defaults to process.env['AWS_BEARER_TOKEN_BEDROCK']");
  - `awsSecretKey?`;
  - `awsAccessKey?`;
  - `awsRegion?` ("Defaults to process.env['AWS_REGION']");
  - `awsSessionToken?`;
  - `skipAuth?`;
  - `providerChainResolver?: (() => Promise<AwsCredentialIdentityProvider>) | null`.

  The core options (`baseURL`, `timeout`, `maxRetries`, `logLevel`, `fetchOptions`, `defaultHeaders`) therefore still apply.
- **Constructor defaults** ([client.ts][c-src]):
  - `awsRegion = readEnv('AWS_REGION') ?? 'us-east-1'`;
  - `baseURL = readEnv('ANTHROPIC_BEDROCK_BASE_URL') ?? \`https://bedrock-runtime.${awsRegion}.amazonaws.com\``;
  - `apiKey = readEnv('AWS_BEARER_TOKEN_BEDROCK')`.
- **The overloads** take both static keys or neither. Passing only one is `@deprecated`, and at runtime it logs "Warning: Passing only one of `awsAccessKey` or `awsSecretKey` is deprecated" ([client.d.ts][c-dts]; [client.ts][c-src]).
- **Signing happens only "if (!this.skipAuth && !this.authToken)"** ([client.ts][c-src]).
- **Credential resolution** ([aws-auth.ts][auth-src]):
  - Explicit `awsAccessKey` with a secret key wins.
  - Otherwise the code calls `providerChainResolver()` if one was given.
  - Otherwise it builds `createCredentialChain(fromEnv(), fromNodeProviderChain({...}))`. With a profile set it uses `fromNodeProviderChain` alone. The source comment: "The Node default chain skips env credentials whenever `AWS_PROFILE` is set; the AWS CLI and the other Anthropic SDKs let env credentials win."
- **A credential failure** throws `APIConnectionError` with "Failed to resolve AWS credentials from the credential provider chain.", "so its failures stay on the SDK's connection-error retry policy" ([aws-auth.ts][auth-src]).
- **What the default chain covers.** `fromNodeProviderChain` tries environment variables, SSO, web-identity token, shared ini files, then "EC2/ECS Instance Metadata Service" ([credential-providers README][cp-readme]).
  - `fromTokenFile` reads `AWS_WEB_IDENTITY_TOKEN_FILE`, `AWS_ROLE_ARN` and `AWS_ROLE_SESSION_NAME` ([same][cp-readme]). This is IRSA.
  - `fromContainerMetadata` / `fromHttp` read `AWS_CONTAINER_CREDENTIALS_FULL_URI` and `AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE`, and allow the "EKS container host 169.254.170.23 or [fd00:ec2::23]" ([same][cp-readme]). This is Pod Identity.

**For reference, `AnthropicBedrockMantle` (not recommended; see Summary)** ([mantle-client.d.ts][m-dts]; [mantle-client.ts][m-src]):
- Options: `awsRegion`, `apiKey`, `awsAccessKey`, **`awsSecretAccessKey`**, `awsSessionToken`, `awsProfile`, `providerChainResolver`, `skipAuth`.
- Region: "`awsRegion` arg > `AWS_REGION` env var > `AWS_DEFAULT_REGION` env var".
- Base URL default: `ANTHROPIC_BEDROCK_MANTLE_BASE_URL` ?? `https://bedrock-mantle.{region}.api.aws/anthropic`. With neither a region nor a base URL, the constructor throws.
- Auth precedence: "`apiKey` constructor arg > explicit AWS credentials > `awsProfile` > `AWS_BEARER_TOKEN_BEDROCK` env var > `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` env vars > default AWS credential chain".
- A partial key pair throws "`awsAccessKey` and `awsSecretAccessKey` must be provided together."

## API surface we will use

### `client.messages.create(params, options?)`

The Messages API shape is that of `@anthropic-ai/sdk`, documented in `llm-providers.md` § 2.

**How the Bedrock client changes the request** ([client.ts][c-src])
- It removes `model` and `stream` from the body and puts the model in the path: `path\`/model/${model}/invoke\``.
- It sets `anthropic_version` to `'bedrock-2023-05-31'` when absent.
- It moves an `anthropic-beta` header into the body as `anthropic_beta`.
- It converts streamed responses from `application/vnd.amazon.eventstream` back to SSE (`#adaptResponse`).

**Resources removed** ([client.d.ts][c-dts])
- `messages.batches` and `messages.countTokens`: "The Bedrock API does not currently support token counting or the Batch API."
- `beta.promptCaching`.

**Narrative call on Bedrock**
- Don't send `output_config.format`. On `bedrock-runtime` the 5.5 models list structured outputs as not supported ([Sonnet 5.5 card][card-s55]).
- On Mantle, `output_config.format` is "rejected with a `400` error" ([AWS Claude structured outputs][br-claude-so]).
- The 5.5 models allow "`tool_choice` types `auto` and `none` only" on `bedrock-runtime` ([Opus 5.5 card][card-o55]; [Sonnet 5.5 card][card-s55]), so no forced JSON tool either.
- Ask for JSON in the fixed system prompt, then `JSON.parse` and run the § 1 validator. AC-538 retries once on rejection.

```ts
const msg = await bedrockClient(s, pair).messages.create(
  { model: s.model, max_tokens: 1024, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: renderFacts(facts) }] },
  { signal },
);
if (msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens') throw new DraftRejected(msg.stop_reason);
const draft = validateNarrative(parseJsonText(msg), facts);   // the only guard on Bedrock (AC-538)
```

- **Fable 5.1 refusals** return "HTTP 200 response with `stop_reason: "refusal"` and a `stop_details` object", and "Refusal rates on this model are materially higher than on previous Claude models" ([Fable 5.1 card][card-f51]).
- **Request ID:** `withResponse()` reads `request-id` ([api-promise.ts via Context7][anth-apipromise]). Whether Bedrock returns that header is UNVERIFIED; Bedrock's own request-ID header was not confirmed (see Open questions). Read it from `response.headers` once confirmed.

### Models and IDs (as of 2026-10-18)

| Model | Base model ID | Geo inference IDs (`bedrock-runtime`) | Global inference ID | Source |
|---|---|---|---|---|
| Claude Opus 5.5 | `anthropic.claude-opus-5-5` | `us.` / `eu.` / `au.` / `jp.anthropic.claude-opus-5-5` | `global.anthropic.claude-opus-5-5` | [card][card-o55] |
| Claude Sonnet 5.5 | `anthropic.claude-sonnet-5-5` | `us.` / `eu.` / `au.anthropic.claude-sonnet-5-5` | `global.anthropic.claude-sonnet-5-5` | [card][card-s55] |
| Claude Haiku 5.5 | `anthropic.claude-haiku-5-5` | `us.` / `eu.` / `au.` / `jp.anthropic.claude-haiku-5-5` | `global.anthropic.claude-haiku-5-5` | [card][card-h55] |
| Claude Fable 5.1 | `anthropic.claude-fable-5-1` | `us.anthropic.claude-fable-5-1` | `global.anthropic.claude-fable-5-1` | [card][card-f51] |

- **Base ID vs profile ID.** The base ID is what Mantle takes (bedrock-mantle row: "N/A" for geo and global) ([Sonnet 5.5 card][card-s55]). On `bedrock-runtime`, In-Region is unsupported for these models in nearly every Region. The one exception: Opus 5.5 In-Region in `eu-west-2` ([Opus 5.5 card][card-o55]).
- **Geo routing.** The destination Regions depend on the source Region. For example, `us.` from `us-east-1` routes to `us-east-1`, `us-east-2` and `us-west-2` ([Sonnet 5.5 card][card-s55]).
- **Global routing** "routes anywhere worldwide when there are no residency constraints" ([same][card-s55]). The choice is a data-residency decision for the Super-Admin.
- **Other models.** Anthropic's Bedrock page also lists Opus 5, Sonnet 5, Opus 4.8, Opus 4.7 and Haiku 4.5, plus limited-access Mythos and Fable 5 ([Claude in Bedrock][anth-bedrock]).
- **Is Mantle required?** No, per AWS. All four models above list Messages, Converse and Invoke on `bedrock-runtime` ([cards][card-s55]).
  - Anthropic's page frames Opus 4.7+ as "Claude in Amazon Bedrock" (Mantle). It also notes that "The previous Amazon Bedrock integration (the `InvokeModel` and `Converse` APIs…) remains available" ([Claude in Bedrock][anth-bedrock]).

### Minimal IAM policy (`bedrock-runtime`, inference profile)

**Actions**
- `bedrock:InvokeModel` "Allows the role to call the InvokeModel and Converse API operations".
- `bedrock:InvokeModelWithResponseStream` covers streaming.
- `bedrock:GetInferenceProfile` is "Required to run inference with an inference profile".

All three from [inference prereqs][br-prereq].

**Resources**
- "When you specify an inference profile in the `Resource` field… you must also specify the foundation model in each Region associated with it."
- A global profile's foundation-model resource uses an empty Region: `arn:aws:bedrock:::foundation-model/…`.
- A `bedrock:InferenceProfileArn` condition limits foundation-model use to that profile.

All from [inference-profile prereqs][br-ip-prereq].

**Sketch for `global.` Sonnet 5.5 called from `us-east-1`.** The pattern follows AWS's global Sonnet 4 example ([same][br-ip-prereq]); the account ID and model are placeholders.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "InvokeViaProfile", "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream", "bedrock:GetInferenceProfile"],
      "Resource": "arn:aws:bedrock:us-east-1:111122223333:inference-profile/global.anthropic.claude-sonnet-5-5" },
    { "Sid": "FoundationModelOnlyThroughProfile", "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      "Resource": ["arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-5-5",
                   "arn:aws:bedrock:::foundation-model/anthropic.claude-sonnet-5-5"],
      "Condition": { "StringLike": { "bedrock:InferenceProfileArn":
        "arn:aws:bedrock:us-east-1:111122223333:inference-profile/global.anthropic.claude-sonnet-5-5" } } }
  ]
}
```

- **Geo profile (`us.`):** list each destination Region's `foundation-model` ARN instead of the empty-Region one ([same][br-ip-prereq]).
- **Whether `bedrock:GetInferenceProfile` must be on the same resource** is inferred from "Required to run inference with an inference profile" ([inference prereqs][br-prereq]). The exact resource scoping is UNVERIFIED.
- **Model access (one-time, account level; not the pod role's job)**
  - The first invocation auto-subscribes through AWS Marketplace. That needs `aws-marketplace:Subscribe`, `Unsubscribe` and `ViewSubscriptions`.
  - "After the model is enabled, you can invoke the model without needing AWS Marketplace permissions" ([model access][br-access]).
  - Anthropic models need the First Time Use form. "This requirement does not apply to Anthropic models accessed through the `bedrock-mantle` endpoint" ([same][br-access]).
  - **Recommendation:** keep the pod role invoke-only, and have an AWS admin enable the model and submit the form.
- **Mantle instead:** authorization is `bedrock-mantle:CreateInference` ([endpoints][br-endpoints]). Anthropic: "The permissions policy grants `bedrock-mantle:CreateInference` only on the allowed model ARNs" ([Claude in Bedrock][anth-bedrock]). The resource ARN format is UNVERIFIED: the Service Authorization Reference page returned no content.

### Running in Kubernetes

**IRSA (EKS)**
- Annotate the service account with `eks.amazonaws.com/role-arn: arn:aws:iam::<acct>:role/<role>` ([EKS IRSA][irsa]).
- The role trust policy federates the cluster's OIDC provider for `sts:AssumeRoleWithWebIdentity`, with conditions `<oidc>:aud = sts.amazonaws.com` and `<oidc>:sub = system:serviceaccount:<ns>:<sa>` ([same][irsa]).
- **What the webhook injects:**
  - `AWS_ROLE_ARN`;
  - `AWS_WEB_IDENTITY_TOKEN_FILE=/var/run/secrets/eks.amazonaws.com/serviceaccount/token`;
  - optionally `AWS_REGION`, `AWS_DEFAULT_REGION` and `AWS_STS_REGIONAL_ENDPOINTS`;
  - the projected volume `aws-token`.

  ([webhook README][webhook]; [pod configuration][irsa-pod])
- **Optional service-account annotations:** `eks.amazonaws.com/audience`, `eks.amazonaws.com/sts-regional-endpoints` and `eks.amazonaws.com/token-expiration`. A pod annotation, `eks.amazonaws.com/skip-containers`, skips named containers ([webhook README][webhook]).
- The pod spec must name the service account (`serviceAccountName`) ([pod configuration][irsa-pod]).

**EKS Pod Identity**
- No annotation: "you don't add any annotations to the service accounts". You create an association in EKS (`aws eks create-pod-identity-association --cluster-name … --role-arn … --namespace … --service-account …`) ([Pod Identity association][podid-assoc]).
- Trust policy: principal `pods.eks.amazonaws.com`, actions `sts:AssumeRole` and `sts:TagSession`. It can be limited with `aws:RequestTag/kubernetes-namespace` and `aws:RequestTag/kubernetes-service-account` ([Pod Identity role][podid-role]).
- **What EKS injects** ([how it works][podid-how]):
  - `AWS_CONTAINER_CREDENTIALS_FULL_URI=http://169.254.170.23/v1/credentials`;
  - `AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE=/var/run/secrets/pods.eks.amazonaws.com/serviceaccount/eks-pod-identity-token`;
  - a projected token with audience `pods.eks.amazonaws.com`.
- "If your workloads currently use credentials that are earlier in the chain of credentials, those credentials will continue to be used" ([same][podid-how]). In particular, `AWS_ACCESS_KEY_ID` in the pod's environment would win, because `fromEnv` comes first ([aws-auth.ts][auth-src]).

**Helm values (proposal)**

Helm's convention is `serviceAccount: { create, name }`, kept separate from `rbac`, with a `serviceAccountName` helper that falls back to `default` when `create` is false ([Helm RBAC best practices][helm-rbac]). The `annotations` map is a proposal and is not from that page.

```yaml
api:
  serviceAccount:
    create: true
    name: ""            # set it when an EKS Pod Identity association names it; the association binds namespace + name
    annotations: {}     # IRSA: eks.amazonaws.com/role-arn: arn:aws:iam::<acct>:role/<role>
ai:
  bedrock:
    roleArn: ""         # T915: when set, rendered into api.serviceAccount.annotations["eks.amazonaws.com/role-arn"]
```

- Today the `api` Deployment names no service account and sets `automountServiceAccountToken: false` (`deploy/helm/wechart/templates/api.yaml` L40–41). Gotcha 8 covers why that matters.

**Outside EKS (docker-desktop and other non-AWS clusters)**
- No IRSA or Pod Identity agent exists there, so the Super-Admin enters an access key pair. wechart stores it encrypted (`llm-providers.md` § Key handling) and passes it as `awsAccessKey` / `awsSecretKey`.
- AWS: "Where possible, we recommend relying on temporary credentials instead of creating long-term credentials such as access keys". "Workloads that cannot use IAM roles" are a listed exception ([IAM best practices][iam-bp]).
- AWS also names IAM Roles Anywhere and `AssumeRoleWithWebIdentity` as ways to give off-AWS workloads temporary credentials ([same][iam-bp]). Neither is researched here (Open questions).

### Pointing the client at a local fake (tests)

- **Setup:** `new AnthropicBedrock({ baseURL: 'http://127.0.0.1:<port>', awsRegion: 'us-east-1', awsAccessKey: 'AKIDTEST', awsSecretKey: 'test' })`.
  - With static keys, signing is local and no credential chain or STS call happens ([aws-auth.ts][auth-src]).
  - The signer sets `host` from the URL and does not sign `connection` ([same][auth-src]).
- **What the fake must serve:**
  - `POST /model/<url-encoded model>/invoke`;
  - for streaming, `/invoke-with-response-stream` with `content-type: application/vnd.amazon.eventstream` ([client.ts][c-src]).

  The narrative needs only the non-streaming path: a plain JSON Anthropic message body.
- **What the fake should assert (AC-558, T905):**
  - the `authorization` header is SigV4 and its credential scope names the saved access key, the saved Region and service `bedrock` (`service: props.serviceName` → `'bedrock'` for `AnthropicBedrock`; [aws-auth.ts][auth-src]);
  - the body has `anthropic_version: "bedrock-2023-05-31"` and no `model`, `stream` or `output_config` ([client.ts][c-src]).

  The exact `AWS4-HMAC-SHA256 Credential=<AK>/<date>/<region>/<service>/aws4_request` header layout comes from SigV4 itself, not from a fetched source (UNVERIFIED wording).
- **Full signature verification** would mean re-signing with `@smithy/signature-v4` under a fixed clock. That is a further import, which this doc doesn't cover, so the recommendation is to check the scope only.
- **The IAM-role path in tests:** pass a `providerChainResolver` that returns static test credentials, so no IMDS, STS or agent is touched.
- **The environment guard (AC-558 "Fails when"):** set `AWS_ACCESS_KEY_ID`, `AWS_BEARER_TOKEN_BEDROCK`, `ANTHROPIC_BEDROCK_BASE_URL` and `AWS_REGION` to decoys in the test environment, then assert:
  - the fake still receives the saved pair and Region;
  - no `Authorization: Bearer` header arrives.
- **`skipAuth: true`** skips signing ([client.d.ts][c-dts]). Don't use it in tests that check signing.

### Errors, throttling and quotas

**InvokeModel errors** ([InvokeModel API][invoke-api])

| Exception | HTTP |
|---|---|
| `AccessDeniedException` | 403 |
| `ValidationException` | 400 |
| `ServiceQuotaExceededException` | 400 |
| `ResourceNotFoundException` | 404 |
| `ModelTimeoutException` | 408 |
| `ModelErrorException` | 424 |
| `ThrottlingException` | 429 |
| `ModelNotReadyException` | 429 ("The AWS SDK will automatically retry the operation up to 5 times") |
| `InternalServerException` | 500 |
| `ServiceUnavailableException` | 503 |

**More from troubleshooting** ([troubleshooting][br-ts])
- `FTUFormNotFilled` (404).
- `MPAgreementBeingCreated` (403): "Try again after 15 minutes".
- `RequestExpired` (400): clock skew.
- `overloaded_error` (529): "If the response includes a `Retry-After` header, wait for the specified time".
- For `ThrottlingException`: "retries with exponential backoff… and random jitter".

**How the SDK maps them.** The bedrock SDK passes non-stream responses through unchanged ([client.ts][c-src]), so the core SDK's status-based classes apply (`llm-providers.md` § 2): 429 → `RateLimitError`, 403 → `PermissionDeniedError`, 404 → `NotFoundError`, 400 → `BadRequestError`, 5xx → `InternalServerError`.
- The core retry rule: "408, 409, 429, and 5xx are retryable, delays have jitter, and delays are capped" ([CLAUDE.md via Context7][anth-claude-md]). So `ThrottlingException`, `ModelNotReadyException`, `ModelTimeoutException`, 500, 503 and 529 are retried by default, and `ServiceQuotaExceededException` (400) and `ModelErrorException` (424) are not.
- Keep `maxRetries: 0` with one wechart-owned policy, as `llm-providers.md` Gotcha 8 recommends.
- Telling `ThrottlingException` apart from `ModelNotReadyException` (both 429) needs the AWS error type from the body or a header. The field name is UNVERIFIED.

**Quotas on `bedrock-runtime`**
- Per model and Region: "Cross-Region InvokeModel tokens per minute", "On-demand InvokeModel tokens per minute", "Cross-Model Max Tokens Per Day", and RPM "for some models" ([runtime quotas][br-q-rt]).
- At the start of a request, "Total input tokens + max_tokens" is deducted.
- Output burns down at "10x for output tokens" for "Claude Opus 5.5, Claude Sonnet 5, Claude Opus 5, and Claude Fable 5.1" ([token burndown][br-burndown]). Sonnet 5.5 and Haiku 5.5 aren't named on that page (UNVERIFIED).
- Keep `max_tokens` close to the expected draft size.

**Quotas on Mantle (for reference)**
- Separate input and output TPM; "does not enforce requests-per-minute".
- If the output quota is reached mid-generation, "generation stops and the response is returned with a finish reason indicating the cutoff" ([Mantle quotas][br-q-m]).
- Anthropic: a default of "2 million input tokens per minute" ([Claude in Bedrock][anth-bedrock]).

**Test connection mapping** (inference; extends `llm-providers.md` § 7)
- `APIConnectionError` "Failed to resolve AWS credentials…" → no role or credentials wired.
- 403 → IAM denies the call, or the Marketplace agreement is pending.
- 404 → unknown model or profile ID, or the FTU form isn't filled.
- 400 → a malformed request or model ID.
- 429 → throttled.

## Gotchas

1. **The default credential chain is rebuilt on every request in 0.35.0.**
   - `getAuthHeaders` calls `props.providerChainResolver ? props.providerChainResolver() : defaultProviderChainResolver(...)` and then `await provider()` for each request. The default resolver dynamically imports `@aws-sdk/credential-providers` and constructs a new `createCredentialChain(fromEnv(), fromNodeProviderChain(...))` ([aws-auth.ts][auth-src]).
   - `fromNodeProviderChain` returns a *Memoized* provider ([fromNodeProviderChain.ts][cp-fnpc]), and credentials are cached "until there is less than 5 minutes remaining to their expiration" ([credential-providers README][cp-readme]). But memoization is per instance.
   - **Inference:** without a long-lived resolver, IRSA would call STS `AssumeRoleWithWebIdentity` per Bedrock request, and Pod Identity would call the node agent per request. That this happens in practice is UNVERIFIED (no issue found; WebSearch exhausted).
   - **Fix:** pass `providerChainResolver: async () => podRoleCredentials` with one module-level `fromNodeProviderChain()` (§ Init).
2. **`AWS_BEARER_TOKEN_BEDROCK` silently replaces SigV4.**
   - `apiKey` defaults to it, becomes `authToken`, and signing runs only when `!this.authToken` ([client.ts][c-src]). The `apiKey` type is `string | undefined` ([client.d.ts][c-dts]), and passing `undefined` still triggers the default.
   - **Recommendation:** wechart's config refuses to start, or refuses Bedrock, when `AWS_BEARER_TOKEN_BEDROCK` or `ANTHROPIC_BEDROCK_BASE_URL` is set.
   - Whether `apiKey: ''` disables bearer mode cleanly is UNVERIFIED. Don't rely on it.
3. **Region fallbacks differ by class.** `AnthropicBedrock` silently falls back to `'us-east-1'` ([client.ts][c-src]); Mantle throws without a Region ([mantle-client.ts][m-src]). Always pass `awsRegion`: it sets both the default host and the SigV4 signing Region.
4. **The secret-key option name differs by class:** `awsSecretKey` on `AnthropicBedrock`, `awsSecretAccessKey` on `AnthropicBedrockMantle` ([client.d.ts][c-dts]; [mantle-client.d.ts][m-dts]).
5. **No structured outputs for the 5.5 models on Bedrock, and no forced `tool_choice`** ([Sonnet 5.5][card-s55]; [Opus 5.5][card-o55]). For models that support structured outputs on `bedrock-runtime` (the 4.5/4.6 list), it is "incompatible with citations", and some geo profiles don't support it ([structured outputs][br-so]).
6. **Endpoint facts conflict between AWS and Anthropic.**
   - Anthropic lists Mantle in 27 Regions with "Global" and "Regional" endpoint types ([Claude in Bedrock][anth-bedrock]).
   - AWS says cross-Region inference is "not supported" on `bedrock-mantle` ([endpoints][br-endpoints]). Its 5.5 cards list Mantle In-Region in `us-gov-west-1` only for Sonnet and Haiku, and in `us-east-1`, `ap-southeast-4` and `us-gov-west-1` for Opus ([cards][card-s55]).
   - Test connection is the only reliable check.
7. **Fable 5.1 on Bedrock** "you must opt in to AWS review by setting your data retention mode to `aws_review`" ([Fable 5.1 card][card-f51]). That is a data-handling decision for the Super-Admin. It also has the materially higher refusal rate noted above.
8. **The current chart's `api` pod uses no named service account and sets `automountServiceAccountToken: false`** (`deploy/helm/wechart/templates/api.yaml` L40–41).
   - Both IRSA and Pod Identity key off the pod's service account ([pod configuration][irsa-pod]; [Pod Identity association][podid-assoc]), so T915 must add a dedicated service account.
   - Both inject their own projected token volume ([webhook README][webhook]; [how it works][podid-how]). Whether `automountServiceAccountToken: false` interferes with that is UNVERIFIED. Prove it on an EKS cluster.
9. **`fromEnv` comes first in both chains,** so a stray `AWS_ACCESS_KEY_ID` in the pod outranks the pod's role ([aws-auth.ts][auth-src]; [how it works][podid-how]).
10. **The first call needs Marketplace permissions and the FTU form** (on `bedrock-runtime`). Until both are in place, calls return `AccessDeniedException` (or `FTUFormNotFilled`). After the subscription starts, they can return 403 for "up to 15 minutes" ([model access][br-access]; [troubleshooting][br-ts]).
11. **Idle connections through NAT, VPC endpoints or NLBs drop at 350 s,** which can make the first call after idle take "70+ seconds" ([troubleshooting][br-ts]). Keep the client timeout (a spec value) below the user-facing deadline. Node fetch keep-alive tuning is not researched here.
12. **Type mixing.** The bedrock SDK types `providerChainResolver` with `@smithy/types ^2.3.4` ([npm][npm-bsdk]), while `@aws-sdk/credential-providers@3.1152.0` uses `@smithy/types ^4.19.0` ([npm][npm-cp]). Whether TypeScript strict mode accepts the v4 provider is UNVERIFIED. `pnpm typecheck` will show it.
13. **The OpenTelemetry spans are new in 0.35.0** ([CHANGELOG][changelog]). Pass the `openTelemetry` option explicitly, as `llm-providers.md` § Never log keys or prompts says. That the Bedrock client accepts it is inferred from `ClientOptions` extending the core options ([client.d.ts][c-dts]) and is UNVERIFIED at runtime.

## Open questions / unverified

**For the user or the spec**
- **T905 names `AnthropicBedrockMantle`.** This research recommends `AnthropicBedrock` on `bedrock-runtime`. Mantle's real advantages:
  - no Anthropic FTU form;
  - `count_tokens` ([model access][br-access]; [Messages API][br-messages]).

  Its drawbacks:
  - no cross-Region profiles;
  - narrow per-model Region availability per AWS;
  - no Guardrails;
  - a separate IAM action.

  Which endpoint?
- **The model field.** Free text for an inference-profile ID, or a pick-list of `global.` / `us.` / `eu.` / `au.` / `jp.` profiles per model? Global vs geo is a data-residency choice ([Sonnet 5.5 card][card-s55]).
- **Off-AWS clusters.** Is the encrypted long-term key pair acceptable, or should IAM Roles Anywhere or role assumption (key pair + `AssumeRole`) be researched ([IAM best practices][iam-bp])?
- **Stored fields in key-pair mode.** Should `awsSessionToken` be accepted? Temporary keys expire, so a stored token would go stale.
- **Fable 5.1.** Should it be offered at all, given the `aws_review` retention requirement ([card][card-f51])?

**UNVERIFIED (tried, not confirmed)**
- The resource ARN format for `bedrock-mantle:CreateInference`. The Service Authorization Reference page returned no content.
- Bedrock's request-ID header name and the AWS error-type field on `bedrock-runtime` REST responses (to tell `ThrottlingException` from `ModelNotReadyException`).
- Whether Bedrock sends `Retry-After` on 429. It is documented only for 529 ([troubleshooting][br-ts]).
- The output burndown rate for Sonnet 5.5 and Haiku 5.5 ([token burndown][br-burndown] names only Opus 5.5 among the 5.5 models).
- Whether `automountServiceAccountToken: false` blocks the IRSA or Pod Identity token injection.
- Whether the STS call inside `fromTokenFile` uses a regional endpoint when `AWS_STS_REGIONAL_ENDPOINTS` isn't injected. Passing `clientConfig: { region }` to `fromNodeProviderChain` may pin it; that option's shape wasn't confirmed from the README excerpt.
- The exact text of the error for a base model ID on `bedrock-runtime` where only profiles are supported.
- Whether pnpm resolves a single `@anthropic-ai/sdk` copy for both wechart and the bedrock SDK. Check `pnpm-lock.yaml` after install.
- Publish dates of `@aws-sdk/credential-providers@3.1152.0`.
- Whether the per-request chain rebuild (Gotcha 1) shows up as STS traffic in practice; no issue was found, and WebSearch was exhausted.

[npm-bsdk]: https://registry.npmjs.org/@anthropic-ai/bedrock-sdk/latest
[npm-cp]: https://registry.npmjs.org/@aws-sdk/credential-providers/latest
[c-dts]: https://unpkg.com/@anthropic-ai/bedrock-sdk@0.35.0/client.d.ts
[m-dts]: https://unpkg.com/@anthropic-ai/bedrock-sdk@0.35.0/mantle-client.d.ts
[c-src]: https://unpkg.com/@anthropic-ai/bedrock-sdk@0.35.0/src/client.ts
[m-src]: https://unpkg.com/@anthropic-ai/bedrock-sdk@0.35.0/src/mantle-client.ts
[auth-src]: https://unpkg.com/@anthropic-ai/bedrock-sdk@0.35.0/src/core/aws-auth.ts
[changelog]: https://unpkg.com/@anthropic-ai/bedrock-sdk@0.35.0/CHANGELOG.md
[readme]: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/packages/bedrock-sdk/README.md
[anth-apipromise]: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/core/api-promise.ts
[anth-claude-md]: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/CLAUDE.md
[cp-readme]: https://raw.githubusercontent.com/aws/aws-sdk-js-v3/main/packages/credential-providers/README.md
[cp-fnpc]: https://raw.githubusercontent.com/aws/aws-sdk-js-v3/main/packages/credential-providers/src/fromNodeProviderChain.ts
[anth-bedrock]: https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock
[br-endpoints]: https://docs.aws.amazon.com/bedrock/latest/userguide/endpoints.html
[br-ep-avail]: https://docs.aws.amazon.com/bedrock/latest/userguide/models-endpoint-availability.html
[br-messages]: https://docs.aws.amazon.com/bedrock/latest/userguide/inference-messages-api.html
[card-s55]: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html
[card-o55]: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-5-5.html
[card-h55]: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html
[card-f51]: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-fable-5-1.html
[br-so]: https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html
[br-claude-so]: https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-structured-outputs.html
[br-prereq]: https://docs.aws.amazon.com/bedrock/latest/userguide/inference-prereq.html
[br-ip-prereq]: https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-prereq.html
[br-access]: https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html
[br-q-rt]: https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-runtime.html
[br-q-m]: https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-mantle.html
[br-burndown]: https://docs.aws.amazon.com/bedrock/latest/userguide/quotas-token-burndown.html
[br-ts]: https://docs.aws.amazon.com/bedrock/latest/userguide/troubleshooting-api-error-codes.html
[invoke-api]: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html
[irsa]: https://docs.aws.amazon.com/eks/latest/userguide/associate-service-account-role.html
[irsa-pod]: https://docs.aws.amazon.com/eks/latest/userguide/pod-configuration.html
[webhook]: https://raw.githubusercontent.com/aws/amazon-eks-pod-identity-webhook/master/README.md
[podid-how]: https://docs.aws.amazon.com/eks/latest/userguide/pod-id-how-it-works.html
[podid-role]: https://docs.aws.amazon.com/eks/latest/userguide/pod-id-role.html
[podid-assoc]: https://docs.aws.amazon.com/eks/latest/userguide/pod-id-association.html
[podid-sdk]: https://docs.aws.amazon.com/eks/latest/userguide/pod-id-minimum-sdk.html
[iam-bp]: https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html
[helm-rbac]: https://helm.sh/docs/chart_best_practices/rbac/
