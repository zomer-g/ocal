import { Router } from 'express';
import { db } from '../../config/database.js';

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
