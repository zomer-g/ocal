import { Worker } from 'bullmq';
import { env } from '../config/env.js';
const connection = { url: env.REDIS_URL };
import { logger } from '../utils/logger.js';

// Sync source worker
const syncWorker = new Worker(
  'sync-source',
  async (job) => {
    logger.info({ jobId: job.id, data: job.data }, 'Processing sync-source job');
    // TODO: Implement in Phase 2
    throw new Error('Not implemented yet');
  },
  { connection, concurrency: 3 }
);

syncWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Sync job completed');
});

syncWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err }, 'Sync job failed');
});

// Find similar events worker
const similarWorker = new Worker(
  'find-similar',
  async (job) => {
    logger.info({ jobId: job.id, data: job.data }, 'Processing find-similar job');
    // TODO: Implement in Phase 4
    throw new Error('Not implemented yet');
  },
  { connection, concurrency: 1 }
);

logger.info('Worker started, waiting for jobs...');
