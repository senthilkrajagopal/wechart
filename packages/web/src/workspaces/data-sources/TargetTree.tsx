import { useId, useRef, type KeyboardEvent } from 'react';

import type { Target } from '../explore/NewItemDialog';
import { SHARED_ROOT } from '../explore/roots';

/**
 * The shared folders a workspace item may go to, as a tree (T471; design 01,
 * state G; AC-282): each by its name under its parent, the one chosen
 * selected. A folder on a target's path that the user can't write to is shown
 * for where it is, and can't be chosen.
 */
interface Node {
  readonly key: string;
  readonly name: string;
  readonly level: number;
  /** The target it is, where it is one. */
  readonly id?: string;
}

/** Two paths in a tree's order: folder by folder, a parent before what it holds. */
function byPath(a: readonly string[], b: readonly string[]): number {
  for (let at = 0; at < Math.min(a.length, b.length); at += 1) {
    const order = a[at]!.localeCompare(b[at]!);
    if (order !== 0) return order;
  }
  return a.length - b.length;
}

function nodesOf(targets: readonly Target[]): Node[] {
  // The shared root, where it is a target, holds the others (T471's review).
  const underRoot = targets.some((target) => target.path.length === 0) ? 1 : 0;
  const nodes: (Node & { path: readonly string[] })[] = [];
  const ancestors = new Set<string>();
  for (const target of targets) {
    // Each target by its id: two folders of one title stay two.
    nodes.push({
      key: `id:${target.id}`,
      name: target.path.at(-1) ?? SHARED_ROOT.title,
      level: target.path.length + underRoot || 1,
      id: target.id,
      path: target.path,
    });
    // A folder on its path it can't be written to, shown for where it is.
    target.path.slice(0, -1).forEach((name, at) => {
      const path = target.path.slice(0, at + 1);
      const key = `path:${JSON.stringify(path)}`;
      const isTarget = targets.some(
        (other) => other.path.length === path.length && byPath(other.path, path) === 0,
      );
      if (isTarget || ancestors.has(key)) return;
      ancestors.add(key);
      nodes.push({ key, name, level: path.length + underRoot, path });
    });
  }
  return nodes
    .sort((a, b) => byPath(a.path, b.path) || (a.id ?? '').localeCompare(b.id ?? ''))
    .map(({ key, name, level, id }) =>
      id === undefined ? { key, name, level } : { key, name, level, id },
    );
}

export function TargetTree({
  targets,
  chosen,
  onChoose,
  describedBy,
}: {
  targets: readonly Target[];
  chosen: string;
  onChoose: (id: string) => void;
  describedBy?: string;
}) {
  const nodes = nodesOf(targets);
  const choosable = nodes.filter((node) => node.id !== undefined);
  /**
   * One tab stop: the folder chosen, or the first that can be while none of
   * them is, a choice the targets no longer hold included (T639: after a
   * refetch it left the tree with none).
   */
  const chosenShown = choosable.some((node) => node.id === chosen);
  const labelId = useId();
  const tree = useRef<HTMLUListElement>(null);

  /** The arrows move the choice among the folders that can be chosen, focus with it. */
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>, id: string) => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const at = choosable.findIndex((node) => node.id === id);
    const next = choosable[Math.min(Math.max(at + step, 0), choosable.length - 1)];
    if (next?.id === undefined) return;
    onChoose(next.id);
    tree.current?.querySelector<HTMLElement>(`[data-target="${CSS.escape(next.id)}"]`)?.focus();
  };

  return (
    <div className="field">
      <span id={labelId} className="field__label">
        <span>Target folder</span>
        <span className="field__req"> · required</span>
      </span>
      <ul
        ref={tree}
        role="tree"
        aria-label="Target folder"
        aria-describedby={describedBy}
        className="target-tree"
      >
        {nodes.map((node) => {
          const selected = node.id !== undefined && node.id === chosen;
          const focusable =
            node.id !== undefined && (selected || (!chosenShown && node === choosable[0]));
          return (
            <li
              key={node.key}
              role="treeitem"
              aria-level={node.level}
              aria-selected={node.id === undefined ? undefined : selected}
              aria-disabled={node.id === undefined ? true : undefined}
              data-target={node.id}
              tabIndex={focusable ? 0 : -1}
              className="target-tree__item"
              style={{ paddingLeft: `${String(8 + (node.level - 1) * 20)}px` }}
              onClick={() => {
                if (node.id !== undefined) onChoose(node.id);
              }}
              onKeyDown={(event) => {
                if (node.id === undefined) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onChoose(node.id);
                } else onKeyDown(event, node.id);
              }}
            >
              <span className="target-tree__icon" aria-hidden="true" />
              {node.name}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
