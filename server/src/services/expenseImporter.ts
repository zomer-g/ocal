/**
 * MK constituent-contact expenses (הוצאות קשר עם הציבור) importer.
 *
 * Parses an uploaded Knesset xlsx ledger, matches each MK name to a person
 * row (creating missing ones), and bulk-inserts expense rows.
 *
 * Schema validated: 2024 / 2025 format with these columns (Hebrew):
 *   שם חבר הכנסת | שם סעיף הוצאה | שם בית עסק/ ספק |
 *   תאריך ביצוע/ תאריך חשבונית | סכום בש"ח | פרטים/ הערות | אשראי | אסמכתאות
 *
 * 2023 format (3 columns: name / category / amount, no date) is REJECTED
 * with UnsupportedSchemaError so it never lands on the timeline.
 */

import crypto from 'node:crypto';
import * as xlsx from 'xlsx';
import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { parseDate } from './dateParser.js';
import { jaccard } from './entityExtractor.js';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ParsedExpenseRow {
  mk_name_raw: string;
  expense_date: string;          // ISO YYYY-MM-DD
  category: string;
  vendor: string | null;
  amount: number;
  notes: string | null;
  credit: string | null;
  receipt_url: string | null;
  source_row_index: number;       // 1-based xlsx row
}

export type MkMatchKind = 'exact' | 'swapped' | 'fuzzy' | 'new';

export interface MkResolution {
  name_raw: string;
  match_kind: MkMatchKind;
  matched_person_id: string | null;
  matched_person_name: string | null;
  score: number | null;            // jaccard score for 'fuzzy'
  is_diary_owner: boolean;         // true if the matched person already owns a diary_source
}

export interface PreviewResult {
  source_year: number;
  total_rows: number;
  rows: ParsedExpenseRow[];
  mks: MkResolution[];
  warnings: string[];
}

export interface CommitResult {
  import_id: string;
  rows_inserted: number;
  mks_matched: number;             // exact + swapped + fuzzy
  mks_created: number;             // 'new'
  warnings: string[];
}

export class UnsupportedSchemaError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'UnsupportedSchemaError';
  }
}

// ─────────────────────────────────────────────
// Excel parsing
// ─────────────────────────────────────────────

/** Required Hebrew column names (canonical 2024/2025 schema). */
const COL_MK_NAME      = 'שם חבר הכנסת';
const COL_CATEGORY     = 'שם סעיף הוצאה';
const COL_VENDOR       = 'שם בית עסק/ ספק';
const COL_DATE         = 'תאריך ביצוע/ תאריך חשבונית';
const COL_AMOUNT       = 'סכום בש"ח';
const COL_NOTES        = 'פרטים/ הערות';
const COL_CREDIT       = 'אשראי';
const COL_RECEIPT      = 'אסמכתאות לעסקה';

/** Light fuzzy header matcher — tolerates Knesset's minor spacing/punctuation drift. */
function matchHeader(want: string, header: string): boolean {
  const norm = (s: string) =>
    s.normalize('NFC').replace(/[\u200B-\u200F\uFEFF\u00AD\u2028\u2029]/g, '').replace(/\s+/g, ' ').trim();
  return norm(want) === norm(header);
}

/** Find the header row index (0-based) by scanning the top 5 rows. */
function detectHeaderRow(rows: unknown[][]): number {
  const limit = Math.min(rows.length, 5);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const cells = row.map((c) => (typeof c === 'string' ? c : ''));
    const hasMk   = cells.some((c) => matchHeader(COL_MK_NAME, c));
    const hasDate = cells.some((c) => matchHeader(COL_DATE, c));
    if (hasMk && hasDate) return i;
  }
  return -1;
}

/** Find the column index for a given canonical header name. */
function findColIdx(headerRow: unknown[], want: string): number {
  for (let i = 0; i < headerRow.length; i++) {
    const c = headerRow[i];
    if (typeof c === 'string' && matchHeader(want, c)) return i;
  }
  return -1;
}

export function parseExpenseWorkbook(buf: Buffer): { rows: ParsedExpenseRow[]; source_year: number; warnings: string[] } {
  const wb = xlsx.read(buf, { type: 'buffer', cellDates: false });
  const warnings: string[] = [];

  // Pick the first non-disclaimer sheet — disclaimers are typically
  // separately-named sheets like "הסבר והבהרות לסעיפים בקובץ".
  const dataSheetName = wb.SheetNames.find((n) => !/הסבר|הבהר/.test(n)) ?? wb.SheetNames[0];
  if (!dataSheetName) throw new UnsupportedSchemaError('Workbook is empty');

  const sheet = wb.Sheets[dataSheetName];
  const aoa = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });

  const headerRowIdx = detectHeaderRow(aoa);
  if (headerRowIdx < 0) {
    throw new UnsupportedSchemaError(
      `סכמה לא נתמכת — לא נמצאה שורה עם העמודות "${COL_MK_NAME}" ו-"${COL_DATE}". ` +
        `קבצי 2023 (ללא תאריך לכל שורה) אינם נתמכים בגרסה זו.`,
    );
  }

  const header = aoa[headerRowIdx] as unknown[];
  const idxMk      = findColIdx(header, COL_MK_NAME);
  const idxCat     = findColIdx(header, COL_CATEGORY);
  const idxVendor  = findColIdx(header, COL_VENDOR);
  const idxDate    = findColIdx(header, COL_DATE);
  const idxAmount  = findColIdx(header, COL_AMOUNT);
  const idxNotes   = findColIdx(header, COL_NOTES);
  const idxCredit  = findColIdx(header, COL_CREDIT);
  const idxReceipt = findColIdx(header, COL_RECEIPT);

  if (idxMk < 0 || idxDate < 0 || idxAmount < 0 || idxCat < 0) {
    throw new UnsupportedSchemaError('סכמה לא נתמכת — חסרה אחת מהעמודות החובה (שם, תאריך, סכום, סעיף הוצאה)');
  }

  const out: ParsedExpenseRow[] = [];
  const yearCounts = new Map<number, number>();
  let skippedNoName = 0;
  let skippedNoDate = 0;
  let skippedNoAmount = 0;

  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!Array.isArray(row) || row.every((c) => c == null || c === '')) continue;

    const xlsxRowIndex = r + 1; // 1-based, matches what users see in Excel

    const mkRaw = String(row[idxMk] ?? '').trim();
    if (!mkRaw) { skippedNoName++; continue; }

    const dateVal = row[idxDate];
    const parsedDate = parseDate(dateVal);
    if (!parsedDate) { skippedNoDate++; continue; }
    const isoDate = parsedDate.toISOString().slice(0, 10);
    yearCounts.set(parsedDate.getUTCFullYear(), (yearCounts.get(parsedDate.getUTCFullYear()) ?? 0) + 1);

    const amountVal = row[idxAmount];
    const amount = typeof amountVal === 'number' ? amountVal : Number(amountVal);
    if (!Number.isFinite(amount)) { skippedNoAmount++; continue; }

    out.push({
      mk_name_raw: mkRaw,
      expense_date: isoDate,
      category: String(row[idxCat] ?? '').trim() || '(ללא סעיף)',
      vendor: idxVendor >= 0 ? (String(row[idxVendor] ?? '').trim() || null) : null,
      amount,
      notes: idxNotes >= 0 ? (String(row[idxNotes] ?? '').trim() || null) : null,
      credit: idxCredit >= 0 ? (String(row[idxCredit] ?? '').trim() || null) : null,
      receipt_url: idxReceipt >= 0 ? (String(row[idxReceipt] ?? '').trim() || null) : null,
      source_row_index: xlsxRowIndex,
    });
  }

  // Source year = mode of expense_date years
  let mostCommonYear = 0;
  let mostCommonCount = 0;
  for (const [y, c] of yearCounts) {
    if (c > mostCommonCount) { mostCommonYear = y; mostCommonCount = c; }
  }
  if (!mostCommonYear) {
    throw new UnsupportedSchemaError('לא נמצאו שורות עם תאריך תקין');
  }

  if (skippedNoName)   warnings.push(`דולגו ${skippedNoName} שורות עם שם חבר כנסת ריק`);
  if (skippedNoDate)   warnings.push(`דולגו ${skippedNoDate} שורות עם תאריך לא תקין`);
  if (skippedNoAmount) warnings.push(`דולגו ${skippedNoAmount} שורות עם סכום לא מספרי`);

  return { rows: out, source_year: mostCommonYear, warnings };
}

// ─────────────────────────────────────────────
// MK name → person resolution
// ─────────────────────────────────────────────

/** Normalize a name for matching: NFC, lowercase, collapsed whitespace. */
function normalizeForMatch(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\u200B-\u200F\uFEFF\u00AD]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Swap "First Last" ↔ "Last First" — the 2023 vs 2024 Knesset convention. */
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

async function loadPeopleCache(): Promise<{
  byNormName: Map<string, PeopleCacheEntry>;
  all: PeopleCacheEntry[];
}> {
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

const FUZZY_THRESHOLD = 0.85;

/**
 * Resolve every unique MK name in the parsed rows against the people
 * registry. Does NOT mutate the database (preview mode); the caller
 * decides whether to commit and create missing rows.
 */
export async function resolveMKNames(rows: ParsedExpenseRow[]): Promise<MkResolution[]> {
  const { byNormName, all } = await loadPeopleCache();
  const uniqueNames = Array.from(new Set(rows.map((r) => r.mk_name_raw)));
  const out: MkResolution[] = [];

  for (const nameRaw of uniqueNames) {
    const norm = normalizeForMatch(nameRaw);

    // 1. Exact (normalized) match
    const exact = byNormName.get(norm);
    if (exact) {
      out.push({
        name_raw: nameRaw,
        match_kind: 'exact',
        matched_person_id: exact.id,
        matched_person_name: exact.name,
        score: null,
        is_diary_owner: exact.isDiaryOwner,
      });
      continue;
    }

    // 2. Swapped order (handles "First Last" ↔ "Last First")
    const swapped = swapNameOrder(norm);
    if (swapped) {
      const hit = byNormName.get(swapped);
      if (hit) {
        out.push({
          name_raw: nameRaw,
          match_kind: 'swapped',
          matched_person_id: hit.id,
          matched_person_name: hit.name,
          score: null,
          is_diary_owner: hit.isDiaryOwner,
        });
        continue;
      }
    }

    // 3. Fuzzy — jaccard ≥ 0.85, prefer existing diary owners on ties
    let bestId: string | null = null;
    let bestName: string | null = null;
    let bestScore = 0;
    let bestIsOwner = false;
    for (const p of all) {
      const score = jaccard(norm, normalizeForMatch(p.name));
      if (score >= FUZZY_THRESHOLD) {
        // Strict inequality, OR equal score but candidate is a diary owner (preferred)
        if (score > bestScore || (score === bestScore && p.isDiaryOwner && !bestIsOwner)) {
          bestId = p.id;
          bestName = p.name;
          bestScore = score;
          bestIsOwner = p.isDiaryOwner;
        }
      }
    }
    if (bestId) {
      out.push({
        name_raw: nameRaw,
        match_kind: 'fuzzy',
        matched_person_id: bestId,
        matched_person_name: bestName,
        score: Number(bestScore.toFixed(3)),
        is_diary_owner: bestIsOwner,
      });
      continue;
    }

    // 4. None — will be created on commit
    out.push({
      name_raw: nameRaw,
      match_kind: 'new',
      matched_person_id: null,
      matched_person_name: null,
      score: null,
      is_diary_owner: false,
    });
  }

  return out;
}

// ─────────────────────────────────────────────
// Public preview + commit
// ─────────────────────────────────────────────

export async function previewImport(buf: Buffer): Promise<PreviewResult> {
  const parsed = parseExpenseWorkbook(buf);
  const mks = await resolveMKNames(parsed.rows);
  return {
    source_year: parsed.source_year,
    total_rows: parsed.rows.length,
    rows: parsed.rows,
    mks,
    warnings: parsed.warnings,
  };
}

export async function commitImport(
  buf: Buffer,
  filename: string,
  uploadedBy: string | null,
): Promise<CommitResult> {
  const fileHash = crypto.createHash('sha256').update(buf).digest('hex');

  // Reject re-import of the same bytes
  const existing = await db('mk_expense_imports').where({ file_hash: fileHash }).first();
  if (existing) {
    throw new Error('הקובץ הזה כבר נטען בעבר (אותו hash). מחק את הייבוא הקודם אם תרצה לטעון שוב.');
  }

  const preview = await previewImport(buf);

  // Resolve MK → person_id, creating missing people rows in the same tx
  const result = await db.transaction(async (trx) => {
    const nameToPersonId = new Map<string, string>();
    let mksMatched = 0;
    let mksCreated = 0;

    for (const m of preview.mks) {
      if (m.match_kind === 'new') {
        const [created] = await trx('people')
          .insert({ name: m.name_raw, notes: 'auto-created from MK expenses import' })
          .returning(['id']);
        nameToPersonId.set(m.name_raw, created.id);
        mksCreated++;
      } else if (m.matched_person_id) {
        nameToPersonId.set(m.name_raw, m.matched_person_id);
        mksMatched++;
      }
    }

    const [importRow] = await trx('mk_expense_imports')
      .insert({
        uploaded_by: uploadedBy,
        filename,
        file_hash: fileHash,
        source_year: preview.source_year,
        total_rows: preview.total_rows,
        rows_inserted: preview.rows.length,
        mks_matched: mksMatched,
        mks_created: mksCreated,
        warnings: JSON.stringify(preview.warnings),
      })
      .returning(['id']);

    // Bulk insert expense rows in chunks to keep memory + WAL bounded
    const CHUNK = 1000;
    let inserted = 0;
    for (let i = 0; i < preview.rows.length; i += CHUNK) {
      const slice = preview.rows.slice(i, i + CHUNK);
      const records = slice.map((row) => ({
        import_id: importRow.id,
        person_id: nameToPersonId.get(row.mk_name_raw) ?? null,
        mk_name_raw: row.mk_name_raw,
        expense_date: row.expense_date,
        category: row.category,
        vendor: row.vendor,
        amount: row.amount,
        notes: row.notes,
        credit: row.credit,
        receipt_url: row.receipt_url,
        source_year: preview.source_year,
        source_row_index: row.source_row_index,
      }));
      await trx('mk_expenses').insert(records);
      inserted += records.length;
    }

    return {
      import_id: importRow.id,
      rows_inserted: inserted,
      mks_matched: mksMatched,
      mks_created: mksCreated,
      warnings: preview.warnings,
    };
  });

  logger.info(
    { importId: result.import_id, filename, sourceYear: preview.source_year, ...result },
    'MK expense import committed',
  );
  return result;
}
