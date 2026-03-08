import { Router } from 'express';
import { z } from 'zod';
import { DiaryEventModel } from '../../models/DiaryEvent.js';
import { validate } from '../../middleware/validate.js';

export const calendarRouter = Router();

const calendarSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  view: z.enum(['month', 'week', '4day', 'day']).default('month'),
  source_ids: z.string().optional(),
  entity_names: z.string().optional(),
  max_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// GET /api/public/calendar
calendarRouter.get('/', validate(calendarSchema, 'query'), async (req, res, next) => {
  try {
    const query = req.query as z.infer<typeof calendarSchema>;
    const date = new Date(query.date);
    const sourceIds = query.source_ids?.split(',').filter(Boolean);
    const entityNames = query.entity_names?.split(',').filter(Boolean);

    let from: string;
    let to: string;

    if (query.view === 'month') {
      // Include surrounding weeks for month grid
      const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      // Go back to Sunday of first week
      const start = new Date(firstDay);
      start.setDate(start.getDate() - start.getDay());
      // Go forward to Saturday of last week
      const end = new Date(lastDay);
      end.setDate(end.getDate() + (6 - end.getDay()));
      from = start.toISOString().split('T')[0];
      to = end.toISOString().split('T')[0];
    } else if (query.view === 'week') {
      const start = new Date(date);
      start.setDate(start.getDate() - start.getDay()); // Sunday
      const end = new Date(start);
      end.setDate(end.getDate() + 6); // Saturday
      from = start.toISOString().split('T')[0];
      to = end.toISOString().split('T')[0];
    } else if (query.view === '4day') {
      from = query.date;
      const end = new Date(date);
      end.setDate(end.getDate() + 3); // 4 days total
      to = end.toISOString().split('T')[0];
    } else {
      from = query.date;
      to = query.date;
    }

    // Cap the end of the range if max_date is provided (e.g. hide future events)
    if (query.max_date && to > query.max_date) {
      to = query.max_date;
    }

    const [events, event_counts] = await Promise.all([
      DiaryEventModel.findByDateRange(from, to, sourceIds, entityNames),
      DiaryEventModel.countByDateRange(from, to, sourceIds, entityNames),
    ]);

    res.json({
      events,
      date_range: { from, to },
      event_counts,
    });
  } catch (err) {
    next(err);
  }
});
