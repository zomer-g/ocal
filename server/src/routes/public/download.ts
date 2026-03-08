import { Router } from 'express';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { db } from '../../config/database.js';
import { validate } from '../../middleware/validate.js';

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
  return Buffer.concat([Buffer.from('\uFEFF', 'utf8'), Buffer.from(csv, 'utf8')]);
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

// ── Schema ────────────────────────────────────────────────────────────────────
const downloadSchema = z.object({
  format: z.enum(['json', 'csv']).default('csv'),
});

const sourceParamsSchema = z.object({
  sourceId: z.string().uuid(),
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

    const rows: EventRow[] = await db('diary_events as e')
      .join('diary_sources as s', 'e.source_id', 's.id')
      .select(EXPORT_COLS)
      .where('e.source_id', sourceId)
      .where('e.is_active', true)
      .where('s.is_enabled', true)
      .orderBy('e.start_time', 'asc');

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

// ── GET /api/public/download/all ──────────────────────────────────────────────
downloadRouter.get('/all', validate(downloadSchema, 'query'), async (req, res, next) => {
  try {
    const { format } = req.query as z.infer<typeof downloadSchema>;

    const rows: EventRow[] = await db('diary_events as e')
      .join('diary_sources as s', 'e.source_id', 's.id')
      .select(EXPORT_COLS)
      .where('e.is_active', true)
      .where('s.is_enabled', true)
      .orderBy('s.name', 'asc')
      .orderBy('e.start_time', 'asc');

    if (format === 'json') {
      const buf = buildJson(rows);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="all-diaries.json"');
      res.send(buf);
    } else {
      const buf = buildCsv(rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="all-diaries.csv"');
      res.send(buf);
    }
  } catch (err) {
    next(err);
  }
});
