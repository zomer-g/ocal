import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('diary_events', (t) => {
    t.uuid('match_group_id')
      .references('id')
      .inTable('similar_events')
      .onDelete('SET NULL');
    t.index('match_group_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('diary_events', (t) => {
    t.dropColumn('match_group_id');
  });
}
