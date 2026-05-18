import { z } from 'zod';
import { db } from '../../config/database.js';
import { runTool, type ToolContext } from '../toolContext.js';
import { PROVENANCE, buildOcalSearchUrl } from '../sources.js';

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
          _provenance: {
            ...PROVENANCE,
            note:
              'Entities are extracted from free-text event titles/descriptions by AI NER (named-entity recognition). Each mention has a confidence score; names may include misspellings or near-duplicates. Use the "search_url" for each entity to view the events that mention it on Ocal.',
          },
          entities: rows.map((r) => ({
            type: r.entity_type,
            name: r.entity_name,
            mentions: Number(r.mentions),
            search_url: buildOcalSearchUrl({ q: String(r.entity_name) }),
          })),
        },
        count: rows.length,
      };
    });
}

export const listEntitiesToolConfig = {
  title: 'List entities',
  description:
    'List unique entities (people, organizations, places) extracted by AI from Ocal-processed diary event text, ranked by mention count. Each entity includes a "search_url" linking to the Ocal events that mention it — always cite this URL.',
  inputSchema: listEntitiesSchema,
};
