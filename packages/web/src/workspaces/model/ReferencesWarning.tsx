import { useEffect, useRef } from 'react';

import { StatusIcon } from '../../shell/StatusIcon';

/**
 * The charts and dashboards using members a save changes, listed before it
 * goes to Cube (T147, AC-141), each a link to where it is — in a new tab, so
 * the unsaved change stays here — with the members it uses; and the save
 * made only if the user says so.
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

function Item({
  href,
  title,
  members,
}: {
  href: string;
  title: string;
  members: readonly string[];
}) {
  return (
    <li>
      <a href={href} target="_blank" rel="noopener">
        {title}
      </a>
      <span className="model-references__members"> — uses {members.join(', ')}</span>
    </li>
  );
}

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
  // On the choice that changes nothing, and in view; Escape takes it too.
  useEffect(() => {
    const element = bar.current;
    if (element !== null && typeof element.scrollIntoView === 'function')
      element.scrollIntoView({ block: 'nearest' });
    cancel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onCancel]);
  const { charts, dashboards } = found;
  return (
    <div ref={bar} className="model-editor__warnbar model-references" role="alert">
      {/* A warning, with its icon (direction.md rule 3). */}
      <StatusIcon kind="warn" />
      <div className="model-editor__warnbar-text">
        <p className="model-references__lead">
          This save changes members that {count(charts.length, 'chart')} and{' '}
          {count(dashboards.length, 'dashboard')} use.
        </p>
        {charts.length === 0 ? null : (
          <>
            <h2 className="model-references__head">Charts</h2>
            <ul aria-label="Charts" className="model-references__list">
              {charts.map((chart) => (
                <Item
                  key={chart.id}
                  // A chart kept on its dashboard opens there.
                  href={
                    chart.dashboardId === null
                      ? `/explore/charts/${encodeURIComponent(chart.id)}`
                      : `/explore/dashboards/${encodeURIComponent(chart.dashboardId)}`
                  }
                  title={chart.title ?? chart.id}
                  members={chart.members}
                />
              ))}
            </ul>
          </>
        )}
        {dashboards.length === 0 ? null : (
          <>
            <h2 className="model-references__head">Dashboards</h2>
            <ul aria-label="Dashboards" className="model-references__list">
              {dashboards.map((dashboard) => (
                <Item
                  key={dashboard.id}
                  href={`/explore/dashboards/${encodeURIComponent(dashboard.id)}`}
                  title={dashboard.title ?? dashboard.id}
                  members={dashboard.members}
                />
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
