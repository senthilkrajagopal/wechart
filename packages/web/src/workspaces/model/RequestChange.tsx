import { useState } from 'react';

import { requestCalculation } from '../../editor/calcRequests';
import { RequestCalcDialog } from '../../editor/RequestCalcDialog';

/**
 * "Request a change" on a use-only copy's page (T717, AC-283; R73): the copy
 * is proposed to no folder, so a change to the shared cube is asked of the
 * folder whose model defines it, as a calculation request (AC-050) for its
 * cube with no chart.
 */
export function RequestChange({
  cube,
  cubeTitle,
  fetchImpl = fetch,
}: {
  /** The cube or view, by name. */
  readonly cube: string;
  readonly cubeTitle: string;
  readonly fetchImpl?: typeof fetch;
}) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn-sm"
        onClick={() => {
          setAsking(true);
        }}
      >
        Request a change
      </button>
      {asking ? (
        <RequestCalcDialog
          cubeTitle={cubeTitle}
          onSend={async (description) => {
            await requestCalculation({ cube, description }, fetchImpl);
          }}
          onClose={() => {
            setAsking(false);
          }}
        />
      ) : null}
    </>
  );
}
