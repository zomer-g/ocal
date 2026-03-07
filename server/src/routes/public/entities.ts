import { Router } from 'express';
import { db } from '../../config/database.js';

export const entitiesRouter = Router();

// GET /api/public/entities
// Returns distinct entity names grouped by type, with event counts.
// Query: ?source_ids=id1,id2&type=person|place
entitiesRouter.get('/', async (req, res, next) => {
  try {
    const sourceIds = req.query.source_ids
      ? String(req.query.source_ids).split(',').filter(Boolean)
      : undefined;
    const typeFilter = req.query.type as string | undefined;

    let query = db('event_entities as ee')
      .join('diary_events as de', 'de.id', 'ee.event_id')
      .join('diary_sources as ds', 'ds.id', 'de.source_id')
      .where('ds.is_enabled', true)
      .where('ee.confidence', '>=', 0.5)
      .select(
        'ee.entity_name',
        'ee.entity_type',
        'ee.entity_id',
        db.raw('COUNT(DISTINCT de.id) as event_count'),
      )
      .groupBy('ee.entity_name', 'ee.entity_type', 'ee.entity_id');

    if (sourceIds && sourceIds.length > 0) {
      query = query.whereIn('de.source_id', sourceIds);
    }
    if (typeFilter) {
      query = query.where('ee.entity_type', typeFilter);
    }

    // Exclude owner role (diary owner appears in every event — not a useful filter)
    query = query.where('ee.role', '!=', 'owner');

    const entities = await query.orderBy('event_count', 'desc').limit(200);

    res.json({ data: entities });
  } catch (err) {
    next(err);
  }
});
