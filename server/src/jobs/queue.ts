import { Queue } from 'bullmq';
import { env } from '../config/env.js';

const connection = { url: env.REDIS_URL };

export const syncSourceQueue = new Queue('sync-source', { connection });
export const syncAllQueue = new Queue('sync-all', { connection });
export const findSimilarQueue = new Queue('find-similar', { connection });
export const cleanupQueue = new Queue('cleanup', { connection });
