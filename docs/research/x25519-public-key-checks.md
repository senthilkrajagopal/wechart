---
library: X25519 public-key checks at wechart's start, with node:crypto
packages: []
version: 'Node 26.0.0 (node:crypto, built in)'
researched: 2026-09-26
sources: [https://www.rfc-editor.org/rfc/rfc9180.html]
---
# Checking xcube's X25519 public key at start

A sibling of [`credential-sealing.md`](credential-sealing.md), for T333 (AC-324). That doc's "Key management" lists what wechart checks at start: `crv`, a 32-byte `x`, and a `kid` equal to the RFC 7638 thumbprint. This note adds one more check and the source for it.

## A low-order point is refused

- **RFC 9180 §7.1.4:** "For X25519 and X448, public keys and Diffie-Hellman outputs MUST be validated as described in [RFC7748]. In particular, recipients MUST check whether the Diffie-Hellman shared secret is the all-zero value and abort if so." ([RFC 9180][rfc9180])
- **RFC 9180 §4.1:** `DH(skX, pkY)` "can raise a ValidationError as described in Section 7.1.4." `Encap` calls `DH` with the recipient's public key, so sealing to a key whose agreement is all zeros fails ([RFC 9180][rfc9180]).
- So a public key that agrees an all-zero secret with every private key can't be sealed to. wechart finds that out at start, by agreeing with a fresh key pair, rather than on the first credential a user types.

## What Node does

Observed locally on Node v26.0.0, 2026-09-26: `crypto.diffieHellman` with a fresh X25519 private key and a public key of u = 0, u = 1 or u = p (2^255 − 19) throws `ERR_OSSL_FAILED_DURING_DERIVATION`, and with the base point u = 9 it returns a non-zero secret. The script built each `x` as the little-endian u-coordinate in base64url and imported it with `createPublicKey({ format: 'jwk' })`.

So under OpenSSL the refusal comes as a throw. `secrets/xcube-key.ts` treats a throw and an all-zero result alike, so it holds whichever way a runtime reports it.

## A canonical `x`

A 32-byte value is 43 base64url characters, and the last one carries 4 of its bits and 2 unused ones. A string whose unused bits aren't zero decodes to the same key, but its RFC 7638 thumbprint is taken over the string, so it differs. The browser and xcube compute the thumbprint from the key's bytes, so they'd name the key by a `kid` other than wechart's. wechart refuses an `x` that doesn't encode back to itself.

[rfc9180]: https://www.rfc-editor.org/rfc/rfc9180.html
