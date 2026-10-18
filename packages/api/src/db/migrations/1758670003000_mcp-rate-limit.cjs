/**
 * `/mcp`'s request counts (T779, AC-472, AC-473, AC-474): one row per key,
 * `tok:<token id>` or `ip:<address>`, holding its current fixed window, which
 * starts at the key's first hit (`mcp-deployment-and-tokens.md`, "Postgres
 * fixed-window counter", Variant A). Kept in the metadata database so every
 * API replica counts against the same number. Logged, not UNLOGGED, so a
 * crash or a failover to a standby doesn't reset every count (the lane's
 * call, overturnable). Old windows are removed by `window_start`.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('mcp_rate_limit', {
    key: { type: 'text', primaryKey: true },
    window_start: { type: 'timestamptz', notNull: true },
    hits: { type: 'integer', notNull: true },
  });
  pgm.createIndex('mcp_rate_limit', 'window_start');
};

exports.down = (pgm) => {
  pgm.dropTable('mcp_rate_limit');
};
