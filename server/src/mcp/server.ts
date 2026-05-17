import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from './toolContext.js';
import { buildSearchEventsTool, searchEventsToolConfig } from './tools/searchEvents.js';
import { buildGetEventTool, getEventToolConfig } from './tools/getEvent.js';
import { buildListEntitiesTool, listEntitiesToolConfig } from './tools/listEntities.js';
import { buildListSourcesTool, listSourcesToolConfig } from './tools/listSources.js';
import { buildFindMeetingsBetweenTool, findMeetingsBetweenToolConfig } from './tools/findMeetingsBetween.js';
import { buildGetStatsTool, getStatsToolConfig } from './tools/getStats.js';

/**
 * Build a fresh McpServer bound to a single authenticated user. We instantiate
 * per-request (cheap) so each call carries its own user context — McpServer
 * itself is stateless wrt request data, the user is closed over inside the
 * tool callbacks.
 */
export function buildMcpServerForUser(ctx: ToolContext): McpServer {
  const server = new McpServer({
    name: 'ocal-mcp',
    version: '0.1.0',
  });

  server.registerTool('search_events', searchEventsToolConfig, buildSearchEventsTool(ctx));
  server.registerTool('get_event', getEventToolConfig, buildGetEventTool(ctx));
  server.registerTool('list_entities', listEntitiesToolConfig, buildListEntitiesTool(ctx));
  server.registerTool('list_sources', listSourcesToolConfig, buildListSourcesTool(ctx));
  server.registerTool(
    'find_meetings_between',
    findMeetingsBetweenToolConfig,
    buildFindMeetingsBetweenTool(ctx),
  );
  server.registerTool('get_stats', getStatsToolConfig, buildGetStatsTool(ctx));

  return server;
}
