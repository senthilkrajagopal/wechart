---
library: "Tokens between wechart and Cube 1.7.45 + xcube: RS256 user tokens signed with jose 6.2.12 in wechart's API, verified in Cube/xcube (jsonwebtoken 9.0.3, as bundled with Cube), and a separate service credential"
packages: [jose]
# wechart's API imports only `jose` (plus the built-in `node:crypto`). Everything on the Cube side runs in the Cube image and is Cube's or xcube's code, which the Cube-expert agent writes. The versions are: Cube v1.7.45 (@cubejs-backend/api-gateway 1.7.45, jsonwebtoken 9.0.3, jwk-to-pem 2.0.5) and xcube at fork commit 0b6eef90a9 (still named cube-introspection).
version: 6.2.12
researched: 2026-09-25
sources:
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/jwk.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/types/auth.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/optionsValidate.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OptsHandler.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/env.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/promises.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server/src/server.ts
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/config.mdx
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/environment-variables.mdx
  - https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/embedding/authentication/jwt.mdx
  - https://github.com/auth0/node-jsonwebtoken/blob/v9.0.3/verify.js
  - https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/gateway.ts
  - https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/server.ts
  - https://github.com/panva/jose/blob/v6.2.12/README.md
  - https://github.com/panva/jose/blob/v6.2.12/docs/jwt/sign/classes/SignJWT.md
  - https://github.com/panva/jose/blob/v6.2.12/docs/jwt/verify/interfaces/JWTVerifyOptions.md
  - https://github.com/panva/jose/blob/v6.2.12/docs/key/export/functions/exportJWK.md
  - https://github.com/panva/jose/blob/v6.2.12/docs/jwk/thumbprint/functions/calculateJwkThumbprint.md
  - https://registry.npmjs.org/jose/6.2.12
  - https://registry.npmjs.org/openid-client/6.8.8
  - https://www.rfc-editor.org/rfc/rfc7517.html
  - https://www.rfc-editor.org/rfc/rfc7518.html
  - https://www.rfc-editor.org/rfc/rfc7519.html
  - https://www.rfc-editor.org/rfc/rfc7638.html
  - https://www.rfc-editor.org/rfc/rfc8725.html
  - https://helm.sh/docs/chart_template_guide/function_list/
  - https://kubernetes.io/docs/concepts/configuration/secret/
---

# Tokens between wechart and Cube 1.7.45 + xcube (jose 6.2.12)

> **Chosen, with changes, 2026-09-26** ([docs/inputs/2026-09-26-integration-plan-decisions.md](../../inputs/2026-09-26-integration-plan-decisions.md), decision 8; [the plan's snapshot](../../inputs/2026-09-26-integration-plan.md), "Tokens"; round R28). The researcher's text below is kept as written.
> - **Library:** `jose` 6.2.12 signs in wechart's API (R28 Q8).
> - **Claims (R28 Q4):**
>   - a user's token carries the groups that some access policy names, which answers this doc's open question on hundreds of groups against the 16 KB header;
>   - it carries `role: user`, `iss`, `aud` and `exp`;
>   - it has no `sub`.
>
>   The sketch below has groups only and no `role`. Add `role`, and trim the groups.
> - **Keys (R28 Q5):** wechart pushes its JWKS to an xcube admin route. xcube never fetches keys from wechart. The plan's contract has no such route yet; it is proposed there.
> - **Service credential:** a separate credential with `role: service` and `aud: xcube-admin`, as recommended here. The plan also lets it assert a preview context (AC-166–168).
> - **Rollout:** the plan's open choice between RS256 and HMAC rotation is settled for wechart by R27: RS256.

**How this was read.**
- **Cube source.** I read it in the local checkout `/Users/srajagopal/Work/bi/cube` (branch `spike/xcube-feasibility`, commit `db087e048a`, whose parent is `0b6eef90a9`). Its Cube packages are unmodified v1.7.45 (`docs/research/cube/introspection-api.md` L43–54). Line numbers are cited against the `v1.7.45` tag.
- **The xcube package.** It is still the directory `cube-introspection/` (`.git/HEAD`; Glob). No xcube admin or key routes exist yet: a Grep for `xcube` in the checkout matches only four files under `cube-introspection/spikes/`.
- **Nothing was run.** I built nothing, started nothing and sent no requests. Every Cube behaviour below comes from the source or the docs, and is marked that way where it matters.

## Summary

**What this covers.**
- **The decisions.** Architecture decision 12: "Tokens carry groups only… wechart signs RS256 and publishes a JWKS; admin calls use a separate service credential" (`docs/inputs/2026-09-25-architecture-decisions.md` L15). Decision 10: only wechart's server calls Cube or xcube (L13). Decision 1: Cube never calls wechart (L4).
- **R27 decided:**
  - keys are "Pushed to xcube" (`docs/requirements.md` L736, L494);
  - the service credential covers "introspection, builds and jobs, system partitions, health, and every xcube admin call" (L445, L746);
  - "Preview as" signs tokens with groups only (L448, L735).
- **Criteria served:**
  - **AC-326:** RS256, groups only, keys pushed at start and on rotation, the service credential for own-behalf calls (`docs/spec.md` L1129–1130).
  - **AC-327:** no request from Cube or xcube to wechart (L1131–1132).
  - **AC-008:** a user's queries carry their groups and nothing else of theirs; own-behalf calls never carry a user token (L87–88).
  - **AC-166:** a preview token carries exactly the chosen groups (L673–674).
  - **AC-250:** `introspection` goes only to the service credential (L482–483).
  - **AC-251:** the only exempt routes are health and sign-in (L905–906). So wechart must not serve a JWKS route.

**Findings:**

1. **`jwt.key` / `CUBEJS_JWT_KEY` can't hold an xcube-managed key set.**
   - It is one string, checked by a strict Joi `Joi.string()` ([core-validate] L24–40; [gw-auth] L34). The default verifier uses it as the only candidate key ([gw] L2650–2652), and it is captured when the gateway is built ([gw] L291, L2648–2659).
   - So it can't be a function, can't hold two keys during a rotation, and doesn't change without a restart.
   - The docs call it a "JSON string that represents a cryptographic key" or `<JWK_AS_STRING>` ([doc-config] L1336; [doc-jwt] L160–180). The source never parses a JWK: it hands the string to `jsonwebtoken.verify` ([gw] L2641–2646), which reads a string as PEM ([node-types] L1174–1176). See Gotcha 1: a JWK string silently becomes an **HMAC secret**.
2. **`jwt.jwkUrl` / `CUBEJS_JWK_URL` fetches over HTTP ([gw-jwk] L58–62).**
   - It can point at an xcube route instead of wechart, so it doesn't have to call wechart.
   - It gives kid lookup, caching and rotation handling ([gw-jwk] L57–140).
   - It has no required `exp`, no clock tolerance, a single `audience` string, and the whole payload becomes the security context. So it can't bind a key to "service only".
3. **Recommended: a verifier inside xcube.**
   - Installed through xcube's existing `createApiGatewayInstance` override ([xc-srv] L30–45), as the gateway's `checkAuth` ([core-server] L491).
   - It reads the pushed JWKS from xcube's own store.
   - It pins `RS256`, requires `kid`, `exp` and `iat`, checks `iss`, `aud` and `typ` with an explicit clock tolerance, and keeps user keys and the service key in separate sets.
   - It returns `{ security_context: { groups } }` for users ([gw] L2600–2602), and a service marker only when the service key verified the token.
   - A custom `checkAuth` is enforced whatever `NODE_ENV` is ([doc-jwt] L52–53). It is used by REST, WebSocket and SQL-over-HTTP alike ([gw-ws] L118; [gw-sql] L138–144).
4. **Recommended service credential: a separate RS256 key pair.**
   - Short-lived tokens with their own `aud` and `typ`.
   - The public half is given to xcube by deployment configuration, not by the push (the push itself needs this credential).
   - `contextToApiScopes` grants `jobs` and `introspection` only to the verifier's service marker.
   - A static shared secret and mTLS are compared under "Alternatives considered".
5. **`/cubejs-system` has no secret of its own.** There is no `CUBEJS_SYSTEM_API_SECRET` in v1.7.45 (Grep of `packages/**/src` for `SYSTEM_API|CUBEJS_SYSTEM`: none).
   - The routes mount only when `CUBEJS_PLAYGROUND_AUTH_SECRET` is set, and accept only HS256 tokens signed with it ([gw] L620–692, L2790–2806; [shared-env] L1985–1986).
   - The same secret also admits **any payload** on the main API as a fallback ([gw] L2766–2784), which would let its holder forge the service marker. It should be unset under this design (Gotcha 5).
6. **Signing in wechart: `jose` 6.2.12.**
   - It is already in wechart's lockfile through openid-client 6.8.8 (`pnpm-lock.yaml` L1718, L4011, L4213–4215; [oc-npm] `"jose": "^6.2.12"`).
   - It is ESM, has zero dependencies and no install scripts ([jose-readme]; [jose-npm]).
   - It signs with a Node `KeyObject` ([jose-keyinput]), exports the public JWK ([jose-exportjwk]) and computes RFC 7638 thumbprints for `kid` ([jose-thumb]).
   - It refuses RSA keys under 2048 bits ([jose-key-src] `checkModulusLength`).

## Install

**wechart API (Node 26):**

```bash
pnpm --filter @wechart/api add jose@6.2.12
```

- **The package.** `jose` 6.2.12 is `latest`: MIT, `"type": "module"`, with `.`, `./jwt/*`, `./jwk/*`, `./key/*` and other exports, and `sideEffects: false` ([jose-latest]). It has no `dependencies`, no `scripts` and no `engines` ([jose-npm]). So nothing is needed in `allowBuilds`.
- **No second copy.** The lockfile already resolves `jose@6.2.12` for `openid-client@6.8.8` (`pnpm-lock.yaml` L4213–4215), so the direct dependency adds no new package version.
- **Node 26.** jose's CI builds its matrix from panva's shared `node-versions.yml` with `min: 20` ([jose-ci]). openid-client uses the same workflow, and `docs/research/openid-client.md` L62 shows that matrix includes "current", which is Node 26 today. That is an inference, not a job named "26".
- **Build externals.** `packages/api/vite.build.config.ts` keeps dependencies external ("Dependencies stay external", L15), with an explicit list (L23–34). Add `'jose'` to it.
- **Support.** v6.x receives security fixes, bug fixes and features ([jose-readme]). Recent releases include validation hardening in 6.2.5 and 6.2.10 ([jose-rel]).

**Cube / xcube side** (for the Cube-expert agent; wechart installs nothing here):
- **What the image already has.** The Cube image ships `jsonwebtoken` 9.0.3 and `jwk-to-pem` 2.0.5 as dependencies of `@cubejs-backend/api-gateway` ([gw-pkg] L43–44; [yarn-lock] L13553–13556, L13598–13601). It runs Node 24.21.0 ([docker] L1, L26).
- **What xcube's image copies.** Only `dist/src`, `package.json`, `NOTICE` and `README.md` ([xc-df] L28–29). Its runtime dependencies must therefore resolve from the image's `/cube/node_modules`. Today `jsonwebtoken` is only an xcube devDependency ([xc-pkg] L53, L63), not a peer.
- **Two ways for the verifier.** Use `jsonwebtoken` from the image (see Open questions on whether it resolves there), or use only `node:crypto`.
- **Don't count on `jose` in the Cube image.** In Cube's lockfile it is pulled in by `@modelcontextprotocol/sdk` ([yarn-lock] L3914–3930, L13315–13318). No `packages/*/package.json` names `jose` (Grep), so it can't be assumed to be in the image.
- **`CUBEJS_API_SECRET` must still be set with a custom `checkAuth`.** Cube requires `apiSecret` unless `jwt.jwkUrl` is set ([core-opts] L454–476). The default verifier is its only non-dev user ([gw] L2655–2656; DevServer only otherwise, [core-dev] L52, L611). Give Cube a random value that wechart never holds.

## Init / auth pattern

### wechart: load keys, build the JWKS, sign (sketch, Node 26 ESM)

```ts
// packages/api/src/cube/signing.ts — a sketch, not existing code
import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { SignJWT, exportJWK, calculateJwkThumbprint, type JWK } from 'jose';

export interface SigningKey { readonly kid: string; readonly privateKey: KeyObject; readonly publicJwk: JWK }

export async function signingKeyFromPem(pem: string): Promise<SigningKey> {
  const privateKey = createPrivateKey(pem);                 // PEM: PKCS#1 or PKCS#8
  if (privateKey.asymmetricKeyType !== 'rsa') throw new Error('RS256 needs an RSA key');
  if ((privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048)
    throw new Error('RS256 needs a 2048-bit or larger key');  // RFC 7518 §3.3
  const jwk = await exportJWK(createPublicKey(privateKey));  // public members only
  const kid = await calculateJwkThumbprint(jwk);             // RFC 7638, SHA-256
  return { kid, privateKey, publicJwk: { ...jwk, kid, alg: 'RS256', use: 'sig' } };
}

/** The set pushed to xcube (RFC 7517 §5): public halves only. */
export const jwksOf = (keys: readonly SigningKey[]) => ({ keys: keys.map((k) => k.publicJwk) });

interface TokenShape { issuer: string; audience: string; typ: string; ttlSeconds: number }

/** A user's (or a preview's) token: groups and token metadata, nothing else. */
export function userToken(key: SigningKey, groups: readonly string[], t: TokenShape): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ groups: [...groups] })
    .setProtectedHeader({ alg: 'RS256', kid: key.kid, typ: t.typ })
    .setIssuer(t.issuer)
    .setAudience(t.audience)
    .setIssuedAt(now)
    .setExpirationTime(now + t.ttlSeconds)   // a number is an absolute Unix time
    .sign(key.privateKey);
}

/** A service token: its own key, audience and typ; no groups (but see Open questions). */
export function serviceToken(key: SigningKey, t: TokenShape): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: key.kid, typ: t.typ })
    .setIssuer(t.issuer).setAudience(t.audience)
    .setIssuedAt(now).setExpirationTime(now + t.ttlSeconds)
    .sign(key.privateKey);
}
```

Sources for the block:
- **`createPrivateKey`** reads a string as PEM ([node-types] L1166–1173).
- **`createPublicKey(privateKeyObject)`** derives the public key, and "it will be impossible to extract the private key from the returned object" ([node-types] L1174–1188).
- **`asymmetricKeyDetails.modulusLength`** exists ([node-types] L473–474, L541–543).
- **`exportJWK`** takes `Uint8Array | CryptoKey | KeyObject` ([jose-exportjwk]).
- **`calculateJwkThumbprint`** defaults to `sha256` ([jose-thumb]). RFC 7638 names the thumbprint as a usable `kid` value, and its RSA members are `e`, `kty` and `n` ([rfc7638] §1.1, §3.2).
- **`SignJWT`:**
  - `setProtectedHeader` "May only be called once";
  - `setExpirationTime` accepts "a Unix timestamp in seconds, a Date, or a duration relative to now";
  - `sign(key: KeyInput)` returns `Promise<string>` ([jose-signjwt]);
  - `KeyInput = CryptoKey | KeyObject | JWK | Uint8Array` ([jose-keyinput]).
- **Key size.** RS256 needs "A key of size 2048 bits or larger" ([rfc7518] §3.3). jose also throws "`${alg}` requires key modulusLength to be 2048 bits or larger" ([jose-key-src]).
- **JWKS shape.** A JWK Set "MUST have a 'keys' member" ([rfc7517] §5). `use` takes `sig` or `enc`, `alg` is optional, and `kid` matches the JWS `kid` header ([rfc7517] §4.2, §4.4, §4.5).

### wechart: push the JWKS to xcube (proposed contract; no such route exists yet)

```ts
await fetch(new URL('<xcube key route>', xcubeBaseUrl), {
  method: 'PUT',
  headers: {
    authorization: `Bearer ${await serviceToken(serviceKey, serviceShape)}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ version, ...jwksOf(userKeys) }), // previous + current + next
});
```

- **When.** Push at API start and after every rotation step (AC-326). The direction is wechart to xcube only, so no route on wechart serves keys (AC-251, AC-327).
- **What xcube should check before storing a key.** These are design proposals that follow from the sources:
  - `kty: "RSA"`;
  - `alg` absent or `"RS256"`;
  - `use` absent or `"sig"`;
  - `kid` present and unique;
  - modulus of 2048 bits or more, because jsonwebtoken 9.0.3 doesn't check key size ([jwt-vak] L16–30);
  - **no private members** `d`, `p`, `q`, `dp`, `dq`, `qi`, `oth` ([rfc7518] §6.3.2).
- **Replace, never shrink.** Take a whole-set replace with a monotonic `version`, so that a replica still on the old Secret can't remove a newer key during a rolling update (see Gotcha 16).

### xcube: the verifier (sketch for the Cube-expert agent; not existing code)

```ts
import { CubejsHandlerError } from '@cubejs-backend/api-gateway'; // exported: index.ts L4
import jwt from 'jsonwebtoken';                                     // 9.0.3 in the image (see Open questions)

const forbidden = () => new CubejsHandlerError(403, 'Forbidden', 'Invalid token');

export const checkAuth = async (_req: unknown, token?: string) => {
  if (!token) throw new CubejsHandlerError(403, 'Forbidden', "Authorization header isn't set");
  const decoded = jwt.decode(token, { complete: true });
  const kid = decoded?.header?.kid;
  if (typeof kid !== 'string' || decoded?.header.alg !== 'RS256') throw forbidden();
  const entry = keyByKid(kid) ?? (await reloadFromStoreOnce(), keyByKid(kid)); // single-flight, rate-limited
  if (!entry) throw forbidden();
  const service = entry.kind === 'service';
  const payload = jwt.verify(token, entry.publicKey /* KeyObject */, {
    algorithms: ['RS256'],
    issuer: ISSUER,
    audience: service ? SERVICE_AUDIENCE : USER_AUDIENCE,
    clockTolerance: CLOCK_TOLERANCE_SECONDS,
    maxAge: MAX_LIFETIME_SECONDS,              // also makes iat required
  }) as Record<string, unknown>;
  if (typeof payload.exp !== 'number') throw forbidden();  // jsonwebtoken checks exp only if present
  if (decoded.header.typ !== (service ? SERVICE_TYP : USER_TYP)) throw forbidden();
  return service
    ? { security_context: { [SERVICE_MARKER]: true } }
    : { security_context: { groups: stringArray(payload.groups) } };
};
```

- **Wiring.** Pass `{ ...options, checkAuth, playgroundAuthSecret: undefined }` from xcube's `createApiGatewayInstance` ([xc-srv] L30–45). The core builds those options with `checkAuth: this.options.checkAuth` and `playgroundAuthSecret: getEnv('playgroundAuthSecret')` ([core-server] L485–505).
- **Unsetting the playground secret** removes `/cubejs-system/*` ([gw] L620) and the main-API fallback ([gw] L2766–2784).
- **What each source line supports:**
  - `jsonwebtoken.verify` takes a `KeyObject` as is ([jwt-verify] L120).
  - It refuses an `alg` not in `algorithms` ([jwt-verify] L144–146), and refuses RS\* against a non-public key ([jwt-verify] L148–152).
  - It checks `exp` and `nbf` only when present, with `clockTolerance` ([jwt-verify] L176–192).
  - `maxAge` requires `iat` ([jwt-verify] L237–249).
  - `audience`, `issuer` and `subject` are optional checks ([jwt-verify] L194–223).
  - A thrown `CubejsHandlerError` answers with its own status ([gw] L2886–2896; [gw-err] L1–10). Any other `Error` answers 500 ([gw] L2897–2908; [doc-config] L1311–1316).

### Scope rule (cube.js or xcube)

```js
contextToApiScopes: async (securityContext, defaultScopes) => {
  const base = defaultScopes.filter((s) => s !== 'jobs' && s !== 'introspection');
  if (securityContext?.[SERVICE_MARKER] === true) return [...base, 'jobs', 'introspection'];
  return base; // users: meta, data, sql (+ graphql if kept)
};
```

- **Signature.** `contextToApiScopes` receives only `(securityContext, defaultScopes)` ([gw-auth] L88–90; [gw] L2847–2851). The marker must therefore sit in the security context.
- **Why users can't forge the marker.** The verifier builds user contexts from `groups` alone, and no other path puts a raw payload into the context once the playground fallback is gone.
- **`introspection`.** Upstream refuses unknown scopes ([gw] L2823–2829). xcube strips `introspection` before upstream checks the rest and puts it back ([xc-gw] L79–108). Any new xcube scope needs the same treatment.

## API surface we will use

### jose 6.2.12 (wechart)

| API | Signature / behaviour | Source |
|---|---|---|
| `new SignJWT(payload?)` | "Initial JWT Claims Set. Defaults to an empty object." | [jose-signjwt] |
| `.setProtectedHeader(h)` | Must include `alg`; may be called once | [jose-signjwt] |
| `.setIssuer(s)`, `.setAudience(s \| s[])`, `.setIssuedAt(input?)`, `.setExpirationTime(input)`, `.setNotBefore`, `.setJti`, `.setSubject` | Numbers are Unix seconds; strings are durations relative to now | [jose-signjwt] |
| `.sign(key: KeyInput, options?) → Promise<string>` | "Private key or shared secret to sign the JWT with" | [jose-signjwt], [jose-keyinput] |
| `exportJWK(key) → Promise<JWK>` | `Uint8Array \| CryptoKey \| KeyObject`; "CryptoKey inputs must be extractable" | [jose-exportjwk] |
| `calculateJwkThumbprint(key, digest = 'sha256') → Promise<string>` | base64url RFC 7638 thumbprint | [jose-thumb] |
| `generateKeyPair(alg, { modulusLength, extractable })` | Private keys are "not extractable by default"; RSA `modulusLength` "at least 2048; defaults to 2048". Only for generating development keys | [jose-genkp], [jose-genkpopts] |
| `importPKCS8(pem, alg, { extractable })` | Imports **PKCS#8** PEM only; private keys are not extractable by default | [jose-pkcs8], [jose-importopts] |
| `jwtVerify(jwt, keyOrGetKey, options)` | For wechart's own tests of its tokens | [jose-jwtverify] |
| `JWTVerifyOptions` | `algorithms` (by default "all algorithms applicable to the key"; `none` never accepted), `audience`, `issuer`, `clockTolerance`, `maxTokenAge` (requires `iat`), `requiredClaims`, `typ` (requires the header) | [jose-verifyopts] |
| `createLocalJWKSet(jwks)` | Picks the key by `alg`, `kid`, `use` and `key_ops`; "Exactly one key must match" | [jose-localjwks] |

### Cube 1.7.45 hooks and options

| Item | Behaviour | Source |
|---|---|---|
| `checkAuth(ctx, authorization?)` | Returns `void \| { security_context }`. The return value becomes `req.securityContext` | [gw-auth] L42–54; [gw] L2590–2602 |
| Custom vs default | If `checkAuth` is set, the default JWT verifier isn't built | [gw] L2761–2765 |
| Token extraction | `x-cube-authorization`, then `authorization`; a `<scheme> <token>` value keeps the second part | [gw] L2862–2875 |
| `jwt` options | `jwkRetry` (1–5), `jwkDefaultExpire`, `jwkUrl` (string or function), `jwkRefetchWindow`, `key` (string), `algorithms`, `issuer` (string[]), `audience` (string), `subject`, `claimsNamespace` | [core-validate] L24–40; [gw-auth] L26–40 |
| Env for `jwt` | `CUBEJS_JWK_URL`, `CUBEJS_JWT_KEY`, `CUBEJS_JWT_ALGS` (list), `CUBEJS_JWT_AUDIENCE`, `CUBEJS_JWT_ISSUER` (list), `CUBEJS_JWT_SUBJECT`, `CUBEJS_JWT_CLAIMS_NAMESPACE`. cube.js `jwt` overrides env key by key | [shared-env] L1971–1984; [core-opts] L421–430 |
| Default verifier | With `jwkUrl`: the header needs `kid` (else 403 "JWT without kid inside headers"); a missing key is 403 `JWK with kid … not found`. Otherwise candidates are `key`, then `CUBEJS_API_SECRETS`, then `CUBEJS_API_SECRET`. A failure is 403 "Invalid token" only when enforced (`NODE_ENV=production`) | [gw] L2638–2759, L288 |
| JWKS fetcher | Needs a `keys` array and a `kid` on every JWK. Converts with `jwk-to-pem`. Lifetime comes from `Cache-Control: max-age`, else `jwkDefaultExpire` seconds, else 5 min. Background refresh every 60 s. An unknown `kid` forces a refetch only when the cache is older than `jwkRefetchWindow` (ms, default 60 000) | [gw-jwk] L57–140; [shared-promises] L377–427 |
| `contextToApiScopes(sc, defaults)` | Must return an array of `graphql`, `meta`, `data`, `sql` or `jobs`; anything else throws. Built-in defaults are `['graphql','meta','data','sql']` | [gw] L240–241, L2808–2860; [doc-config] L1134–1143 |
| Route scopes | `/v1/meta` needs `meta`; `/v1/load`, `/v1/dry-run` and `/v1/cubesql` need `data`; `/v1/sql` needs `sql`; `/v1/pre-aggregations/jobs` needs `jobs`. `DELETE /v1/running-query/:id` checks no scope; `/readyz` and `/livez` need no token | [gw] L330–333, L485–491, L610–614, L1068, L1392–1406; `docs/research/cube/access-control.md` L162–171 |
| Jobs selector | `selector.contexts: [{ securityContext }]` in the body: whoever holds `jobs` builds for any context they name | [gw] L1020–1036, L1060–1068 |
| `contextToGroups(ctx)` | Its result is the group set that access policies match; unset means no groups | [core-compiler] L386–391; [doc-config] L1501–1524 |
| Request context | `{ securityContext, authInfo, signedWithPlaygroundAuthSecret, requestId, …extendContext }` | [gw] L2481–2493 |
| `/cubejs-system/*` | Mounted only when `CUBEJS_PLAYGROUND_AUTH_SECRET` is set. HS256 with that secret, no scopes, and none of the `jwt` options or `checkAuth` | [gw] L616–692, L2790–2806; `docs/research/cube/system-partitions.md` L46, L85–89 |
| `getPreAggregationPartitions({query, context, res})` | A `public` method that an xcube route could call behind its own authentication | [gw] L900–918 |

### xcube hooks at 0b6eef90a9

- **`IntrospectionServerCore.createApiGatewayInstance(apiSecret, getCompilerApi, getOrchestratorApi, logger, options)`** returns xcube's gateway ([xc-srv] L30–45). This is where xcube can substitute `checkAuth` and drop `playgroundAuthSecret`.
- **`IntrospectionApiGateway.createContextToApiScopesFn`** wraps the `introspection` scope ([xc-gw] L79–108). The gateway already imports `CubejsHandlerError` ([xc-gw] L11–19).

### Claims: what a user token carries and what Cube sees

**User token (and "Preview as"):**
- Header: `{ alg: "RS256", kid, typ }`.
- Payload: `{ iss, aud, iat, exp, groups: string[] }`.
- Nothing identifies the user: no `sub`, `name`, `email` or `oid`. AC-326 fails when a token "carries any attribute of theirs beyond their groups" (`docs/spec.md` L1130).
- Groups go exactly as the provider sends them (`docs/requirements.md` L763).
- "Preview as" signs the same shape with the chosen groups (AC-166).

**What Cube's security context holds:**
- **Default verifier:** the whole verified payload, `{ iss, aud, iat, exp, groups }` ([gw] L2742).
- **xcube's verifier:** exactly what it returns, e.g. `{ groups }` ([gw] L2600–2602).
- **Group matching.** wechart's current `contextToGroups` returns the string members of `securityContext.groups` (`infra/cube/cube.js` L111–114). Access policies match that set ([core-compiler] L386–391).
- **Claim name.** Plain `groups` is Core's documented path. `cubeCloud.groups` is reserved (`docs/research/cube/access-control.md` L398–402).

**Service token:**
- Header: `{ alg: "RS256", kid: <service kid>, typ: <service typ> }`.
- Payload: `{ iss, aud: <service audience>, iat, exp }`.
- xcube maps it to a context holding only its service marker.

**Keeping the two apart.** RFC 8725 lists separate keys, distinct `aud`, distinct `typ` and distinct required claims as ways to keep token kinds mutually exclusive ([rfc8725] §3.12). The design uses the first three.

### Key storage and rotation

- **Kubernetes.** The chart already generates secrets once and reads them back with `lookup` (`deploy/helm/wechart/templates/secrets.yaml` L11–17, `helm.sh/resource-policy: keep` L30). Two template functions fit:
  - `genPrivateKey "rsa"` gives an RSA 4096-bit key in a PEM block ([helm-fn]) of type `RSA PRIVATE KEY`, which is PKCS#1 ([sprig-crypto]). Import it with `node:crypto`, not `importPKCS8`, which takes PKCS#8 only ([jose-pkcs8]).
  - `genSelfSignedCert` returns `.Cert` and `.Key` ([helm-fn]) for an RSA 2048-bit key ([sprig-crypto]). A PEM X.509 certificate is valid input to `createPublicKey` ([node-types] L1179). That is one route to hand xcube only the **service** public key, generated in the same template as wechart's private half.
- **Secrets at rest.** Kubernetes stores Secrets "unencrypted in the API server's underlying data store (etcd)" by default ([k8s-secret]).
- **Rotation without refusals** (the AC-326 failure "a token signed with a new key is refused after a rotation"):
  1. **Publish before use.** Add the new key to the pushed set and wait until every xcube instance can see it.
  2. Only then sign with the new key.
  3. Drop the old key after the longest token lifetime plus the clock tolerance.
  - `kid` lets the verifier choose the key ([rfc7517] §4.5).
  - Cube's own JWKS path would refuse an unknown `kid` for up to `jwkRefetchWindow` after its last fetch ([gw-jwk] L126–139).
- **Picking up a rotated Secret.**
  - Volume-mounted Secrets update "using an eventually-consistent approach". "A container using a Secret as a subPath volume mount does not receive automated Secret updates" ([k8s-secret]).
  - Values in environment variables need a restart. Kubernetes states this for ConfigMaps ("not updated automatically and require a pod restart", [k8s-cm]); for Secrets it is by analogy (Open questions).
- **Development (compose).** Cube's secret is in `docker-compose.yml` today (L97: `CUBEJS_API_SECRET: ${CUBE_API_SECRET:-dev-secret}`). How the development signing keys are supplied is not decided (Open questions).

## Gotchas

1. **`CUBEJS_JWT_KEY` as a JWK string: the public key becomes an HMAC secret.**
   - What happens:
     - Cube passes the string straight to `jsonwebtoken.verify` ([gw] L2641–2652).
     - Node reads a string key as PEM ([node-types] L1174–1176). When that fails, jsonwebtoken falls back to `createSecretKey` ([jwt-verify] L120–130).
     - With `CUBEJS_JWT_ALGS` unset, a secret key allows `HS256/384/512` ([jwt-verify] L132–134).
   - The effect: an HS256 token keyed with the public JWK text verifies. This is RFC 8725's RS256→HS256 confusion ([rfc8725] §2.1).
   - The docs show `<JWK_AS_STRING>` ([doc-jwt] L164–180). Source-derived, not run.
   - If `jwt.key` is ever used, use a PEM and `algorithms: ['RS256']`.
2. **Pin algorithms.**
   - "Each key MUST be used with exactly one algorithm" ([rfc8725] §3.1).
   - With no `algorithms`, jsonwebtoken accepts every RS\* and PS\* algorithm for an RSA key ([jwt-verify] L132–142; [jwt-vak] L4–8).
   - jsonwebtoken ≥ 9.0.0 fixed the `none` default (CVE-2022-23540, [ghsa-23540]) and the RSA-to-HMAC key-retrieval confusion (CVE-2022-23541, [ghsa-23541]). Cube bundles 9.0.3 ([yarn-lock] L13553–13556).
3. **`exp` is optional, and skew tolerance is zero, in Cube's default path.**
   - jsonwebtoken checks `exp` and `nbf` only if present ([jwt-verify] L176–192).
   - Cube passes no `clockTolerance` or `maxAge` ([gw] L2641–2646). A token signed without `exp` never expires.
   - RFC 7519 allows "some small leeway, usually no more than a few minutes" ([rfc7519] §4.1.4). The xcube verifier should require `exp` and `iat` and set the tolerance explicitly.
4. **Cube's own JWKS cache keeps serving stale keys.**
   - A failed background refresh logs and keeps the old set ([shared-promises] L385–394).
   - A cached set is replaced only by the 60 s timer after its lifetime, or by a forced refetch on an unknown `kid` ([gw-jwk] L107, L119–139; [shared-promises] L396–427).
   - So a removed key stays valid until a later successful fetch.
5. **`CUBEJS_PLAYGROUND_AUTH_SECRET` is a skeleton key.**
   - With it set, a failed main check falls back to HS256 with that secret, **with any payload** ([gw] L2766–2784).
   - Scopes still come from `contextToApiScopes` of that payload ([gw] L2843–2851). So a playground-signed token can carry whatever marker grants `jobs`.
   - The `/cubejs-system` routes accept only this secret ([gw] L2790–2806).
   - Recommending the RS256 service credential therefore means unsetting it and re-homing system partitions (Open questions). This changes the T151/AC-145 design in `docs/research/cube/system-partitions.md` L46.
6. **A custom `checkAuth` that throws a plain `Error` answers 500** ([gw] L2897–2908; [doc-config] L1311–1316). Throw `CubejsHandlerError(403, …)` for 403 ([gw] L2886–2896).
7. **Rejected tokens are logged whole.** `checkAuthWrapper` logs `token` on every auth failure ([gw] L2886–2903). Tokens carry groups and stay replayable until `exp`, so keep lifetimes short.
8. **Header size against hundreds of groups.**
   - Cube reads the token only from headers ([gw] L2862–2875).
   - Cube's HTTP server is `http.createServer(options, app)` with no `maxHeaderSize` ([srv] L109), and Node's default is 16 KB ([node-cli]).
   - About 200 GUIDs are about 10.4 KB of base64url (`docs/research/openid-client.md` L434, the author's arithmetic).
   - An RS256 signature is as long as the modulus: about 342 base64url characters for 2048 bits and 683 for 4096 (my arithmetic). R12 allows hundreds of groups (`docs/requirements.md` L416).
9. **No TLS in Cube itself.** `CUBEJS_ENABLE_TLS` "has been deprecated and removed" ([srv] L104–107). mTLS would need a proxy or mesh in front of Cube, and the client identity would still have to reach `checkAuth` somehow.
10. **With a custom `checkAuth`, `CUBEJS_API_SECRET` is still mandatory but unused** ([core-opts] L454–476; [gw] L2761–2765). Don't reuse wechart's value; wechart shouldn't hold it at all.
11. **A service context without groups sees nothing behind generated policies.**
    - `/v1/meta` hides members no matching policy grants (`docs/research/cube/access-control.md` L298–301).
    - Defining policies for groups denies all others (L229).
    - xcube's policies admit folder groups plus the Super-Admin group (`docs/requirements.md` L475).
    - So own-behalf calls such as `/v1/meta?extended` need a group the policies admit (Open questions).
12. **`scopes` must stay a Cube-known list.** Upstream throws on unknown scopes ([gw] L2823–2829). Only xcube's wrap lets `introspection` through ([xc-gw] L79–108). The introspection doc also warns that `CUBEJS_DEFAULT_API_SCOPES` is an unchecked list (`docs/research/cube/introspection-api.md` L242–243).
13. **`setExpirationTime(300)` means 1970.** A number is "a Unix timestamp in seconds" ([jose-signjwt]). Pass `iat + ttl`.
14. **`sign()` is async** ([jose-signjwt]). Today's `CubeClient.#token` is synchronous HS256 (`packages/api/src/cube/client.ts` L278–303), so its callers will await.
15. **`jose` is ESM.** It must be added to the API bundle's externals (`packages/api/vite.build.config.ts` L23–34).
16. **Several API replicas push concurrently.** With a whole-set replace and no version, a pod still on the old Secret could push a set without the new key during a rolling update. Use a monotonic version or additive, expiring entries (design point; follows from decision 11's "2+ replicas", `docs/requirements.md` L492).
17. **The SQL API isn't token-based.** Its default `checkSqlAuth` gives `securityContext: {}` (`docs/research/cube/access-control.md` L408). Keep `CUBEJS_PG_SQL_PORT` unset, since only wechart's server calls Cube (decision 10).
18. **`DELETE /v1/running-query/:id` checks no scope** ([gw] L485–491, L1392–1406). Any valid token can cancel a request id it knows.

## Alternatives considered

**Where Cube gets the keys:**

| Option | Verdict | Why (sources above) |
|---|---|---|
| `jwt.key` / `CUBEJS_JWT_KEY` | Not viable | One string, no function, no second key, fixed at startup; the JWK-string hazard (Gotcha 1) |
| `jwt.jwkUrl` / `CUBEJS_JWK_URL` pointed at an xcube route | Viable, weaker | Stock Cube code with kid, cache and refetch. But no required `exp`, no tolerance, the whole payload becomes the context, one `audience` (so user and service keys can't be separated by audience or key set), and stale-cache windows |
| A custom verifier installed by xcube | **Recommended** | Pinned algorithm, required claims, separate key sets, a context built from groups alone, immediate reload on an unknown kid from xcube's store, 403 through `CubejsHandlerError`; applies to REST, WS and SQL-over-HTTP |

**Service credential:**

| Option | Assessment |
|---|---|
| **Separate RS256 key pair, own `aud` and `typ`, short-lived** (**recommended**) | Verifiers hold only public keys ([jwt-verify] L148–152 enforces public keys for RS\*). Separate keys and audiences follow [rfc8725] §3.12. It runs through the same code path. The public key is given to xcube by configuration, not by the push, which would need this credential to authenticate itself |
| Static shared secret (HS256 or a bearer string) | Every Cube pod holds the minting key. Mixing HS and RS keys in one verifier is the CVE-2022-23541 class ([ghsa-23541]). A plain bearer string has no expiry |
| mTLS | Cube has no TLS ([srv] L104–107), so a sidecar or mesh is needed. The identity doesn't reach `checkAuth` without a forwarded header the verifier must trust, and a security context is still needed. It is a possible extra layer, not a replacement |

**Signing library in wechart:**

| Option | Assessment |
|---|---|
| **`jose` 6.2.12** (**chosen**) | Already in the lockfile; zero dependencies; ESM with types; takes a `KeyObject`; exports JWKs; computes thumbprints; refuses RSA under 2048 bits; can verify in wechart's own tests |
| `node:crypto` only | Possible: today's HS256 is hand-built (`client.ts` L278–303), and `KeyObject.export({ format: 'jwk' })` exists ([node-crypto]). But the RFC 7638 canonicalisation and the claim and header handling would be written by hand |
| `jsonwebtoken` 9.0.3 | CommonJS with 10 dependencies ([jwt-npm]); types come separately (`@types/jsonwebtoken`, as Cube's own devDependency shows, [gw-pkg] L57); no JWK export or thumbprint, so `node:crypto` is still needed; it would be a new package in wechart's lockfile |

## Open questions / unverified

- **For the xcube design (Cube-expert agent):**
  - Where xcube keeps the pushed keys. It must be durable and shared, so that each of 2+ Cube instances, and a restarted one, verifies without calling wechart (decisions 1 and 11). Planned sibling docs `xcube-runtime.md` and `ha-topology.md` are referenced but don't exist yet.
  - The key route's path and contract.
  - How system partitions are served once `CUBEJS_PLAYGROUND_AUTH_SECRET` is unset. A candidate is an xcube route over `getPreAggregationPartitions` ([gw] L900).
  - How xcube's own health and admin routes authenticate.
- **For the user or the spec:**
  - The issuer and audience values and the two `typ` values.
  - Token lifetimes. Today's are 300 s (`client.ts` L37) and 60 s for introspection (L307).
  - Clock tolerance and the maximum lifetime.
  - RSA 2048 or 4096 bits.
  - How development keys are supplied in compose.
  - What wechart does when the push fails at start: refuse to start, not report ready, or retry.
- **For the user (R12 against the 16 KB header):** may a user token carry only the groups some policy references? AC-008 and AC-326 say "their groups". This is a requirement question.
- **For the user or spec (Gotcha 11):** should the service context carry the Super-Admin group, or should xcube's generated policies admit a reserved service group?
- **UNVERIFIED:**
  - whether `require('jsonwebtoken')` resolves from `/cube/node_modules/cube-introspection` in the image;
  - whether `--max-http-header-size` may be set through `NODE_OPTIONS` (the fetched Node doc didn't show it in the allowed list);
  - the cost of RS256 signing per request at 2048 or 4096 bits on Node 26, against S2's 3 s p95;
  - that Secret values in environment variables need a restart (quoted for ConfigMaps only);
  - that jose passes CI on Node 26 (inferred from the shared workflow);
  - whether a pre-aggregation build under a job's context is affected by access policies.
- **Corrections to sibling docs:**
  - `access-control.md` L131 says `key` is a "JWK as a JSON string". That holds only in the docs; the source needs PEM (Gotcha 1).
  - L124 says "A throw returns HTTP 500": that holds except for `CubejsHandlerError` (Gotcha 6).
  - L137's "undocumented" JWK options are now characterised: `jwkRetry` is retries (default 3), `jwkDefaultExpire` is seconds (default 300), and `jwkRefetchWindow` is milliseconds (default 60 000) ([gw-jwk] L60, L100–104, L111).

[gw]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts
[gw-jwk]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/jwk.ts
[gw-auth]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/types/auth.ts
[gw-err]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/cubejs-handler-error.ts
[gw-sql]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/sql-server.ts
[gw-ws]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/ws/subscription-server.ts
[gw-pkg]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/package.json
[core-validate]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/optionsValidate.ts
[core-opts]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OptsHandler.ts
[core-server]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/server.ts
[core-compiler]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/CompilerApi.ts
[core-dev]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/DevServer.ts
[shared-env]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/env.ts
[shared-promises]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/promises.ts
[srv]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server/src/server.ts
[docker]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-docker/latest.Dockerfile
[yarn-lock]: https://github.com/cube-js/cube/blob/v1.7.45/yarn.lock
[doc-config]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/configuration/config.mdx
[doc-jwt]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/embedding/authentication/jwt.mdx
[jwt-verify]: https://github.com/auth0/node-jsonwebtoken/blob/v9.0.3/verify.js
[jwt-vak]: https://github.com/auth0/node-jsonwebtoken/blob/v9.0.3/lib/validateAsymmetricKey.js
[jwt-npm]: https://registry.npmjs.org/jsonwebtoken/latest
[ghsa-23540]: https://github.com/auth0/node-jsonwebtoken/security/advisories/GHSA-qwph-4952-7xr6
[ghsa-23541]: https://github.com/auth0/node-jsonwebtoken/security/advisories/GHSA-hjrf-2m68-5959
[xc-gw]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/gateway.ts
[xc-srv]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/server.ts
[xc-df]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/Dockerfile
[xc-pkg]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/package.json
[jose-latest]: https://registry.npmjs.org/jose/latest
[jose-npm]: https://registry.npmjs.org/jose/6.2.12
[jose-readme]: https://github.com/panva/jose/blob/v6.2.12/README.md
[jose-rel]: https://github.com/panva/jose/releases
[jose-ci]: https://github.com/panva/jose/blob/v6.2.12/.github/workflows/test.yml
[jose-signjwt]: https://github.com/panva/jose/blob/v6.2.12/docs/jwt/sign/classes/SignJWT.md
[jose-verifyopts]: https://github.com/panva/jose/blob/v6.2.12/docs/jwt/verify/interfaces/JWTVerifyOptions.md
[jose-jwtverify]: https://github.com/panva/jose/blob/v6.2.12/docs/jwt/verify/functions/jwtVerify.md
[jose-localjwks]: https://github.com/panva/jose/blob/v6.2.12/docs/jwks/local/functions/createLocalJWKSet.md
[jose-genkp]: https://github.com/panva/jose/blob/v6.2.12/docs/key/generate_key_pair/functions/generateKeyPair.md
[jose-genkpopts]: https://github.com/panva/jose/blob/v6.2.12/docs/key/generate_key_pair/interfaces/GenerateKeyPairOptions.md
[jose-pkcs8]: https://github.com/panva/jose/blob/v6.2.12/docs/key/import/functions/importPKCS8.md
[jose-importopts]: https://github.com/panva/jose/blob/v6.2.12/docs/key/import/interfaces/KeyImportOptions.md
[jose-exportjwk]: https://github.com/panva/jose/blob/v6.2.12/docs/key/export/functions/exportJWK.md
[jose-thumb]: https://github.com/panva/jose/blob/v6.2.12/docs/jwk/thumbprint/functions/calculateJwkThumbprint.md
[jose-keyinput]: https://github.com/panva/jose/blob/v6.2.12/docs/types/type-aliases/KeyInput.md
[jose-key-src]: https://github.com/panva/jose/blob/v6.2.12/src/lib/key.ts
[oc-npm]: https://registry.npmjs.org/openid-client/6.8.8
[node-types]: /Users/srajagopal/Work/wechart/node_modules/.pnpm/@types+node@26.0.0/node_modules/@types/node/crypto.d.ts
[node-crypto]: https://raw.githubusercontent.com/nodejs/node/v24.x/doc/api/crypto.md
[node-cli]: https://nodejs.org/api/cli.html
[rfc7517]: https://www.rfc-editor.org/rfc/rfc7517.html
[rfc7518]: https://www.rfc-editor.org/rfc/rfc7518.html
[rfc7519]: https://www.rfc-editor.org/rfc/rfc7519.html
[rfc7638]: https://www.rfc-editor.org/rfc/rfc7638.html
[rfc8725]: https://www.rfc-editor.org/rfc/rfc8725.html
[helm-fn]: https://helm.sh/docs/chart_template_guide/function_list/
[sprig-crypto]: https://github.com/Masterminds/sprig/blob/master/crypto.go
[k8s-secret]: https://raw.githubusercontent.com/kubernetes/website/main/content/en/docs/concepts/configuration/secret.md
[k8s-cm]: https://raw.githubusercontent.com/kubernetes/website/main/content/en/docs/concepts/configuration/configmap.md
