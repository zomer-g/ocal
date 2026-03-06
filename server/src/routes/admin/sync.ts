/**
 * Admin Sync Routes — bridges System 1 (CKAN Import) and System 2 (Pipeline)
 */
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/database.js';
import * as ckan from '../../services/ckan.js';
import { profileSource, registerSource, processSource } from '../../services/pipeline.js';
import { validate } from '../../middleware/validate.js';
import { logger } from '../../utils/logger.js';

export const adminSyncRouter = Router();

// ──────────────────────────────────────────────
// Discovery (System 1)
// ──────────────────────────────────────────────

// GET /api/admin/sync/discover — Discover diary datasets from ODATA
adminSyncRouter.get('/discover', async (req, res, next) => {
  try {
    const query = (req.query.q as string) || 'יומן';
    const discovery = await ckan.discoverDiaryResources(query);

    // Get already synced and excepted resource IDs
    const [synced, excepted] = await Promise.all([
      db('diary_sources').select('resource_id'),
      db('diary_exceptions').select('resource_id'),
    ]);
    const syncedIds = new Set(synced.map(s => s.resource_id));
    const exceptedIds = new Set(excepted.map(e => e.resource_id));

    // Annotate each resource with its import status
    const datasets = discovery.datasets.map(ds => ({
      ...ds,
      resources: ds.resources.map(r => ({
        ...r,
        status: syncedIds.has(r.id)
          ? 'synced' as const
          : exceptedIds.has(r.id)
          ? 'excepted' as const
          : 'available' as const,
      })),
    }));

    res.json({
      datasets,
      totalDatasets: discovery.totalDatasets,
      totalResources: discovery.totalResources,
      supportedFormats: ckan.SUPPORTED_FORMATS,
    });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// Profiling (System 2)
// ──────────────────────────────────────────────

// POST /api/admin/sync/profile — Profile a resource (preview + auto-detect mapping)
const profileSchema = z.object({
  resource_id: z.string().min(1),
});

adminSyncRouter.post('/profile', validate(profileSchema, 'body'), async (req, res, next) => {
  try {
    const profile = await profileSource(req.body.resource_id);

    res.json({
      resource: profile.resource,
      package: profile.pkg,
      sample_records: profile.sampleRecords,
      fields: profile.fields,
      total_records: profile.totalRecords,
      format: profile.format,
      fetch_method: profile.fetchMethod,
      suggested_mapping: profile.suggestedMapping.mapping,
      mapping_method: profile.suggestedMapping.method,
      mapping_confidence: profile.suggestedMapping.confidence,
      unmapped_fields: profile.suggestedMapping.unmappedFields,
      suggested_name: profile.suggestedName,
      is_duplicate: profile.isDuplicate,
      existing_source_id: profile.existingSourceId,
    });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// Import (System 1 + System 2)
// ──────────────────────────────────────────────

// POST /api/admin/sync/import — Register source + start processing
const importSchema = z.object({
  resource_id: z.string().min(1),
  dataset_id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  field_mapping: z.object({
    title: z.string().min(1),
    start_date: z.string().min(1),
    start_time: z.string().optional(),
    end_date: z.string().optional(),
    end_time: z.string().optional(),
    location: z.string().optional(),
    participants: z.string().optional(),
    organizer: z.string().optional(),
    notes: z.string().optional(),
  }),
  person_id: z.string().uuid().optional().nullable(),
  organization_id: z.string().uuid().optional().nullable(),
});

adminSyncRouter.post('/import', validate(importSchema, 'body'), async (req, res, next) => {
  try {
    const body = req.body;

    // Fetch metadata from CKAN for the snapshot
    const resource = await ckan.getResource(body.resource_id);
    const pkg = await ckan.getPackage(resource.package_id);

    // Register the source via System 2
    const sourceId = await registerSource({
      resourceId: body.resource_id,
      datasetId: body.dataset_id,
      name: body.name,
      color: body.color,
      fieldMapping: body.field_mapping,
      mappingMethod: 'manual',
      mappingConfidence: 1.0,
      format: resource.format.toUpperCase(),
      fetchMethod: resource.datastore_active ? 'datastore' : 'file_download',
      personId: body.person_id || undefined,
      organizationId: body.organization_id || undefined,
      ckanMetadata: {
        datasetTitle: pkg.title,
        resourceName: resource.name,
        resourceUrl: resource.url,
        datasetUrl: `${ckan.SUPPORTED_FORMATS ? '' : ''}https://www.odata.org.il/dataset/${pkg.id}`,
        organization: pkg.organization?.title || null,
        lastModified: resource.last_modified,
      },
    });

    logger.info({ sourceId, resourceId: body.resource_id }, 'Source registered, starting processing');

    // Start processing in background (don't await)
    processSource(sourceId)
      .then(result => {
        logger.info({ sourceId, created: result.recordsCreated, fetched: result.recordsFetched }, 'Import complete');
      })
      .catch(err => {
        logger.error({ sourceId, err }, 'Import failed');
      });

    res.status(202).json({
      source_id: sourceId,
      message: 'Import started — processing in background',
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/sync/resync/:sourceId — Re-process an existing source
adminSyncRouter.post('/resync/:sourceId', async (req, res, next) => {
  try {
    const source = await db('diary_sources').where({ id: req.params.sourceId }).first();
    if (!source) {
      res.status(404).json({ error: 'Source not found' });
      return;
    }

    processSource(source.id, { isResync: true })
      .then(result => {
        logger.info({ sourceId: source.id, created: result.recordsCreated }, 'Re-sync complete');
      })
      .catch(err => {
        logger.error({ sourceId: source.id, err }, 'Re-sync failed');
      });

    res.status(202).json({ source_id: source.id, message: 'Re-sync started' });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/sync/status/:sourceId — Get sync status + latest log
adminSyncRouter.get('/status/:sourceId', async (req, res, next) => {
  try {
    const source = await db('diary_sources')
      .where({ id: req.params.sourceId })
      .select('id', 'name', 'sync_status', 'sync_error', 'total_events', 'last_sync_at', 'field_mapping', 'ckan_metadata')
      .first();
    if (!source) {
      res.status(404).json({ error: 'Source not found' });
      return;
    }

    const latestLog = await db('sync_logs')
      .where({ source_id: source.id })
      .orderBy('started_at', 'desc')
      .first();

    res.json({ source, latest_sync_log: latestLog || null });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/sync/logs/:sourceId — Full sync history
adminSyncRouter.get('/logs/:sourceId', async (req, res, next) => {
  try {
    const logs = await db('sync_logs')
      .where({ source_id: req.params.sourceId })
      .orderBy('started_at', 'desc')
      .limit(50);
    res.json({ data: logs });
  } catch (err) {
    next(err);
  }
});
