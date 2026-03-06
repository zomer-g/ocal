import { db } from '../config/database.js';

const TABLE = 'sync_logs';

export const SyncLogModel = {
  async create(data: { source_id: string; job_id?: string; status: string }) {
    const [row] = await db(TABLE).insert(data).returning('*');
    return row;
  },

  async complete(
    id: string,
    data: {
      records_fetched: number;
      records_created: number;
      records_updated?: number;
      records_skipped: number;
    }
  ) {
    const now = new Date();
    const log = await db(TABLE).where({ id }).first();
    const duration_ms = log ? now.getTime() - new Date(log.started_at).getTime() : 0;

    const [row] = await db(TABLE)
      .where({ id })
      .update({
        ...data,
        status: 'completed',
        completed_at: now,
        duration_ms,
      })
      .returning('*');
    return row;
  },

  async fail(id: string, errorMessage: string) {
    const now = new Date();
    const log = await db(TABLE).where({ id }).first();
    const duration_ms = log ? now.getTime() - new Date(log.started_at).getTime() : 0;

    const [row] = await db(TABLE)
      .where({ id })
      .update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: now,
        duration_ms,
      })
      .returning('*');
    return row;
  },

  async findBySource(sourceId: string, limit = 10) {
    return db(TABLE)
      .where({ source_id: sourceId })
      .orderBy('started_at', 'desc')
      .limit(limit);
  },
};
