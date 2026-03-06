import { db } from '../config/database.js';

const TABLE = 'people';

export const PersonModel = {
  async findAll() {
    return db(TABLE)
      .leftJoin('organizations', 'people.organization_id', 'organizations.id')
      .select('people.*', 'organizations.name as organization_name')
      .orderBy('people.name');
  },

  async findById(id: string) {
    return db(TABLE)
      .leftJoin('organizations', 'people.organization_id', 'organizations.id')
      .select('people.*', 'organizations.name as organization_name')
      .where('people.id', id)
      .first();
  },

  async create(data: { name: string; wikipedia_link?: string; notes?: string; organization_id?: string }) {
    const [row] = await db(TABLE).insert(data).returning('*');
    return row;
  },

  async update(id: string, data: Partial<{ name: string; wikipedia_link: string; notes: string; organization_id: string }>) {
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
