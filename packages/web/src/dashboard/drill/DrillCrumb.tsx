import type { RenderSpec } from '@wechart/core';

import type { AnswerMeta } from '../../query/answerMeta';

/**
 * A tile drilled (T270, AC-236, AC-238): its marked items regrouped in place,
 * with its own answer — so its own freshness — and Back. Not saved, and not
 * kept on reload: it hangs on marks, which a dashboard opens without
 * (AC-124; the spec's F23 note).
 */
export interface DrilledView {
  /** The tile's title, its marked items, and what they're grouped by now. */
  readonly crumb: { readonly title: string; readonly items: string; readonly by: string };
  /** The marking drilled from, by name. */
  readonly markingName: string;
  readonly spec?: RenderSpec | undefined;
  readonly error?: unknown;
  readonly loading: boolean;
  /** What Cube said of the drilled answer: its own pre-aggregation or the database. */
  readonly answered?: AnswerMeta | undefined;
  /** The drill asked again: a failed one's Retry. */
  readonly onRetry: () => void;
  readonly onBack: () => void;
}

/**
 * The drilled tile's breadcrumb and Back (the context-menu mockup's state
 * B): "Title › items › Dimension", and what it is — drilled, not saved, no
 * other tile changed.
 */
export function DrillCrumb({ view }: { view: DrilledView }) {
  const { title, items, by } = view.crumb;
  return (
    <div className="drill-crumb" data-testid="drill-crumb">
      <nav aria-label="Drilled from" className="drill-crumb__path">
        <button type="button" className="btn-ghost btn-sm" onClick={view.onBack}>
          ← Back
        </button>
        <span className="drill-crumb__from">{title}</span>
        <span aria-hidden="true">›</span>
        <span className="drill-crumb__from">{items}</span>
        <span aria-hidden="true">›</span>
        <b aria-current="page">{by}</b>
      </nav>
      <p className="drill-crumb__note">
        Drilled from {view.markingName} ({items}), by {by}. Not saved; other tiles are unchanged.
      </p>
    </div>
  );
}
