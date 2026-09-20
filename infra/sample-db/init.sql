-- A small sample warehouse for local development and the browser tests.
-- Deliberately tiny: it exists so the semantic model has something real to
-- describe, not to be representative of production volumes.

CREATE TABLE customers (
  id            integer PRIMARY KEY,
  name          text NOT NULL,
  country       text NOT NULL,
  signed_up_at  timestamptz NOT NULL
);

CREATE TABLE products (
  id        integer PRIMARY KEY,
  name      text NOT NULL,
  category  text NOT NULL
);

CREATE TABLE orders (
  id           integer PRIMARY KEY,
  customer_id  integer NOT NULL REFERENCES customers (id),
  product_id   integer NOT NULL REFERENCES products (id),
  status       text NOT NULL,
  amount       numeric(10, 2) NOT NULL,
  ordered_at   timestamptz NOT NULL
);

INSERT INTO customers (id, name, country, signed_up_at) VALUES
  (1, 'Acme Industrial',   'Germany',       '2024-03-01T10:00:00Z'),
  (2, 'Bellweather Foods', 'France',        '2024-05-17T10:00:00Z'),
  (3, 'Cormorant Labs',    'United States', '2025-01-09T10:00:00Z'),
  (4, 'Dunlin Systems',    'United Kingdom','2025-06-22T10:00:00Z');

INSERT INTO products (id, name, category) VALUES
  (1, 'Cable, 2m',     'Components'),
  (2, 'Sensor array',  'Instruments'),
  (3, 'Control unit',  'Instruments'),
  (4, 'Mounting kit',  'Components');

INSERT INTO orders (id, customer_id, product_id, status, amount, ordered_at)
SELECT
  n,
  1 + (n % 4),
  1 + (n % 4),
  (ARRAY['completed', 'shipped', 'processing'])[1 + (n % 3)],
  round((50 + (n * 7.5))::numeric, 2),
  timestamptz '2026-01-01T00:00:00Z' + (n || ' days')::interval
FROM generate_series(1, 240) AS n;
