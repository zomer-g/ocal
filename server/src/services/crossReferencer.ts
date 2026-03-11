/**
 * ============================================================
 * Cross-Reference Service
 * ============================================================
 *
 * Verifies participant mentions across diaries. When person A's
 * calendar mentions person B as a participant, and person B has
 * their own diary — this service checks whether person B's diary
 * also reflects that meeting.
 *
 * Results:
 * - confirmed: person B's diary has a matching event on the same date
 * - unconfirmed: person B has a diary covering this date, but no match
 *
 * Called automatically after entity extraction in the pipeline.
 * ============================================================
 */

import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { jaccard } from './entityExtractor.js';
import { normalizeTitle } from './eventMatcher.js';

// ── Configuration ──
const TITLE_SIMILARITY_THRESHOLD = 0.4; // lower than event matcher's 0.65 — we already know the person should be there

// ── Types ──
export interface CrossRefResult {
  sourceId: string;
  totalMentions: number;
  confirmed: number;
  unconfirmed: number;
  skipped: number;
  errors: string[];
}

interface EntityMention {
  entity_id: string;       // event_entities.id
  event_id: string;        // diary_events.id
  entity_name: string;
  person_id: string;       // the resolved person
  event_date: string;
  event_title: string;
  match_group_id: string | null;
}

interface TargetEvent {
  id: string;
  title: string;
  event_date: string;
  match_group_id: string | null;
  start_time: string;
}

interface TargetSource {
  id: string;
  person_id: string;
  first_event_date: string;
  last_event_date: string;
}

// ── Main entry point ──
export async function crossReferenceForSource(
  sourceId: string,
  options?: { isResync?: boolean },
): Promise<CrossRefResult> {
  const result: CrossRefResult = {
    sourceId,
    totalMentions: 0,
    confirmed: 0,
    unconfirmed: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // Step 0: Get the source's own person_id to exclude self-references
    const source = await db('diary_sources')
      .where({ id: sourceId })
      .select('person_id')
      .first();

    // Step 1: If resync, delete existing cross-refs for this source
    if (options?.isResync) {
      const deleted = await db('entity_cross_refs')
        .whereIn('source_event_id', function () {
          this.select('id').from('diary_events').where({ source_id: sourceId });
        })
        .del();
      if (deleted > 0) {
        logger.info({ sourceId, deleted }, 'Cleared cross-refs for resync');
      }
    }

    // Step 2: Fetch all person entity mentions for this source
    const mentions: EntityMention[] = await db('event_entities as ee')
      .join('diary_events as de', 'ee.event_id', 'de.id')
      .where('de.source_id', sourceId)
      .where('de.is_active', true)
      .where('ee.entity_type', 'person')
      .whereNotNull('ee.entity_id')
      .where('ee.confidence', '>=', 0.5)
      .whereIn('ee.role', ['participant', 'mentioned'])
      .select(
        'ee.id as entity_id',
        'ee.event_id as event_id',
        'ee.entity_name',
        'ee.entity_id as person_id',
        'de.event_date',
        'de.title as event_title',
        'de.match_group_id',
      );

    // Exclude self-references
    const filtered = source?.person_id
      ? mentions.filter((m) => m.person_id !== source.person_id)
      : mentions;

    result.totalMentions = filtered.length;
    if (filtered.length === 0) {
      logger.info({ sourceId }, 'No cross-referenceable mentions found');
      return result;
    }

    // Step 3: Load target person→sources lookup
    const uniquePersonIds = [...new Set(filtered.map((m) => m.person_id))];
    const targetSources: TargetSource[] = await db('diary_sources')
      .whereIn('person_id', uniquePersonIds)
      .where('is_enabled', true)
      .whereNotNull('first_event_date')
      .whereNotNull('last_event_date')
      .select('id', 'person_id', 'first_event_date', 'last_event_date');

    // Build person → sources map
    const personSourceMap = new Map<string, TargetSource[]>();
    for (const ts of targetSources) {
      if (!personSourceMap.has(ts.person_id)) {
        personSourceMap.set(ts.person_id, []);
      }
      personSourceMap.get(ts.person_id)!.push(ts);
    }

    // Step 4: Process each mention
    const upsertRows: Array<{
      event_entity_id: string;
      source_event_id: string;
      target_person_id: string;
      target_source_id: string;
      status: 'confirmed' | 'unconfirmed';
      matched_event_id: string | null;
      match_method: string | null;
      match_score: number | null;
      event_date: string;
    }> = [];

    for (const mention of filtered) {
      const sources = personSourceMap.get(mention.person_id);
      if (!sources || sources.length === 0) {
        result.skipped++;
        continue;
      }

      const eventDateStr = typeof mention.event_date === 'string'
        ? mention.event_date.split('T')[0]
        : new Date(mention.event_date as unknown as string).toISOString().split('T')[0];

      for (const targetSource of sources) {
        // Skip if this is the same source
        if (targetSource.id === sourceId) continue;

        // Check date coverage
        const firstDate = typeof targetSource.first_event_date === 'string'
          ? targetSource.first_event_date.split('T')[0]
          : new Date(targetSource.first_event_date as unknown as string).toISOString().split('T')[0];
        const lastDate = typeof targetSource.last_event_date === 'string'
          ? targetSource.last_event_date.split('T')[0]
          : new Date(targetSource.last_event_date as unknown as string).toISOString().split('T')[0];

        if (eventDateStr < firstDate || eventDateStr > lastDate) {
          result.skipped++;
          continue;
        }

        // Try to find a matching event in the target source
        const matchResult = await findMatchInSource(mention, targetSource.id, eventDateStr);

        upsertRows.push({
          event_entity_id: mention.entity_id,
          source_event_id: mention.event_id,
          target_person_id: mention.person_id,
          target_source_id: targetSource.id,
          status: matchResult.found ? 'confirmed' : 'unconfirmed',
          matched_event_id: matchResult.eventId,
          match_method: matchResult.method,
          match_score: matchResult.score,
          event_date: eventDateStr,
        });

        if (matchResult.found) {
          result.confirmed++;
        } else {
          result.unconfirmed++;
        }
      }
    }

    // Step 5: Bulk upsert
    if (upsertRows.length > 0) {
      const BATCH_SIZE = 200;
      for (let i = 0; i < upsertRows.length; i += BATCH_SIZE) {
        const batch = upsertRows.slice(i, i + BATCH_SIZE);
        await db('entity_cross_refs')
          .insert(batch)
          .onConflict(['event_entity_id', 'target_source_id'])
          .merge({
            status: db.raw('EXCLUDED.status'),
            matched_event_id: db.raw('EXCLUDED.matched_event_id'),
            match_method: db.raw('EXCLUDED.match_method'),
            match_score: db.raw('EXCLUDED.match_score'),
            event_date: db.raw('EXCLUDED.event_date'),
          });
      }
    }

    logger.info(
      { sourceId, totalMentions: result.totalMentions, confirmed: result.confirmed, unconfirmed: result.unconfirmed, skipped: result.skipped },
      'Cross-referencing complete',
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    result.errors.push(errMsg);
    logger.error({ sourceId, err }, 'Cross-referencing failed');
  }

  return result;
}

// ── Match finding ──

interface MatchResult {
  found: boolean;
  eventId: string | null;
  method: string | null;
  score: number | null;
}

async function findMatchInSource(
  mention: EntityMention,
  targetSourceId: string,
  eventDateStr: string,
): Promise<MatchResult> {
  // Method 1: Match via match_group_id (highest confidence)
  if (mention.match_group_id) {
    const groupMatch: TargetEvent | undefined = await db('diary_events')
      .where({
        source_id: targetSourceId,
        match_group_id: mention.match_group_id,
        is_active: true,
      })
      .select('id', 'title', 'event_date', 'match_group_id', 'start_time')
      .first();

    if (groupMatch) {
      return {
        found: true,
        eventId: groupMatch.id,
        method: 'match_group',
        score: 1.0,
      };
    }
  }

  // Method 2: Title similarity on the same date
  const sameDateEvents: TargetEvent[] = await db('diary_events')
    .where({
      source_id: targetSourceId,
      event_date: eventDateStr,
      is_active: true,
    })
    .select('id', 'title', 'event_date', 'match_group_id', 'start_time');

  if (sameDateEvents.length === 0) {
    return { found: false, eventId: null, method: null, score: null };
  }

  const normalizedMention = normalizeTitle(mention.event_title);

  let bestScore = 0;
  let bestEvent: TargetEvent | null = null;

  for (const evt of sameDateEvents) {
    const normalizedTarget = normalizeTitle(evt.title);
    const score = jaccard(normalizedMention, normalizedTarget);
    if (score > bestScore && score >= TITLE_SIMILARITY_THRESHOLD) {
      bestScore = score;
      bestEvent = evt;
    }
  }

  if (bestEvent) {
    return {
      found: true,
      eventId: bestEvent.id,
      method: 'title_similarity',
      score: bestScore,
    };
  }

  return { found: false, eventId: null, method: null, score: null };
}
