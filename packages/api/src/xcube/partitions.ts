import { XcubeError } from './client';

/**
 * A pre-aggregation's partitions, from xcube's partitions route (T375,
 * AC-145; research `xcube-slice-6.md`, "POST …/pre-aggregations/partitions",
 * and `cube/system-partitions.md`): every partition Cube derives from its
 * build range, in the one zone wechart builds in, UTC (Derivation, 11–12),
 * each with its period and its versions, newest first (Build state and
 * versions). Called only by wechart's server, with its service credential.
 *
 * The route drops a module whose answer was "Continue wait" rather than say
 * so (`xcube-slice-6.md`, Gotcha 11), so a pre-aggregation missing from its
 * answer is asked for again, and never taken as having no partitions.
 */
export interface PartitionOf {
  /** Its table, without a version: `<schema>.<name><suffix>`. */
  readonly tableName: string;
  /** Its period, a wall-clock UTC start and end; none for one not partitioned. */
  readonly start: string | null;
  readonly end: string | null;
  /** When Cube made each version of it, newest first (epoch ms); none, not built. */
  readonly versions: readonly number[];
}

export interface PartitionsOf {
  readonly id: string;
  /** `rollup`, `originalSql`, `rollupLambda`, `rollupJoin`… */
  readonly type: string;
  readonly partitionGranularity: string | null;
  readonly errors: readonly string[];
  readonly partitions: readonly PartitionOf[];
}

/** xcube kept answering without the pre-aggregation: Cube is still working out its partitions. */
export class PartitionsPending extends Error {
  constructor(id: string) {
    super(`Cube is still working out the partitions of ${id}.`);
    this.name = 'PartitionsPending';
  }
}

export interface XcubePartitions {
  of(id: string): Promise<PartitionsOf>;
}

/** Asks before saying it is still waiting: a slow build range comes in a few tries. */
const ASKS = 4;
const CALL_TIMEOUT_MS = 60_000;

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function partitionsOf(item: Record<string, unknown>): PartitionsOf | undefined {
  const pa = item['preAggregation'] as Record<string, unknown> | undefined;
  const id = text(pa?.['id']);
  if (id === null) return undefined;
  const definition = (pa?.['preAggregation'] ?? {}) as Record<string, unknown>;
  const partitions = Array.isArray(item['partitions'])
    ? (item['partitions'] as Record<string, unknown>[]).flatMap((each): PartitionOf[] => {
        const tableName = text(each['tableName']);
        if (tableName === null) return [];
        const versions = Array.isArray(each['versionEntries'])
          ? (each['versionEntries'] as Record<string, unknown>[])
              .map((entry) => entry['last_updated_at'])
              .filter((at): at is number => typeof at === 'number')
              .sort((a, b) => b - a)
          : [];
        return [
          {
            tableName,
            start: text(each['buildRangeStart']),
            end: text(each['buildRangeEnd']),
            versions,
          },
        ];
      })
    : [];
  return {
    id,
    type: text(definition['type']) ?? 'rollup',
    partitionGranularity: text(definition['partitionGranularity']),
    errors: Array.isArray(item['errors'])
      ? (item['errors'] as unknown[]).filter((each): each is string => typeof each === 'string')
      : [],
    partitions,
  };
}

export function xcubePartitions({
  cubeApiUrl,
  model,
  token,
  fetch: send = fetch,
  askAgainAfterMs = 1_000,
}: {
  readonly cubeApiUrl: string;
  readonly model: string;
  /** The service credential's token (T420), minted for each call. */
  readonly token: () => Promise<string>;
  readonly fetch?: typeof fetch;
  readonly askAgainAfterMs?: number;
}): XcubePartitions {
  const url = `${cubeApiUrl.replace(/\/$/, '')}/v1/semantic/models/${encodeURIComponent(model)}/pre-aggregations/partitions`;
  return {
    async of(id) {
      for (let ask = 1; ask <= ASKS; ask += 1) {
        const response = await send(url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${await token()}`,
            'content-type': 'application/json',
          },
          signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
          body: JSON.stringify({
            query: {
              preAggregations: [{ id }],
              timezones: ['UTC'],
              expand: ['partitions.details', 'partitions.versions'],
            },
          }),
        });
        const answer = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok)
          throw new XcubeError(
            response.status,
            text(answer['code']) ?? undefined,
            `xcube answered ${String(response.status)}: ${text(answer['error']) ?? 'no reason given'}`,
          );
        const found = (
          Array.isArray(answer['preAggregationPartitions'])
            ? (answer['preAggregationPartitions'] as Record<string, unknown>[])
            : []
        )
          .map(partitionsOf)
          .find((each) => each?.id === id);
        if (found !== undefined) return found;
        if (ask < ASKS) await new Promise((resolve) => setTimeout(resolve, askAgainAfterMs));
      }
      throw new PartitionsPending(id);
    },
  };
}
