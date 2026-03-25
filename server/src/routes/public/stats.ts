import { Router } from 'express';
import { db } from '../../config/database.js';

export const statsRouter = Router();

// Simple in-memory cache — stats change rarely, no need to hit DB every request
let statsCache: { data: object; expiresAt: number } | null = null;
const STATS_TTL_MS = 5 * 60 * 1000; // 5 minutes

// GET /api/public/stats — Public stats for the hero section
statsRouter.get('/', async (_req, res, next) => {
  try {
    if (statsCache && Date.now() < statsCache.expiresAt) {
      res.json(statsCache.data);
      return;
    }

    const [eventsResult, sourcesResult, orgsResult] = await Promise.all([
      db('diary_events').where({ is_active: true }).count('* as count').first(),
      db('diary_sources').where({ is_enabled: true }).count('* as count').first(),
      db('diary_sources')
        .where({ is_enabled: true })
        .whereNotNull('organization_id')
        .countDistinct('organization_id as count')
        .first(),
    ]);

    const data = {
      total_events: Number(eventsResult?.count ?? 0),
      total_sources: Number(sourcesResult?.count ?? 0),
      total_organizations: Number(orgsResult?.count ?? 0),
    };

    statsCache = { data, expiresAt: Date.now() + STATS_TTL_MS };
    res.json(data);
  } catch (err) {
    next(err);
  }
});
