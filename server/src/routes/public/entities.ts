import { Router } from 'express';
import { db } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

export const entitiesRouter = Router();

// ── In-memory cache with separate TTLs ──────────────────────────────────
const _cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000;      // 5 minutes for filtered queries
const ALL_CACHE_TTL = 15 * 60 * 1000; // 15 minutes for the unfiltered "all" query

function getCached(key: string): unknown | null {
  const entry = _cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  _cache.delete(key);
  return null;
}
function setCache(key: string, data: unknown, ttl = CACHE_TTL): void {
  _cache.set(key, { data, expiresAt: Date.now() + ttl });
}

/** Run the entities aggregation query.
 *  Optimized: first get valid event IDs, then aggregate entities.
 *  Avoids expensive 3-way JOIN + GROUP BY that was timing out.
 */
async function queryEntities(opts: {
  sourceIds?: string[];
  typeFilter?: string;
  fromDate?: string;
  toDate?: string;
}) {
  // Use subqueries to avoid passing hundreds of IDs as parameters
  const enabledSourcesSubquery = db('diary_sources').where('is_enabled', true).select('id');

  // Build event filter as subquery
  let eventQuery = db('diary_events')
    .whereIn('source_id', opts.sourceIds?.length
      ? opts.sourceIds  // user-specified filter (small)
      : enabledSourcesSubquery  // subquery, not 421 inline IDs
    );
  if (opts.fromDate) eventQuery = eventQuery.where('event_date', '>=', opts.fromDate);
  if (opts.toDate) eventQuery = eventQuery.where('event_date', '<=', opts.toDate);

  // Aggregate entities for those events only
  let query = db('event_entities as ee')
    .where('ee.confidence', '>=', 0.5)
    .whereIn('ee.event_id', eventQuery.select('id'))
    .select(
      'ee.entity_name',
      'ee.entity_type',
      db.raw('MAX(ee.entity_id::text)::uuid as entity_id'),
      db.raw('COUNT(DISTINCT ee.event_id) as event_count'),
    )
    .groupBy('ee.entity_name', 'ee.entity_type');

  if (opts.typeFilter) {
    query = query.where('ee.entity_type', opts.typeFilter);
  }

  return query.orderBy('event_count', 'desc').limit(200);
}

/** Pre-warm the "all" cache on startup so the first page load is fast. */
export async function warmEntityCache(): Promise<void> {
  try {
    const entities = await queryEntities({});
    setCache('all:::', entities, ALL_CACHE_TTL);
    logger.info(`Entity cache warmed: ${entities.length} entities`);
  } catch (err) {
    logger.warn({ err }, 'Failed to warm entity cache (non-fatal)');
  }
}

// GET /api/public/entities
entitiesRouter.get('/', async (req, res, next) => {
  try {
    const sourceIds = req.query.source_ids
      ? String(req.query.source_ids).split(',').filter(Boolean)
      : undefined;
    const typeFilter = req.query.type as string | undefined;
    const fromDate = req.query.from_date as string | undefined;
    const toDate = req.query.to_date as string | undefined;

    const isAllQuery = !sourceIds?.length && !typeFilter && !fromDate && !toDate;
    const cacheKey = `${sourceIds?.length ? [...sourceIds].sort().join(',') : 'all'}:${typeFilter ?? ''}:${fromDate ?? ''}:${toDate ?? ''}`;

    const cached = getCached(cacheKey);
    if (cached) {
      // Allow browsers / CDN to cache for 2 minutes
      res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
      res.json({ data: cached });
      return;
    }

    const entities = await queryEntities({ sourceIds, typeFilter, fromDate, toDate });

    setCache(cacheKey, entities, isAllQuery ? ALL_CACHE_TTL : CACHE_TTL);
    res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
    res.json({ data: entities });
  } catch (err) {
    next(err);
  }
});
