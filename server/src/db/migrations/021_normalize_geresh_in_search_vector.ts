import type { Knex } from 'knex';

/**
 * Hebrew abbreviations like מח"ש, פ"ע, שליט"א use a geresh/gershayim
 * (״ U+05F4, ׳ U+05F3) — often substituted with ASCII " or '. The simple
 * tokenizer treats these as word boundaries, so מח"ש indexes as two tokens
 * (מח, ש) and a query for מח"ש degenerates into "word starting with מח AND
 * word starting with ש", matching thousands of unrelated events.
 *
 * This migration ONLY swaps the trigger function — fast, sub-second — so
 * deploys never block on a multi-minute data backfill again. The bulk
 * rebuild of existing rows lives in
 * server/src/scripts/backfill-search-vectors.ts and is run once, manually
 * (e.g. `npm run backfill:search-vectors --workspace=server` via Render
 * shell). New / updated rows are tokenized correctly immediately.
 *
 * The migration also drops any leftover _sv_geresh_v2 column / index from
 * the previous (timed-out) attempt at an inline backfill, so the database
 * is left in a clean state regardless of how far that run got.
 */

const STRIP_GERESH = `'[״׳"'']'`;

export async function up(knex: Knex): Promise<void> {
  // Clean up any leftover state from the timed-out v1 attempt
  await knex.raw('DROP INDEX IF EXISTS idx_diary_events_sv_geresh_pending');
  await knex.raw('ALTER TABLE diary_events DROP COLUMN IF EXISTS _sv_geresh_v2');

  // Replace the trigger so future inserts/updates strip geresh
  await knex.raw(`
    CREATE OR REPLACE FUNCTION diary_events_search_trigger() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('hebrew', regexp_replace(COALESCE(NEW.title, ''), ${STRIP_GERESH}, '', 'g')), 'A') ||
        setweight(to_tsvector('hebrew', regexp_replace(COALESCE(NEW.location, ''), ${STRIP_GERESH}, '', 'g')), 'B') ||
        setweight(to_tsvector('hebrew', regexp_replace(COALESCE(NEW.participants, ''), ${STRIP_GERESH}, '', 'g')), 'B') ||
        setweight(to_tsvector('hebrew', regexp_replace(COALESCE(NEW.dataset_name, ''), ${STRIP_GERESH}, '', 'g')), 'C');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
}

export async function down(knex: Knex): Promise<void> {
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
}
