/**
 * ============================================================
 * SYSTEM 2: Processing Pipeline
 * ============================================================
 *
 * Responsible for:
 * A) Profiling: analyze a source's data structure and identify its schema
 * B) Processing: define per-source processing rules (field mapping, date formats)
 * C) Transforming: convert raw records into the unified DiaryEvent schema
 * D) Storage: persist events to DB with full metadata (source, processor, import date, etc.)
 *
 * This system receives raw data from System 1 and produces
 * normalized DiaryEvent records for System 3 to display.
 */

import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { parseDate, parseDateTime } from './dateParser.js';
import { mapFields, type FieldMapping, type MappingResult } from './fieldMapper.js';
import * as ckan from './ckan.js';
import type { CKANResource, CKANPackage, FetchResult } from './ckan.js';
import { extractEntitiesForSource } from './entityExtractor.js';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

/** Full processing definition for a source */
export interface SourceProcessingDef {
  // Identification
  resourceId: string;
  datasetId: string;
  name: string;
  color: string;

  // Processing rules
  fieldMapping: FieldMapping;
  mappingMethod: 'llm' | 'heuristic' | 'manual';
  mappingConfidence: number;
  format: string;
  fetchMethod: 'datastore' | 'file_download';

  // Association
  personId?: string;
  organizationId?: string;

  // CKAN metadata snapshot
  ckanMetadata: {
    datasetTitle: string;
    resourceName: string;
    resourceUrl: string;
    datasetUrl: string;
    organization: string | null;
    lastModified: string;
  };
}

/** Result of processing a single source */
export interface ProcessingResult {
  sourceId: string;
  recordsFetched: number;
  recordsCreated: number;
  recordsSkipped: number;
  recordsFailed: number;
  errors: string[];
  duration_ms: number;
  processingDef: SourceProcessingDef;
}

/** A normalized diary event ready for DB insertion */
export interface NormalizedEvent {
  source_id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  participants: string | null;
  dataset_name: string;
  dataset_link: string | null;
  is_active: boolean;
  other_fields: string;  // JSON stringified
  ckan_row_id: number | null;
}

// ──────────────────────────────────────────────
// 2A. Profiler — analyze a source's data structure
// ──────────────────────────────────────────────

/**
 * Profile a CKAN resource: fetch metadata, sample data, and auto-detect
 * the field mapping. Returns everything needed to create a processing definition.
 * @param sheetName — optional: profile a specific sheet (for multi-sheet workbooks)
 */
export async function profileSource(resourceId: string, sheetName?: string): Promise<{
  resource: CKANResource;
  pkg: CKANPackage;
  sampleRecords: Record<string, unknown>[];
  fields: string[];
  totalRecords: number;
  format: string;
  fetchMethod: 'datastore' | 'file_download';
  suggestedMapping: MappingResult;
  suggestedName: string;
  isDuplicate: boolean;
  existingSourceId?: string;
  sheetName?: string;
  availableSheets?: Array<{ name: string; columns: number; rows: number }>;
}> {
  // Fetch preview from System 1
  const preview = await ckan.previewResource(resourceId, sheetName);

  // Auto-detect field mapping
  const suggestedMapping = await mapFields(
    preview.fields,
    preview.sampleRecords,
    env.OPENAI_API_KEY || undefined,
    env.DEEPSEEK_API_KEY || undefined,
  );

  // Generate a suggested name: prefer resource name when dataset has multiple resources
  // (different persons in same dataset), otherwise use cleaned dataset title.
  // If we have a sheet name, include it for multi-sheet workbooks.
  const cleanTitle = preview.package.title
    .replace(/רבעון\s+\S+/g, '')
    .replace(/לשנת\s+\d+/g, '')
    .replace(/\s*\(.*?\)\s*/g, '')
    .trim();
  const resourceName = preview.resource.name
    .replace(/\.(csv|xlsx?|ics|ical)$/i, '')
    .replace(/\s*\(.*?\)\s*/g, '')
    .trim();
  // If resource name adds info beyond the dataset title, include it
  let suggestedName = resourceName && resourceName !== cleanTitle
    ? `${cleanTitle} — ${resourceName}`
    : (cleanTitle || resourceName);
  // For multi-sheet workbooks, append the sheet name to distinguish sources
  if (preview.availableSheets && preview.sheetName) {
    suggestedName = `${suggestedName} — ${preview.sheetName}`;
  }

  // Check for duplicates
  const existing = await db('diary_sources').where({ resource_id: resourceId }).first();

  return {
    resource: preview.resource,
    pkg: preview.package,
    sampleRecords: preview.sampleRecords,
    fields: preview.fields,
    totalRecords: preview.totalRecords,
    format: preview.format,
    fetchMethod: preview.fetchMethod,
    suggestedMapping,
    suggestedName,
    isDuplicate: !!existing,
    existingSourceId: existing?.id,
    sheetName: preview.sheetName,
    availableSheets: preview.availableSheets,
  };
}

// ──────────────────────────────────────────────
// 2B. Processor Registry — per-source processing rules
// ──────────────────────────────────────────────

/**
 * Create and persist a source processing definition.
 * This registers the source in the DB with all its processing metadata.
 */
export async function registerSource(def: SourceProcessingDef): Promise<string> {
  // Check for duplicates
  const existing = await db('diary_sources').where({ resource_id: def.resourceId }).first();
  if (existing) {
    throw new Error(`Source already registered: ${existing.id}`);
  }

  const [source] = await db('diary_sources')
    .insert({
      name: def.name,
      dataset_id: def.datasetId,
      resource_id: def.resourceId,
      dataset_url: def.ckanMetadata.datasetUrl,
      resource_url: def.ckanMetadata.resourceUrl,
      color: def.color,
      is_enabled: true,
      sync_status: 'pending',
      field_mapping: JSON.stringify(def.fieldMapping),
      person_id: def.personId || null,
      organization_id: def.organizationId || null,
      ckan_metadata: JSON.stringify(def.ckanMetadata),
    })
    .returning('*');

  // Cache the field mapping
  await db('field_mappings').insert({
    resource_id: def.resourceId,
    source_fields: Object.values(def.fieldMapping).filter(Boolean),
    mapping: JSON.stringify(def.fieldMapping),
    mapping_method: def.mappingMethod,
    confidence: def.mappingConfidence,
  });

  logger.info({ sourceId: source.id, name: def.name }, 'Source registered');
  return source.id;
}

// ──────────────────────────────────────────────
// 2C. Transformer — convert raw records to unified schema
// ──────────────────────────────────────────────

/**
 * Transform a single raw record into a NormalizedEvent using the field mapping.
 * Returns null if the record is invalid (missing required fields).
 */
export function transformRecord(
  record: Record<string, unknown>,
  mapping: FieldMapping,
  sourceId: string,
  datasetName: string,
  datasetLink?: string,
  _diagIndex?: number,  // used for first-N diagnostic logging
): NormalizedEvent | null {
  try {
    // Title (required)
    const rawTitle = record[mapping.title];
    if (!rawTitle || (typeof rawTitle === 'string' && !rawTitle.trim())) {
      if (_diagIndex !== undefined && _diagIndex < 3) {
        logger.warn({
          diagIndex: _diagIndex,
          mappingTitle: mapping.title,
          recordKeys: Object.keys(record),
          titleValue: rawTitle,
        }, 'transformRecord: title field missing or empty');
      }
      return null;
    }
    const title = typeof rawTitle === 'string' ? rawTitle.trim() : String(rawTitle);

    // Start time (required): combine date + optional time
    const rawDate = record[mapping.start_date];
    const startTime = parseDateTime(
      rawDate,
      mapping.start_time ? record[mapping.start_time] : undefined
    );
    if (!startTime) {
      if (_diagIndex !== undefined && _diagIndex < 3) {
        logger.warn({
          diagIndex: _diagIndex,
          mappingStartDate: mapping.start_date,
          mappingStartTime: mapping.start_time,
          dateValue: rawDate,
          dateType: typeof rawDate,
          dateIsDate: rawDate instanceof Date,
          parsedDate: parseDate(rawDate),
        }, 'transformRecord: start_date unparseable');
      }
      return null;
    }

    // End time (optional)
    const endTime = mapping.end_date
      ? parseDateTime(
          record[mapping.end_date],
          mapping.end_time ? record[mapping.end_time] : undefined
        )
      : null;

    // Optional text fields
    const location = mapping.location
      ? safeString(record[mapping.location])
      : null;
    const participants = mapping.participants
      ? safeString(record[mapping.participants])
      : null;

    // Collect unmapped fields into other_fields
    const mappedFieldNames = new Set(
      Object.values(mapping).filter((v): v is string => typeof v === 'string' && v.length > 0)
    );
    const otherFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (!mappedFieldNames.has(key) && key !== '_id' && value != null && value !== '') {
        otherFields[key] = value;
      }
    }

    // CKAN row ID for deduplication (only from datastore)
    const ckanRowId = typeof record._id === 'number' ? record._id : null;

    return {
      source_id: sourceId,
      title,
      start_time: startTime.toISOString(),
      end_time: endTime?.toISOString() || null,
      location,
      participants,
      dataset_name: datasetName,
      dataset_link: datasetLink || null,
      is_active: true,
      other_fields: JSON.stringify(otherFields),
      ckan_row_id: ckanRowId,
    };
  } catch {
    return null;
  }
}

function safeString(value: unknown): string | null {
  if (value == null || value === '') return null;
  const s = typeof value === 'string' ? value.trim() : String(value);
  return s || null;
}

// ──────────────────────────────────────────────
// 2D. Storage — persist to DB with metadata
// ──────────────────────────────────────────────

/**
 * Run the full processing pipeline for a source:
 * 1. Fetch raw records via System 1
 * 2. Transform each record via the field mapping
 * 3. Bulk insert into diary_events
 * 4. Update source metadata (stats, sync status, etc.)
 * 5. Create a sync log entry
 */
export async function processSource(
  sourceId: string,
  options: {
    isResync?: boolean;
    onProgress?: (phase: string, fetched: number, total: number) => void;
  } = {}
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const { isResync = false, onProgress } = options;

  // Load source definition from DB
  const source = await db('diary_sources').where({ id: sourceId }).first();
  if (!source) throw new Error(`Source not found: ${sourceId}`);

  const fieldMapping: FieldMapping = typeof source.field_mapping === 'string'
    ? JSON.parse(source.field_mapping)
    : source.field_mapping;

  const resource = await ckan.getResource(source.resource_id);
  const ckanMeta = typeof source.ckan_metadata === 'string'
    ? JSON.parse(source.ckan_metadata)
    : source.ckan_metadata || {};

  const result: ProcessingResult = {
    sourceId,
    recordsFetched: 0,
    recordsCreated: 0,
    recordsSkipped: 0,
    recordsFailed: 0,
    errors: [],
    duration_ms: 0,
    processingDef: {
      resourceId: source.resource_id,
      datasetId: source.dataset_id,
      name: source.name,
      color: source.color,
      fieldMapping,
      mappingMethod: 'manual',
      mappingConfidence: 1.0,
      format: resource.format.toUpperCase(),
      fetchMethod: resource.datastore_active ? 'datastore' : 'file_download',
      ckanMetadata: ckanMeta,
    },
  };

  // Create sync log
  const [syncLog] = await db('sync_logs')
    .insert({ source_id: sourceId, status: 'started' })
    .returning('*');

  try {
    // Update status to syncing
    await db('diary_sources').where({ id: sourceId }).update({
      sync_status: 'syncing',
      sync_error: null,
    });

    onProgress?.('fetching', 0, 0);

    // If resync, clear existing events
    if (isResync) {
      const deleted = await db('diary_events').where({ source_id: sourceId }).del();
      logger.info({ sourceId, deleted }, 'Cleared events for resync');
    }

    // ── Step 1: Fetch via System 1 ──
    const fetchResult = await ckan.fetchResourceRecords(resource, (fetched, total) => {
      onProgress?.('fetching', fetched, total);
    }, ckanMeta.sheetName);
    result.recordsFetched = fetchResult.total;

    logger.info({
      sourceId,
      format: fetchResult.format,
      method: fetchResult.fetchMethod,
      records: fetchResult.total,
    }, 'Records fetched, transforming...');

    // Log first record's actual fields vs mapping for diagnostics
    if (fetchResult.records.length > 0) {
      logger.info({
        firstRecordKeys: Object.keys(fetchResult.records[0]),
        fieldMapping,
        sampleValues: {
          title: fetchResult.records[0][fieldMapping.title],
          start_date: fetchResult.records[0][fieldMapping.start_date],
          start_time: fieldMapping.start_time ? fetchResult.records[0][fieldMapping.start_time] : undefined,
        },
      }, 'Field mapping diagnostic — first record');
    }

    // ── Step 2: Transform + Insert in batches ──
    const BATCH_SIZE = 200;
    const totalRecords = fetchResult.records.length;

    for (let i = 0; i < totalRecords; i += BATCH_SIZE) {
      const batch = fetchResult.records.slice(i, i + BATCH_SIZE);
      const transformed: NormalizedEvent[] = [];

      for (const record of batch) {
        const globalIndex = i + batch.indexOf(record);
        const event = transformRecord(
          record, fieldMapping, sourceId, source.name, source.dataset_url, globalIndex
        );
        if (event) {
          transformed.push(event);
        } else {
          result.recordsFailed++;
        }
      }

      if (transformed.length > 0) {
        try {
          await db('diary_events')
            .insert(transformed)
            .onConflict(db.raw('(source_id, ckan_row_id) WHERE ckan_row_id IS NOT NULL'))
            .merge();
          result.recordsCreated += transformed.length;
        } catch (err) {
          // Fallback: insert one-by-one
          for (const event of transformed) {
            try {
              await db('diary_events')
                .insert(event)
                .onConflict(db.raw('(source_id, ckan_row_id) WHERE ckan_row_id IS NOT NULL'))
                .merge();
              result.recordsCreated++;
            } catch {
              result.recordsSkipped++;
            }
          }
        }
      }

      onProgress?.('processing', Math.min(i + BATCH_SIZE, totalRecords), totalRecords);
    }

    // ── Step 3: Update source metadata ──
    const stats = await db('diary_events')
      .where({ source_id: sourceId, is_active: true })
      .select(
        db.raw('COUNT(*)::int as total_events'),
        db.raw('MIN(event_date) as first_event_date'),
        db.raw('MAX(event_date) as last_event_date')
      )
      .first();

    await db('diary_sources').where({ id: sourceId }).update({
      sync_status: 'completed',
      last_sync_at: new Date(),
      sync_error: null,
      total_events: stats?.total_events ?? 0,
      first_event_date: stats?.first_event_date || null,
      last_event_date: stats?.last_event_date || null,
    });

    result.duration_ms = Date.now() - startTime;

    // ── Step 4: Complete sync log ──
    await db('sync_logs').where({ id: syncLog.id }).update({
      status: 'completed',
      records_fetched: result.recordsFetched,
      records_created: result.recordsCreated,
      records_skipped: result.recordsSkipped,
      completed_at: new Date(),
      duration_ms: result.duration_ms,
    });

    logger.info({ sourceId, result: { ...result, processingDef: undefined } }, 'Processing complete');

    // ── Step 5: Trigger entity extraction in background (Stages 1 + 2 only, no AI cost) ──
    // AI NER (Stage 3) is triggered manually from the admin UI.
    extractEntitiesForSource(sourceId, { skipAI: true, clearExisting: isResync })
      .then((r) => logger.info({ sourceId, entities: r.entitiesInserted }, 'Entity extraction done'))
      .catch((err) => logger.warn({ sourceId, err }, 'Entity extraction failed (non-fatal)'));

    // ── Step 6: Find cross-diary event matches in background ──
    import('./eventMatcher.js')
      .then(({ findMatchesForSource }) =>
        findMatchesForSource(sourceId, { isResync })
      )
      .then((r) => logger.info({ sourceId, matches: r.matchesFound }, 'Event matching done'))
      .catch((err) => logger.warn({ sourceId, err }, 'Event matching failed (non-fatal)'));

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    result.errors.push(errMsg);
    result.duration_ms = Date.now() - startTime;

    await db('diary_sources').where({ id: sourceId }).update({
      sync_status: 'failed',
      sync_error: errMsg,
    });

    await db('sync_logs').where({ id: syncLog.id }).update({
      status: 'failed',
      error_message: errMsg,
      completed_at: new Date(),
      duration_ms: result.duration_ms,
    });

    logger.error({ sourceId, err: errMsg }, 'Processing failed');
    throw err;
  }

  return result;
}
