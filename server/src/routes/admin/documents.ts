/**
 * Unified read-only listing of every "document" in the system —
 * manual PDF diaries, expense imports, CKAN diary sources, COI
 * arrangements — with filter chips for kind / origin / reviewed.
 *
 * Implementation: UNION ALL across the four tables, cast to a common
 * shape, then filter + paginate via an outer CTE.
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/database.js';
import { validate } from '../../middleware/validate.js';
import { parsePagination, buildPaginationMeta } from '../../utils/pagination.js';

export const adminDocumentsRouter = Router();

export type DocumentKind =
  | 'manual_diary_upload'
  | 'mk_expense_import'
  | 'diary_source';

export type DocumentOrigin = 'ckan' | 'manual_upload' | null;

const listSchema = z.object({
  kind: z.enum([
    'manual_diary_upload', 'mk_expense_import', 'diary_source',
  ]).optional(),
  origin: z.enum(['ckan', 'manual_upload']).optional(),
  reviewed: z.enum(['true', 'false']).optional(),
  q: z.string().optional(),
  page: z.coerce.number().optional(),
  per_page: z.coerce.number().optional(),
});

adminDocumentsRouter.get('/', validate(listSchema, 'query'), async (req, res, next) => {
  try {
    const q = req.query as z.infer<typeof listSchema>;
    const { page, per_page, offset } = parsePagination(q);

    // Use bindings for everything user-controllable. The UNION query has
    // a few static columns ("kind", "origin") that don't need binding.
    //
    // Note: `manual_diary_uploads.filename` and `mk_expense_imports.filename`
    // can hold non-ASCII Hebrew; that's fine — the UNION rows are returned
    // as text and JSON-encoded.
    const params: (string | number)[] = [];
    const conditions: string[] = [];

    if (q.kind) {
      params.push(q.kind);
      conditions.push(`d.kind = $${params.length}`);
    }
    if (q.origin) {
      params.push(q.origin);
      conditions.push(`d.origin = $${params.length}`);
    }
    if (q.reviewed === 'true') conditions.push('d.reviewed_at IS NOT NULL');
    if (q.reviewed === 'false') conditions.push('d.reviewed_at IS NULL');
    if (q.q) {
      params.push(`%${q.q}%`);
      conditions.push(`d.title ILIKE $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const baseSql = `
      WITH d AS (
        SELECT
          'manual_diary_upload'::text AS kind,
          'manual_upload'::text       AS origin,
          id, filename AS title, file_size,
          reviewed_at, reviewed_by, created_at
        FROM manual_diary_uploads
        UNION ALL
        SELECT
          'mk_expense_import'::text   AS kind,
          'manual_upload'::text       AS origin,
          id, filename AS title, NULL::integer AS file_size,
          reviewed_at, reviewed_by, created_at
        FROM mk_expense_imports
        UNION ALL
        SELECT
          'diary_source'::text        AS kind,
          CASE WHEN resource_id IS NOT NULL THEN 'ckan' ELSE 'manual_upload' END AS origin,
          id, name AS title, NULL::integer AS file_size,
          reviewed_at, reviewed_by, created_at
        FROM diary_sources
      )
      SELECT d.* FROM d
      ${where}
    `;

    // Total
    const totalRow = await db.raw(`SELECT COUNT(*)::int AS total FROM (${baseSql}) t`, params);
    const total = Number(totalRow.rows?.[0]?.total ?? 0);

    // Page
    params.push(per_page, offset);
    const rowsResult = await db.raw(
      `${baseSql} ORDER BY d.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({
      data: rowsResult.rows,
      pagination: buildPaginationMeta(page, per_page, total),
    });
  } catch (err) {
    next(err);
  }
});
