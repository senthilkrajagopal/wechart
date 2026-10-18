/**
 * The pages of an MCP tool's result too large to give whole (T784, AC-475):
 * each the page a cursor names, built when the call was answered, so
 * following the cursors gives every row once, whichever replica answers.
 * A cursor works for the token whose call it was, and goes with the token.
 * Old ones are removed by `made_at`.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('mcp_result_pages', {
    id: { type: 'uuid', primaryKey: true },
    token_id: {
      type: 'uuid',
      notNull: true,
      references: 'personal_access_tokens',
      onDelete: 'CASCADE',
    },
    made_at: { type: 'timestamptz(3)', notNull: true, default: pgm.func('now()') },
    pages: { type: 'jsonb', notNull: true },
  });
  pgm.createIndex('mcp_result_pages', 'made_at');
  pgm.createIndex('mcp_result_pages', 'token_id');
};

exports.down = (pgm) => {
  pgm.dropTable('mcp_result_pages');
};
