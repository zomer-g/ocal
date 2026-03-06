import { Router } from 'express';
import { db } from '../../config/database.js';

export const statsRouter = Router();

// GET /api/public/stats — Public stats for the hero section
statsRouter.get('/', async (_req, res, next) => {
  try {
    const [eventsResult, sourcesResult, orgsResult] = await Promise.all([
      db('diary_events').where({ is_active: true }).count('* as count').first(),
      db('diary_sources').where({ is_enabled: true }).count('* as count').first(),
      db('diary_sources')
        .where({ is_enabled: true })
        .whereNotNull('organization_id')
        .countDistinct('organization_id as count')
        .first(),
    ]);

    res.json({
      total_events: Number(eventsResult?.count ?? 0),
      total_sources: Number(sourcesResult?.count ?? 0),
      total_organizations: Number(orgsResult?.count ?? 0),
    });
  } catch (err) {
    next(err);
  }
});
