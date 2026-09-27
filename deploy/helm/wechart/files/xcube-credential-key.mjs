// xcube's credential key, made once for this release (T455, AC-324): the
// chart's Job runs this in xcube's own image, with node's built-ins alone
// (docs/research/kubernetes-job-generated-secret.md).
//
// The private key and its sample credential go in a Secret, which only Cube's
// pods mount; the public JWK and its kid in a ConfigMap, which the API reads.
// Helm can't make an X25519 key, so xcube's keygen does. Neither object is
// Helm's: an uninstall leaves them, so a reinstall keeps the key the stored
// credentials were sealed to.
//
// It reconciles rather than stopping when the Secret is there: a run may die
// between its two writes, or two runs overlap. It never replaces a key: where
// the ConfigMap names one and the Secret is gone, it stops, since a new key
// would leave every stored credential unopenable.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const b64 = (text) => Buffer.from(text).toString('base64');
const unb64 = (text) => Buffer.from(text, 'base64').toString('utf8');

/**
 * `api(method, path, body)` answers `{ status, body }` for a path under the
 * namespace; `keygen(pem?)` answers `{ jwk, pem, check }`, for a new key or
 * for the one given.
 */
export async function reconcile({ api, keygen, secret, configMap }) {
  const answered = async (method, path, body, ok) => {
    const answer = await api(method, path, body);
    if (!ok.includes(answer.status))
      throw new Error(
        `${method} ${path} answered ${answer.status}: ${answer.body?.message ?? 'no message'}`,
      );
    return answer;
  };
  const made = [];
  /** The key's public half: this run's, or derived from the stored one. */
  let jwk;
  let stored =await answered('GET', `secrets/${secret}`, undefined, [200, 404]);
  let published = await answered('GET', `configmaps/${configMap}`, undefined, [200, 404]);

  if (stored.status === 404) {
    if (published.status === 200)
      throw new Error(
        `${secret} is missing, but ${configMap} names key ${published.body?.data?.kid}: restore the Secret from its backup. A new key would leave every stored credential unopenable.`,
      );
    const fresh = await keygen();
    const posted = await answered(
      'POST',
      'secrets',
      {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: { name: secret },
        type: 'Opaque',
        immutable: true,
        data: { [`${fresh.jwk.kid}.pem`]: b64(fresh.pem), [`${fresh.jwk.kid}.check`]: b64(fresh.check) },
      },
      [200, 201, 202, 409],
    );
    // Another run's key landed first: that one is kept.
    if (posted.status === 409) stored = await answered('GET', `secrets/${secret}`, undefined, [200]);
    else {
      stored = posted;
      made.push('Secret');
      jwk = fresh.jwk;
    }
  }

  const pems = Object.keys(stored.body.data ?? {}).filter((key) => key.endsWith('.pem'));
  if (pems.length !== 1) throw new Error(`${secret} holds ${pems.length} keys; this Job takes exactly one.`);
  // The public half of the key the Secret holds, where another made it.
  jwk ??= (await keygen(unb64(stored.body.data[pems[0]]))).jwk;

  if (published.status === 404) {
    const posted = await answered(
      'POST',
      'configmaps',
      {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { name: configMap },
        immutable: true,
        data: { jwk: JSON.stringify(jwk), kid: jwk.kid },
      },
      [200, 201, 202, 409],
    );
    if (posted.status === 409)
      published = await answered('GET', `configmaps/${configMap}`, undefined, [200]);
    else {
      published = posted;
      made.push('ConfigMap');
    }
  }
  const named = published.body?.data?.kid;
  if (named !== jwk.kid) throw new Error(`${configMap} names key ${named}, but ${secret} holds ${jwk.kid}.`);
  return { kid: jwk.kid, made };
}

/** The cluster's API, by the pod's own short-lived token, trusting the cluster's CA alone. */
function clusterApi(credentials) {
  const namespace = readFileSync(join(credentials, 'namespace'), 'utf8').trim();
  const ca = readFileSync(join(credentials, 'ca.crt'));
  const host = process.env.KUBERNETES_SERVICE_HOST;
  const port = process.env.KUBERNETES_SERVICE_PORT_HTTPS;
  return (method, path, body) =>
    new Promise((resolve, reject) => {
      // Read each time: the kubelet rotates it.
      const token = readFileSync(join(credentials, 'token'), 'utf8').trim();
      const request = https.request(
        {
          host,
          port,
          method,
          path: `/api/v1/namespaces/${namespace}/${path}`,
          ca,
          headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/json',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
        },
        (response) => {
          let text = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => (text += chunk));
          response.on('end', () => {
            let parsed = null;
            try {
              parsed = text === '' ? null : JSON.parse(text);
            } catch {
              parsed = { message: text.slice(0, 200) };
            }
            resolve({ status: response.statusCode, body: parsed });
          });
        },
      );
      request.on('error', reject);
      request.end(body === undefined ? undefined : JSON.stringify(body));
    });
}

/** xcube's keygen, in a directory of its own on the pod's memory-backed volume. */
function xcubeKeygen(work, script) {
  return async (pem) => {
    const dir = mkdtempSync(join(work, 'key-'));
    const args = [script, join(dir, 'out')];
    if (pem !== undefined) {
      writeFileSync(join(dir, 'in.pem'), pem, { mode: 0o600 });
      args.push(join(dir, 'in.pem'));
    }
    const jwk = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8' }));
    return {
      jwk,
      pem: readFileSync(join(dir, 'out', `${jwk.kid}.pem`), 'utf8'),
      check: readFileSync(join(dir, 'out', `${jwk.kid}.check`), 'utf8'),
    };
  };
}

/**
 * Run, not imported. A ConfigMap volume mounts each key as a symlink, and node
 * resolves the main module's own path but not its argument: compared as real
 * paths, or the Job would end having done nothing (T455's review).
 */
const isMain = () => {
  try {
    return (
      process.argv[1] !== undefined &&
      realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
    );
  } catch {
    return false;
  }
};

if (isMain()) {
  const { SECRET, CONFIG_MAP, CREDENTIALS, WORK, KEYGEN } = process.env;
  Promise.resolve()
    .then(() =>
      reconcile({
        api: clusterApi(CREDENTIALS),
        keygen: xcubeKeygen(WORK, KEYGEN),
        secret: SECRET,
        configMap: CONFIG_MAP,
      }),
    )
    .then(
      ({ kid, made }) =>
        console.log(
          `xcube's credential key ${kid}: ${made.length === 0 ? 'already there' : `made ${made.join(' and ')}`}`,
        ),
      (error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      },
    );
}
