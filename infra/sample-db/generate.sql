-- Tables to generate cubes from (T145, AC-139; T276, AC-249): a schema of
-- their own, so the flow's schema choice is exercised, and a pair per browser
-- project the suite runs — cube names are global to the model, and the
-- projects generate at the same time, so each generates its own.
--
-- In each pair, what Cube's scaffolding does with a column
-- (research/cube/introspection-api.md):
--   id               a key: a dimension, primary_key
--   name, city       strings: dimensions
--   opened_at        a time: a dimension
--   floor_area       a number not named like a measure: left unmapped
--   store_id         a foreign key: the join, and itself left unmapped
--   visitors         a number not named like a measure: left unmapped
--   spend_amount     named like a measure ("amount"): a sum
--   _loaded_at       an underscore prefix: left unmapped
CREATE SCHEMA generate;

DO $$
DECLARE
  project text;
BEGIN
  FOREACH project IN ARRAY ARRAY['chrome', 'firefox', 'safari', 'edge'] LOOP
    EXECUTE format(
      'CREATE TABLE generate.%1$I (
         id          integer PRIMARY KEY,
         name        text NOT NULL,
         city        text NOT NULL,
         opened_at   timestamptz NOT NULL,
         floor_area  numeric(8, 1) NOT NULL
       )',
      project || '_stores');
    EXECUTE format(
      'CREATE TABLE generate.%1$I (
         id            integer PRIMARY KEY,
         store_id      integer NOT NULL REFERENCES generate.%2$I (id),
         visitors      integer NOT NULL,
         spend_amount  numeric(10, 2) NOT NULL,
         visited_at    timestamptz NOT NULL,
         _loaded_at    timestamptz NOT NULL DEFAULT timestamptz ''2026-09-01T00:00:00Z''
       )',
      project || '_visits', project || '_stores');
    EXECUTE format(
      'INSERT INTO generate.%1$I (id, name, city, opened_at, floor_area) VALUES
         (1, ''Harbour'',  ''Lisbon'', ''2025-02-01T09:00:00Z'', 420.0),
         (2, ''Old Town'', ''Porto'',  ''2025-06-15T09:00:00Z'', 310.5),
         (3, ''Riverside'',''Lisbon'', ''2026-01-10T09:00:00Z'', 505.0)',
      project || '_stores');
    EXECUTE format(
      'INSERT INTO generate.%1$I (id, store_id, visitors, spend_amount, visited_at)
       SELECT n, 1 + (n %% 3), 10 * n, round((n * 12.5)::numeric, 2),
              timestamptz ''2026-03-01T00:00:00Z'' + (n || '' days'')::interval
       FROM generate_series(1, 30) AS n',
      project || '_visits');
  END LOOP;
END
$$;

-- What Cube's scaffold loses without saying so (research, "Silent losses";
-- T145's review), for wechart to say: generated, never published, so one
-- table serves every browser project.
--   at            a time-typed primary key: written as a key and as a time,
--                 and kept as the time alone
--   "Amount"      a member name another column's takes ("amount" follows it)
--   count         named like a measure: its sum takes the count's name
--   "Visit Count" quoted in the file as {CUBE}."Visit Count": a sum, read
CREATE TABLE generate.every_loss (
  at             timestamptz PRIMARY KEY,
  "Amount"       numeric(10, 2) NOT NULL,
  amount         numeric(10, 2) NOT NULL,
  count          integer NOT NULL,
  "Visit Count"  integer NOT NULL
);

-- R73 names (T734, AC-249): tables whose names break the grammar, for the
-- cubes Generate cubes suggests in it. "2026_orders" (a leading digit, as
-- t_2026_orders) joins "class" (a reserved word, as t_class), so the join's
-- rewrite is seen too. Generated and edited, never published, so one pair
-- serves every browser project. IF NOT EXISTS: the security suite's stack
-- preparation (e2e/security/prepare-stack.mjs) runs this block on a sample
-- database made before it, and never drops anything.
CREATE TABLE IF NOT EXISTS generate."class" (
  id    integer PRIMARY KEY,
  name  text NOT NULL
);
CREATE TABLE IF NOT EXISTS generate."2026_orders" (
  id        integer PRIMARY KEY,
  class_id  integer NOT NULL REFERENCES generate."class" (id),
  total     numeric(10, 2) NOT NULL
);
