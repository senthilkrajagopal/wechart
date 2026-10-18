/**
 * A cut MCP answer's pages kept as JSON text, not `jsonb` (T784's review):
 * `jsonb` refuses a NUL (`\u0000`) and a lone surrogate, which rows read
 * from a data source can hold, so such an answer could never be paged.
 * Text holds `JSON.stringify`'s escapes as they are.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.alterColumn('mcp_result_pages', 'pages', { type: 'text', using: 'pages::text' });
};

exports.down = (pgm) => {
  pgm.alterColumn('mcp_result_pages', 'pages', { type: 'jsonb', using: 'pages::jsonb' });
};
