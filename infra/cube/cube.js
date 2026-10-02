// Cube's configuration (T447, AC-333, AC-334): xcube's. xcube serves each of
// wechart's models from its own schema in the metadata database, where each
// wechart API pushes its published files; every Cube process compiles a
// revision before switching to it and pins each request to one
// (docs/research/xcube-slice-2.md, "cube.js"). Cube never calls wechart.
//
// A token names its model with `wechartModel`, and the oldest revision it may
// be answered from with `wechartRevision`. Only wechart signs tokens: RS256
// under keys it pushes to xcube (T437, AC-326), and a model with keys takes
// no other (research xcube-slice-4.md, "HS256 during and after the cutover").
//
// xcube owns `contextToAppId`, `repositoryFactory` and `schemaVersion`, and
// its `config()` throws on them; the refresh worker builds every model active
// on it by default. The compiler-cache TTL isn't enforced under xcube, so it
// isn't set (research, Gotcha 12).
//
// The groups access policies match against are xcube's own `contextToGroups`:
// the context's `groups`, each a string, less xcube's reserved group
// (research xcube-slice-4.md, "cube.js"). An RS256 context carries its model,
// its groups, its revision and its role, and nothing else.

module.exports = require('xcube').config(
  // A workspace's or proposal's previews name their overlay in
  // `wechartOverlay`; xcube's default claim is `xcubeOverlay`, under which
  // every preview would answer from the published model (T347; research
  // xcube-slice-5.md, Gotcha 1). A token without it is served as before.
  { modelClaim: 'wechartModel', revisionClaim: 'wechartRevision', overlayClaim: 'wechartOverlay' },
  {
    // The defaults, and `jobs` for a model that takes HS256 tokens still,
    // until its first key push (T155, AC-149; docs/research/cube/
    // refresh-jobs-caching.md, "Auth and scope"). xcube takes `jobs`,
    // `introspection` and `graphql` from a verified user's token whatever
    // this says, and gives wechart's service credential `jobs` and
    // `introspection` alone (research xcube-slice-4.md, "Scopes by role").
    //
    // `introspection`, which reads the warehouse's whole catalog (T275,
    // AC-250), goes to no context here, and the defaults never carry it,
    // though CUBEJS_DEFAULT_API_SCOPES is an unchecked list: only the service
    // credential browses a data source. T420's `wechartIntrospection` claim
    // is retired with HS256 (T437).
    contextToApiScopes: async (_securityContext, defaultScopes) => [
      ...defaultScopes.filter((scope) => scope !== 'introspection'),
      'jobs',
    ],

    // The integration plan's queue heartbeat, 5–10 s (T423, AC-319): a query
    // an instance was running when it stopped is let go after four missed
    // heartbeats, and runs again through another. At Cube's default of 30 s
    // that took 127.6 s, at 5 s 29.0 s; the price is that a pause of over
    // 20 s (an event-loop stall, a Cube Store hiccup) cancels a live query
    // (docs/research/cube/ha-topology.md §1, "Tuning"). Every other queue
    // setting keeps its default. xcube passes this through (research
    // xcube-slice-2.md, "Passed through").
    orchestratorOptions: {
      queryCacheOptions: { queueOptions: { heartBeatInterval: 5 } },
      preAggregationsOptions: { queueOptions: { heartBeatInterval: 5 } },
    },
  },
);
