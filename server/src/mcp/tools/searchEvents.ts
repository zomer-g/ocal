import { z } from 'zod';
import { DiaryEventModel } from '../../models/DiaryEvent.js';
import { runTool, type ToolContext } from '../toolContext.js';

export const searchEventsSchema = {
  query: z.string().describe('Full-text search query in Hebrew or English. Supports AND/OR/NOT.').optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD, inclusive').optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD, inclusive').optional(),
  source_ids: z.array(z.string().uuid()).describe('Filter to specific diary sources.').optional(),
  location: z.string().describe('Substring match on event location.').optional(),
  entity_names: z.array(z.string()).describe('Match events whose extracted entities include any of these names (case-insensitive).').optional(),
  cross_ref_status: z.enum(['confirmed', 'unconfirmed']).describe('Only events with confirmed/unconfirmed cross-diary matches.').optional(),
  sort: z.enum(['date_asc', 'date_desc', 'relevance']).describe('Defaults to relevance when query is set, else date_desc.').optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
};

const argsSchema = z.object(searchEventsSchema);
type Args = z.infer<typeof argsSchema>;

export function buildSearchEventsTool(ctx: ToolContext) {
  return async (args: Args) =>
    runTool(ctx, 'search_events', args, async (a) => {
      const { rows, total } = await DiaryEventModel.search({
        q: a.query,
        from_date: a.date_from,
        to_date: a.date_to,
        source_ids: a.source_ids,
        location: a.location,
        entity_names: a.entity_names?.map((n) => n.trim().toLowerCase()),
        cross_ref_status: a.cross_ref_status,
        sort: a.sort ?? (a.query ? 'relevance' : 'date_desc'),
        offset: a.offset,
        limit: a.limit,
      });
      return {
        data: { total, returned: rows.length, offset: a.offset, events: rows },
        count: rows.length,
      };
    });
}

export const searchEventsToolConfig = {
  title: 'Search events',
  description:
    'Full-text search across all ingested Israeli government officials\' diary events. Returns events with their extracted entities (people, organizations, locations) and cross-reference summary.',
  inputSchema: searchEventsSchema,
};
