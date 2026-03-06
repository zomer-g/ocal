import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── 1. Add unique index on people.name for bulk-import upsert ──
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_people_name_unique ON people (name)
  `);

  // ── 2. Create event_entities junction table ──
  await knex.schema.createTable('event_entities', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table
      .uuid('event_id')
      .notNullable()
      .references('id')
      .inTable('diary_events')
      .onDelete('CASCADE');

    table.text('entity_type').notNullable()
      .checkIn(['person', 'organization', 'place'], 'event_entities_entity_type_check');

    // Nullable: NULL means entity was extracted but not matched to a known record
    table.uuid('entity_id').nullable();

    table.text('entity_name').notNullable(); // normalized resolved/raw name

    table.text('role').notNullable()
      .checkIn(['owner', 'participant', 'location', 'mentioned'], 'event_entities_role_check');

    table.text('raw_mention').nullable(); // exact substring from source text

    table.float('confidence').notNullable().defaultTo(1.0);

    table.text('extraction_method').notNullable()
      .checkIn(['owner', 'participant_parse', 'ai_ner'], 'event_entities_method_check');

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── 3. Indexes ──

  // Primary access: all entities for an event
  await knex.raw(`
    CREATE INDEX idx_event_entities_event ON event_entities (event_id)
  `);

  // Reverse: all events that mention a specific known entity
  await knex.raw(`
    CREATE INDEX idx_event_entities_entity_id ON event_entities (entity_id)
    WHERE entity_id IS NOT NULL
  `);

  // Browse: all mentions of a given name+type across all sources
  await knex.raw(`
    CREATE INDEX idx_event_entities_name_type ON event_entities (entity_type, entity_name)
  `);

  // Idempotency: prevent duplicate entries on re-run
  await knex.raw(`
    CREATE UNIQUE INDEX idx_event_entities_unique
    ON event_entities (event_id, entity_type, entity_name, role)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('event_entities');
  await knex.raw(`DROP INDEX IF EXISTS idx_people_name_unique`);
}
