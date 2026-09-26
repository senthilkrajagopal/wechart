// Cube's configuration (T447, AC-333, AC-334): xcube's. xcube serves each of
// wechart's models from its own schema in the metadata database, where each
// wechart API pushes its published files; every Cube process compiles a
// revision before switching to it and pins each request to one
// (docs/research/xcube-slice-2.md, "cube.js"). Cube never calls wechart.
//
// A token names its model with `wechartModel`, and the oldest revision it may
// be answered from with `wechartRevision`. Only wechart signs tokens (it
// alone holds CUBEJS_API_SECRET). A token naming no model reads the directory
// mounted here.
//
// xcube owns `contextToAppId`, `repositoryFactory` and `schemaVersion`, and
// its `config()` throws on them; the refresh worker builds every model active
// on it by default. The compiler-cache TTL isn't enforced under xcube, so it
// isn't set (research, Gotcha 12).

module.exports = require('xcube').config(
  { modelClaim: 'wechartModel', revisionClaim: 'wechartRevision' },
  {
    // The groups access policies match against: the security context's own
    // `groups`, each a string. Unset, every context's group set is empty, so
    // only `group: "*"` policies apply (docs/research/cube/access-control.md,
    // `contextToGroups`) — and a context preview (T172, AC-166) could show
    // nothing a group grants.
    contextToGroups: ({ securityContext }) =>
      securityContext && Array.isArray(securityContext.groups)
        ? securityContext.groups.filter((group) => typeof group === 'string')
        : [],

    // wechart asks Cube to build pre-aggregations through the jobs API (T155,
    // AC-149), which answers 403 "API scope is missing: jobs" without this
    // scope. The defaults are kept (docs/research/cube/refresh-jobs-caching.md,
    // "Auth and scope"; `contextToApiScopes`).
    //
    // `introspection` — the fork's data-source browsing and cube scaffolding
    // (T275, AC-250; docs/research/cube/introspection-api.md) — goes only to
    // the short-lived token wechart's API signs for it, which carries
    // `wechartIntrospection: true`: the scope reads the warehouse's whole
    // catalog. A previewed context can't claim it: the API strips every
    // `wechart…` claim from one. That token gets nothing else
    // — no model, no data — and the defaults never carry it, though
    // CUBEJS_DEFAULT_API_SCOPES is an unchecked list (research, "Two further
    // hardening steps"). xcube takes `introspection` out before Cube checks
    // the rest, and puts it back after (research xcube-slice-2.md, "Passed
    // through").
    contextToApiScopes: async (securityContext, defaultScopes) => {
      const defaults = defaultScopes.filter((scope) => scope !== 'introspection');
      if (securityContext && securityContext.wechartIntrospection === true)
        return ['introspection'];
      return [...defaults, 'jobs'];
    },
  },
);
