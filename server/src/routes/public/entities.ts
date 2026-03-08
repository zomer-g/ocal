import { Router } from 'express';
import { db } from '../../config/database.js';

export const entitiesRouter = Router();

// ── Simple in-memory cache (5-minute TTL) ──────────────────────────────────
const _cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key: string): unknown | null {
  const entry = _cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  _cache.delete(key);
  return null;
}
function setCache(key: string, data: unknown): void {
  _cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

// GET /api/public/entities
// Returns distinct entity names grouped by type, with event counts.
// Query: ?source_ids=id1,id2&type=person|place
entitiesRouter.get('/', async (req, res, next) => {
  try {
    const sourceIds = req.query.source_ids
      ? String(req.query.source_ids).split(',').filter(Boolean)
      : undefined;
    const typeFilter = req.query.type as string | undefined;

    // Cache key: keyed by source filter + type filter
    const cacheKey = `${sourceIds?.length ? [...sourceIds].sort().join(',') : 'all'}:${typeFilter ?? ''}`;

    const cached = getCached(cacheKey);
    if (cached) {
      res.json({ data: cached });
      return;
    }

    let query = db('event_entities as ee')
      .join('diary_events as de', 'de.id', 'ee.event_id')
      .join('diary_sources as ds', 'ds.id', 'de.source_id')
      .where('ds.is_enabled', true)
      .where('ee.confidence', '>=', 0.5)
      .select(
        'ee.entity_name',
        'ee.entity_type',
        db.raw('MAX(ee.entity_id::text)::uuid as entity_id'),
        db.raw('COUNT(DISTINCT de.id) as event_count'),
      )
      .groupBy('ee.entity_name', 'ee.entity_type');

    if (sourceIds && sourceIds.length > 0) {
      query = query.whereIn('de.source_id', sourceIds);
    }
    if (typeFilter) {
      query = query.where('ee.entity_type', typeFilter);
    }

    const entities = await query.orderBy('event_count', 'desc').limit(200);

    setCache(cacheKey, entities);
    res.json({ data: entities });
  } catch (err) {
    next(err);
  }
});
