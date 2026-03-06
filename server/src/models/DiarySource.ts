import { db } from '../config/database.js';

const TABLE = 'diary_sources';

export const DiarySourceModel = {
  async findAll(enabledOnly = false) {
    let query = db(TABLE)
      .leftJoin('people', 'diary_sources.person_id', 'people.id')
      .leftJoin('organizations', 'diary_sources.organization_id', 'organizations.id')
      .select(
        'diary_sources.*',
        'people.name as person_name',
        'organizations.name as organization_name'
      )
      .orderBy('diary_sources.name');

    if (enabledOnly) {
      query = query.where('diary_sources.is_enabled', true);
    }
    return query;
  },

  async findById(id: string) {
    return db(TABLE)
      .leftJoin('people', 'diary_sources.person_id', 'people.id')
      .leftJoin('organizations', 'diary_sources.organization_id', 'organizations.id')
      .select(
        'diary_sources.*',
        'people.name as person_name',
        'organizations.name as organization_name'
      )
      .where('diary_sources.id', id)
      .first();
  },

  async findByResourceId(resourceId: string) {
    return db(TABLE).where({ resource_id: resourceId }).first();
  },

  async create(data: Record<string, unknown>) {
    const [row] = await db(TABLE).insert(data).returning('*');
    return row;
  },

  async update(id: string, data: Record<string, unknown>) {
    const [row] = await db(TABLE).where({ id }).update(data).returning('*');
    return row;
  },

  async delete(id: string) {
    return db(TABLE).where({ id }).del();
  },

  async updateStats(id: string) {
    const stats = await db('diary_events')
      .where({ source_id: id, is_active: true })
      .select(
        db.raw('COUNT(*)::int as total_events'),
        db.raw('MIN(event_date) as first_event_date'),
        db.raw('MAX(event_date) as last_event_date')
      )
      .first();

    return this.update(id, {
      total_events: stats?.total_events ?? 0,
      first_event_date: stats?.first_event_date,
      last_event_date: stats?.last_event_date,
    });
  },

  async toggleEnabled(id: string) {
    await db(TABLE)
      .where({ id })
      .update({ is_enabled: db.raw('NOT is_enabled') });
    return this.findById(id);
  },
};
