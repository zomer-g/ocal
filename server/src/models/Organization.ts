import { db } from '../config/database.js';

const TABLE = 'organizations';

export const OrganizationModel = {
  async findAll() {
    return db(TABLE).orderBy('name');
  },

  async findById(id: string) {
    return db(TABLE).where({ id }).first();
  },

  async create(data: { name: string; website?: string; description?: string }) {
    const [row] = await db(TABLE).insert(data).returning('*');
    return row;
  },

  async update(id: string, data: Partial<{ name: string; website: string; description: string }>) {
    const [row] = await db(TABLE).where({ id }).update(data).returning('*');
    return row;
  },

  async delete(id: string) {
    return db(TABLE).where({ id }).del();
  },

  async search(query: string) {
    return db(TABLE)
      .whereRaw('name ILIKE ?', [`%${query}%`])
      .orderBy('name')
      .limit(20);
  },
};
