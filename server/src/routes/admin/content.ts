import { Router } from 'express';
import { db } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

export const adminContentRouter = Router();

const ALLOWED_KEYS = ['header', 'footer', 'about'] as const;
type ContentKey = typeof ALLOWED_KEYS[number];

// GET /api/admin/content — Return all site content sections
adminContentRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await db('site_content').select('key', 'value', 'updated_at');
    const content: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        content[row.key] = JSON.parse(row.value);
      } catch {
        content[row.key] = row.value;
      }
    }
    res.json({ content });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/content/:key — Update a single content section
adminContentRouter.put('/:key', async (req, res, next) => {
  const key = req.params.key as ContentKey;
  if (!ALLOWED_KEYS.includes(key)) {
    res.status(400).json({ error: `מפתח לא תקין. מפתחות מותרים: ${ALLOWED_KEYS.join(', ')}` });
    return;
  }

  try {
    const value = JSON.stringify(req.body);
    const existing = await db('site_content').where({ key }).first();

    if (existing) {
      await db('site_content').where({ key }).update({ value, updated_at: new Date() });
    } else {
      await db('site_content').insert({ key, value, updated_at: new Date() });
    }

    logger.info({ key, adminUser: (req as any).adminUser?.email }, 'Site content updated');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
