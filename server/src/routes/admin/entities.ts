import { Router } from 'express';
import { db } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

export const adminEntitiesRouter = Router();

// ── Stats cache (unfiltered, changes slowly) ──
let _statsCache: { data: Record<string, number>; expiresAt: number } | null = null;
const STATS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// GET /api/admin/entities
// Returns aggregated unique entities across ALL sources, grouped by entity_name + entity_type.
// Query: ?type=person|organization|place&search=...&page=1&limit=100
adminEntitiesRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200)));
    const offset = (page - 1) * limit;
    const typeFilter = req.query.type as string | undefined;
    const search = req.query.search as string | undefined;

    // Main data query — confidence >= 0.5 enables partial index idx_ee_agg_name_type
    let query = db('event_entities as ee')
      .join('diary_events as de', 'de.id', 'ee.event_id')
      .join('diary_sources as ds', 'ds.id', 'de.source_id')
      .where('ee.confidence', '>=', 0.5)
      .select(
        'ee.entity_name',
        'ee.entity_type',
        db.raw('MAX(ee.entity_id::text)::uuid as entity_id'),
        db.raw('COUNT(DISTINCT de.id) as event_count'),
        db.raw('COUNT(DISTINCT de.source_id) as source_count'),
        db.raw('MAX(ee.confidence) as max_confidence'),
        db.raw("string_agg(DISTINCT ee.extraction_method, ',' ORDER BY ee.extraction_method) as methods"),
      )
      .groupBy('ee.entity_name', 'ee.entity_type');

    if (typeFilter) {
      query = query.where('ee.entity_type', typeFilter);
    }
    if (search && search.trim()) {
      query = query.where('ee.entity_name', 'ilike', `%${search.trim()}%`);
    }

    // Count total unique entities
    const countQuery = db.raw(
      `SELECT COUNT(*) as cnt FROM (
        SELECT ee.entity_name, ee.entity_type
        FROM event_entities ee
        JOIN diary_events de ON de.id = ee.event_id
        JOIN diary_sources ds ON ds.id = de.source_id
        WHERE ee.confidence >= 0.5
        ${typeFilter ? `AND ee.entity_type = ?` : ''}
        ${search?.trim() ? `AND ee.entity_name ILIKE ?` : ''}
        GROUP BY ee.entity_name, ee.entity_type
      ) sub`,
      [
        ...(typeFilter ? [typeFilter] : []),
        ...(search?.trim() ? [`%${search.trim()}%`] : []),
      ]
    );

    // Run data + count in parallel (2 connections), then stats from cache
    const [countResult, data] = await Promise.all([
      countQuery,
      query.orderBy('event_count', 'desc').limit(limit).offset(offset),
    ]);

    const total = Number(countResult.rows?.[0]?.cnt ?? 0);

    // Stats: serve from cache to avoid a 3rd heavy query
    let stats = _statsCache && Date.now() < _statsCache.expiresAt ? _statsCache.data : null;
    if (!stats) {
      try {
        const row = await db('event_entities as ee')
          .join('diary_events as de', 'de.id', 'ee.event_id')
          .where('ee.confidence', '>=', 0.5)
          .select(
            db.raw('COUNT(DISTINCT CONCAT(ee.entity_name, ee.entity_type)) as total_unique'),
            db.raw(`COUNT(DISTINCT CASE WHEN ee.entity_type = 'person' THEN ee.entity_name END) as person_count`),
            db.raw(`COUNT(DISTINCT CASE WHEN ee.entity_type = 'organization' THEN ee.entity_name END) as org_count`),
            db.raw(`COUNT(DISTINCT CASE WHEN ee.entity_type = 'place' THEN ee.entity_name END) as place_count`),
          )
          .first();
        stats = {
          total_unique: Number(row?.total_unique ?? 0),
          person: Number(row?.person_count ?? 0),
          organization: Number(row?.org_count ?? 0),
          place: Number(row?.place_count ?? 0),
        };
        _statsCache = { data: stats, expiresAt: Date.now() + STATS_CACHE_TTL };
      } catch {
        // If stats query fails, return zeros — don't block the response
        stats = { total_unique: 0, person: 0, organization: 0, place: 0 };
      }
    }

    res.json({ data, total, page, limit, stats });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/entities/by-name
// Body: { entity_name: string, entity_type: string }
// Deletes ALL event_entity rows for a given entity_name + entity_type.
adminEntitiesRouter.delete('/by-name', async (req, res, next) => {
  try {
    const { entity_name, entity_type } = req.body;

    if (!entity_name || !entity_type) {
      res.status(400).json({ error: 'entity_name and entity_type are required' });
      return;
    }

    const deleted = await db('event_entities')
      .where({ entity_name: entity_name.trim(), entity_type })
      .del();

    logger.info({ entity_name, entity_type, deleted }, 'Entity deleted by name');
    res.json({
      message: `נמחקו ${deleted} רשומות של "${entity_name}"`,
      deleted,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/entities/bulk-rename
// Body: { old_name: string, new_name: string, entity_type?: string }
// Renames all occurrences of an entity name across all sources.
adminEntitiesRouter.post('/bulk-rename', async (req, res, next) => {
  try {
    const { old_name, new_name, entity_type } = req.body;

    if (!old_name || !new_name || !old_name.trim() || !new_name.trim()) {
      res.status(400).json({ error: 'old_name and new_name are required' });
      return;
    }

    let query = db('event_entities').where({ entity_name: old_name.trim() });
    if (entity_type) query = query.where({ entity_type });

    const updated = await query.update({ entity_name: new_name.trim() });

    // Remove any duplicates created by the rename
    await db.raw(`
      DELETE FROM event_entities
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
            ROW_NUMBER() OVER (
              PARTITION BY event_id, entity_type, entity_name, role
              ORDER BY confidence DESC, created_at ASC
            ) as rn
          FROM event_entities
          WHERE entity_name = ?
        ) sub
        WHERE rn > 1
      )
    `, [new_name.trim()]);

    logger.info({ old_name, new_name, entity_type, updated }, 'Entity bulk-renamed');
    res.json({
      message: `שונו ${updated} רשומות מ-"${old_name}" ל-"${new_name.trim()}"`,
      updated,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/entities/merge
// Body: { source_names: Array<{name: string, type: string}>, target_name: string }
// Merges multiple entity names into one target name.
adminEntitiesRouter.post('/merge', async (req, res, next) => {
  try {
    const { source_names, target_name } = req.body;

    if (!Array.isArray(source_names) || source_names.length < 2) {
      res.status(400).json({ error: 'source_names must contain at least 2 entries' });
      return;
    }
    if (!target_name || typeof target_name !== 'string' || !target_name.trim()) {
      res.status(400).json({ error: 'target_name is required' });
      return;
    }

    const result = await db.transaction(async (trx) => {
      let totalUpdated = 0;

      for (const { name, type } of source_names) {
        if (name === target_name.trim()) continue;
        let q = trx('event_entities').where({ entity_name: name });
        if (type) q = q.where({ entity_type: type });
        const count = await q.update({ entity_name: target_name.trim() });
        totalUpdated += count;
      }

      // Remove duplicates
      const dupes = await trx.raw(`
        DELETE FROM event_entities
        WHERE id IN (
          SELECT id FROM (
            SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY event_id, entity_type, entity_name, role
                ORDER BY confidence DESC, created_at ASC
              ) as rn
            FROM event_entities
            WHERE entity_name = ?
          ) sub
          WHERE rn > 1
        )
        RETURNING id
      `, [target_name.trim()]);

      return {
        updated: totalUpdated,
        duplicates_removed: dupes.rows?.length ?? 0,
      };
    });

    logger.info({ source_names, target_name, result }, 'Entity merge completed');
    res.json({
      message: `מוזגו ${result.updated} רשומות ל-"${target_name.trim()}"`,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});
