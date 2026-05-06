import type { Knex } from 'knex';

/**
 * Storage + draft state for the manual / LLM-assisted PDF ingestion workflow.
 *
 * file_data stores the PDF bytes inline (Render's basic-256mb DB plan).
 * draft_events is the single source of truth while the admin is editing —
 * autosaved on every form change, replayed into diary_events at commit.
 * extraction_result holds the raw + parsed LLM output for review.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('manual_diary_uploads', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('uploaded_by').references('id').inTable('admin_users').onDelete('SET NULL');
    t.uuid('source_id').references('id').inTable('diary_sources').onDelete('SET NULL');

    t.text('filename').notNullable();
    t.text('mime_type').notNullable();
    t.integer('file_size').notNullable();
    t.binary('file_data').notNullable(); // bytea

    t.text('extraction_status').notNullable().defaultTo('pending');
    t.text('extraction_provider'); // 'claude' | 'gpt4o', NULL until extraction is run
    t.jsonb('extraction_result');
    t.text('extraction_error');

    t.jsonb('draft_events').notNullable().defaultTo(knex.raw(`'[]'::jsonb`));

    t.timestamp('committed_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index('source_id');
    t.index('uploaded_by');
  });

  await knex.raw(`
    ALTER TABLE manual_diary_uploads
    ADD CONSTRAINT manual_diary_uploads_status_check
    CHECK (extraction_status IN ('pending','running','completed','failed'))
  `);
  await knex.raw(`
    ALTER TABLE manual_diary_uploads
    ADD CONSTRAINT manual_diary_uploads_provider_check
    CHECK (extraction_provider IS NULL OR extraction_provider IN ('claude','gpt4o'))
  `);

  // Reuse the project-wide updated_at trigger created in migration 010
  await knex.raw(`
    CREATE TRIGGER trg_updated_at BEFORE UPDATE ON manual_diary_uploads
      FOR EACH ROW EXECUTE FUNCTION update_updated_at()
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TRIGGER IF EXISTS trg_updated_at ON manual_diary_uploads');
  await knex.schema.dropTableIfExists('manual_diary_uploads');
}
