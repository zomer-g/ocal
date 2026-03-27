import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('auto_import_logs', (t) => {
    t.text('trigger_type').defaultTo('manual'); // 'manual' | 'auto'
  });

  // Backfill: mark all existing entries as 'manual' (unknown, but safe default)
  await knex('auto_import_logs').whereNull('trigger_type').update({ trigger_type: 'manual' });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('auto_import_logs', (t) => {
    t.dropColumn('trigger_type');
  });
}
