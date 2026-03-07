/**
 * ============================================================
 * Cross-Diary Event Matcher
 * ============================================================
 *
 * Identifies events that appear across multiple diaries by
 * comparing events on the same date using title similarity.
 *
 * Called automatically after every diary sync/import.
 * Uses the existing `similar_events` table and adds
 * `match_group_id` FK on `diary_events` for fast lookups.
 * ============================================================
 */

import { db } from '../config/database.js';
import { jaccard } from './entityExtractor.js';

// ── Configuration ──
const MATCH_THRESHOLD = 0.65;

// ── Title normalization ──
const NIKUD_RE = /[\u0591-\u05C7]/g;
const ZERO_WIDTH_RE = /[\u200B-\u200F\uFEFF]/g;
const COMMON_PREFIXES_RE = /^(פגישה עם |פגישת |ישיבה בנושא |ישיבת |דיון בנושא |דיון על |ביקור ב|השתתפות ב|נוכחות ב)/;
const ABBREVIATIONS: Record<string, string> = {
  'רה"מ': 'ראש הממשלה',
  'מנכ"ל': 'מנהל כללי',
  'סמנכ"ל': 'סגן מנהל כללי',
};

function normalizeTitle(title: string): string {
  let t = title.normalize('NFC');
  t = t.replace(NIKUD_RE, '');
  t = t.replace(ZERO_WIDTH_RE, '');
  // Expand abbreviations
  for (const [abbrev, full] of Object.entries(ABBREVIATIONS)) {
    t = t.replace(new RegExp(abbrev.replace(/"/g, '[""״]'), 'g'), full);
  }
  t = t.replace(COMMON_PREFIXES_RE, '');
  t = t.replace(/\s+/g, ' ').trim().toLowerCase();
  return t;
}

// ── Types ──
interface MatcherResult {
  matchesFound: number;
  groupsCreated: number;
  groupsUpdated: number;
  errors: string[];
}

interface EventRow {
  id: string;
  title: string;
  event_date: string;
  source_id: string;
  match_group_id: string | null;
}

// ── Main function ──
export async function findMatchesForSource(
  sourceId: string,
  options?: { isResync?: boolean }
): Promise<MatcherResult> {
  const result: MatcherResult = { matchesFound: 0, groupsCreated: 0, groupsUpdated: 0, errors: [] };

  try {
    // Step 0: Cleanup stale groups on resync
    if (options?.isResync) {
      await cleanupStaleMatchGroups(sourceId);
    }

    // Step 1: Get all active events for this source
    const myEvents: EventRow[] = await db('diary_events')
      .where({ source_id: sourceId, is_active: true })
      .select('id', 'title', 'event_date', 'source_id', 'match_group_id');

    if (myEvents.length === 0) return result;

    // Step 2: Group by event_date
    const dateMap = new Map<string, EventRow[]>();
    for (const ev of myEvents) {
      const dateStr = typeof ev.event_date === 'string'
        ? ev.event_date
        : new Date(ev.event_date as unknown as string).toISOString().split('T')[0];
      if (!dateMap.has(dateStr)) dateMap.set(dateStr, []);
      dateMap.get(dateStr)!.push(ev);
    }

    const uniqueDates = Array.from(dateMap.keys());

    // Step 3: Batch-fetch events from OTHER sources on these dates
    const otherEvents: EventRow[] = await db('diary_events')
      .whereIn('event_date', uniqueDates)
      .whereNot('source_id', sourceId)
      .where('is_active', true)
      .select('id', 'title', 'event_date', 'source_id', 'match_group_id');

    // Group other events by date
    const otherByDate = new Map<string, EventRow[]>();
    for (const ev of otherEvents) {
      const dateStr = typeof ev.event_date === 'string'
        ? ev.event_date
        : new Date(ev.event_date as unknown as string).toISOString().split('T')[0];
      if (!otherByDate.has(dateStr)) otherByDate.set(dateStr, []);
      otherByDate.get(dateStr)!.push(ev);
    }

    // Step 4: Match events per date
    for (const [dateStr, dayEvents] of dateMap) {
      const others = otherByDate.get(dateStr);
      if (!others || others.length === 0) continue;

      for (const myEvent of dayEvents) {
        // Skip if already matched
        if (myEvent.match_group_id) continue;

        const normalizedMy = normalizeTitle(myEvent.title);
        // Skip very short titles (single word like "דיון") to avoid false positives
        if (normalizedMy.split(/\s+/).length < 2 && normalizedMy.length < 6) continue;

        let bestScore = 0;
        let bestMatch: EventRow | null = null;

        for (const other of others) {
          // Must be from a DIFFERENT source
          if (other.source_id === myEvent.source_id) continue;

          const normalizedOther = normalizeTitle(other.title);
          const score = jaccard(normalizedMy, normalizedOther);
          if (score > bestScore && score >= MATCH_THRESHOLD) {
            bestScore = score;
            bestMatch = other;
          }
        }

        if (bestMatch) {
          result.matchesFound++;

          if (bestMatch.match_group_id) {
            // Join existing group
            await addEventToGroup(bestMatch.match_group_id, myEvent.id, myEvent.source_id);
            myEvent.match_group_id = bestMatch.match_group_id;
            result.groupsUpdated++;
          } else {
            // Create new group
            const longerTitle = myEvent.title.length >= bestMatch.title.length
              ? myEvent.title : bestMatch.title;

            const [group] = await db('similar_events')
              .insert({
                representative_event_id: bestMatch.id,
                event_date: dateStr,
                common_title: longerTitle,
                grouped_event_ids: [myEvent.id, bestMatch.id],
                total_events: 2,
                involved_source_ids: [myEvent.source_id, bestMatch.source_id],
              })
              .returning('id');

            const groupId = group.id;

            // Set match_group_id on both events
            await db('diary_events')
              .whereIn('id', [myEvent.id, bestMatch.id])
              .update({ match_group_id: groupId });

            myEvent.match_group_id = groupId;
            bestMatch.match_group_id = groupId;
            result.groupsCreated++;
          }
        }
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    result.errors.push(errMsg);
  }

  return result;
}

// ── Helper: Add event to existing match group ──
async function addEventToGroup(groupId: string, eventId: string, sourceId: string): Promise<void> {
  // Update the similar_events row
  await db('similar_events')
    .where({ id: groupId })
    .update({
      grouped_event_ids: db.raw('array_append(grouped_event_ids, ?::uuid)', [eventId]),
      involved_source_ids: db.raw(
        `CASE WHEN ? = ANY(involved_source_ids) THEN involved_source_ids ELSE array_append(involved_source_ids, ?::uuid) END`,
        [sourceId, sourceId]
      ),
      total_events: db.raw('total_events + 1'),
    });

  // Set match_group_id on the event
  await db('diary_events')
    .where({ id: eventId })
    .update({ match_group_id: groupId });
}

// ── Cleanup stale match groups when a source is re-synced ──
async function cleanupStaleMatchGroups(sourceId: string): Promise<void> {
  // Find all match groups that include this source
  const staleGroups = await db('similar_events')
    .whereRaw('? = ANY(involved_source_ids)', [sourceId])
    .select('*');

  for (const group of staleGroups) {
    // Recount valid events still in the group
    const validEvents = await db('diary_events')
      .whereIn('id', group.grouped_event_ids)
      .where({ is_active: true })
      .select('id', 'source_id');

    // Filter out events from the re-syncing source (they'll be re-imported)
    const remaining = validEvents.filter((e: { source_id: string }) => e.source_id !== sourceId);

    if (remaining.length <= 1) {
      // Group is now invalid — delete it
      await db('diary_events')
        .where({ match_group_id: group.id })
        .update({ match_group_id: null });
      await db('similar_events').where({ id: group.id }).del();
    } else {
      // Update the group to reflect remaining events
      const remainingIds = remaining.map((e: { id: string }) => e.id);
      const remainingSourceIds = [...new Set(remaining.map((e: { source_id: string }) => e.source_id))];
      await db('similar_events').where({ id: group.id }).update({
        grouped_event_ids: remainingIds,
        involved_source_ids: remainingSourceIds,
        total_events: remaining.length,
      });
      // Clear match_group_id for removed events
      await db('diary_events')
        .where({ match_group_id: group.id })
        .whereNot('source_id', sourceId)
        .whereNotIn('id', remainingIds)
        .update({ match_group_id: null });
    }
  }
}
