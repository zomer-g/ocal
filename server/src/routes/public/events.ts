import { Router } from 'express';
import { z } from 'zod';
import { DiaryEventModel } from '../../models/DiaryEvent.js';
import { parsePagination, buildPaginationMeta } from '../../utils/pagination.js';
import { validate } from '../../middleware/validate.js';
import { db } from '../../config/database.js';

export const eventsRouter = Router();

const searchSchema = z.object({
  q: z.string().optional(),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  source_ids: z.string().optional(),
  location: z.string().optional(),
  participants: z.string().optional(),
  entity_names: z.string().optional(),
  page: z.coerce.number().optional(),
  per_page: z.coerce.number().optional(),
  sort: z.enum(['date_asc', 'date_desc', 'relevance']).optional(),
});

// GET /api/public/events
eventsRouter.get('/', validate(searchSchema, 'query'), async (req, res, next) => {
  try {
    const query = req.query as z.infer<typeof searchSchema>;
    const { page, per_page, offset } = parsePagination(query);

    const sourceIds = query.source_ids
      ? query.source_ids.split(',').filter(Boolean)
      : undefined;
    const entityNames = query.entity_names
      ? query.entity_names.split('||').map((n) => n.trim().toLowerCase()).filter(Boolean)
      : undefined;

    const { rows, total } = await DiaryEventModel.search({
      q: query.q,
      from_date: query.from_date,
      to_date: query.to_date,
      source_ids: sourceIds,
      location: query.location,
      participants: query.participants,
      entity_names: entityNames,
      sort: query.sort ?? (query.q ? 'relevance' : 'date_desc'),
      offset,
      limit: per_page,
    });

    res.json({
      data: rows,
      pagination: buildPaginationMeta(page, per_page, total),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/events/:id
eventsRouter.get('/:id', async (req, res, next) => {
  try {
    const event = await DiaryEventModel.findById(req.params.id);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    res.json(event);
  } catch (err) {
    next(err);
  }
});

// GET /api/public/events/:id/entities
eventsRouter.get('/:id/entities', async (req, res, next) => {
  try {
    const entities = await db('event_entities')
      .where({ event_id: req.params.id })
      .select('entity_type', 'entity_name', 'role', 'confidence', 'extraction_method')
      .orderBy('confidence', 'desc')
      .orderBy('entity_type')
      .orderBy('entity_name');
    res.json({ data: entities });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/events/:id/matches
eventsRouter.get('/:id/matches', async (req, res, next) => {
  try {
    const event = await db('diary_events').where({ id: req.params.id }).first();
    if (!event || !event.match_group_id) {
      res.json({ match_group: null, matched_events: [] });
      return;
    }

    const matchGroup = await db('similar_events')
      .where({ id: event.match_group_id })
      .first();
    if (!matchGroup) {
      res.json({ match_group: null, matched_events: [] });
      return;
    }

    const matchedEvents = await db('diary_events as e')
      .join('diary_sources as s', 'e.source_id', 's.id')
      .where('e.match_group_id', matchGroup.id)
      .whereNot('e.id', req.params.id)
      .where('e.is_active', true)
      .where('s.is_enabled', true)
      .select(
        'e.id', 'e.title', 'e.start_time', 'e.end_time',
        'e.location', 'e.participants', 'e.event_date',
        's.name as source_name', 's.color as source_color',
      )
      .orderBy('s.name');

    res.json({
      match_group: {
        id: matchGroup.id,
        event_date: matchGroup.event_date,
        common_title: matchGroup.common_title,
        total_events: matchGroup.total_events,
      },
      matched_events: matchedEvents,
    });
  } catch (err) {
    next(err);
  }
});
