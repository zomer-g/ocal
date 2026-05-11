import type { Knex } from 'knex';

/**
 * Two-tier role system for admin_users:
 *   - 'admin' — full access (default for all existing rows)
 *   - 'content_manager' — view + edit + approve, but no destructive ops
 *
 * Existing admins keep their access; the column is added with default 'admin'.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE admin_users
    ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'
    CHECK (role IN ('admin', 'content_manager'))
  `);
  await knex.raw('CREATE INDEX idx_admin_users_role ON admin_users(role)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_admin_users_role');
  await knex.raw('ALTER TABLE admin_users DROP COLUMN IF EXISTS role');
}
