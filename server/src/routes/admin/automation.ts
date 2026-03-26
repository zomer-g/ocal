/**
 * Admin Automation Routes — auto-import management
 */
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/database.js';
import { env } from '../../config/env.js';
import { validate } from '../../middleware/validate.js';
import { logger } from '../../utils/logger.js';
import { getSettings, updateSettings, scanProgress } from '../../services/autoImport.js';
import { registerSource, processSource } from '../../services/pipeline.js';
import * as ckan from '../../services/ckan.js';
import {
  isSchedulerRunning,
  isScanActive,
  restartScheduler,
  triggerManualScan,
} from '../../services/scheduler.js';

export const adminAutomationRouter = Router();

// ──────────────────────────────────────────────
// Settings
// ──────────────────────────────────────────────

// GET /api/admin/automation/settings
adminAutomationRouter.get('/settings', async (_req, res, next) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/automation/settings
const settingsSchema = z.object({
  auto_scan_enabled: z.boolean().optional(),
  auto_scan_interval_hours: z.number().min(1).max(168).optional(),
  auto_import_confidence_threshold: z.number().min(0).max(1).optional(),
  owner_confidence_threshold: z.number().min(0).max(1).optional(),
});

adminAutomationRouter.put('/settings', validate(settingsSchema, 'body'), async (req, res, next) => {
  try {
    await updateSettings(req.body);
    // Restart scheduler if scan settings changed
    if ('auto_scan_enabled' in req.body || 'auto_scan_interval_hours' in req.body) {
      await restartScheduler();
    }
    const settings = await getSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// Scan
// ──────────────────────────────────────────────

// POST /api/admin/automation/scan — Trigger manual scan (runs in background)
adminAutomationRouter.post('/scan', async (_req, res, next) => {
  try {
    // Check if scan is already in progress before starting
    if (isScanActive()) {
      res.status(409).json({ error: 'סריקה כבר מתבצעת — נסה שוב מאוחר יותר' });
      return;
    }

    // Start scan in background — don't block HTTP response (scan takes minutes)
    triggerManualScan()
      .then((result) => logger.info({ result }, 'Manual scan completed'))
      .catch((err) => logger.error({ err }, 'Manual scan failed'));

    res.json({ message: 'הסריקה החלה ברקע. רענן את הדף בעוד כדקה.' });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// Queue
// ──────────────────────────────────────────────

// GET /api/admin/automation/queue
adminAutomationRouter.get('/queue', async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let query = db('auto_import_queue').orderBy('discovered_at', 'desc');
    let countQuery = db('auto_import_queue');

    if (status) {
      query = query.where('status', status);
      countQuery = countQuery.where('status', status);
    }

    const [items, countResult] = await Promise.all([
      query.limit(limit).offset(offset),
      countQuery.count('id as cnt').first(),
    ]);

    const total = Number(countResult?.cnt ?? 0);

    res.json({
      data: items.map((item) => ({
        ...item,
        fields: typeof item.fields === 'string' ? JSON.parse(item.fields) : item.fields,
        sample_records: typeof item.sample_records === 'string' ? JSON.parse(item.sample_records) : item.sample_records,
        suggested_mapping: typeof item.suggested_mapping === 'string' ? JSON.parse(item.suggested_mapping) : item.suggested_mapping,
        owner_signals: typeof item.owner_signals === 'string' ? JSON.parse(item.owner_signals) : item.owner_signals,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/automation/queue/clear-and-rescan
// Deletes ALL queue items and triggers a background re-scan with latest code
adminAutomationRouter.post('/queue/clear-and-rescan', async (_req, res, next) => {
  try {
    // Clear ALL queue items so they get re-evaluated as "new"
    const deleted = await db('auto_import_queue').del();

    logger.info({ deleted }, 'Cleared all queue items for full re-scan');

    // Start scan in background — don't block HTTP response
    triggerManualScan()
      .then((result) => logger.info({ result }, 'Background re-scan completed'))
      .catch((err) => logger.error({ err }, 'Background re-scan failed'));

    res.json({ cleared: deleted, message: 'הסריקה החלה ברקע. רענן את הדף בעוד כדקה.' });
  } catch (err) {
    if (err instanceof Error && err.message.includes('כבר מתבצעת')) {
      res.status(409).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// GET /api/admin/automation/queue/:id
adminAutomationRouter.get('/queue/:id', async (req, res, next) => {
  try {
    const item = await db('auto_import_queue').where({ id: req.params.id }).first();
    if (!item) {
      res.status(404).json({ error: 'Queue item not found' });
      return;
    }

    // Parse JSON fields
    const parsed = {
      ...item,
      fields: typeof item.fields === 'string' ? JSON.parse(item.fields) : item.fields,
      sample_records: typeof item.sample_records === 'string' ? JSON.parse(item.sample_records) : item.sample_records,
      suggested_mapping: typeof item.suggested_mapping === 'string' ? JSON.parse(item.suggested_mapping) : item.suggested_mapping,
      owner_signals: typeof item.owner_signals === 'string' ? JSON.parse(item.owner_signals) : item.owner_signals,
    };

    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/automation/queue/:id/approve
const approveSchema = z.object({
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

adminAutomationRouter.post('/queue/:id/approve', validate(approveSchema, 'body'), async (req, res, next) => {
  try {
    const item = await db('auto_import_queue').where({ id: req.params.id }).first();
    if (!item) {
      res.status(404).json({ error: 'Queue item not found' });
      return;
    }
    if (item.status !== 'pending' && item.status !== 'error') {
      res.status(400).json({ error: `Cannot approve item with status: ${item.status}` });
      return;
    }

    const body = req.body;
    const resource = await ckan.getResource(item.resource_id);
    const pkg = await ckan.getPackage(resource.package_id);

    const sourceId = await registerSource({
      resourceId: item.resource_id,
      datasetId: item.dataset_id,
      name: body.name,
      color: body.color,
      fieldMapping: body.field_mapping,
      mappingMethod: 'manual',
      mappingConfidence: 1.0,
      format: resource.format.toUpperCase(),
      fetchMethod: resource.datastore_active && !['XLS', 'XLSX'].includes(resource.format.toUpperCase())
        ? 'datastore' : 'file_download',
      personId: body.person_id || undefined,
      organizationId: body.organization_id || undefined,
      ckanMetadata: {
        datasetTitle: pkg.title,
        resourceName: resource.name,
        resourceUrl: resource.url,
        datasetUrl: `https://www.odata.org.il/dataset/${pkg.id}`,
        organization: pkg.organization?.title || null,
        lastModified: resource.last_modified,
      },
    });

    // Start processing in background
    processSource(sourceId)
      .then((result) => logger.info({ sourceId, created: result.recordsCreated }, 'Approved import complete'))
      .catch((err) => logger.error({ sourceId, err }, 'Approved import failed'));

    await db('auto_import_queue').where({ id: req.params.id }).update({
      status: 'approved',
      reviewed_at: new Date(),
      imported_source_id: sourceId,
      updated_at: new Date(),
    });

    res.status(202).json({ source_id: sourceId, message: 'ייבוא אושר — מעבד ברקע' });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/automation/queue/:id/reject
const rejectSchema = z.object({
  reason: z.string().optional(),
  add_exception: z.boolean().optional(),
});

adminAutomationRouter.post('/queue/:id/reject', validate(rejectSchema, 'body'), async (req, res, next) => {
  try {
    const item = await db('auto_import_queue').where({ id: req.params.id }).first();
    if (!item) {
      res.status(404).json({ error: 'Queue item not found' });
      return;
    }

    await db('auto_import_queue').where({ id: req.params.id }).update({
      status: 'rejected',
      failure_reason: req.body.reason || null,
      reviewed_at: new Date(),
      updated_at: new Date(),
    });

    // Optionally add to diary_exceptions so it won't appear again
    if (req.body.add_exception) {
      await db('diary_exceptions').insert({
        resource_id: item.resource_id,
        dataset_id: item.dataset_id,
        exception_reason: 'auto_rejected',
        notes: req.body.reason || 'Rejected from auto-import queue',
      }).onConflict('resource_id').ignore();
    }

    res.json({ message: 'פריט נדחה' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/automation/queue/:id
adminAutomationRouter.delete('/queue/:id', async (req, res, next) => {
  try {
    const deleted = await db('auto_import_queue').where({ id: req.params.id }).del();
    if (!deleted) {
      res.status(404).json({ error: 'Queue item not found' });
      return;
    }
    res.json({ message: 'פריט הוסר' });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// Logs
// ──────────────────────────────────────────────

// GET /api/admin/automation/logs
adminAutomationRouter.get('/logs', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const [logs, countResult] = await Promise.all([
      db('auto_import_logs').orderBy('scan_started_at', 'desc').limit(limit).offset(offset),
      db('auto_import_logs').count('id as cnt').first(),
    ]);

    const total = Number(countResult?.cnt ?? 0);

    res.json({
      data: logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// Status (dashboard summary)
// ──────────────────────────────────────────────

// GET /api/admin/automation/status
adminAutomationRouter.get('/status', async (_req, res, next) => {
  try {
    const [settings, pendingCount, lastLog] = await Promise.all([
      getSettings(),
      db('auto_import_queue').where({ status: 'pending' }).count('id as cnt').first(),
      db('auto_import_logs').orderBy('scan_started_at', 'desc').first(),
    ]);

    res.json({
      scheduler_running: isSchedulerRunning(),
      scan_in_progress: isScanActive(),
      scan_progress: scanProgress,
      settings,
      pending_count: Number(pendingCount?.cnt ?? 0),
      last_scan: lastLog || null,
    });
  } catch (err) {
    next(err);
  }
});
