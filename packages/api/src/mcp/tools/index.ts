import { NEXT_PAGE } from '../paging';
import type { McpTool } from '../server';
import { QUERY_TOOL } from './query';
import { READ_TOOLS } from './read';

/** wechart's MCP tools, in the order `tools/list` gives them. */
export const MCP_TOOLS: readonly McpTool[] = [...READ_TOOLS, QUERY_TOOL, NEXT_PAGE];
