import { nameKey, nameProblem } from '@wechart/core';
import { isMap, isSeq, parseDocument } from 'yaml';

/**
 * A generated cube's name, suggested in R72's grammar (T734, AC-249; R73):
 * `__` becomes `_`, and a reserved word or a leading digit gets a `t_`
 * prefix, so `user__events`, `class` and `2024_orders` are suggested as
 * `user_events`, `t_class` and `t_2024_orders`. Nothing else is changed: a
 * name R73 says nothing of keeps Cube's, and the model editor holds it
 * (T723), where the user edits it as any draft's name.
 */
export function suggestedName(name: string): string {
  const single = name.replace(/_{2,}/g, '_');
  // A reserved word: refused for a cube, taken for a data source, which is exempt.
  const reserved =
    nameProblem(single, 'cube') !== undefined && nameProblem(single, 'data-source') === undefined;
  return /^[0-9]/.test(single) || reserved ? `t_${single}` : single;
}

/** A cube as Cube's scaffold answers it (research `cube/introspection-api.md`). */
export interface ScaffoldAnswer {
  readonly cube: string;
  readonly fileName: string;
  readonly content: string;
}

/**
 * Each cube of a scaffold's batch under its suggested name: its file named
 * for it, and every join in the batch that targets it renamed with it, its
 * `{name}` and `{name.member}` references too. Cube's scaffold names joins by
 * their target cube and writes them only between the batch's own tables
 * ("Generation rules": "The file name and every join in the batch use the
 * chosen name"; "A renamed cube needs the joins that target it in the batch
 * rewritten"). The rest of each file is as Cube wrote it.
 */
export function withSuggestedNames<T extends ScaffoldAnswer>(cubes: readonly T[]): T[] {
  const changing = cubes.filter((each) => suggestedName(each.cube) !== each.cube);
  if (changing.length === 0) return [...cubes];
  /**
   * Never another cube's name in the batch, in any case (T734's review): a
   * suggestion the batch holds is numbered as Cube's scaffold numbers a name
   * the batch has, `_2`, `_3`… (research, "Generation rules").
   */
  const taken = new Set(
    cubes.filter((each) => !changing.includes(each)).map((each) => nameKey(each.cube)),
  );
  const renamed = new Map<string, string>();
  for (const each of changing) {
    const base = suggestedName(each.cube);
    let to = base;
    for (let n = 2; taken.has(nameKey(to)); n += 1) to = `${base}_${String(n)}`;
    taken.add(nameKey(to));
    renamed.set(each.cube, to);
  }
  return cubes.map((each) => {
    const to = renamed.get(each.cube) ?? each.cube;
    const document = parseDocument(each.content);
    // One the YAML library can't read keeps Cube's text (T734's review; research `yaml.md`).
    if (document.errors.length > 0)
      return { ...each, cube: to, fileName: to === each.cube ? each.fileName : `${to}.yml` };
    let changed = false;
    const list = document.get('cubes');
    if (isSeq(list))
      for (const item of list.items) {
        if (!isMap(item)) continue;
        const own = item.get('name');
        if (typeof own === 'string' && renamed.has(own)) {
          item.set('name', renamed.get(own));
          changed = true;
        }
        const joins = item.get('joins');
        if (!isSeq(joins)) continue;
        for (const join of joins.items) {
          if (!isMap(join)) continue;
          const target = join.get('name');
          const next = typeof target === 'string' ? renamed.get(target) : undefined;
          if (target === undefined || next === undefined) continue;
          join.set('name', next);
          const sql = join.get('sql');
          if (typeof sql === 'string')
            join.set(
              'sql',
              sql.replace(new RegExp(`\\{${String(target)}(?=[.}])`, 'g'), `{${next}`),
            );
          changed = true;
        }
      }
    return {
      ...each,
      cube: to,
      fileName: to === each.cube ? each.fileName : `${to}.yml`,
      // Cube's lines kept: none folded, its flow maps unpadded (research `yaml.md`).
      content: changed
        ? document.toString({ lineWidth: 0, flowCollectionPadding: false })
        : each.content,
    };
  });
}
