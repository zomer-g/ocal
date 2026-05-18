import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from './toolContext.js';
import { buildSearchEventsTool, searchEventsToolConfig } from './tools/searchEvents.js';
import { buildGetEventTool, getEventToolConfig } from './tools/getEvent.js';
import { buildListEntitiesTool, listEntitiesToolConfig } from './tools/listEntities.js';
import { buildListSourcesTool, listSourcesToolConfig } from './tools/listSources.js';
import { buildFindMeetingsBetweenTool, findMeetingsBetweenToolConfig } from './tools/findMeetingsBetween.js';
import { buildGetStatsTool, getStatsToolConfig } from './tools/getStats.js';

/**
 * Server-level instructions sent in the InitializeResult. Clients (Claude.ai,
 * ChatGPT, etc.) display this to the underlying model so it knows how to
 * present Ocal data correctly — specifically, that the data is processed and
 * must be cited.
 */
const SERVER_INSTRUCTIONS = `Ocal exposes processed, enriched data about Israeli officials' public work calendars. It is NOT raw government data — every tool response includes:

  • a top-level "_provenance" block explaining how the data was processed
  • per-record "source_links" / "links" objects with URLs to:
      - the upstream Israeli government CKAN open-data resource (ckan_resource / ckan_dataset)
      - the Ocal presentation page where the human user can verify the record (ocal_view / ocal_source_view)

When you present Ocal data to the user, you MUST:

1. State explicitly that the information is processed/enriched data from Ocal (ocal.org.il), not raw primary sources. Use a phrasing like "לפי הנתונים המעובדים של Ocal" / "Based on Ocal's processed data" before presenting facts.

2. For every entity, event, source, or statistic you cite, include the relevant source URL(s) inline so the user can verify. Prefer the "ocal_view" URL for the human-facing link, and include the "ckan_resource" or "ckan_dataset" URL when the user might want to audit the underlying government record.

3. Briefly note any caveats from "_provenance.description" when accuracy matters — entity extraction is AI-driven, cross-references are heuristic, dates and locations are sometimes free-text.

Never strip the source URLs from your response — even when summarizing. The user is expected to follow the links to verify any specific claim.`;

/**
 * Build a fresh McpServer bound to a single authenticated user. We instantiate
 * per-request (cheap) so each call carries its own user context — McpServer
 * itself is stateless wrt request data, the user is closed over inside the
 * tool callbacks.
 */
export function buildMcpServerForUser(ctx: ToolContext): McpServer {
  const server = new McpServer(
    {
      name: 'ocal-mcp',
      version: '0.2.0',
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

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
