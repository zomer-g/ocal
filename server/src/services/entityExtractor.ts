/**
 * ============================================================
 * Entity Extractor Service
 * ============================================================
 *
 * Extracts named entities (persons, organizations, places) from
 * imported diary events in three stages:
 *
 * Stage 1 — Owner link (free, O(1) SQL)
 *   Links the diary source's person_id to ALL events as role=owner.
 *
 * Stage 2 — Participant parse (free, in-memory fuzzy match)
 *   Splits the `participants` field and fuzzy-matches names against
 *   the known people/organizations registry. Also matches `location`.
 *
 * Stage 3 — AI NER (paid, batched)
 *   Sends event text to DeepSeek/OpenAI for Hebrew named-entity
 *   recognition. Triggered manually by admin.
 */

import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ExtractionResult {
  sourceId: string;
  eventsProcessed: number;
  entitiesInserted: number;
  errors: string[];
}

interface EntityRow {
  event_id: string;
  entity_type: 'person' | 'organization' | 'place';
  entity_id: string | null;
  entity_name: string;
  role: 'owner' | 'participant' | 'location' | 'mentioned';
  raw_mention: string | null;
  confidence: number;
  extraction_method: 'owner' | 'participant_parse' | 'ai_ner';
}

// ─────────────────────────────────────────────
// Main exported function
// ─────────────────────────────────────────────

export async function extractEntitiesForSource(
  sourceId: string,
  options: { skipAI?: boolean; clearExisting?: boolean } = {},
): Promise<ExtractionResult> {
  const { skipAI = false, clearExisting = false } = options;
  const result: ExtractionResult = {
    sourceId,
    eventsProcessed: 0,
    entitiesInserted: 0,
    errors: [],
  };

  try {
    // Optionally clear previous extractions for this source
    if (clearExisting) {
      const deleted = await db('event_entities')
        .whereIn('event_id', db('diary_events').where({ source_id: sourceId }).select('id'))
        .del();
      logger.info({ sourceId, deleted }, 'Cleared existing entity links');
    }

    const eventCount = await db('diary_events')
      .where({ source_id: sourceId })
      .count('id as cnt')
      .first();
    result.eventsProcessed = Number(eventCount?.cnt ?? 0);

    // Stage 1: owner link
    const ownerInserted = await stageOwnerLink(sourceId);
    result.entitiesInserted += ownerInserted;
    logger.info({ sourceId, inserted: ownerInserted }, 'Entity extraction Stage 1 (owner) done');

    // Stage 2: participant parse
    const participantInserted = await stageParticipantParse(sourceId, result.errors);
    result.entitiesInserted += participantInserted;
    logger.info({ sourceId, inserted: participantInserted }, 'Entity extraction Stage 2 (participant) done');

    // Stage 3: AI NER (optional)
    if (!skipAI) {
      const aiInserted = await stageAiNer(sourceId, result.errors);
      result.entitiesInserted += aiInserted;
      logger.info({ sourceId, inserted: aiInserted }, 'Entity extraction Stage 3 (AI NER) done');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
    logger.error({ sourceId, err: msg }, 'Entity extraction failed');
  }

  return result;
}

// ─────────────────────────────────────────────
// Stage 1: Owner link (single SQL INSERT)
// ─────────────────────────────────────────────

async function stageOwnerLink(sourceId: string): Promise<number> {
  const result = await db.raw(`
    INSERT INTO event_entities
      (event_id, entity_type, entity_id, entity_name, role, confidence, extraction_method)
    SELECT
      e.id,
      'person'::text,
      s.person_id,
      p.name,
      'owner'::text,
      1.0::real,
      'owner'::text
    FROM diary_events e
    JOIN diary_sources s ON s.id = e.source_id
    JOIN people p ON p.id = s.person_id
    WHERE e.source_id = ?
      AND s.person_id IS NOT NULL
    ON CONFLICT (event_id, entity_type, entity_name, role) DO NOTHING
  `, [sourceId]);

  return result.rowCount ?? 0;
}

// ─────────────────────────────────────────────
// Stage 2: Participant parse (in-memory fuzzy)
// ─────────────────────────────────────────────

/** Hebrew honorifics to strip before name matching */
const HONORIFIC_RE = /^(פרופ[׳']?|ד[״"]ר|עו[״"]ד|מנכ[״"]ל|מנמ[״"]ל|מנה[״"]ל|ח[״"]כ|גב[׳']|הרב|הגב|שרה?|מר|דר|ד"ר|פרופ'|עו"ד|ח"כ|גב'|מנכ"ל)\s+/gi;

/** Split delimiters for participants field */
const SPLIT_RE = /[,;\n|\/\\]+/;

/** Detect participant-like keys in other_fields */
const PARTICIPANT_KEYS_RE = /משתתפ|נוכח|מוזמנ|participant|attendee|invitee/i;
/** Detect location-like keys in other_fields */
const LOCATION_KEYS_RE = /מקום|מיקום|location|place|venue|כתובת|address/i;
/** Regex to extract Hebrew organization-like phrases from text */
const ORG_PHRASE_RE = /(משרד|ועד[תה]|רשות|עיריי?ת|מועצ[תה]|הסתדרות|בנק|אוניברסיט[תה])\s+([\u0590-\u05FF"'״׳\-]+(?:\s+[\u0590-\u05FF"'״׳\-]+){0,3})/g;

/** Normalize Hebrew text: remove invisible Unicode marks */
function normalizeText(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\u200B-\u200F\uFEFF\u00AD\u2028\u2029\u202A-\u202E\u2060]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip honorifics and normalize */
function cleanName(s: string): string {
  return normalizeText(s.replace(HONORIFIC_RE, '').trim());
}

/** Word-level Jaccard similarity (0–1) */
function jaccard(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Find best match in a name→id map. Returns [id, score] or [null, 0] */
function bestMatch(
  candidate: string,
  registry: Map<string, string>, // normalized name → id
): [string | null, number] {
  let bestId: string | null = null;
  let bestScore = 0;
  for (const [name, id] of registry) {
    const score = jaccard(candidate, name);
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  return [bestId, bestScore];
}

async function stageParticipantParse(
  sourceId: string,
  errors: string[],
): Promise<number> {
  // Pre-fetch registry into memory
  const allPeople: Array<{ id: string; name: string }> = await db('people').select('id', 'name');
  const allOrgs: Array<{ id: string; name: string }> = await db('organizations').select('id', 'name');

  // Build normalized maps (normalized_name → original_id)
  const peopleMap = new Map<string, string>(
    allPeople.map((p) => [normalizeText(p.name.toLowerCase()), p.id])
  );
  const orgMap = new Map<string, string>(
    allOrgs.map((o) => [normalizeText(o.name.toLowerCase()), o.id])
  );

  const BATCH_SIZE = 200;
  let offset = 0;
  let totalInserted = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Process ALL events — not just those with participants/location
    const events = await db('diary_events')
      .where({ source_id: sourceId })
      .select('id', 'title', 'participants', 'location', 'other_fields')
      .orderBy('id')
      .limit(BATCH_SIZE)
      .offset(offset);

    if (events.length === 0) break;
    offset += events.length;

    const rows: EntityRow[] = [];
    // Dedup within batch to avoid insert conflicts
    const seen = new Set<string>();
    const addRow = (row: EntityRow) => {
      const key = `${row.event_id}|${row.entity_type}|${row.entity_name}|${row.role}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push(row);
      }
    };

    for (const event of events) {
      // ── Gather text from all sources ──
      let participantText = event.participants ? String(event.participants) : '';
      let locationText = event.location ? String(event.location) : '';

      // Check other_fields for unmapped participant/location columns
      if (event.other_fields) {
        try {
          const obj = typeof event.other_fields === 'string'
            ? JSON.parse(event.other_fields) : event.other_fields;
          if (obj && typeof obj === 'object') {
            for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
              if (typeof value !== 'string' || !value.trim()) continue;
              const keyNorm = normalizeText(key);
              if (PARTICIPANT_KEYS_RE.test(keyNorm)) {
                participantText += (participantText ? '\n' : '') + value;
              } else if (LOCATION_KEYS_RE.test(keyNorm)) {
                locationText += (locationText ? '\n' : '') + value;
              }
            }
          }
        } catch { /* ignore malformed JSON */ }
      }

      // ── Participant names ──
      if (participantText) {
        const candidates = participantText
          .split(SPLIT_RE)
          .map((s: string) => cleanName(s))
          .filter((s: string) => s.length >= 2);

        for (const raw of candidates) {
          const norm = normalizeText(raw.toLowerCase());
          if (!norm) continue;

          // Try people first
          const [pId, pScore] = bestMatch(norm, peopleMap);
          if (pScore >= 0.85) {
            addRow({
              event_id: event.id, entity_type: 'person', entity_id: pId,
              entity_name: allPeople.find((p) => p.id === pId)?.name ?? raw,
              role: 'participant', raw_mention: raw, confidence: 0.9,
              extraction_method: 'participant_parse',
            });
            continue;
          }
          if (pScore >= 0.6) {
            addRow({
              event_id: event.id, entity_type: 'person', entity_id: pId,
              entity_name: allPeople.find((p) => p.id === pId)?.name ?? raw,
              role: 'participant', raw_mention: raw, confidence: 0.7,
              extraction_method: 'participant_parse',
            });
            continue;
          }

          // Try organizations
          const [oId, oScore] = bestMatch(norm, orgMap);
          if (oScore >= 0.6) {
            addRow({
              event_id: event.id, entity_type: 'organization', entity_id: oId,
              entity_name: allOrgs.find((o) => o.id === oId)?.name ?? raw,
              role: 'participant', raw_mention: raw,
              confidence: oScore >= 0.85 ? 0.9 : 0.7,
              extraction_method: 'participant_parse',
            });
            continue;
          }

          // Unknown person from participant list
          addRow({
            event_id: event.id, entity_type: 'person', entity_id: null,
            entity_name: raw, role: 'participant', raw_mention: raw,
            confidence: 0.5, extraction_method: 'participant_parse',
          });
        }
      }

      // ── Location field ──
      if (locationText) {
        for (const locPart of locationText.split(SPLIT_RE)) {
          const loc = cleanName(locPart);
          if (loc.length < 2) continue;
          const norm = normalizeText(loc.toLowerCase());

          // Check organizations (government buildings, ministries)
          const [oId, oScore] = bestMatch(norm, orgMap);
          if (oScore >= 0.6) {
            addRow({
              event_id: event.id, entity_type: 'organization', entity_id: oId,
              entity_name: allOrgs.find((o) => o.id === oId)?.name ?? loc,
              role: 'location', raw_mention: locPart.trim(),
              confidence: oScore >= 0.85 ? 0.9 : 0.7,
              extraction_method: 'participant_parse',
            });
          } else {
            // Store as unmatched place
            addRow({
              event_id: event.id, entity_type: 'place', entity_id: null,
              entity_name: loc, role: 'location', raw_mention: locPart.trim(),
              confidence: 0.9, extraction_method: 'participant_parse',
            });
          }
        }
      }

      // ── Title: match against known registry + extract org patterns ──
      if (event.title) {
        const titleClean = normalizeText(String(event.title));
        const titleLower = titleClean.toLowerCase();

        // Check if known people appear in title
        for (const person of allPeople) {
          const pNorm = normalizeText(person.name.toLowerCase());
          if (pNorm.length >= 3 && titleLower.includes(pNorm)) {
            addRow({
              event_id: event.id, entity_type: 'person', entity_id: person.id,
              entity_name: person.name, role: 'mentioned',
              raw_mention: person.name, confidence: 0.8,
              extraction_method: 'participant_parse',
            });
          }
        }

        // Check if known orgs appear in title
        for (const org of allOrgs) {
          const oNorm = normalizeText(org.name.toLowerCase());
          if (oNorm.length >= 3 && titleLower.includes(oNorm)) {
            addRow({
              event_id: event.id, entity_type: 'organization', entity_id: org.id,
              entity_name: org.name, role: 'mentioned',
              raw_mention: org.name, confidence: 0.8,
              extraction_method: 'participant_parse',
            });
          }
        }

        // Extract Hebrew org-like phrases even without registry
        ORG_PHRASE_RE.lastIndex = 0; // reset regex state
        let match;
        while ((match = ORG_PHRASE_RE.exec(titleClean)) !== null) {
          const orgName = cleanName(match[0]);
          if (orgName.length < 4) continue;
          const norm = normalizeText(orgName.toLowerCase());
          const [oId, oScore] = bestMatch(norm, orgMap);
          addRow({
            event_id: event.id, entity_type: 'organization',
            entity_id: oScore >= 0.7 ? oId : null,
            entity_name: oScore >= 0.7 ? (allOrgs.find((o) => o.id === oId)?.name ?? orgName) : orgName,
            role: 'mentioned', raw_mention: match[0],
            confidence: oScore >= 0.7 ? 0.8 : 0.6,
            extraction_method: 'participant_parse',
          });
        }
      }
    }

    // Bulk insert with conflict ignore
    if (rows.length > 0) {
      try {
        await db('event_entities')
          .insert(rows)
          .onConflict(db.raw('(event_id, entity_type, entity_name, role)'))
          .ignore();
        totalInserted += rows.length;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Participant parse batch error at offset ${offset}: ${msg}`);
        logger.warn({ err: msg }, 'Participant parse batch failed');
      }
    }

    if (events.length < BATCH_SIZE) break;
  }

  return totalInserted;
}

// ─────────────────────────────────────────────
// Stage 3: AI NER (DeepSeek / OpenAI)
// ─────────────────────────────────────────────

const AI_NER_PROMPT = `You are an expert at named entity recognition (NER) for Israeli government diary events (יומן) written in Hebrew.

ENTITY TYPES:
- person: Named individuals — strip honorifics (שר, ח"כ, ד"ר, פרופ', עו"ד, מנכ"ל, הרב, גב', מר) and return only the personal name
- organization: Government ministries (משרד...), companies, unions, committees, political parties
- place: Cities, buildings, venues (NOT generic room numbers like "חדר 105")

RULES:
- Generic role references without a proper name ("ראש המחלקה", "נציג הוועדה") → skip
- Return full ministry name including ה- prefix: "משרד הביטחון" not "ביטחון"
- Omit entities with confidence below 0.4
- Each entity gets a "role": "participant" (person/org present at event), "location" (place), or "mentioned" (referenced but not present)

INPUT: A JSON array where each element has "id" (event UUID) and "text" (Hebrew event text).

OUTPUT: A JSON array. Each element:
{"id":"<event_id>","entities":[{"name":"<Hebrew name>","type":"person"|"organization"|"place","role":"participant"|"location"|"mentioned","raw":"<exact substring>","confidence":0.0-1.0}]}

Return ONLY the JSON array, no explanation. Empty entities array if nothing found.`;

interface AiEntity {
  name: string;
  type: 'person' | 'organization' | 'place';
  role: 'participant' | 'location' | 'mentioned';
  raw: string;
  confidence: number;
}

interface AiEventResult {
  id: string;
  entities: AiEntity[];
}

function getLLMConfig(): { baseUrl: string; model: string; apiKey: string } | null {
  if (env.DEEPSEEK_API_KEY) {
    return { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: env.DEEPSEEK_API_KEY };
  }
  if (env.OPENAI_API_KEY) {
    return { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', apiKey: env.OPENAI_API_KEY };
  }
  return null;
}

async function stageAiNer(sourceId: string, errors: string[]): Promise<number> {
  const llm = getLLMConfig();
  if (!llm) {
    logger.warn('No LLM API key configured — skipping AI NER stage');
    return 0;
  }

  // Pre-fetch registry for post-NER fuzzy matching
  const allPeople: Array<{ id: string; name: string }> = await db('people').select('id', 'name');
  const allOrgs: Array<{ id: string; name: string }> = await db('organizations').select('id', 'name');
  const peopleMap = new Map<string, string>(
    allPeople.map((p) => [normalizeText(p.name.toLowerCase()), p.id])
  );
  const orgMap = new Map<string, string>(
    allOrgs.map((o) => [normalizeText(o.name.toLowerCase()), o.id])
  );

  const AI_BATCH = 50;
  let offset = 0;
  let totalInserted = 0;

  const { default: axios } = await import('axios');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const events = await db('diary_events')
      .where({ source_id: sourceId })
      .select('id', 'title', 'location', 'other_fields')
      .orderBy('id')
      .limit(AI_BATCH)
      .offset(offset);

    if (events.length === 0) break;
    offset += events.length;

    // Build text payload per event
    const payload = events
      .map((e) => {
        const otherText = (() => {
          try {
            const obj = typeof e.other_fields === 'string'
              ? JSON.parse(e.other_fields)
              : e.other_fields;
            return Object.values(obj as Record<string, unknown>)
              .filter((v) => typeof v === 'string' && (v as string).length > 0)
              .join(' | ');
          } catch { return ''; }
        })();
        const text = [e.title, e.location, otherText]
          .filter(Boolean)
          .map(normalizeText)
          .join('\n');
        return { id: e.id, text };
      })
      .filter((e) => e.text.length > 0);

    if (payload.length === 0) {
      if (events.length < AI_BATCH) break;
      continue;
    }

    try {
      const response = await axios.post(
        `${llm.baseUrl}/chat/completions`,
        {
          model: llm.model,
          messages: [
            { role: 'system', content: AI_NER_PROMPT },
            { role: 'user', content: JSON.stringify(payload) },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: 4000,
        },
        {
          headers: { Authorization: `Bearer ${llm.apiKey}` },
          timeout: 60000,
        }
      );

      const raw = response.data.choices[0]?.message?.content ?? '[]';
      let parsed: AiEventResult[] = [];
      try {
        const obj = JSON.parse(raw);
        // Model may return { results: [...] } or just [...]
        parsed = Array.isArray(obj) ? obj : (obj.results ?? obj.data ?? []);
      } catch {
        logger.warn({ raw: raw.slice(0, 200) }, 'AI NER response parse error');
        errors.push(`AI NER parse error for batch at offset ${offset}`);
        if (events.length < AI_BATCH) break;
        continue;
      }

      // Convert AI results to DB rows
      const rows: EntityRow[] = [];
      for (const item of parsed) {
        for (const ent of item.entities ?? []) {
          if (!ent.name || ent.confidence < 0.4) continue;

          const cleanedName = cleanName(normalizeText(ent.name));
          const normLower = cleanedName.toLowerCase();

          // Resolve entity_id via fuzzy match
          let entityId: string | null = null;
          let resolvedName = cleanedName;

          if (ent.type === 'person') {
            const [pId, pScore] = bestMatch(normLower, peopleMap);
            if (pScore >= 0.7) {
              entityId = pId;
              resolvedName = allPeople.find((p) => p.id === pId)?.name ?? cleanedName;
            }
          } else if (ent.type === 'organization') {
            const [oId, oScore] = bestMatch(normLower, orgMap);
            if (oScore >= 0.7) {
              entityId = oId;
              resolvedName = allOrgs.find((o) => o.id === oId)?.name ?? cleanedName;
            }
          }

          rows.push({
            event_id: item.id,
            entity_type: ent.type,
            entity_id: entityId,
            entity_name: resolvedName,
            role: ent.role as EntityRow['role'],
            raw_mention: ent.raw ?? null,
            confidence: ent.confidence,
            extraction_method: 'ai_ner',
          });
        }
      }

      if (rows.length > 0) {
        await db('event_entities')
          .insert(rows)
          .onConflict(db.raw('(event_id, entity_type, entity_name, role)'))
          .ignore();
        totalInserted += rows.length;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`AI NER batch error at offset ${offset}: ${msg}`);
      logger.warn({ err: msg }, 'AI NER batch failed (continuing)');
    }

    if (events.length < AI_BATCH) break;
  }

  return totalInserted;
}
