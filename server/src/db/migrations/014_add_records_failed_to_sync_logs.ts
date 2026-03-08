import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sync_logs', (t) => {
    t.integer('records_failed').defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sync_logs', (t) => {
    t.dropColumn('records_failed');
  });
}
