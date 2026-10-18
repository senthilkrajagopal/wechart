import { NEXT_PAGE } from '../paging';
import type { McpTool } from '../server';
import { JOBS_TOOLS } from './jobs';
import { PROPOSAL_TOOLS } from './proposals';
import { QUERY_TOOL } from './query';
import { READ_TOOLS } from './read';
import { WORKSPACE_TOOLS } from './workspace';

/** wechart's MCP tools, in the order `tools/list` gives them. */
export const MCP_TOOLS: readonly McpTool[] = [
  ...READ_TOOLS,
  QUERY_TOOL,
  NEXT_PAGE,
  ...WORKSPACE_TOOLS,
  ...PROPOSAL_TOOLS,
  ...JOBS_TOOLS,
];
