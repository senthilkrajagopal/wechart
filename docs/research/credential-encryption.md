---
library: node:crypto credential encryption
packages: []
version: Node 26.10.0 (deploy/Dockerfile `node:26.10.0-trixie-slim`; package.json `engines.node` ">=26"; the repo has no .nvmrc)
researched: 2026-09-25
sources: [https://nodejs.org/docs/latest-v26.x/api/crypto.html, https://nodejs.org/docs/latest-v26.x/api/deprecations.html, https://nodejs.org/docs/latest-v26.x/api/buffer.html, https://nodejs.org/docs/latest-v26.x/api/cli.html, https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf, https://www.rfc-editor.org/rfc/rfc5116.html, https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html, https://kubernetes.io/docs/concepts/configuration/secret/, https://www.postgresql.org/docs/18/datatype-binary.html, https://www.postgresql.org/docs/18/app-pgdump.html]
---
# node:crypto credential encryption (Node 26.10.0)

> **Superseded in large part, 2026-09-25**, by the user's architecture decision 7 ([docs/inputs/2026-09-25-architecture-decisions.md](../inputs/2026-09-25-architecture-decisions.md); requirements §P2.4 "Credentials", round R27). Credentials are encrypted in the browser to xcube's public key, and wechart never decrypts. Superseded here:
> - AES-256-GCM with a key in the API;
> - the API decrypting and re-sealing on copy, landing and test;
> - `loadKeyring` in the API;
> - routes A–D, including "A. Pull … Preferred";
> - the API refusing to start on a key that can't decrypt.
>
> Still useful: the threat model, the dump test, and the redaction points, which move to xcube. Replaced by [credential-sealing.md](./credential-sealing.md).

## Summary

This covers application-level authenticated encryption of data-source credentials. The credentials are stored in wechart's Postgres metadata DB and sealed with Node's built-in `node:crypto`. The key comes from the deployment's Secret (requirements §P2.4, "with a key from the deployment's Secret"). That settles the Secret-versus-KMS question left open in `db-access.md`'s Open questions.

**Recommendation.** Use `node:crypto` alone, so `packages: []`.
- **Cipher:** AES-256-GCM with a random 96-bit IV per encryption, a 128-bit tag, and AAD that binds each ciphertext to its data source.
- **Key:** a 32-byte key, base64-encoded, read from a file-mounted Secret. It is held as a `KeyObject`.
- **Rotation:** a key id is stored with each ciphertext.
- **Storage:** `bytea` columns in a separate table, with a scheme version.
- **Envelope encryption:** not needed at this scale.
- **Third-party library:** not warranted.

Criteria served:
- **AC-298:** the ciphertext sits in the DB and the key sits outside it. A `pg_dump` scan with a canary value proves it (§ Testing).
- **AC-164:** secrets live in their own table, and the API has write-only secret fields and response schemas. The browser never gets plaintext or the envelope.
- **AC-280:** a copy is decrypted and re-encrypted under the new row's identity inside the API, and is never returned.
- **AC-159:** the connection test decrypts inside the wechart API. For how Cube gets the connection, see § Handing credentials to Cube; the per-folder Cube research makes the final choice.

Where the caller's six questions are answered:
1. The API: § API surface, "Encrypt / decrypt".
2. Key format, loading, rotation and envelope encryption: § Init, and § API surface "Key rotation" and "Envelope encryption".
3. Storage and scheme versioning: § API surface, "Storage".
4. Pitfalls: § Gotchas.
5. Whether a library is warranted: § Alternatives considered.
6. Testing AC-298: § API surface, "Testing".

## Install

Nothing to install. `node:crypto` is built in.
- The runtime is `node:26.10.0-trixie-slim`, the Node version in `/Users/srajagopal/Work/wechart/deploy/Dockerfile` lines 11 and 35. `package.json` declares `"engines": {"node": ">=26"}` (`/Users/srajagopal/Work/wechart/package.json`).
- `@types/node` 26.0.0 is already a devDependency of `@wechart/api` (`/Users/srajagopal/Work/wechart/packages/api/package.json`).
- Only the `aes-256-gcm-siv` alternative needs a newer Node: SIV and GCM-SIV reached Cipher/Decipher in **26.8.0**, released 2026-08-26 ([v26.8.0 release][n-26.8.0], [PR #63411][n-pr63411]). 26.10.0 is newer.

## Init / auth pattern

### Key material

- **Requirements on the key.**
  - NIST requires the GCM key to "be generated uniformly at random, or close to uniformly at random". It "shall be secret and shall be used exclusively for GCM with the chosen block cipher" ([SP 800-38D §5.1][nist-gcm]).
  - So the key is 32 random bytes, and never a passphrase.
  - It is never reused as the Cube API secret, the model key or the DB password.
  - OWASP agrees: "Keys should be randomly generated using a cryptographically secure function" ([OWASP Cryptographic Storage][owasp-cs]).
- **AES-256 key size.**
  - `AEAD_AES_256_GCM` has `K_LEN` 32 octets ([RFC 5116 §5.2][rfc5116]).
  - OWASP recommends "AES with a key that's at least 128 bits (ideally 256 bits)" ([OWASP][owasp-cs]).
- **Generating the key.**
  - *Helm:* `randBytes 32`. It "generates a cryptographically secure (uses crypto/rand) random sequence of N bytes. The sequence is returned as a base64 encoded string" ([Helm v3 function list][helm-fn]). The encoding is `base64.StdEncoding` ([sprig crypto.go][sprig-crypto]).
  - *Local development:* `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. OWASP lists `crypto.randomBytes()` as Node's CSPRNG ([OWASP][owasp-cs], [Node randomBytes][n-randombytes]).

### Where the key lives: a file-mounted Secret, not an environment variable

- **OWASP on environment variables.** "Avoid storing keys in environment variables, as these can be accidentally exposed through functions such as phpinfo() or through the /proc/self/environ file" ([OWASP][owasp-cs]).
- **Node passes the environment to children.** `child_process.spawn` options `env` default to `process.env` ([Node child_process][n-child]; text read from the v25.9.0 doc via Context7).
- **Docker Compose's view.** Environment variables "are often available to all processes" and "can also be printed in logs". Compose secrets "are mounted as a file in `/run/secrets/<secret_name>`" ([Compose secrets][compose-secrets]).
- **Kubernetes Secret volumes.** Each key in the Secret's data becomes a file under the `mountPath` ([k8s task][k8s-secret-task]).
  - Environment variables from Secrets are not updated when the Secret changes; mounted files are updated eventually, except with `subPath` ([k8s Secret][k8s-secret]).
  - wechart should still read keys **once at startup** and rotate through a rolling restart. That way every replica agrees on the active key id.
- **Proposed layout** (names are proposals, not decided):
  - A Secret `<release>-credential-keys` whose data keys are key ids, for example `k1` and `k2`, each holding base64 of 32 bytes.
  - It is mounted read-only at `/etc/wechart/credential-keys` in the **API container only**. Kubernetes' own advice includes "Restrict Secret access to specific containers" ([k8s Secret][k8s-secret]).
  - Configuration names the active id and the ids to load: `WECHART_CREDENTIAL_KEY_ID=k2` and `WECHART_CREDENTIAL_KEY_IDS=k2,k1`. Reading files by explicit id avoids listing the mount directory.
- **Keep the key apart from the database credentials.** Today one Secret holds the Cube API secret, the model key and the metadata DB's `meta-url`/`meta-password` (`/Users/srajagopal/Work/wechart/deploy/helm/wechart/templates/secrets.yaml`).
  - A separate Secret for the credential key allows its own RBAC and lifecycle.
  - OWASP: "Encryption keys should be stored in a separate location from encrypted data" ([OWASP][owasp-cs]).
- **Compose (development).** §P2.4 requires encryption "in development and in production".
  - Mount a per-developer, gitignored key file through top-level `secrets: {credential_key: {file: …}}` ([Compose secrets][compose-secrets]).
  - Whether a committed development default key is acceptable is an open question below.

### Loading (TypeScript, ESM, strict)

```ts
import { createSecretKey, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const KEY_ID = /^[a-z0-9-]{1,32}$/;

export interface Keyring { readonly activeId: string; get(id: string): KeyObject | undefined }

export function loadKeyring(dir: string, ids: readonly string[], activeId: string): Keyring {
  const keys = new Map<string, KeyObject>();
  for (const id of ids) {
    if (!KEY_ID.test(id)) throw new Error(`credential key id ${JSON.stringify(id)} is invalid`);
    const text = readFileSync(join(dir, id), 'utf8').trim();
    const raw = Buffer.from(text, 'base64');
    try {
      // Buffer.from ignores whitespace in base64 and doesn't document other invalid input: require an exact round trip.
      if (raw.length !== 32 || raw.toString('base64') !== text)
        throw new Error(`credential key ${id}: expected 32 bytes as standard, padded base64`);
      keys.set(id, createSecretKey(raw));
    } finally {
      raw.fill(0); // Safe only if createSecretKey copies. A test proves it (Open questions).
    }
  }
  if (!keys.has(activeId)) throw new Error(`active credential key ${activeId} is not loaded`);
  return { activeId, get: (id) => keys.get(id) };
}
```

Sources for the loader:
- `createCipheriv`'s `key` accepts `string | ArrayBuffer | Buffer | TypedArray | DataView | KeyObject | CryptoKey`, and "The key can also be a KeyObject of type secret" ([Node crypto, v25.9.0 text via Context7][n-v25-crypto-md]; the same function is at [v26 anchor][n-createcipheriv]).
- `crypto.createSecretKey(key[, encoding])` "Creates and returns a new key object containing a secret key for symmetric encryption or Hmac" ([v25.9.0 via Context7][n-v25-crypto-md], [v26 anchor][n-secretkey]).
- The v25.9.0 doc says: "Most applications should consider using the new KeyObject API instead of passing keys as strings or Buffers due to improved security features" ([v25.9.0 via Context7][n-v25-crypto-md]). It was not re-found on the v26 page, whose fetch truncated.
- Base64 decoding: "Whitespace characters such as spaces, tabs, and new lines contained within the base64-encoded string are ignored" ([Node 26 Buffer][n-buffer-enc]). The docs say nothing about other invalid characters, hence the round-trip check.
- The expected string is 44 characters, because base64 turns each 3 octets into 4 characters ([RFC 4648 §4][rfc4648]).

## API surface we will use

### Encrypt / decrypt: `createCipheriv('aes-256-gcm')` (question 1)

Signatures:
- `crypto.createCipheriv(algorithm, key, iv[, options])` and `crypto.createDecipheriv(algorithm, key, iv[, options])`.
- `options.authTagLength` "Defaults to 16 bytes for GCM" on the cipher ([v25.9.0 via Context7][n-v25-crypto-md]; [v26 anchor][n-createcipheriv]).
- The v26.10.0 page fetch truncated before these two sections, so their text is cited from v25.9.0. The v26-specific change is listed next.

Rules, all from the Node 26.10.0 page unless marked:
- **`cipher.setAAD(buffer[, options])`** "must be called before `cipher.update()`". `plaintextLength` is optional for GCM ([setAAD][n-setaad]).
- **`cipher.getAuthTag()`** "should only be called after encryption has been completed using the `cipher.final()` method". With `authTagLength` set it returns exactly that many bytes ([getAuthTag][n-getauthtag]).
- **`decipher.setAuthTag(buffer)`**, from the same section ([setAuthTag][n-setauthtag]):
  - For GCM it must be called before `decipher.final()`, and only once.
  - It throws when the tag length "is invalid according to NIST SP 800-38D or does not match the value of the `authTagLength` option".
  - "If no tag is provided, or if the cipher text has been tampered with, `decipher.final()` will throw, indicating that the cipher text should be discarded due to failed authentication."
- **Node 26 change:** the v26 history of `setAuthTag` says: "v26.0.0 Using GCM tag lengths other than 128 bits without specifying the `authTagLength` option when creating `decipher` is not allowed anymore" ([setAuthTag history][n-setauthtag]).
  - The v26.10.0 deprecations page dates DEP0182's End-of-Life to **v25.0.0** instead ([DEP0182][n-dep0182]). The two pages disagree on the version.
  - Either way, on 26.10.0 pass `authTagLength: 16` to both the cipher and the decipher.
- **IV:**
  - Node: IVs "should be unpredictable and unique… IVs do not need to be secret" ([v25.9.0 via Context7][n-v25-crypto-md]).
  - NIST: "it is recommended that implementations restrict support to the length of 96 bits" ([SP 800-38D §5.2.1.1][nist-gcm]).
  - RFC 5116: "the number of octets in the nonce SHOULD be twelve (12)" ([RFC 5116 §3][rfc5116]).
  - NIST's RBG-based construction requires "the length of the random field shall be at least 96 bits" ([SP 800-38D §8.2.2][nist-gcm]).
  - So each encryption uses `randomBytes(12)`.
- **Tag length:** allowed tag lengths are 128, 120, 112, 104 and 96, and "for certain applications" 64 or 32 ([SP 800-38D §5.2.1.2][nist-gcm]). Use 128 bits.
  - NIST's Rev. 1 pre-draft (2026-06-01, comments closed 2026-07-31) says "The revision to GCM will remove support for authentication tags whose lengths are less than 96 bits" ([SP 800-38D r1 2prd][nist-gcm-r1]).
  - A 128-bit tag is unaffected.
- **AAD** is "the data to be authenticated, but not encrypted" ([RFC 5116 §2.1][rfc5116]). "GCM protects the authenticity of the plaintext and the AAD" ([SP 800-38D §5.2.1.1][nist-gcm]).

**Scheme v1:**
- One envelope per data source: the driver's secret fields as UTF-8 JSON.
- Key id, a random 12-byte IV and a 16-byte tag.
- AAD = `"wechart/data-source-credentials/v1" || 0x00 || <data source id>`.

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Keyring } from './keyring.js';

const ALG = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface Envelope { scheme: 1; keyId: string; iv: Buffer; ciphertext: Buffer; tag: Buffer }
export type Secrets = Readonly<Record<string, string>>;

// Bound to the row the credentials are used by. Derived from context, never stored next to the ciphertext.
const aad = (scheme: number, dataSourceId: string) =>
  Buffer.from(`wechart/data-source-credentials/v${scheme}\u0000${dataSourceId}`, 'utf8');

export function seal(keys: Keyring, dataSourceId: string, secrets: Secrets): Envelope {
  const key = keys.get(keys.activeId);
  if (key === undefined) throw new Error('the active credential key is not loaded');
  const iv = randomBytes(IV_BYTES); // fresh for every call, re-encryptions included
  const cipher = createCipheriv(ALG, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(1, dataSourceId));
  const plaintext = Buffer.from(JSON.stringify(secrets), 'utf8');
  try {
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { scheme: 1, keyId: keys.activeId, iv, ciphertext, tag: cipher.getAuthTag() };
  } finally {
    plaintext.fill(0);
  }
}

export function open(keys: Keyring, dataSourceId: string, e: Envelope): Record<string, string> {
  if (e.scheme !== 1) throw new Error(`unknown credential scheme ${String(e.scheme)}`);
  if (e.iv.length !== IV_BYTES || e.tag.length !== TAG_BYTES) throw new Error('malformed credential envelope');
  const key = keys.get(e.keyId);
  if (key === undefined) throw new Error(`credential key ${e.keyId} is not loaded`);
  const decipher = createDecipheriv(ALG, key, e.iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(aad(e.scheme, dataSourceId));
  decipher.setAuthTag(e.tag);
  const head = decipher.update(e.ciphertext); // not authenticated until final() returns
  try {
    const plaintext = Buffer.concat([head, decipher.final()]); // throws on a wrong key, a wrong AAD or tampering
    try { return JSON.parse(plaintext.toString('utf8')) as Record<string, string>; } finally { plaintext.fill(0); }
  } finally {
    head.fill(0);
  }
}
```

**Why the AAD looks like this:**
- **The data-source id stops rows being swapped.** A ciphertext copied into another row fails `final()`, because its AAD no longer matches ([setAuthTag][n-setauthtag]; the "if ≠ → FAIL" of SP 800-38D Fig. 4, [nist-gcm]).
- **The AAD must be derived from the row it is read for, never stored beside the blob.** A stored AAD would move with the blob.
- **Field names are inside the plaintext.** With one envelope per data source, the JSON keys are part of the authenticated ciphertext, so fields can't be swapped between rows or with each other.
- **If per-field envelopes are chosen instead,** add the field name to the AAD, length-prefixed or NUL-separated.
- **The scheme version** stops a v1 ciphertext being read under a future layout.
- **The data source's connection target is not bound in v1.** Binding host, port and user would make a direct edit of `host` in the DB break decryption. It would also tie every stored credential to an exact serialization of the settings, so a migration that adds a setting could make them all unreadable. v1 binds the stable id only. See Open questions for the product-level "host changed" risk.

**Identity rule for AC-280, the proposal flow and versions:**
- The AAD identity is the logical data-source id that the credentials serve.
- Whenever an envelope moves to a different identity, the API opens it and seals it again with a fresh IV, in the same transaction. The plaintext never leaves the process. This covers:
  - a copy into a workspace (AC-280);
  - an approved proposal that replaces a folder's same-named item;
  - a restore into another row.
- Version rows of the *same* logical data source (the "last 10 versions") can keep the envelope bytes as they are.

### Storage in Postgres (question 3)

```sql
-- A table of its own, so that SELECT * on data_source can never carry secrets.
CREATE TABLE data_source_secret (
  data_source_id uuid PRIMARY KEY REFERENCES data_source(id) ON DELETE CASCADE,
  scheme      smallint NOT NULL CHECK (scheme = 1),
  key_id      text     NOT NULL,
  iv          bytea    NOT NULL CHECK (octet_length(iv) = 12),
  ciphertext  bytea    NOT NULL,
  tag         bytea    NOT NULL CHECK (octet_length(tag) = 16),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX data_source_secret_key_id ON data_source_secret (key_id); -- rotation looks up rows by key
```

- **`bytea`, not text.** Binary strings "allow storing octets of value zero and other 'non-printable' octets" and suit "raw bytes". Storage is "1 or 4 bytes plus the actual binary string" ([PG 18 bytea][pg-bytea]). base64 in a `text` column would be about 4/3 the size ([RFC 4648 §4][rfc4648]).
- **The driver round trip.**
  - pg registers OID 17 (`bytea`) with `postgres-bytea`, which returns a `Buffer` ([pg-types textParsers.js][pg-types]).
  - pg 8.23.0's `prepareValue` passes a `Buffer` parameter through unchanged and converts other `ArrayBuffer` views to `Buffer` ([pg utils.js @ pg@8.23.0][pg-utils]).
  - Kysely hands its parameters straight to `client.query` (`db-access.md`, "Append-heavy … logs").
  - So the columns are typed `Buffer` in the Kysely `DB` interface.
- **Scheme versioning.** The `scheme` column, plus the version in the AAD. A future scheme can be added and rows migrated by re-sealing:
  - v2 could be envelope encryption under a KMS;
  - or v2 could be `aes-256-gcm-siv`.
  - `CHECK (scheme IN (1, 2))` would then be widened by a migration.
- **Any other table that must keep credentials** (versions, proposals, workspace copies) uses the same five columns. Don't embed envelopes in `jsonb` snapshots.
- **Migrations:** raw DDL through `node-pg-migrate`'s `pgm.sql`, as `db-access.md` already decides.

### Key rotation and re-encryption (question 2)

OWASP lists two ways to handle data after rotation: "Decrypting it and re-encrypting it with the new key", or "Marking each item with the ID of the key that was used to encrypt it, and storing multiple keys to allow the old data to be decrypted" ([OWASP][owasp-cs]). Scheme v1 does both:
1. Add key `k2` to the Secret next to `k1`. Set `WECHART_CREDENTIAL_KEY_IDS=k2,k1` and `WECHART_CREDENTIAL_KEY_ID=k2`, then roll the API. Environment changes need a restart ([k8s Secret][k8s-secret]); a checksum annotation already drives restarts in the chart (`helm.md`, "Secrets as environment variables").
2. Re-seal every row where `key_id <> 'k2'`, in every table that stores envelopes. Use a compare-and-swap update, `UPDATE … SET … WHERE data_source_id = $1 AND key_id = $old AND iv = $oldIv`, so a concurrent credential edit is not overwritten.
3. Check that no row still uses `k1`. Then remove `k1` from the Secret and from `KEY_IDS`.

OWASP's reasons to rotate are:
- "If the previous key is known (or suspected) to have been compromised";
- "After a specified period of time has elapsed (known as the cryptoperiod)";
- "After the key has been used to encrypt a specific amount of data" ([OWASP][owasp-cs]).

**Backups made before step 3 need `k1` to restore.** Keep retired keys as long as those backups are kept. Losing every key means every credential must be entered again.

### Envelope encryption: not needed at this scale (question 2)

- **What it is.** OWASP: "The Data Encryption Key (DEK) is used to encrypt the data. The Key Encryption Key (KEK) is used to encrypt the DEK… For this to be effective, the KEK must be stored separately from the DEK" ([OWASP][owasp-cs]).
- **Why it adds nothing against AC-298's threat.** With the key in a Kubernetes Secret inside the same API process, a DEK per record changes nothing against a dump without the key. The dump holds either ciphertext or wrapped DEKs, and in both cases only the Secret's key opens them. The key is already stored apart from the data.
- **The invocation limit doesn't call for it either.** Per-key usage stays far under NIST's cap (next section).
- **Where it would pay off:** a KEK held in a KMS or HSM. OWASP's preferred storage is an HSM, a key vault or a secrets manager ([OWASP][owasp-cs]). That would be scheme v2 and a new requirement. §P2.4 names the Secret.

### GCM limits and nonce reuse (question 4)

- **Uniqueness.** "The probability that the authenticated encryption function ever will be invoked with the same IV and the same key on two (or more) distinct sets of input data shall be no greater than 2^-32" ([SP 800-38D §8][nist-gcm]).
- **Cap on invocations.** With random IVs: "The total number of invocations of the authenticated encryption function shall not exceed 2^32 … with the given key" ([SP 800-38D §8.3][nist-gcm]).
- **What reuse costs.** If IVs repeat, "it is likely that an adversary will be able to determine the hash subkey", and "the authentication assurance essentially is lost". An adversary "could control the plaintext output" ([SP 800-38D App. A][nist-gcm]).
  - Counter mode, which GCM builds on, "may fail to provide the expected confidentiality for the data blocks that correspond to the repeating counter blocks" ([SP 800-38D App. A][nist-gcm]).
  - RFC 5116 §3: nonces "MUST be distinct, for any particular value of the key" ([RFC 5116][rfc5116]).
- **What this means for wechart (derived, not quoted).**
  - With q random 96-bit IVs the collision bound is about q²/2^97.
  - q = 2^20 seals per key, including copies and rotations, gives about 2^-57, far under 2^-32.
  - An optional per-key counter that refuses to seal past 2^32 would enforce §8.3 literally.
  - **Never derive an IV from the row id or any other stable value.** Re-sealing the same row would repeat it.

### Handing credentials to Cube (AC-159 context; the per-folder research decides)

What the key design has to allow for:
- **Cube's `driverFactory`.**
  - It "can be async" and runs once per data source per orchestrator ID.
  - Its drivers are cached, so edited credentials take effect only under a new orchestrator ID, after eviction, or after a restart.
  - Cube also calls `driverFactory` to resolve the database type and dialect.
  - All three points are in the sibling doc `cube/data-sources.md`, Gotchas and "Connection lifecycle". The v1.7.45 source shows `type = (val || await driverFactory(ctx)).type` in `OptsHandler.ts` ([OptsHandler.ts @ v1.7.45][cube-opts]; read in the local checkout `~/Work/bi/cube`).
- **Cube logs every request's security context.** `ApiGateway.log()` adds `securityContext: context.securityContext` to every logged event ([gateway.ts @ v1.7.45][cube-gw]).
  - RFC 7519 §12: "measures MUST be taken to prevent disclosure" of sensitive JWT contents. It names TLS and encrypted JWTs as the ways to do that, and "Omitting privacy-sensitive information from a JWT is the simplest way" ([RFC 7519 §12][rfc7519-12]).

| Route | Where the key lives | Where plaintext appears | Verdict |
|---|---|---|---|
| **A. Pull.** `driverFactory` in `infra/cube/cube.js` fetches the connection from an internal wechart route, and wechart decrypts. | wechart API pods only | the Cube↔wechart hop and Cube's driver pools | **Preferred.** It follows the existing `/api/cube-model/*` pattern: `x-wechart-model-key` checked with `timingSafeEqual` (`/Users/srajagopal/Work/wechart/packages/api/src/model/publish.ts` L149–155), and nginx answers 404 for that path (`/Users/srajagopal/Work/wechart/deploy/helm/wechart/templates/web-config.yaml` L38–40). Use a key separate from the model key, and the same nginx block. |
| **B. Cube decrypts.** Cube reads the metadata DB with the shared key. | also Cube API and refresh-worker pods | Cube's memory | Widens where the key lives, and needs DB credentials plus a JS copy of the scheme in `cube.js`. |
| **C. Credentials in the JWT security context** | none needed | Cube's logs, and anyone who holds the token | **Rejected** ([gateway.ts][cube-gw], [RFC 7519 §12][rfc7519-12]). |
| **D. `CUBEJS_DS_*` environment variables** | none needed | a Kubernetes Secret or the environment, in plaintext | Needs a restart per change (`cube/data-sources.md`), which doesn't fit per-folder, runtime-edited sources. |

- **Route A's hop.** It carries plaintext in the response body.
  - UNVERIFIED: whether wechart's in-cluster traffic is encrypted, whether by TLS, a mesh or a NetworkPolicy.
  - The shared-key check uses `crypto.timingSafeEqual`, which "Does not leak timing information". It throws when lengths differ, hence the length pre-check the existing code already has ([Node timingSafeEqual][n-tse]; text read from v25.9.0 via Context7).
- **For the connection test (AC-159),** the API opens the envelope and passes every field explicitly to the driver constructor. It calls `release()` in `finally`, because unset fields fall back to `CUBEJS_*` environment variables (`cube/data-sources.md` §D).

### AC-164: not sending credentials to the browser

- Data-source DTOs carry no secret fields and no envelope, only a marker such as `hasPassword: true`.
- A Fastify `response` schema drops properties it doesn't list, so a handler that returns a whole row can't leak one (sibling doc `api-framework.md`, "Response serialization — AC-164").
- Streams skip that step. Secret-bearing routes must not stream (`api-framework.md`, Gotchas).
- The separate `data_source_secret` table keeps `selectAll()` on `data_source` from ever loading envelopes.

### Testing (question 6): AC-298, "a credential can be read from a dump … without the key"

**1. Unit tests (Vitest, no DB):**
- A round trip returns the secrets.
- A **swap** fails: sealed for id A and opened for id B, `final()` throws ([setAuthTag][n-setauthtag]).
- A flipped bit in the IV, ciphertext or tag fails.
- A 12-byte tag is refused. A wrong key id fails with a clear error.
- A different random key fails.
- 10,000 seals of the same input give 10,000 distinct IVs and ciphertexts.
- `loadKeyring` rejects missing files, 31- and 33-byte keys, base64url and unpadded input, and embedded junk characters.
- After `raw.fill(0)`, sealing and opening still work. That proves the `KeyObject` doesn't share memory with the buffer.
- Assert that decryption *throws*, not on its message. The source-level description of the message ("Unsupported state or unable to authenticate data", [crypto_cipher.cc (main)][n-cipher-cc]) is UNVERIFIED on 26.10.0.

**2. Dump test against the real metadata DB (docker-compose `wechart-meta`, Postgres 18):**
- **Set up** a per-run random key and a canary secret made only of `[A-Za-z0-9-]`, such as `wcanary-<uuid>`, so that its JSON and URL encodings equal its raw form.
- **Drive the API through every flow that persists data-source data:**
  - create;
  - edit with a new secret;
  - copy to a workspace (AC-280);
  - propose and approve, and propose and reject;
  - restore a version;
  - a failing connection test that writes test history (AC-163);
  - the audit entries for data-source changes.
- **Dump:** `docker exec wechart-meta pg_dump -U wechart -d wechart_meta --format=plain`.
  - Plain format is "NOT compressed" by default. Custom and directory formats are compressed by default, so a grep over them proves nothing ([PG 18 pg_dump][pg-dump]).
  - `pg_dump` is in the image: the Dockerfile runs `make world-bin` / `make install-world-bin` ([postgres image Dockerfile][pg-image]), which builds "everything that can be built, including the additional modules (`contrib`), but without the documentation" ([PG 18 install][pg-make]).
- **Assert the dump contains none of:**
  - the canary;
  - its lowercase hex (bytea's default output is hex, "2 hexadecimal digits per byte" after `\x`, [PG 18 bytea][pg-bytea]);
  - its base64 and base64url;
  - the base64 text of the key and the key's hex.
- **Assert the dump does contain** the `data_source_secret` rows' ciphertext hex, so the test can't pass on empty tables.
- **Assert that opening the dumped envelope** with a fresh random key fails, and with the real key returns the canary.

**3. AC-164 and logs:**
- Collect every API response body from step 2 and the pino output from a test log stream.
- Assert the canary appears in neither.

Checking the AC needs this real-DB dump test, as the "AC ticks need the real surface" memory requires, not the unit tests alone.

## Gotchas

1. **`authTagLength: 16` on the decipher, and check the tag length before `setAuthTag`.**
   - On Node 26, short GCM tags without an explicit `authTagLength` are no longer accepted ([setAuthTag history][n-setauthtag], [DEP0182][n-dep0182]).
   - The two pages disagree on whether that happened in v25.0.0 or v26.0.0. It makes no difference on 26.10.0.
2. **`decipher.update()` output is unauthenticated until `final()` returns.** Discard it if `final()` throws ([setAuthTag][n-setauthtag]).
3. **Random IV on every seal, re-seals included. At most 2^32 seals per key.** See the nonce section ([SP 800-38D §8, §8.3][nist-gcm]).
4. **Moving an envelope to another identity must re-seal it.** Copying raw bytes fails by design (AAD). This affects AC-280, approval landings and restores.
5. **Plaintext hides in other tables.** Audit entries for data-source changes, version snapshots, proposals, test history (AC-163 driver error text) and query logs must hold only envelopes or "changed" markers.
   - OWASP says passwords, "Database connection strings" and "Encryption keys and other primary secrets" must not be logged ([OWASP Logging][owasp-log]).
   - UNVERIFIED: whether any of the six drivers echoes a secret in its error text. Scrub every known secret value, and its URL-encoded form, from error text before storing or returning it.
6. **Fastify logging.**
   - "The body cannot be serialized inside the `req` serializer", so request bodies aren't logged by default. Don't add body logging to data-source routes.
   - Use pino `redact` for any header or field that might carry a secret ([Fastify 5.12 Logging][fastify-log]).
7. **Never put credentials in Cube's security context.** Cube logs it on every event ([gateway.ts][cube-gw]).
8. **Zeroing in JS is best effort.**
   - `buf.fill(0)` clears a Buffer, but `Buffer.from(string)` "may also use the internal `Buffer` pool" ([Node 26 Buffer][n-buffer-pool]).
   - "JavaScript strings are immutable… it is not possible to modify it" ([MDN][mdn-str]). So the base64 key text and the password strings given to drivers stay until garbage collection.
   - `--secure-heap` only affects OpenSSL's own allocations. It "is not available on Windows" and "not available when using BoringSSL or with specific OpenSSL builds" ([Node 26 CLI][n-cli-secureheap]).
   - `--heapsnapshot-signal` writes a heap dump on a signal ([Node 26 CLI][n-cli-heapsnap]). Anything that can take heap snapshots or core dumps of the API can read keys and decrypted credentials, so keep it off in production.
9. **Keys in environment variables leak to child processes.** Spawned children inherit `process.env` by default ([Node child_process][n-child]).
   - If an environment variable must be used, `delete process.env.X` after reading limits inheritance by children.
   - UNVERIFIED: whether that also clears `/proc/self/environ`. It likely doesn't, which is another reason to prefer files.
10. **Helm key generation can silently replace the key.**
    - The chart's generate-once Secrets depend on `lookup`, which is empty under `helm template`, `--dry-run` and lint (`helm.md`, Gotchas 2 and "Generated secrets").
    - Argo CD uses Helm "only … to inflate charts with `helm template`" ([Argo CD Helm][argocd-helm]).
    - So a template-rendered deploy would get a **new** credential key on each sync, and every stored credential would become unreadable (inference from those two sources).
    - Support an operator-supplied `existingSecret` for the credential key, keep `helm.sh/resource-policy: keep`, and back the key up apart from the database.
11. **Kubernetes Secrets are "by default, stored unencrypted in the API server's underlying data store (etcd)".**
    - Kubernetes advises encryption at rest, least-privilege RBAC and restricting Secrets to specific containers ([k8s Secret][k8s-secret]).
    - Cube pods should not mount the credential-key Secret under route A.
12. **Timing.**
    - The GCM tag comparison happens inside OpenSSL with `CRYPTO_memcmp` in `CRYPTO_gcm128_finish` ([gcm128.c (master)][ossl-gcm]). Node 26 bundles OpenSSL 3.5.x ([vuln-assessments #299][n-openssl]); that the 3.5.x code is the same is UNVERIFIED.
    - Ciphertexts come from wechart's own DB, not from requests, so timing leaks in decryption are not reachable from the browser.
    - The one secret comparison on a request path is the shared key on Cube's route: use `timingSafeEqual` ([Node][n-tse]).
13. **`aes-256-gcm-siv` (misuse-resistant) is only in Node ≥ 26.8.0** ([v26.8.0][n-26.8.0]). GCM-SIV is not among SP 800-38D's modes.
    - RFC 8452: a repeated nonce "only discloses whether the messages were equal or not" ([RFC 8452][rfc8452]).
    - Its Node calls are one-shot: SIV and GCM-SIV count as one-shot modes in `CipherBase::Final` ([crypto_cipher.cc (main)][n-cipher-cc]).
    - A possible scheme v2, not v1.
14. **A lost or mismatched key** makes `final()` throw for every row. Decide the startup behaviour: refuse to start, or mark credentials unreadable (Open questions).

## Alternatives considered

| Option | Verdict |
|---|---|
| **`node:crypto` `createCipheriv('aes-256-gcm')`** | **Chosen.** No dependency, and it covers AEAD, key ids and rotation as designed above. |
| `crypto.subtle` (WebCrypto) AES-GCM | Works: `importKey('raw', …, 'AES-GCM', extractable=false, …)` gives a non-exportable `CryptoKey` ([v25.9.0 webcrypto via Context7][n-v25-crypto-md]). It is async only and gives no protection beyond a `KeyObject` against this threat model. Not chosen. |
| `aes-256-gcm-siv` through `node:crypto` | Misuse-resistant ([RFC 8452][rfc8452]), but new in 26.8.0 ([v26.8.0][n-26.8.0]) and not an SP 800-38D mode. Keep as a possible scheme v2. |
| `pgcrypto` | Rejected in `db-access.md`: "all the data and passwords move between pgcrypto and client applications in clear text". |
| `@47ng/cloak` 1.2.0 (MIT) | AES-GCM-256 with a `v1.aesgcm256.<fingerprint>.<nonce>.<ciphertext>` format and a keychain. Last published 2024-09-24. Its runtime dependencies include `chalk`, `commander` and `dotenv` ([npm][npm-cloak]). The registry summary doesn't describe a documented rotation procedure. Not warranted. |
| AWS Encryption SDK `@aws-crypto/client-node` 5.0.2 (Apache-2.0), Raw AES keyring | Envelope encryption: data keys are wrapped with AES-GCM by a wrapping key "you provide", ideally "in a hardware security module (HSM) or key management system" ([AWS docs][aws-raw-aes]). `client-node` depends on `kms-keyring-node`, which pulls `@aws-sdk/client-kms` and `@aws-sdk/client-dynamodb` ([npm][npm-esdk], [npm][npm-esdk-kms]). Its envelope layer adds nothing with a Secret-held key (see Envelope encryption). Not warranted. |

**Conclusion (question 5):** no library is warranted.
- Rotation here needs a key id per row plus a re-seal loop, and none of these libraries replaces that loop's database side.
- A library would add supply-chain surface to the API image.

## Open questions / unverified

- **For the user: a development key.** §P2.4 applies encryption in development too. Should compose use a per-developer, gitignored key file (recommended), or a committed default like `WECHART_MODEL_KEY: dev-model-key`? A committed key lets anyone with the repo decrypt a development dump.
- **For the user: missing or wrong key at startup.** Refuse to start, or run with data sources marked "credentials unreadable, re-enter"?
- **For the user / spec: a changed connection target.**
  - A read-write member could change a data source's host and run a test, which sends the stored secret to that host.
  - Should changing the target (host, account and so on) require entering the secret again?
  - This is a product decision and isn't in the spec.
- **For the per-folder Cube research:**
  - the choice between routes A and B;
  - in-cluster encryption of the credential hop (UNVERIFIED current state);
  - how often `driverFactory` runs for type resolution, and so how often route A's internal route is called ([OptsHandler.ts][cube-opts]).
- **Approver review.** Showing "credentials changed" in a proposal needs a server-side open-and-compare, because IVs are random and ciphertexts always differ. That is design, not decided here.
- **UNVERIFIED: does `createSecretKey` copy its input Buffer?** Not found in the docs. The unit test in § Testing settles it.
- **UNVERIFIED: the Node 26.10.0 text of `createCipheriv` / `createDecipheriv`, `createSecretKey`, `randomBytes`, `timingSafeEqual`, child_process `env` and WebCrypto `importKey`.**
  - The v26 crypto page fetch truncated before those sections, so they are cited from the v25.9.0 docs via Context7.
  - The v26 `setAAD`, `getAuthTag`, `setAuthTag`/history and `final` texts were read on the v26.10.0 page.
- **UNVERIFIED: whether `aes-256-gcm-siv` is present in the 26.10.0 image.** Check with `node -p "require('node:crypto').getCiphers().includes('aes-256-gcm-siv')"` and `node -p process.versions.openssl` in the image. Only matters for a scheme v2.
- **UNVERIFIED: whether any of the six drivers echoes secrets in its error text.** Scrub regardless (Gotcha 5).
- **UNVERIFIED: whether `delete process.env.X` affects `/proc/self/environ`.**
- **UNVERIFIED: the exact OpenSSL 3.5.x `gcm128.c` in Node 26.10.0.** Cited from OpenSSL master.
- **For `db-access.md`:** its Open questions item "whether the encryption key … comes from a Kubernetes Secret or an external KMS" is answered by requirements §P2.4 (the deployment's Secret). Its Secrets section's GCM claims agree with this doc.

[n-crypto]: https://nodejs.org/docs/latest-v26.x/api/crypto.html
[n-setaad]: https://nodejs.org/docs/latest-v26.x/api/crypto.html#ciphersetaadbuffer-options
[n-getauthtag]: https://nodejs.org/docs/latest-v26.x/api/crypto.html#ciphergetauthtag
[n-setauthtag]: https://nodejs.org/docs/latest-v26.x/api/crypto.html#deciphersetauthtagbuffer-encoding
[n-createcipheriv]: https://nodejs.org/docs/latest-v26.x/api/crypto.html#cryptocreatecipherivalgorithm-key-iv-options
[n-randombytes]: https://nodejs.org/docs/latest-v26.x/api/crypto.html#cryptorandombytessize-callback
[n-secretkey]: https://nodejs.org/docs/latest-v26.x/api/crypto.html#cryptocreatesecretkeykey-encoding
[n-tse]: https://nodejs.org/docs/latest-v26.x/api/crypto.html#cryptotimingsafeequala-b
[n-v25-crypto-md]: https://github.com/nodejs/node/blob/v25.9.0/doc/api/crypto.md
[n-dep0182]: https://nodejs.org/docs/latest-v26.x/api/deprecations.html#dep0182-short-gcm-authentication-tags-without-explicit-authtaglength
[n-buffer-enc]: https://nodejs.org/docs/latest-v26.x/api/buffer.html#buffers-and-character-encodings
[n-buffer-pool]: https://nodejs.org/docs/latest-v26.x/api/buffer.html#static-method-bufferallocunsafesize
[n-cli-secureheap]: https://nodejs.org/docs/latest-v26.x/api/cli.html#--secure-heapn
[n-cli-heapsnap]: https://nodejs.org/docs/latest-v26.x/api/cli.html#--heapsnapshot-signalsignal
[n-child]: https://github.com/nodejs/node/blob/v25.9.0/doc/api/child_process.md
[n-26.8.0]: https://nodejs.org/en/blog/release/v26.8.0
[n-pr63411]: https://github.com/nodejs/node/pull/63411
[n-cipher-cc]: https://github.com/nodejs/node/blob/main/src/crypto/crypto_cipher.cc
[n-openssl]: https://github.com/nodejs/nodejs-dependency-vuln-assessments/issues/299
[nist-gcm]: https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf
[nist-gcm-r1]: https://csrc.nist.gov/pubs/sp/800/38/d/r1/2prd
[rfc5116]: https://www.rfc-editor.org/rfc/rfc5116.html
[rfc8452]: https://www.rfc-editor.org/rfc/rfc8452.html
[rfc7519-12]: https://www.rfc-editor.org/rfc/rfc7519.html#section-12
[rfc4648]: https://www.rfc-editor.org/rfc/rfc4648#section-4
[owasp-cs]: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
[owasp-log]: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
[k8s-secret]: https://kubernetes.io/docs/concepts/configuration/secret/
[k8s-secret-task]: https://kubernetes.io/docs/tasks/inject-data-application/distribute-credentials-secure/
[compose-secrets]: https://docs.docker.com/compose/how-tos/use-secrets/
[helm-fn]: https://helm.sh/docs/v3/chart_template_guide/function_list/
[sprig-crypto]: https://github.com/Masterminds/sprig/blob/master/crypto.go
[argocd-helm]: https://argo-cd.readthedocs.io/en/stable/user-guide/helm/
[pg-bytea]: https://www.postgresql.org/docs/18/datatype-binary.html
[pg-dump]: https://www.postgresql.org/docs/18/app-pgdump.html
[pg-make]: https://www.postgresql.org/docs/18/install-make.html
[pg-image]: https://github.com/docker-library/postgres/blob/master/18/alpine3.24/Dockerfile
[pg-types]: https://github.com/brianc/node-pg-types/blob/master/lib/textParsers.js
[pg-utils]: https://github.com/brianc/node-postgres/blob/pg%408.23.0/packages/pg/lib/utils.js
[fastify-log]: https://fastify.dev/docs/v5.12.x/Reference/Logging/
[cube-gw]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/gateway.ts
[cube-opts]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-server-core/src/core/OptsHandler.ts
[ossl-gcm]: https://github.com/openssl/openssl/blob/master/crypto/modes/gcm128.c
[mdn-str]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures#string_type
[npm-cloak]: https://registry.npmjs.org/@47ng/cloak
[npm-esdk]: https://registry.npmjs.org/@aws-crypto/client-node/latest
[npm-esdk-kms]: https://registry.npmjs.org/@aws-crypto/kms-keyring-node/latest
[aws-raw-aes]: https://docs.aws.amazon.com/encryption-sdk/latest/developer-guide/use-raw-aes-keyring.html
