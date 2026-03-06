import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Enable extensions
  await knex.raw('CREATE EXTENSION IF NOT EXISTS pg_trgm');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS unaccent');

  // Hebrew-compatible text search configuration (simple tokenizer, no stemming)
  await knex.raw(`
    DO $$ BEGIN
      CREATE TEXT SEARCH CONFIGURATION hebrew (COPY = simple);
      ALTER TEXT SEARCH CONFIGURATION hebrew
        ALTER MAPPING FOR word, asciiword, hword, hword_part
        WITH unaccent, simple;
    EXCEPTION WHEN unique_violation THEN NULL;
    END $$
  `);

  // Full-text search trigger for diary_events
  await knex.raw(`
    CREATE OR REPLACE FUNCTION diary_events_search_trigger() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('hebrew', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('hebrew', COALESCE(NEW.location, '')), 'B') ||
        setweight(to_tsvector('hebrew', COALESCE(NEW.participants, '')), 'B') ||
        setweight(to_tsvector('hebrew', COALESCE(NEW.dataset_name, '')), 'C');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await knex.raw(`
    CREATE TRIGGER trg_events_search
      BEFORE INSERT OR UPDATE OF title, location, participants, dataset_name
      ON diary_events
      FOR EACH ROW
      EXECUTE FUNCTION diary_events_search_trigger()
  `);

  // GIN index for full-text search
  await knex.raw('CREATE INDEX idx_events_search ON diary_events USING GIN (search_vector)');

  // Trigram indexes for fuzzy/partial matching
  await knex.raw('CREATE INDEX idx_events_title_trgm ON diary_events USING GIN (title gin_trgm_ops)');
  await knex.raw('CREATE INDEX idx_events_location_trgm ON diary_events USING GIN (location gin_trgm_ops) WHERE location IS NOT NULL');
  await knex.raw('CREATE INDEX idx_events_participants_trgm ON diary_events USING GIN (participants gin_trgm_ops) WHERE participants IS NOT NULL');

  // Trigram indexes for people and organizations name search
  await knex.raw('CREATE INDEX idx_organizations_name_trgm ON organizations USING GIN (name gin_trgm_ops)');
  await knex.raw('CREATE INDEX idx_people_name_trgm ON people USING GIN (name gin_trgm_ops)');

  // updated_at trigger function
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at() RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  // Apply updated_at trigger to all relevant tables
  const tables = ['organizations', 'people', 'diary_sources', 'diary_events', 'admin_users'];
  for (const table of tables) {
    await knex.raw(`
      CREATE TRIGGER trg_updated_at BEFORE UPDATE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION update_updated_at()
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  const tables = ['organizations', 'people', 'diary_sources', 'diary_events', 'admin_users'];
  for (const table of tables) {
    await knex.raw(`DROP TRIGGER IF EXISTS trg_updated_at ON ${table}`);
  }

  await knex.raw('DROP TRIGGER IF EXISTS trg_events_search ON diary_events');
  await knex.raw('DROP FUNCTION IF EXISTS diary_events_search_trigger()');
  await knex.raw('DROP FUNCTION IF EXISTS update_updated_at()');

  await knex.raw('DROP INDEX IF EXISTS idx_events_search');
  await knex.raw('DROP INDEX IF EXISTS idx_events_title_trgm');
  await knex.raw('DROP INDEX IF EXISTS idx_events_location_trgm');
  await knex.raw('DROP INDEX IF EXISTS idx_events_participants_trgm');
  await knex.raw('DROP INDEX IF EXISTS idx_organizations_name_trgm');
  await knex.raw('DROP INDEX IF EXISTS idx_people_name_trgm');

  await knex.raw('DROP TEXT SEARCH CONFIGURATION IF EXISTS hebrew');
}
