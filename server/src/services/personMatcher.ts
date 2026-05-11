/**
 * Match a raw "name from source" string to a person in the registry.
 *
 * Originally embedded inside services/expenseImporter.ts::resolveMKNames;
 * extracted here so the COI importer (and any future ingest path that
 * needs to map subject names to people) reuses the same logic instead
 * of forking it.
 *
 * Resolution cascade per name:
 *   1. Exact (normalized) match against people.name
 *   2. Swapped two-word order  ("First Last" ↔ "Last First")
 *   3. Fuzzy: jaccard ≥ 0.85, tie-break preferring existing diary owners
 *   4. None — caller decides whether to insert a new people row
 */

import { db } from '../config/database.js';
import { jaccard } from './entityExtractor.js';

export type MatchKind = 'exact' | 'swapped' | 'fuzzy' | 'new';

export interface NameResolution {
  name_raw: string;
  match_kind: MatchKind;
  matched_person_id: string | null;
  matched_person_name: string | null;
  score: number | null;          // jaccard score for 'fuzzy'
  is_diary_owner: boolean;       // matched person already owns a diary_source
}

const FUZZY_THRESHOLD = 0.85;

/** NFC + lowercase + collapsed whitespace; strip invisible Unicode marks. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[​-‏﻿­]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Swap "First Last" ↔ "Last First" for the two-word case. */
function swapNameOrder(s: string): string | null {
  const parts = s.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  return `${parts[1]} ${parts[0]}`;
}

interface PeopleCacheEntry {
  id: string;
  name: string;
  isDiaryOwner: boolean;
}

export interface PeopleCache {
  byNormName: Map<string, PeopleCacheEntry>;
  all: PeopleCacheEntry[];
}

/**
 * Load every people row into memory along with a flag for whether they
 * already appear as a diary owner. Cheap on the current dataset (<100k
 * people); call once per import operation, not per row.
 */
export async function loadPeopleCache(): Promise<PeopleCache> {
  const ownerIds = new Set<string>();
  const sources = await db('diary_sources').whereNotNull('person_id').select('person_id');
  for (const s of sources) ownerIds.add(s.person_id);

  const people = await db('people').select('id', 'name');
  const byNormName = new Map<string, PeopleCacheEntry>();
  const all: PeopleCacheEntry[] = [];
  for (const p of people) {
    const entry: PeopleCacheEntry = { id: p.id, name: p.name, isDiaryOwner: ownerIds.has(p.id) };
    byNormName.set(normalizeForMatch(p.name), entry);
    all.push(entry);
  }
  return { byNormName, all };
}

/** Resolve one raw name against an already-loaded people cache. */
export function resolveOneName(nameRaw: string, cache: PeopleCache): NameResolution {
  const norm = normalizeForMatch(nameRaw);

  // 1. Exact
  const exact = cache.byNormName.get(norm);
  if (exact) {
    return {
      name_raw: nameRaw,
      match_kind: 'exact',
      matched_person_id: exact.id,
      matched_person_name: exact.name,
      score: null,
      is_diary_owner: exact.isDiaryOwner,
    };
  }

  // 2. Swapped order
  const swapped = swapNameOrder(norm);
  if (swapped) {
    const hit = cache.byNormName.get(swapped);
    if (hit) {
      return {
        name_raw: nameRaw,
        match_kind: 'swapped',
        matched_person_id: hit.id,
        matched_person_name: hit.name,
        score: null,
        is_diary_owner: hit.isDiaryOwner,
      };
    }
  }

  // 3. Fuzzy
  let bestId: string | null = null;
  let bestName: string | null = null;
  let bestScore = 0;
  let bestIsOwner = false;
  for (const p of cache.all) {
    const score = jaccard(norm, normalizeForMatch(p.name));
    if (score >= FUZZY_THRESHOLD) {
      if (score > bestScore || (score === bestScore && p.isDiaryOwner && !bestIsOwner)) {
        bestId = p.id;
        bestName = p.name;
        bestScore = score;
        bestIsOwner = p.isDiaryOwner;
      }
    }
  }
  if (bestId) {
    return {
      name_raw: nameRaw,
      match_kind: 'fuzzy',
      matched_person_id: bestId,
      matched_person_name: bestName,
      score: Number(bestScore.toFixed(3)),
      is_diary_owner: bestIsOwner,
    };
  }

  // 4. Not found
  return {
    name_raw: nameRaw,
    match_kind: 'new',
    matched_person_id: null,
    matched_person_name: null,
    score: null,
    is_diary_owner: false,
  };
}

/** Resolve a set of unique names in a single pass. */
export async function resolveNames(nameList: string[]): Promise<NameResolution[]> {
  const cache = await loadPeopleCache();
  const unique = Array.from(new Set(nameList));
  return unique.map((n) => resolveOneName(n, cache));
}
