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
 *
 * Implementation notes:
 * - transaction: false so a partial run isn't rolled back; rerunning the
 *   migration after a deploy timeout resumes from where it left off via the
 *   _sv_geresh_v2 marker column.
 * - statement_timeout: 0 so the per-batch UPDATE isn't killed by the
 *   default Render statement timeout.
 * - 2,000-row batches keep WAL/memory pressure manageable on basic-256mb.
 */

export const config = { transaction: false };

const STRIP_GERESH = `'[״׳"'']'`;

const REBUILD_VECTOR_SQL = `
  setweight(to_tsvector('hebrew', regexp_replace(COALESCE(de.title, ''), ${STRIP_GERESH}, '', 'g')), 'A') ||
  setweight(to_tsvector('hebrew', regexp_replace(COALESCE(de.location, ''), ${STRIP_GERESH}, '', 'g')), 'B') ||
  setweight(to_tsvector('hebrew', regexp_replace(COALESCE(de.participants, ''), ${STRIP_GERESH}, '', 'g')), 'B') ||
  setweight(to_tsvector('hebrew', regexp_replace(COALESCE(de.dataset_name, ''), ${STRIP_GERESH}, '', 'g')), 'C')
`;

export async function up(knex: Knex): Promise<void> {
  await knex.raw('SET statement_timeout = 0');
  await knex.raw('SET lock_timeout = 0');

  // 1) Replace the trigger so future inserts/updates strip geresh
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

  // 2) Resumable progress marker for the bulk rebuild
  await knex.raw(`
    ALTER TABLE diary_events
    ADD COLUMN IF NOT EXISTS _sv_geresh_v2 BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_diary_events_sv_geresh_pending
    ON diary_events(id) WHERE NOT _sv_geresh_v2
  `);

  // 3) Rebuild search_vector in 2k-row batches until none remain
  // (loop in JS rather than PL/pgSQL so each batch is its own statement —
  // simpler to reason about with statement_timeout = 0 and no surrounding tx)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await knex.raw(`
      WITH batch AS (
        SELECT id FROM diary_events
        WHERE NOT _sv_geresh_v2
        LIMIT 2000
      )
      UPDATE diary_events de
      SET
        search_vector = ${REBUILD_VECTOR_SQL},
        _sv_geresh_v2 = TRUE
      FROM batch
      WHERE de.id = batch.id
    `);
    const affected = (result as { rowCount?: number }).rowCount ?? 0;
    if (affected === 0) break;
  }

  // 4) Drop the marker — fast metadata-only DROP COLUMN in PG
  await knex.raw('DROP INDEX IF EXISTS idx_diary_events_sv_geresh_pending');
  await knex.raw('ALTER TABLE diary_events DROP COLUMN IF EXISTS _sv_geresh_v2');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('SET statement_timeout = 0');
  await knex.raw('SET lock_timeout = 0');

  // Restore the original trigger
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

  // Re-add marker, batch-rebuild without geresh-stripping, then drop
  await knex.raw(`
    ALTER TABLE diary_events
    ADD COLUMN IF NOT EXISTS _sv_geresh_v2 BOOLEAN NOT NULL DEFAULT FALSE
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_diary_events_sv_geresh_pending
    ON diary_events(id) WHERE NOT _sv_geresh_v2
  `);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await knex.raw(`
      WITH batch AS (
        SELECT id FROM diary_events
        WHERE NOT _sv_geresh_v2
        LIMIT 2000
      )
      UPDATE diary_events de
      SET
        search_vector =
          setweight(to_tsvector('hebrew', COALESCE(de.title, '')), 'A') ||
          setweight(to_tsvector('hebrew', COALESCE(de.location, '')), 'B') ||
          setweight(to_tsvector('hebrew', COALESCE(de.participants, '')), 'B') ||
          setweight(to_tsvector('hebrew', COALESCE(de.dataset_name, '')), 'C'),
        _sv_geresh_v2 = TRUE
      FROM batch
      WHERE de.id = batch.id
    `);
    const affected = (result as { rowCount?: number }).rowCount ?? 0;
    if (affected === 0) break;
  }

  await knex.raw('DROP INDEX IF EXISTS idx_diary_events_sv_geresh_pending');
  await knex.raw('ALTER TABLE diary_events DROP COLUMN IF EXISTS _sv_geresh_v2');
}
