import type { Knex } from 'knex';

/**
 * Hebrew abbreviations like מח"ש, פ"ע, שליט"א use a geresh/gershayim
 * (״ U+05F4, ׳ U+05F3) — often substituted with ASCII " or '. The simple
 * tokenizer treats these as word boundaries, so מח"ש indexes as two tokens
 * (מח, ש) and a query for מח"ש degenerates into "word starting with מח AND
 * word starting with ש", matching thousands of unrelated events.
 *
 * Fix: strip these characters before tokenization on both sides — index
 * (this trigger) and query (buildTsQuery in DiaryEvent.ts) — so the
 * abbreviation collapses into a single token (מחש) that matches verbatim.
 */

const STRIP_GERESH = `'[״׳"'']'`;

export async function up(knex: Knex): Promise<void> {
  await knex.raw('SET statement_timeout = 0');

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

  await knex.raw(`
    UPDATE diary_events SET search_vector =
      setweight(to_tsvector('hebrew', regexp_replace(COALESCE(title, ''), ${STRIP_GERESH}, '', 'g')), 'A') ||
      setweight(to_tsvector('hebrew', regexp_replace(COALESCE(location, ''), ${STRIP_GERESH}, '', 'g')), 'B') ||
      setweight(to_tsvector('hebrew', regexp_replace(COALESCE(participants, ''), ${STRIP_GERESH}, '', 'g')), 'B') ||
      setweight(to_tsvector('hebrew', regexp_replace(COALESCE(dataset_name, ''), ${STRIP_GERESH}, '', 'g')), 'C')
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('SET statement_timeout = 0');

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
    UPDATE diary_events SET search_vector =
      setweight(to_tsvector('hebrew', COALESCE(title, '')), 'A') ||
      setweight(to_tsvector('hebrew', COALESCE(location, '')), 'B') ||
      setweight(to_tsvector('hebrew', COALESCE(participants, '')), 'B') ||
      setweight(to_tsvector('hebrew', COALESCE(dataset_name, '')), 'C')
  `);
}
