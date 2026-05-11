import type { Knex } from 'knex';

/**
 * Originally created a `coi_arrangements` table for a conflict-of-interest
 * feature that was added in error and reverted in commits 12bf018+d634c02.
 *
 * On environments where the original version of this migration already ran
 * (i.e. the production DB), migration 028 drops the table.
 *
 * This file is now a no-op so a fresh DB never creates the table at all.
 * Kept in place so the knex_migrations log on production stays valid.
 */

export async function up(_knex: Knex): Promise<void> {
  // no-op — see header comment.
}

export async function down(_knex: Knex): Promise<void> {
  // no-op.
}
