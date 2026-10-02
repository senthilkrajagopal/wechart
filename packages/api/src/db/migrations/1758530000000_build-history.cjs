/**
 * Builds wechart starts through Cube's jobs API, kept in wechart (T372,
 * AC-150): one record per start (design 16's Q6), and one row per job Cube
 * made for it, a partition's, with each state Cube reported and when wechart
 * saw it. Cube keeps a job's record about a day (research
 * cube/job-records.md, "Retention"); these outlast it, the latest 100 of
 * each pre-aggregation.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('build_runs', {
    id: { type: 'text', primaryKey: true },
    // Its published name, `cube.pre_aggregation`, as the jobs API names it.
    pre_aggregation: { type: 'text', notNull: true },
    // Its cube's folder, wechart's id (T371); none for a folder wechart no longer knows.
    folder_id: { type: 'text' },
    // The partitions asked for, by their starts; none for every partition.
    partitions: { type: 'jsonb' },
    // How its pre-aggregation was partitioned then; none when it wasn't.
    partition_granularity: { type: 'text' },
    // How it was started: Build all (or now), Rebuild selected, a schedule's run.
    via: { type: 'text', notNull: true },
    // Who started it: a person, or a wechart schedule.
    starter_kind: { type: 'text', notNull: true },
    starter_key: { type: 'text' },
    starter_name: { type: 'text' },
    schedule_id: { type: 'text' },
    schedule_name: { type: 'text' },
    // The `x-request-id` its post carried, which xcube's queue gives back.
    request_id: { type: 'text', notNull: true },
    // When wechart asked Cube, and when Cube answered with the jobs.
    started_at: { type: 'timestamptz', notNull: true },
    answered_at: { type: 'timestamptz', notNull: true },
    // When wechart saw its last job end; none when how it ended isn't known.
    ended_at: { type: 'timestamptz' },
    // done, failed or expired (Cube's record gone first); none while open.
    outcome: { type: 'text' },
    failed_count: { type: 'integer' },
    error: { type: 'text' },
  });
  // Newest first per pre-aggregation: the cap, and Run history.
  pgm.createIndex('build_runs', ['pre_aggregation', 'started_at', 'id'], {
    name: 'build_runs_by_preagg',
  });
  pgm.createIndex('build_runs', ['started_at', 'id'], { name: 'build_runs_by_time' });
  // The builds still open: each round closes those whose jobs have all ended.
  pgm.createIndex('build_runs', ['id'], { name: 'build_runs_open', where: 'outcome IS NULL' });

  pgm.createTable('build_tokens', {
    run_id: { type: 'text', notNull: true, references: 'build_runs', onDelete: 'CASCADE' },
    token: { type: 'text', notNull: true },
    // In the order Cube gave them.
    position: { type: 'integer', notNull: true },
    // The last state Cube reported, and its table.
    status: { type: 'text' },
    target_table: { type: 'text' },
    finished: { type: 'boolean', notNull: true, default: false },
    finished_at: { type: 'timestamptz' },
    // Each state Cube reported, with when wechart saw it.
    log: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
    // Held by one follower until then (AC-319): no two ask Cube for it at once.
    lease_until: { type: 'timestamptz' },
  });
  pgm.addConstraint('build_tokens', 'build_tokens_pkey', { primaryKey: ['run_id', 'token'] });
  pgm.createIndex('build_tokens', ['finished', 'lease_until'], {
    name: 'build_tokens_open',
    where: 'NOT finished',
  });
};

exports.down = (pgm) => {
  pgm.dropTable('build_tokens');
  pgm.dropTable('build_runs');
};
