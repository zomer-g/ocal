import { db } from '../config/database.js';

const TABLE = 'diary_events';

export interface EventSearchParams {
  q?: string;
  from_date?: string;
  to_date?: string;
  source_ids?: string[];
  location?: string;
  participants?: string;
  entity_names?: string[];
  sort?: 'date_asc' | 'date_desc' | 'relevance';
  offset: number;
  limit: number;
}

export const DiaryEventModel = {
  async search(params: EventSearchParams) {
    let query = db(TABLE + ' as e')
      .join('diary_sources as s', 'e.source_id', 's.id')
      .where('e.is_active', true)
      .where('s.is_enabled', true);

    const selectCols = [
      'e.*',
      's.name as source_name',
      's.color as source_color',
    ];

    // Full-text search
    if (params.q) {
      const tsQuery = params.q
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0)
        .map((w) => `${w}:*`)
        .join(' & ');

      query = query.where(function () {
        this.whereRaw(`e.search_vector @@ to_tsquery('hebrew', ?)`, [tsQuery])
          .orWhereRaw('e.title ILIKE ?', [`%${params.q}%`]);
      });

      selectCols.push(
        db.raw(`ts_rank_cd(e.search_vector, to_tsquery('hebrew', ?)) as rank`, [tsQuery]) as unknown as string
      );
    }

    if (params.from_date) {
      query = query.where('e.event_date', '>=', params.from_date);
    }
    if (params.to_date) {
      query = query.where('e.event_date', '<=', params.to_date);
    }
    if (params.source_ids?.length) {
      query = query.whereIn('e.source_id', params.source_ids);
    }
    if (params.location) {
      query = query.whereRaw('e.location ILIKE ?', [`%${params.location}%`]);
    }
    if (params.participants) {
      query = query.whereRaw('e.participants ILIKE ?', [`%${params.participants}%`]);
    }
    if (params.entity_names?.length) {
      query = query.whereExists(function () {
        this.select(db.raw('1'))
          .from('event_entities as ee')
          .whereRaw('ee.event_id = e.id')
          .whereIn('ee.entity_name', params.entity_names!);
      });
    }

    // Count total
    const countQuery = query.clone().clearSelect().clearOrder().count('* as total').first();

    // Sort
    if (params.q && params.sort === 'relevance') {
      query = query.orderByRaw('rank DESC NULLS LAST');
    } else if (params.sort === 'date_asc') {
      query = query.orderBy('e.start_time', 'asc');
    } else {
      query = query.orderBy('e.start_time', 'desc');
    }

    query = query.select(selectCols).offset(params.offset).limit(params.limit);

    const [rows, countResult] = await Promise.all([query, countQuery]);

    return {
      rows,
      total: Number(countResult?.total ?? 0),
    };
  },

  async findById(id: string) {
    return db(TABLE + ' as e')
      .join('diary_sources as s', 'e.source_id', 's.id')
      .select('e.*', 's.name as source_name', 's.color as source_color')
      .where('e.id', id)
      .first();
  },

  async findByDateRange(from: string, to: string, sourceIds?: string[]) {
    let query = db(TABLE + ' as e')
      .join('diary_sources as s', 'e.source_id', 's.id')
      .select('e.*', 's.name as source_name', 's.color as source_color')
      .where('e.is_active', true)
      .where('s.is_enabled', true)
      .where('e.event_date', '>=', from)
      .where('e.event_date', '<=', to)
      .orderBy('e.start_time', 'asc');

    if (sourceIds?.length) {
      query = query.whereIn('e.source_id', sourceIds);
    }

    return query;
  },

  async countByDateRange(from: string, to: string, sourceIds?: string[]) {
    let query = db(TABLE + ' as e')
      .join('diary_sources as s', 'e.source_id', 's.id')
      .where('e.is_active', true)
      .where('s.is_enabled', true)
      .where('e.event_date', '>=', from)
      .where('e.event_date', '<=', to)
      .select('e.event_date')
      .count('* as count')
      .groupBy('e.event_date');

    if (sourceIds?.length) {
      query = query.whereIn('e.source_id', sourceIds);
    }

    const rows = await query;
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const dateStr = typeof row.event_date === 'string'
        ? row.event_date
        : new Date(row.event_date as unknown as string).toISOString().split('T')[0];
      counts[dateStr] = Number(row.count);
    }
    return counts;
  },

  async findByDate(date: string) {
    return db(TABLE)
      .where({ event_date: date, is_active: true })
      .orderBy('start_time');
  },

  async bulkUpsert(events: Record<string, unknown>[]) {
    if (events.length === 0) return { created: 0, skipped: 0 };

    const result = await db(TABLE)
      .insert(events)
      .onConflict(db.raw('(source_id, ckan_row_id) WHERE ckan_row_id IS NOT NULL'))
      .merge()
      .returning('id');

    return { created: result.length, skipped: events.length - result.length };
  },

  async deleteBySource(sourceId: string) {
    return db(TABLE).where({ source_id: sourceId }).del();
  },

  async softDelete(id: string) {
    return db(TABLE).where({ id }).update({ is_active: false });
  },

  async update(id: string, data: Record<string, unknown>) {
    const [row] = await db(TABLE).where({ id }).update(data).returning('*');
    return row;
  },
};
