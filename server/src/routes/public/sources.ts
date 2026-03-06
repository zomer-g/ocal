import { Router } from 'express';
import { DiarySourceModel } from '../../models/DiarySource.js';

export const sourcesRouter = Router();

// GET /api/public/sources
sourcesRouter.get('/', async (_req, res, next) => {
  try {
    const sources = await DiarySourceModel.findAll(true);
    res.json({ data: sources });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/sources/:id
sourcesRouter.get('/:id', async (req, res, next) => {
  try {
    const source = await DiarySourceModel.findById(req.params.id);
    if (!source) {
      res.status(404).json({ error: 'Source not found' });
      return;
    }
    res.json(source);
  } catch (err) {
    next(err);
  }
});
