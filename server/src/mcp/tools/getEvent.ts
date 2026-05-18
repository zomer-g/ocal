import { z } from 'zod';
import { db } from '../../config/database.js';
import { DiaryEventModel } from '../../models/DiaryEvent.js';
import { runTool, type ToolContext } from '../toolContext.js';
import { PROVENANCE, buildEventLinks, buildSourceLinks } from '../sources.js';

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

      const source = await db('diary_sources')
        .where({ id: event.source_id })
        .select('id', 'name', 'dataset_url', 'resource_url')
        .first();

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
          'ds.id as target_source_id',
          'ds.name as target_source_name',
          'ds.dataset_url as target_dataset_url',
          'ds.resource_url as target_resource_url',
          'me.id as matched_event_id',
          'me.title as matched_title',
          'me.start_time as matched_start_time',
        );

      const crossRefsEnriched = crossRefs.map((r) => ({
        ...r,
        target_source_links: r.target_source_id
          ? buildSourceLinks({
              id: r.target_source_id,
              dataset_url: r.target_dataset_url,
              resource_url: r.target_resource_url,
            })
          : null,
      }));

      let matchedEvents: unknown[] = [];
      if (event.match_group_id) {
        const matched = await db('diary_events as e')
          .join('diary_sources as s', 'e.source_id', 's.id')
          .where('e.match_group_id', event.match_group_id)
          .whereNot('e.id', a.event_id)
          .where('e.is_active', true)
          .select(
            'e.id',
            'e.title',
            'e.start_time',
            'e.location',
            'e.event_date',
            'e.source_id',
            'e.dataset_link',
            's.name as source_name',
            's.dataset_url as source_dataset_url',
            's.resource_url as source_resource_url',
          );
        matchedEvents = matched.map((m) => ({
          ...m,
          links: buildEventLinks(m),
        }));
      }

      return {
        data: {
          _provenance: PROVENANCE,
          event: {
            ...event,
            links: buildEventLinks({
              source_id: event.source_id,
              event_date: event.event_date,
              dataset_link: event.dataset_link,
              source_dataset_url: source?.dataset_url ?? null,
              source_resource_url: source?.resource_url ?? null,
            }),
          },
          source: source
            ? {
                ...source,
                links: buildSourceLinks(source),
              }
            : null,
          entities,
          cross_refs: crossRefsEnriched,
          matched_events: matchedEvents,
        },
      };
    });
}

export const getEventToolConfig = {
  title: 'Get event',
  description:
    'Fetch a single Ocal-processed diary event by ID with all AI-extracted entities, cross-references to other officials\' diaries, and duplicate events from other calendars. Response includes "links" objects on the event, its source, and each cross-reference — always cite these URLs when presenting the event to the user.',
  inputSchema: getEventSchema,
};
