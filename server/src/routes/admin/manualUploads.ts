/**
 * Manual / LLM-assisted PDF diary ingestion.
 *
 * Workflow:
 *  1. POST /api/admin/manual-uploads (multipart) — store PDF in DB.
 *  2. GET /:id/file streams the PDF back for the in-browser viewer.
 *  3. POST /:id/extract?provider=claude|gpt4o (optional) populates draft_events.
 *  4. PATCH /:id/draft-events autosaves the editable list.
 *  5. POST /:id/commit transactionally creates the diary_source (if new) and
 *     inserts the events into diary_events; optionally kicks off entity
 *     extraction reusing the existing services/entityExtractor pipeline.
 */

import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../../config/database.js';
import { validate } from '../../middleware/validate.js';
import { logger } from '../../utils/logger.js';
import {
  extractDiaryFromPdf,
  LLMNotConfiguredError,
  type LLMProvider,
  type ExtractMode,
} from '../../services/llm/index.js';
import { pdfPageCount } from '../../services/llm/rasterize.js';
import { extractEntitiesForSource } from '../../services/entityExtractor.js';
import { requireRole } from '../../middleware/auth.js';

export const adminManualUploadsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// ──────────────────────────────────────────────
// POST /api/admin/manual-uploads — upload a PDF
// ──────────────────────────────────────────────
adminManualUploadsRouter.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'PDF file required (form field "file")' });
      return;
    }
    if (file.mimetype !== 'application/pdf') {
      res.status(400).json({ error: 'Only application/pdf is accepted' });
      return;
    }

    // multer leaves originalname in latin1; recode to UTF-8 so Hebrew
    // (and any non-ASCII) names round-trip correctly.
    const filename = Buffer.from(file.originalname, 'latin1').toString('utf8');

    const [row] = await db('manual_diary_uploads')
      .insert({
        uploaded_by: req.adminUser?.id ?? null,
        filename,
        mime_type: file.mimetype,
        file_size: file.size,
        file_data: file.buffer,
      })
      .returning(['id', 'filename', 'mime_type', 'file_size', 'extraction_status', 'created_at']);

    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// GET /api/admin/manual-uploads — list (no file_data)
// ──────────────────────────────────────────────
adminManualUploadsRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await db('manual_diary_uploads')
      .select(
        'id', 'filename', 'mime_type', 'file_size',
        'source_id', 'extraction_status', 'extraction_provider',
        'committed_at', 'created_at', 'updated_at',
      )
      .orderBy('created_at', 'desc');
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// GET /api/admin/manual-uploads/:id — metadata + draft + result
// ──────────────────────────────────────────────
adminManualUploadsRouter.get('/:id', async (req, res, next) => {
  try {
    const row = await db('manual_diary_uploads')
      .select(
        'id', 'filename', 'mime_type', 'file_size',
        'source_id', 'extraction_status', 'extraction_provider',
        'extraction_result', 'extraction_error', 'draft_events',
        'committed_at', 'created_at', 'updated_at',
      )
      .where({ id: req.params.id })
      .first();
    if (!row) {
      res.status(404).json({ error: 'Upload not found' });
      return;
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// GET /api/admin/manual-uploads/:id/file — stream the PDF bytes
// ──────────────────────────────────────────────
adminManualUploadsRouter.get('/:id/file', async (req, res, next) => {
  try {
    const row = await db('manual_diary_uploads')
      .select('filename', 'mime_type', 'file_data')
      .where({ id: req.params.id })
      .first();
    if (!row) {
      res.status(404).json({ error: 'Upload not found' });
      return;
    }
    res.set('Content-Type', row.mime_type);
    res.set('Content-Disposition', `inline; filename="${encodeURIComponent(row.filename)}"`);
    res.send(row.file_data);
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// POST /api/admin/manual-uploads/:id/extract?provider=claude|gpt4o&page=N
// ──────────────────────────────────────────────
const extractQuerySchema = z.object({
  provider: z.enum(['claude', 'gpt4o']),
  page: z.coerce.number().int().min(1).optional(),
  mode: z.enum(['auto', 'native', 'raster']).default('auto'),
});

adminManualUploadsRouter.post('/:id/extract', validate(extractQuerySchema, 'query'), async (req, res, next) => {
  try {
    const provider = (req.query.provider as LLMProvider);
    const page = req.query.page ? Number(req.query.page) : undefined;
    const mode = (req.query.mode as ExtractMode | undefined) ?? 'auto';
    const row = await db('manual_diary_uploads')
      .select('id', 'file_data', 'committed_at')
      .where({ id: req.params.id })
      .first();
    if (!row) { res.status(404).json({ error: 'Upload not found' }); return; }
    if (row.committed_at) {
      res.status(409).json({ error: 'Upload already committed; create a new upload to re-extract' });
      return;
    }

    await db('manual_diary_uploads').where({ id: row.id }).update({
      extraction_status: 'running',
      extraction_provider: provider,
      extraction_error: null,
    });

    try {
      const result = await extractDiaryFromPdf(row.file_data, provider, { page, mode });
      await db('manual_diary_uploads').where({ id: row.id }).update({
        extraction_status: 'completed',
        extraction_result: JSON.stringify(result),
      });
      logger.info(
        {
          uploadId: row.id,
          provider,
          mode,
          eventCount: result.events.length,
          tokens: result.tokens_used,
          diagnostics: result.diagnostics,
        },
        'PDF extraction complete',
      );
      const rawText = (result.raw_response as { text?: string } | undefined)?.text;
      res.json({
        provider,
        events: result.events,
        tokens_used: result.tokens_used,
        event_count: result.events.length,
        raw_text_preview: typeof rawText === 'string' ? rawText.slice(0, 1500) : null,
        diagnostics: result.diagnostics,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db('manual_diary_uploads').where({ id: row.id }).update({
        extraction_status: 'failed',
        extraction_error: msg,
      });
      if (err instanceof LLMNotConfiguredError) {
        res.status(503).json({ error: msg });
        return;
      }
      logger.error({ uploadId: row.id, provider, mode, err: msg }, 'PDF extraction failed');
      res.status(502).json({ error: `Extraction failed: ${msg}` });
    }
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// POST /api/admin/manual-uploads/:id/extract-batch
// SSE-streamed chunked extraction over the full document.
//
// Query params: provider, mode, chunk_size (default 5)
// Streams `progress` events of the form:
//   { type: 'progress', chunk_index, total_chunks, range, events, diagnostics }
// followed by one terminal `done` event:
//   { type: 'done', total_events, chunks_completed, partial_failures }
// On fatal error, a single `error` event with `{ message }` then close.
//
// Partial progress is also persisted into `extraction_result` so a client
// reconnect / network drop doesn't lose accumulated events.
// ──────────────────────────────────────────────
const extractBatchQuerySchema = z.object({
  provider: z.enum(['claude', 'gpt4o']),
  mode: z.enum(['auto', 'native', 'raster']).default('auto'),
  chunk_size: z.coerce.number().int().min(1).max(20).default(5),
});

adminManualUploadsRouter.post(
  '/:id/extract-batch',
  validate(extractBatchQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const provider = req.query.provider as LLMProvider;
      const mode = (req.query.mode as ExtractMode | undefined) ?? 'auto';
      const chunkSize = req.query.chunk_size ? Number(req.query.chunk_size) : 5;

      const row = await db('manual_diary_uploads')
        .select('id', 'file_data', 'committed_at')
        .where({ id: req.params.id })
        .first();
      if (!row) { res.status(404).json({ error: 'Upload not found' }); return; }
      if (row.committed_at) {
        res.status(409).json({ error: 'Upload already committed' });
        return;
      }

      const totalPages = await pdfPageCount(row.file_data);
      const chunks: Array<{ from: number; to: number }> = [];
      for (let from = 1; from <= totalPages; from += chunkSize) {
        chunks.push({ from, to: Math.min(from + chunkSize - 1, totalPages) });
      }

      // SSE headers
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders?.();

      const send = (data: unknown) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      await db('manual_diary_uploads').where({ id: row.id }).update({
        extraction_status: 'running',
        extraction_provider: provider,
        extraction_error: null,
      });

      const aggregateEvents: unknown[] = [];
      const partialFailures: Array<{ chunk_index: number; range: { from: number; to: number }; error: string }> = [];
      let lastDiagnostics: unknown = null;

      send({ type: 'init', total_pages: totalPages, total_chunks: chunks.length, chunk_size: chunkSize });

      for (let i = 0; i < chunks.length; i++) {
        const range = chunks[i];
        try {
          const result = await extractDiaryFromPdf(row.file_data, provider, { range, mode });
          aggregateEvents.push(...result.events);
          lastDiagnostics = result.diagnostics;
          send({
            type: 'progress',
            chunk_index: i,
            total_chunks: chunks.length,
            range,
            events: result.events,
            tokens_used: result.tokens_used,
            diagnostics: result.diagnostics,
          });

          // Persist partial progress
          await db('manual_diary_uploads').where({ id: row.id }).update({
            extraction_result: JSON.stringify({
              events: aggregateEvents,
              provider,
              mode,
              partial: i < chunks.length - 1,
              last_chunk_index: i,
              total_chunks: chunks.length,
              partial_failures: partialFailures,
              last_diagnostics: lastDiagnostics,
            }),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          partialFailures.push({ chunk_index: i, range, error: msg });
          send({
            type: 'chunk_error',
            chunk_index: i,
            total_chunks: chunks.length,
            range,
            error: msg,
          });
          if (err instanceof LLMNotConfiguredError) {
            await db('manual_diary_uploads').where({ id: row.id }).update({
              extraction_status: 'failed',
              extraction_error: msg,
            });
            send({ type: 'error', message: msg });
            res.end();
            return;
          }
          // continue with next chunk
        }
      }

      await db('manual_diary_uploads').where({ id: row.id }).update({
        extraction_status: 'completed',
        extraction_result: JSON.stringify({
          events: aggregateEvents,
          provider,
          mode,
          partial: false,
          last_chunk_index: chunks.length - 1,
          total_chunks: chunks.length,
          partial_failures: partialFailures,
          last_diagnostics: lastDiagnostics,
        }),
      });

      send({
        type: 'done',
        total_events: aggregateEvents.length,
        chunks_completed: chunks.length - partialFailures.length,
        partial_failures: partialFailures,
      });
      res.end();
    } catch (err) {
      // Pre-stream error — fall back to JSON
      if (!res.headersSent) return next(err);
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, 'extract-batch fatal error mid-stream');
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
      } finally {
        res.end();
      }
    }
  },
);

// ──────────────────────────────────────────────
// PATCH /api/admin/manual-uploads/:id/draft-events — autosave
// ──────────────────────────────────────────────
// Loose schema: autosave runs on every keystroke; an event with an empty
// title or empty time is a normal mid-edit state, not an error. Strict
// validation happens at commit instead.
const draftEventLooseSchema = z.object({
  title: z.string().default(''),
  start_time: z.string().default(''),
  end_time: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  participants: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  source_page: z.number().int().optional().nullable(),
  provider: z.enum(['claude', 'gpt4o', 'manual']).optional(),
}).passthrough();

const draftEventStrictSchema = draftEventLooseSchema.extend({
  title: z.string().min(1),
  start_time: z.string().min(1),
});

const draftEventsSchema = z.object({
  draft_events: z.array(draftEventLooseSchema),
});

adminManualUploadsRouter.patch('/:id/draft-events', validate(draftEventsSchema, 'body'), async (req, res, next) => {
  try {
    const exists = await db('manual_diary_uploads')
      .select('id', 'committed_at')
      .where({ id: req.params.id })
      .first();
    if (!exists) { res.status(404).json({ error: 'Upload not found' }); return; }
    if (exists.committed_at) {
      res.status(409).json({ error: 'Upload already committed' });
      return;
    }
    await db('manual_diary_uploads').where({ id: req.params.id }).update({
      draft_events: JSON.stringify(req.body.draft_events),
    });
    res.json({ saved: true, count: req.body.draft_events.length });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// POST /api/admin/manual-uploads/:id/commit
// ──────────────────────────────────────────────
const commitSchema = z.object({
  // Either reuse an existing source, or create a new one
  source_id: z.string().uuid().optional(),
  source: z.object({
    name: z.string().min(1),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3B82F6'),
    person_id: z.string().uuid().optional().nullable(),
    organization_id: z.string().uuid().optional().nullable(),
    dataset_link: z.string().url().optional().nullable(),
  }).optional(),
  events: z.array(draftEventStrictSchema).min(1),
  run_entity_extraction: z.boolean().default(true),
}).refine(
  (b) => !!b.source_id || !!b.source,
  { message: 'Either source_id or source must be provided' },
);

/**
 * Wrap a naive datetime (no TZ) so PG interprets it as Asia/Jerusalem
 * local time and stores the correct UTC instant. If the value already
 * carries an explicit TZ, pass through untouched.
 */
function israelTs(value: string | null | undefined) {
  if (!value) return null;
  const hasTz = /([+-]\d{2}:?\d{2}|Z)$/.test(value);
  if (hasTz) return db.raw('?::timestamptz', [value]);
  return db.raw(`?::timestamp AT TIME ZONE 'Asia/Jerusalem'`, [value]);
}

adminManualUploadsRouter.post('/:id/commit', validate(commitSchema, 'body'), async (req, res, next) => {
  try {
    const upload = await db('manual_diary_uploads')
      .select('id', 'filename', 'committed_at')
      .where({ id: req.params.id })
      .first();
    if (!upload) { res.status(404).json({ error: 'Upload not found' }); return; }
    if (upload.committed_at) {
      res.status(409).json({ error: 'Upload already committed' });
      return;
    }

    const body = req.body as z.infer<typeof commitSchema>;

    const sourceId = await db.transaction(async (trx) => {
      let resolvedSourceId: string;
      let datasetName: string;

      if (body.source_id) {
        const existing = await trx('diary_sources').where({ id: body.source_id }).first();
        if (!existing) throw new Error(`Source ${body.source_id} not found`);
        resolvedSourceId = existing.id;
        datasetName = existing.name;
      } else if (body.source) {
        const [created] = await trx('diary_sources')
          .insert({
            name: body.source.name,
            color: body.source.color,
            dataset_id: null,
            resource_id: null,
            dataset_url: body.source.dataset_link ?? null,
            person_id: body.source.person_id ?? null,
            organization_id: body.source.organization_id ?? null,
            sync_status: 'completed',
            total_events: body.events.length,
            ckan_metadata: JSON.stringify({ kind: 'manual_pdf', upload_id: upload.id, filename: upload.filename }),
          })
          .returning(['id', 'name']);
        resolvedSourceId = created.id;
        datasetName = created.name;
      } else {
        throw new Error('Unreachable — schema guarantees source_id or source');
      }

      // Insert events. Naive timestamps (no TZ) are interpreted as
      // Asia/Jerusalem local time so they store the correct UTC instant.
      const rows = body.events.map((e) => ({
        source_id: resolvedSourceId,
        title: e.title,
        start_time: israelTs(e.start_time),
        end_time: israelTs(e.end_time),
        location: e.location ?? null,
        participants: e.participants ?? null,
        dataset_name: datasetName,
        is_active: true,
        ckan_row_id: null,
        other_fields: JSON.stringify({
          source_upload_id: upload.id,
          source_page: e.source_page ?? null,
          extraction_provider: e.provider ?? null,
          notes: e.notes ?? null,
        }),
      }));
      await trx('diary_events').insert(rows);

      // Stamp upload as committed
      await trx('manual_diary_uploads').where({ id: upload.id }).update({
        source_id: resolvedSourceId,
        committed_at: trx.fn.now(),
      });

      // Refresh source aggregates
      const range = await trx('diary_events')
        .where({ source_id: resolvedSourceId, is_active: true })
        .min('event_date as first_event_date')
        .max('event_date as last_event_date')
        .count('* as total_events')
        .first();
      await trx('diary_sources').where({ id: resolvedSourceId }).update({
        first_event_date: range?.first_event_date ?? null,
        last_event_date: range?.last_event_date ?? null,
        total_events: Number(range?.total_events ?? 0),
        last_sync_at: trx.fn.now(),
      });

      return resolvedSourceId;
    });

    // Kick off entity extraction outside the transaction (it has its own
    // long-running stages including LLM calls). Don't block the response.
    if (req.body.run_entity_extraction) {
      extractEntitiesForSource(sourceId, { skipAI: false })
        .then((r) => logger.info({ sourceId, entitiesInserted: r.entitiesInserted }, 'Entity extraction done after manual commit'))
        .catch((err) => logger.error({ sourceId, err }, 'Entity extraction failed after manual commit'));
    }

    res.status(201).json({
      source_id: sourceId,
      events_inserted: body.events.length,
      entity_extraction_queued: !!req.body.run_entity_extraction,
    });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────
// DELETE /api/admin/manual-uploads/:id — discard (only if not committed)
// ──────────────────────────────────────────────
// ──────────────────────────────────────────────
// POST /:id/review and /:id/unreview — mark/unmark as content-checked
// ──────────────────────────────────────────────
const reviewSchema = z.object({ notes: z.string().optional() });

adminManualUploadsRouter.post('/:id/review', validate(reviewSchema, 'body'), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof reviewSchema>;
    const [row] = await db('manual_diary_uploads')
      .where({ id: req.params.id })
      .update({
        reviewed_at: new Date(),
        reviewed_by: req.adminUser?.id ?? null,
        review_notes: body.notes ?? null,
        updated_at: new Date(),
      })
      .returning(['id', 'reviewed_at', 'reviewed_by', 'review_notes']);
    if (!row) { res.status(404).json({ error: 'Upload not found' }); return; }
    // The committed source also gets marked — propagation is by JOIN at
    // read time so no extra writes needed.
    res.json(row);
  } catch (err) {
    next(err);
  }
});

adminManualUploadsRouter.post('/:id/unreview', async (req, res, next) => {
  try {
    const [row] = await db('manual_diary_uploads')
      .where({ id: req.params.id })
      .update({ reviewed_at: null, reviewed_by: null, review_notes: null, updated_at: new Date() })
      .returning(['id']);
    if (!row) { res.status(404).json({ error: 'Upload not found' }); return; }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminManualUploadsRouter.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const row = await db('manual_diary_uploads').select('committed_at').where({ id: req.params.id }).first();
    if (!row) { res.status(404).json({ error: 'Upload not found' }); return; }
    if (row.committed_at) {
      res.status(409).json({ error: 'Cannot delete a committed upload' });
      return;
    }
    await db('manual_diary_uploads').where({ id: req.params.id }).del();
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});
