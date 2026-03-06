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
    params: { q: `title:${query}`, rows, start },
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
  const { packages, totalCount } = await searchDatasets(query, 200);

  let totalResources = 0;
  const datasets = packages.map(pkg => {
    const resources = pkg.resources
      .filter(r => {
        const fmt = r.format.toUpperCase();
        return r.datastore_active || isSupportedFormat(fmt);
      })
      .map(r => {
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
      resources,
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

/** Parse CSV/XLS/XLSX with SheetJS */
function parseSpreadsheet(buffer: Buffer): { records: Record<string, unknown>[]; fields: string[] } {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('No sheets found in workbook');

  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  const fields = records.length > 0 ? Object.keys(records[0]).map(f => f.trim()) : [];

  // Trim field names in records
  const cleaned = records.map(record => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      out[key.trim()] = value;
    }
    return out;
  });

  logger.info({ sheetName, recordCount: cleaned.length, fields }, 'Spreadsheet parsed');
  return { records: cleaned, fields };
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
  format: string
): Promise<{ records: Record<string, unknown>[]; fields: string[] }> {
  const buffer = await downloadFile(resourceUrl);
  const fmt = format.toUpperCase();

  if (['ICS', 'ICAL', 'ICA'].includes(fmt)) {
    return parseICAL(buffer);
  }

  // CSV, XLS, XLSX all handled by SheetJS
  return parseSpreadsheet(buffer);
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
  onProgress?: (fetched: number, total: number) => void
): Promise<FetchResult> {
  const fmt = resource.format.toUpperCase();

  // Prefer datastore if active — UNLESS it's a spreadsheet format.
  // The CKAN datastore API mangles Hebrew column names (e.g. "משעה" → "msh`h")
  // which breaks field mapping. For spreadsheets, always download the raw file.
  if (resource.datastore_active && !isSpreadsheetFormat(fmt)) {
    logger.info({ resourceId: resource.id }, 'Fetching via datastore API');
    return datastoreSearchAll(resource.id, onProgress);
  }

  // File download
  if (!isSupportedFormat(fmt)) {
    throw new Error(`Unsupported format: ${resource.format}. Supported: ${SUPPORTED_FORMATS.join(', ')}`);
  }

  logger.info({ resourceId: resource.id, format: fmt, reason: isSpreadsheetFormat(fmt) ? 'spreadsheet-hebrew-fix' : 'no-datastore' }, 'Fetching via file download');
  const { records, fields } = await downloadAndParseFile(resource.url, resource.format);
  onProgress?.(records.length, records.length);

  return { records, fields, total: records.length, format: fmt, fetchMethod: 'file_download' };
}

/**
 * Preview: fetch resource metadata + sample records + fields.
 * Used by the admin UI before starting a full import.
 */
export async function previewResource(resourceId: string): Promise<{
  resource: CKANResource;
  package: CKANPackage;
  sampleRecords: Record<string, unknown>[];
  fields: string[];
  totalRecords: number;
  format: string;
  fetchMethod: 'datastore' | 'file_download';
}> {
  const resource = await getResource(resourceId);
  const pkg = await getPackage(resource.package_id);

  let sampleRecords: Record<string, unknown>[];
  let fields: string[];
  let totalRecords: number;
  let fetchMethod: 'datastore' | 'file_download';

  const fmt = resource.format.toUpperCase();

  // Use datastore API for preview — UNLESS it's a spreadsheet.
  // Spreadsheet datastore columns have mangled Hebrew names.
  if (resource.datastore_active && !isSpreadsheetFormat(fmt)) {
    const result = await datastoreSearch(resourceId, { limit: 10 });
    sampleRecords = result.records;
    fields = result.fields.map(f => f.id).filter(f => f !== '_id');
    totalRecords = result.total;
    fetchMethod = 'datastore';
  } else {
    const { records, fields: parsedFields } = await downloadAndParseFile(resource.url, resource.format);
    sampleRecords = records.slice(0, 10);
    fields = parsedFields;
    totalRecords = records.length;
    fetchMethod = 'file_download';
  }

  return {
    resource,
    package: pkg,
    sampleRecords,
    fields,
    totalRecords,
    format: resource.format.toUpperCase(),
    fetchMethod,
  };
}
