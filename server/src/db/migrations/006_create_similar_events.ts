import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('similar_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('representative_event_id').notNullable().references('id').inTable('diary_events').onDelete('CASCADE');
    t.date('event_date').notNullable();
    t.text('common_title').notNullable();
    t.specificType('grouped_event_ids', 'uuid[]').notNullable();
    t.integer('total_events').notNullable().defaultTo(0);
    t.specificType('involved_source_ids', 'uuid[]').notNullable().defaultTo('{}');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index('event_date');
    t.index('representative_event_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('similar_events');
}
