import type { Knex } from 'knex';

/**
 * Allow diary_sources rows that aren't backed by a CKAN resource — needed
 * for the manual / LLM-assisted PDF ingestion workflow. CKAN sources still
 * fill in dataset_id + resource_id; manual sources leave them NULL.
 *
 * Mirrors the pattern already used on diary_events.ckan_row_id: nullable
 * column with a partial UNIQUE index that only enforces uniqueness when
 * the value is set, so two manual sources don't collide on NULL.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE diary_sources ALTER COLUMN dataset_id DROP NOT NULL');
  await knex.raw('ALTER TABLE diary_sources ALTER COLUMN resource_id DROP NOT NULL');

  // Drop the original unconditional UNIQUE on resource_id and replace with a
  // partial unique index. Postgres auto-named the constraint
  // "diary_sources_resource_id_unique"; drop it tolerantly in case the name
  // ever differs.
  await knex.raw('ALTER TABLE diary_sources DROP CONSTRAINT IF EXISTS diary_sources_resource_id_unique');
  await knex.raw('DROP INDEX IF EXISTS diary_sources_resource_id_unique');

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_diary_sources_resource_id_unique
    ON diary_sources(resource_id)
    WHERE resource_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Reversing this is only safe if no manual (NULL resource_id) sources exist.
  await knex.raw('DROP INDEX IF EXISTS idx_diary_sources_resource_id_unique');
  await knex.raw(`
    ALTER TABLE diary_sources
    ADD CONSTRAINT diary_sources_resource_id_unique UNIQUE (resource_id)
  `);
  await knex.raw('ALTER TABLE diary_sources ALTER COLUMN resource_id SET NOT NULL');
  await knex.raw('ALTER TABLE diary_sources ALTER COLUMN dataset_id SET NOT NULL');
}
