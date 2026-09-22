import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { JoinGraph } from './joinGraph';
import { JoinEditor } from './JoinEditor';

/**
 * T144 / AC-138: WHEN the user opens the join editor for a cube, THE SYSTEM
 * SHALL show the join graph with each relationship's direction and let the
 * user add a join by choosing the target cube, the relationship and the
 * condition.
 * Fails when: the diagram omits a declared join, or shows a direction the
 * model does not declare.
 */
const GRAPH: JoinGraph = {
  cubes: [
    { name: 'orders', path: 'cubes/orders.yml', dimensions: 2, measures: 1 },
    { name: 'customers', path: 'cubes/customers.yml', dimensions: 0, measures: 1 },
    { name: 'products', path: 'cubes/products.yml', dimensions: 3, measures: 1 },
  ],
  joins: [
    { from: 'orders', to: 'customers', relationship: 'many_to_one' },
    { from: 'customers', to: 'returns', relationship: 'one_to_many' },
  ],
  missing: ['returns'],
};

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** A box's edges, from the SVG rect drawn for it. */
function boxOf(diagram: Element, cube: string): Box {
  const rect = diagram.querySelector(`[data-cube="${cube}"] rect`) as SVGRectElement;
  const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((key) =>
    Number(rect.getAttribute(key)),
  ) as [number, number, number, number];
  return { left: x, right: x + width, top: y, bottom: y + height };
}

/** A join's path: where it starts, bends and ends (`M x y Q cx cy x y`). */
function pathOf(diagram: Element, join: string) {
  const d =
    diagram.querySelector(`[data-join="${join}"] .join-editor__edge`)?.getAttribute('d') ?? '';
  const [sx, sy, cx, cy, ex, ey] = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number) as number[];
  return {
    start: { x: sx ?? NaN, y: sy ?? NaN },
    bend: { x: cx ?? NaN, y: cy ?? NaN },
    end: { x: ex ?? NaN, y: ey ?? NaN },
  };
}

const on = (point: { x: number; y: number }, box: Box) =>
  point.x >= box.left - 1 &&
  point.x <= box.right + 1 &&
  point.y >= box.top - 1 &&
  point.y <= box.bottom + 1;

const overlap = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('the join editor', () => {
  it('draws every cube, the one it is for marked, with what each holds', () => {
    render(<JoinEditor graph={GRAPH} cube="orders" cubes={['orders']} onAdd={vi.fn()} />);

    const diagram = screen.getByRole('img', { name: /^Join diagram/ });
    for (const cube of ['orders', 'customers', 'products', 'returns'])
      expect(diagram.querySelector(`[data-cube="${cube}"]`)).not.toBeNull();
    expect(diagram.querySelector('[data-cube="orders"]')?.getAttribute('data-current')).toBe(
      'true',
    );
    expect(diagram.querySelector('[data-cube="orders"]')?.textContent).toContain(
      '2 dims · 1 measures',
    );
    // A cube a join names that no plain YAML file defines: drawn, and said so.
    expect(diagram.querySelector('[data-cube="returns"]')?.getAttribute('data-missing')).toBe(
      'true',
    );
    expect(diagram.querySelector('[data-cube="returns"]')?.textContent).toContain(
      'not in plain YAML',
    );
    // A picture: nothing in it to tab to.
    expect(diagram.querySelectorAll('a, [tabindex]')).toHaveLength(0);
  });

  it('draws each declared join from the cube declaring it to the one it names, arrowed there', () => {
    render(<JoinEditor graph={GRAPH} cube="orders" cubes={['orders']} onAdd={vi.fn()} />);
    const diagram = screen.getByRole('img', { name: /^Join diagram/ });

    expect(
      [...diagram.querySelectorAll('[data-join]')].map((edge) => edge.getAttribute('data-join')),
    ).toEqual(['orders→customers', 'customers→returns']);
    for (const { from, to } of GRAPH.joins) {
      const path = pathOf(diagram, `${from}→${to}`);
      expect(on(path.start, boxOf(diagram, from))).toBe(true);
      expect(on(path.end, boxOf(diagram, to))).toBe(true);
      expect(
        diagram
          .querySelector(`[data-join="${from}→${to}"] .join-editor__edge`)
          ?.getAttribute('marker-end'),
      ).toBe('url(#join-arrow)');
    }
    expect(diagram.querySelector('[data-join="orders→customers"] text')?.textContent).toBe(
      'many to one',
    );
  });

  it('keeps two cubes joining each other apart: two paths, two labels, apart', () => {
    const both: JoinGraph = {
      cubes: GRAPH.cubes,
      joins: [
        { from: 'orders', to: 'customers', relationship: 'many_to_one' },
        { from: 'customers', to: 'orders', relationship: 'one_to_many' },
      ],
      missing: [],
    };
    render(<JoinEditor graph={both} cube="orders" cubes={['orders']} onAdd={vi.fn()} />);
    const diagram = screen.getByRole('img', { name: /^Join diagram/ });

    const there = pathOf(diagram, 'orders→customers');
    const back = pathOf(diagram, 'customers→orders');
    // They bend to opposite sides, so neither sits on the other.
    expect(Math.hypot(there.bend.x - back.bend.x, there.bend.y - back.bend.y)).toBeGreaterThan(20);
    const label = (join: string) => {
      const text = diagram.querySelector(`[data-join="${join}"] text`) as SVGTextElement;
      return { x: Number(text.getAttribute('x')), y: Number(text.getAttribute('y')) };
    };
    const [a, b] = [label('orders→customers'), label('customers→orders')];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(20);
  });

  it('never lays one box over another, however many cubes there are', () => {
    const many: JoinGraph = {
      cubes: Array.from({ length: 14 }, (_, index) => ({
        name: `cube_${String(index)}`,
        path: `cubes/cube_${String(index)}.yml`,
        dimensions: 1,
        measures: 1,
      })),
      joins: [],
      missing: [],
    };
    render(<JoinEditor graph={many} cube="cube_0" cubes={['cube_0']} onAdd={vi.fn()} />);
    const diagram = screen.getByRole('img', { name: /^Join diagram/ });

    const boxes = many.cubes.map((each) => boxOf(diagram, each.name));
    for (const [at, box] of boxes.entries())
      for (const other of boxes.slice(at + 1)) expect(overlap(box, other)).toBe(false);
  });

  it('draws a cube’s join to itself, as a loop on it', () => {
    const self: JoinGraph = {
      cubes: GRAPH.cubes,
      joins: [{ from: 'orders', to: 'orders', relationship: 'one_to_one' }],
      missing: [],
    };
    render(<JoinEditor graph={self} cube="orders" cubes={['orders']} onAdd={vi.fn()} />);
    const diagram = screen.getByRole('img', { name: /^Join diagram/ });

    const loop = diagram.querySelector('[data-join="orders→orders"] .join-editor__edge');
    expect(loop?.getAttribute('d')).toMatch(/^M .* C /);
    expect(diagram.querySelector('[data-join="orders→orders"] text')?.textContent).toBe(
      'one to one',
    );
  });

  it('says every join in words too, each cube with a file a link to it', () => {
    render(<JoinEditor graph={GRAPH} cube="orders" cubes={['orders']} onAdd={vi.fn()} />);

    const list = screen.getByRole('list', { name: 'Joins' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'orders → customers, many to one',
      'customers → returns, one to many (returns is in no plain YAML file)',
    ]);
    // The cube being edited isn't a link; the others with a file are.
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['customers', '/model/files/cubes%2Fcustomers.yml'],
      ['customers', '/model/files/cubes%2Fcustomers.yml'],
    ]);
  });

  it('adds a join by its target, relationship and condition, to targets not joined yet', async () => {
    const onAdd = vi.fn(() => true);
    render(<JoinEditor graph={GRAPH} cube="orders" cubes={['orders']} onAdd={onAdd} />);
    const form = screen.getByRole('form', { name: 'Add a join to orders' });

    const target = within(form).getByLabelText('Target cube', { exact: true });
    // Not orders itself, and not customers: at most one join per target (Y.5).
    expect([...target.querySelectorAll('option')].map((option) => option.value)).toEqual([
      '',
      'products',
    ]);
    await userEvent.selectOptions(target, 'products');
    await userEvent.selectOptions(
      within(form).getByLabelText('Relationship', { exact: true }),
      'many_to_one',
    );
    const condition = within(form).getByLabelText('Condition', { exact: true });
    await userEvent.type(condition, '{{CUBE}.product_id = {{products}.id');
    await userEvent.click(within(form).getByRole('button', { name: 'Add join' }));

    expect(onAdd).toHaveBeenCalledWith('orders', {
      name: 'products',
      relationship: 'many_to_one',
      sql: '{CUBE}.product_id = {products}.id',
    });
    // Gone in: the form is ready for the next.
    expect((condition as HTMLInputElement).value).toBe('');
  });

  it('keeps what was entered when the join did not go in', async () => {
    render(<JoinEditor graph={GRAPH} cube="orders" cubes={['orders']} onAdd={() => false} />);
    const form = screen.getByRole('form', { name: 'Add a join to orders' });

    await userEvent.selectOptions(
      within(form).getByLabelText('Target cube', { exact: true }),
      'products',
    );
    await userEvent.selectOptions(
      within(form).getByLabelText('Relationship', { exact: true }),
      'many_to_one',
    );
    await userEvent.type(within(form).getByLabelText('Condition', { exact: true }), 'x = y');
    await userEvent.click(within(form).getByRole('button', { name: 'Add join' }));

    expect(
      (within(form).getByLabelText('Condition', { exact: true }) as HTMLInputElement).value,
    ).toBe('x = y');
  });

  it('adds nothing without all three, or with a condition of spaces', async () => {
    const onAdd = vi.fn(() => true);
    render(<JoinEditor graph={GRAPH} cube="orders" cubes={['orders']} onAdd={onAdd} />);
    const form = screen.getByRole('form', { name: 'Add a join to orders' });
    const add = () => within(form).getByRole('button', { name: 'Add join' }) as HTMLButtonElement;

    expect(add().disabled).toBe(true);
    await userEvent.selectOptions(
      within(form).getByLabelText('Target cube', { exact: true }),
      'products',
    );
    await userEvent.selectOptions(
      within(form).getByLabelText('Relationship', { exact: true }),
      'many_to_one',
    );
    await userEvent.type(within(form).getByLabelText('Condition', { exact: true }), '   {Enter}');
    expect(add().disabled).toBe(true);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('takes no join while the page is read-only (AC-135)', () => {
    render(<JoinEditor graph={GRAPH} cube="orders" cubes={['orders']} onAdd={vi.fn()} readOnly />);
    const form = screen.getByRole('form', { name: 'Add a join to orders' });

    const controls = [
      ...form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
        'input, select, button',
      ),
    ];
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.filter((control) => !control.matches(':disabled'))).toEqual([]);
  });

  it('lets a join be added to any cube the file defines', async () => {
    const onAdd = vi.fn(() => true);
    render(<JoinEditor graph={GRAPH} cube="orders" cubes={['orders', 'products']} onAdd={onAdd} />);

    await userEvent.selectOptions(screen.getByLabelText('Joins for', { exact: true }), 'products');
    const form = screen.getByRole('form', { name: 'Add a join to products' });
    expect(
      screen
        .getByRole('img', { name: /^Join diagram/ })
        .querySelector('[data-cube="products"]')
        ?.getAttribute('data-current'),
    ).toBe('true');
    expect(
      [
        ...within(form).getByLabelText('Target cube', { exact: true }).querySelectorAll('option'),
      ].map((option) => option.value),
    ).toEqual(['', 'orders', 'customers']);
  });
});
