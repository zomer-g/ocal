import { Router } from 'express';
import { z } from 'zod';
import { DiaryEventModel } from '../../models/DiaryEvent.js';
import { parsePagination, buildPaginationMeta } from '../../utils/pagination.js';
import { validate } from '../../middleware/validate.js';

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
      ? query.entity_names.split(',').filter(Boolean)
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
