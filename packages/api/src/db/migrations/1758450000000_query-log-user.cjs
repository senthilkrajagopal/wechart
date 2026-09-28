/**
 * Who ran each query (R42.6, T371): a read-write member sees their own query
 * records in Jobs, a Super-Admin everyone's. Records from before have none,
 * and only a Super-Admin sees them.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('query_log', { user_key: { type: 'text' } });
  pgm.createIndex('query_log', ['user_key', 'created_at'], { name: 'query_log_by_user' });
};

exports.down = (pgm) => {
  pgm.dropIndex('query_log', ['user_key', 'created_at'], { name: 'query_log_by_user' });
  pgm.dropColumn('query_log', 'user_key');
};
