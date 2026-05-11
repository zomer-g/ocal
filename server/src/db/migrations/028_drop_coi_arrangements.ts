import type { Knex } from 'knex';

/**
 * Revert migration 027 (coi_arrangements).
 *
 * The conflict-of-interest feature was added in error; the data type and
 * its ingest paths belong in the sister project at ocoi.org.il, not in
 * ocal. This migration cleans up the table on any environment where 027
 * has already run.
 *
 * Migration 027's file is retained as a historical record so the
 * knex_migrations log isn't broken on environments where it was applied.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.raw('DROP TRIGGER IF EXISTS trg_updated_at ON coi_arrangements');
  await knex.schema.dropTableIfExists('coi_arrangements');
}

export async function down(knex: Knex): Promise<void> {
  // Intentionally a no-op — we don't want to resurrect a feature we just removed.
  void knex;
}
