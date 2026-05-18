import { z } from 'zod';
import { db } from '../../config/database.js';
import { DiaryEventModel } from '../../models/DiaryEvent.js';
import { runTool, type ToolContext } from '../toolContext.js';
import { PROVENANCE, buildEventLinks, buildOcalSearchUrl } from '../sources.js';

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

interface SourceRow {
  id: string;
  dataset_url: string | null;
  resource_url: string | null;
}

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

      const sourceIds = [...new Set(rows.map((r: { source_id: string }) => r.source_id))];
      const sourceRows: SourceRow[] = sourceIds.length
        ? await db('diary_sources').whereIn('id', sourceIds).select('id', 'dataset_url', 'resource_url')
        : [];
      const sourceMap = new Map(sourceRows.map((s) => [s.id, s]));

      const enriched = rows.map((r: Record<string, unknown>) => {
        const src = sourceMap.get(r.source_id as string);
        return {
          ...r,
          links: buildEventLinks({
            source_id: r.source_id as string,
            event_date: r.event_date as string | Date | null | undefined,
            dataset_link: r.dataset_link as string | null | undefined,
            source_dataset_url: src?.dataset_url,
            source_resource_url: src?.resource_url,
          }),
        };
      });

      return {
        data: {
          _provenance: PROVENANCE,
          search_url: buildOcalSearchUrl({
            q: a.query,
            from_date: a.date_from,
            to_date: a.date_to,
            source_id: a.source_ids?.[0],
          }),
          total,
          returned: enriched.length,
          offset: a.offset,
          events: enriched,
        },
        count: enriched.length,
      };
    });
}

export const searchEventsToolConfig = {
  title: 'Search events',
  description:
    'Full-text search across Ocal\'s processed corpus of Israeli officials\' diary events (ingested from data.gov.il, deduplicated, entity-extracted). Every event in the response carries a "links" object with URLs back to Ocal and to the upstream CKAN resource — always cite these when presenting results.',
  inputSchema: searchEventsSchema,
};
