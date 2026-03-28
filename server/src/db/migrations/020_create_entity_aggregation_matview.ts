import type { Knex } from 'knex';

/**
 * Create a materialized view for entity aggregation.
 *
 * The live query (GROUP BY entity_name, entity_type with COUNT(DISTINCT event_id))
 * across ~1M event_entities rows times out on Render's free tier (30s limit).
 * A matview pre-computes the aggregation so reads are instant.
 *
 * REFRESH MATERIALIZED VIEW CONCURRENTLY requires a unique index — added below.
 */
export async function up(knex: Knex): Promise<void> {
  // Disable the 30s statement timeout for this migration — the initial
  // materialization scans the full event_entities table.
  await knex.raw('SET statement_timeout = 0');

  await knex.raw(`
    CREATE MATERIALIZED VIEW IF NOT EXISTS mv_entity_counts AS
    SELECT
      ee.entity_name,
      ee.entity_type,
      MAX(ee.entity_id::text)::uuid AS entity_id,
      COUNT(DISTINCT ee.event_id)   AS event_count
    FROM event_entities ee
    WHERE ee.confidence >= 0.5
    GROUP BY ee.entity_name, ee.entity_type
  `);

  // Unique index required for REFRESH CONCURRENTLY
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_entity_counts_unique
    ON mv_entity_counts (entity_name, entity_type)
  `);

  // Index for type-filtered + sorted queries
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_mv_entity_counts_type_count
    ON mv_entity_counts (entity_type, event_count DESC)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP MATERIALIZED VIEW IF EXISTS mv_entity_counts');
}
