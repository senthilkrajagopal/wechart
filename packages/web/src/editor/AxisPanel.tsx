import type { AxisSettings, NumberFormat } from '@wechart/charts';

/**
 * The axis section of the inspector (AC-040).
 *
 * direction.md puts these in the inspector rather than on the canvas, and the
 * inspector is "the complete path to every setting from the keyboard" — so
 * every control here is a labelled form control, not a canvas handle.
 *
 * Settings are sparse: a field left alone is absent from the chart's options
 * rather than stored as a default, which is what lets the chart keep following
 * the data when nobody has overridden anything.
 */
export interface AxisPanelProps {
  /** Which axis: a combo's right value axis is `right` (T858). */
  readonly axis: 'x' | 'y' | 'right';
  readonly label: string;
  /**
   * A combo's axis group's head (T858; design 20 pin 7): its measures and
   * unit, "Margin % · %".
   */
  readonly head?: string | undefined;
  /** Whether it offers Gridlines: a combo's right axis has none of its own (AC-499). */
  readonly gridlines?: boolean;
  /**
   * Include zero locked on, with why (AC-499): "Include zero · on, because
   * Revenue draws bars".
   */
  readonly zeroLock?: string | undefined;
  /**
   * A combo's log scale (AC-502): unavailable with why, or on and off for
   * both axes at once, written through `onLog`.
   */
  readonly log?:
    | { readonly available: false; readonly reason: string }
    | { readonly available: true; readonly on: boolean; readonly both: boolean }
    | undefined;
  readonly onLog?: ((on: boolean) => void) | undefined;
  /** Synchronized (AC-501): its Min, Max and Log follow the left axis's. */
  readonly follows?: boolean;
  readonly settings: AxisSettings;
  readonly onChange: (next: AxisSettings) => void;
  /** Whether this axis carries values, which "include zero" is about (AC-219). */
  readonly values?: boolean;
  /**
   * A 100 % stack's value axis (T957, AC-584): fixed at 0–100 %, a tick every
   * 25 %, so its minimum, maximum, log scale, zero and format aren't offered.
   */
  readonly share?: boolean;
}

const FORMATS: readonly NumberFormat[] = ['auto', 'compact', 'full', 'percent', 'currency'];
/** direction.md offers exactly these three. */
const ROTATIONS = [0, 45, 90] as const;

export function AxisPanel({
  axis,
  label,
  settings,
  onChange,
  values = true,
  share = false,
  head,
  gridlines = true,
  zeroLock,
  log,
  onLog,
  follows = false,
}: AxisPanelProps) {
  const id = (name: string) => `axis-${axis}-${name}`;

  /** Absent rather than zero: an empty box means "leave it to the data". */
  const numberOrNothing = (raw: string) => {
    if (raw.trim() === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };

  // `undefined` is meaningful here — it clears the setting — so the patch has
  // to admit it, which `Partial` under exactOptionalPropertyTypes does not.
  const set = (patch: { [K in keyof AxisSettings]?: AxisSettings[K] | undefined }) => {
    const next: Record<string, unknown> = { ...settings, ...patch };
    // Drop the keys that were cleared, so the saved options stay sparse: a
    // setting nobody touched should be absent, not stored as a default.
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) delete next[key];
    }
    onChange(next as AxisSettings);
  };

  return (
    <fieldset className="axis-panel" data-testid={`axis-panel-${axis}`}>
      <legend>
        {label}
        {head === undefined || head === '' ? null : (
          <span className="axis-panel__head"> {head}</span>
        )}
      </legend>

      <label htmlFor={id('title')}>Title</label>
      <input
        id={id('title')}
        type="text"
        value={settings.title ?? ''}
        onChange={(event) => {
          set({ title: event.target.value === '' ? undefined : event.target.value });
        }}
      />

      {share ? (
        <p className="panel-section__note">0–100 %, a tick every 25 %</p>
      ) : (
        <>
          {/* Synchronized, the left axis's ends and scale are this one's (AC-501). */}
          {follows ? (
            <p className="panel-section__note">Min, Max and Log follow the left axis</p>
          ) : null}
          <label htmlFor={id('min')}>Minimum</label>
          <input
            id={id('min')}
            type="number"
            value={settings.min ?? ''}
            disabled={follows}
            onChange={(event) => {
              set({ min: numberOrNothing(event.target.value) });
            }}
          />

          <label htmlFor={id('max')}>Maximum</label>
          <input
            id={id('max')}
            type="number"
            value={settings.max ?? ''}
            disabled={follows}
            onChange={(event) => {
              set({ max: numberOrNothing(event.target.value) });
            }}
          />

          {/*
            A combo's log scale is both axes' at once, or unavailable while
            bars are drawn (AC-502), each said in its label.
          */}
          <label htmlFor={id('log')}>
            <input
              id={id('log')}
              type="checkbox"
              checked={log === undefined ? (settings.log ?? false) : log.available && log.on}
              disabled={follows || log?.available === false}
              onChange={(event) => {
                if (onLog !== undefined) onLog(event.target.checked);
                else set({ log: event.target.checked ? true : undefined });
              }}
            />
            {log?.available === false
              ? log.reason
              : log?.available === true && log.both && log.on
                ? 'Log scale · on for both axes, so their ticks align'
                : 'Logarithmic scale'}
          </label>
        </>
      )}

      {gridlines ? (
        <label htmlFor={id('gridlines')}>
          <input
            id={id('gridlines')}
            type="checkbox"
            checked={settings.gridlines ?? true}
            onChange={(event) => {
              set({ gridlines: event.target.checked });
            }}
          />
          Gridlines
        </label>
      ) : null}

      {/* On unless turned off (AC-219): off, the axis spans only the data.
          Only on an axis of values: a category axis has no zero. A combo's
          bars lock it on, saying why (AC-499). */}
      {values && !share ? (
        <label htmlFor={id('zero')}>
          <input
            id={id('zero')}
            type="checkbox"
            checked={zeroLock === undefined ? (settings.includeZero ?? true) : true}
            disabled={zeroLock !== undefined}
            onChange={(event) => {
              set({ includeZero: event.target.checked ? undefined : false });
            }}
          />
          {zeroLock ?? 'Include zero'}
        </label>
      ) : null}

      {/*
        Unset, a category axis's labels turn to fit before any is hidden
        (T467, UX-117): that is "Auto", said as that. 0° is a choice of its
        own, stored as 0, so the labels stay level (AC-040; T467's review).
      */}
      <label htmlFor={id('rotation')}>Label rotation</label>
      <select
        id={id('rotation')}
        value={settings.tickRotation === undefined ? 'auto' : String(settings.tickRotation)}
        onChange={(event) => {
          const value = event.target.value;
          set({ tickRotation: value === 'auto' ? undefined : Number(value) });
        }}
      >
        <option value="auto">Auto</option>
        {ROTATIONS.map((degrees) => (
          <option key={degrees} value={degrees}>
            {degrees}°
          </option>
        ))}
      </select>

      {share ? null : (
        <>
          <label htmlFor={id('format')}>Number format</label>
          <select
            id={id('format')}
            value={settings.numberFormat ?? 'auto'}
            onChange={(event) => {
              const value = event.target.value as NumberFormat;
              set({ numberFormat: value === 'auto' ? undefined : value });
            }}
          >
            {FORMATS.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
        </>
      )}
    </fieldset>
  );
}
