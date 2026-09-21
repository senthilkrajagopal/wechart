import { useQuery } from '@tanstack/react-query';

import { META_QUERY } from '../query/meta';
import { allMembers } from './FilterBar';

/**
 * On a tile a filter in effect cannot reach (AC-079): the tile is left
 * unfiltered, and says so rather than pass for filtered. Each field is named
 * as the filter bar names it, by its title in the model.
 */
export function NotCovered({ members }: { members: readonly string[] }) {
  const meta = useQuery(META_QUERY);
  const all = allMembers(meta.data);
  const names = members.map((name) => all.find((member) => member.name === name)?.title ?? name);
  return (
    <p
      className="tile-not-covered"
      data-testid="not-covered"
      title="This chart's cube or view has no path to that field in the model, so the filter cannot apply to it."
    >
      Not filtered by {names.join(', ')}
    </p>
  );
}
