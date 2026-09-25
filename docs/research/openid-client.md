---
library: openid-client (wechart's Fastify API as its own OIDC client, backend-for-frontend) with Fastify's cookie and session plugins
packages: [openid-client, "@fastify/cookie", "@fastify/session", "@fastify/secure-session"]
version: "openid-client 6.8.8, @fastify/cookie 11.1.2, @fastify/session 11.1.3 (evaluated, not selected: @fastify/secure-session 8.4.0)"
researched: 2026-09-25
sources:
  [
    https://github.com/panva/openid-client/blob/v6.8.8/README.md,
    https://github.com/panva/openid-client/tree/v6.8.8/docs,
    https://github.com/panva/openid-client/blob/v6.8.8/CHANGELOG.md,
    https://github.com/fastify/fastify-cookie/blob/v11.1.2/README.md,
    https://github.com/fastify/session/blob/v11.1.3/README.md,
    https://github.com/fastify/fastify-secure-session/blob/v8.4.0/README.md,
    https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-fed-group-claims,
    https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference,
    https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference,
    https://learn.microsoft.com/en-us/graph/api/directoryobject-getmemberobjects?view=graph-rest-1.0,
    https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc,
    https://openid.net/specs/openid-connect-rpinitiated-1_0.html,
    https://openid.net/specs/openid-connect-core-1_0.html,
  ]
---

# openid-client 6.8.8 + @fastify/cookie 11.1.2 + @fastify/session 11.1.3: wechart's API as its own OIDC client

## Summary

**The design.** wechart's Fastify API (5.12.5, per `docs/research/api-framework.md`) is a confidential OIDC relying party:

- It runs the authorization-code flow with PKCE through `openid-client`.
- It keeps the tokens, the user's identity and the user's AD groups in a server-side session, stored in wechart's Postgres metadata DB.
- The browser holds only an opaque, signed, `HttpOnly` session-id cookie.
- nginx gates page requests with `auth_request` against the API, so an unauthenticated page load never receives the SPA.

The alternative, oauth2-proxy in front of wechart, is a separate research candidate (§P2.5) and is not assessed here.

**Criteria covered:** AC-251, AC-252, AC-253, AC-254, AC-255, AC-258 and AC-008 (docs/spec.md F25, F2). The table covers the four points §P2.5 asks research to decide on:

| §P2.5 point | How this design handles it |
|---|---|
| **Users in hundreds of groups** | Groups are read once, at sign-in, and stored server-side, so cookie size never limits them. Entra ID stops putting `groups` in the token above 200 groups for JWT ([ms-groupclaims]). The API then calls Microsoft Graph `getMemberObjects`, which is transitive ([ms-gmo]). See "Groups" below. |
| **Passing groups to Cube (AC-008)** | The API already signs Cube JWTs itself (`packages/api/src/cube/client.ts` L259–287). Cube's `contextToGroups` reads `securityContext.groups` (docs/research/cube/access-control.md). The session's groups go straight into that context, with no header hop. |
| **Logout (AC-253)** | `session.destroy()` deletes the store row, so every copy of the cookie stops working at once. Then `buildEndSessionUrl` performs RP-initiated logout at the IdP ([oc-endsession], [oidc-rpil]). |
| **Switching security off (AC-254)** | Neither the session plugin nor the OIDC routes are registered. `request` gets the single Super-Admin user. `/api/auth/check` answers 204, so the nginx config is the same in both modes. |

**Session plugin choice: `@fastify/session` 11.1.3, with a Postgres store, over `@fastify/secure-session` 8.4.0.** The reasons are:

- **Size.** A browser only has to support 4096 bytes per cookie, name and attributes included ([rfc6265]). 200 Entra group GUIDs are about 7.8 KB of JSON before encryption and base64 (my arithmetic: 36 characters plus quotes and a comma, times 200).
- **Revocation.** secure-session keeps the whole session in the cookie, so "an attacker could impersonate a user if the cookie is leaked", until `expiry` passes ([ss-readme]). The same design produced advisory GHSA-9wwp-q7wq-jx35 ("Reuse of destroyed secure session cookie", [ss-ghsa]).

The full comparison is under "Alternatives considered".

## Install

```bash
pnpm --filter @wechart/api add openid-client@6.8.8 @fastify/cookie@11.1.2 @fastify/session@11.1.3
```

**openid-client 6.8.8**
- MIT, ESM (`"type": "module"`), no `engines` field. Its dependencies are `jose ^6.2.12` and `oauth4webapi ^3.8.8` ([oc-npm]). `latest` is 6.8.8 ([oc-tags]), published 2026-09-05 ([oc-rel]).
- It is "an ESM module using ES2022 syntax and it depends on WebCryptoAPI and Fetch API globals… Versions 20.x and newer have all the necessary globals" ([oc-changelog], 6.0.0 notes). The README also offers CJS `require` on Node `^20.19.0 || ^22.12.0 || >= 23.0.0` ([oc-readme]).
- **Node 26 evidence.** The Test workflow builds its Node matrix from a shared workflow with `min: 20` ([oc-ci]). That workflow appends `"current"` when the newest Node has no LTS designation ([oc-nodever]). Node 26 started 2026-05-05 and becomes LTS on 2026-10-28 ([node-sched]), so today "current" is 26. The 2026-09-14 run on `main` passed the jobs `node (current, test)` and `node (current, tap:node)` ([oc-run]). This is an inference from the matrix logic plus the dates, not a job literally named "26".
- Support policy: the v6.x end-of-life date is not yet set, and "will be determined prior to the release of its successor" ([oc-security]). The repo had zero open issues when checked ([oc-issues]).

**@fastify/cookie 11.1.2**
- MIT, CommonJS. Dependencies are `cookie ^2.0.0` and `fastify-plugin ^6.0.0` ([ck-npm], [ck-pkg]). `latest` is 11.1.2 ([ck-tags]), published 2026-07-15 ([ck-rel]).
- Plugin versions 10.x and later pair with Fastify ^5 ([ck-readme]).
- CI at this tag uses `fastify/workflows plugins-ci.yml@v6` ([ck-ci]), whose default Node matrix is `["20", "22", "24"]` ([fw-v6]). **Node 26 is not in this tag's CI.**

**@fastify/session 11.1.3**
- MIT, CommonJS. Dependencies are `fastify-plugin ^6.0.0` and `safe-stable-stringify ^2.4.3`. `@fastify/cookie` is only a devDependency, not a peer ([fs-npm], [fs-pkg]), so install it yourself. The plugin declares `dependencies: ['@fastify/cookie']` and `fastify: '5.x'` ([fs-index]).
- `latest` is 11.1.3 ([fs-tags]), published 2026-09-14 ([fs-rel]).
- CI uses `plugins-ci.yml@…# v7.0.0` ([fs-ci]), whose default matrix is `["20", "22", "24", "26"]` ([fw-v7]).

**Other install facts**
- **No install scripts.** openid-client, @fastify/cookie and @fastify/session have no install hooks in the fetched metadata, so nothing is needed in `allowBuilds` in `pnpm-workspace.yaml` ([oc-npm], [ck-pkg], [fs-pkg]).
- **Build externals (project config).** `packages/api/vite.build.config.ts` lists runtime dependencies explicitly in `rollupOptions.external` ("Dependencies stay external"). Add `openid-client`, `@fastify/cookie` and `@fastify/session` there too.
- **TypeScript.** `tsconfig.base.json` uses `moduleResolution: "bundler"`, `verbatimModuleSyntax` and `esModuleInterop`. The Fastify plugins' types use `export =` ([ck-types], [fs-types]), so import them as defaults: `import fastifyCookie from '@fastify/cookie'`.

## Init / auth pattern

### Configuration

The deployment's configuration names these values. Where a value's default is not decided in the spec, it is not given here.

| Setting | Meaning |
|---|---|
| `security.enabled` | Off gives single-user mode (AC-254). |
| `oidc.issuer` | Issuer URL. For Entra, the tenant-specific `https://login.microsoftonline.com/<tenant-id>/v2.0` ([ms-oidc]); see Gotchas on `common`. |
| `oidc.clientId`, `oidc.clientSecret` | Confidential web client. Entra requires `client_secret` or a certificate for web apps ([ms-code]). |
| `oidc.scopes` | Must include `openid` ([ms-oidc]). For Entra, add `profile` (needed for `name`, `oid`, `tid` ([ms-idtoken])) and `User.Read` (needed for the Graph overage call ([ms-gmo])). |
| `oidc.groupsClaim` | The claim holding groups, e.g. `groups` (AC-252). |
| `publicBaseUrl` | What the browser sees, e.g. `https://wechart.example.com`. It is used to build `redirect_uri` and the callback URL (see Gotchas). |
| `oidc.backchannelOrigin` | Development only: the origin the API container uses to reach the IdP when it differs from the browser's. |
| `oidc.allowHttp` | Development only: allows a plain-HTTP issuer. |
| `session.secret` | 32 or more characters, or an array for rotation ([fs-readme], [fs-index]). Kept in the deployment's Secret. |
| `superAdminGroup` | AC-256. |

### Discovery, lazy and cached

```ts
// packages/api/src/auth/oidc.ts
import * as oidc from 'openid-client';

let pending: Promise<oidc.Configuration> | undefined;

export function oidcConfig(s: OidcSettings): Promise<oidc.Configuration> {
  // Lazy, so the API (and /api/health) starts while the IdP is still booting;
  // a failed discovery is retried on the next sign-in.
  pending ??= discover(s).catch((e: unknown) => { pending = undefined; throw e; });
  return pending;
}

function discover(s: OidcSettings): Promise<oidc.Configuration> {
  const execute: Array<(c: oidc.Configuration) => void> = [oidc.enableNonRepudiationChecks];
  if (s.allowHttp) execute.push(oidc.allowInsecureRequests); // dev only
  const options: oidc.DiscoveryRequestOptions = { execute };
  if (s.backchannelOrigin) {
    const internal = s.backchannelOrigin;
    // dev: browser reaches the IdP at s.issuer's origin, the container at `internal`
    options[oidc.customFetch] = (url, init) => {
      const u = new URL(url);
      if (u.origin === s.issuer.origin) { u.protocol = internal.protocol; u.host = internal.host; }
      // @ts-expect-error CustomFetchOptions vs RequestInit (see Gotchas)
      return fetch(u, init);
    };
  }
  return oidc.discovery(s.issuer, s.clientId, s.clientSecret, undefined, options);
}
```

The APIs used here:
- `discovery(server, clientId, metadata?, clientAuthentication?, options?)` returns `Promise<Configuration>`. A string `metadata` is shorthand for `client_secret`, and the default client authentication is `ClientSecretPost` ([oc-discovery]).
- `DiscoveryRequestOptions` has `[customFetch]`, `execute` (functions run on the new Configuration), `algorithm` and `timeout`. The timeout defaults to 30 s and carries over to later requests ([oc-dro]).
- `allowInsecureRequests` lifts the HTTPS-only default. The docs mark it deprecated "only to make it stand out… possibly only for local development" ([oc-insecure]).
- `enableNonRepudiationChecks` turns on JWS signature validation of `id_token`s. By default openid-client does not verify signatures on tokens received straight from the token endpoint over TLS ([oc-nonrep]), which OIDC Core §3.1.3.7 permits ([oidc-core]). Turn it on because development runs over plain HTTP, where that TLS argument does not hold.

### Plugins, the guard and the OIDC routes (security on)

```ts
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';

declare module 'fastify' {
  interface Session {                      // @fastify/session augmentation (fs-readme)
    user?: { iss: string; sub: string; name: string; groups: string[] };
    idToken?: string;                      // for id_token_hint at logout
    authAt?: number;                       // for an absolute timeout
    oidcTx?: Record<string, { verifier: string; nonce: string; returnTo: string; at: number }>;
  }
}

app.register(fastifyCookie);
app.register(fastifySession, {
  secret: settings.sessionSecrets,          // string >= 32 chars, or string[] to rotate
  cookieName: settings.secureCookies ? '__Host-wechart' : 'wechart',
  store: new PgSessionStore(db),            // see "Server-side store" below
  saveUninitialized: false,                 // default true would write a row per anonymous request
  rolling: false,                           // default true saves to the store on every request
  cookie: { path: '/', httpOnly: true, sameSite: 'lax', secure: settings.secureCookies,
            maxAge: settings.sessionMaxAgeMs },   // milliseconds in @fastify/session
});

// Guard: preParsing runs after every onRequest hook (the session plugin loads
// request.session in onRequest) and before bodies are parsed (fy-lifecycle).
app.addHook('preParsing', async (request, reply) => {
  if (request.routeOptions.config.public) return;           // health + /api/auth/*
  if (!request.session.user || sessionExpired(request.session)) {
    return reply.code(401).send({ error: 'unauthenticated' });  // AC-251, no content
  }
});

app.get('/api/auth/login', { config: { public: true } }, async (request, reply) => {
  const config = await oidcConfig(settings);
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const tx = request.session.oidcTx ?? {};
  tx[state] = { verifier, nonce, returnTo: safeReturnTo(request.query), at: Date.now() };
  request.session.oidcTx = tx;              // keyed by state: parallel tabs don't clobber
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: new URL('/api/auth/callback', settings.publicBaseUrl).href,
    scope: settings.scopes,
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    state,
    nonce,
  });
  return reply.redirect(url.href);          // 302 by default (fy-reply)
});

app.get('/api/auth/callback', { config: { public: true } }, async (request, reply) => {
  const config = await oidcConfig(settings);
  const current = new URL(request.url, settings.publicBaseUrl); // never from Host
  const state = current.searchParams.get('state') ?? '';
  const tx = request.session.oidcTx?.[state];
  if (!tx) return reply.code(400).send({ error: 'unknown sign-in attempt' });
  const tokens = await oidc.authorizationCodeGrant(config, current, {
    pkceCodeVerifier: tx.verifier, expectedState: state, expectedNonce: tx.nonce,
  });
  const claims = tokens.claims();           // IDToken | undefined
  if (!claims) return reply.code(502).send({ error: 'no id_token' });
  const groups = await resolveGroups(config, claims, tokens.access_token, settings);
  await request.session.regenerate();       // new session id after login (session fixation)
  request.session.user = { iss: claims.iss, sub: claims.sub, name: displayName(claims), groups };
  request.session.idToken = tokens.id_token;
  request.session.authAt = Date.now();
  return reply.redirect(tx.returnTo);
});

app.post('/api/auth/logout', { config: { public: true } }, async (request, reply) => {
  const idToken = request.session.idToken;
  await request.session.destroy();          // deletes the store row (AC-253)
  reply.clearCookie(cookieName, { path: '/' });
  let redirectTo = new URL('/', settings.publicBaseUrl).href;
  const config = await oidcConfig(settings);
  if (config.serverMetadata().end_session_endpoint) {
    redirectTo = oidc.buildEndSessionUrl(config, {
      post_logout_redirect_uri: redirectTo,
      ...(idToken ? { id_token_hint: idToken } : {}),
    }).href;
  }
  return { redirectTo };                    // the SPA does location.assign(redirectTo)
});

// For nginx auth_request: 204 when signed in (or when security is off), else 401.
app.get('/api/auth/check', { config: { public: true } }, async (request, reply) =>
  reply.code(request.session.user && !sessionExpired(request.session) ? 204 : 401).send());
```

Sources for this block:
- **Routes.** Route `config` is "object used to store custom configuration" ([fy-routes]). It is readable as `request.routeOptions.config` ([fy-request]).
- **Guard hook.** The lifecycle order is onRequest → preParsing → Parsing → preValidation → preHandler ([fy-lifecycle]). `@fastify/session` loads the session in `onRequest` and saves it in `onSend` ([fs-index]).
- **Session methods.** `regenerate()` and `destroy()` return a Promise when called without a callback ([fs-readme]). Since 11.1.3, `regenerate` destroys the previous session in the store ([fs-1113]).
- **OWASP.** The session ID "must be renewed or regenerated… after any privilege level change", and logout must invalidate the session on the server side ([owasp-session]).
- **`safeReturnTo`** must accept only a same-origin relative path: one leading `/`, not `//`. OWASP's guidance is to allow-list redirect targets rather than accept arbitrary URLs ([owasp-redirect]).

### Security off (AC-254)

- Register neither `@fastify/cookie`/`@fastify/session` nor the guard.
- `app.decorateRequest('wechartUser', null)` and set the per-request value in an `onRequest` hook. Fastify forbids reference-type values in `decorateRequest` and prescribes this pattern ([fy-decorators]). With security on, the same hook fills it from `request.session.user`.
- Every handler reads `request.wechartUser` and nothing else. Single-user mode sets it to the one Super-Admin user, and today's `/api/me` answers `{ name: SINGLE_USER }` (`server.ts` L221).
- `/api/auth/check` answers 204. `/api/auth/login` redirects to `/`. `/api/auth/logout` answers `{ redirectTo: '/' }`.

### nginx: gating page requests (AC-251)

The API never sees page requests; nginx serves the SPA. `ngx_http_auth_request_module` "implements client authorization based on the result of a subrequest": 2xx allows the request, 401/403 deny it. The module is "not built by default" ([ngx-authreq]). nginx's own Alpine package build passes `--with-http_auth_request_module` at tag `1.30.5-1` ([pkgoss]). Confirm it on the pinned image with `nginx -V` (see Open questions).

The redirect-on-401 idiom comes from oauth2-proxy's nginx docs: `error_page 401 = @signin;` plus a named location that `return 302`s, because a 403 with a Location header is not followed by browsers ([o2p-nginx]).

```nginx
location = /_auth {
    internal;
    proxy_pass http://<release>-api:4100/api/auth/check;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header X-Forwarded-Proto $wechart_forwarded_proto;   # repeat all headers:
    proxy_set_header X-Forwarded-Host  $host;                      # inheritance is all-or-nothing
}
location @signin { return 302 /api/auth/login?returnTo=$request_uri; }
location / {
    auth_request /_auth;
    error_page 401 = @signin;
    try_files $uri /index.html;
}
# location /api/ stays as today: the API's own guard answers 401 (AC-251)
```

`proxy_set_header` inheritance is all-or-nothing per level (docs/research/nginx.md, [proxy-sh] there).

## API surface we will use

### openid-client 6.8.8

Every export named here appears in the API index ([oc-index]).

| Function | Signature / contract | Source |
|---|---|---|
| `discovery` | see above; `server` must equal the discovered `issuer` | [oc-discovery], [oc-718], [oc-737] |
| `new Configuration(server, clientId, metadata?, clientAuthentication?)` | builds a config from known metadata, no discovery | [oc-config] |
| `config.serverMetadata()` | the discovered metadata, e.g. `end_session_endpoint`; `.supportsPKCE(method = 'S256')` | [oc-readme], [oc-smh] |
| `randomPKCECodeVerifier()`, `calculatePKCECodeChallenge(v)` | a verifier string; `Promise<string>` challenge. They "MUST be generated for every redirect" and be stored in the user's session | [oc-readme] |
| `randomState()`, `randomNonce()` | random strings | [oc-index] |
| `buildAuthorizationUrl(config, params): URL` | adds `client_id` and `response_type`; PKCE, state and nonce "must always be random and be tied to the user-agent" | [oc-buildauth] |
| `authorizationCodeGrant(config, currentUrl: URL \| Request, checks?, tokenEndpointParameters?, options?)` | validates the authorization response, then redeems the code; returns `Promise<TokenEndpointResponse & TokenEndpointResponseHelpers>` | [oc-acg] |
| `AuthorizationCodeGrantChecks` | `pkceCodeVerifier`; `expectedState` ("When undefined, no state should be in the response"); `expectedNonce` ("When undefined, no nonce should be present"); `idTokenExpected`; `maxAge` | [oc-checks] |
| `tokens.claims(): IDToken \| undefined`, `tokens.expiresIn()` | the parsed ID-token claim set; `IDToken` has `iss`, `sub`, `aud`, `exp`, `iat`, optional `nonce`/`auth_time`/…, plus an index signature for other claims such as `groups` | [oc-helpers], [oc-idtoken] |
| `fetchUserInfo(config, accessToken, expectedSubject, options?)` | UserInfo claims; `expectedSubject` is the ID token's `sub` | [oc-userinfo] |
| `fetchProtectedResource(config, accessToken, url, method, body?, headers?, options?)` | `Promise<Response>` with a Bearer header. Used for Microsoft Graph | [oc-fpr] |
| `refreshTokenGrant(config, refreshToken, parameters?, options?)` | only if refresh tokens are adopted (open question) | [oc-refresh] |
| `buildEndSessionUrl(config, parameters?): URL` | adds `client_id`; needs `end_session_endpoint` in the metadata | [oc-endsession] |
| `enableNonRepudiationChecks`, `allowInsecureRequests`, `customFetch` | see Init | [oc-nonrep], [oc-insecure], [oc-customfetch] |

**What validation covers.** openid-client is certified against the Basic, FAPI 1.0 and FAPI 2.0 RP conformance profiles ([oc-readme]). I could not read oauth4webapi's validation source at v3.8.8: the file is too large for the fetch tool. Issue trackers show it rejecting a wrong `aud` ("unexpected JWT "aud" (audience) claim value", [na-10210]) and a wrong `nonce` ("unexpected ID Token "nonce" claim value", [na-7313]).

**State and nonce storage.** Keep them in the server-side session, keyed by `state`, before the redirect. Two consequences:
- The session cookie must be `SameSite=Lax`, not `Strict`. Lax cookies travel on cross-site top-level navigations with safe methods, and Strict cookies only on same-site requests ([mdn-setcookie]). The IdP's redirect back to `/api/auth/callback` is a cross-site top-level GET.
- Keep `response_mode` at its default `query`. `query` is the default for code-only requests ([ms-code]). `form_post` would make the callback a cross-site POST, which drops Lax cookies ([mdn-setcookie]).

### @fastify/cookie 11.1.2

- `register(fastifyCookie, { secret?, hook?, algorithm?, parseOptions? })`. The parse hook defaults to `onRequest`. An array `secret` signs with the first key and verifies against all ([ck-readme]).
- Decorators: `request.cookies`, `reply.setCookie(name, value, opts)`, `reply.clearCookie(name, opts)`, `(request|reply).unsignCookie(v)` ([ck-types], [ck-index]).
- **`maxAge` is in seconds here** ([ck-types]). `secure` accepts `'auto'`, which sets Secure only for HTTPS requests ([ck-types]).
- The plugin loads `cookie` with `await import('cookie')` during registration ([ck-index], [ck-rel] 11.1.2 "use dynamic import for cookie").

### @fastify/session 11.1.3

**Options** ([fs-readme], [fs-types]):
- `secret`: required, 32 or more characters, or an array or signer.
- `cookieName`: defaults to `sessionId`.
- `cookiePrefix`, `cookie`, `store`, `saveUninitialized` (default `true`), `rolling` (default `true`), `idGenerator`.
- Cookie defaults: `httpOnly: true`, `secure: true`. **`maxAge` is in milliseconds here.**

**`request.session` members** ([fs-readme], [fs-types]):
- `sessionId`, `encryptedSessionId`, `cookie`
- `get`, `set`, `touch`, `regenerate(ignoreFields?)`, `destroy()`, `reload()`, `save()`, `isModified()`, `isSaved()`, `options(opts)`
- `request.sessionStore` is also exposed.

**Store contract** ([fs-types]):

```ts
interface SessionStore {
  set(sessionId: string, session: Fastify.Session, callback: Callback): void;
  get(sessionId: string, callback: CallbackSession): void;
  destroy(sessionId: string, callback: Callback): void;
}
```

The README says the store is "Compatible with stores from express-session". The default in-memory store "should not be used in a production environment because it will leak memory" ([fs-readme]).

**Behaviour that matters here** (from source at the tag):
- **Expired sessions.** On load, a session whose `expiration.getTime() <= Date.now()` is replaced through `regenerate`. An invalid cookie signature yields a new, empty session ([fs-index]).
- **When it saves.** `onSend` saves when `cookieId !== encryptedSessionId ? saveUninitialized || isModified() : rolling || isModified()`. **With the default `rolling: true`, every request with a valid cookie writes to the store** ([fs-index]).
- **Plain HTTP.** When `session.cookie.secure === true && request.protocol !== 'https'`, it does not save or set the cookie ([fs-index]).
- **After `destroy()`.** `request.session` becomes `null` ([fs-session]). `onSend` then returns early without clearing the cookie ([fs-index]), which is why the logout route clears it explicitly.
- **Serialization.** The session is serialized with `safe-stable-stringify`. `cookie.toJSON()` includes `expires`, and the Cookie constructor restores it with `new Date(cookie.expires)` ([fs-session], [fs-cookie]), so a JSON or jsonb column round-trips correctly.

**Server-side store (design).** Implement the three methods over the metadata DB with Kysely (docs/research/db-access.md):
- A table keyed by session id with a `jsonb` session and an `expires_at` column.
- A periodic delete of expired rows, because Postgres has no TTL.
- Several API replicas behind the Helm Service share it, which is why the in-memory store is ruled out beyond the leak.

This keeps hundreds of groups, the `id_token` (for `id_token_hint`) and any refresh token off the browser.

### Groups (AC-252, AC-255, AC-258, AC-008)

**Reading the claim** (`resolveGroups`):
1. `claims[groupsClaim]`, from the ID token.
2. If absent, the UserInfo response.
3. Normalize a string to `[string]`.

The configured claim name follows §P2.4 ("configured by issuer, client and the claim that carries groups").

For Entra, use the ID token: UserInfo returns only `sub`, the name claims, `picture` and `email`, and "You can't add to or customize the information returned by the UserInfo endpoint" ([ms-userinfo]). The `groups` claim is not emitted by default. It needs `groupMembershipClaims` in the app manifest, or an `idToken` optional claim ([ms-groupclaims]).

**Entra group overage.**
- Above 200 groups for JWT (150 for SAML), Entra omits `groups` entirely and adds `_claim_names: { groups: "src1" }` and `_claim_sources: { src1: { endpoint } }` ([ms-idtoken], [ms-at]). This is OIDC's distributed-claims shape ([oidc-core] §5.6.2).
- The endpoint in that claim "will be an Azure AD Graph URL (that is, graph.windows.net)". Microsoft says not to rely on it and to build a Microsoft Graph URL instead ([ms-at]).
- `hasgroups: true` means "use the Microsoft Graph API to determine the user's groups" ([ms-idtoken]). It appears for implicit-flow tokens when a user is in more than 5 groups ([ms-groupclaims]).

**What the API must do on overage.** If `_claim_names?.[groupsClaim]` or `hasgroups` is present, call:

```ts
const res = await oidc.fetchProtectedResource(config, tokens.access_token,
  new URL('https://graph.microsoft.com/v1.0/me/getMemberObjects'), 'POST',
  JSON.stringify({ securityEnabledOnly: true }), new Headers({ 'content-type': 'application/json' }));
const { value } = (await res.json()) as { value: string[] };   // group object IDs
```

- `getMemberObjects` "is transitive". `/me` needs only delegated `User.Read`. `securityEnabledOnly: true` returns security groups only. The response is `{ value: string[] }` of object IDs ([ms-gmo]).
- The Graph access token comes from the same code redemption when `User.Read` is in the scopes. Microsoft says to treat that token as opaque and not validate it ([ms-oidc]).
- **Alternative call:** `GET /me/transitiveMemberOf/microsoft.graph.group`, also `User.Read`. It pages at 100 by default, up to 999, via `@odata.nextLink`. The OData cast needs `ConsistencyLevel: eventual` and `$count` ([ms-tmo]).

**Admin-side options that shrink the token** ([ms-groupclaims]):
- *Groups assigned to the application* is "Recommended for large organizations". But "nested groups are not included and the user must be a direct member", which conflicts with R12's nested groups.
- *Group filtering* by prefix, suffix or contains applies "regardless of the group hierarchy". It works only if the user is in "1,000 or fewer groups (including direct and transitive memberships)"; beyond that an overage claim is sent.
- App roles are recommended only when "Support for nested groups isn't required".

The Graph fallback is therefore the only route that meets R12 for every user size.

**IDs vs names.**
- Entra emits group **object IDs** by default, "Available for all groups" ([ms-groupclaims]).
- `sAMAccountName`, `NetbiosDomain\sAMAccountName`, `DNSDomainName\sAMAccountName` and the on-prem SID are available only for groups synced from AD by Entra Connect ([ms-groupclaims]).
- Cloud-only display names are available only for groups assigned to the app, "because a group name is not unique" ([ms-groupclaims]).
- **Nested groups:** "Group claims in tokens include nested groups, except when you're using the option to restrict the group claims to groups that are assigned to the application" ([ms-groupclaims]).

So what AC-259's folder permissions store must be the same identifier the claim carries (object IDs for Entra by default). The overage fallback returns object IDs ([ms-gmo]), so a tenant configured to emit names needs the fallback to fetch the matching attribute (see Open questions).

**Identity key.** Use `iss` + `sub`: "The only Claims that the RP can rely on as a stable identifier are the sub and iss Claims together" ([oidc-core] §5.7). Entra's `sub` is pairwise per application, while `oid` is the same across apps in a tenant ([ms-idtoken]).

**Display name (AC-252).** Use `name`, which needs the `profile` scope and is "for display purposes only", falling back to `preferred_username` ([ms-idtoken]).

**Into Cube (AC-008).** Put `groups` into the security context the API already signs (`cube/client.ts`). Cube's `contextToGroups` returns `securityContext.groups` (docs/research/cube/access-control.md).

### Logout (AC-253)

- Local logout: `session.destroy()` deletes the row, and every later request with that cookie loads no session, so the guard answers 401.
- RP-initiated logout ([oidc-rpil]): `id_token_hint` is RECOMMENDED, `post_logout_redirect_uri` is OPTIONAL, and `client_id` is OPTIONAL. The spec leaves local logout to the RP because notifications "are unreliable".
- Microsoft: "perform both" (redirect to `end_session_endpoint` and clear your app's session), otherwise "the user may remain authenticated and not be prompted to sign-in the next time". `post_logout_redirect_uri` "must match one of the redirect URIs registered" ([ms-oidc]).
- Make sign-out a POST (the SPA's Sign out control calls it with `fetch`, then navigates to `redirectTo`). A cross-site page cannot force a logout, because Lax cookies do not travel on cross-site POSTs ([mdn-setcookie]).
- **Single sign-out** (optional): Entra can call a front-channel logout URL as a GET from the IdP ([ms-oidc]). That request comes from Entra's site, so a `SameSite=Lax` cookie is not sent with it ([mdn-setcookie]). The app would have to find the session by the ID token's `sid` claim ([ms-idtoken]), which a server-side store can index and an encrypted cookie cannot. Not required by AC-253.

### SPA behaviour and CSRF (AC-251)

- **API.** The guard answers 401 with `{ error: 'unauthenticated' }` and no content. The SPA's fetch wrapper turns any 401 from a non-`/api/auth/*` route into `location.assign('/api/auth/login?returnTo=' + encodeURIComponent(location.pathname + location.search))`. This also covers the Vite dev and preview servers, which proxy `/api` but serve pages without nginx (`packages/web/vite.config.ts` L20–25).
- **Pages.** nginx `auth_request` plus a 302 to `/api/auth/login` (see Init). No HTML or JS is served without a session.
- **CSRF.**
  - `SameSite=Lax` "only blocks unsafe methods" and is scoped to the registrable domain, not the origin. OWASP treats it as defense in depth ([owasp-csrf]).
  - Fastify parses only `application/json` and `text/plain` bodies natively; other media types throw `FST_ERR_CTP_INVALID_MEDIA_TYPE` ([fy-ctp]). `text/plain` is still form-postable, so add a check in the guard for unsafe methods: reject `Sec-Fetch-Site: cross-site`, or check `Origin` against `publicBaseUrl`. OWASP describes both ([owasp-csrf]).
  - No GET route may change state, since Lax cookies ride cross-site top-level GETs ([mdn-setcookie]).

## Gotchas

1. **The issuer must match exactly, and development has two hostnames.** v6 discovery fails with "discovered metadata issuer does not match the expected issuer" when the URL passed differs from the metadata's `issuer`.
   - With Keycloak behind Docker, a back-channel URL (`http://identity-provider-web:8080/…`) against a front-channel issuer (`http://localhost:8080/…`) fails, and the issue was closed as not planned ([oc-737]).
   - With Azure AD B2C, discovery works when `/.well-known/openid-configuration` is appended; the issue is labelled an IdP issue ([oc-718]).
   - Remedy used above: discover with the **public** issuer and rewrite the origin in `customFetch` ([oc-customfetch]). Alternatively, build `new Configuration(serverMetadata, …)` by hand ([oc-config]). docker-compose and docker-desktop both hit this.
2. **`redirect_uri` comes from `currentUrl`.** openid-client derives the token request's `redirect_uri` from the callback URL "while stripping query parameters" ([oc-customfetch]). Build `currentUrl` from the configured `publicBaseUrl`, never from `Host`. The Vite proxy sets `changeOrigin: true` (`vite.config.ts` L21, L24), and nginx forwards the original host only as `X-Forwarded-Host` (nginx.md L218).
3. **Secure cookies behind the proxy.** `@fastify/session` silently skips saving the session and setting the cookie when `secure === true` and `request.protocol !== 'https'` ([fs-index]). `request.protocol` honours `X-Forwarded-Proto` only with Fastify's `trustProxy` ([fy-server]). nginx already sends `X-Forwarded-Proto` (nginx.md L122). Set `trustProxy` to nginx's address; Fastify warns the derived values "must be treated as untrusted input unless your proxy chain is explicitly trusted" ([fy-server]).
4. **Plain-HTTP development and WebKit.** Playwright's WebKit does not restore `secure: true` cookies on an `http://` origin (closed as not planned, [pw-35712]). In docker-compose and on docker-desktop over `http://localhost`, use `secure: false` and a name without `__Host-`. `__Host-` requires Secure, no Domain and `Path=/` ([mdn-setcookie]). In production, use `secure: true` and a `__Host-` name ([owasp-session]).
5. **`maxAge` units differ.** It is seconds in `@fastify/cookie` ([ck-types]) and milliseconds in `@fastify/session` ([fs-readme]).
6. **Defaults to override in `@fastify/session`.**
   - `saveUninitialized: true` writes a store row for any new session.
   - `rolling: true` calls `store.set` on every request with a valid cookie, which adds a DB write per API call on top of the read. That matters for S2's 3 s p95 dashboard budget.
   - Sources: [fs-readme], [fs-index].
   - An idle timeout can instead update a `lastSeen` field only when it is stale.
7. **Pin `@fastify/session` ≥ 11.1.3.** 11.1.3: "destroy the previous session on regenerate" ([fs-1113]). 11.1.2: "fix session secure cookie override", "clear session cookie with configured path" ([fs-1112]). Versions ≤ 10.8.0 had CVE-2024-35220, "Reuse of destroyed session cookie" ([fs-ghsa]).
8. **Pin `openid-client` 6.8.8.** 6.8.8 "apply the default HTTP request timeout" and "calculate token lifetimes using elapsed time" ([oc-changelog]).
9. **`expectedState` and `expectedNonce` are strict.** Sending `state` or `nonce` without passing the matching check fails, because undefined means "no state should be in the response" and "no nonce should be present" ([oc-checks]). The README example adds `state` only when PKCE is unsupported ([oc-readme]). This design always sends both and always checks both.
10. **Use a tenant issuer, not `common`, for Entra.** The `{tenant}` value selects the audience, and the `common` metadata is templated ([ms-oidc]). Several RP libraries fail on the `{tenantid}` placeholder issuer in multi-tenant metadata (search results: spring-security #17948, keycloak #28662; not fetched). How openid-client v6 behaves with `common` is UNVERIFIED. Single-tenant use avoids it.
11. **Entra sign-out and device SSO.** After sign-out, a valid Primary Refresh Token can interrupt single sign-out. The user sees an account picker and may sign back in without credentials ([ms-oidc]). This matters when checking AC-253 against Entra at phase end.
12. **The Cube JWT grows with groups.** Every group ID travels in the `Authorization` header to Cube. Node's `--max-http-header-size` defaults to 16 KiB (cited in docs/research/router.md, from nodejs.org/api/cli.html). By my arithmetic, 200 GUIDs are about 7.8 KB of JSON and about 10.4 KB after base64url, and about 400 would pass 16 KiB. Whether Cube's API server raises Node's limit is UNVERIFIED. Microsoft caps token groups for the same reason: "To ensure that the token size doesn't exceed HTTP header size limits" ([ms-idtoken]).
13. **Plugin and hook order.** `register()` defers loading until `ready`/`after`/`listen`; awaiting it "finalizes" the plugin ([fy-plugins]). Put the guard in `preParsing`, which runs after every `onRequest` hook, including the session plugin's ([fy-lifecycle]). Register cookie and session before routes. Whether root hooks added by plugins that load at `ready` also apply to routes declared synchronously earlier in `buildServer` is not stated in the Encapsulation doc ([fy-encap]). Prove it with the AC-251 `inject` test.
14. **`customFetch` typing.** The docs warn third-party fetch implementations often need `@ts-expect-error` ([oc-customfetch]). `CustomFetch` is `(url: string, options: CustomFetchOptions) => Promise<Response>` ([oc-customfetch-type]).
15. **Node 26 CI for `@fastify/cookie` 11.1.2** covers only Node 20, 22 and 24 ([ck-ci], [fw-v6]). `@fastify/session` 11.1.3 does test Node 26 ([fs-ci], [fw-v7]).
16. **Health routes.** Mark them `config: { public: true }`. Which routes count as "health" for AC-251 (`/api/health` for sure; `/api/cube-health`?) is a spec decision (Open questions).

## Alternatives considered

**`@fastify/secure-session` 8.4.0: not selected.**
- Facts: MIT, CommonJS, depends on `sodium-native ^5.0.1` and `@fastify/cookie ^11.0.1` ([ss-npm]). `latest` is 8.4.0 ([ss-tags]), published 2026-09-22 with "support cookie v2.x" and docs for `__Host-` ([ss-840]).
- CI uses plugins-ci v7.0.0, so Node 20–26 ([ss-ci], [fw-v7]).
- `sodium-native` 5.1.0 is a native addon shipped with `prebuilds`, with only test scripts and no install script ([sodium-npm], [sodium-pkg]).

| Criterion | `@fastify/session` 11.1.3 + Postgres store | `@fastify/secure-session` 8.4.0 |
|---|---|---|
| Storage | Signed session id in the cookie; data server-side ([fs-readme]) | Whole session encrypted into the cookie with libsodium secretbox ([ss-readme]) |
| Hundreds of groups plus the `id_token` | Unbounded (a DB row) | Bounded by a 4096-byte-per-cookie floor ([rfc6265]); 200 GUIDs alone are about 7.8 KB before encryption and base64 |
| Sign-out revokes every copy (AC-253) | Yes: `destroy()` deletes the row ([fs-session]) | No: "an attacker could impersonate a user if the cookie is leaked"; the maximum lifetime is `expiry`, default 1 day ([ss-readme]); see [ss-ghsa] |
| Front-channel/`sid` logout | Possible (index rows by `sid`) | Not possible (no server state) |
| Per-request cost | One PK read; plus a write if `rolling` | None (decrypt in process) |
| Dependencies | Pure JS | Native addon (`sodium-native`) |
| Multiple API replicas | Shared Postgres store | Shared key |
| Key rotation | `secret: string[]` ([fs-readme]) | `key: [newKey, oldKey]`, at most two recommended ([ss-readme]) |
| API | `get/set/regenerate/destroy/reload/save/touch` ([fs-types]) | `get/set/delete/regenerate/touch/options/data` ([ss-types]) |

The deciding criteria are the group-count constraint (R12, AC-255, AC-258) and server-side revocation (AC-253). Only a server-side store meets both. That makes it a fit and correctness decision, not a preference.

## Open questions / unverified

- **For the user: session lifetime.** The spec sets no idle or absolute timeout. OWASP cites 15–30 min idle for low-risk apps and 4–8 h absolute for workday apps ([owasp-session]). These are references only, not decisions.
- **For the user: how fast group changes take effect.** Groups are read at sign-in. Picking up removals mid-session means requesting `offline_access` and re-reading groups via `refreshTokenGrant` ([oc-refresh]). Whether a refreshed Entra ID token carries `groups` is UNVERIFIED.
- **For the user or spec: which routes are "health" under AC-251.** Is it only `/api/health`, or also `/api/cube-health` and `/api/cube-auth`?
- **For the user: single sign-out.** Is Entra front-channel logout wanted ([ms-oidc])? AC-253 needs only the local session to end.
- **Production group format (AC-258).** If a tenant emits `sAMAccountName`-style names instead of object IDs, the Graph fallback must fetch the same attribute. I did not verify which Graph group property carries it. For on-prem AD through a broker, the broker's claim format and whether it expands nested groups are UNVERIFIED here; they belong to the development-provider and broker research.
- **Showing group names in the folder-permission editor.** Entra tokens carry GUIDs. Resolving names needs a Graph lookup and permission that this doc does not cover.
- UNVERIFIED: the exact ID-token claim checks in `oauth4webapi` 3.8.8 (`iss`, `exp`, `iat`, `azp`). Its source was too large to fetch. `aud` and `nonce` enforcement is shown only through issue reports ([na-10210], [na-7313]).
- UNVERIFIED: that the pinned `nginxinc/nginx-unprivileged:1.30.5-alpine-slim` binary includes `auth_request`. The pkg-oss 1.30.5-1 Alpine build args include it ([pkgoss]), but the unprivileged image's own build was not checked. Verify with `docker run --rm <image> nginx -V 2>&1 | grep http_auth_request_module` ([ngx-authreq]).
- UNVERIFIED: whether an `auth_request` subrequest forwards the browser's `Cookie` header without extra config. The nginx example strips only the body ([ngx-authreq]), and oauth2-proxy's pattern depends on the cookie reaching `/oauth2/auth` ([o2p-nginx]). Confirm with the AC-251 e2e test.
- UNVERIFIED: whether Cube's HTTP server accepts request headers larger than Node's 16 KiB default (Gotcha 12).
- UNVERIFIED: openid-client's behaviour with Entra's `common` or `organizations` templated issuer (Gotcha 10).
- Out of scope: oauth2-proxy (the other §P2.5 candidate) and the development OIDC provider are separate research docs.

[oc-npm]: https://registry.npmjs.org/openid-client/latest
[oc-tags]: https://registry.npmjs.org/-/package/openid-client/dist-tags
[oc-rel]: https://api.github.com/repos/panva/openid-client/releases?per_page=6
[oc-issues]: https://api.github.com/repos/panva/openid-client/issues?state=open&per_page=30
[oc-readme]: https://github.com/panva/openid-client/blob/v6.8.8/README.md
[oc-changelog]: https://github.com/panva/openid-client/blob/v6.8.8/CHANGELOG.md
[oc-security]: https://github.com/panva/openid-client/blob/v6.8.8/SECURITY.md
[oc-ci]: https://github.com/panva/openid-client/blob/v6.8.8/.github/workflows/test.yml
[oc-nodever]: https://github.com/panva/.github/blob/main/.github/workflows/node-versions.yml
[oc-run]: https://api.github.com/repos/panva/openid-client/actions/runs/34822045410/jobs?per_page=100
[oc-index]: https://github.com/panva/openid-client/blob/v6.8.8/docs/README.md
[oc-discovery]: https://github.com/panva/openid-client/blob/main/docs/functions/discovery.md
[oc-dro]: https://github.com/panva/openid-client/blob/v6.8.8/docs/interfaces/DiscoveryRequestOptions.md
[oc-config]: https://github.com/panva/openid-client/blob/v6.8.8/docs/classes/Configuration.md
[oc-insecure]: https://github.com/panva/openid-client/blob/v6.8.8/docs/functions/allowInsecureRequests.md
[oc-customfetch]: https://github.com/panva/openid-client/blob/v6.8.8/docs/variables/customFetch.md
[oc-customfetch-type]: https://github.com/panva/openid-client/blob/v6.8.8/docs/type-aliases/CustomFetch.md
[oc-buildauth]: https://github.com/panva/openid-client/blob/main/docs/functions/buildAuthorizationUrl.md
[oc-acg]: https://github.com/panva/openid-client/blob/v6.8.8/docs/functions/authorizationCodeGrant.md
[oc-checks]: https://github.com/panva/openid-client/blob/v6.8.8/docs/interfaces/AuthorizationCodeGrantChecks.md
[oc-helpers]: https://github.com/panva/openid-client/blob/v6.8.8/docs/interfaces/TokenEndpointResponseHelpers.md
[oc-idtoken]: https://github.com/panva/openid-client/blob/v6.8.8/docs/interfaces/IDToken.md
[oc-userinfo]: https://github.com/panva/openid-client/blob/main/docs/functions/fetchUserInfo.md
[oc-fpr]: https://github.com/panva/openid-client/blob/v6.8.8/docs/functions/fetchProtectedResource.md
[oc-refresh]: https://github.com/panva/openid-client/blob/v6.8.8/docs/functions/refreshTokenGrant.md
[oc-endsession]: https://github.com/panva/openid-client/blob/v6.8.8/docs/functions/buildEndSessionUrl.md
[oc-nonrep]: https://github.com/panva/openid-client/blob/v6.8.8/docs/functions/enableNonRepudiationChecks.md
[oc-smh]: https://github.com/panva/openid-client/blob/v6.8.8/docs/interfaces/ServerMetadataHelpers.md
[oc-718]: https://github.com/panva/openid-client/issues/718
[oc-737]: https://github.com/panva/openid-client/issues/737
[na-10210]: https://github.com/nextauthjs/next-auth/issues/10210
[na-7313]: https://github.com/nextauthjs/next-auth/issues/7313
[node-sched]: https://github.com/nodejs/Release/blob/main/schedule.json
[ck-npm]: https://registry.npmjs.org/@fastify/cookie/latest
[ck-tags]: https://registry.npmjs.org/-/package/@fastify/cookie/dist-tags
[ck-rel]: https://api.github.com/repos/fastify/fastify-cookie/releases?per_page=5
[ck-readme]: https://github.com/fastify/fastify-cookie/blob/v11.1.2/README.md
[ck-pkg]: https://github.com/fastify/fastify-cookie/blob/v11.1.2/package.json
[ck-index]: https://github.com/fastify/fastify-cookie/blob/v11.1.2/index.js
[ck-types]: https://github.com/fastify/fastify-cookie/blob/v11.1.2/types/index.d.ts
[ck-ci]: https://github.com/fastify/fastify-cookie/blob/v11.1.2/.github/workflows/ci.yml
[fw-v6]: https://github.com/fastify/workflows/blob/v6/.github/workflows/plugins-ci.yml
[fw-v7]: https://github.com/fastify/workflows/blob/v7.0.0/.github/workflows/plugins-ci.yml
[fs-npm]: https://registry.npmjs.org/@fastify/session/latest
[fs-tags]: https://registry.npmjs.org/-/package/@fastify/session/dist-tags
[fs-rel]: https://api.github.com/repos/fastify/session/releases?per_page=5
[fs-readme]: https://github.com/fastify/session/blob/v11.1.3/README.md
[fs-pkg]: https://github.com/fastify/session/blob/v11.1.3/package.json
[fs-index]: https://github.com/fastify/session/blob/v11.1.3/index.js
[fs-types]: https://github.com/fastify/session/blob/v11.1.3/types/index.d.ts
[fs-session]: https://github.com/fastify/session/blob/v11.1.3/lib/session.js
[fs-cookie]: https://github.com/fastify/session/blob/v11.1.3/lib/cookie.js
[fs-ci]: https://github.com/fastify/session/blob/v11.1.3/.github/workflows/ci.yml
[fs-1113]: https://github.com/fastify/session/releases/tag/v11.1.3
[fs-1112]: https://github.com/fastify/session/releases/tag/v11.1.2
[fs-ghsa]: https://github.com/fastify/session/security/advisories/GHSA-pj27-2xvp-4qxg
[ss-npm]: https://registry.npmjs.org/@fastify/secure-session/latest
[ss-tags]: https://registry.npmjs.org/-/package/@fastify/secure-session/dist-tags
[ss-readme]: https://github.com/fastify/fastify-secure-session/blob/v8.4.0/README.md
[ss-types]: https://github.com/fastify/fastify-secure-session/blob/v8.4.0/types/index.d.ts
[ss-ci]: https://github.com/fastify/fastify-secure-session/blob/v8.4.0/.github/workflows/ci.yml
[ss-840]: https://github.com/fastify/fastify-secure-session/releases/tag/v8.4.0
[ss-ghsa]: https://github.com/fastify/fastify-secure-session/security/advisories/GHSA-9wwp-q7wq-jx35
[sodium-npm]: https://registry.npmjs.org/sodium-native/latest
[sodium-pkg]: https://github.com/holepunchto/sodium-native/blob/main/package.json
[fy-server]: https://github.com/fastify/fastify/blob/v5.12.5/docs/Reference/Server.md
[fy-routes]: https://github.com/fastify/fastify/blob/v5.12.5/docs/Reference/Routes.md
[fy-request]: https://github.com/fastify/fastify/blob/v5.12.5/docs/Reference/Request.md
[fy-reply]: https://github.com/fastify/fastify/blob/v5.12.5/docs/Reference/Reply.md
[fy-lifecycle]: https://github.com/fastify/fastify/blob/v5.12.5/docs/Reference/Lifecycle.md
[fy-plugins]: https://github.com/fastify/fastify/blob/v5.12.5/docs/Reference/Plugins.md
[fy-encap]: https://github.com/fastify/fastify/blob/v5.12.5/docs/Reference/Encapsulation.md
[fy-decorators]: https://github.com/fastify/fastify/blob/v5.12.5/docs/Reference/Decorators.md
[fy-ctp]: https://github.com/fastify/fastify/blob/v5.12.5/docs/Reference/ContentTypeParser.md
[ms-idtoken]: https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference
[ms-at]: https://learn.microsoft.com/en-us/entra/identity-platform/access-token-claims-reference
[ms-groupclaims]: https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/how-to-connect-fed-group-claims
[ms-gmo]: https://learn.microsoft.com/en-us/graph/api/directoryobject-getmemberobjects?view=graph-rest-1.0
[ms-tmo]: https://learn.microsoft.com/en-us/graph/api/user-list-transitivememberof?view=graph-rest-1.0
[ms-userinfo]: https://learn.microsoft.com/en-us/entra/identity-platform/userinfo
[ms-oidc]: https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc
[ms-code]: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
[oidc-core]: https://openid.net/specs/openid-connect-core-1_0.html
[oidc-rpil]: https://openid.net/specs/openid-connect-rpinitiated-1_0.html
[rfc6265]: https://www.rfc-editor.org/rfc/rfc6265#section-6.1
[mdn-setcookie]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie
[owasp-csrf]: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
[owasp-session]: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
[owasp-redirect]: https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html
[ngx-authreq]: https://nginx.org/en/docs/http/ngx_http_auth_request_module.html
[pkgoss]: https://github.com/nginx/pkg-oss/blob/1.30.5-1/alpine/Makefile
[o2p-nginx]: https://oauth2-proxy.github.io/oauth2-proxy/configuration/integrations/nginx/
[pw-35712]: https://github.com/microsoft/playwright/issues/35712
