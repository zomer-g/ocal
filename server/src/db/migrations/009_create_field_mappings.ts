import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('field_mappings', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('resource_id').notNullable();
    t.specificType('source_fields', 'text[]').notNullable();
    t.jsonb('mapping').notNullable();
    t.string('mapping_method', 20).notNullable();
    t.float('confidence');
    t.text('llm_model');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index('resource_id');
  });

  await knex.raw(`
    ALTER TABLE field_mappings
    ADD CONSTRAINT field_mappings_method_check
    CHECK (mapping_method IN ('llm','heuristic','manual'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('field_mappings');
}
