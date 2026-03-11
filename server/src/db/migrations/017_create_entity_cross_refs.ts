/**
 * Migration 017: Create entity_cross_refs table
 *
 * Cross-references participant mentions across diaries.
 * When person A's calendar mentions person B as a participant,
 * and person B has their own diary — this table tracks whether
 * person B's diary also reflects the meeting.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS entity_cross_refs (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_entity_id UUID NOT NULL REFERENCES event_entities(id) ON DELETE CASCADE,
      source_event_id UUID NOT NULL REFERENCES diary_events(id) ON DELETE CASCADE,
      target_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      target_source_id UUID NOT NULL REFERENCES diary_sources(id) ON DELETE CASCADE,
      status          TEXT NOT NULL CHECK (status IN ('confirmed', 'unconfirmed')),
      matched_event_id UUID REFERENCES diary_events(id) ON DELETE SET NULL,
      match_method    TEXT CHECK (match_method IN ('match_group', 'title_similarity', 'time_overlap')),
      match_score     REAL,
      event_date      DATE NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT uq_cross_ref_entity_source UNIQUE (event_entity_id, target_source_id)
    );

    CREATE INDEX IF NOT EXISTS idx_cross_refs_source_event
      ON entity_cross_refs (source_event_id);

    CREATE INDEX IF NOT EXISTS idx_cross_refs_target_person_status
      ON entity_cross_refs (target_person_id, status);

    CREATE INDEX IF NOT EXISTS idx_cross_refs_status_date
      ON entity_cross_refs (status, event_date);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS entity_cross_refs CASCADE;`);
}
