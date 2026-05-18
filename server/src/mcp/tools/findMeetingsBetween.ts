import { z } from 'zod';
import { db } from '../../config/database.js';
import { runTool, type ToolContext } from '../toolContext.js';
import { PROVENANCE, buildEventLinks } from '../sources.js';

export const findMeetingsBetweenSchema = {
  person_a: z.string().describe('Name of the first person (case-insensitive substring match on extracted entities).'),
  person_b: z.string().describe('Name of the second person.'),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.number().int().min(1).max(100).default(50),
};

const argsSchema = z.object(findMeetingsBetweenSchema);
type Args = z.infer<typeof argsSchema>;

export function buildFindMeetingsBetweenTool(ctx: ToolContext) {
  return async (args: Args) =>
    runTool(ctx, 'find_meetings_between', args, async (a) => {
      const a_norm = a.person_a.trim().toLowerCase();
      const b_norm = a.person_b.trim().toLowerCase();

      let q = db('diary_events as e')
        .join('diary_sources as s', 'e.source_id', 's.id')
        .where('e.is_active', true)
        .where('s.is_enabled', true)
        .whereExists(function () {
          this.select(db.raw('1'))
            .from('event_entities as ee')
            .whereRaw('ee.event_id = e.id')
            .whereRaw('LOWER(ee.entity_name) LIKE ?', [`%${a_norm}%`]);
        })
        .whereExists(function () {
          this.select(db.raw('1'))
            .from('event_entities as ee')
            .whereRaw('ee.event_id = e.id')
            .whereRaw('LOWER(ee.entity_name) LIKE ?', [`%${b_norm}%`]);
        })
        .select(
          'e.id',
          'e.title',
          'e.start_time',
          'e.end_time',
          'e.location',
          'e.event_date',
          'e.source_id',
          'e.dataset_link',
          's.name as source_name',
          's.dataset_url as source_dataset_url',
          's.resource_url as source_resource_url',
        )
        .orderBy('e.start_time', 'desc')
        .limit(a.limit);

      if (a.date_from) q = q.where('e.event_date', '>=', a.date_from);
      if (a.date_to) q = q.where('e.event_date', '<=', a.date_to);

      const rows = await q;
      const enriched = rows.map((r) => ({
        ...r,
        links: buildEventLinks(r),
      }));

      return {
        data: {
          _provenance: {
            ...PROVENANCE,
            note:
              'Matches are based on AI-extracted entities in both event records — they indicate the *mention* of both people in the same event text, not necessarily a confirmed meeting. Verify via the "ocal_view" link for each match.',
          },
          matches: enriched,
        },
        count: enriched.length,
      };
    });
}

export const findMeetingsBetweenToolConfig = {
  title: 'Find meetings between two people',
  description:
    'Find Ocal events whose AI-extracted entities include both given names. Useful for tracing who-met-with-whom across the diary corpus. Each match includes a "links" object — always cite "ocal_view" and "ckan_resource" URLs and note that matches are heuristic, not confirmed.',
  inputSchema: findMeetingsBetweenSchema,
};
