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

// ── Materialized view helpers ───────────────────────────────────────────

/** Refresh the mv_entity_counts materialized view (non-blocking). */
export async function refreshEntityMatView(): Promise<void> {
  try {
    // Run inside a transaction so SET LOCAL scopes the extended timeout
    await db.transaction(async (trx) => {
      await trx.raw('SET LOCAL statement_timeout = 120000');
      await trx.raw('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_entity_counts');
    });
    logger.info('Materialized view mv_entity_counts refreshed');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If the matview doesn't exist yet (migration not run), log and move on
    if (msg.includes('mv_entity_counts')) {
      logger.warn('mv_entity_counts does not exist yet — skipping refresh');
    } else {
      logger.warn({ err }, 'Failed to refresh mv_entity_counts (non-fatal)');
    }
  }
}

// ── Query functions ─────────────────────────────────────────────────────

/** Fast path: read pre-computed counts from the materialized view. */
async function queryFromMatView(opts: { typeFilter?: string }) {
  let query = db('mv_entity_counts').select('entity_name', 'entity_type', 'entity_id', 'event_count');
  if (opts.typeFilter) {
    query = query.where('entity_type', opts.typeFilter);
  }
  return query.orderBy('event_count', 'desc').limit(200);
}

/** Slow path: live query for filtered requests (specific sources or date range). */
async function queryEntitiesLive(opts: {
  sourceIds?: string[];
  typeFilter?: string;
  fromDate?: string;
  toDate?: string;
}) {
  // Use JOIN instead of nested whereIn — better query plan
  let query = db('event_entities as ee')
    .join('diary_events as de', 'de.id', 'ee.event_id')
    .where('ee.confidence', '>=', 0.5);

  if (opts.sourceIds?.length) {
    query = query.whereIn('de.source_id', opts.sourceIds);
  } else {
    query = query.whereIn('de.source_id', db('diary_sources').where('is_enabled', true).select('id'));
  }
  if (opts.fromDate) query = query.where('de.event_date', '>=', opts.fromDate);
  if (opts.toDate) query = query.where('de.event_date', '<=', opts.toDate);

  if (opts.typeFilter) {
    query = query.where('ee.entity_type', opts.typeFilter);
  }

  return query
    .select(
      'ee.entity_name',
      'ee.entity_type',
      db.raw('MAX(ee.entity_id::text)::uuid as entity_id'),
      db.raw('COUNT(DISTINCT ee.event_id) as event_count'),
    )
    .groupBy('ee.entity_name', 'ee.entity_type')
    .orderBy('event_count', 'desc')
    .limit(200);
}

/** Route to the right query strategy. */
async function queryEntities(opts: {
  sourceIds?: string[];
  typeFilter?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const isUnfiltered = !opts.sourceIds?.length && !opts.fromDate && !opts.toDate;

  if (isUnfiltered) {
    // Fast path: use materialized view
    try {
      return await queryFromMatView({ typeFilter: opts.typeFilter });
    } catch {
      // Matview may not exist yet — fall through to live query
      logger.warn('mv_entity_counts not available — falling back to live query');
    }
  }

  return queryEntitiesLive(opts);
}

/** Pre-warm the "all" cache on startup so the first page load is fast. */
export async function warmEntityCache(): Promise<void> {
  try {
    // Refresh the matview first so the subsequent read is up to date
    await refreshEntityMatView();
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
