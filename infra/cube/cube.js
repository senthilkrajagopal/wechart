// Cube's configuration (T142, T143): the model is read from wechart's model
// store, through `repositoryFactory`, and a publish is picked up through
// `schemaVersion`, with no restart (docs/research/cube/data-modeling.md §16;
// docs/research/cube/spike-model-store-and-quick-calcs.md).
//
// Which store is named by the request's security context, which only
// wechart can sign (it alone holds CUBEJS_API_SECRET), and must be one this
// Cube is told to trust (WECHART_MODEL_STORES). A request that names none —
// or a store not on the list — reads the model directory mounted here, as
// Cube did before this file.
//
// A context that also names a draft compiles that draft under an app id of
// its own, so wechart can ask Cube whether a model compiles before it
// publishes it, and the live model goes on answering meanwhile.

const fs = require('node:fs');
const path = require('node:path');

const MODEL_DIR = path.join(__dirname, 'model');
/** The kinds of file Cube's own FileRepository reads. */
const MODEL_FILE = /\.(js|ya?ml|jinja|py)$/;
const STORES = (process.env.WECHART_MODEL_STORES || '')
  .split(',')
  .map((store) => store.trim().replace(/\/$/, ''))
  .filter(Boolean);
const KEY = process.env.WECHART_MODEL_KEY || '';

const storeOf = (context) => {
  const store = context && context.securityContext && context.securityContext.wechartStore;
  return typeof store === 'string' && STORES.includes(store) ? store : undefined;
};

const draftOf = (context) => {
  const draft = context && context.securityContext && context.securityContext.wechartDraft;
  return typeof draft === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(draft) ? draft : undefined;
};

async function fromStore(store, route) {
  const response = await fetch(`${store}/api/cube-model/${route}`, {
    headers: { 'x-wechart-model-key': KEY },
  });
  if (!response.ok)
    throw new Error(`wechart's model store answered ${response.status} to ${route}`);
  return response.json();
}

/** The model directory, read as Cube's FileRepository reads it. */
function fromDisk(dir = MODEL_DIR, under = '') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    const fileName = under === '' ? name : `${under}/${name}`;
    if (fs.statSync(full).isDirectory()) return fromDisk(full, fileName);
    return MODEL_FILE.test(name) ? [{ fileName, content: fs.readFileSync(full, 'utf8') }] : [];
  });
}

/**
 * `schemaVersion` runs on every request (the spike counted 17 calls to 2
 * file reads), and the store is asked each time: a version kept here, even
 * for a second, is a publish Cube doesn't see yet — and wechart, asking at
 * once, would cache the old model for its minute (T143, AC-137).
 */
async function versionOf(store) {
  const { version } = await fromStore(store, 'version');
  return version;
}

const slug = (text) => text.replace(/[^A-Za-z0-9]+/g, '_');

module.exports = {
  // Each draft is a compiled model Cube keeps, "single-digit MBs to dozens of
  // MBs" apiece, in an LRU of 250 with no expiry by default: an idle one goes
  // after ten minutes, and one in use stays, its time reset on each use
  // (docs/research/cube/configuration-deployment.md, "Data model").
  maxCompilerCacheKeepAlive: 10 * 60 * 1000,
  updateCompilerCacheKeepAlive: true,

  contextToAppId: (context) => {
    const store = storeOf(context);
    if (store === undefined) return 'CUBE_APP_disk';
    const draft = draftOf(context);
    return `CUBE_APP_${slug(store)}${draft === undefined ? '' : `_draft_${slug(draft)}`}`;
  },

  repositoryFactory: (context) => {
    const store = storeOf(context);
    const draft = draftOf(context);
    return {
      localPath: () => MODEL_DIR,
      dataSchemaFiles: async () => {
        if (store === undefined) return fromDisk();
        const { files } = await fromStore(store, draft === undefined ? 'files' : `drafts/${draft}`);
        return files;
      },
    };
  },

  schemaVersion: async (context) => {
    const store = storeOf(context);
    if (store === undefined) return 'disk';
    const draft = draftOf(context);
    return draft === undefined ? versionOf(store) : `draft_${draft}`;
  },

  // wechart alone signs Cube's tokens (it alone holds CUBEJS_API_SECRET), and
  // asks Cube to build pre-aggregations through the jobs API (T155, AC-149) —
  // which answers 403 "API scope is missing: jobs" without this scope. The
  // defaults are kept (docs/research/cube/refresh-jobs-caching.md, "Auth and
  // scope"; `contextToApiScopes`). Not for a draft's token: a draft is compiled
  // to be checked, never built — kept so by Cube as well as by wechart (T155's
  // review).
  contextToApiScopes: async (securityContext, defaultScopes) =>
    securityContext && securityContext.wechartDraft !== undefined
      ? defaultScopes
      : [...defaultScopes, 'jobs'],

  // What the refresh worker builds rollups for: the mounted model, and each
  // trusted store's — the model Cube answers wechart from. Without this the
  // worker's security context is undefined and it builds the mounted model
  // alone, so a rollup published to a store would never be built
  // (docs/research/cube/refresh-jobs-caching.md, `scheduledRefreshContexts`).
  // Drafts are never built: they are compiled to be checked, not served.
  scheduledRefreshContexts: async () => [
    { securityContext: {} },
    ...STORES.map((store) => ({ securityContext: { wechartStore: store } })),
  ],
};
