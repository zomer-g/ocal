import { Router } from 'express';
import { db } from '../../config/database.js';

export const contentRouter = Router();

// GET /api/public/content — Return all site content for public rendering
contentRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await db('site_content').select('key', 'value');
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
