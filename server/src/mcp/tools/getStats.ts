import { db } from '../../config/database.js';
import { runTool, type ToolContext } from '../toolContext.js';

export const getStatsSchema = {};
type Args = Record<string, never>;

export function buildGetStatsTool(ctx: ToolContext) {
  return async (args: Args) =>
    runTool(ctx, 'get_stats', args, async () => {
      const [events, sources, orgs, entities, crossRefs] = await Promise.all([
        db('diary_events').where({ is_active: true }).count('* as count').first(),
        db('diary_sources').where({ is_enabled: true }).count('* as count').first(),
        db('diary_sources')
          .where({ is_enabled: true })
          .whereNotNull('organization_id')
          .countDistinct('organization_id as count')
          .first(),
        db('event_entities').count('* as count').first(),
        db('entity_cross_refs').count('* as count').first(),
      ]);

      const dateRange = await db('diary_events')
        .where({ is_active: true })
        .min('event_date as min')
        .max('event_date as max')
        .first();

      return {
        data: {
          total_events: Number(events?.count ?? 0),
          total_sources: Number(sources?.count ?? 0),
          total_organizations: Number(orgs?.count ?? 0),
          total_extracted_entities: Number(entities?.count ?? 0),
          total_cross_references: Number(crossRefs?.count ?? 0),
          event_date_range: {
            earliest: dateRange?.min ?? null,
            latest: dateRange?.max ?? null,
          },
        },
      };
    });
}

export const getStatsToolConfig = {
  title: 'Get corpus statistics',
  description:
    'Return high-level statistics about the Ocal corpus: total events, sources, organizations, extracted entities, cross-references, and the event date range.',
  inputSchema: getStatsSchema,
};
