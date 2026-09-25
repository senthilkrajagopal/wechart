---
library: data-source connection testing
packages: ['pg', 'snowflake-sdk', '@databricks/sql', '@google-cloud/bigquery', 'mssql', 'tedious', 'oracledb']
# Option (b) imports, listed for completeness. Option (a) imports nothing into wechart. It runs Cube 1.7.45's own drivers inside the fork image. The fork package is cube-introspection 1.7.45-1 at commit 0b6eef90a969167b5dcd1ccaec3283567a1f914a (branch feat/introspection-package).
version: 'pg@8.23.0, snowflake-sdk@3.3.0, @databricks/sql@2.2.0, @google-cloud/bigquery@9.1.0, mssql@12.7.2, tedious@20.0.0, oracledb@7.0.1'
researched: 2026-09-25
sources:
  - https://github.com/senthilkrajagopal/cube/tree/0b6eef90a969167b5dcd1ccaec3283567a1f914a
  - https://github.com/senthilkrajagopal/cube/tree/f6355de98252a62de82dca2ccbac3c356578df4e
  - https://github.com/cube-js/cube/tree/v1.7.45
  - https://registry.npmjs.org/pg/latest
  - https://registry.npmjs.org/snowflake-sdk/latest
  - https://registry.npmjs.org/@databricks/sql/latest
  - https://registry.npmjs.org/@google-cloud/bigquery/latest
  - https://registry.npmjs.org/mssql/latest
  - https://registry.npmjs.org/tedious/latest
  - https://registry.npmjs.org/oracledb/latest
  - https://github.com/oracle/node-oracledb/blob/main/doc/src/user_guide/appendix_a.rst
  - https://node-oracledb.readthedocs.io/en/latest/release_notes.html
  - https://tediousjs.github.io/tedious/api-connection.html
  - https://node-postgres.com/apis/client
  - https://raw.githubusercontent.com/databricks/databricks-sql-nodejs/main/CONNECTION_PARAMETERS.md
  - https://docs.snowflake.com/en/user-guide/security-mfa-rollout
  - https://docs.cloud.google.com/bigquery/docs/listing-datasets
  - https://www.postgresql.org/docs/current/protocol-flow.html
  - https://learn.microsoft.com/en-us/sql/relational-databases/security/networking/tds-8
  - https://hub.docker.com/v2/repositories/cubejs/cube/tags/v1.7.45-jdk
---

# Data-source connection testing: Cube 1.7.45's drivers through the fork (a) vs Node driver packages in wechart's API (b)

## Summary

**What this covers.** How wechart's Test step checks a connection for PostgreSQL, Snowflake, Databricks, BigQuery, SQL Server and Oracle. Two options are compared:

- **(a)** A new endpoint in the user's Cube fork. It runs Cube's own driver code, `BaseDriver.testConnection()` and friends, on a config wechart sends.
- **(b)** Node driver packages inside wechart's API (`packages/api`, Fastify on Node 26.10.0; `deploy/Dockerfile` L35, `packages/api/package.json` L25).

A variant, **(a′)**, imports Cube's `@cubejs-backend/*-driver` packages into wechart's API. `docs/research/cube/data-sources.md` §D proposed it, so it is compared too.

**Which criteria this serves.**

| AC | What it needs from this doc |
| --- | --- |
| AC-158 | Test gate before create, or an explicit override |
| AC-159 | The test runs from the wechart service, each check's result is shown, and the driver's error text appears on failure |
| AC-160 | The six drivers, each with its own authentication fields |
| AC-161 | Whether Cube needs a restart, and whether the running Cube uses the new settings |
| AC-163 | Test history per source |
| AC-164 | Credentials never reach the browser |

The same rule appears in `docs/design/direction.md` rules 23 and 35 (L484, L496). The design prototype's checks are Resolve host, Open connection, TLS handshake and certificate, Authenticate, Read schema, and Run sample query (`docs/design/prototype/admin-sources.js` L127–134).

**Which source I read.** The local fork checkout is now on **`feat/introspection-package` @ `0b6eef90a9`**, not `feat/data-source-introspection-api` (`/Users/srajagopal/Work/bi/cube/.git/HEAD`; ref files under `.git/refs/heads/`).

- That branch moves the introspection API into `cube-introspection/` and changes no file of Cube's own (`docs/inputs/2026-09-25-cube-introspection-package.md` §1). I did not run `git diff` to confirm this (no shell).
- Line numbers below are from that checkout. Links point at that commit.
- I compared the Postgres, BigQuery and Databricks `testConnection()` bodies on the old branch at `f6355de982` over GitHub. They are identical to what I read ([f-pg], [f-bq], [f-dbx]).

**Key findings**

1. **Cube's six `testConnection()`s test different things.**
   - Postgres, SQL Server and Oracle connect and run one trivial query.
   - Snowflake only logs in.
   - BigQuery only lists datasets.
   - Databricks makes no SQL or JDBC connection at all. It calls the REST API for the warehouse's state.
   - Details and sources are in "What Cube's drivers expose".
2. **Cube's error text is not always usable for AC-159.**
   - **Oracle:** a failed login is retried by the pool until a 20 s acquire timeout. The ORA text is dropped and replaced by `ResourceRequest timed out (oracle#…)`. This is source-derived.
   - **Databricks:** only the HTTP status text is reported.
   - **Snowflake:** in one path, the error text contains the private key, key passphrase and OAuth token.
3. **Cube's drivers merge Cube's own environment into any config they're given.**
   - With `CUBEJS_DATASOURCES` unset, every data-source name reads the bare `CUBEJS_DB_*` variables ([env] L78–81, L106–113).
   - So an option (a) endpoint that omits a field silently uses Cube's default source's value. A blank host and password would test Cube's own sample database and pass.
   - For Databricks, the fields use `conf?.x || getEnv(...)`, so they can't be suppressed with `undefined` ([dbx-drv] L225–229, L272–275).
4. **Cube can't query Databricks in wechart's current image.**
   - Cube's docs require a JDK and the `cubejs/cube:jdk` image ([d-dbx] L10, L32–42).
   - The fork image builds `FROM cubejs/cube:v1.7.45`, which has no JDK ([ci-df] L12, L26; [latest-df] L33–38).
   - `v1.7.45-jdk` is published for amd64 only, 490.7 MB against 331.6 MB compressed ([hub-jdk], [hub]). This matters on the Apple-silicon docker-desktop host.
5. **Snowflake is blocking passwords for non-human users.** In Phase 3 (August–October 2026), "All non-human users are blocked from using a password to authenticate" ([sf-mfa]). For a service connection, AC-160's Snowflake form therefore needs key pair (`SNOWFLAKE_JWT`) or OAuth, not password alone.
6. **Option (a) passes AC-159's literal failure condition.** The condition is "the test runs in the browser" (`docs/spec.md` L634–635). But the network connection would come from **Cube's** container, not wechart's. Whether that is "from the wechart service" is a question for the user (Open questions 1). On fidelity, Cube's network path is the one that decides whether Cube can use the source (`docs/research/cube/data-sources.md` L419).
7. **Option (b) diverges from Cube in ways that give false passes or false failures.** Examples:
   - A Databricks all-purpose-cluster `httpPath` works with `@databricks/sql`. Cube 1.7.45's driver throws `Could not extract warehouseId from httpPath` in its constructor ([dbx-helpers] L40–43; [dbx-drv] L328).
   - Oracle `walletContent` exists only from node-oracledb 6.6, and Cube runs 6.2.0 ([ora-rn]; [yarnlock] L15360–15361).
   - The mssql default is `encrypt: true`. Cube sets `encrypt` from `CUBEJS_DB_SSL`, which defaults to false ([mssql-pool] L15; [ms-drv] L128–131).
   - With BigQuery's Application Default Credentials (ADC), Snowflake's default token path or any other ambient identity, (b) tests wechart's pod identity instead of Cube's.
8. **Both options need a field allowlist with no file-path fields.**
   - Snowflake reads `oauthTokenPath` from disk and sends its content as a token to the configured `host` ([sf-drv] L392–403, L405–424).
   - A test endpoint that accepts arbitrary driver config can therefore read and send out any file the process can read. That includes the environment of Cube (a) or of wechart's API (b).
   - `privateKeyPath`, `keyFilename`, `walletLocation` and `configDir` read files too.

## Install

### Option (a): no wechart dependency; a fork image

- **Build.** The fork package builds its image from `cube-introspection/` as `FROM cubejs/cube:${CUBE_VERSION}` with `CUBE_VERSION=v1.7.45`, and starts `node /cube/node_modules/cube-introspection/dist/src/bin/server.js` ([ci-df] L12–31).
- **Version pin.** The server refuses to start unless `@cubejs-backend/server-core` is exactly the package's peer version, 1.7.45 ([ci-bin] L13–25; [ci-pkg] L23–35).
- **Drivers.** The six drivers are already in Cube's image at 1.7.45 ([dockerpkg] L13, L16, L26, L28, L30, L35).
- **Databricks.** To query Databricks, Cube needs the JDK image ([d-dbx] L10, L32–42; [jdk-df] L37). The JDBC driver loads `@cubejs-backend/jdbc`, which `require`s the native `java` module when the module is loaded ([jdbc-drv] L31–35; `@cubejs-backend/jdbc` 0.9.0 `lib/jinst.js` L5, `lib/drivermanager.js` L3–4). Both are *optional* dependencies of the JDBC driver ([jdbc-pkg] L40–43).
  - UNVERIFIED: whether `require('@cubejs-backend/databricks-jdbc-driver')` succeeds in the non-JDK image. Cheap probe: `docker run --rm cubejs/cube:v1.7.45 node -e "require('@cubejs-backend/databricks-jdbc-driver')"`.
  - An old issue shows the failure text `Cannot find module '@cubejs-backend/jdbc/lib/drivermanager'` (Cube 0.36, closed) ([i8790]).
- **Resolved versions in Cube's image.** The image's `yarn install` uses the root `yarn.lock` ([latest-df] L18–20). That lock resolves:

  | Package | Version | Source |
  | --- | --- | --- |
  | pg | 8.18.0 | [yarnlock] L15840–15841 |
  | snowflake-sdk | 3.3.0 | L17879–17880 |
  | @google-cloud/bigquery | 7.7.0 | L3224–3225 |
  | mssql | 11.0.1 | L14560–14561 |
  | tedious | 18.6.1 | L18506–18507 |
  | oracledb | 6.2.0 | L15360–15361 |
  | java | 0.18.0 | L12883–12884 |
  | Databricks OSS JDBC jar | 3.4.2 | [dbx-inst] L5–6 |

- **Fork changes go through the Cube-expert agent** on the fork's branch (`docs/requirements.md` L441).

### Option (b): packages in `@wechart/api`

```sh
pnpm --filter @wechart/api add snowflake-sdk@3.3.0 @databricks/sql@2.2.0 @google-cloud/bigquery@9.1.0 mssql@12.7.2 oracledb@7.0.1
# pg@8.23.0 is already a dependency (packages/api/package.json L28; docs/research/db-access.md)
```

| Package | Version | License | Engines | Native parts | Unpacked size (package only) | What Cube 1.7.45 runs |
| --- | --- | --- | --- | --- | --- | --- |
| pg | 8.23.0 | MIT | node ≥16 | none; optional peer `pg-native` ([npm-pg]) | 100,044 B | pg 8.18.0 |
| snowflake-sdk | 3.3.0 | Apache-2.0 | node ≥20 | none listed. Dependencies include `@aws-sdk/client-s3`, `@aws-sdk/client-sts`, `@azure/identity`, `@azure/storage-blob`, `google-auth-library` ([npm-sf]) | 5,074,491 B | 3.3.0, the same version |
| @databricks/sql | 2.2.0 | Apache-2.0 | node ≥20 | optional `lz4-napi` and `@databricks/databricks-sql-kernel-*` 1.1.0 platform binaries ([npm-dbx]) | 1,756,051 B | none: Cube uses JDBC 3.4.2 through `java`, plus a REST check |
| @google-cloud/bigquery | 9.1.0 | Apache-2.0 | node ≥22 | none listed ([npm-bq]) | 713,324 B | 7.7.0, two majors behind |
| mssql | 12.7.2 | MIT | node ≥18.19.0 | none; depends on `tedious ^19.2.2 \|\| ^20.0.0` ([npm-mssql]) | 285,102 B | 11.0.1 |
| tedious | 20.0.0 (`latest` tag; `next` is 20.3.3) | MIT | node ≥22 | none listed; depends on `@azure/identity`, `@azure/keyvault-keys` ([npm-tedious]; [tedious-tags]) | 2,853,298 B | 18.6.1 |
| oracledb | 7.0.1 | Apache-2.0 OR UPL-1.0 | node ≥14.17 | Thin mode is pure JavaScript. The package ships Thick-mode binaries, which `npm run prune` can remove. Thick mode needs Oracle Client libraries 19 or later, such as Instant Client ([npm-ora]; [ora-thin-js]; [ora-install]; [ora-thick]) | 3,890,029 B | 6.2.0, Thin mode |

- **Image size.** Option (a) adds nothing to wechart's API image. Option (b)'s direct packages total about 14.7 MB unpacked, before transitive dependencies. UNVERIFIED: the installed size with dependencies. Measure it with `du -sh node_modules` after a scratch install. packagephobia returned HTTP 429.
- **Build externals.** wechart's API build lists its externals explicitly ([api-vite] L23–31). UNVERIFIED: whether Vite's SSR build keeps new packages external if they aren't added there. oracledb's binaries and @databricks/sql's optional native kernel must not be bundled.

## Init / auth pattern

### Option (a): the fork endpoint, called only by wechart's API

- **Token.** Reuse the introspection pattern: one short-lived token per request, carrying a `wechart`-prefixed claim that only wechart's API signs. `cube.js` maps that claim to a single scope and nothing else (`infra/cube/cube.js` L133–138; `packages/api/src/cube/client.ts` L183–202).
- **The scope must be let through upstream Cube's check.** Upstream accepts only `graphql`, `meta`, `data`, `sql` and `jobs` from `contextToApiScopes`, and throws `A user-defined contextToApiScopes function returns a wrong scope: <p>` for anything else ([gw] L2808–2830).
  - The package works around this for `introspection` by stripping it before Cube's check and adding it back after ([ci-gw] L84–108).
  - A new scope such as `connection-test` needs the same treatment. So does reusing `introspection`, which only needs no change.
- **Why a separate scope.** Testing arbitrary hosts is a different capability from reading the catalog of sources Cube already has. Only the proposal below uses the new scope.

```js
// infra/cube/cube.js: sketch only. The 'connection-test' scope does not exist yet.
contextToApiScopes: async (securityContext, defaultScopes) => {
  const defaults = defaultScopes.filter((s) => s !== 'introspection' && s !== 'connection-test');
  if (securityContext?.wechartDraft !== undefined) return defaults;
  if (securityContext?.wechartIntrospection === true) return ['introspection'];
  if (securityContext?.wechartConnectionTest === true) return ['connection-test'];
  return [...defaults, 'jobs'];
},
```

- **Client path allowlist.** `CubeClient.introspect` refuses paths outside `/v1/introspection/data-sources` (`client.ts` L196–197). A test route needs its own guarded method.
- **Credentials in the body, never the URL.**
  - Cube's request logger logs the path, including the query string, but not the body ([reqparser] L18–37; [gw] L2937–2945).
  - Every branch of `handleError` logs the `query` it is given, and the "sanitising" step only deletes `cacheMode` ([gw] L1905–1909, L2525–2586).
  - The package's `introspect()` wrapper passes `{...req.query, ...req.body}` as that `query` ([ci-gw] L199–220).
  - So **a test route must not reuse `introspect()` unchanged**. A failure would write the credentials to Cube's log.
- **Credentials in transit.** Credentials cross the wechart→Cube hop in the request body. Whether that hop is TLS is a deployment choice (Open questions 6).

### Option (b): drivers in wechart's API

- Decrypt the stored credentials (AC-298) in the request handler.
- Build the client config from an allowlist, apply per-check timeouts, always close, and never log the config.
- Nothing credential-bearing goes to the browser (AC-164). Return only statuses, timings and redacted error text.

## API surface we will use

### 1. What Cube's drivers expose for testing (Cube 1.7.45)

**Shared behaviour**

- `BaseDriver` declares `abstract testConnection(): Promise<void>` and a no-op `release()` ([bd] L290, L628–630).
- `testConnectionTimeout()` defaults to 10,000 ms ([bd] L96–111, L475–477). In Cube's sources it is used only by the JDBC pool's `validate` and the Firebolt driver, not by these drivers' tests (Grep of `testConnectionTimeout()`; [jdbc-drv] L154–177). This settles `data-sources.md` open question 4.
- Cube itself runs `testConnection()` whenever an orchestrator creates a driver.
  - On failure it clears the cached promise and calls `release()` ([srv] L659–698).
  - So Cube's test is exactly the gate Cube applies before it uses a driver.
- `CubejsServerCore.createDriver(type, options)` does `new (lookupDriverClass(type))(options)` ([srv] L121; [resolvers] L33–45, L67–70).
  - The six types are `postgres`, `snowflake`, `databricks-jdbc`, `bigquery`, `mssql` and `oracle` ([deps] L3–33).
- Cube's dev-only `POST /playground/test-connection` does the same after temporarily mutating `process.env` ([devsrv] L495–556). Don't copy that into a server path, because `process.env` is shared by every concurrent request.

**Per driver**

| Driver | What `testConnection()` does | What it doesn't test | Error text a failure shows | Timeout |
| --- | --- | --- | --- | --- |
| **postgres** | Opens one fresh client through the pool factory: TCP, TLS if `ssl`, then startup and auth. Runs `SELECT $1::int AS number` with `['1']`, then destroys the client ([pg-drv] L176–187, L277–293) | The session setup real queries get: `SET TIME ZONE`, `SET statement_timeout`, the `pg_type` read ([pg-drv] L341–351). Catalog access | Connect failures: `Unable to connect to the database (<pool>): <pg message>`, with an `AggregateError`'s messages joined ([pg-err] L9–18). A *query* error containing `no pg_hba.conf entry for host` becomes `Please use CUBEJS_DB_SSL=true to connect: …` ([pg-drv] L284–286). **Source-derived:** `create()` runs before that `try` (L279–281), so a pg_hba rejection during connect surfaces as the plain `ConnectionError` | None set. pg's default is "no timeout" ([pgclient]) |
| **snowflake** | Builds connect options for the authenticator, calls `connection.connect()`, checks `isUp()`, then `destroy()` ([sf-drv] L405–436, L447–461) | No query, so the warehouse isn't exercised. The `ALTER SESSION` real connections run is skipped (L480–504). UNVERIFIED: whether login itself rejects an ungranted role or an unknown warehouse | The snowflake-sdk connect error, unchanged. If not up: **`Can't connect to the Snowflake instance: <JSON.stringify(config minus password)>`**, which includes `privateKey`, `privateKeyPass` and `oauthToken` (L454–456). Env path only: `Snowflake encrypted private key provided, but no passphrase was given.` (L211–214). `File <path> provided by CUBEJS_DB_SNOWFLAKE_OAUTH_TOKEN_PATH does not exist.` (L398) | None in Cube |
| **databricks-jdbc** | **No JDBC.** With M2M it POSTs `https://<host>/oidc/v1/token` (`client_credentials`, `all-apis`), then GETs `https://<host>/api/2.0/sql/warehouses/<id>` with a Bearer token. It fails on a non-2xx status, on state `DELETING` or `DELETED`, or on `health.status === 'FAILED'` ([dbx-drv] L348–373, L386–416) | The JDBC path (JVM, jar, driver properties), any SQL, catalog access. A `STOPPED` warehouse passes | `Failed to get access token: <statusText>`. `Databricks API error: <statusText>`: the response body is dropped. `Warehouse is being deleted (current state: X)`. `Warehouse is unhealthy: <summary>. Details: <details>`. Constructor: `Invalid credentials: No OAuth Client Secret provided`, `… No OAuth Client ID provided`, `No credentials provided` (L231–237). `Missing httpPath in JDBC URL`, `Could not extract warehouseId from httpPath` ([dbx-helpers] L36–43). `Unsupported configuration: EnableGeoSpatialSupport=1 …` (L21–26) | None: node-fetch 2's `timeout` defaults to 0, which disables it ([node-fetch]) |
| **bigquery** | `this.bigquery.getDatasets()` ([bq-drv] L180–188) | `bigquery.jobs.create`, which queries need ("BigQuery Job User", [d-bq] L8–18; [bq-run]). Location | The Google API error, unchanged. Listing needs `bigquery.datasets.get` ([bq-list]) | None set in Cube |
| **mssql** | The constructor already starts `pool.connect()`. The test awaits it and runs `SELECT 1 as number` ([ms-drv] L148–149, L168–171). mssql's `connect()` makes one attempt before building its pool ([mssql-base] L430–470) | Catalog access | The mssql/tedious error message | `connectTimeout` defaults to 15,000 ms ([mssql-pool] L41) |
| **oracle** | `this.query('SELECT 1 FROM DUAL', {})`, which acquires from the pool. The pool's `create` does `getConnection` plus an NLS `ALTER SESSION` ([ora-drv] L97–103, L160–164, L171–183) | Catalog access | **Source-derived, not observed.** A rejected `create` is emitted as `factoryCreateError`, which the Oracle driver doesn't listen for, so "the error will be silently discarded" ([ora-drv] L97–127; [gp-readme]). generic-pool 3.9.0 then calls `_dispense()` again, so creation is retried while the acquire waits ([gp-pool] L317–340). After `acquireTimeoutMillis` 20,000 (L125) the caller gets `ResourceRequest timed out (oracle#<ds>)` ([pool] L9–15, L39–48). The ORA or NJS text is lost, and a bad password causes repeated logins. Oracle's default `FAILED_LOGIN_ATTEMPTS` is 10 ([ora-profile]) | 20 s acquire. node-oracledb 6.2.0's `transportConnectTimeout` is 60 s; 6.7 changed it to 20 s ([ora-api]) |

### 2. The AC-160 field list, as Cube's drivers take each driver

A field reaches the driver in one of two ways:

- **env:** a `CUBEJS_DB_*` variable.
- **cfg:** a constructor or `driverFactory` config key.

Explicit config wins over env for every driver except Databricks' `||` fields ([pg-drv] L123–131; [sf-drv] L232–256; [bq-drv] L122–153; [ms-drv] L119–144; [ora-drv] L86–94; [dbx-drv] L214–320).

| Driver | Connection fields | Authentication methods Cube's driver can use | Not usable through Cube's driver |
| --- | --- | --- | --- |
| **PostgreSQL** (`postgres`) | host, port, database, user; TLS object `ssl` {ca, cert, key, passphrase, servername, ciphers, rejectUnauthorized}. On the env path, `rejectUnauthorized` comes from `CUBEJS_DB_SSL_REJECT_UNAUTHORIZED`, default false ([bd] L210–288; [d-pg] L31–38) | Password; client certificate through `ssl.cert` and `ssl.key`. cfg only: any pg `ClientConfig` key, including `password` as a function ([pgclient]) | — |
| **Snowflake** (`snowflake`) | account (required), region, host, warehouse (docs: required), role, database (docs: required), clientSessionKeepAlive; `queryTag` is cfg only ([d-sf] L208–254; [sf-drv] L102–131) | `SNOWFLAKE`: username and password. `SNOWFLAKE_JWT`: username plus `privateKey` PEM (an encrypted PEM with `privateKeyPass` works: [sf-keypair] L104–108) or `privateKeyPath` [+ pass]. `OAUTH`: `oauthToken`, or `oauthTokenPath` (default `/snowflake/session/token`) ([sf-drv] L392–436; [d-sf] L243–248) | Whatever snowflake-sdk 3.3.0 supports that needs keys Cube doesn't forward: `OAUTH_CLIENT_CREDENTIALS`, `WORKLOAD_IDENTITY`, `EXTERNALBROWSER`, and `USERNAME_PASSWORD_MFA` passcodes ([sf-authtypes] L4–15; [sf-drv] L405–436). `PROGRAMMATIC_ACCESS_TOKEN` should work with the PAT in *password*, because the SDK falls back to `password` ([sf-pat] L20–26), but this is UNVERIFIED end to end. Password alone is blocked for non-human users in Phase 3 (Aug–Oct 2026) ([sf-mfa]) |
| **Databricks** (`databricks-jdbc`) | `url`, a JDBC URL whose `httpPath` must contain `/warehouses/<id>`, so SQL warehouses only, and without `EnableGeoSpatialSupport=1` ([dbx-helpers] L18–46). `catalog`. `database` comes only from `CUBEJS_DB_NAME` ([dbx-drv] L272–275). `CUBEJS_DB_DATABRICKS_ACCEPT_POLICY` is documented as required ([d-dbx] L57), but no driver source reads it (Grep) | Personal access token (`token`; UID defaults to `token`, AuthMech 3). OAuth M2M service principal: `oauthClientId` and `oauthClientSecret` (AuthMech 11, Auth_Flow 1). If both are given, OAuth wins ([dbx-drv] L223–257; [d-dbx] L58–60) | All-purpose clusters: the constructor throws. U2M OAuth |
| **BigQuery** (`bigquery`) | projectId (required), location ([d-bq] L95–108) | Service-account JSON: `credentials` object in cfg, base64 JSON on the env path. Key file path (`keyFilename`). With neither, the Google client's default chain (ADC). ADC's order is `GOOGLE_APPLICATION_CREDENTIALS`, then the local ADC file, then the metadata server ([adc]). UNVERIFIED for this client version | OIDC workload identity federation is documented for Cube Cloud ([d-bq] L65–85) |
| **SQL Server** (`mssql`) | server (host), port, database, `options.encrypt` from `CUBEJS_DB_SSL` (default false), `trustServerCertificate` (mssql default false) ([ms-drv] L119–144; [mssql-pool] L14–17) | SQL login. NTLM whenever `domain` is set ([mssql-pool] L18–36; [d-ms] L36). cfg only: tedious `authentication.type` values `azure-active-directory-password`, `-access-token`, `-msi-vm`, `-msi-app-service`, `-service-principal-secret` and `-default` ([tedious-conn] L289; [tedious-doc]) | **Windows integrated or Kerberos.** Cube's documented `trustedConnection: true` ([d-ms] L92–104) is read only by mssql's `msnodesqlv8` pool (`options.trustedConnection`: [mssql-v8] L31). Cube's driver imports `mssql`, which is tedious ([ms-drv] L7; `mssql/index.js` L1). Tedious documents no Kerberos ([tedious-doc]) |
| **Oracle** (`oracle`) | user, password, `connectionString`, else `host:port/db` with port default 1521 ([ora-drv] L86–94). TLS only through a `tcps://` connect string. The documented `CUBEJS_DB_SSL` ([d-ora] L49, L55–60) is **not read** by the driver source | Password. cfg only: other node-oracledb 6.2.0 Thin attributes such as `walletLocation`, `walletPassword` and `configDir` (6.0) ([ora-api]). Token authentication (`accessToken` with `externalAuth`) is supported in both modes today ([ora-thin]); support in Thin mode at 6.2.0 is UNVERIFIED | `walletContent` (6.6+). Kerberos, RADIUS, PKI, Native Network Encryption and OS external authentication, all Thick mode only ([ora-thin]; [ora-nne]). Cube never calls `initOracleClient()` and its image has no Instant Client ([ora-drv]; [latest-df]). Databases before 12.1 ([d-ora] L18–24) |

### 3. Option (a): a fork endpoint that tests a config without registering it

**What exists.** Nothing in the fork tests connections today (Grep of `cube-introspection/`). Cube Core's only test route is the dev-only playground route ([devsrv] L495).

**Proposed shape.** This is a sketch for the Cube-expert agent, not an existing API:

```
POST {basePath}/v1/introspection/connection-tests          scope: connection-test (or introspection)
content-type: application/json
{ "type": "postgres" | "snowflake" | "databricks-jdbc" | "bigquery" | "mssql" | "oracle",
  "config": { …allowlisted keys for that type, content only, no paths… },
  "checks": ["dns","tcp","tls","driver","schemas","query"] }                  // optional subset
200 { "checks": [ { "id": "driver", "status": "passed"|"failed"|"skipped",
                   "durationMs": 812, "error": { "message": "<redacted driver text>", "code": "28P01" } } ] }
```

**Minimal change points** (package branch, commit `0b6eef90a9`):

1. **Route.** Add the route in `IntrospectionApiGateway.initIntrospectionRoutes`, with `jsonParser` and the user middlewares ([ci-gw] L110–192). Use a variant of `introspect()` that passes a redacted `query` to `handleError` ([ci-gw] L199–220; [gw] L2525–2586).
2. **Scope.** Extend `createContextToApiScopesFn` if a new scope is used ([ci-gw] L84–108), and add the constant next to `INTROSPECTION_SCOPE` (L34–35).
3. **Request module.** A new `src/connection-tests.ts`:
   - a Joi schema per type, validated through `validRequest` (L222–229);
   - a mapping to a **fully explicit** driver config, so Cube's environment can't fill gaps;
   - `CubejsServerCore.createDriver(type, cfg)` ([srv] L121);
   - staged checks, each with its own timeout;
   - `release()` in `finally` (every driver: [pg-drv] L512–518, [ms-drv] L402–403, [ora-drv] L265–268, [sf-drv] L1119–1125; BigQuery inherits the no-op);
   - redaction of error text (the Snowflake case).
4. **Oracle and Postgres errors.** To keep the driver's own error text, call the pool factory directly, as Postgres does, instead of `testConnection()` or `query()` ([ora-drv] L97–103, L181–183).
5. **Environment isolation.** Refuse to run when the process's environment would feed a Databricks `||` fallback for the chosen data-source name ([dbx-drv] L225–229, L272–275). With `CUBEJS_DATASOURCES` set, any name outside it throws `The <x> data source is missing in the declared CUBEJS_DATASOURCES.` ([env] L88–101, L106–107).
6. **Wire types, README and tests.** Add wire types in `src/types.ts`, update the README, and add unit tests plus a Postgres integration test beside the existing ones (`cube-introspection/test/integration/drivers.test.ts`).
7. **Image.** For Databricks, `CUBE_VERSION` would become `v1.7.45-jdk` ([ci-df] L12, L26), which is amd64 only ([hub-jdk]).

**Adjacent change points** for AC-157, AC-161 and AC-163's periodic tests:

- **Test the driver Cube actually runs.** The package already keeps each orchestrator's `getDriver` in `driverFactories` ([ci-srv] L20–28, L47–53). A route could call `getDriver(ds)` and then `testConnection()` on the *cached* driver, which tests the configuration Cube is really using.
- **Show whether Cube uses the new settings.** Cube caches one driver per data source per orchestrator ([srv] L643–706). "Whether the running Cube uses the new settings" can only be answered inside Cube, for example by exposing a non-secret fingerprint of the config the cached driver was built from. Cube Core has no API for connections (`docs/research/cube/data-sources.md` L36).
- This belongs with the per-folder connection research (`docs/requirements.md` L457).

**Security of (a).**

- The scope must be held only by wechart API tokens, on the model of the introspection rules (`infra/cube/cube.js` L133–138).
- The endpoint lets the holder make Cube's pod open TCP, TLS and HTTPS connections to any host. That is inherent to a connection test.
- Path fields must be refused (Summary finding 8).
- Logging must not see the body (see Init).

### 4. Option (b): the same checks with Node packages (calls, from the libraries' docs)

| Package | Connect | Trivial query | Close |
| --- | --- | --- | --- |
| pg | `new Client({host, port, database, user, password, ssl, connectionTimeoutMillis})`, then `connect()` ([pgclient]) | `query('SELECT 1')` | `end()` |
| snowflake-sdk | `snowflake.createConnection(opts)`, then `connect(cb)` ([sf-drv] L438–451) | `execute({sqlText, complete})` ([sf-drv] L1036) | `destroy(cb)` |
| @databricks/sql | `new DBSQLClient().connect({host, path, token})`, then `openSession()`. Also `authType` values and `oauthClientId`/`oauthClientSecret` for M2M ([dbx-readme]; [dbx-params]) | `executeStatement(sql)`, then `fetchAll()` | `close()` on the operation, session and client. `socketTimeout` defaults to 900,000 ms on Thrift ([dbx-params]) |
| @google-cloud/bigquery | `new BigQuery({projectId, credentials, location})` ([bq-drv] L122–161) | `getDatasets()`. A dry-run query to check `jobs.create` is UNVERIFIED for this client | none needed |
| mssql | `new ConnectionPool(cfg)`, then `connect()` ([ms-drv] L148–149) | `request().query('SELECT 1')` | `close()` |
| oracledb | `getConnection({user, password, connectString, transportConnectTimeout})` ([ora-api]) | `execute('SELECT 1 FROM DUAL')` | `close()` |

**Divergence risk.** To match Cube, option (b) must copy Cube's mapping for every driver: Postgres `ssl`, SQL Server `encrypt`, Snowflake's per-authenticator key selection, Databricks' warehouse-only URL, and Oracle's connect string. It must also track Cube's resolved versions (Install) on each Cube upgrade.

- Snowflake has the least risk: the SDK version is the same as Cube's.
- Databricks has the most: the protocol and client are different.

### 5. "Each check": what can be reported separately

| Check | What it proves | (a) fork endpoint | (a′) Cube driver packages in wechart | (b) Node packages |
| --- | --- | --- | --- | --- |
| Resolve host | DNS from the pod that will connect | `node:dns` in **Cube's** pod | wechart's pod | wechart's pod |
| Open connection | TCP reach | `node:net` | same | same |
| TLS handshake and certificate | Encryption and certificate trust | HTTPS drivers (Snowflake, Databricks, BigQuery): a plain `node:tls` probe. **Postgres** starts TLS with an in-protocol `SSLRequest`, so a separate probe must send it first ([pg-proto]). **SQL Server on TDS 7.x** exchanges a cleartext PRELOGIN before TLS ([tds8]), so TLS can only be reported by classifying the driver's error. UNVERIFIED: that Oracle `tcps` starts with a bare TLS handshake | same | same |
| Authenticate | Credentials accepted | Driver connect or login. For Databricks only the REST token. For Oracle only if the pool is bypassed (§3, point 4) | same | Native login for each package |
| Cube's own driver test | Exactly what gates Cube's use of the driver ([srv] L659–698) | **yes**, in Cube's pod | yes, in wechart's pod | **no** |
| Read schema | Catalog permission | `driver.getSchemas()`, except Oracle, whose base query reads `information_schema`, which Oracle lacks ([bd] L124–131, L396–399; [ora-drv] has no override), and Databricks, which needs the JVM | same | Per-package query |
| Run sample query | SQL execution | `driver.query()` | same | yes |

**Error classification is possible in every option:**

- Node system errors: `ENOTFOUND` ("a DNS failure"), `ECONNREFUSED`, `ETIMEDOUT` ([node-errors]).
- PostgreSQL SQLSTATE `28P01` (invalid_password) and `28000` ([pg-errcodes]).

## Gotchas

- **Environment bleed in option (a)** (Summary finding 3; [env] L78–113). Also:
  - The Snowflake constructor decrypts the *env* private key whatever config is passed, and throws if it's encrypted without a passphrase ([sf-drv] L203–228).
  - BigQuery validates the *env* export bucket type ([bq-drv] L155–159).
- **Credentials in error text and logs.**
  - The Snowflake `isUp()` error includes secrets ([sf-drv] L454–456).
  - Cube's `handleError` logs the given `query` ([gw] L2525–2586).
  - Redact both in both options.
- **File-reading fields.** `oauthTokenPath`, `privateKeyPath`, `keyFilename`, `walletLocation` and `configDir` must not be accepted from the browser ([sf-drv] L392–403).
- **Oracle through Cube's `testConnection()`:** the pool retries a failed login until 20 s, loses the ORA text, and can lock the account ([gp-pool] L317–340; [ora-profile]).
- **Databricks.**
  - The test passes for a stopped warehouse.
  - A cluster `httpPath` fails in the constructor.
  - `ACCEPT_POLICY` is documented but unread.
  - Querying needs the JDK image, which is amd64 only (Summary finding 4).
  - Cube's docs example uses a cluster path (`sql/protocolv1/o/…`), which the 1.7.45 driver rejects ([d-dbx] L25; [dbx-helpers] L40–43).
- **Documentation that disagrees with the source:**
  - Oracle `CUBEJS_DB_SSL` is not read.
  - SQL Server `trustedConnection` does nothing under tedious.
- **Timeouts.** Postgres, Snowflake, BigQuery and Databricks tests have no timeout in Cube. Wrap every check in one of your own, in both options.
- **Ambient identities** (BigQuery ADC, Snowflake's default token path) make option (b) or (a′) test wechart's identity, not Cube's.
- **Network path.** Option (b) or (a′) tests wechart's egress. Cube's may differ, for example under network policies or IP allowlists. The refresh worker's egress isn't tested by any option.
- **Branch.** The caller named `feat/data-source-introspection-api`. The checkout is on `feat/introspection-package`, and route code now lives in `cube-introspection/src/gateway.ts`, not in Cube's `api-gateway` ([ci-gw]).

## Alternatives considered

The caller asked for a comparison. Criteria only; no effort weighting.

| Criterion | (a) fork endpoint | (a′) Cube driver packages in wechart's API | (b) Node packages in wechart's API |
| --- | --- | --- | --- |
| Fidelity to Cube's behaviour | Highest: the same code, versions, image, network path and ambient identity as the running Cube | Same code if pinned to 1.7.45; wechart's network and identity | Lowest: different clients (Databricks), versions (BigQuery, mssql, oracledb) and config mapping |
| AC-159 "from the wechart service" | Initiated by wechart's API; the connection comes from Cube's pod. **Interpretation needed** | Yes | Yes |
| AC-159 driver error text | Needs fork-side handling: Oracle via the factory, Databricks body, Snowflake redaction | Same fixes needed in wechart | Native errors, full text |
| Per-check reporting | Possible if the endpoint stages checks | Possible | Possible, with the finest control per package |
| AC-161 (running Cube uses the settings) | The same fork can report the cached driver's config fingerprint | Can't observe Cube | Can't observe Cube |
| Security | A new scope. Credentials cross the wechart→Cube hop. Log redaction needed. SSRF from Cube's pod | Credentials stay in the API. SSRF from the API pod, which reaches the metadata DB | Same as (a′) |
| Image size | wechart +0. Cube +159 MB compressed only if Databricks moves to `-jdk` ([hub-jdk]; [hub]) | Cube's base-driver pulls the S3, Azure and GCS SDKs (`data-sources.md` L60). Databricks needs `java` and a JDK in wechart's image | About 14.7 MB of direct packages, plus unmeasured transitive dependencies; @databricks/sql has optional native binaries |
| Maintenance | Moves with the fork's pinned Cube version ([ci-bin] L13–25) | Must match the Cube image's version; Node 26 vs Cube's Node 24 untested | Independent upgrades, which is exactly the drift risk |

## Open questions / unverified

1. **For the user:** does AC-159's "from the wechart service" include a test executed in Cube's container at wechart's request? The Fails-when only excludes the browser (`docs/spec.md` L634–635).
2. **UNVERIFIED, source-derived:** Oracle's retry-until-timeout and lost error text. Probe it with a wrong password against a scratch Oracle database.
3. **UNVERIFIED:** whether the Databricks driver module loads in the non-JDK Cube image (probe in Install).
4. **UNVERIFIED:** whether Snowflake login fails on an ungranted role or an unknown warehouse; whether a PAT works through Cube's password field; whether `USERNAME_PASSWORD_MFA` works at all.
5. **UNVERIFIED:** installed (transitive) sizes for option (b); Node 26 with the Cube driver packages; the dry-run API of @google-cloud/bigquery 9.1.0; that Oracle `tcps` begins with a bare TLS handshake; token authentication in node-oracledb 6.2.0 Thin.
6. **Open:** whether the wechart→Cube hop uses TLS in compose and Helm. It matters for (a), and for how phase 2 gives Cube its credentials at all.
7. **Line numbers.** They come from the local checkout at `0b6eef90a9`, and the working tree was not checked for cleanliness. Only Postgres, BigQuery and Databricks `testConnection()` were cross-checked against `f6355de982`.
8. **Context7 and live databases.** Context7 was used for node-oracledb only. The other libraries were read from installed source in the fork checkout (versions per `yarn.lock`), npm and vendor docs. No live database was used, and nothing here was observed.
9. **Timeline.** The Snowflake Phase 3 dates come from Snowflake's rollout page as fetched on 2026-09-25.

[f-pg]: https://github.com/senthilkrajagopal/cube/blob/f6355de98252a62de82dca2ccbac3c356578df4e/packages/cubejs-postgres-driver/src/PostgresDriver.ts
[f-bq]: https://github.com/senthilkrajagopal/cube/blob/f6355de98252a62de82dca2ccbac3c356578df4e/packages/cubejs-bigquery-driver/src/BigQueryDriver.ts
[f-dbx]: https://github.com/senthilkrajagopal/cube/blob/f6355de98252a62de82dca2ccbac3c356578df4e/packages/cubejs-databricks-jdbc-driver/src/DatabricksDriver.ts
[pg-drv]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-postgres-driver/src/PostgresDriver.ts
[pg-err]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-postgres-driver/src/errors.ts
[bd]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-base-driver/src/BaseDriver.ts
[sf-drv]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-snowflake-driver/src/SnowflakeDriver.ts
[dbx-drv]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-databricks-jdbc-driver/src/DatabricksDriver.ts
[dbx-helpers]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-databricks-jdbc-driver/src/helpers.ts
[dbx-inst]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-databricks-jdbc-driver/src/installer.ts
[jdbc-drv]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-jdbc-driver/src/JDBCDriver.ts
[jdbc-pkg]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-jdbc-driver/package.json
[bq-drv]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-bigquery-driver/src/BigQueryDriver.ts
[ms-drv]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-mssql-driver/src/MSSqlDriver.ts
[ora-drv]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-oracle-driver/driver/OracleDriver.js
[srv]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-server-core/src/core/server.ts
[resolvers]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-server-core/src/core/DriverResolvers.ts
[deps]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-server-core/src/core/DriverDependencies.ts
[devsrv]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-server-core/src/core/DevServer.ts
[env]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-backend-shared/src/env.ts
[pool]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-backend-shared/src/pool.ts
[gw]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-api-gateway/src/gateway.ts
[reqparser]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-api-gateway/src/request-parser.ts
[yarnlock]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/yarn.lock
[dockerpkg]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-docker/package.json
[latest-df]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-docker/latest.Dockerfile
[jdk-df]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/packages/cubejs-docker/latest-debian-jdk.Dockerfile
[d-pg]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/docs-mintlify/admin/connect-to-data/data-sources/postgres.mdx
[d-sf]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/docs-mintlify/admin/connect-to-data/data-sources/snowflake.mdx
[d-dbx]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/docs-mintlify/admin/connect-to-data/data-sources/databricks-jdbc.mdx
[d-bq]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/docs-mintlify/admin/connect-to-data/data-sources/google-bigquery.mdx
[d-ms]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/docs-mintlify/admin/connect-to-data/data-sources/ms-sql.mdx
[d-ora]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/docs-mintlify/admin/connect-to-data/data-sources/oracle.mdx
[ci-gw]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/gateway.ts
[ci-srv]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/server.ts
[ci-bin]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/src/bin/server.ts
[ci-pkg]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/package.json
[ci-df]: https://github.com/senthilkrajagopal/cube/blob/0b6eef90a969167b5dcd1ccaec3283567a1f914a/cube-introspection/Dockerfile
[mssql-pool]: https://github.com/tediousjs/node-mssql/blob/v11.0.1/lib/tedious/connection-pool.js
[mssql-base]: https://github.com/tediousjs/node-mssql/blob/v11.0.1/lib/base/connection-pool.js
[mssql-v8]: https://github.com/tediousjs/node-mssql/blob/v11.0.1/lib/msnodesqlv8/connection-pool.js
[tedious-conn]: https://www.npmjs.com/package/tedious/v/18.6.1
[tedious-doc]: https://tediousjs.github.io/tedious/api-connection.html
[sf-authtypes]: https://www.npmjs.com/package/snowflake-sdk/v/3.3.0
[sf-pat]: https://www.npmjs.com/package/snowflake-sdk/v/3.3.0
[sf-keypair]: https://www.npmjs.com/package/snowflake-sdk/v/3.3.0
[gp-pool]: https://github.com/coopernurse/node-pool/blob/v3.9.0/lib/Pool.js
[gp-readme]: https://raw.githubusercontent.com/coopernurse/node-pool/master/README.md
[npm-pg]: https://registry.npmjs.org/pg/latest
[npm-sf]: https://registry.npmjs.org/snowflake-sdk/latest
[npm-dbx]: https://registry.npmjs.org/@databricks/sql/latest
[npm-bq]: https://registry.npmjs.org/@google-cloud/bigquery/latest
[npm-mssql]: https://registry.npmjs.org/mssql/latest
[npm-tedious]: https://registry.npmjs.org/tedious/latest
[tedious-tags]: https://registry.npmjs.org/-/package/tedious/dist-tags
[npm-ora]: https://registry.npmjs.org/oracledb/latest
[ora-thin]: https://github.com/oracle/node-oracledb/blob/main/doc/src/user_guide/appendix_a.rst
[ora-nne]: https://github.com/oracle/node-oracledb/blob/main/doc/src/user_guide/appendix_a.rst
[ora-thick]: https://github.com/oracle/node-oracledb/blob/main/doc/src/user_guide/initialization.rst
[ora-install]: https://github.com/oracle/node-oracledb/blob/main/doc/src/user_guide/installation.rst
[ora-thin-js]: https://github.com/oracle/node-oracledb/blob/main/lib/thin/index.js
[ora-api]: https://github.com/oracle/node-oracledb/blob/main/doc/src/api_manual/oracledb.rst
[ora-rn]: https://node-oracledb.readthedocs.io/en/latest/release_notes.html
[ora-profile]: https://docs.oracle.com/en/database/oracle/oracle-database/21/sqlrf/CREATE-PROFILE.html
[pgclient]: https://node-postgres.com/apis/client
[pg-proto]: https://www.postgresql.org/docs/current/protocol-flow.html
[pg-errcodes]: https://www.postgresql.org/docs/current/errcodes-appendix.html
[tds8]: https://learn.microsoft.com/en-us/sql/relational-databases/security/networking/tds-8
[dbx-readme]: https://raw.githubusercontent.com/databricks/databricks-sql-nodejs/main/README.md
[dbx-params]: https://raw.githubusercontent.com/databricks/databricks-sql-nodejs/main/CONNECTION_PARAMETERS.md
[sf-mfa]: https://docs.snowflake.com/en/user-guide/security-mfa-rollout
[bq-list]: https://docs.cloud.google.com/bigquery/docs/listing-datasets
[bq-run]: https://docs.cloud.google.com/bigquery/docs/running-queries
[adc]: https://docs.cloud.google.com/docs/authentication/application-default-credentials
[node-errors]: https://raw.githubusercontent.com/nodejs/node/main/doc/api/errors.md
[node-fetch]: https://raw.githubusercontent.com/node-fetch/node-fetch/2.x/README.md
[hub]: https://hub.docker.com/v2/repositories/cubejs/cube/tags/v1.7.45
[hub-jdk]: https://hub.docker.com/v2/repositories/cubejs/cube/tags/v1.7.45-jdk
[i8790]: https://github.com/cube-js/cube/issues/8790
[api-vite]: /Users/srajagopal/Work/wechart/packages/api/vite.build.config.ts

Source notes:
- `[mssql-*]`, `[tedious-conn]`, `[sf-*]` and `[gp-pool]` line numbers come from the installed copies in `/Users/srajagopal/Work/bi/cube/node_modules/`. Their versions are fixed by the fork's `yarn.lock`.
- The snowflake-sdk and tedious line numbers refer to their compiled `dist/` and `lib/` files: `dist/lib/authentication/authentication_types.js`, `auth_oauth_pat.js`, `auth_keypair.js`, and tedious `lib/connection.js`.
- Other files cited: `/Users/srajagopal/Work/wechart/docs/inputs/2026-09-25-cube-introspection-package.md`, `/Users/srajagopal/Work/wechart/infra/cube/cube.js`, `/Users/srajagopal/Work/wechart/packages/api/src/cube/client.ts`, and `/Users/srajagopal/Work/wechart/docs/design/prototype/admin-sources.js`.
