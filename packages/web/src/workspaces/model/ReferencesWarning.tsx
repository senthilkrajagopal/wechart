import { useEffect, useRef } from 'react';

/**
 * The charts and dashboards using members a save changes, listed before it
 * goes to Cube (T147, AC-141), each a link to where it is, with the members
 * it uses — and the save made only if the user says so.
 */
export interface MemberReferences {
  readonly charts: readonly {
    id: string;
    title: string | null;
    dashboardId: string | null;
    members: readonly string[];
  }[];
  readonly dashboards: readonly {
    id: string;
    title: string | null;
    members: readonly string[];
    through: readonly string[];
  }[];
}

const count = (n: number, one: string) => `${String(n)} ${one}${n === 1 ? '' : 's'}`;

export function ReferencesWarning({
  found,
  onSave,
  onCancel,
}: {
  found: MemberReferences;
  onSave: () => void;
  onCancel: () => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  // On the choice that changes nothing, and in view.
  useEffect(() => {
    const element = bar.current;
    if (element !== null && typeof element.scrollIntoView === 'function')
      element.scrollIntoView({ block: 'nearest' });
    cancel.current?.focus();
  }, []);
  const { charts, dashboards } = found;
  return (
    <div ref={bar} className="model-editor__warnbar model-references" role="alert">
      <div className="model-editor__warnbar-text">
        <p className="model-references__lead">
          This save changes members that {count(charts.length, 'chart')} and{' '}
          {count(dashboards.length, 'dashboard')} use.
        </p>
        {charts.length === 0 ? null : (
          <>
            <h3 className="model-references__head">Charts</h3>
            <ul aria-label="Charts" className="model-references__list">
              {charts.map((chart) => (
                <li key={chart.id}>
                  {/* A chart kept on its dashboard opens there. */}
                  <a
                    href={
                      chart.dashboardId === null
                        ? `/explore/charts/${encodeURIComponent(chart.id)}`
                        : `/explore/dashboards/${encodeURIComponent(chart.dashboardId)}`
                    }
                  >
                    {chart.title ?? chart.id}
                  </a>{' '}
                  <span className="model-references__members">{chart.members.join(', ')}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {dashboards.length === 0 ? null : (
          <>
            <h3 className="model-references__head">Dashboards</h3>
            <ul aria-label="Dashboards" className="model-references__list">
              {dashboards.map((dashboard) => (
                <li key={dashboard.id}>
                  <a href={`/explore/dashboards/${encodeURIComponent(dashboard.id)}`}>
                    {dashboard.title ?? dashboard.id}
                  </a>{' '}
                  <span className="model-references__members">{dashboard.members.join(', ')}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <button type="button" className="btn-sm btn-primary" onClick={onSave}>
        Save anyway
      </button>
      <button ref={cancel} type="button" className="btn-sm" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
