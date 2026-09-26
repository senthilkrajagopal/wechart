---
library: HPKE (RFC 9180) credential sealing to xcube's public key, via hpke
packages: [hpke, '@hpke/core']
version: 'hpke@1.1.7 (browser and xcube); @hpke/core@1.9.0 (cross-implementation test only)'
researched: 2026-09-25
sources: [https://www.rfc-editor.org/rfc/rfc9180.html, https://github.com/panva/hpke, https://registry.npmjs.org/hpke, https://unpkg.com/hpke@1.1.7/package.json, https://github.com/dajiaji/hpke-js, https://registry.npmjs.org/@hpke/core/1.9.0, https://github.com/panva/jose, https://www.rfc-editor.org/rfc/rfc7516.html, https://www.rfc-editor.org/rfc/rfc8037.html, https://www.rfc-editor.org/rfc/rfc7638.html, https://www.rfc-editor.org/rfc/rfc8017.html, https://www.rfc-editor.org/rfc/rfc8785.html, https://github.com/mdn/browser-compat-data/blob/main/api/SubtleCrypto.json, https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto, https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts, https://nodejs.org/docs/latest-v24.x/api/webcrypto.html, https://nodejs.org/docs/latest-v24.x/api/crypto.html, https://nodejs.org/docs/latest-v24.x/api/modules.html, https://datatracker.ietf.org/doc/rfc9180/, https://datatracker.ietf.org/doc/draft-ietf-hpke-hpke/, https://datatracker.ietf.org/doc/draft-ietf-hpke-pq/, https://datatracker.ietf.org/doc/draft-ietf-jose-hpke-encrypt/, https://wicg.github.io/webcrypto-modern-algos/, https://github.com/WICG/isolated-web-apps/blob/main/README.md, https://kubernetes.io/docs/concepts/configuration/secret/, https://docs.docker.com/compose/how-tos/use-secrets/, https://helm.sh/docs/chart_template_guide/function_list/, https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-57pt1r5.pdf, https://nvlpubs.nist.gov/nistpubs/ir/2024/NIST.IR.8547.ipd.pdf, https://raw.githubusercontent.com/cube-js/cube/v1.7.45/packages/cubejs-docker/latest.Dockerfile]
---
# Credential sealing: HPKE (RFC 9180) with `hpke` 1.1.7

> **Chosen, 2026-09-26.** The user took `hpke` 1.1.7 in round R28 (Q8), to seal a typed secret in the browser to xcube's public key (R27; AC-325; task T441). It fits the final integration plan's decision 1 ([docs/inputs/2026-09-26-integration-plan-decisions.md](../../inputs/2026-09-26-integration-plan-decisions.md)): wechart stores the ciphertext and can't decrypt it. The researcher's text below is kept as written.
> - **Still open, for the plan's slice 6:** where xcube's private key and wechart's signing key are kept (the plan's open "key custody" decision).

## Summary

**What this covers.** The browser encrypts each data-source secret the user types to xcube's public key. wechart stores only the resulting envelopes and has no key that opens them. xcube opens them to connect, to run connection tests, and to re-wrap them when its key rotates. xcube runs on Node 24.21.0 inside Cube 1.7.45's image.

This doc supersedes [`docs/research/credential-encryption.md`](credential-encryption.md), which used AES-256-GCM inside wechart's API with an AAD naming the data-source id. The change follows decision 7 of `docs/inputs/2026-09-25-architecture-decisions.md` and round R27 (`docs/requirements.md` §P2.4 "Credentials", L450–456).

**Recommendation.**
- **Scheme:** HPKE base mode with suite DHKEM(X25519, HKDF-SHA256), HKDF-SHA256, AES-128-GCM. That is the suite of RFC 9180 test vector A.1.
- **Library:** `hpke@1.1.7` in both the browser and xcube. wechart's API needs no crypto library, because it never seals or opens.
- **Binding:** each envelope is bound to its driver type, its field name and the data source's connection target (the AC-312 fields). It is not bound to any id.
  - A copy (AC-280), an approval landing or a version restore copies bytes. No re-wrap is needed.
  - Moving an envelope to a data source that points somewhere else fails at xcube.
- **Rotation:** xcube re-wraps envelopes under its new key and never changes their binding.
- **"Unchanged" versus "replaced"** (T356) comes from a revision id in wechart's lifecycle record, not from a hash.

**Criteria served**

| AC / task | How this design serves it |
|---|---|
| AC-325 | Sealing happens in the browser at submit time. Request bodies to wechart hold envelopes only, connection tests included. |
| AC-298 | wechart holds only xcube's public key. The dump test is below, re-verified from the superseded doc. |
| AC-324 | wechart validates its configured public key at start. xcube loads its private keys, checks each against its key id, and opens a sample ("key-check") envelope at start. |
| AC-280 | The binding names the connection target, not the data-source id, so a copy is a byte copy. |
| AC-312 | The binding includes the AC-312 target fields. A changed target can't open the old secret, even if wechart's clearing had a bug. |
| AC-159, AC-163 | xcube opens the envelope, tests the connection and redacts error text. wechart records only the redacted results. |
| AC-164 | Envelopes, like plaintext, are never sent to the browser. |
| AC-161 | xcube can report which secret revision each live driver uses (a proposal). |
| AC-287 / T356 | "Unchanged" or "replaced" is decided by comparing revision ids. |

**Runtimes, verified**
- **xcube: Node 24.21.0.**
  - The xcube package (still named `cube-introspection` in the checkout) builds on `node:24.21.0-trixie-slim` and runs `FROM cubejs/cube:${CUBE_VERSION}` with `CUBE_VERSION=v1.7.45` (`/Users/srajagopal/Work/bi/cube/cube-introspection/Dockerfile` L12, L14, L26).
  - Cube's image at tag v1.7.45 is `FROM node:24.21.0-trixie-slim` in both of its stages ([Cube v1.7.45 latest.Dockerfile][cube-df]; local copy `/Users/srajagopal/Work/bi/cube/packages/cubejs-docker/latest.Dockerfile` L1, L26).
  - The checkout is on branch `spike/xcube-feasibility` at `db087e048a` (`/Users/srajagopal/Work/bi/cube/.git/HEAD`).
- **Browser:** React 19.3.0 and Vite 8.3.0 (`/Users/srajagopal/Work/wechart/packages/web/package.json` L31, L43).
- **wechart's API:** Node 26. It needs no new dependency for this.

**Where the five questions are answered**
1. Schemes: § Options compared, and § Recommendation "Scheme v1".
2. Binding, copying, replay and swaps: § Recommendation "Binding and copying".
3. Key management: § Recommendation "Key management".
4. The connection test: § Recommendation "Connection test with an unsaved secret".
5. What wechart can still tell: § Recommendation "What wechart can still tell".

### Threat model (carried over from the superseded doc, re-verified, and changed by decision 7)

**What it protects against**
- **Passive exposure of anything wechart holds:**
  - dumps and backups of the metadata database (AC-298);
  - the API's memory, its logs and its request logging;
  - proxies that record request bodies;
  - wechart bugs.

  wechart never has the plaintext or a key that yields it.
- **An attacker who can write wechart's database, or drive wechart's API,** and moves an envelope to a data source whose target they control. xcube derives the binding from the target it is about to connect to, so the envelope won't open (see "Binding and copying").

**What it does not protect against**
- **A wechart web origin that serves altered JavaScript or a substitute public key.** The code that seals comes from wechart.
  - WICG's Isolated Web Apps explainer: "TLS and Subresource Integrity (SRI) provide protection against resources being tampered with in transit or when hosted on third-party servers. However, the threat model for some particularly security sensitive applications includes the main application server itself being compromised and serving malicious content" ([WICG IWA][wicg-iwa]).
  - So AC-325 and AC-298 hold against passive exposure and partial compromise, not against an attacker in full control of the origin.
- **Compromise of xcube's pods or of the Secret that holds its private key.**
- **A future quantum adversary holding today's ciphertexts.**
  - NIST: "adversaries collect encrypted data now with the goal of decrypting it once quantum technology matures" ([NIST IR 8547 ipd][nist-8547] L104–110).
  - X25519 is an elliptic-curve Diffie-Hellman scheme. The draft lists elliptic-curve DH at 128 bits or more as "Disallowed after 2035" (Table 4). IR 8547 is still an initial public draft (same source).

## Options compared

### Primitive support in the four browsers and in Node 24.21.0

| Primitive | Chrome | Edge | Firefox | Safari | Node 24.21.0 |
|---|---|---|---|---|---|
| X25519: `generateKey`, `importKey`, `exportKey`, `deriveBits`, `deriveKey` | 133 | mirrors Chrome | 130 | 17 | Stable since v23.5.0 and v22.13.0 ([Node 24 webcrypto][n24-webcrypto]) |
| ECDH (P-256), AES-GCM, HKDF, RSA-OAEP | ECDH `deriveBits` since Chrome 41 ([BCD][bcd]). `encrypt()` is "Baseline Widely available… since January 2020" ([MDN encrypt][mdn-encrypt]) | same | same | same | `deriveBits`/`deriveKey`: ECDH, HKDF, X25519. `encrypt`: AES-GCM, RSA-OAEP ([Node 24 webcrypto][n24-webcrypto]) |
| HPKE as a Web Crypto algorithm | None | None | None | None | None |

- The X25519 versions come from MDN browser-compat-data `api/SubtleCrypto.json` ([BCD][bcd]).
- **No native HPKE.**
  - The WICG "Modern Algorithms" draft (Draft Community Group Report, 14 September 2026) adds ML-KEM, the hybrid KEMs, `encapsulateKey`/`decapsulateKey`, `getPublicKey` and `supports()`. It does not define HPKE ([WICG modern algos][wicg-modern]).
  - BCD lists `encapsulateBits`, `encapsulateKey`, `decapsulateBits` and `decapsulateKey` as experimental in Chrome 155 ([BCD][bcd]).
  - Node 24 marks its Modern Algorithms as "Stability: 1.1 - Active development" ([Node 24 webcrypto][n24-webcrypto]).
  - So HPKE needs a library in both places.
- **Web Crypto only exists in secure contexts.** `SubtleCrypto` is "available only in secure contexts (HTTPS)" ([MDN SubtleCrypto][mdn-subtle]).
  - Loopback hosts, `localhost` and names ending in `.localhost` count as potentially trustworthy ([MDN Secure contexts][mdn-secure]).

### The four schemes

| Criterion | A. RSA-OAEP-256 wrapping an AES-GCM key (built by hand) | B. ECIES built by hand: ECDH (P-256 or X25519) + HKDF + AES-GCM | C. HPKE (RFC 9180) | D. JWE through `jose` 6.2.12 (`ECDH-ES+A256KW` or `RSA-OAEP-256`, with `A256GCM`) |
|---|---|---|---|---|
| **Standardisation** | OAEP is RFC 8017: "RSAES-OAEP is REQUIRED to be supported for new applications" ([RFC 8017][rfc8017] §7). The hybrid composition would be ours | No single standard. "numerous competing and non-interoperable standards and variants… mostly variants on… ECIES", which "have problems, e.g., because they rely on outdated primitives, lack proofs of… IND-CCA2 security, or fail to provide test vectors" ([RFC 9180][rfc9180] §1) | RFC 9180, IRTF CFRG, Informational, February 2022 ([datatracker][rfc9180-dt]). Its successor draft-ietf-hpke-hpke-05 is headed for Proposed Standard, "Obsoletes: 9180 (if approved)", and its IESG state is "Waiting for AD Go-Ahead" ([draft-ietf-hpke-hpke][hpke-bis]) | RFC 7516 and 7518 (Standards Track), plus RFC 8037 for X25519 in ECDH-ES ([RFC 8037][rfc8037] §3.2). JOSE-HPKE (draft-ietf-jose-hpke-encrypt-22) is "Approved-announcement sent", Proposed Standard, not yet an RFC ([datatracker][jose-hpke]) |
| **Browser** | RSA-OAEP everywhere ([MDN][mdn-encrypt]) | P-256 everywhere; X25519 at Chrome/Edge 133, Firefox 130, Safari 17 | Same as B: a library over Web Crypto | Same as A or B: `jose` runs on Web Crypto ([jose][jose-gh]) |
| **Node 24** | Yes | Yes | Yes (library) | Yes |
| **Binding context set by both sides** | Ours to design | Ours to design | `info` goes into the key schedule, `aad` into the AEAD. The recipient passes both to `Open`, and a mismatch fails ([RFC 9180][rfc9180] §5.1, §8.1) | Compact serialization "provides no syntax to represent… JWE AAD values" ([RFC 7516][rfc7516] §7.1). JSON serialization carries `aad` *inside* the JWE object ([RFC 7516][rfc7516] §2; [jose FlattenedEncrypt][jose-flat]). The decryptor must substitute or compare its own expected AAD, because the stored object brings its own |
| **Size per secret** | A 384-byte wrapped key at 3072 bits. OAEP alone caps the plaintext at `k − 2hLen − 2` bytes, which is 190 for RSA-2048 with SHA-256 ([MDN][mdn-encrypt]; [RFC 8017][rfc8017] §7.1.1). PEM keys and service-account JSON need the hybrid | 32 bytes (X25519) or 65 bytes (P-256) of ephemeral key | `enc` is 32 bytes for X25519 (Nenc = 32, [RFC 9180][rfc9180] Table 2) | base64url JSON header plus the ephemeral key |
| **128-bit strength** | RSA k = 3072 ([SP 800-57 Pt 1 r5][nist-57] Table 2) | ECC f = 256–383 (same table) | Same as B | Same as A or B |
| **Library** | None (Web Crypto) | None | `hpke` 1.1.7, or `@hpke/core` 1.9.0 | `jose` 6.2.12, already in wechart's API tree through `openid-client` 6.8.8 ([npm][oidc-npm]) |
| **Post-quantum path** | None standardised | None | draft-ietf-hpke-pq-05 assigns MLKEM768-X25519 `0x647a`, behind the same API; it is a WG Document ([datatracker][hpke-pq]) | Only through JOSE-HPKE, which `jose`'s README doesn't mention ([jose README][jose-gh]) |
| **Verdict** | Rejected: an ad-hoc composition with the largest ciphertexts | Rejected: re-deriving HPKE without its proofs or test vectors | **Chosen** | Rejected: see below |

**Why not JWE (option D)**
- Getting a binding that is enforced when the ciphertext is opened, rather than trusted from the ciphertext, would mean one of two things:
  - rebuild a Flattened JWE with our own `aad` before calling `flattenedDecrypt`; or
  - compare the returned `additionalAuthenticatedData` after decrypting ([jose FlattenedEncrypt][jose-flat]).
- HPKE's `Open(…, { aad, info })` fails on a mismatch by construction.
- JWE decryption also needs explicit `keyManagementAlgorithms` and `contentEncryptionAlgorithms` allowlists. They default to "all algorithms applicable to the key or secret" ([jose DecryptOptions][jose-decopts]).

**Libraries for option C**

| Package | Version | Dependencies | Format | Scope | Security record | Weekly downloads (2026-09-18 to 09-24) |
|---|---|---|---|---|---|---|
| `hpke` (panva) | 1.1.7, published 2026-09-05 ([npm][hpke-npm]) | none ([package.json][hpke-pkg]) | ESM only: `"type": "module"`, `main: index.js`, no `exports` ([package.json][hpke-pkg]) | RFC 9180 plus draft-ietf-hpke-pq-05. Modes BASE and PSK. Single-shot `Seal`/`Open` ([README][hpke-readme]; [docs][hpke-cs]) | No published advisories. The policy's threat model excludes side channels, memory clearing and runtime compromise ([security][hpke-sec]) | 21,575 ([npm API][dl-hpke]) |
| `@hpke/core` (dajiaji) | 1.9.0, published 2026-03-08 ([npm][hpkecore-npm]) | `@hpke/common` ^1.10.0 | Dual: `import` → `./esm/mod.js`, `require` → `./script/mod.js` ([npm][hpkecore-npm]) | RFC 9180, all four modes. DHKEM X25519 is built in, "document X25519 KEM support in core package" in 1.8.0 ([CHANGES][hpkecore-changes]) | CVE-2025-64767 (critical): AEAD nonce reuse from concurrent `SenderContext.Seal()`, ≤ 1.7.4, fixed in 1.7.5 ([GHSA][hpkejs-ghsa]). Its README: "it has not been formally audited" ([hpke-js][hpkejs-gh]) | 665,089 ([npm API][dl-hpkecore]) |
| `jose` (option D) | 6.2.12 ([npm][jose-npm]) | none | ESM | JWE, JWS, JWK | — | 123,335,648 ([npm API][dl-jose]) |

## Recommendation

### Scheme v1

- **Mode and suite:** base mode (`0x00`). KEM `0x0020` DHKEM(X25519, HKDF-SHA256), KDF `0x0001` HKDF-SHA256, AEAD `0x0001` AES-128-GCM.
  - This is exactly RFC 9180 A.1 ([RFC 9180][rfc9180] Appendix A.1).
  - A.1.1 publishes `skRm`, `enc`, `info` and encryptions starting at "sequence number: 0" ([RFC 9180 txt][rfc9180-txt]). So a known-answer test of single-shot `Open` for our exact suite is possible.
- **`info`:** UTF-8 `wechart/data-source-secret/v1`.
  - RFC 9180 advises putting identifiers in `info` to avoid misbinding ([RFC 9180][rfc9180] §9.1).
  - The label separates credential envelopes from key-check envelopes (below).
- **`aad`:** the canonical binding context. See "Binding and copying" and § API surface.
- **Plaintext:** `0x01 ‖ uint32be(len) ‖ UTF-8 secret ‖ zero padding`, padded to a multiple of 256 bytes.
  - "AEAD ciphertexts produced by HPKE do not hide the plaintext length. Applications requiring this level of privacy should use a suitable padding mechanism" ([RFC 9180][rfc9180] §9.7.6).
  - The bucket size is a proposal.
- **One envelope per secret field,** not one per data source. The browser never holds the other stored secrets (AC-164), so it couldn't re-seal a whole object when only one field changes.
- **Envelope:** `{ v: 1, kid, enc (32 bytes), ct (padded length + 16-byte tag) }`.
- **Key id (`kid`):** the RFC 7638 JWK thumbprint of xcube's public key, using SHA-256.
  - For OKP keys the members are "crv", "kty" and "x", in lexicographic order ([RFC 8037][rfc8037]; [RFC 7638][rfc7638] §3).
  - RFC 7638 suggests "using the base64url-encoded JWK Thumbprint value as a 'kid' (key ID) value" ([RFC 7638][rfc7638] §1).

**Why X25519 rather than P-256**
- Every browser AC-180 names ships X25519 in its current version ([BCD][bcd]). Playwright 1.63, which wechart pins (`/Users/srajagopal/Work/wechart/package.json` L24), bundles Chromium 153, Firefox 155 and WebKit 26.6 ([Playwright release notes][pw-rn]).
- `enc` is 32 bytes instead of 65.
- X25519 is the classical half of the most likely post-quantum upgrade, MLKEM768-X25519 ([draft-ietf-hpke-pq][hpke-pq]).
- The cost is the WebKit-port risk and the unverified FIPS status in Gotchas 2 and Open questions.
- P-256 (KEM `0x0010`, vector A.3) is the fallback suite. The scheme version carries the choice, so moving later is an xcube re-wrap.

**Why AES-128-GCM rather than AES-256-GCM**
- Overall strength "is determined by the weakest algorithm and key size used" ([SP 800-57 Pt 1 r5][nist-57] §5.6.2). X25519 caps the scheme at 128 bits.
- NIST's draft says symmetric primitives with at least 128 bits of classical security "are believed to meet the requirements of at least Category 1" ([IR 8547 ipd][nist-8547] L520–525).
- AES-128-GCM gives us an RFC known-answer test for the exact suite.
- A post-quantum scheme v2 should revisit the AEAD alongside its KEM.

### Library: `hpke` 1.1.7, in the browser and in xcube

**Why, on technical grounds**
1. **No runtime dependencies,** in either the browser bundle or the xcube image ([package.json][hpke-pkg]).
2. **A single-shot `Seal`/`Open` with named `info` and `aad` options** ([CipherSuite][hpke-cs]). Each envelope is one call with no context object.
   - @hpke/core's critical CVE was a sequence-number race in the reusable context API ([GHSA][hpkejs-ghsa]).
   - `hpke` 1.1.3 "bound sequence counter by nonce size" and "enforce plaintext size limits" ([CHANGELOG][hpke-changelog]).
3. **Its maintainer already publishes code wechart runs.** `openid-client` 6.8.8 and its dependency `jose` ^6.2.12 are both by panva ([npm][oidc-npm]). The trust root doesn't grow.
4. **A post-quantum path through the same API.** `KEM_MLKEM768_X25519` is ✓ on Node and not in browsers without an extension ([README][hpke-readme]).
5. **It is tested in real browsers.** Its scripts include `test:browsers`, with `playwright` as a devDependency ([package.json][hpke-pkg]).

**Its costs**
- **ESM only.** xcube compiles to CommonJS (`/Users/srajagopal/Work/bi/cube/cube-introspection/tsconfig.json` L4) and tests with Jest 29 (`package.json` L60).
  - At runtime, `require()` of ESM is "no longer experimental" since v24.15.0 ([Node 24 modules][n24-modules]). The image runs 24.21.0.
  - Jest needs a transform exception (Gotcha 10).
- **Less field exposure.** It has 21,575 weekly downloads against 665,089 for @hpke/core ([npm API][dl-hpke], [npm API][dl-hpkecore]).
- **A short history under this name.** Version 1.0.0 (2025-12-02) was "rename package, it is now just 'hpke'" ([CHANGELOG][hpke-changelog]). `@panva/hpke` is deprecated with "This package has moved" ([npm][panva-hpke-npm]).
- **No formal audit found** (UNVERIFIED). Its README says only that the implementations are "tested using test vectors from their respective specifications" ([README][hpke-readme]).

**Alternative:** `@hpke/core@1.9.0`. It produces the same wire format, since both follow RFC 9180.

**Cross-implementation test (recommended).** Seal with `hpke` and open with `@hpke/core`, then the reverse, using our `info` and `aad`. This catches a bug that would be symmetric within one library. That is why `@hpke/core` is in `packages:`, as a devDependency only.

### Binding and copying (question 2)

**What is bound.** `aad` = UTF-8 of `JSON.stringify(["wechart/data-source-secret/v1", driverType, fieldKey, [[key, value], …]])`. The pairs are:
- the v1 target keys of that driver, sorted;
- each value `String(v)`, or `""` when absent.

The v1 target keys are the fields `packages/core/src/data-sources/drivers.ts` marks `target: true` today (L72–73, L106–108, L135–137, L164, L179–180, L220–226), and `targetKeysOf()` returns them (L238–241):

| Driver | v1 target keys |
|---|---|
| postgres | host, port |
| snowflake | account, region, warehouse |
| databricks-jdbc | url |
| bigquery | projectId |
| mssql | host, port |
| oracle | connectString, database, host, port |

These are AC-312's "host, port, account, workspace, warehouse, project or connect string".

**Canonicalisation.**
- Sorting uses JavaScript's default sort, which compares UTF-16 code units. That matches RFC 8785's property-sorting rule, "arrays of UTF-16 code units… independent of locale settings" ([RFC 8785][rfc8785] §3.2.3).
- Serialising only strings through `JSON.stringify` avoids number-format differences. RFC 8785's own sample canonicaliser uses `JSON.stringify` for primitives ([RFC 8785][rfc8785] Appendix A).

**Who computes it.**
- The browser computes the AAD from the form values it sends.
- xcube computes it from the configuration it is about to connect with, before applying defaults or mapping fields to Cube's driver keys.
- Nobody reads the AAD from the envelope.

**Comparing the binding choices the caller raised**

| Bind to | Copy (AC-280), approval landing, restore | A compromised wechart moves an envelope to a data source aimed at its own host | Needs an xcube route that changes an envelope's binding |
|---|---|---|---|
| Data-source id | Needs xcube to re-bind on every copy | A re-bind route lets wechart re-bind any envelope to any id, including one aimed at its host. xcube opens it and sends the secret there | Yes, and that route is the hole |
| A stable credential id, minted at seal time and copied with the bytes | Byte copy | wechart pairs the envelope with its credential id and a new target. It opens | No |
| **The connection target, plus driver and field (recommended)** | **Byte copy.** The copy has the same target | **Fails.** xcube derives the AAD from the host it will connect to | **No** |

A credential id could be added on top of the target, but it only detects accidental cross-wiring. wechart controls the id it tells xcube, so it adds nothing against compromise.

**Do not build a re-bind route.** Re-wrap (under "Key management") keeps the AAD unchanged by construction.

**Replay and swap outcomes under v1**

| Attempt | Result | Why |
|---|---|---|
| An envelope moved to a data source with a **different target** | Fails | AAD mismatch at `Open` ([RFC 9180][rfc9180] §5.1) |
| An envelope moved to **another field** (for example `privateKeyPass` into `password`) | Fails | The field name is in the AAD |
| An envelope moved to **another driver type** with the same host string | Fails | The driver is in the AAD |
| An envelope moved to a data source with the **same target** in another folder | Opens | Wanted for AC-280 and approval landings. Whether that data source may use it is authorisation, which wechart owns (decision 1) |
| An **older** envelope replayed for the same target (rollback) | Opens | "HPKE provides no other replay protection" ([RFC 9180][rfc9180] §9.7.3). Restoring one of the last 10 versions needs exactly this |
| An envelope from **another deployment** | Fails if the keys differ | DHKEM binds the recipient key: `kem_context = concat(enc, pkRm)` ([RFC 9180][rfc9180] §4.1) |
| Envelopes **forged** by anyone holding the public key | Opens | Base mode has no sender authentication; RFC 9180 provides it only in the Auth modes (§5.1). An opened envelope proves nothing about who typed it |

**AC-312 is enforced twice.** wechart clears the stored secret when a target field changes. If it didn't, xcube still couldn't open the old envelope.

**The browser seals at submit time** (test or save), from the same values in the same request. After any target edit it discards anything it sealed earlier.

### Key management (question 3)

**Getting the public key to the browser, and pinning it**
- **wechart's configuration holds xcube's public key.** R27 says wechart refuses to start without it (AC-324).
  - Proposal: a public JWK `{"kty":"OKP","crv":"X25519","x":…,"kid":…}` from a ConfigMap or a plain value, since it isn't secret.
  - At start wechart checks `crv`, that `x` decodes to 32 bytes, and that `kid` equals the RFC 7638 thumbprint. On any failure it refuses and names the problem.
- **Cross-check with xcube.** At start, and on a timer, wechart calls an xcube route that lists xcube's public keys, using the service credential (decision 12). wechart then compares kids.
  - This is the only real pin, because it is the one check outside the browser.
  - A browser-side pin (for example a kid in `localStorage`) would come from the same origin as the code doing the check, so it adds nothing against a compromised origin ([WICG IWA][wicg-iwa]).
  - What to do when xcube is unreachable at start is in Open questions.
- **Serving the key.**
  - `GET /api/data-sources/credential-key` returns `{ v: 1, kid, x }`.
  - The browser recomputes the thumbprint (`crypto.subtle.digest('SHA-256', …)`) as a consistency check, then imports the key with `suite.DeserializePublicKey`.
  - If the import throws, the form disables secret entry and says the browser can't encrypt.
- **A stale key in an open tab.** wechart accepts new envelopes only under its configured kid. A stale tab gets a "key changed" refusal, fetches the key again and re-seals from the plaintext it still holds in form state.

**xcube's private key in Kubernetes** (names are proposals)
- **The Secret.** A Secret `<release>-xcube-credential-keys` holds one file per key: `<kid>.pem` (PKCS#8 PEM) and `<kid>.check`, the sample envelope for AC-324.
  - It is mounted read-only into **every container that runs Cube's drivers**: each Cube API instance (2 or more, decision 11) and the refresh worker.
  - It is not mounted into wechart's pods, which would break AC-298's "anything wechart holds", and not into Cube Store.
- **Which files to load.** `XCUBE_CREDENTIAL_KEY_IDS` lists the kids to load, and `XCUBE_CREDENTIAL_ACTIVE_KID` names the one re-wrap seals to. Files are read by explicit name rather than by listing the directory.
- **Kubernetes' own guidance.** Secrets are "by default, stored unencrypted in the API server's underlying data store (etcd)". Kubernetes advises encryption at rest, least-privilege RBAC and "Restrict Secret access to specific containers" ([k8s Secret][k8s-secret]).
- **Read at start only.** Mounted files update when the Secret changes, but environment variables don't ([k8s Secret][k8s-secret]). xcube should read keys at start and rotate by rolling restart, so every instance agrees.
- **Generating the key.** `openssl genpkey -algorithm X25519 -out xkey.pem` writes PEM ([OpenSSL genpkey][ossl-genpkey]). `openssl pkey -pubout` writes only the public part ([OpenSSL pkey][ossl-pkey]).
  - Helm can't generate it. `genPrivateKey` supports rsa (4096), dsa, ecdsa (P-256) and ed25519, not X25519 ([Helm functions][helm-fn]; [sprig crypto.go][sprig-crypto]).
  - `lookup` "always returns an empty response" under `helm template` ([Helm functions][helm-fn]).
  - So: an operator-supplied `existingSecret` with `helm.sh/resource-policy: keep`, and a backup kept apart from the database.
  - Losing the private key means every credential must be typed again. wechart can't recover them, by design.

**The development key pair in compose** (R27: a fixed xcube key pair, the private half in xcube's compose setup only)
- Commit `infra/xcube/dev-credential-key.pem` and its `.check`.
- Mount them into the xcube service only, as a compose secret. Compose secrets "are mounted as a file in `/run/secrets/<secret_name>`". Environment variables "are often available to all processes" and "can also be printed in logs" ([Compose secrets][compose-secrets]).
- wechart's API service gets only the public JWK.
- A file mount exercises the same loading code as production. Whether R27's "compose environment" meant a literal environment variable is in Open questions.
- The Playwright configs start the API with explicit environment (`/Users/srajagopal/Work/wechart/playwright.security.config.ts` L48–62), so they need the development public JWK too.

**Start-up checks (AC-324)**
- **wechart:** as above. It refuses without the key, or with a malformed one, and names the variable.
- **xcube**, for each kid in `XCUBE_CREDENTIAL_KEY_IDS`:
  1. The file is missing: refuse, naming the kid and the path.
  2. The file is not an X25519 key: refuse.
  3. The public key derived from it has a thumbprint other than the file's kid: refuse with "key file doesn't match its id".
  4. `<kid>.check` doesn't open, with `info` `wechart/xcube-key-check/v1`, aad = the kid, and a fixed known plaintext: refuse with "key <kid> can't decrypt its sample credential".
- The `.check` file comes from the key-generation step, sealed to that key's public half. It is the "sample credential" R27 names. It needs nothing from wechart, which matters because Cube never calls wechart (decision 1).
- **What the self-check can't catch.** A private key that is self-consistent but paired with a *different* public key in wechart's configuration. Only the wechart-to-xcube kid cross-check catches that.

**Rotation and re-wrap, with wechart never decrypting** (a derived procedure)
1. **Generate k2** and its `.check`. Add both to xcube's Secret. Set `…_KEY_IDS=k1,k2` and `…_ACTIVE_KID=k2`. Roll every xcube instance, the refresh worker included.
2. **Point wechart at k2's public JWK** and roll it. Browsers now seal to k2. The cross-check confirms xcube holds k2.
3. **Re-wrap.** wechart sends batches of `{ ref, envelope, driver, field, target }` to an xcube re-wrap route under the service credential. For each item xcube:
   - opens it with the key its `kid` names, using the AAD computed from the given context;
   - seals the plaintext to k2 with **the same `info` and AAD**;
   - zeroes the plaintext buffer;
   - returns only the new envelope.

   wechart writes each result with a compare-and-swap on the old `enc`, so a concurrent edit wins. It covers every table that holds envelopes: current rows, versions, proposals and workspace copies.
4. **Retire k1.** Confirm no row in any table still names k1, then remove k1 from xcube's Secret and roll again.
   - Backups taken before step 3 need k1, so keep k1 offline for as long as they are kept.
   - If k1 was *compromised*, re-wrapping doesn't protect old dumps. The secrets themselves must be changed at the warehouses.

**Why re-wrap isn't an oracle.** Its output can only be opened by xcube. A caller that supplies the wrong context gets a failed `Open`. The AAD never changes, so there is no way to re-bind an envelope.

### Connection test with an unsaved secret (question 4; AC-159, AC-325, AC-163)

1. **Browser.** The user types a secret and presses Test. The browser gets the key (cached by kid), builds the AAD from the current form's driver, field and target values, and seals each typed secret field.
   - It POSTs `{ driver, connection, authMethod, nonSecretAuthFields, sealed: { <field>: envelope } }`.
   - No plaintext goes into the request, the URL, storage or error reports.
2. **wechart's API.**
   - It authorises the request.
   - For secret fields the user didn't retype, it attaches *this* data source's stored envelopes, and only if no target field changed (AC-312). Otherwise it refuses with "enter the secret again".
   - It validates each envelope's shape, then forwards to xcube's test route under the service credential.
   - It stores nothing unless the user saves.
3. **xcube.**
   - It opens each envelope with the AAD computed from the received config.
   - A failed `Open` becomes a check result such as "the stored secret can't be used for this connection target; enter it again", with no cryptographic detail.
   - It builds a fully explicit driver config with no fall-through to Cube's environment (`connection-testing.md` Summary finding 3) and runs the staged checks.
   - It **redacts** every error string before it is logged, handed to Cube's `handleError`, or returned (Gotcha 12).
4. **wechart** records the redacted results in the test history (AC-163) and returns them.
5. **Saving the tested secret.** Because the target hasn't changed, the browser can send the envelopes it just tested with the save, so the stored bytes are the tested bytes. Or it can seal again; both give the same binding.

### What wechart can still tell without decrypting (question 5)

| wechart can tell | From |
|---|---|
| A field has a secret | The row exists |
| Who set it and when | The lifecycle record (`set_by`, `set_at`) and the audit trail |
| **"Unchanged" or "replaced"** (T356) | **A revision id** minted by wechart when a browser-sealed envelope arrives. Copies (AC-280), approval landings, restores and re-wraps keep it. Any new seal gets a new one. Compare the proposal's revision with the current version's: equal means "unchanged", different means "replaced", none on the current side means "new" |
| Which xcube key protects it | `kid` |
| Roughly how long it is | Only the 256-byte bucket, thanks to padding ([RFC 9180][rfc9180] §9.7.6) |
| Whether every Cube instance uses the current secret (AC-161) | Each xcube instance can report the revision ids its live drivers were built from (a proposal) |
| Whether it opens for the current target | Only by asking xcube: the test route |

- **Why not compare bytes.** Every seal is randomised (`Encap` calls `GenerateKeyPair()` for an ephemeral key, [RFC 9180][rfc9180] §4.1), so byte equality does identify one seal event. But re-wrap changes the bytes, so a proposal made before a rotation would read "replaced" afterwards. The revision id survives re-wrap.
- **Why not a keyed hash.**
  - A hash computed in the browser uses code and keys wechart serves. So does a hash keyed with anything wechart holds.
  - OWASP: "Fast hashing algorithms such as SHA-256 are not suitable for password storage because they allow attackers to perform large numbers of guesses quickly" ([OWASP Password Storage][owasp-pw]). Anyone holding the DB and that key could then guess low-entropy passwords offline, which fails AC-298's "from anything wechart holds".
  - A hash keyed by xcube avoids that, but it would reveal equality: the same password across data sources, or retyped unchanged. T356 doesn't need that.
  - Recommend the lifecycle record only. Typing the same password again reads "replaced", which is accurate: it was re-entered.

### AC-298 and AC-325 tests (re-verified from the superseded doc)

1. **Playwright, security config, development key pair.**
   - Type a canary `wcanary-<uuid>` into every secret field of every driver form, then drive every flow that persists data-source data:
     - create;
     - a failing and a passing test;
     - save;
     - edit a non-secret field;
     - copy to a workspace (AC-280);
     - propose and approve, and propose and reject;
     - restore a version;
     - change the target (AC-312: cleared, re-entry demanded).
   - Record every request's `postData()` to wechart's API and assert none contains the canary (AC-325).
2. **Dump.** Run `docker exec wechart-meta pg_dump … --format=plain`.
   - Plain output isn't compressed by default ("the default is not to compress"), while custom and directory formats are ([PG 18 pg_dump][pg-dump]).
   - Assert the dump contains none of: the canary, its lowercase hex (bytea's default output is `\x` plus "2 hexadecimal digits per byte", [PG 18 bytea][pg-bytea]), its base64, base64url or URL-encoded forms, or the development private key in any encoding.
   - Assert that envelope rows are present, so the test can't pass on empty tables.
3. **Open the dumped envelopes in a test helper** with the development private key. They must return the canary, which proves they are real. A random key must fail.
4. **Logs.** Assert the canary appears in neither wechart's API logs nor xcube's logs. For xcube's logs, a redaction unit test uses Snowflake's error format (Gotcha 12).

Per the "AC ticks need the real surface" memory, the tick needs these real-surface tests, not unit tests alone.

## Install

**Browser** (`@wechart/web`; the AAD and padding code in `@wechart/core` needs no dependency):
```sh
pnpm --filter @wechart/web add hpke@1.1.7
pnpm --filter @wechart/web add -D @hpke/core@1.9.0   # cross-implementation test only
```
- `hpke` has no runtime dependencies. It is `sideEffects: false` and ESM ([package.json][hpke-pkg]).
- Its `index.js` has no import statements and no top-level await (read from [unpkg index.js][hpke-unpkg]).
- Bundle size after Vite tree-shaking is UNVERIFIED. The package unpacks to 311,994 bytes across 7 files, including `index.ts` and the `.d.ts` ([npm][hpke-npm-v]). Measure it with `vite build`.
- Its devDependency on `typescript` ^6.0.3 matches wechart's 6.0.3 ([package.json][hpke-pkg]).
- The page must be a secure context: HTTPS, or `localhost` ([MDN Secure contexts][mdn-secure]).

**wechart's API:** nothing to install. It stores envelopes as bytes and computes the RFC 7638 thumbprint with `node:crypto` `createHash('sha256')`.

**xcube** (the fork; changes go through the Cube-expert agent, per the "Cube fork changes via a Cube-expert agent" memory):
- **Add the dependency.** Add `"hpke": "1.1.7"` to `dependencies` in `cube-introspection/package.json`. Its runtime needs today are all peerDependencies from Cube's image (L23–35).
- **Change the Dockerfile.** Today it copies only `dist/src`, `package.json`, `NOTICE` and `README.md` into the image (`/Users/srajagopal/Work/bi/cube/cube-introspection/Dockerfile` L28–29). Nothing from `node_modules` goes in, so `hpke` must also be copied, for example to `/cube/node_modules/cube-introspection/node_modules/hpke`.
- **Runtime.** On Node 24.21.0, `require('hpke')` from xcube's CommonJS output works, because require(esm) is stable from v24.15.0 when the module has no top-level await ([Node 24 modules][n24-modules]).
- **Tests.** Jest 29 needs `transformIgnorePatterns: ['/node_modules/(?!hpke/)']` plus a JS transform, or its "experimental" ESM mode run with `--experimental-vm-modules` ([Jest transformIgnorePatterns][jest-tip]; [Jest ESM][jest-esm]).
- **Don't rely on Cube's copy of `jose`.** Cube's `yarn.lock` resolves `jose` 6.2.12 only as a dependency of `@modelcontextprotocol/sdk` (`/Users/srajagopal/Work/bi/cube/yarn.lock` L3930, L13315–13317). It is not xcube's to rely on.

## API surface

### `hpke` 1.1.7: `CipherSuite` (from [CipherSuite.md][hpke-cs])

- `new CipherSuite(KEM, KDF, AEAD)`. Use `KEM_DHKEM_X25519_HKDF_SHA256`, `KDF_HKDF_SHA256` and `AEAD_AES_128_GCM` ([docs index][hpke-docs]).
- `Seal(publicKey, plaintext, options?)` returns `Promise<{ ciphertext: Uint8Array; encapsulatedSecret: Uint8Array }>`.
  - `options.aad`: "Additional authenticated data passed to the AEAD".
  - `options.info`: "Application-supplied information".
  - Also `psk` and `pskId`.
- `Open(privateKey: K | KeyPair<K>, encapsulatedSecret, ciphertext, options?)` returns `Promise<Uint8Array>`. It takes the same `aad` and `info`.
  - **Pass a `KeyPair`.** For a bare private key, the source calls `subtle.getPublicKey` if the runtime has it. Otherwise it exports a JWK and throws `'"privateKey" must be extractable or a Key Pair must be used in this runtime'` for a non-extractable key ([index.ts][hpke-src]).
  - Node added `subtle.getPublicKey` in v24.7.0 ([Node 24 webcrypto][n24-webcrypto]).
- `DeserializePublicKey(bytes)`: "must be exactly Npk bytes".
- `DeserializePrivateKey(bytes, extractable?)`: "must be exactly Nsk bytes".
- `SerializePublicKey(key)`.
- `GenerateKeyPair(extractable?)` and `DeriveKeyPair(ikm, extractable?)`. Private keys default to non-extractable.
- `KeyPair<K>` is `{ readonly privateKey; readonly publicKey }` ([KeyPair.md][hpke-keypair]).

### Shared binding and padding (`packages/core`, no dependency; a byte-identical copy in xcube)

```ts
import { targetKeysOf, type DriverType } from './drivers.js';

export const INFO_V1 = new TextEncoder().encode('wechart/data-source-secret/v1');

// Frozen with scheme v1. A test asserts it equals targetKeysOf() for every driver, so a change to
// drivers.ts `target` flags fails the build and forces a scheme v2 decision (Gotcha 7).
export const V1_TARGET_KEYS: Readonly<Record<DriverType, readonly string[]>> = {
  postgres: ['host', 'port'],
  snowflake: ['account', 'region', 'warehouse'],
  'databricks-jdbc': ['url'],
  bigquery: ['projectId'],
  mssql: ['host', 'port'],
  oracle: ['connectString', 'database', 'host', 'port'],
};

type Raw = Readonly<Record<string, string | number | boolean | null | undefined>>;

/** Computed from the values as stored and sent, never after defaults or driver mapping. */
export function secretAadV1(driver: DriverType, field: string, connection: Raw): Uint8Array {
  const pairs = [...V1_TARGET_KEYS[driver]].sort().map((k) => {
    const v = connection[k];
    return [k, v === undefined || v === null ? '' : String(v)];
  });
  return new TextEncoder().encode(JSON.stringify(['wechart/data-source-secret/v1', driver, field, pairs]));
}

const BUCKET = 256;
export function padV1(secret: string): Uint8Array {
  const body = new TextEncoder().encode(secret);
  const out = new Uint8Array(Math.ceil((5 + body.length) / BUCKET) * BUCKET); // zero-filled
  out[0] = 1;
  new DataView(out.buffer).setUint32(1, body.length);
  out.set(body, 5);
  body.fill(0);
  return out;
}

export function unpadV1(pt: Uint8Array): string {
  const len = new DataView(pt.buffer, pt.byteOffset).getUint32(1);
  if (pt[0] !== 1 || pt.length % BUCKET !== 0 || 5 + len > pt.length || pt.subarray(5 + len).some((b) => b !== 0))
    throw new Error('malformed credential plaintext');
  return new TextDecoder('utf-8', { fatal: true }).decode(pt.subarray(5, 5 + len));
}
```

**Golden vectors.** Commit JSON fixtures of `{driver, field, connection, aadHex}` and of envelopes sealed to the development key, with their expected plaintexts, in both repositories. wechart's tests generate them; xcube's tests must open them. This pins the two copies of `secretAadV1` together.

### Browser: sealing

```ts
import * as HPKE from 'hpke';
import { INFO_V1, padV1, secretAadV1 } from '@wechart/core';

const suite = new HPKE.CipherSuite(
  HPKE.KEM_DHKEM_X25519_HKDF_SHA256, HPKE.KDF_HKDF_SHA256, HPKE.AEAD_AES_128_GCM);

export interface SealedV1 { v: 1; kid: string; enc: string; ct: string } // base64url

export async function sealSecret(
  key: { kid: string; x: string }, driver: DriverType, field: string,
  connection: Record<string, string | number | boolean | null | undefined>, secret: string,
): Promise<SealedV1> {
  const pk = await suite.DeserializePublicKey(fromB64u(key.x)); // throws where X25519 is unsupported
  const pt = padV1(secret);
  try {
    const { encapsulatedSecret, ciphertext } = await suite.Seal(pk, pt, {
      info: INFO_V1, aad: secretAadV1(driver, field, connection),
    });
    return { v: 1, kid: key.kid, enc: toB64u(encapsulatedSecret), ct: toB64u(ciphertext) };
  } finally {
    pt.fill(0);
  }
}
```

- Call it in the submit handler for both test and save, with the same `connection` object the request carries.
- The typed `secret` string itself can't be wiped (Gotcha 18).

### xcube: loading keys, opening, re-wrapping

```ts
import { createHash, createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as HPKE from 'hpke';
import { INFO_V1, secretAadV1, unpadV1 } from './credential-binding';

const suite = new HPKE.CipherSuite(
  HPKE.KEM_DHKEM_X25519_HKDF_SHA256, HPKE.KDF_HKDF_SHA256, HPKE.AEAD_AES_128_GCM);
type Pair = Awaited<ReturnType<typeof suite.GenerateKeyPair>>;

const thumbprint = (x: string) =>
  createHash('sha256').update(`{"crv":"X25519","kty":"OKP","x":"${x}"}`).digest('base64url'); // RFC 7638/8037

export async function loadKey(dir: string, kid: string): Promise<Pair> {
  const sk = createPrivateKey(readFileSync(`${dir}/${kid}.pem`));          // throws: missing or unreadable file
  if (sk.asymmetricKeyType !== 'x25519') throw new Error(`credential key ${kid}: not an X25519 key`);
  const { x, d } = sk.export({ format: 'jwk' });                           // OKP JWK: x public, d private
  if (thumbprint(x!) !== kid) throw new Error(`credential key ${kid}: the key file doesn't match its id`);
  return {
    privateKey: await suite.DeserializePrivateKey(Buffer.from(d!, 'base64url'), false),
    publicKey: await suite.DeserializePublicKey(Buffer.from(x!, 'base64url')),
  };
}

export async function openSecret(keys: ReadonlyMap<string, Pair>, e: SealedV1,
    driver: DriverType, field: string, connection: Raw): Promise<string> {
  if (e.v !== 1) throw new Error('unknown credential scheme');
  const pair = keys.get(e.kid);
  if (!pair) throw new Error(`credential key ${e.kid} is not loaded`);
  const enc = Buffer.from(e.enc, 'base64url');
  if (enc.length !== 32) throw new Error('malformed envelope');
  const pt = await suite.Open(pair, enc, Buffer.from(e.ct, 'base64url'),
    { info: INFO_V1, aad: secretAadV1(driver, field, connection) });       // throws on any mismatch
  try { return unpadV1(pt); } finally { pt.fill(0); }
}

export async function rewrap(keys: ReadonlyMap<string, Pair>, activeKid: string, e: SealedV1,
    driver: DriverType, field: string, connection: Raw): Promise<SealedV1> {
  const pair = keys.get(e.kid);
  if (!pair) throw new Error(`credential key ${e.kid} is not loaded`);
  const aad = secretAadV1(driver, field, connection);                      // identical in and out: no re-bind
  const pt = await suite.Open(pair, Buffer.from(e.enc, 'base64url'), Buffer.from(e.ct, 'base64url'),
    { info: INFO_V1, aad });
  try {
    const out = await suite.Seal(keys.get(activeKid)!.publicKey, pt, { info: INFO_V1, aad });
    return { v: 1, kid: activeKid,
      enc: Buffer.from(out.encapsulatedSecret).toString('base64url'),
      ct: Buffer.from(out.ciphertext).toString('base64url') };
  } finally { pt.fill(0); }
}
```

Sources for the calls not already cited above:
- `createPrivateKey` accepts PEM, DER and JWK ([Node 24 crypto][n24-crypto]).
- `KeyObject.export({ format: 'jwk' })` exists ([Node 24 crypto][n24-crypto]).
- In an OKP JWK, "x" is the public key in base64url ([RFC 8037][rfc8037]).
- The thumbprint's member order is from [RFC 8037][rfc8037] and [RFC 7638][rfc7638] §3.
- That `hpke`'s `DeserializePrivateKey` accepts the 32-byte `d` value on Node 24.21.0 is UNVERIFIED. RFC 9180's X25519 private-key serialisation is the raw 32 bytes (Nsk = 32). Prove it with the RFC 9180 A.1.1 known-answer test for `Open` (`skRm`, `enc`, `info`, and sequence 0's `aad` and `ct`, [RFC 9180 txt][rfc9180-txt]).

**xcube routes** (proposals; all under the service credential, decisions 10 and 12):
- `GET` public keys: `[{ kid, x, active }]`.
- `POST` connection test: the body shape in `connection-testing.md` §3, with `sealed` envelopes instead of secrets.
- `POST` re-wrap: batches.

None of them ever returns plaintext.

### wechart's API: storage and checks (proposal, evolving the superseded table)

```sql
CREATE TABLE data_source_secret (
  data_source_id uuid NOT NULL REFERENCES data_source(id) ON DELETE CASCADE,
  field     text     NOT NULL,
  scheme    smallint NOT NULL CHECK (scheme = 1),
  kid       text     NOT NULL,
  enc       bytea    NOT NULL CHECK (octet_length(enc) = 32),
  ct        bytea    NOT NULL CHECK (octet_length(ct) >= 272 AND (octet_length(ct) - 16) % 256 = 0),
  revision  uuid     NOT NULL,   -- minted on arrival from the browser; kept by copy, landing, restore, re-wrap
  set_at    timestamptz NOT NULL,
  set_by    text     NOT NULL,
  PRIMARY KEY (data_source_id, field)
);
CREATE INDEX data_source_secret_kid ON data_source_secret (kid);  -- re-wrap finds rows by key
```

- Every other table that keeps secrets (versions, proposals, workspace copies) uses the same columns.
- **On input, wechart checks shape only:**
  - `v = 1`;
  - `kid` equals the configured kid;
  - `enc` is 32 bytes;
  - the `ct` length matches the bucket rule, under a size cap;
  - `field` is a secret field of the chosen auth method in `drivers.ts` (L27–33, L64–65).
- It stores target values exactly as sent, because `secretAadV1` was computed over them.
- Data-source DTOs carry `{ field, setAt, setBy }` markers, never envelopes (AC-164).

## Gotchas

1. **A secure context is required.** Over plain HTTP from any host other than `localhost` or `*.localhost`, `crypto.subtle` is missing and sealing is impossible ([MDN SubtleCrypto][mdn-subtle]; [MDN Secure contexts][mdn-secure]).
   - The chart's `publicUrl` example, `http://localhost:8089`, and the Playwright base URLs (`http://localhost:…`) qualify (`/Users/srajagopal/Work/wechart/deploy/helm/wechart/values.yaml` L91–93; `/Users/srajagopal/Work/wechart/playwright.config.ts` L4).
   - Any other deployment must use HTTPS.
2. **The X25519 floor is Chrome and Edge 133, Firefox 130, Safari 17** ([BCD][bcd]).
   - Firefox ESR builds older than 130 fail. Which ESR the users run is UNVERIFIED.
   - WebKit ports differ. The Playwright WebKit build for Linux threw `DataError` and `OperationError` for X25519 until builds that include the WebKit commit that "enables Ed25519 and X25519 in all ports" ([WebKit bug 288585][webkit-288585]).
   - Add a smoke test that seals in all four Playwright projects.
3. **Browser-side encryption does not defend against a compromised wechart origin,** which can serve altered code or its own public key ([WICG IWA][wicg-iwa]). The wechart-to-xcube kid cross-check catches misconfiguration, not an active attacker. State this wherever AC-325 is claimed.
4. **Base mode doesn't authenticate the sender** ([RFC 9180][rfc9180] §5.1). An envelope that opens proves only that someone had the public key. Authorisation stays with wechart.
5. **Ciphertext length leaks plaintext length unless padded** ([RFC 9180][rfc9180] §9.7.6). Unpad strictly: the version byte, a length within bounds, and zero padding.
6. **No replay protection** ([RFC 9180][rfc9180] §9.7.3). Rolling back to an older envelope for the same target works by design, because restore needs it.
7. **The target field list is part of scheme v1.**
   - Adding or removing a `target: true` field in `drivers.ts` would change the AAD of every stored secret for that driver, and they would stop opening. Re-wrap can't fix it, since it never changes the AAD.
   - Keep `V1_TARGET_KEYS` frozen, with a test tying it to `targetKeysOf()`.
   - A new target field means scheme v2 for new seals, while v1 envelopes keep the v1 AAD.
8. **Canonical values.** The AAD is computed over the raw values the browser sent and wechart stored:
   - before defaults (Postgres `port` defaults to 5432 in `drivers.ts` L73);
   - before mapping to Cube's driver keys (`connectString`, `server`, the `ssl` object; `drivers.ts` L6–8);
   - with no trimming or case-folding on either side.
9. **Seal at submit, not on keystroke or blur.** An envelope sealed before a target edit is bound to the old target and won't open.
10. **The xcube image and its tests.**
    - The Dockerfile copies only `dist/src` (L28), so runtime dependencies must be added explicitly.
    - `hpke` is ESM only. Runtime `require` is fine on 24.21.0 ([Node 24 modules][n24-modules]). Jest 29 needs `transformIgnorePatterns` or its "experimental" ESM mode ([Jest][jest-tip]; [Jest ESM][jest-esm]).
11. **Don't reach for Cube's transitive `jose`** (`yarn.lock` L3930, L13315–13317). It isn't xcube's dependency.
12. **Redaction** (re-verified in the fork checkout).
    - **Snowflake:** `testConnection()` throws `` `Can't connect to the Snowflake instance: ${JSON.stringify(rest)}` `` where `rest` is the config minus `password` only. That includes `privateKey`, `privateKeyPass` and `oauthToken` (`/Users/srajagopal/Work/bi/cube/packages/cubejs-snowflake-driver/src/SnowflakeDriver.ts` L454–456).
    - **Cube's `handleError`** logs `query` after `sanitizeQueryForLogging`, which only deletes `cacheMode` (`…/cubejs-api-gateway/src/gateway.ts` L1905–1909, L2525–2588).
    - **Cube's `log()`** adds `securityContext` to every event (L3003–3016).
    - **xcube's `introspect` wrapper** passes `{ dataSource, ...req.query, ...req.body }` as that `query` (`/Users/srajagopal/Work/bi/cube/cube-introspection/src/gateway.ts` L212–215).
    - With sealing, request bodies hold only ciphertext. But opened plaintext can reach error text, so scrub every opened value before throwing or returning: its raw, JSON-escaped, URL-encoded and base64 forms.
    - OWASP: exclude "Authentication passwords", "Database connection strings" and "Encryption keys and other primary secrets" from logs ([OWASP Logging][owasp-log]).
    - Never put secrets in Cube's security context.
13. **Don't log envelopes or send them to the browser either.** Logged ciphertext is material for a later "harvest now, decrypt later" attack ([IR 8547 ipd][nist-8547] L104–110). Sending envelopes to the browser also breaks AC-164's intent.
14. **One single-shot `Seal` per envelope.** Never share a sender context across concurrent seals. That was CVE-2025-64767's pattern in @hpke/core ≤ 1.7.4 ([GHSA][hpkejs-ghsa]).
15. **Pass a `KeyPair` to `Open` in xcube.** A bare non-extractable private key depends on `subtle.getPublicKey`, which Node added in v24.7.0 ([index.ts][hpke-src]; [Node 24 webcrypto][n24-webcrypto]).
16. **Helm can't make X25519 keys, and `lookup`-based generation re-rolls keys under `helm template`** ([Helm functions][helm-fn]; [sprig crypto.go][sprig-crypto]).
    - A silently re-rolled private key orphans every stored credential.
    - Use an operator-supplied key, `existingSecret`, the `keep` resource policy, and a backup.
17. **Kubernetes Secrets are unencrypted in etcd by default.** Mount this one only into the containers that run drivers ([k8s Secret][k8s-secret]).
18. **Wiping is best effort.**
    - "JavaScript strings are immutable… it is not possible to modify it" ([MDN][mdn-str]), so the typed secret string, and in xcube the driver config strings, live until garbage collection.
    - Zero the `Uint8Array`s.
    - `hpke`'s security policy excludes memory clearing and side-channel resistance ([security][hpke-sec]).
19. **The development key decrypts anything sealed to it.** A production wechart misconfigured with the development public JWK would expose every new secret to anyone who has the repository (see Open questions).
20. **Pin `hpke` exactly.**
    - The npm name has versions from 2022, starting at 0.1.1 on 2022-04-20 ([npm][hpke-npm]). They predate this project, which began as `@panva/hpke` 0.0.0 on 2025-11-17 and was renamed at 1.0.0 ([npm][panva-hpke-npm]; [CHANGELOG][hpke-changelog]).
    - Who published the 0.x line is UNVERIFIED.
    - Use `1.1.7` with lockfile integrity, never a range.
21. **Quantum.** X25519 envelopes are "harvest now, decrypt later" material ([IR 8547 ipd][nist-8547]).
    - Scheme v2 could use MLKEM768-X25519 (`0x647a`, [draft-ietf-hpke-pq-05][hpke-pq]).
    - `hpke` supports it on Node but not natively in browsers ([README][hpke-readme]).
    - xcube could re-wrap stored v1 envelopes to v2 on the server side. Secrets typed later would still be sealed classically until browsers ship ML-KEM, unless a pure-JS extension is used.

## Open questions / unverified

**For the user**
1. **TLS settings in the binding.** Should the binding include TLS and verification settings? These are Postgres `ssl`, `sslRejectUnauthorized` and `sslCa`, and SQL Server `encrypt` and `trustServerCertificate` (`drivers.ts` L77–82, L184–188).
   - Today whoever can edit a data source (or a compromised wechart) can turn verification off without re-entering the secret. That opens the password to an on-path attacker on the unchanged host.
   - Binding them would extend AC-312's re-entry to TLS changes.
2. **Post-quantum protection now,** as scheme v1, or later as a v2 re-wrap (Gotcha 21)?
3. **A policy requiring AES-256 at rest?** If so, use AEAD `0x0002`. RFC 9180's appendix has no X25519 + AES-256-GCM vector. Whether the CFRG vector file covers it is UNVERIFIED.
4. **FIPS.** Does a FIPS requirement apply? NIST SP 800-186's abstract speaks of newly specified Edwards curves "interoperable with those specified by the Crypto Forum Research Group" ([SP 800-186][nist-186]). Whether X25519 key agreement is approved under SP 800-56A is UNVERIFIED. P-256 (KEM `0x0010`) is the fallback.
5. **wechart's start when xcube is unreachable:** refuse to start, or start and refuse secret saves until the kid cross-check passes? A mismatch while xcube *is* reachable should refuse either way.
6. **A guard against the development key in production,** for example refusing its kid unless a development flag is set?
7. **R27's "compose environment":** a literal environment variable, or a compose secret file (recommended above)?
8. **Seeding the root `default` data source's secret** (R27) now that wechart may never see plaintext. Options:
   - a post-install Job running xcube's image seals the Secret's password and creates the source through wechart's API;
   - the operator seals it offline with a small CLI;
   - it is entered in the UI after install.

   Today the chart feeds that password to Cube's environment (`values.yaml` L60–63).

**For xcube's design** (through the Cube-expert agent)
9. Does xcube persist data sources in its own store? If it does, the start-up check could also open one envelope per kid in use.

**UNVERIFIED**
10. `hpke`'s minified and gzipped size in wechart's Vite build.
11. Whether `hpke` has had any formal audit (none found).
12. That Playwright 1.63's WebKit on macOS supports X25519 in Web Crypto.
13. That `DeserializePrivateKey` accepts Node's JWK `d` bytes on 24.21.0. The A.1.1 known-answer test settles it.
14. The Jest transform configuration that loads `hpke` under ts-jest.
15. That the `cubejs/cube:v1.7.45` image on Docker Hub reports Node 24.21.0. Check with `docker run --rm cubejs/cube:v1.7.45 node -v`.
16. Whether `jose` plans JOSE-HPKE support.

[rfc9180]: https://www.rfc-editor.org/rfc/rfc9180.html
[rfc9180-txt]: https://www.rfc-editor.org/rfc/rfc9180.txt
[rfc9180-dt]: https://datatracker.ietf.org/doc/rfc9180/
[hpke-bis]: https://datatracker.ietf.org/doc/draft-ietf-hpke-hpke/
[hpke-pq]: https://datatracker.ietf.org/doc/draft-ietf-hpke-pq/
[jose-hpke]: https://datatracker.ietf.org/doc/draft-ietf-jose-hpke-encrypt/
[rfc7516]: https://www.rfc-editor.org/rfc/rfc7516.html
[rfc8037]: https://www.rfc-editor.org/rfc/rfc8037.html
[rfc7638]: https://www.rfc-editor.org/rfc/rfc7638.html
[rfc8017]: https://www.rfc-editor.org/rfc/rfc8017.html
[rfc8785]: https://www.rfc-editor.org/rfc/rfc8785.html
[bcd]: https://github.com/mdn/browser-compat-data/blob/main/api/SubtleCrypto.json
[mdn-subtle]: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto
[mdn-encrypt]: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt
[mdn-secure]: https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
[mdn-str]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#string_type
[n24-webcrypto]: https://nodejs.org/docs/latest-v24.x/api/webcrypto.html
[n24-crypto]: https://nodejs.org/docs/latest-v24.x/api/crypto.html
[n24-modules]: https://nodejs.org/docs/latest-v24.x/api/modules.html#loading-ecmascript-modules-using-require
[wicg-modern]: https://wicg.github.io/webcrypto-modern-algos/
[wicg-iwa]: https://github.com/WICG/isolated-web-apps/blob/main/README.md
[webkit-288585]: https://bugs.webkit.org/show_bug.cgi?id=288585
[pw-rn]: https://playwright.dev/docs/release-notes
[hpke-readme]: https://github.com/panva/hpke/blob/main/README.md
[hpke-docs]: https://github.com/panva/hpke/blob/main/docs/README.md
[hpke-cs]: https://github.com/panva/hpke/blob/main/docs/classes/CipherSuite.md
[hpke-keypair]: https://github.com/panva/hpke/blob/main/docs/interfaces/KeyPair.md
[hpke-src]: https://github.com/panva/hpke/blob/main/index.ts
[hpke-changelog]: https://github.com/panva/hpke/blob/main/CHANGELOG.md
[hpke-sec]: https://github.com/panva/hpke/security
[hpke-npm]: https://registry.npmjs.org/hpke
[hpke-npm-v]: https://registry.npmjs.org/hpke/1.1.7
[hpke-pkg]: https://unpkg.com/hpke@1.1.7/package.json
[hpke-unpkg]: https://unpkg.com/hpke@1.1.7/index.js
[panva-hpke-npm]: https://registry.npmjs.org/@panva/hpke
[hpkejs-gh]: https://github.com/dajiaji/hpke-js
[hpkecore-npm]: https://registry.npmjs.org/@hpke/core/1.9.0
[hpkecore-changes]: https://github.com/dajiaji/hpke-js/blob/main/packages/core/CHANGES.md
[hpkejs-ghsa]: https://github.com/dajiaji/hpke-js/security/advisories/GHSA-73g8-5h73-26h4
[dl-hpke]: https://api.npmjs.org/downloads/point/last-week/hpke
[dl-hpkecore]: https://api.npmjs.org/downloads/point/last-week/@hpke/core
[dl-jose]: https://api.npmjs.org/downloads/point/last-week/jose
[jose-gh]: https://github.com/panva/jose
[jose-npm]: https://registry.npmjs.org/jose/latest
[jose-flat]: https://github.com/panva/jose/blob/main/docs/jwe/flattened/encrypt/classes/FlattenedEncrypt.md
[jose-decopts]: https://github.com/panva/jose/blob/main/docs/types/interfaces/DecryptOptions.md
[oidc-npm]: https://registry.npmjs.org/openid-client/6.8.8
[nist-57]: https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-57pt1r5.pdf
[nist-8547]: https://nvlpubs.nist.gov/nistpubs/ir/2024/NIST.IR.8547.ipd.pdf
[nist-186]: https://csrc.nist.gov/pubs/sp/800/186/final
[helm-fn]: https://helm.sh/docs/chart_template_guide/function_list/
[sprig-crypto]: https://github.com/Masterminds/sprig/blob/master/crypto.go
[ossl-genpkey]: https://docs.openssl.org/3.5/man1/openssl-genpkey/
[ossl-pkey]: https://docs.openssl.org/3.5/man1/openssl-pkey/
[k8s-secret]: https://kubernetes.io/docs/concepts/configuration/secret/
[compose-secrets]: https://docs.docker.com/compose/how-tos/use-secrets/
[owasp-pw]: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
[owasp-log]: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
[pg-dump]: https://www.postgresql.org/docs/18/app-pgdump.html
[pg-bytea]: https://www.postgresql.org/docs/18/datatype-binary.html
[jest-tip]: https://jestjs.io/docs/29.7/configuration#transformignorepatterns-arraystring
[jest-esm]: https://jestjs.io/docs/29.7/ecmascript-modules
[cube-df]: https://raw.githubusercontent.com/cube-js/cube/v1.7.45/packages/cubejs-docker/latest.Dockerfile

Local sources read:
- The fork checkout at `/Users/srajagopal/Work/bi/cube` (branch `spike/xcube-feasibility` @ `db087e048a`):
  - `cube-introspection/Dockerfile`, `package.json` and `tsconfig.json`;
  - `cube-introspection/src/gateway.ts`;
  - `packages/cubejs-api-gateway/src/gateway.ts`;
  - `packages/cubejs-snowflake-driver/src/SnowflakeDriver.ts`;
  - `packages/cubejs-docker/latest.Dockerfile`;
  - `yarn.lock`.
- In `/Users/srajagopal/Work/wechart`:
  - `packages/core/src/data-sources/drivers.ts`;
  - `deploy/helm/wechart/values.yaml`;
  - `playwright.config.ts` and `playwright.security.config.ts`;
  - `package.json` and `packages/web/package.json`;
  - `docs/requirements.md`, `docs/spec.md` and `docs/tasks.md` (T356);
  - `docs/research/credential-encryption.md` and `docs/research/connection-testing.md`.
