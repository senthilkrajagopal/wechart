import { NEXT_PAGE } from '../paging';
import type { McpTool } from '../server';
import { JOBS_TOOLS } from './jobs';
import { PROPOSAL_TOOLS } from './proposals';
import { QUERY_TOOL } from './query';
import { READ_TOOLS } from './read';
import { workspaceTools } from './workspace';

/**
 * wechart's MCP tools, in the order `tools/list` gives them, for a
 * deployment in `timeZone`, the zone a copy's project folder is named in
 * when the client sends none (T1015, AC-630).
 */
export function mcpTools(timeZone: string): readonly McpTool[] {
  return [
    ...READ_TOOLS,
    QUERY_TOOL,
    NEXT_PAGE,
    ...workspaceTools(timeZone),
    ...PROPOSAL_TOOLS,
    ...JOBS_TOOLS,
  ];
}
