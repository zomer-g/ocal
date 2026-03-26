/**
 * ============================================================
 * SYSTEM 1: CKAN Import Engine
 * ============================================================
 *
 * Responsible for all communication with the ODATA/CKAN platform:
 * - Discovery: search for diary datasets, list resources
 * - Fetching: download files or query the datastore API
 * - Parsing: handle CSV, XLS, XLSX, and ICAL formats
 *
 * This system knows NOTHING about diary schemas or field mapping.
 * It returns raw records and metadata — System 2 handles processing.
 */

import axios from 'axios';
import * as XLSX from 'xlsx';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// ical.js is ESM-only, use dynamic import
async function getICAL(): Promise<any> {
  const mod = await (eval('import("ical.js")') as Promise<any>);
  return mod.default;
}

const ckanApi = axios.create({
  baseURL: env.CKAN_BASE_URL,
  timeout: 30000,
});

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface CKANResource {
  id: string;
  name: string;
  format: string;
  url: string;
  datastore_active: boolean;
  package_id: string;
  size: number | null;
  created: string;
  last_modified: string;
  mimetype?: string;
  description?: string;
}

export interface CKANPackage {
  id: string;
  name: string;
  title: string;
  notes?: string;
  organization?: { title: string; name: string } | null;
  resources: CKANResource[];
  metadata_created: string;
  metadata_modified: string;
}

export interface DatastoreSearchResult {
  fields: Array<{ id: string; type: string }>;
  records: Record<string, unknown>[];
  total: number;
}

/** The formats this engine can import */
export const SUPPORTED_FORMATS = ['CSV', 'XLS', 'XLSX', 'ICS', 'ICAL', 'ICA'] as const;
export type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];

export function isSupportedFormat(format: string): boolean {
  return SUPPORTED_FORMATS.includes(format.toUpperCase() as SupportedFormat)
}

/**
 * Check if format is a spreadsheet (XLS/XLSX).
 * The CKAN datastore API mangles Hebrew column names into ASCII transliterations
 * for spreadsheet resources, so we prefer raw file download for these formats
 * to preserve original Hebrew field names needed for heuristic mapping.
 */
function isSpreadsheetFormat(format: string): boolean {
  return ['XLS', 'XLSX'].includes(format.toUpperCase());
}

/** Result from fetching any resource */
export interface FetchResult {
  records: Record<string, unknown>[];
  fields: string[];
  total: number;
  format: string;      // actual format used
  fetchMethod: 'datastore' | 'file_download';
}

// ──────────────────────────────────────────────
// 1A. Discovery — search & list
// ──────────────────────────────────────────────

/** Search ODATA for diary-related datasets */
export async function searchDatasets(
  query: string = 'יומן',
  rows: number = 100,
  start: number = 0,
): Promise<{ packages: CKANPackage[]; totalCount: number }> {
  const { data } = await ckanApi.get('/api/3/action/package_search', {
    params: { q: query, rows, start },
  });
  if (!data.success) throw new Error(`CKAN package_search failed`);
  return {
    packages: data.result.results,
    totalCount: data.result.count,
  };
}

/** Get a single dataset/package */
export async function getPackage(packageId: string): Promise<CKANPackage> {
  const { data } = await ckanApi.get('/api/3/action/package_show', {
    params: { id: packageId },
  });
  if (!data.success) throw new Error(`CKAN package_show failed: ${JSON.stringify(data.error)}`);
  return data.result;
}

/** Get a single resource */
export async function getResource(resourceId: string): Promise<CKANResource> {
  const { data } = await ckanApi.get('/api/3/action/resource_show', {
    params: { id: resourceId },
  });
  if (!data.success) throw new Error(`CKAN resource_show failed: ${JSON.stringify(data.error)}`);
  return data.result;
}

/**
 * Discover all importable resources across diary datasets.
 * Returns datasets with their importable resources (CSV/XLS/XLSX/ICAL or active datastore).
 */
export async function discoverDiaryResources(query: string = 'יומן'): Promise<{
  datasets: Array<{
    id: string;
    title: string;
    organization: string | null;
    resources: Array<{
      id: string;
      name: string;
      format: string;
      size: number | null;
      datastore_active: boolean;
      url: string;
      importable: boolean;
      importMethod: 'datastore' | 'file_download';
    }>;
  }>;
  totalDatasets: number;
  totalResources: number;
}> {
  // Paginate through results with a cap to avoid CKAN API timeouts
  // (search for "יומן" returns 1500+ results; most beyond ~500 are irrelevant)
  const MAX_DATASETS = 500;
  let allPackages: CKANPackage[] = [];
  let start = 0;
  const pageSize = 200;
  let totalCount = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let page;
    try {
      page = await searchDatasets(query, pageSize, start);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (allPackages.length === 0) {
        // First page failed — retry once after 5s
        logger.warn({ start, pageSize, err: msg }, 'CKAN first page failed — retrying in 5s');
        await new Promise((r) => setTimeout(r, 5000));
        try {
          page = await searchDatasets(query, pageSize, start);
        } catch (retryErr) {
          // Still fails — throw so the caller knows discovery failed entirely
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          logger.error({ err: retryMsg }, 'CKAN discovery failed after retry');
          throw new Error(`CKAN discovery failed: ${retryMsg}`);
        }
      } else {
        // Later page failed — proceed with what we have
        logger.warn({ start, pageSize, fetched: allPackages.length, err: msg },
          'CKAN page fetch failed — proceeding with datasets fetched so far');
        break;
      }
    }
    totalCount = page.totalCount;
    allPackages = allPackages.concat(page.packages);
    if (
      allPackages.length >= totalCount ||
      page.packages.length < pageSize ||
      allPackages.length >= MAX_DATASETS
    ) break;
    start += pageSize;
  }

  logger.info({ fetched: allPackages.length, total: totalCount, query },
    'CKAN discovery completed');

  if (allPackages.length >= MAX_DATASETS && allPackages.length < totalCount) {
    logger.info({ fetched: allPackages.length, total: totalCount },
      'Dataset cap reached — not all CKAN results were fetched');
  }

  let totalResources = 0;
  const datasets = allPackages.map(pkg => {
    let resources = pkg.resources
      .filter(r => {
        // Skip resources with empty/missing URLs (cause download errors)
        if (!r.url && !r.datastore_active) return false;
        const fmt = r.format.toUpperCase();
        return r.datastore_active || isSupportedFormat(fmt);
      });

    // Hide CKAN auto-generated "Converted CSV" duplicates when originals exist
    const hasNonConverted = resources.some(r => !r.name.toLowerCase().includes('converted csv'));
    if (hasNonConverted) {
      resources = resources.filter(r => !r.name.toLowerCase().includes('converted csv'));
    }

    const mapped = resources.map(r => {
        totalResources++;
        const fmt = r.format.toUpperCase();
        return {
          id: r.id,
          name: r.name,
          format: r.format,
          size: r.size,
          datastore_active: r.datastore_active,
          url: r.url,
          importable: true,
          importMethod: (r.datastore_active && !isSpreadsheetFormat(r.format) ? 'datastore' : 'file_download') as 'datastore' | 'file_download',
        };
      });

    return {
      id: pkg.id,
      title: pkg.title,
      organization: pkg.organization?.title || null,
      resources: mapped,
    };
  }).filter(d => d.resources.length > 0);

  return { datasets, totalDatasets: totalCount, totalResources };
}

// ──────────────────────────────────────────────
// 1B. Fetching — download raw data
// ──────────────────────────────────────────────

/** Datastore API: fetch a single page */
export async function datastoreSearch(
  resourceId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<DatastoreSearchResult> {
  const { data } = await ckanApi.get('/api/3/action/datastore_search', {
    params: {
      resource_id: resourceId,
      limit: options.limit ?? 500,
      offset: options.offset ?? 0,
    },
  });
  if (!data.success) throw new Error(`CKAN datastore_search failed`);
  return data.result;
}

/** Datastore API: paginate through ALL records */
async function datastoreSearchAll(
  resourceId: string,
  onProgress?: (fetched: number, total: number) => void
): Promise<FetchResult> {
  const BATCH_SIZE = 500;
  let offset = 0;
  let allRecords: Record<string, unknown>[] = [];
  let fields: string[] = [];
  let total = 0;

  while (true) {
    const result = await datastoreSearch(resourceId, { limit: BATCH_SIZE, offset });

    if (offset === 0) {
      fields = result.fields.map(f => f.id).filter(f => f !== '_id');
      total = result.total;
    }

    allRecords = allRecords.concat(result.records);
    offset += BATCH_SIZE;
    onProgress?.(allRecords.length, total);

    if (result.records.length < BATCH_SIZE) break;
    await new Promise(r => setTimeout(r, 200));
  }

  return { records: allRecords, fields, total, format: 'DATASTORE', fetchMethod: 'datastore' };
}

// ──────────────────────────────────────────────
// 1C. Parsing — format-specific parsers
// ──────────────────────────────────────────────

/** Download a raw file buffer from a URL */
async function downloadFile(url: string): Promise<Buffer> {
  logger.info({ url }, 'Downloading file from CKAN');
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 120000,
    maxContentLength: 100 * 1024 * 1024, // 100MB
  });
  const buffer = Buffer.from(response.data);
  logger.info({ size: buffer.length }, 'File downloaded');
  return buffer;
}

/** Build a SheetJS workbook from a file buffer */
function readWorkbook(buffer: Buffer, format?: string): XLSX.WorkBook {
  if (format?.toUpperCase() === 'CSV') {
    let str = buffer.toString('utf-8');
    if (str.charCodeAt(0) === 0xFEFF) str = str.slice(1); // strip BOM

    // Many Israeli government CSVs are encoded in Windows-1255, not UTF-8.
    // If the UTF-8 decode produced no Hebrew characters but the raw buffer
    // contains bytes in the Windows-1255 Hebrew range (0xC0–0xFA), re-decode.
    const hasHebrew = /[\u05D0-\u05EA]/.test(str);
    if (!hasHebrew) {
      const hasWin1255Bytes = buffer.some(b => b >= 0xC0 && b <= 0xFA);
      if (hasWin1255Bytes) {
        const decoder = new TextDecoder('windows-1255');
        str = decoder.decode(buffer);
        if (str.charCodeAt(0) === 0xFEFF) str = str.slice(1);
        logger.info('CSV re-decoded as Windows-1255 (no Hebrew found in UTF-8 decode)');
      }
    }

    return XLSX.read(str, { type: 'string' });
  }
  return XLSX.read(buffer, { type: 'buffer', codepage: 65001 });
}

/**
 * List all "relevant" sheets in a workbook — sheets with ≥3 columns.
 * Chart/junk sheets (e.g. "תרשים1") typically have only 1–2 columns.
 */
export function listRelevantSheets(
  buffer: Buffer,
  format?: string,
): Array<{ name: string; columns: number; rows: number }> {
  const workbook = readWorkbook(buffer, format);
  const sheets: Array<{ name: string; columns: number; rows: number }> = [];
  for (const name of workbook.SheetNames) {
    const s = workbook.Sheets[name];
    if (!s?.['!ref']) continue;
    const r = XLSX.utils.decode_range(s['!ref']);
    const cols = r.e.c - r.s.c + 1;
    const rows = r.e.r - r.s.r; // exclude header row
    if (cols >= 3) {
      sheets.push({ name, columns: cols, rows: Math.max(0, rows) });
    }
  }
  return sheets;
}

/**
 * Parse CSV/XLS/XLSX with SheetJS.
 * @param targetSheet — optional: parse this specific sheet. If omitted, picks the sheet with the most columns.
 */
function parseSpreadsheet(
  buffer: Buffer,
  format?: string,
  targetSheet?: string,
): { records: Record<string, unknown>[]; fields: string[]; sheetName: string } {
  const workbook = readWorkbook(buffer, format);

  // Resolve which sheet to parse
  let sheetName = workbook.SheetNames[0];
  if (targetSheet) {
    // Caller requested a specific sheet
    if (!workbook.SheetNames.includes(targetSheet)) {
      throw new Error(`Sheet "${targetSheet}" not found. Available: ${workbook.SheetNames.join(', ')}`);
    }
    sheetName = targetSheet;
  } else if (workbook.SheetNames.length > 1) {
    // Pick the sheet with the most columns.  Some government files include a
    // chart sheet (e.g. "תרשים1") as the first sheet, which has only 1–2 columns
    // of numeric data.  The real data sheet is the one with the widest column span.
    let bestColCount = 0;
    for (const name of workbook.SheetNames) {
      const s = workbook.Sheets[name];
      if (!s?.['!ref']) continue;
      const r = XLSX.utils.decode_range(s['!ref']);
      const cols = r.e.c - r.s.c + 1;
      if (cols > bestColCount) {
        bestColCount = cols;
        sheetName = name;
      }
    }
    if (sheetName !== workbook.SheetNames[0]) {
      logger.info({ sheetName, sheets: workbook.SheetNames }, 'Skipped chart/junk sheet — using sheet with most columns');
    }
  }
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('No sheets found in workbook');

  /**
   * Normalize a column name from an Excel file.
   * Israeli government files frequently embed invisible Unicode directional
   * marks (RTL U+200F, LTR U+200E, BOM U+FEFF, ZWS U+200B, etc.) in
   * column headers that are visually identical but break string matching.
   */
  const normalizeKey = (k: string) =>
    k.normalize('NFC')
      .replace(/[\u200B-\u200F\uFEFF\u00AD\u2028\u2029\u202A-\u202E\u2060]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  // ── Auto-detect the real header row ────────────────────────────────────────
  // Many Israeli government XLSX files start with merged title / logo / metadata
  // rows (sometimes 10+) before the actual column headers.  Instead of repeated
  // sheet_to_json calls, we directly scan the sheet cells: for each of the first
  // 20 rows, count how many cells are *string-type* and contain at least one
  // Hebrew (U+05D0-U+05EA) or Latin letter.  The row with the most such cells is
  // almost certainly the real column-header row.
  const sheetRange = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  let bestHeaderRow = sheetRange.s.r;
  let bestLetterCellCount = 0;

  for (let r = sheetRange.s.r; r <= Math.min(sheetRange.s.r + 19, sheetRange.e.r); r++) {
    let letterCells = 0;
    for (let c = sheetRange.s.c; c <= sheetRange.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === 's' && typeof cell.v === 'string' && /[a-zA-Z\u05D0-\u05EA]/.test(cell.v)) {
        letterCells++;
      }
    }
    if (letterCells > bestLetterCellCount) {
      bestLetterCellCount = letterCells;
      bestHeaderRow = r;
    }
    if (bestLetterCellCount >= 5) break; // clearly a real header row
  }

  // Use defval:'' so that ALL header columns appear in every record, even when
  // the corresponding data cell is empty.  Without this, SheetJS omits the key
  // entirely for blank cells — so a column like 'נושא' that happens to be empty
  // in the first data row would be absent from Object.keys(records[0]) and
  // therefore invisible to the field-mapping heuristic.
  let records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    ...(bestHeaderRow > sheetRange.s.r ? { range: bestHeaderRow } : {}),
  });
  if (bestHeaderRow > sheetRange.s.r) {
    logger.info({ sheetName, bestHeaderRow, bestLetterCellCount }, 'Auto-detected header row — skipped title rows');
  } else {
    // Debug: if we couldn't find a better header row, log the first 15 rows' cell counts
    const rowScores: Record<number, number> = {};
    for (let r = sheetRange.s.r; r <= Math.min(sheetRange.s.r + 14, sheetRange.e.r); r++) {
      let cnt = 0;
      for (let c = sheetRange.s.c; c <= sheetRange.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.t === 's' && typeof cell.v === 'string' && /[a-zA-Z\u05D0-\u05EA]/.test(cell.v)) cnt++;
      }
      rowScores[r] = cnt;
    }
    logger.warn({ sheetName, sheetRef: sheet['!ref'], rowScores }, 'No better header row found — using row 0');
  }

  // ── Detect header-less CSVs ──────────────────────────────────────────────
  // Some government CSV exports (Outlook, Google Calendar) have no header row —
  // the first row is data.  SheetJS then treats row 1 values as column names,
  // producing "field names" like "01/04/2024" or "12:00 - כיסוי וקליטה...".
  // Detect this by checking if field names look like data values, and if so,
  // re-parse with positional headers and content-based column type assignment.
  const DATE_RE = /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/;
  const TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (records.length > 0) {
    const rawKeys = Object.keys(records[0]);
    let dataLikeKeys = 0;
    for (const k of rawKeys) {
      const nk = normalizeKey(k);
      if (DATE_RE.test(nk) || TIME_RE.test(nk) || EMAIL_RE.test(nk) || nk.length > 80) {
        dataLikeKeys++;
      }
    }
    if (dataLikeKeys >= 2) {
      // Header-less CSV detected — re-parse with numeric headers so row 1 becomes data
      logger.info({ dataLikeKeys, totalKeys: rawKeys.length }, 'Header-less CSV detected — re-parsing with content-based column names');

      const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: '',
        ...(bestHeaderRow > sheetRange.s.r ? { range: bestHeaderRow } : {}),
      });

      // Analyze column content from first few rows to assign names
      const colCount = allRows.length > 0 ? (allRows[0] as unknown[]).length : 0;
      const syntheticHeaders: string[] = [];
      let titleAssigned = false;
      let dateAssigned = false;
      let startTimeAssigned = false;
      let endTimeAssigned = false;

      for (let c = 0; c < colCount; c++) {
        // Sample values from first 5 data rows
        const samples = allRows.slice(0, Math.min(5, allRows.length))
          .map(row => String((row as unknown[])[c] ?? '').trim())
          .filter(v => v !== '');

        const hasDate = samples.some(v => DATE_RE.test(v));
        const hasTime = samples.some(v => TIME_RE.test(v));
        const hasEmail = samples.some(v => EMAIL_RE.test(v));
        const avgLen = samples.length > 0 ? samples.reduce((s, v) => s + v.length, 0) / samples.length : 0;
        const hasText = samples.some(v => /[a-zA-Z\u05D0-\u05EA]/.test(v));

        if (hasDate && !dateAssigned) {
          syntheticHeaders.push('תאריך');
          dateAssigned = true;
        } else if (hasTime && !startTimeAssigned) {
          syntheticHeaders.push('שעת התחלה');
          startTimeAssigned = true;
        } else if (hasTime && !endTimeAssigned) {
          syntheticHeaders.push('שעת סיום');
          endTimeAssigned = true;
        } else if (!titleAssigned && hasText && !hasEmail && avgLen > 5) {
          syntheticHeaders.push('נושא');
          titleAssigned = true;
        } else if (hasEmail) {
          syntheticHeaders.push(`משתתפים_${c + 1}`);
        } else {
          syntheticHeaders.push(`עמודה_${c + 1}`);
        }
      }

      // If title wasn't assigned, pick the first text column
      if (!titleAssigned) {
        const idx = syntheticHeaders.findIndex(h => h.startsWith('עמודה_'));
        if (idx >= 0) syntheticHeaders[idx] = 'נושא';
      }

      // Merge multiple attendee columns into a single "משתתפים" column
      const attendeeCols = syntheticHeaders
        .map((h, i) => ({ h, i }))
        .filter(({ h }) => h.startsWith('משתתפים_'));
      if (attendeeCols.length > 1) {
        syntheticHeaders[attendeeCols[0].i] = 'משתתפים';
        // Mark remaining attendee cols for merging
        const mergeIndices = attendeeCols.slice(1).map(({ i }) => i);

        records = allRows.map(row => {
          const out: Record<string, unknown> = {};
          const attendeeParts: string[] = [];
          for (let c = 0; c < syntheticHeaders.length; c++) {
            const val = String((row as unknown[])[c] ?? '').trim();
            if (c === attendeeCols[0].i || mergeIndices.includes(c)) {
              if (val) attendeeParts.push(val);
            } else {
              out[syntheticHeaders[c]] = (row as unknown[])[c] ?? '';
            }
          }
          out['משתתפים'] = attendeeParts.join(', ');
          return out;
        });
        // Remove merged attendee headers
        for (let i = mergeIndices.length - 1; i >= 0; i--) {
          syntheticHeaders.splice(mergeIndices[i], 1);
        }
      } else {
        // Rename single attendee column if exists
        const atIdx = syntheticHeaders.findIndex(h => h.startsWith('משתתפים_'));
        if (atIdx >= 0) syntheticHeaders[atIdx] = 'משתתפים';

        // Rebuild records with synthetic headers
        records = allRows.map(row => {
          const out: Record<string, unknown> = {};
          for (let c = 0; c < syntheticHeaders.length; c++) {
            out[syntheticHeaders[c]] = (row as unknown[])[c] ?? '';
          }
          return out;
        });
      }

      logger.info({ syntheticHeaders }, 'Assigned synthetic column names to header-less CSV');
    }
  }

  // ── Detect missing title column — content-based fallback ───────────────
  // Some Outlook CSV exports have a blank header for the Subject column.
  // After __EMPTY handling, it gets renamed to "עמודה_N" which the heuristic
  // mapper won't recognize as "title". Check if any עמודה_N column contains
  // varied text data that looks like event titles, and rename it to "נושא".
  if (records.length > 0) {
    const rawKeys = Object.keys(records[0]).map(normalizeKey).filter(Boolean);
    const hasKnownTitle = rawKeys.some(k =>
      /נושא/i.test(k) || /title/i.test(k) || /subject/i.test(k) || /כותרת/i.test(k) || /description/i.test(k) || /summary/i.test(k)
    );
    if (!hasKnownTitle) {
      // Find a column with varied text content that could be titles
      const sampleSize = Math.min(records.length, 10);
      for (const key of Object.keys(records[0])) {
        const nk = normalizeKey(key);
        if (!nk) continue;
        // Skip columns already identified as known types
        if (/date|time|תאריך|שעה|location|מיקום|reminder/i.test(nk)) continue;
        // Check if this column has varied, medium-length text
        const vals = records.slice(0, sampleSize).map(r => String(r[key] ?? '').trim()).filter(v => v !== '');
        if (vals.length < 3) continue;
        const avgLen = vals.reduce((s, v) => s + v.length, 0) / vals.length;
        const uniqueCount = new Set(vals).size;
        const hasLetters = vals.some(v => /[a-zA-Z\u05D0-\u05EA]/.test(v));
        if (hasLetters && avgLen > 3 && avgLen < 200 && uniqueCount >= Math.min(3, vals.length * 0.5)) {
          // Rename this column to נושא in all records
          logger.info({ originalColumn: nk, avgLen, uniqueCount }, 'Auto-detected title column from content analysis');
          records = records.map(r => {
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(r)) {
              out[normalizeKey(k) === nk ? 'נושא' : k] = v;
            }
            return out;
          });
          break;
        }
      }
    }
  }

  // Check which __EMPTY columns actually contain data (blank header but real values).
  // These are common in government XLSX files where some headers are missing.
  const emptyColsWithData = new Set<string>();
  if (records.length > 0) {
    const sampleSize = Math.min(records.length, 5);
    for (const key of Object.keys(records[0])) {
      const nk = normalizeKey(key);
      if (nk.startsWith('__EMPTY')) {
        const hasData = records.slice(0, sampleSize).some(r => {
          const v = r[key];
          return v !== '' && v !== null && v !== undefined;
        });
        if (hasData) emptyColsWithData.add(key);
      }
    }
  }

  // Rename __EMPTY columns that have data to positional names (עמודה_N)
  const emptyColRenames = new Map<string, string>();
  if (emptyColsWithData.size > 0) {
    const allKeys = Object.keys(records[0]);
    for (const key of emptyColsWithData) {
      const idx = allKeys.indexOf(key);
      emptyColRenames.set(normalizeKey(key), `עמודה_${idx + 1}`);
    }
    logger.info({ renamedColumns: Object.fromEntries(emptyColRenames) },
      'Renamed blank-header columns that contain data');
  }

  const fields = records.length > 0
    ? Object.keys(records[0]).map(normalizeKey)
        .filter(k => k && (!k.startsWith('__EMPTY') || emptyColRenames.has(k)))
        .map(k => emptyColRenames.get(k) || k)
    : [];

  // Normalize field names in every record. Rename __EMPTY columns that have
  // data to positional names; drop truly empty __EMPTY columns.
  const cleaned = records.map(record => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      const k = normalizeKey(key);
      if (!k) continue;
      if (k.startsWith('__EMPTY')) {
        const renamed = emptyColRenames.get(k);
        if (renamed) out[renamed] = value;
      } else {
        out[k] = value;
      }
    }
    return out;
  });

  logger.info({ sheetName, recordCount: cleaned.length, fields }, 'Spreadsheet parsed');
  return { records: cleaned, fields, sheetName };
}

/** Parse ICAL/ICS files into flat records */
async function parseICAL(buffer: Buffer): Promise<{ records: Record<string, unknown>[]; fields: string[] }> {
  const ICAL = await getICAL();
  const text = buffer.toString('utf-8');
  const jcalData = ICAL.parse(text);
  const comp = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents('vevent');

  const records: Record<string, unknown>[] = [];

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    const record: Record<string, unknown> = {
      title: event.summary || '',
      start_time: event.startDate?.toJSDate()?.toISOString() || '',
      end_time: event.endDate?.toJSDate()?.toISOString() || '',
      location: event.location || '',
      description: event.description || '',
    };

    // Extract additional properties
    const organizer = vevent.getFirstPropertyValue('organizer');
    if (organizer) record.organizer = String(organizer).replace('mailto:', '');

    const attendees = vevent.getAllProperties('attendee');
    if (attendees.length > 0) {
      record.participants = attendees
        .map((a: unknown) => {
          const prop = a as { getParameter: (k: string) => string | null; getFirstValue: () => unknown };
          const cn = prop.getParameter('cn');
          return cn || String(prop.getFirstValue()).replace('mailto:', '');
        })
        .join(', ');
    }

    const uid = vevent.getFirstPropertyValue('uid');
    if (uid) record.uid = String(uid);

    const status = vevent.getFirstPropertyValue('status');
    if (status) record.status = String(status);

    records.push(record);
  }

  const fields = records.length > 0 ? Object.keys(records[0]) : [
    'title', 'start_time', 'end_time', 'location', 'description',
    'organizer', 'participants', 'uid', 'status',
  ];

  logger.info({ eventCount: records.length, fields }, 'ICAL parsed');
  return { records, fields };
}

/** Download and parse any supported file format */
export async function downloadAndParseFile(
  resourceUrl: string,
  format: string,
  sheetName?: string,
): Promise<{ records: Record<string, unknown>[]; fields: string[]; sheetName?: string; availableSheets?: Array<{ name: string; columns: number; rows: number }> }> {
  const buffer = await downloadFile(resourceUrl);
  const fmt = format.toUpperCase();

  if (['ICS', 'ICAL', 'ICA'].includes(fmt)) {
    return parseICAL(buffer);
  }

  // CSV, XLS, XLSX all handled by SheetJS
  const result = parseSpreadsheet(buffer, format, sheetName);

  // For multi-sheet workbooks, include metadata about all relevant sheets
  const availableSheets = ['XLS', 'XLSX'].includes(fmt)
    ? listRelevantSheets(buffer, format)
    : undefined;

  return { ...result, availableSheets };
}

// ──────────────────────────────────────────────
// 1D. Unified fetch — auto-detect method
// ──────────────────────────────────────────────

/**
 * Fetch ALL records from a CKAN resource.
 * Auto-detects whether to use datastore API or file download.
 * This is the main entry point for System 2.
 */
export async function fetchResourceRecords(
  resource: CKANResource,
  onProgress?: (fetched: number, total: number) => void,
  sheetName?: string,
): Promise<FetchResult> {
  const fmt = resource.format.toUpperCase();

  // Prefer datastore if active — UNLESS it's a spreadsheet format.
  // The CKAN datastore API mangles Hebrew column names (e.g. "משעה" → "msh`h")
  // which breaks field mapping. For spreadsheets, always download the raw file.
  if (resource.datastore_active && !isSpreadsheetFormat(fmt)) {
    logger.info({ resourceId: resource.id }, 'Fetching via datastore API');
    const datastoreResult = await datastoreSearchAll(resource.id, onProgress);
    // If the datastore is active but empty (CKAN failed to ingest the file), fall back to
    // direct file download so we don't silently import 0 records.
    if (datastoreResult.total === 0 && isSupportedFormat(fmt)) {
      logger.warn({ resourceId: resource.id, format: fmt }, 'Datastore returned 0 records — falling back to file download');
      const { records, fields } = await downloadAndParseFile(resource.url, resource.format, sheetName);
      onProgress?.(records.length, records.length);
      return { records, fields, total: records.length, format: fmt, fetchMethod: 'file_download' };
    }
    return datastoreResult;
  }

  // File download
  if (!isSupportedFormat(fmt)) {
    throw new Error(`Unsupported format: ${resource.format}. Supported: ${SUPPORTED_FORMATS.join(', ')}`);
  }

  logger.info({ resourceId: resource.id, format: fmt, reason: isSpreadsheetFormat(fmt) ? 'spreadsheet-hebrew-fix' : 'no-datastore' }, 'Fetching via file download');
  const { records, fields } = await downloadAndParseFile(resource.url, resource.format, sheetName);
  onProgress?.(records.length, records.length);

  return { records, fields, total: records.length, format: fmt, fetchMethod: 'file_download' };
}

/**
 * Preview: fetch resource metadata + sample records + fields.
 * Used by the admin UI before starting a full import.
 * @param sheetName — optional: profile this specific sheet (for multi-sheet workbooks)
 */
export async function previewResource(resourceId: string, sheetName?: string): Promise<{
  resource: CKANResource;
  package: CKANPackage;
  sampleRecords: Record<string, unknown>[];
  fields: string[];
  totalRecords: number;
  format: string;
  fetchMethod: 'datastore' | 'file_download';
  sheetName?: string;
  availableSheets?: Array<{ name: string; columns: number; rows: number }>;
}> {
  const resource = await getResource(resourceId);
  const pkg = await getPackage(resource.package_id);

  let sampleRecords: Record<string, unknown>[];
  let fields: string[];
  let totalRecords: number;
  let fetchMethod: 'datastore' | 'file_download';
  let resolvedSheetName: string | undefined;
  let availableSheets: Array<{ name: string; columns: number; rows: number }> | undefined;

  const fmt = resource.format.toUpperCase();

  // Use datastore API for preview — UNLESS it's a spreadsheet.
  // Spreadsheet datastore columns have mangled Hebrew names.
  if (resource.datastore_active && !isSpreadsheetFormat(fmt)) {
    const result = await datastoreSearch(resourceId, { limit: 10 });
    // If the datastore is active but empty (CKAN failed to ingest), fall back to file download.
    if (result.total === 0 && isSupportedFormat(fmt)) {
      logger.warn({ resourceId }, 'Datastore empty — falling back to file download for preview');
      const parsed = await downloadAndParseFile(resource.url, resource.format, sheetName);
      sampleRecords = parsed.records.slice(0, 10);
      fields = parsed.fields;
      totalRecords = parsed.records.length;
      fetchMethod = 'file_download';
      resolvedSheetName = parsed.sheetName;
      availableSheets = parsed.availableSheets;
    } else {
      sampleRecords = result.records;
      fields = result.fields.map(f => f.id).filter(f => f !== '_id');
      totalRecords = result.total;
      fetchMethod = 'datastore';
    }
  } else {
    const parsed = await downloadAndParseFile(resource.url, resource.format, sheetName);
    sampleRecords = parsed.records.slice(0, 10);
    fields = parsed.fields;
    totalRecords = parsed.records.length;
    fetchMethod = 'file_download';
    resolvedSheetName = parsed.sheetName;
    availableSheets = parsed.availableSheets;
  }

  return {
    resource,
    package: pkg,
    sampleRecords,
    fields,
    totalRecords,
    format: resource.format.toUpperCase(),
    fetchMethod,
    sheetName: resolvedSheetName,
    availableSheets: availableSheets && availableSheets.length > 1 ? availableSheets : undefined,
  };
}
