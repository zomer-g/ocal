import { Router } from 'express';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { db } from '../../config/database.js';
import { validate } from '../../middleware/validate.js';
import { logger } from '../../utils/logger.js';

export const downloadRouter = Router();

// ── Column selection ──────────────────────────────────────────────────────────
const EXPORT_COLS = [
  'e.title',
  'e.event_date',
  'e.start_time',
  'e.end_time',
  'e.location',
  'e.participants',
  db.raw('"s"."name" as source_name'),
  'e.dataset_link',
];

const HEBREW_HEADERS = ['כותרת', 'תאריך', 'שעת התחלה', 'שעת סיום', 'מיקום', 'משתתפים', 'מקור', 'קישור לדאטסט'];

type EventRow = {
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  participants: string | null;
  source_name: string;
  dataset_link: string | null;
};

function timeStr(ts: string | null): string {
  if (!ts) return '';
  const s = String(ts);
  // ISO format: "2024-01-15T09:30:00.000Z" → "09:30"
  // Or PostgreSQL plain: "2024-01-15 09:30:00+00" → "09:30"
  const match = s.match(/[T ](\d{2}:\d{2})/);
  return match ? match[1] : '';
}

function formatRow(row: EventRow): unknown[] {
  return [
    row.title ?? '',
    row.event_date ?? '',
    timeStr(row.start_time),
    timeStr(row.end_time),
    row.location ?? '',
    row.participants ?? '',
    row.source_name ?? '',
    row.dataset_link ?? '',
  ];
}

function buildCsv(rows: EventRow[]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    HEBREW_HEADERS,
    ...rows.map(formatRow),
  ]);
  const csv = XLSX.utils.sheet_to_csv(ws);
  // Prepend UTF-8 BOM so Excel opens Hebrew text correctly without re-encoding
  return Buffer.concat([Buffer.from('﻿', 'utf8'), Buffer.from(csv, 'utf8')]);
}

function buildJson(rows: EventRow[]): Buffer {
  const payload = rows.map((r) => ({
    title:        r.title,
    event_date:   r.event_date,
    start_time:   r.start_time,
    end_time:     r.end_time,
    location:     r.location,
    participants: r.participants,
    source_name:  r.source_name,
    dataset_link: r.dataset_link,
  }));
  return Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
}

function safeName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '').trim().replace(/\s+/g, '_');
}

// ── Streaming CSV writer ──────────────────────────────────────────────────────
// Escapes one CSV field per RFC 4180. Wraps in quotes if it contains comma,
// quote, newline, or CR; doubles internal quotes.
function csvField(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvLine(values: unknown[]): string {
  return values.map(csvField).join(',') + '\r\n';
}

// ── Schema ────────────────────────────────────────────────────────────────────
const downloadSchema = z.object({
  format: z.enum(['json', 'csv']).default('csv'),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const sourceParamsSchema = z.object({
  sourceId: z.string().uuid(),
});

// Cap on how many source_ids a single bulk download can request — 612 sources
// in the corpus today; cap a bit higher to allow for growth without letting a
// caller pass arbitrarily large arrays.
const MAX_SOURCES_PER_BULK = 1000;

const bulkBodySchema = z.object({
  source_ids: z.array(z.string().uuid()).min(1).max(MAX_SOURCES_PER_BULK),
  format: z.enum(['json', 'csv']).default('csv'),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ── GET /api/public/download/source/:sourceId ─────────────────────────────────
downloadRouter.get('/source/:sourceId', validate(downloadSchema, 'query'), async (req, res, next) => {
  try {
    const { format } = req.query as z.infer<typeof downloadSchema>;

    const paramsResult = sourceParamsSchema.safeParse(req.params);
    if (!paramsResult.success) {
      res.status(400).json({ error: 'Invalid source ID' });
      return;
    }
    const { sourceId } = paramsResult.data;

    const source = await db('diary_sources')
      .where({ id: sourceId, is_enabled: true })
      .first();

    if (!source) {
      res.status(404).json({ error: 'Source not found' });
      return;
    }

    const { from_date, to_date } = req.query as z.infer<typeof downloadSchema>;

    let sourceQuery = db('diary_events as e')
      .join('diary_sources as s', 'e.source_id', 's.id')
      .select(EXPORT_COLS)
      .where('e.source_id', sourceId)
      .where('e.is_active', true)
      .where('s.is_enabled', true);

    if (from_date) sourceQuery = sourceQuery.where('e.event_date', '>=', from_date);
    if (to_date) sourceQuery = sourceQuery.where('e.event_date', '<=', to_date);

    const rows: EventRow[] = await sourceQuery.orderBy('e.start_time', 'asc');

    const filename = safeName(source.name);

    if (format === 'json') {
      const buf = buildJson(rows);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.json`);
      res.send(buf);
    } else {
      const buf = buildCsv(rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.csv`);
      res.send(buf);
    }
  } catch (err) {
    next(err);
  }
});

// ── POST /api/public/download/bulk ────────────────────────────────────────────
// Streamed download of events across a user-selected list of diary sources.
// Replaces the old GET /all which loaded the entire corpus (~325k rows) into
// memory and timed out. With knex stream() we hold one row at a time.
downloadRouter.post('/bulk', validate(bulkBodySchema, 'body'), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof bulkBodySchema>;
    const { format, source_ids, from_date, to_date } = body;

    // Filter to enabled sources only. If the caller passed any disabled or
    // unknown UUIDs they're silently dropped — better than 404 because the
    // rest of the selection should still work.
    const validSourceIds: string[] = (
      await db('diary_sources')
        .whereIn('id', source_ids)
        .where('is_enabled', true)
        .pluck('id')
    );
    if (validSourceIds.length === 0) {
      res.status(404).json({ error: 'None of the requested sources exist or are enabled' });
      return;
    }

    let query = db('diary_events as e')
      .join('diary_sources as s', 'e.source_id', 's.id')
      .select(EXPORT_COLS)
      .where('e.is_active', true)
      .where('s.is_enabled', true)
      .whereIn('e.source_id', validSourceIds);

    if (from_date) query = query.where('e.event_date', '>=', from_date);
    if (to_date) query = query.where('e.event_date', '<=', to_date);

    query = query.orderBy('s.name', 'asc').orderBy('e.start_time', 'asc');

    const filename = validSourceIds.length === 1
      ? 'ocal-diary'
      : `ocal-${validSourceIds.length}-diaries`;

    // Stream rows from Postgres — never buffer the full corpus in memory.
    const stream = query.stream({ highWaterMark: 1000 });

    // Cancel the DB query if the client aborts the download.
    req.on('close', () => {
      // knex stream destroy is idempotent; safe to call even on success
      try {
        stream.destroy();
      } catch {
        /* ignore */
      }
    });

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
      res.write('[\n');
      let isFirst = true;
      stream.on('data', (row: EventRow) => {
        const json = JSON.stringify({
          title:        row.title,
          event_date:   row.event_date,
          start_time:   row.start_time,
          end_time:     row.end_time,
          location:     row.location,
          participants: row.participants,
          source_name:  row.source_name,
          dataset_link: row.dataset_link,
        });
        const ok = res.write(isFirst ? json : `,\n${json}`);
        isFirst = false;
        // Backpressure: if the client buffer is full, pause the DB stream
        if (!ok) stream.pause();
      });
      res.on('drain', () => stream.resume());
      stream.on('end', () => {
        res.write('\n]\n');
        res.end();
      });
      stream.on('error', (err: Error) => {
        logger.error({ err }, 'Bulk JSON download stream error');
        // We can't change status once headers are flushed; just end the
        // response so the client doesn't hang.
        res.end();
      });
    } else {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      // UTF-8 BOM so Excel opens Hebrew correctly
      res.write('﻿');
      res.write(csvLine(HEBREW_HEADERS));
      stream.on('data', (row: EventRow) => {
        const ok = res.write(csvLine(formatRow(row)));
        if (!ok) stream.pause();
      });
      res.on('drain', () => stream.resume());
      stream.on('end', () => {
        res.end();
      });
      stream.on('error', (err: Error) => {
        logger.error({ err }, 'Bulk CSV download stream error');
        res.end();
      });
    }
  } catch (err) {
    next(err);
  }
});
