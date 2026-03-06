import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('diary_exceptions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('dataset_title').notNullable();
    t.text('resource_id').notNullable().unique();
    t.text('dataset_id');
    t.text('dataset_url');
    t.text('resource_format');
    t.text('resource_name');
    t.text('exception_reason').notNullable();
    t.timestamp('moved_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index('resource_id');
  });

  await knex.raw(`
    ALTER TABLE diary_exceptions
    ADD CONSTRAINT diary_exceptions_reason_check
    CHECK (exception_reason IN ('duplicate','unsupported_format','manual'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('diary_exceptions');
}
