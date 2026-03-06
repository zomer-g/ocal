import { db } from '../config/database.js';

const TABLE = 'diary_exceptions';

export const DiaryExceptionModel = {
  async findAll() {
    return db(TABLE).orderBy('moved_at', 'desc');
  },

  async findByResourceId(resourceId: string) {
    return db(TABLE).where({ resource_id: resourceId }).first();
  },

  async create(data: Record<string, unknown>) {
    const [row] = await db(TABLE).insert(data).returning('*');
    return row;
  },

  async delete(id: string) {
    return db(TABLE).where({ id }).del();
  },

  async allResourceIds(): Promise<string[]> {
    const rows = await db(TABLE).select('resource_id');
    return rows.map((r) => r.resource_id);
  },
};
