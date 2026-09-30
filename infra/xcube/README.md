# xcube's development credential key pair

Data-source credentials are encrypted to xcube's public key, and only xcube can
decrypt them (AC-298, AC-324; `docs/research/credential-sealing.md`). In
development, xcube uses a fixed key pair, and wechart is given only the public
half (requirements.md §P2.4, "Credentials"; R27).

- `dev-credential-key.pem`: the private half, an X25519 key in PKCS#8 PEM, made
  with `openssl genpkey -algorithm X25519`. docker-compose mounts it as a secret
  file into the Cube services, which run xcube, and into nothing else, at
  `/run/secrets/xcube-credential-keys/<kid>.pem`: a file rather than an
  environment variable, as the research recommends (`credential-sealing.md`,
  "The development key pair in compose"). It is for development only: never
  use it for real credentials.
- `dev-credential-key.pub.jwk`: the public half, as a JWK whose `kid` is its
  RFC 7638 thumbprint. wechart's API reads it from `WECHART_XCUBE_PUBLIC_KEY`,
  and refuses to start without a usable one, or while xcube doesn't list the
  key as held and active (T455). The Playwright configs carry it.
- `dev-credential-key.check`: the sample credential xcube opens at start to
  prove the key file is the key, made by xcube's keygen from the `.pem`
  (`node /cube/node_modules/xcube/dist/src/bin/keygen.js <dir> <key.pem>` in
  xcube's image; research `xcube-slice-6.md`). compose mounts it beside the
  `.pem`, and `XCUBE_CREDENTIAL_KEY_IDS` names the kid.

The Helm chart doesn't use this pair: a Job makes the release's own key once,
with the same keygen, and keeps it in a Secret only Cube's pods mount (T455;
`docs/deploy.md`, "xcube's public key").

# wechart's development service key pair

wechart's API calls xcube's admin routes, Cube's jobs API and introspection
with its service credential: RS256 tokens under a key of its own (T420,
AC-326; `docs/research/xcube-slice-4.md`, "The service token").

- `dev-service-key.pem`: the private half, RSA 2048-bit in PKCS#8 PEM, made
  with `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048`. The
  API reads it from `WECHART_SERVICE_KEY_FILE`, and nothing else is given it.
  For development only.
- `dev-service-key.pub.pem`: the public half (`openssl pkey -pubout`). compose
  mounts it into the Cube API instance as `XCUBE_SERVICE_KEYS_FILE`; xcube
  names it by its RFC 7638 thumbprint, as wechart does.

The Helm chart generates its own pair at install (`genSelfSignedCert`), and
keeps it across upgrades.

# wechart's development query signing key

Every query token wechart signs for Cube is RS256 under a key of its own,
whose public half the API pushes to xcube at start (T437, AC-326;
`docs/research/xcube-slice-4.md`, "PUT …/keys"). xcube is given nothing by
configuration: the push is the only way it learns the key.

- `dev-signing-key.pem`: the private half, RSA 2048-bit in PKCS#8 PEM. The API
  reads it from `WECHART_SIGNING_KEY_FILE`, and the e2e helpers that sign a
  token themselves read it too. For development only.

Once any model in compose's xcube holds keys, xcube refuses HS256 tokens that
name no model, and a model with keys never takes HS256 again (research,
"HS256 during and after the cutover").

The Helm chart generates its own signing key at install (`genPrivateKey`), and
keeps it across upgrades.
