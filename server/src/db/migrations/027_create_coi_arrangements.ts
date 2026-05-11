import type { Knex } from 'knex';

/**
 * Conflict-of-interest arrangements (הסדרי ניגוד עניינים).
 *
 * Each row = one PDF + structured metadata. Origins:
 *   - 'odata'      — imported from ODATA via search for "ניגוד עניינים"
 *   - 'gov_il_zip' — extracted from a bulk ZIP uploaded by the admin
 *
 * Reviewed columns mirror migration 026 so the same review badge logic
 * works uniformly across all document kinds.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('coi_arrangements', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('origin').notNullable();

    t.uuid('person_id').references('id').inTable('people').onDelete('SET NULL');
    t.uuid('organization_id').references('id').inTable('organizations').onDelete('SET NULL');
    t.text('subject_name_raw').notNullable();

    t.text('title').notNullable();
    t.date('document_date');
    t.text('source_url');

    t.text('filename').notNullable();
    t.text('mime_type').notNullable().defaultTo('application/pdf');
    t.integer('file_size').notNullable();
    t.binary('file_data').notNullable(); // bytea
    t.text('file_hash').notNullable().unique();

    t.uuid('import_batch_id'); // groups all rows from one ZIP upload

    t.uuid('uploaded_by').references('id').inTable('admin_users').onDelete('SET NULL');
    t.timestamp('reviewed_at', { useTz: true });
    t.uuid('reviewed_by').references('id').inTable('admin_users').onDelete('SET NULL');
    t.text('review_notes');

    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index('origin', 'idx_coi_origin');
    t.index('person_id', 'idx_coi_person');
    t.index('organization_id', 'idx_coi_org');
    t.index('import_batch_id', 'idx_coi_batch');
  });

  await knex.raw(`
    ALTER TABLE coi_arrangements
    ADD CONSTRAINT coi_arrangements_origin_check
    CHECK (origin IN ('odata', 'gov_il_zip'))
  `);

  await knex.raw(`
    CREATE INDEX idx_coi_reviewed ON coi_arrangements(reviewed_at)
    WHERE reviewed_at IS NOT NULL
  `);

  // Reuse the project-wide updated_at trigger function from migration 010
  await knex.raw(`
    CREATE TRIGGER trg_updated_at BEFORE UPDATE ON coi_arrangements
      FOR EACH ROW EXECUTE FUNCTION update_updated_at()
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TRIGGER IF EXISTS trg_updated_at ON coi_arrangements');
  await knex.schema.dropTableIfExists('coi_arrangements');
}
