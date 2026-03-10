import type { Knex } from 'knex';

/**
 * Add performance indexes for the public entities aggregation query.
 *
 * The query joins event_entities → diary_events → diary_sources
 * with WHERE confidence >= 0.5 AND ds.is_enabled = true,
 * then GROUP BY entity_name, entity_type with COUNT(DISTINCT de.id).
 *
 * These indexes target the hot path:
 *  1. Partial covering index on event_entities for confidence >= 0.5
 *  2. Composite index on diary_events(source_id, event_date, id)
 *     for fast source + date range filtering with covering id column
 *  3. Partial index on diary_sources for enabled sources (small table, but avoids seq scan)
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Partial index: skip low-confidence rows entirely.
  //    Covers the join column (event_id) and the GROUP BY columns.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_ee_high_conf_covering
    ON event_entities (event_id, entity_type, entity_name)
    WHERE confidence >= 0.5
  `);

  // 2. Covering composite on diary_events for source + date + id (the COUNT target).
  //    The existing idx_events_source_date covers (source_id, event_date)
  //    but not the id column needed for COUNT(DISTINCT de.id).
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_events_source_date_id
    ON diary_events (source_id, event_date, id)
  `);

  // 3. Partial index on diary_sources for enabled sources.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_sources_enabled
    ON diary_sources (id) WHERE is_enabled = true
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_ee_high_conf_covering');
  await knex.raw('DROP INDEX IF EXISTS idx_events_source_date_id');
  await knex.raw('DROP INDEX IF EXISTS idx_sources_enabled');
}
