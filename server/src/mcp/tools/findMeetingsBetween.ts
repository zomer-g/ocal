import { z } from 'zod';
import { db } from '../../config/database.js';
import { runTool, type ToolContext } from '../toolContext.js';

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
          's.name as source_name',
        )
        .orderBy('e.start_time', 'desc')
        .limit(a.limit);

      if (a.date_from) q = q.where('e.event_date', '>=', a.date_from);
      if (a.date_to) q = q.where('e.event_date', '<=', a.date_to);

      const rows = await q;
      return { data: { matches: rows }, count: rows.length };
    });
}

export const findMeetingsBetweenToolConfig = {
  title: 'Find meetings between two people',
  description:
    'Find events whose extracted entities include both given names. Useful for tracing who-met-with-whom across the diary corpus.',
  inputSchema: findMeetingsBetweenSchema,
};
