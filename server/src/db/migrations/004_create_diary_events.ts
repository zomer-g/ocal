import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('diary_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('source_id').notNullable().references('id').inTable('diary_sources').onDelete('CASCADE');
    t.text('title').notNullable();
    t.timestamp('start_time', { useTz: true }).notNullable();
    t.timestamp('end_time', { useTz: true });
    t.text('location');
    t.text('participants');
    t.text('dataset_name').notNullable();
    t.text('dataset_link');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.jsonb('other_fields').defaultTo('{}');
    t.integer('ckan_row_id');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index('source_id');
    t.index('start_time');
  });

  // Generated stored column for event_date (use AT TIME ZONE for immutability in PG17+)
  await knex.raw(`
    ALTER TABLE diary_events
    ADD COLUMN event_date DATE GENERATED ALWAYS AS ((start_time AT TIME ZONE 'UTC')::date) STORED
  `);

  // Search vector column
  await knex.raw(`
    ALTER TABLE diary_events
    ADD COLUMN search_vector tsvector
  `);

  // Indexes
  await knex.raw('CREATE INDEX idx_events_date ON diary_events (event_date)');
  await knex.raw('CREATE INDEX idx_events_source_date ON diary_events (source_id, event_date)');
  await knex.raw('CREATE INDEX idx_events_calendar ON diary_events (event_date, source_id) WHERE is_active = true');

  // Deduplication index
  await knex.raw(`
    CREATE UNIQUE INDEX idx_events_dedup
    ON diary_events (source_id, ckan_row_id)
    WHERE ckan_row_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('diary_events');
}
