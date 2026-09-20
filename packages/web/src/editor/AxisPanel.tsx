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
  readonly axis: 'x' | 'y';
  readonly label: string;
  readonly settings: AxisSettings;
  readonly onChange: (next: AxisSettings) => void;
}

const FORMATS: readonly NumberFormat[] = ['auto', 'compact', 'full', 'percent', 'currency'];
/** direction.md offers exactly these three. */
const ROTATIONS = [0, 45, 90] as const;

export function AxisPanel({ axis, label, settings, onChange }: AxisPanelProps) {
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
      <legend>{label}</legend>

      <label htmlFor={id('title')}>Title</label>
      <input
        id={id('title')}
        type="text"
        value={settings.title ?? ''}
        onChange={(event) => {
          set({ title: event.target.value === '' ? undefined : event.target.value });
        }}
      />

      <label htmlFor={id('min')}>Minimum</label>
      <input
        id={id('min')}
        type="number"
        value={settings.min ?? ''}
        onChange={(event) => {
          set({ min: numberOrNothing(event.target.value) });
        }}
      />

      <label htmlFor={id('max')}>Maximum</label>
      <input
        id={id('max')}
        type="number"
        value={settings.max ?? ''}
        onChange={(event) => {
          set({ max: numberOrNothing(event.target.value) });
        }}
      />

      <label htmlFor={id('log')}>
        <input
          id={id('log')}
          type="checkbox"
          checked={settings.log ?? false}
          onChange={(event) => {
            set({ log: event.target.checked ? true : undefined });
          }}
        />
        Logarithmic scale
      </label>

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

      <label htmlFor={id('rotation')}>Label rotation</label>
      <select
        id={id('rotation')}
        value={String(settings.tickRotation ?? 0)}
        onChange={(event) => {
          const value = Number(event.target.value);
          set({ tickRotation: value === 0 ? undefined : value });
        }}
      >
        {ROTATIONS.map((degrees) => (
          <option key={degrees} value={degrees}>
            {degrees}°
          </option>
        ))}
      </select>

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
    </fieldset>
  );
}
