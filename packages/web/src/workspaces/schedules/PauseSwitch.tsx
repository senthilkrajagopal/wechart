import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { StateLine } from '../../shell/StatusIcon';
import { setSchedulePaused, WECHART_SCHEDULES_KEY, type WechartSchedule } from './wechart';

/**
 * A wechart schedule's On switch (T556, AC-396; design 16, P3), on its row
 * and in its pane: off pauses it, so it starts none of its runs; on resumes
 * it from its first time after now. A press on its row doesn't open the
 * pane. The page reads the schedules again, so its row and pane say what
 * it now is.
 */
export function PauseSwitch({ schedule }: { schedule: WechartSchedule }) {
  const client = useQueryClient();
  /** What the switch was just set to, until the API has answered: it never flicks back. */
  const [asked, setAsked] = useState<boolean | null>(null);
  const toggle = useMutation({
    mutationFn: (pause: boolean) => setSchedulePaused(schedule.id, pause),
    // Shown as the API answered at once, never flicking back while the list is read again.
    onSuccess: (now) => {
      client.setQueryData<WechartSchedule[]>(WECHART_SCHEDULES_KEY, (was) =>
        was?.map((each) => (each.id === now.id ? now : each)),
      );
    },
    onSettled: () => {
      setAsked(null);
      void client.invalidateQueries({ queryKey: WECHART_SCHEDULES_KEY });
    },
  });
  const on = schedule.pausedAt === null;
  return (
    <span className="schedules__on">
      <input
        type="checkbox"
        role="switch"
        className="switch"
        aria-label={`On: ${schedule.name}`}
        checked={asked ?? on}
        disabled={toggle.isPending}
        onClick={(event) => {
          // Not the row's: the pane stays as it is.
          event.stopPropagation();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
        }}
        onChange={(event) => {
          setAsked(event.target.checked);
          toggle.mutate(!event.target.checked);
        }}
      />
      {toggle.isError ? <StateLine kind="err">{toggle.error.message}</StateLine> : null}
    </span>
  );
}
