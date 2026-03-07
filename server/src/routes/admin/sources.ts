import { Router } from 'express';
import { db } from '../../config/database.js';
import { extractEntitiesForSource } from '../../services/entityExtractor.js';
import { logger } from '../../utils/logger.js';

export const adminSourcesRouter = Router();

// GET /api/admin/sources — list all sources with full metadata
adminSourcesRouter.get('/', async (_req, res, next) => {
  try {
    const sources = await db('diary_sources')
      .leftJoin('people', 'diary_sources.person_id', 'people.id')
      .leftJoin('organizations', 'diary_sources.organization_id', 'organizations.id')
      .select(
        'diary_sources.*',
        'people.name as person_name',
        'organizations.name as organization_name'
      )
      .orderBy('diary_sources.created_at', 'desc');

    res.json({ data: sources });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/sources/:id — single source with details
adminSourcesRouter.get('/:id', async (req, res, next) => {
  try {
    const source = await db('diary_sources')
      .leftJoin('people', 'diary_sources.person_id', 'people.id')
      .leftJoin('organizations', 'diary_sources.organization_id', 'organizations.id')
      .select(
        'diary_sources.*',
        'people.name as person_name',
        'organizations.name as organization_name'
      )
      .where('diary_sources.id', req.params.id)
      .first();

    if (!source) {
      res.status(404).json({ error: 'Source not found' });
      return;
    }

    res.json(source);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/sources/:id — update source (name, color, enabled)
adminSourcesRouter.patch('/:id', async (req, res, next) => {
  try {
    const { name, color, is_enabled } = req.body;
    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name;
    if (color !== undefined) update.color = color;
    if (is_enabled !== undefined) update.is_enabled = is_enabled;

    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    const [updated] = await db('diary_sources')
      .where({ id: req.params.id })
      .update(update)
      .returning('*');

    if (!updated) {
      res.status(404).json({ error: 'Source not found' });
      return;
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/sources/:id — delete source and all its events
adminSourcesRouter.delete('/:id', async (req, res, next) => {
  try {
    const source = await db('diary_sources').where({ id: req.params.id }).first();
    if (!source) {
      res.status(404).json({ error: 'Source not found' });
      return;
    }

    // Delete events first, then source (cascade should handle this but be explicit)
    const deletedEvents = await db('diary_events').where({ source_id: req.params.id }).del();
    await db('diary_sources').where({ id: req.params.id }).del();

    res.json({ deleted: true, events_deleted: deletedEvents });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// Entity extraction routes
// ─────────────────────────────────────────────

// POST /api/admin/sources/:id/extract-entities
// Body: { skip_ai?: boolean, clear_existing?: boolean }
// Synchronous: waits for extraction to complete and returns the result.
adminSourcesRouter.post('/:id/extract-entities', async (req, res, next) => {
  try {
    const source = await db('diary_sources').where({ id: req.params.id }).first();
    if (!source) {
      res.status(404).json({ error: 'Source not found' });
      return;
    }

    const skipAI = req.body.skip_ai !== false; // default: skip AI (Stage 1+2 only)
    const clearExisting = req.body.clear_existing === true;

    const result = await extractEntitiesForSource(req.params.id, { skipAI, clearExisting });
    logger.info({ sourceId: req.params.id, result }, 'Entity extraction completed');

    let message = result.entitiesInserted > 0
      ? `נחלצו ${result.entitiesInserted} ישויות מתוך ${result.eventsProcessed} אירועים`
      : `לא נמצאו ישויות ב-${result.eventsProcessed} אירועים`;
    if (result.errors.length > 0) {
      message += `\n${result.errors.join('\n')}`;
    }

    res.json({
      source_id: req.params.id,
      events_processed: result.eventsProcessed,
      entities_inserted: result.entitiesInserted,
      errors: result.errors,
      message,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/sources/:id/entities
// Query: ?page=1&limit=50&type=person&role=&matched_only=false
adminSourcesRouter.get('/:id/entities', async (req, res, next) => {
  try {
    const sourceId = req.params.id;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
    const offset = (page - 1) * limit;
    const typeFilter = req.query.type as string | undefined;
    const roleFilter = req.query.role as string | undefined;
    const matchedOnly = req.query.matched_only === 'true';

    // Base query: join event_entities with diary_events filtered by source
    let query = db('event_entities as ee')
      .join('diary_events as de', 'de.id', 'ee.event_id')
      .where('de.source_id', sourceId)
      .select(
        'ee.id',
        'ee.event_id',
        'de.title as event_title',
        'de.event_date',
        'ee.entity_type',
        'ee.entity_id',
        'ee.entity_name',
        'ee.role',
        'ee.raw_mention',
        'ee.confidence',
        'ee.extraction_method',
        'ee.created_at'
      );

    if (typeFilter) query = query.where('ee.entity_type', typeFilter);
    if (roleFilter) query = query.where('ee.role', roleFilter);
    if (matchedOnly) query = query.whereNotNull('ee.entity_id');

    const countQuery = query.clone().count('ee.id as cnt').first();
    const [countRow, data] = await Promise.all([
      countQuery,
      query.orderBy('de.event_date', 'asc').orderBy('ee.entity_name').limit(limit).offset(offset),
    ]);

    const total = Number((countRow as { cnt: string } | undefined)?.cnt ?? 0);

    // Stats aggregation
    const stats = await db('event_entities as ee')
      .join('diary_events as de', 'de.id', 'ee.event_id')
      .where('de.source_id', sourceId)
      .select(
        db.raw('COUNT(*) as total'),
        db.raw(`SUM(CASE WHEN ee.entity_type = 'person' THEN 1 ELSE 0 END) as person_count`),
        db.raw(`SUM(CASE WHEN ee.entity_type = 'organization' THEN 1 ELSE 0 END) as organization_count`),
        db.raw(`SUM(CASE WHEN ee.entity_type = 'place' THEN 1 ELSE 0 END) as place_count`),
        db.raw(`SUM(CASE WHEN ee.extraction_method = 'owner' THEN 1 ELSE 0 END) as owner_count`),
        db.raw(`SUM(CASE WHEN ee.extraction_method = 'participant_parse' THEN 1 ELSE 0 END) as participant_parse_count`),
        db.raw(`SUM(CASE WHEN ee.extraction_method = 'ai_ner' THEN 1 ELSE 0 END) as ai_ner_count`),
        db.raw(`SUM(CASE WHEN ee.entity_id IS NOT NULL THEN 1 ELSE 0 END) as matched_count`)
      )
      .first();

    res.json({
      data,
      total,
      page,
      limit,
      stats: {
        total: Number(stats?.total ?? 0),
        by_type: {
          person: Number(stats?.person_count ?? 0),
          organization: Number(stats?.organization_count ?? 0),
          place: Number(stats?.place_count ?? 0),
        },
        by_method: {
          owner: Number(stats?.owner_count ?? 0),
          participant_parse: Number(stats?.participant_parse_count ?? 0),
          ai_ner: Number(stats?.ai_ner_count ?? 0),
        },
        matched: Number(stats?.matched_count ?? 0),
        unmatched: Number(stats?.total ?? 0) - Number(stats?.matched_count ?? 0),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────
// Entity rename & merge routes
// ─────────────────────────────────────────────

// PATCH /api/admin/sources/entities/:entityId/rename
// Body: { new_name: string }
adminSourcesRouter.patch('/entities/:entityId/rename', async (req, res, next) => {
  try {
    const { entityId } = req.params;
    const { new_name } = req.body;

    if (!new_name || typeof new_name !== 'string' || !new_name.trim()) {
      res.status(400).json({ error: 'new_name is required' });
      return;
    }

    const entity = await db('event_entities').where({ id: entityId }).first();
    if (!entity) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }

    const [updated] = await db('event_entities')
      .where({ id: entityId })
      .update({ entity_name: new_name.trim() })
      .returning('*');

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/sources/entities/merge
// Body: { source_entity_ids: string[], target_name: string, target_entity_id?: string }
// Merges multiple entity rows: updates entity_name to target_name, optionally sets entity_id,
// then removes duplicates (same event_id + entity_type + entity_name + role).
adminSourcesRouter.post('/entities/merge', async (req, res, next) => {
  try {
    const { source_entity_ids, target_name, target_entity_id } = req.body;

    if (!Array.isArray(source_entity_ids) || source_entity_ids.length < 2) {
      res.status(400).json({ error: 'source_entity_ids must contain at least 2 IDs' });
      return;
    }
    if (!target_name || typeof target_name !== 'string' || !target_name.trim()) {
      res.status(400).json({ error: 'target_name is required' });
      return;
    }

    const result = await db.transaction(async (trx) => {
      const updatePayload: Record<string, unknown> = { entity_name: target_name.trim() };
      if (target_entity_id !== undefined) {
        updatePayload.entity_id = target_entity_id || null;
      }

      await trx('event_entities')
        .whereIn('id', source_entity_ids)
        .update(updatePayload);

      // Remove duplicates: keep the one with highest confidence per unique combo
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
            WHERE id = ANY(?)
          ) sub
          WHERE rn > 1
        )
        RETURNING id
      `, [source_entity_ids]);

      return {
        updated: source_entity_ids.length,
        duplicates_removed: dupes.rows?.length ?? 0,
      };
    });

    logger.info({ source_entity_ids, target_name, result }, 'Entity merge completed');
    res.json({
      message: `מוזגו ${result.updated} ישויות ל-"${target_name.trim()}"`,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/sources/entities/bulk-rename
// Body: { old_name: string, new_name: string, entity_type?: string }
// Renames all occurrences of an entity name across all sources.
adminSourcesRouter.post('/entities/bulk-rename', async (req, res, next) => {
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

    res.json({
      message: `שונו ${updated} רשומות מ-"${old_name}" ל-"${new_name.trim()}"`,
      updated,
    });
  } catch (err) {
    next(err);
  }
});
