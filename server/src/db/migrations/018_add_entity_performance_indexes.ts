import type { Knex } from 'knex';

/**
 * Add performance indexes for slow event_entities queries.
 *
 * Three query patterns are timing out in production:
 *
 * 1. Entity aggregation (public /entities endpoint):
 *    GROUP BY entity_name, entity_type with COUNT(DISTINCT de.id)
 *    → Needs an index leading with the GROUP BY columns, not event_id.
 *
 * 2. Entity ILIKE search (admin entities endpoint):
 *    WHERE entity_name ILIKE $1 GROUP BY entity_name, entity_type
 *    → Needs a trigram GIN index for pattern matching.
 *
 * 3. Event search filtered by entity (public /events endpoint):
 *    WHERE LOWER(TRIM(ee.entity_name)) IN (...)
 *    → Needs a functional index on the expression.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Covering index for the entity aggregation GROUP BY.
  //    The existing idx_ee_high_conf_covering leads with event_id which
  //    doesn't help GROUP BY entity_name, entity_type.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_ee_agg_name_type
    ON event_entities (entity_name, entity_type, event_id)
    WHERE confidence >= 0.5
  `);

  // 2. Trigram GIN index for ILIKE pattern matching on entity_name.
  //    Requires pg_trgm extension.
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_ee_entity_name_trgm
    ON event_entities USING gin (entity_name gin_trgm_ops)
  `);

  // 3. Functional index for LOWER(TRIM(entity_name)) used in event search.
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_ee_entity_name_lower_trim
    ON event_entities (LOWER(TRIM(entity_name)), event_id)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_ee_agg_name_type');
  await knex.raw('DROP INDEX IF EXISTS idx_ee_entity_name_trgm');
  await knex.raw('DROP INDEX IF EXISTS idx_ee_entity_name_lower_trim');
}
