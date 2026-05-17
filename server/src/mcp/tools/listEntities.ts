import { z } from 'zod';
import { db } from '../../config/database.js';
import { runTool, type ToolContext } from '../toolContext.js';

export const listEntitiesSchema = {
  type: z.enum(['person', 'organization', 'place']).describe('Filter by entity type.').optional(),
  search: z.string().describe('Substring match (case-insensitive) on entity name.').optional(),
  min_confidence: z.number().min(0).max(1).default(0.5).describe('Minimum extraction confidence.'),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
};

const argsSchema = z.object(listEntitiesSchema);
type Args = z.infer<typeof argsSchema>;

export function buildListEntitiesTool(ctx: ToolContext) {
  return async (args: Args) =>
    runTool(ctx, 'list_entities', args, async (a) => {
      let q = db('event_entities')
        .where('confidence', '>=', a.min_confidence)
        .select('entity_type', 'entity_name')
        .count('* as mentions')
        .groupBy('entity_type', 'entity_name');

      if (a.type) q = q.where('entity_type', a.type);
      if (a.search) q = q.whereRaw('entity_name ILIKE ?', [`%${a.search}%`]);

      q = q.orderBy('mentions', 'desc').limit(a.limit).offset(a.offset);

      const rows = await q;
      return {
        data: {
          entities: rows.map((r) => ({
            type: r.entity_type,
            name: r.entity_name,
            mentions: Number(r.mentions),
          })),
        },
        count: rows.length,
      };
    });
}

export const listEntitiesToolConfig = {
  title: 'List entities',
  description:
    'List unique entities (people, organizations, places) extracted from diary events, ranked by number of mentions.',
  inputSchema: listEntitiesSchema,
};
