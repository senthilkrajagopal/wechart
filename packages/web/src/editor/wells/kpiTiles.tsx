import {
  KPI_TILE_ORDERS,
  kpiOptionsOf,
  withKpiOptions,
  type ChartType,
  type KpiOptions,
} from '@wechart/core';
import { useId, type ReactNode } from 'react';

interface KpiTilesProps {
  readonly options: Readonly<Record<string, unknown>>;
  readonly onOptions: (patch: Readonly<Record<string, unknown>>) => void;
}

/**
 * Customize › Tile order (T940, AC-567; decision T940-1): a tiled KPI's
 * tiles by value, highest first — the default, not stored — by value, lowest
 * first, or by name. Stored sparse in the KPI's options as `tileOrder`.
 */
export function KpiTileOrderSetting({ options, onOptions }: KpiTilesProps) {
  const ids = useId();
  const kpi = kpiOptionsOf(options);
  const set = (next: KpiOptions) => {
    onOptions({ kpi: withKpiOptions({}, next)['kpi'] });
  };
  return (
    <div className="customize-tab__field">
      <label htmlFor={`${ids}-order`} className="customize-tab__label">
        Tile order
      </label>
      <select
        id={`${ids}-order`}
        value={kpi.tileOrder ?? 'value'}
        onChange={(event) => {
          const order = KPI_TILE_ORDERS.find((one) => one.value === event.target.value);
          if (order === undefined) return;
          const next: KpiOptions = { ...kpi, tileOrder: order.value };
          if (order.value === 'value') delete (next as { tileOrder?: unknown }).tileOrder;
          set(next);
        }}
      >
        {KPI_TILE_ORDERS.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * What the Customize tab takes for a KPI's tiles (`CustomizeTab`'s `tiles`):
 * their order, on a KPI tiled by a dimension; nothing for any other.
 */
export function kpiCustomize(type: ChartType | null, props: KpiTilesProps): { tiles?: ReactNode } {
  if (type !== 'kpi' || kpiOptionsOf(props.options).tileBy === undefined) return {};
  return { tiles: <KpiTileOrderSetting {...props} /> };
}
