import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import * as ckan from './ckan.js';
import { parseDateTime } from './dateParser.js';
import type { FieldMapping } from './fieldMapper.js';

export interface SyncOptions {
  sourceId: string;
  resourceId: string;
  fieldMapping: FieldMapping;
  datasetName: string;
  datasetLink?: string;
  isResync?: boolean;
  onProgress?: (fetched: number, total: number) => void;
}

export interface SyncResult {
  recordsFetched: number;
  recordsCreated: number;
  recordsSkipped: number;
  errors: string[];
}

/**
 * Transform a raw CKAN/XLSX record into a diary_events row
 * using the field mapping.
 */
function transformRecord(
  record: Record<string, unknown>,
  mapping: FieldMapping,
  sourceId: string,
  datasetName: string,
  datasetLink?: string
): Record<string, unknown> | null {
  try {
    const title = record[mapping.title];
    if (!title || (typeof title === 'string' && !title.trim())) return null;

    const startTime = parseDateTime(record[mapping.start_date], mapping.start_time ? record[mapping.start_time] : undefined);
    if (!startTime) return null;

    const endTime = mapping.end_date
      ? parseDateTime(record[mapping.end_date], mapping.end_time ? record[mapping.end_time] : undefined)
      : null;

    const location = mapping.location ? (record[mapping.location] as string) || null : null;
    const participants = mapping.participants ? (record[mapping.participants] as string) || null : null;

    // Collect unmapped fields into other_fields
    const mappedFieldNames = new Set(Object.values(mapping).filter(Boolean));
    const otherFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (!mappedFieldNames.has(key) && key !== '_id' && value != null && value !== '') {
        otherFields[key] = value;
      }
    }

    // Use _id from CKAN datastore if available for deduplication
    const ckanRowId = typeof record._id === 'number' ? record._id : null;

    return {
      source_id: sourceId,
      title: typeof title === 'string' ? title.trim() : String(title),
      start_time: startTime.toISOString(),
      end_time: endTime?.toISOString() || null,
      location: typeof location === 'string' ? location.trim() || null : null,
      participants: typeof participants === 'string' ? participants.trim() || null : null,
      dataset_name: datasetName,
      dataset_link: datasetLink || null,
      is_active: true,
      other_fields: JSON.stringify(otherFields),
      ckan_row_id: ckanRowId,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Run the full sync for a source: fetch records, transform, bulk insert.
 */
export async function syncSource(options: SyncOptions): Promise<SyncResult> {
  const {
    sourceId,
    resourceId,
    fieldMapping,
    datasetName,
    datasetLink,
    isResync = false,
    onProgress,
  } = options;

  const result: SyncResult = {
    recordsFetched: 0,
    recordsCreated: 0,
    recordsSkipped: 0,
    errors: [],
  };

  // Update source status to syncing
  await db('diary_sources').where({ id: sourceId }).update({ sync_status: 'syncing', sync_error: null });

  try {
    // Get resource metadata
    const resource = await ckan.getResource(resourceId);

    // If resync, clear existing events
    if (isResync) {
      const deleted = await db('diary_events').where({ source_id: sourceId }).del();
      logger.info({ sourceId, deleted }, 'Cleared existing events for resync');
    }

    // Fetch all records (auto-detects datastore vs file download)
    const { records, total } = await ckan.fetchResourceRecords(resource, onProgress);
    result.recordsFetched = records.length;

    logger.info({ resourceId, total: records.length }, 'Records fetched, transforming...');

    // Transform and insert in batches
    const BATCH_SIZE = 100;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const transformed = batch
        .map(record => transformRecord(record, fieldMapping, sourceId, datasetName, datasetLink))
        .filter((r): r is Record<string, unknown> => r !== null);

      if (transformed.length > 0) {
        try {
          // Use insert with onConflict for dedup (when ckan_row_id is available)
          await db('diary_events')
            .insert(transformed)
            .onConflict(db.raw('(source_id, ckan_row_id) WHERE ckan_row_id IS NOT NULL'))
            .merge();

          result.recordsCreated += transformed.length;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.warn({ batch: i, err: errMsg }, 'Batch insert error, trying individual inserts');

          // Fall back to individual inserts
          for (const event of transformed) {
            try {
              await db('diary_events').insert(event).onConflict(db.raw('(source_id, ckan_row_id) WHERE ckan_row_id IS NOT NULL')).merge();
              result.recordsCreated++;
            } catch {
              result.recordsSkipped++;
            }
          }
        }
      }

      result.recordsSkipped += batch.length - transformed.length;
      onProgress?.(Math.min(i + BATCH_SIZE, records.length), records.length);
    }

    // Update source stats
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

    logger.info({ sourceId, result }, 'Sync completed');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    result.errors.push(errMsg);

    await db('diary_sources').where({ id: sourceId }).update({
      sync_status: 'failed',
      sync_error: errMsg,
    });

    logger.error({ sourceId, err: errMsg }, 'Sync failed');
    throw err;
  }

  return result;
}
