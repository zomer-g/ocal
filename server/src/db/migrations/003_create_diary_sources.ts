import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('diary_sources', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('name').notNullable();
    t.text('dataset_id').notNullable();
    t.text('resource_id').notNullable().unique();
    t.text('dataset_url');
    t.text('resource_url');
    t.string('color', 7).notNullable().defaultTo('#3B82F6');
    t.boolean('is_enabled').notNullable().defaultTo(true);
    t.timestamp('last_sync_at', { useTz: true });
    t.string('sync_status', 20).notNullable().defaultTo('pending');
    t.text('sync_error');
    t.integer('total_events').notNullable().defaultTo(0);
    t.date('first_event_date');
    t.date('last_event_date');
    t.uuid('person_id').references('id').inTable('people').onDelete('SET NULL');
    t.uuid('organization_id').references('id').inTable('organizations').onDelete('SET NULL');
    t.jsonb('field_mapping');
    t.jsonb('ckan_metadata');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index('dataset_id');
    t.index('person_id');
    t.index('organization_id');
  });

  await knex.raw(`
    ALTER TABLE diary_sources
    ADD CONSTRAINT diary_sources_sync_status_check
    CHECK (sync_status IN ('pending','syncing','completed','failed'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('diary_sources');
}
