import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';

import { META_QUERY } from '../query/meta';
import { StatusIcon } from '../shell/StatusIcon';
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
  const why = useId();
  return (
    <>
      <p className="tile-not-covered" data-testid="not-covered" aria-describedby={why}>
        {/* A state of the tile, so with an icon (T183, AC-177): information's,
            not an error's. */}
        <StatusIcon kind="idle" />
        Not filtered by {names.join(', ')}
      </p>
      {/* Why, in words on the tile (T182, AC-176): it was a tooltip, which
          only a pointer reaches, on a note that takes no focus. */}
      <p id={why} className="tile-not-covered__why">
        Its cube or view has no path to that field in the model.
      </p>
    </>
  );
}
