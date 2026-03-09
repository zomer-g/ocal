import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Settings table (key-value)
  await knex.schema.createTable('automation_settings', (t) => {
    t.text('key').primary();
    t.jsonb('value').notNullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Seed defaults
  await knex('automation_settings').insert([
    { key: 'auto_scan_enabled', value: JSON.stringify(false) },
    { key: 'auto_scan_interval_hours', value: JSON.stringify(12) },
    { key: 'auto_import_confidence_threshold', value: JSON.stringify(0.9) },
    { key: 'owner_confidence_threshold', value: JSON.stringify(0.9) },
  ]);

  // Queue for resources pending review or auto-imported
  await knex.schema.createTable('auto_import_queue', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('resource_id').notNullable().unique();
    t.text('dataset_id').notNullable();
    t.text('dataset_title').notNullable();
    t.text('resource_name');
    t.text('resource_format');
    t.text('organization');
    t.text('odata_dataset_url');
    t.text('odata_resource_url');

    // Profiling results
    t.jsonb('fields');
    t.jsonb('sample_records');
    t.integer('total_records');

    // Mapping analysis
    t.jsonb('suggested_mapping');
    t.text('mapping_method');
    t.float('mapping_confidence');
    t.specificType('mapping_issues', 'text[]');

    // Owner identification
    t.uuid('suggested_person_id').references('id').inTable('people').onDelete('SET NULL');
    t.text('suggested_person_name');
    t.float('person_confidence');
    t.uuid('suggested_org_id').references('id').inTable('organizations').onDelete('SET NULL');
    t.text('suggested_org_name');
    t.float('org_confidence');
    t.jsonb('owner_signals');

    // Decision
    t.text('status').notNullable().defaultTo('pending');
    t.text('failure_reason');
    t.text('suggested_name');
    t.text('suggested_color').defaultTo('#3B82F6');

    // Result
    t.uuid('imported_source_id').references('id').inTable('diary_sources').onDelete('SET NULL');

    // Timestamps
    t.timestamp('discovered_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('reviewed_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index('status');
  });

  await knex.raw(`
    ALTER TABLE auto_import_queue
    ADD CONSTRAINT auto_import_queue_status_check
    CHECK (status IN ('pending','auto_imported','approved','rejected','error'))
  `);

  // Scan activity log
  await knex.schema.createTable('auto_import_logs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.timestamp('scan_started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('scan_completed_at', { useTz: true });
    t.integer('resources_discovered').defaultTo(0);
    t.integer('resources_new').defaultTo(0);
    t.integer('resources_auto_imported').defaultTo(0);
    t.integer('resources_queued').defaultTo(0);
    t.integer('resources_skipped').defaultTo(0);
    t.specificType('errors', 'text[]');
    t.integer('duration_ms');
  });

  // Expand diary_exceptions reason check to include auto_rejected
  await knex.raw(`
    ALTER TABLE diary_exceptions
    DROP CONSTRAINT IF EXISTS diary_exceptions_reason_check
  `);
  await knex.raw(`
    ALTER TABLE diary_exceptions
    ADD CONSTRAINT diary_exceptions_reason_check
    CHECK (exception_reason IN ('duplicate','unsupported_format','manual','auto_rejected'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('auto_import_logs');
  await knex.schema.dropTableIfExists('auto_import_queue');
  await knex.schema.dropTableIfExists('automation_settings');

  // Restore original constraint
  await knex.raw(`
    ALTER TABLE diary_exceptions
    DROP CONSTRAINT IF EXISTS diary_exceptions_reason_check
  `);
  await knex.raw(`
    ALTER TABLE diary_exceptions
    ADD CONSTRAINT diary_exceptions_reason_check
    CHECK (exception_reason IN ('duplicate','unsupported_format','manual'))
  `);
}
