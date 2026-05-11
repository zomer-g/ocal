/**
 * Browse / edit / review individual conflict-of-interest arrangements.
 *
 * Most operations are admin + content_manager. Hard DELETE is admin only.
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/database.js';
import { validate } from '../../middleware/validate.js';
import { requireRole } from '../../middleware/auth.js';
import { parsePagination, buildPaginationMeta } from '../../utils/pagination.js';

export const adminCoiArrangementsRouter = Router();

// ── GET / — list with filters ──────────────────────────────────────
const listSchema = z.object({
  origin: z.enum(['odata', 'gov_il_zip']).optional(),
  person_id: z.string().uuid().optional(),
  reviewed: z.enum(['true', 'false']).optional(),
  q: z.string().optional(),
  page: z.coerce.number().optional(),
  per_page: z.coerce.number().optional(),
});

adminCoiArrangementsRouter.get('/', validate(listSchema, 'query'), async (req, res, next) => {
  try {
    const q = req.query as z.infer<typeof listSchema>;
    const { page, per_page, offset } = parsePagination(q);

    let query = db('coi_arrangements as c')
      .leftJoin('people as p', 'p.id', 'c.person_id')
      .leftJoin('organizations as o', 'o.id', 'c.organization_id')
      .leftJoin('admin_users as u', 'u.id', 'c.reviewed_by');

    if (q.origin)     query = query.where('c.origin', q.origin);
    if (q.person_id)  query = query.where('c.person_id', q.person_id);
    if (q.reviewed === 'true')  query = query.whereNotNull('c.reviewed_at');
    if (q.reviewed === 'false') query = query.whereNull('c.reviewed_at');
    if (q.q) {
      const like = `%${q.q}%`;
      query = query.where((b) => {
        b.whereILike('c.title', like)
          .orWhereILike('c.subject_name_raw', like)
          .orWhereILike('c.filename', like);
      });
    }

    const countQuery = query.clone().clearSelect().clearOrder().count('* as total').first();

    query = query
      .select(
        'c.id', 'c.origin', 'c.subject_name_raw', 'c.title', 'c.document_date',
        'c.source_url', 'c.filename', 'c.file_size', 'c.import_batch_id',
        'c.reviewed_at', 'c.review_notes', 'c.created_at',
        'p.id as person_id', 'p.name as person_name',
        'o.id as organization_id', 'o.name as organization_name',
        'u.email as reviewed_by_email',
      )
      .orderBy('c.created_at', 'desc')
      .offset(offset)
      .limit(per_page);

    const [rows, countResult] = await Promise.all([query, countQuery]);
    res.json({
      data: rows,
      pagination: buildPaginationMeta(page, per_page, Number(countResult?.total ?? 0)),
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /:id — single row (no file_data) ───────────────────────────
adminCoiArrangementsRouter.get('/:id', async (req, res, next) => {
  try {
    const row = await db('coi_arrangements as c')
      .leftJoin('people as p', 'p.id', 'c.person_id')
      .leftJoin('organizations as o', 'o.id', 'c.organization_id')
      .leftJoin('admin_users as u', 'u.id', 'c.reviewed_by')
      .where('c.id', req.params.id)
      .select(
        'c.id', 'c.origin', 'c.subject_name_raw', 'c.title', 'c.document_date',
        'c.source_url', 'c.filename', 'c.mime_type', 'c.file_size', 'c.file_hash',
        'c.import_batch_id', 'c.uploaded_by',
        'c.reviewed_at', 'c.reviewed_by', 'c.review_notes',
        'c.created_at', 'c.updated_at',
        'p.id as person_id', 'p.name as person_name',
        'o.id as organization_id', 'o.name as organization_name',
        'u.email as reviewed_by_email',
      )
      .first();
    if (!row) {
      res.status(404).json({ error: 'COI arrangement not found' });
      return;
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// ── GET /:id/file — stream the PDF ─────────────────────────────────
adminCoiArrangementsRouter.get('/:id/file', async (req, res, next) => {
  try {
    const row = await db('coi_arrangements')
      .select('filename', 'mime_type', 'file_data')
      .where({ id: req.params.id })
      .first();
    if (!row) {
      res.status(404).json({ error: 'COI arrangement not found' });
      return;
    }
    res.set('Content-Type', row.mime_type || 'application/pdf');
    res.set('Content-Disposition', `inline; filename="${encodeURIComponent(row.filename)}"`);
    res.send(row.file_data);
  } catch (err) {
    next(err);
  }
});

// ── PATCH /:id — edit metadata ─────────────────────────────────────
const patchSchema = z.object({
  title: z.string().min(1).optional(),
  subject_name_raw: z.string().min(1).optional(),
  document_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  person_id: z.string().uuid().nullable().optional(),
  organization_id: z.string().uuid().nullable().optional(),
  source_url: z.string().url().nullable().optional(),
});

adminCoiArrangementsRouter.patch('/:id', validate(patchSchema, 'body'), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof patchSchema>;
    const update: Record<string, unknown> = {};
    for (const k of Object.keys(body) as (keyof typeof body)[]) {
      if (body[k] !== undefined) update[k] = body[k];
    }
    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }
    const [row] = await db('coi_arrangements')
      .where({ id: req.params.id })
      .update({ ...update, updated_at: new Date() })
      .returning('*');
    if (!row) {
      res.status(404).json({ error: 'COI arrangement not found' });
      return;
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// ── POST /:id/review — mark reviewed ───────────────────────────────
const reviewSchema = z.object({ notes: z.string().optional() });
adminCoiArrangementsRouter.post('/:id/review', validate(reviewSchema, 'body'), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof reviewSchema>;
    const [row] = await db('coi_arrangements')
      .where({ id: req.params.id })
      .update({
        reviewed_at: new Date(),
        reviewed_by: req.adminUser?.id ?? null,
        review_notes: body.notes ?? null,
        updated_at: new Date(),
      })
      .returning(['id', 'reviewed_at', 'reviewed_by', 'review_notes']);
    if (!row) {
      res.status(404).json({ error: 'COI arrangement not found' });
      return;
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// ── POST /:id/unreview — clear the review ──────────────────────────
adminCoiArrangementsRouter.post('/:id/unreview', async (req, res, next) => {
  try {
    const [row] = await db('coi_arrangements')
      .where({ id: req.params.id })
      .update({
        reviewed_at: null,
        reviewed_by: null,
        review_notes: null,
        updated_at: new Date(),
      })
      .returning(['id']);
    if (!row) {
      res.status(404).json({ error: 'COI arrangement not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /:id — admin only ───────────────────────────────────────
adminCoiArrangementsRouter.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const deleted = await db('coi_arrangements').where({ id: req.params.id }).del();
    if (!deleted) {
      res.status(404).json({ error: 'COI arrangement not found' });
      return;
    }
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});
