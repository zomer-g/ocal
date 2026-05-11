import type { Knex } from 'knex';

/**
 * Document-level "reviewed" flag. Applies to every kind of source document
 * the system stores. Derived rows (diary_events, mk_expenses, event_entities,
 * entity_cross_refs) inherit the reviewed state via JOIN at read time —
 * no triggers, no cache.
 *
 * Three columns per table:
 *   - reviewed_at  TIMESTAMPTZ   when the content manager pressed approve
 *   - reviewed_by  UUID          who pressed it (FK admin_users, SET NULL)
 *   - review_notes TEXT          optional free-form note
 *
 * Existing rows stay reviewed_at=NULL — no automatic trust on past imports.
 */

const TABLES = ['manual_diary_uploads', 'mk_expense_imports', 'diary_sources'] as const;

export async function up(knex: Knex): Promise<void> {
  for (const table of TABLES) {
    await knex.raw(`
      ALTER TABLE ${table}
      ADD COLUMN reviewed_at  TIMESTAMPTZ,
      ADD COLUMN reviewed_by  UUID REFERENCES admin_users(id) ON DELETE SET NULL,
      ADD COLUMN review_notes TEXT
    `);
    await knex.raw(`
      CREATE INDEX idx_${table}_reviewed ON ${table}(reviewed_at) WHERE reviewed_at IS NOT NULL
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const table of TABLES) {
    await knex.raw(`DROP INDEX IF EXISTS idx_${table}_reviewed`);
    await knex.raw(`ALTER TABLE ${table} DROP COLUMN IF EXISTS review_notes`);
    await knex.raw(`ALTER TABLE ${table} DROP COLUMN IF EXISTS reviewed_by`);
    await knex.raw(`ALTER TABLE ${table} DROP COLUMN IF EXISTS reviewed_at`);
  }
}
