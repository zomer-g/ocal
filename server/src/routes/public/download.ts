import { Router } from 'express';
import { z } from 'zod';
import archiver from 'archiver';
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

/**
 * Disambiguate filenames inside the ZIP. Two diaries can share a name (e.g.
 * "—" stripped from both); without this the second entry would overwrite the
 * first.
 */
function uniqueZipName(used: Set<string>, base: string, ext: string): string {
  const sanitized = safeName(base) || 'diary';
  let candidate = `${sanitized}.${ext}`;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${sanitized}_${n}.${ext}`;
    n++;
  }
  used.add(candidate);
  return candidate;
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

// Cap on how many sources fit into one bulk request. 612 sources today; cap a
// bit higher for growth but bounded so a caller can't spam arbitrarily.
const MAX_SOURCES_PER_BULK = 1000;

const bulkBodySchema = z.object({
  source_ids: z.array(z.string().uuid()).min(1).max(MAX_SOURCES_PER_BULK),
  format: z.enum(['json', 'csv']).default('csv'),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ── GET /api/public/download/source/:sourceId ─────────────────────────────────
// Single-diary download. Returns the raw CSV/JSON file directly (no ZIP).
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
    const rows = await fetchRowsForSource(sourceId, from_date, to_date);
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
// Streams a ZIP containing one CSV/JSON file per selected diary. We use the
// per-source query (the proven path) once per source, packing each result as
// a separate entry. Archiver pipes to the response without buffering the
// full archive in memory.
downloadRouter.post('/bulk', validate(bulkBodySchema, 'body'), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof bulkBodySchema>;
    const { format, source_ids, from_date, to_date } = body;

    // Validate + resolve names. Disabled or unknown ids are dropped silently;
    // we only fail if NOTHING is valid.
    const validSources = await db('diary_sources')
      .whereIn('id', source_ids)
      .where('is_enabled', true)
      .select('id', 'name');

    if (validSources.length === 0) {
      res.status(404).json({ error: 'None of the requested sources exist or are enabled' });
      return;
    }

    const zipFilename = validSources.length === 1
      ? `${safeName(validSources[0].name)}.zip`
      : `ocal-${validSources.length}-diaries.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(zipFilename)}`);
    // Hint to reverse proxies (nginx-style) NOT to buffer the stream
    res.setHeader('X-Accel-Buffering', 'no');

    const archive = archiver('zip', { zlib: { level: 6 } });

    archive.on('warning', (err) => {
      logger.warn({ err }, 'Bulk ZIP: archiver warning');
    });
    archive.on('error', (err) => {
      logger.error({ err }, 'Bulk ZIP: archiver error');
      // If headers are already sent we can't change status; just end.
      try {
        res.end();
      } catch { /* ignore */ }
    });

    // If the client disconnects mid-download, abort the archive cleanly.
    let aborted = false;
    req.on('close', () => {
      aborted = true;
      try {
        archive.abort();
      } catch { /* ignore */ }
    });

    archive.pipe(res);

    const usedNames = new Set<string>();
    const ext = format === 'json' ? 'json' : 'csv';

    for (const source of validSources) {
      if (aborted) break;
      try {
        const rows = await fetchRowsForSource(source.id, from_date, to_date);
        const entryName = uniqueZipName(usedNames, source.name, ext);
        const buf = format === 'json' ? buildJson(rows) : buildCsv(rows);
        archive.append(buf, { name: entryName });
      } catch (err) {
        logger.error({ err, sourceId: source.id, sourceName: source.name }, 'Bulk ZIP: failed to build entry');
        // Skip this entry but continue with the rest — partial download is
        // better than total failure.
      }
    }

    if (!aborted) {
      await archive.finalize();
    }
  } catch (err) {
    next(err);
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────────
async function fetchRowsForSource(
  sourceId: string,
  fromDate: string | undefined,
  toDate: string | undefined,
): Promise<EventRow[]> {
  let q = db('diary_events as e')
    .join('diary_sources as s', 'e.source_id', 's.id')
    .select(EXPORT_COLS)
    .where('e.source_id', sourceId)
    .where('e.is_active', true)
    .where('s.is_enabled', true);
  if (fromDate) q = q.where('e.event_date', '>=', fromDate);
  if (toDate) q = q.where('e.event_date', '<=', toDate);
  return q.orderBy('e.start_time', 'asc');
}
