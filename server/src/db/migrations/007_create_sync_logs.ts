import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('sync_logs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('source_id').notNullable().references('id').inTable('diary_sources').onDelete('CASCADE');
    t.text('job_id');
    t.string('status', 20).notNullable();
    t.integer('records_fetched').defaultTo(0);
    t.integer('records_created').defaultTo(0);
    t.integer('records_updated').defaultTo(0);
    t.integer('records_skipped').defaultTo(0);
    t.text('error_message');
    t.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('completed_at', { useTz: true });
    t.integer('duration_ms');
  });

  await knex.raw(`
    ALTER TABLE sync_logs
    ADD CONSTRAINT sync_logs_status_check
    CHECK (status IN ('started','in_progress','completed','failed'))
  `);

  await knex.raw('CREATE INDEX idx_sync_logs_source ON sync_logs (source_id, started_at DESC)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sync_logs');
}
