import { z } from 'zod';
import { db } from '../../config/database.js';
import { DiaryEventModel } from '../../models/DiaryEvent.js';
import { runTool, type ToolContext } from '../toolContext.js';

export const getEventSchema = {
  event_id: z.string().uuid().describe('ID of a diary event.'),
};

const argsSchema = z.object(getEventSchema);
type Args = z.infer<typeof argsSchema>;

export function buildGetEventTool(ctx: ToolContext) {
  return async (args: Args) =>
    runTool(ctx, 'get_event', args, async (a) => {
      const event = await DiaryEventModel.findById(a.event_id);
      if (!event) {
        throw new Error('Event not found');
      }

      const entities = await db('event_entities')
        .where({ event_id: a.event_id })
        .select('entity_type', 'entity_name', 'role', 'confidence', 'extraction_method')
        .orderBy('confidence', 'desc');

      const crossRefs = await db('entity_cross_refs as ecr')
        .leftJoin('diary_events as me', 'me.id', 'ecr.matched_event_id')
        .leftJoin('diary_sources as ds', 'ds.id', 'ecr.target_source_id')
        .where('ecr.source_event_id', a.event_id)
        .select(
          'ecr.status',
          'ecr.match_method',
          'ecr.match_score',
          'ecr.event_date',
          'ds.name as target_source_name',
          'me.id as matched_event_id',
          'me.title as matched_title',
          'me.start_time as matched_start_time',
        );

      let matchedEvents: unknown[] = [];
      if (event.match_group_id) {
        matchedEvents = await db('diary_events as e')
          .join('diary_sources as s', 'e.source_id', 's.id')
          .where('e.match_group_id', event.match_group_id)
          .whereNot('e.id', a.event_id)
          .where('e.is_active', true)
          .select('e.id', 'e.title', 'e.start_time', 'e.location', 's.name as source_name');
      }

      return {
        data: { event, entities, cross_refs: crossRefs, matched_events: matchedEvents },
      };
    });
}

export const getEventToolConfig = {
  title: 'Get event',
  description:
    'Fetch a single diary event by ID with all extracted entities, cross-references to other diaries, and identical events from other officials\' calendars.',
  inputSchema: getEventSchema,
};
