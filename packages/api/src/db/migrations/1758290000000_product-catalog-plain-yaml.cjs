/**
 * The seed's product catalogue as plain YAML (T446, AC-335). It was a Jinja
 * template, which xcube never serves, so its cube would be missing once xcube
 * serves the model. Seeding writes no path a store already holds, so a store
 * seeded before is rewritten here — only where it still holds the seed's own
 * text, never over a change made in wechart. Dollar-quoted: the Jinja's braces
 * are text, and `pgm.sql` given no arguments substitutes nothing.
 */

exports.shorthands = undefined;

const PATH = 'cubes/product_catalog.yml';

const TEMPLATE = `# A dynamic model: Cube renders the Jinja below before it reads the YAML.
# wechart shows such a file read-only, with the reason (AC-140), and publishes
# none (T142): a template runs inside Cube.
{%- set table = "public.products" %}
cubes:
  - name: product_catalog
    sql_table: {{ table }}

    measures:
      - name: count
        type: count
`;

const PLAIN = `# The product catalogue, in plain YAML: the only kind xcube serves (T446,
# AC-335). \`templated_example.yml\` is the seed's Jinja template now (AC-140).
cubes:
  - name: product_catalog
    sql_table: public.products

    measures:
      - name: count
        type: count
`;

const rewrite = (from, to) =>
  `UPDATE model_files SET content = $plain$${to}$plain$, updated_at = now()
   WHERE path = '${PATH}' AND content = $plain$${from}$plain$`;

exports.up = (pgm) => {
  pgm.sql(rewrite(TEMPLATE, PLAIN));
};

exports.down = (pgm) => {
  pgm.sql(rewrite(PLAIN, TEMPLATE));
};
