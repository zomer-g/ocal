import { Router } from 'express';
import { eventsRouter } from './events.js';
import { sourcesRouter } from './sources.js';
import { calendarRouter } from './calendar.js';
import { statsRouter } from './stats.js';
import { contentRouter } from './content.js';

export const publicRoutes = Router();

publicRoutes.use('/events', eventsRouter);
publicRoutes.use('/sources', sourcesRouter);
publicRoutes.use('/calendar', calendarRouter);
publicRoutes.use('/stats', statsRouter);
publicRoutes.use('/content', contentRouter);
