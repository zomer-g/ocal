import { db } from '../config/database.js';

const TABLE = 'similar_events';

export const SimilarEventModel = {
  async findByDateRange(from: string, to: string, offset = 0, limit = 50) {
    const query = db(TABLE)
      .where('event_date', '>=', from)
      .where('event_date', '<=', to)
      .orderBy('event_date', 'desc')
      .offset(offset)
      .limit(limit);

    const countQuery = db(TABLE)
      .where('event_date', '>=', from)
      .where('event_date', '<=', to)
      .count('* as total')
      .first();

    const [rows, countResult] = await Promise.all([query, countQuery]);
    return { rows, total: Number(countResult?.total ?? 0) };
  },

  async create(data: Record<string, unknown>) {
    const [row] = await db(TABLE).insert(data).returning('*');
    return row;
  },

  async deleteByYear(year: number) {
    return db(TABLE)
      .where('event_date', '>=', `${year}-01-01`)
      .where('event_date', '<=', `${year}-12-31`)
      .del();
  },

  async delete(id: string) {
    return db(TABLE).where({ id }).del();
  },
};
