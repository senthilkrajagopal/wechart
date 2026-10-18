import { type CallToolResult, fromJsonSchema } from '@modelcontextprotocol/server';

import { dataResult, refusal } from '../result';
import type { McpTool, WebAnswer } from '../server';
import { ID, READ_ONLY, refusedBy } from './read';

/**
 * Proposals through MCP (T787, AC-439, AC-442, AC-469): proposing an item
 * of the owner's My workspace, withdrawing their own open proposal and
 * listing their own proposals, each by the web app's own route as the
 * token's owner, so each is checked as the web app's are: the item theirs
 * and in their workspace, its target one they may write, a description of
 * at most 1,000 characters, and the publish check's dry run of its models
 * (AC-284, AC-285, AC-321). What the route records in the audit trail says
 * it came through MCP and names the token (T781's `viaMcp`). Every tool
 * needs the proposals-and-jobs scope; without it, the call is answered 403
 * `insufficient_scope` before it runs (AC-433). No tool approves or rejects
 * (AC-440), and none proposes a data source (AC-441).
 */

/** What a withdrawal of anything but the owner's own open proposal is told: fixed text. */
export const NOT_YOURS_TO_WITHDRAW =
  'Only your own open proposal is withdrawn through MCP, and this isn’t one. Nothing was changed.';

/** What the route answered, under the marked field (AC-443); its refusal otherwise. */
const proposalOf = (answer: WebAnswer): CallToolResult =>
  answer.status >= 200 && answer.status < 300
    ? dataResult({ proposal: answer.body })
    : refusedBy(answer);

interface ProposeArgs {
  readonly kind: 'dashboard' | 'chart' | 'model';
  readonly id: string;
  readonly description?: string;
}

const PROPOSE: McpTool = {
  name: 'propose',
  description:
    'Proposes a dashboard, chart or model file of your My workspace into the shared folder it names to go to, as the web app’s Propose does, with an optional description of at most 1,000 characters. It is checked as there, its models by the publish check, and lands only once someone who may approves it.',
  scope: 'proposals-and-jobs',
  inputSchema: fromJsonSchema<ProposeArgs>({
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['dashboard', 'chart', 'model'],
        description: 'A dashboard, a chart, or a model file.',
      },
      id: {
        type: 'string',
        pattern: ID,
        description: 'The dashboard’s or chart’s id, or the model file’s id.',
      },
      // The limit is the route's, counted by code point as the web app counts it.
      description: {
        type: 'string',
        description: 'Why, for whoever reviews it: at most 1,000 characters.',
      },
    },
    required: ['kind', 'id'],
    additionalProperties: false,
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  async run(args, call) {
    const { kind, id, description } = args as ProposeArgs;
    return proposalOf(
      await call.ask('/api/proposals', {
        method: 'POST',
        body: { kind, id, ...(description === undefined ? {} : { description }) },
      }),
    );
  },
};

const WITHDRAW: McpTool = {
  name: 'withdraw_proposal',
  description:
    'Withdraws your own open proposal, as the web app’s Withdraw does: its folder stays as it was, and its work stays in your My workspace. Only your own, and only while it waits.',
  scope: 'proposals-and-jobs',
  inputSchema: fromJsonSchema<{ proposalId: string }>({
    type: 'object',
    properties: {
      proposalId: {
        type: 'string',
        pattern: ID,
        description: 'The proposal’s id, as list_my_proposals or propose gives it.',
      },
    },
    required: ['proposalId'],
    additionalProperties: false,
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  async run(args, call) {
    const { proposalId } = args as { proposalId: string };
    const url = `/api/proposals/${encodeURIComponent(proposalId)}`;
    const seen = await call.ask(url);
    if (seen.status !== 200) return refusedBy(seen);
    // The route's reject withdraws only its author's; a member's would reject
    // another's (AC-440): so only the owner's own, while it is open.
    const { yours, status } = (seen.body ?? {}) as { yours?: unknown; status?: unknown };
    if (yours !== true || status !== 'open') return refusal(NOT_YOURS_TO_WITHDRAW);
    return proposalOf(await call.ask(`${url}/reject`, { method: 'POST', body: {} }));
  },
};

const LIST: McpTool = {
  name: 'list_my_proposals',
  description:
    'Lists your own proposals, newest first, as the web app’s My proposals does: each one’s item, target folder, description, state (open, approved, rejected or withdrawn), and who decided it, when and why.',
  scope: 'proposals-and-jobs',
  annotations: READ_ONLY,
  rows: 'proposals',
  async run(_args, call) {
    const answer = await call.ask('/api/reviews');
    if (answer.status !== 200) return refusedBy(answer);
    // "My proposals" alone: "To review" holds others' (AC-439).
    const { mine } = (answer.body ?? {}) as { mine?: unknown };
    return dataResult({ proposals: Array.isArray(mine) ? mine : [] });
  },
};

/** The proposal tools, in the order `tools/list` gives them. */
export const PROPOSAL_TOOLS: readonly McpTool[] = [PROPOSE, WITHDRAW, LIST];
