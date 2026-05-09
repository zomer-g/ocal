/**
 * Retroactive fix for "ghost-year" diary events created before the LLM
 * extraction prompt was hardened against year hallucination
 * (server/src/services/llm/prompt.ts §7–10 + filename hint).
 *
 * Symptom we're cleaning up: events imported from a manual PDF upload show
 * up under the wrong year (e.g. 2026) because the per-page extraction lost
 * the cover-sheet year and the LLM filled it in with "today's year".
 *
 * The script is read-only by default (`--dry-run`). Every mutation must be
 * opted into with `--apply`. It deliberately favors *deactivating* over
 * *deleting* events so an audit trail stays around — flip is_active=false
 * rather than DELETE so re-running is reversible.
 *
 * Subcommands:
 *   list-sources [--like <substring>]
 *       Find diary_sources by name (substring, case-insensitive).
 *
 *   inspect <source-id>
 *       Show event-year breakdown + linked manual upload + filename.
 *
 *   re-extract <source-id> [--apply] [--provider claude|gpt4o]
 *       Re-run the LLM with the updated prompt (filename-aware) on the
 *       upload's stored PDF, deactivate the source's existing events, and
 *       insert the freshly-extracted ones. Requires API keys + the PDF
 *       still being attached to a manual_diary_uploads row.
 *
 *   shift-year <source-id> --from YYYY --to YYYY [--apply]
 *       Deterministic year remap: shift every event of `--from` year in
 *       this source to the target year (preserving month/day/time).
 *
 *   deactivate-year <source-id> --year YYYY [--apply]
 *       Soft-delete (is_active=false) every event of the given year in
 *       this source. Use when you want them out of public view but kept
 *       for review.
 *
 *   reimport-xlsx <source-id> --file <path> [--apply]
 *       Re-parse an Outlook-style .xlsx export with the *fixed* dateParser
 *       and replace the source's events. The original cause of "ghost
 *       2026" entries: the diary was exported from Outlook on a US-locale
 *       machine in M/D/YYYY format, and the importer naively read it as
 *       Israeli DD/MM/YYYY — JS Date silently wraps month 16 into the
 *       next year.
 *
 * Usage:
 *   npm run fix-years --workspace=server -- <subcommand> [args]
 */

import knex, { type Knex } from 'knex';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import { env } from '../config/env.js';
import { extractDiaryFromPdf, type LLMProvider } from '../services/llm/index.js';
import { parseDateTime } from '../services/dateParser.js';
import { syncSource } from '../services/sync.js';

// ──────────────────────────────────────────────
// Tiny CLI parser — keeps the script self-contained (no commander dep).
// ──────────────────────────────────────────────

interface ParsedArgs {
  subcommand: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const subcommand = argv[0] ?? '';
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 1; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(tok);
    }
  }
  return { subcommand, positional, flags };
}

function isApply(flags: Record<string, string | boolean>): boolean {
  return flags.apply === true || flags.apply === 'true';
}

// ──────────────────────────────────────────────
// DB connection — separate pool with relaxed timeouts so batch updates
// don't trip statement_timeout the app sets at 30s.
// ──────────────────────────────────────────────

function needsSsl(databaseUrl: string): boolean {
  // Render (and most managed Postgres) require TLS. Local Postgres
  // typically doesn't even offer it, and forcing SSL there would cause a
  // handshake error. Default rule: anything not localhost/127.0.0.1 → SSL.
  try {
    const u = new URL(databaseUrl);
    const h = u.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return false;
    return true;
  } catch {
    return false;
  }
}

function makeDb(): Knex {
  const ssl = needsSsl(env.DATABASE_URL)
    ? { rejectUnauthorized: false } // Render's cert isn't in Node's default CA bundle; same posture as their docs
    : false;
  return knex({
    client: 'pg',
    connection: { connectionString: env.DATABASE_URL, ssl },
    pool: {
      min: 1,
      max: 1,
      afterCreate(
        conn: { query: (sql: string, cb: (err: Error | null) => void) => void },
        done: (err: Error | null, conn: unknown) => void,
      ) {
        conn.query('SET statement_timeout = 0', (err) => {
          if (err) return done(err, conn);
          conn.query('SET lock_timeout = 0', (err2) => done(err2, conn));
        });
      },
    },
  });
}

// ──────────────────────────────────────────────
// Subcommand: list-sources
// ──────────────────────────────────────────────

async function cmdListSources(db: Knex, flags: Record<string, string | boolean>): Promise<void> {
  const like = typeof flags.like === 'string' ? flags.like : '';
  const q = db('diary_sources')
    .select('id', 'name', 'first_event_date', 'last_event_date', 'total_events')
    .orderBy('name');
  if (like) q.whereRaw('name ILIKE ?', [`%${like}%`]);
  const rows = await q;
  if (rows.length === 0) {
    console.log('(no sources match)');
    return;
  }
  console.log(`Found ${rows.length} source(s):`);
  for (const r of rows) {
    const range = r.first_event_date && r.last_event_date
      ? `${String(r.first_event_date).slice(0, 10)} → ${String(r.last_event_date).slice(0, 10)}`
      : '(no events)';
    console.log(`  ${r.id}  [${range}]  total=${r.total_events ?? 0}  ${r.name}`);
  }
}

// ──────────────────────────────────────────────
// Subcommand: inspect
// ──────────────────────────────────────────────

interface YearBucket {
  year: number;
  total: number;
  active: number;
}

async function fetchYearBuckets(db: Knex, sourceId: string): Promise<YearBucket[]> {
  // Hand-rolled raw query — knex's chained .count()/.sum() builders mangle
  // CASE expressions into invalid SQL ("sum(... as active)").
  const result = await db.raw<{ rows: { year: number; total: string; active: string }[] }>(
    `SELECT
       EXTRACT(YEAR FROM start_time AT TIME ZONE 'Asia/Jerusalem')::int AS year,
       COUNT(*)::text AS total,
       SUM(CASE WHEN is_active THEN 1 ELSE 0 END)::text AS active
     FROM diary_events
     WHERE source_id = ?
     GROUP BY year
     ORDER BY year`,
    [sourceId],
  );
  return result.rows.map((r) => ({
    year: Number(r.year),
    total: Number(r.total),
    active: Number(r.active),
  }));
}

async function findUploadForSource(db: Knex, sourceId: string) {
  return db('manual_diary_uploads')
    .select('id', 'filename', 'extraction_provider', 'committed_at', 'created_at')
    .where({ source_id: sourceId })
    .orderBy('created_at', 'desc')
    .first();
}

async function cmdInspect(db: Knex, sourceId: string): Promise<void> {
  if (!sourceId) throw new Error('inspect requires a <source-id>');
  const source = await db('diary_sources').where({ id: sourceId }).first();
  if (!source) throw new Error(`source ${sourceId} not found`);

  console.log(`Source: ${source.name}  [${source.id}]`);
  console.log(`  total_events=${source.total_events ?? 0}  range=${source.first_event_date ?? '?'} → ${source.last_event_date ?? '?'}`);

  const upload = await findUploadForSource(db, sourceId);
  if (upload) {
    console.log(`  manual_upload: ${upload.id}`);
    console.log(`    filename=${upload.filename}`);
    console.log(`    provider=${upload.extraction_provider ?? '(none)'}  committed_at=${upload.committed_at ?? '(never)'}`);
    const yearTokens = extractYearTokens(upload.filename);
    console.log(`    detected year tokens in filename: ${yearTokens.length ? yearTokens.join(', ') : '(none)'}`);
  } else {
    console.log(`  manual_upload: (none — source not from manual PDF, or upload row deleted)`);
  }

  const buckets = await fetchYearBuckets(db, sourceId);
  console.log(`  events by year (active / total):`);
  for (const b of buckets) {
    console.log(`    ${b.year}: ${b.active} / ${b.total}`);
  }
}

/**
 * Pull plausible year tokens out of a filename. Recognises 4-digit years
 * (1990–2099) and Hebrew "ה'תשפ"X" patterns (limited; many filenames just
 * use Gregorian). Returns sorted unique numbers.
 */
function extractYearTokens(filename: string): number[] {
  const found = new Set<number>();
  for (const m of filename.matchAll(/\b(19[9]\d|20\d{2})\b/g)) {
    found.add(Number(m[1]));
  }
  return [...found].sort();
}

// ──────────────────────────────────────────────
// Subcommand: find-xls-sources — list CKAN-backed sources whose original
// file is XLS/XLSX. These are the candidates for the M/D/YYYY year-shift
// bug because XLS/XLSX route through SheetJS + dateParser, while CSVs go
// through the CKAN datastore API which returns native datetime columns.
// Output is a checklist for manual review / batch resync.
// ──────────────────────────────────────────────

async function cmdFindXlsSources(db: Knex, _flags: Record<string, string | boolean>): Promise<void> {
  // Heuristic: resource_url ends in .xls / .xlsx, OR ckan_metadata.resourceName
  // does. Both are usually populated for CKAN-backed sources.
  const result = await db.raw<{
    rows: Array<{
      id: string;
      name: string;
      resource_url: string | null;
      resource_name: string | null;
      total_events: number;
      last_sync_at: string | null;
    }>;
  }>(
    `SELECT
       id,
       name,
       resource_url,
       (ckan_metadata->>'resourceName') AS resource_name,
       total_events,
       last_sync_at
     FROM diary_sources
     WHERE resource_id IS NOT NULL
       AND (
         resource_url ~* '\\.xlsx?($|\\?)'
         OR (ckan_metadata->>'resourceName') ~* '\\.xlsx?$'
       )
     ORDER BY last_sync_at DESC NULLS LAST`,
  );
  if (result.rows.length === 0) {
    console.log('No CKAN-backed XLS/XLSX sources found.');
    return;
  }
  console.log(`Found ${result.rows.length} CKAN-backed XLS/XLSX source(s) — candidates for M/D/YYYY review:`);
  for (const r of result.rows) {
    const last = r.last_sync_at ? String(r.last_sync_at).slice(0, 10) : '(never)';
    console.log(`  ${r.id}  events=${r.total_events}  last_sync=${last}  ${r.name}`);
  }
  console.log('');
  console.log('Next: pick one with `inspect <id>` to see year breakdown, then `resync <id> --apply`.');
  console.log('The dateParser fix in this branch will produce correct M/D/YYYY parsing on resync.');
}

// ──────────────────────────────────────────────
// Subcommand: find-suspect — locate sources likely affected by the same
// M/D/YYYY date-parser bug. Signal: events dated in years far in the
// future (default ≥ 2027). Israeli FOI calendars are overwhelmingly
// retrospective; far-future events are almost certainly month-overflow
// wraps from the buggy DD/MM regex.
// ──────────────────────────────────────────────

async function cmdFindSuspect(db: Knex, flags: Record<string, string | boolean>): Promise<void> {
  const minYear = Number(flags['min-year'] ?? 2027);
  if (!Number.isFinite(minYear)) throw new Error('--min-year must be a number');
  const result = await db.raw<{
    rows: Array<{ id: string; name: string; suspect_count: string; total_events: string; min_year: number; max_year: number }>;
  }>(
    `SELECT
       s.id, s.name,
       COUNT(*) FILTER (
         WHERE EXTRACT(YEAR FROM e.start_time AT TIME ZONE 'Asia/Jerusalem') >= ?
         AND e.is_active
       )::text AS suspect_count,
       COUNT(*) FILTER (WHERE e.is_active)::text AS total_events,
       MIN(EXTRACT(YEAR FROM e.start_time AT TIME ZONE 'Asia/Jerusalem'))::int AS min_year,
       MAX(EXTRACT(YEAR FROM e.start_time AT TIME ZONE 'Asia/Jerusalem'))::int AS max_year
     FROM diary_sources s
     LEFT JOIN diary_events e ON e.source_id = s.id
     GROUP BY s.id, s.name
     HAVING COUNT(*) FILTER (
       WHERE EXTRACT(YEAR FROM e.start_time AT TIME ZONE 'Asia/Jerusalem') >= ?
       AND e.is_active
     ) > 0
     ORDER BY suspect_count DESC`,
    [minYear, minYear],
  );
  if (result.rows.length === 0) {
    console.log(`No sources have any active events in ${minYear} or later. Clean.`);
    return;
  }
  console.log(`Sources with active events in ${minYear} or later (${result.rows.length} total):`);
  for (const r of result.rows) {
    console.log(
      `  ${r.id}  suspect=${r.suspect_count}/${r.total_events}  range=${r.min_year}–${r.max_year}  ${r.name}`,
    );
  }
}

// ──────────────────────────────────────────────
// Subcommand: sample-year — quick visual check of N events in a given year
// ──────────────────────────────────────────────

async function cmdSampleYear(
  db: Knex,
  sourceId: string,
  flags: Record<string, string | boolean>,
): Promise<void> {
  if (!sourceId) throw new Error('sample-year requires a <source-id>');
  const year = Number(flags.year);
  if (!Number.isFinite(year)) throw new Error('sample-year requires --year <YYYY>');
  const limit = Number(flags.limit ?? 12);

  const result = await db.raw<{ rows: Array<{ start_time: string; title: string; location: string | null; participants: string | null }> }>(
    `SELECT
       to_char(start_time AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD HH24:MI') AS start_time,
       title, location, participants
     FROM diary_events
     WHERE source_id = ?
       AND EXTRACT(YEAR FROM start_time AT TIME ZONE 'Asia/Jerusalem') = ?
     ORDER BY start_time
     LIMIT ?`,
    [sourceId, year, limit],
  );
  console.log(`First ${result.rows.length} event(s) in ${year}:`);
  for (const r of result.rows) {
    const loc = r.location ? `  @${r.location}` : '';
    const p = r.participants ? `  [${r.participants.slice(0, 60)}${r.participants.length > 60 ? '…' : ''}]` : '';
    console.log(`  ${r.start_time}  ${r.title}${loc}${p}`);
  }
}

// ──────────────────────────────────────────────
// Subcommand: re-extract
// ──────────────────────────────────────────────

async function cmdReExtract(
  db: Knex,
  sourceId: string,
  flags: Record<string, string | boolean>,
): Promise<void> {
  if (!sourceId) throw new Error('re-extract requires a <source-id>');
  const provider = (typeof flags.provider === 'string' ? flags.provider : 'claude') as LLMProvider;
  if (provider !== 'claude' && provider !== 'gpt4o') {
    throw new Error(`unknown provider: ${provider} (expected claude or gpt4o)`);
  }

  const source = await db('diary_sources').where({ id: sourceId }).first();
  if (!source) throw new Error(`source ${sourceId} not found`);

  const upload = await db('manual_diary_uploads')
    .select('id', 'filename', 'file_data')
    .where({ source_id: sourceId })
    .orderBy('created_at', 'desc')
    .first();
  if (!upload) {
    throw new Error(`source ${sourceId} has no manual_diary_uploads row — cannot re-extract`);
  }
  if (!upload.file_data) {
    throw new Error(`upload ${upload.id} is missing file_data — cannot re-extract`);
  }

  console.log(`Re-extracting ${source.name} (upload=${upload.id}, file=${upload.filename}) via ${provider}…`);
  const result = await extractDiaryFromPdf(upload.file_data, provider, { filename: upload.filename });
  console.log(`  LLM returned ${result.events.length} events (tokens=${result.tokens_used ?? '?'})`);

  // Sanity-check year alignment vs filename tokens
  const filenameYears = extractYearTokens(upload.filename);
  const eventYears = new Set<number>();
  let undatedCount = 0;
  for (const e of result.events) {
    if (!e.start_time) {
      undatedCount++;
      continue;
    }
    const year = Number(e.start_time.slice(0, 4));
    if (Number.isFinite(year)) eventYears.add(year);
  }
  console.log(`  filename year tokens: ${filenameYears.length ? filenameYears.join(', ') : '(none)'}`);
  console.log(`  extracted event years: ${[...eventYears].sort().join(', ') || '(none)'}`);
  console.log(`  events without start_time (year-unknown): ${undatedCount}`);

  if (!isApply(flags)) {
    console.log('  (dry-run — pass --apply to deactivate the old events and insert these)');
    return;
  }

  // Apply: in a transaction, deactivate existing events and insert new ones.
  await db.transaction(async (trx) => {
    const deactivated = await trx('diary_events')
      .where({ source_id: sourceId, is_active: true })
      .update({ is_active: false });
    console.log(`  deactivated ${deactivated} existing events`);

    if (result.events.length === 0) {
      console.log('  no new events to insert (LLM returned empty list)');
    } else {
      const rows = result.events
        .filter((e) => !!e.start_time && !!e.title)
        .map((e) => ({
          source_id: sourceId,
          title: e.title,
          start_time: trx.raw(`?::timestamp AT TIME ZONE 'Asia/Jerusalem'`, [e.start_time]),
          end_time: e.end_time ? trx.raw(`?::timestamp AT TIME ZONE 'Asia/Jerusalem'`, [e.end_time]) : null,
          location: e.location ?? null,
          participants: e.participants ?? null,
          dataset_name: source.name,
          is_active: true,
          ckan_row_id: null,
          other_fields: JSON.stringify({
            source_upload_id: upload.id,
            source_page: e.source_page ?? null,
            extraction_provider: provider,
            notes: e.notes ?? null,
            re_extracted_at: new Date().toISOString(),
          }),
        }));
      if (rows.length > 0) await trx('diary_events').insert(rows);
      console.log(`  inserted ${rows.length} freshly-extracted events`);
      const skipped = result.events.length - rows.length;
      if (skipped > 0) {
        console.log(`  skipped ${skipped} events from the LLM response (missing title or start_time)`);
      }
    }

    // Refresh source aggregates over the *active* set.
    const range = await trx('diary_events')
      .where({ source_id: sourceId, is_active: true })
      .min('event_date as first_event_date')
      .max('event_date as last_event_date')
      .count('* as total_events')
      .first();
    await trx('diary_sources').where({ id: sourceId }).update({
      first_event_date: range?.first_event_date ?? null,
      last_event_date: range?.last_event_date ?? null,
      total_events: Number(range?.total_events ?? 0),
      last_sync_at: trx.fn.now(),
    });
  });
  console.log('  done.');
}

// ──────────────────────────────────────────────
// Subcommand: shift-year
// ──────────────────────────────────────────────

async function cmdShiftYear(
  db: Knex,
  sourceId: string,
  flags: Record<string, string | boolean>,
): Promise<void> {
  if (!sourceId) throw new Error('shift-year requires a <source-id>');
  const fromYear = Number(flags.from);
  const toYear = Number(flags.to);
  if (!Number.isFinite(fromYear) || !Number.isFinite(toYear)) {
    throw new Error('shift-year requires --from <YYYY> and --to <YYYY>');
  }
  const yearDelta = toYear - fromYear;
  if (yearDelta === 0) {
    console.log('  --from equals --to; nothing to do');
    return;
  }

  // Preview affected rows
  const affected = await db('diary_events')
    .where({ source_id: sourceId })
    .whereRaw(`EXTRACT(YEAR FROM start_time AT TIME ZONE 'Asia/Jerusalem') = ?`, [fromYear])
    .count<{ count: string }[]>('* as count')
    .first();
  const count = Number(affected?.count ?? 0);
  console.log(`  ${count} event(s) in source ${sourceId} dated ${fromYear} would shift by ${yearDelta} year(s) → ${toYear}`);

  if (!isApply(flags)) {
    console.log('  (dry-run — pass --apply to perform the shift)');
    return;
  }
  if (count === 0) {
    console.log('  nothing to shift; exiting');
    return;
  }

  // Use Postgres interval arithmetic to keep the time-of-day intact through DST.
  const intervalSql = `(${yearDelta} || ' year')::interval`;
  await db.transaction(async (trx) => {
    const updated = await trx('diary_events')
      .where({ source_id: sourceId })
      .whereRaw(`EXTRACT(YEAR FROM start_time AT TIME ZONE 'Asia/Jerusalem') = ?`, [fromYear])
      .update({
        start_time: trx.raw(`start_time + ${intervalSql}`),
        end_time: trx.raw(`CASE WHEN end_time IS NOT NULL THEN end_time + ${intervalSql} ELSE NULL END`),
      });
    console.log(`  shifted ${updated} events`);

    // Refresh aggregates
    const range = await trx('diary_events')
      .where({ source_id: sourceId, is_active: true })
      .min('event_date as first_event_date')
      .max('event_date as last_event_date')
      .count('* as total_events')
      .first();
    await trx('diary_sources').where({ id: sourceId }).update({
      first_event_date: range?.first_event_date ?? null,
      last_event_date: range?.last_event_date ?? null,
      total_events: Number(range?.total_events ?? 0),
      last_sync_at: trx.fn.now(),
    });
  });
  console.log('  done.');
}

// ──────────────────────────────────────────────
// Subcommand: list-pdf-uploads — committed manual_diary_uploads, candidates
// for re-extract with the year-strict prompt (server/src/services/llm/prompt.ts
// §7-10 and the filename hint added with it).
// ──────────────────────────────────────────────

async function cmdListPdfUploads(db: Knex, _flags: Record<string, string | boolean>): Promise<void> {
  const result = await db.raw<{
    rows: Array<{
      id: string;
      filename: string;
      source_id: string | null;
      source_name: string | null;
      committed_at: string;
      extraction_provider: string | null;
    }>;
  }>(
    `SELECT
       u.id, u.filename, u.source_id, s.name AS source_name,
       u.committed_at, u.extraction_provider
     FROM manual_diary_uploads u
     LEFT JOIN diary_sources s ON s.id = u.source_id
     WHERE u.committed_at IS NOT NULL
     ORDER BY u.committed_at DESC`,
  );
  if (result.rows.length === 0) {
    console.log('No committed PDF uploads.');
    return;
  }
  console.log(`Found ${result.rows.length} committed PDF upload(s):`);
  for (const r of result.rows) {
    const date = r.committed_at ? String(r.committed_at).slice(0, 10) : '?';
    console.log(`  upload=${r.id}  source=${r.source_id ?? '(none)'}  committed=${date}  provider=${r.extraction_provider ?? '?'}  ${r.filename}`);
  }
  console.log('');
  console.log('Per upload: `re-extract <source_id> --apply` re-runs the LLM with the year-strict prompt');
  console.log('and replaces the source events. The PDF stays attached, no re-upload needed.');
}

// ──────────────────────────────────────────────
// Subcommand: resync — re-pull from CKAN with the *fixed* dateParser
// (server/src/services/dateParser.ts).
//
// CKAN-backed sources keep their authoritative file on odata.org.il.
// syncSource(isResync=true) deletes the source's events, fetches the
// resource fresh, and reinserts via the now-correct parser. Manual
// (PDF-uploaded or xlsx-only) sources have no resource_id and must use
// reimport-xlsx instead.
// ──────────────────────────────────────────────

async function cmdResync(
  db: Knex,
  sourceId: string,
  flags: Record<string, string | boolean>,
): Promise<void> {
  if (!sourceId) throw new Error('resync requires a <source-id>');
  const source = await db('diary_sources').where({ id: sourceId }).first();
  if (!source) throw new Error(`source ${sourceId} not found`);
  if (!source.resource_id) {
    throw new Error(
      `source ${sourceId} has no resource_id (not CKAN-backed). Use reimport-xlsx with a local file instead.`,
    );
  }
  if (!source.field_mapping) {
    throw new Error(`source ${sourceId} has no field_mapping — cannot resync`);
  }

  console.log(`Will resync from CKAN:`);
  console.log(`  source: ${source.name}`);
  console.log(`  resource_id: ${source.resource_id}`);
  console.log(`  current total_events: ${source.total_events}`);

  const buckets = await fetchYearBuckets(db, sourceId);
  console.log(`  current year breakdown (active / total):`);
  for (const b of buckets) console.log(`    ${b.year}: ${b.active} / ${b.total}`);

  if (!isApply(flags)) {
    console.log(`  (dry-run — pass --apply to delete current events and re-fetch from CKAN with the fixed dateParser)`);
    return;
  }

  // syncSource handles the full lifecycle: status flag, hard-delete on
  // isResync, fetch, transform, batch insert, aggregate refresh.
  const result = await syncSource({
    sourceId,
    resourceId: source.resource_id,
    fieldMapping: source.field_mapping,
    datasetName: source.name,
    datasetLink: source.dataset_url ?? undefined,
    isResync: true,
    onProgress: (fetched, total) => {
      if (total > 0 && fetched % 200 === 0) {
        console.log(`    progress: ${fetched}/${total}`);
      }
    },
  });
  console.log(
    `  done. fetched=${result.recordsFetched} created=${result.recordsCreated} skipped=${result.recordsSkipped} errors=${result.errors.length}`,
  );

  const after = await fetchYearBuckets(db, sourceId);
  console.log(`  new year breakdown:`);
  for (const b of after) console.log(`    ${b.year}: ${b.active} / ${b.total}`);
}

// ──────────────────────────────────────────────
// Subcommand: reimport-xlsx — re-parse an Outlook export with the fixed
// dateParser and replace this source's events.
// ──────────────────────────────────────────────

interface OutlookRow {
  Subject?: string;
  'Start Date'?: unknown;
  'Start Time'?: unknown;
  'End Date'?: unknown;
  'End Time'?: unknown;
  Location?: string;
  'Required Attendees'?: string;
  'Optional Attendees'?: string;
  'Meeting Organizer'?: string;
  Description?: string;
  Categories?: string;
  'All day event'?: string | boolean;
}

function joinParticipants(r: OutlookRow): string | null {
  const bits = [r['Meeting Organizer'], r['Required Attendees'], r['Optional Attendees']]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);
  if (bits.length === 0) return null;
  return [...new Set(bits.join(';').split(/[;,]/).map((s) => s.trim()).filter(Boolean))].join(', ');
}

async function cmdReimportXlsx(
  db: Knex,
  sourceId: string,
  flags: Record<string, string | boolean>,
): Promise<void> {
  if (!sourceId) throw new Error('reimport-xlsx requires a <source-id>');
  const file = typeof flags.file === 'string' ? flags.file : '';
  if (!file) throw new Error('reimport-xlsx requires --file <path-to-xlsx>');
  const absFile = resolve(file);

  const source = await db('diary_sources').where({ id: sourceId }).first();
  if (!source) throw new Error(`source ${sourceId} not found`);
  console.log(`Reading ${absFile} for source ${source.name}…`);

  const buf = readFileSync(absFile);
  // codepage 65001 keeps Hebrew column headers intact across machines.
  const wb = XLSX.read(buf, { type: 'buffer', codepage: 65001, cellDates: true });
  const firstSheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<OutlookRow>(sheet, { defval: '' });
  console.log(`  rows in sheet: ${rows.length}`);

  // Transform with the *fixed* dateParser
  const parsed: Array<{
    title: string;
    start_time: Date;
    end_time: Date | null;
    location: string | null;
    participants: string | null;
    other: Record<string, unknown>;
  }> = [];
  let rejectedNoTitle = 0;
  let rejectedNoStart = 0;

  for (const r of rows) {
    const title = (typeof r.Subject === 'string' ? r.Subject : '').trim();
    if (!title) {
      rejectedNoTitle++;
      continue;
    }
    const start = parseDateTime(r['Start Date'], r['Start Time']);
    if (!start) {
      rejectedNoStart++;
      continue;
    }
    const end = parseDateTime(r['End Date'], r['End Time']);
    parsed.push({
      title,
      start_time: start,
      end_time: end,
      location: typeof r.Location === 'string' && r.Location.trim() ? r.Location.trim() : null,
      participants: joinParticipants(r),
      other: {
        all_day: r['All day event'],
        description: r.Description ?? null,
        categories: r.Categories ?? null,
      },
    });
  }

  // Year breakdown for the parsed result
  const byYear = new Map<number, number>();
  for (const e of parsed) {
    const y = e.start_time.getFullYear();
    byYear.set(y, (byYear.get(y) ?? 0) + 1);
  }
  const yearLine = [...byYear.keys()].sort().map((y) => `${y}: ${byYear.get(y)}`).join(', ');
  console.log(`  parsed: ${parsed.length}  rejected_no_title=${rejectedNoTitle}  rejected_no_start=${rejectedNoStart}`);
  console.log(`  year breakdown after fixed parser: ${yearLine}`);

  // Compare to current DB state
  const buckets = await fetchYearBuckets(db, sourceId);
  console.log(`  current DB year breakdown (active / total):`);
  for (const b of buckets) console.log(`    ${b.year}: ${b.active} / ${b.total}`);

  if (!isApply(flags)) {
    console.log('  (dry-run — pass --apply to deactivate the existing events and insert the freshly parsed ones)');
    return;
  }

  // Apply: deactivate existing, insert parsed.
  await db.transaction(async (trx) => {
    const deactivated = await trx('diary_events')
      .where({ source_id: sourceId, is_active: true })
      .update({ is_active: false });
    console.log(`  deactivated ${deactivated} existing events`);

    if (parsed.length > 0) {
      const rowsToInsert = parsed.map((e) => ({
        source_id: sourceId,
        title: e.title,
        start_time: e.start_time.toISOString(),
        end_time: e.end_time ? e.end_time.toISOString() : null,
        location: e.location,
        participants: e.participants,
        dataset_name: source.name,
        is_active: true,
        ckan_row_id: null,
        other_fields: JSON.stringify({
          ...e.other,
          reimported_from_xlsx_at: new Date().toISOString(),
        }),
      }));
      await trx('diary_events').insert(rowsToInsert);
      console.log(`  inserted ${rowsToInsert.length} freshly parsed events`);
    }

    const range = await trx('diary_events')
      .where({ source_id: sourceId, is_active: true })
      .min('event_date as first_event_date')
      .max('event_date as last_event_date')
      .count('* as total_events')
      .first();
    await trx('diary_sources').where({ id: sourceId }).update({
      first_event_date: range?.first_event_date ?? null,
      last_event_date: range?.last_event_date ?? null,
      total_events: Number(range?.total_events ?? 0),
      last_sync_at: trx.fn.now(),
    });
  });
  console.log('  done.');
}

// ──────────────────────────────────────────────
// Subcommand: deactivate-year
// ──────────────────────────────────────────────

async function cmdDeactivateYear(
  db: Knex,
  sourceId: string,
  flags: Record<string, string | boolean>,
): Promise<void> {
  if (!sourceId) throw new Error('deactivate-year requires a <source-id>');
  const year = Number(flags.year);
  if (!Number.isFinite(year)) throw new Error('deactivate-year requires --year <YYYY>');

  const affected = await db('diary_events')
    .where({ source_id: sourceId, is_active: true })
    .whereRaw(`EXTRACT(YEAR FROM start_time AT TIME ZONE 'Asia/Jerusalem') = ?`, [year])
    .count<{ count: string }[]>('* as count')
    .first();
  const count = Number(affected?.count ?? 0);
  console.log(`  ${count} active event(s) in source ${sourceId} dated ${year} would be set is_active=false`);

  if (!isApply(flags)) {
    console.log('  (dry-run — pass --apply to deactivate)');
    return;
  }
  if (count === 0) {
    console.log('  nothing to deactivate; exiting');
    return;
  }

  await db.transaction(async (trx) => {
    const updated = await trx('diary_events')
      .where({ source_id: sourceId, is_active: true })
      .whereRaw(`EXTRACT(YEAR FROM start_time AT TIME ZONE 'Asia/Jerusalem') = ?`, [year])
      .update({ is_active: false });
    console.log(`  deactivated ${updated} events`);

    const range = await trx('diary_events')
      .where({ source_id: sourceId, is_active: true })
      .min('event_date as first_event_date')
      .max('event_date as last_event_date')
      .count('* as total_events')
      .first();
    await trx('diary_sources').where({ id: sourceId }).update({
      first_event_date: range?.first_event_date ?? null,
      last_event_date: range?.last_event_date ?? null,
      total_events: Number(range?.total_events ?? 0),
      last_sync_at: trx.fn.now(),
    });
  });
  console.log('  done.');
}

// ──────────────────────────────────────────────
// Entrypoint
// ──────────────────────────────────────────────

const HELP = `
Usage: npm run fix-years --workspace=server -- <subcommand> [args]

Subcommands:
  list-sources [--like <substring>]
  find-suspect [--min-year YYYY]   (default 2027 — flags far-future events)
  find-xls-sources                 (lists CKAN sources whose file is XLS/XLSX — bug candidates)
  list-pdf-uploads                 (lists committed manual_diary_uploads — re-extract candidates)
  inspect <source-id>
  re-extract <source-id> [--apply] [--provider claude|gpt4o]
  shift-year <source-id> --from YYYY --to YYYY [--apply]
  deactivate-year <source-id> --year YYYY [--apply]
  reimport-xlsx <source-id> --file <path-to-xlsx> [--apply]
  resync <source-id> [--apply]   (re-fetch from CKAN with the fixed dateParser)

All mutating subcommands are dry-run by default. Pass --apply to commit.
`.trim();

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.subcommand || args.subcommand === 'help' || args.flags.help) {
    console.log(HELP);
    return;
  }
  const db = makeDb();
  try {
    switch (args.subcommand) {
      case 'list-sources':
        await cmdListSources(db, args.flags);
        break;
      case 'find-suspect':
        await cmdFindSuspect(db, args.flags);
        break;
      case 'find-xls-sources':
        await cmdFindXlsSources(db, args.flags);
        break;
      case 'list-pdf-uploads':
        await cmdListPdfUploads(db, args.flags);
        break;
      case 'inspect':
        await cmdInspect(db, args.positional[0]);
        break;
      case 'sample-year':
        await cmdSampleYear(db, args.positional[0], args.flags);
        break;
      case 're-extract':
        await cmdReExtract(db, args.positional[0], args.flags);
        break;
      case 'shift-year':
        await cmdShiftYear(db, args.positional[0], args.flags);
        break;
      case 'deactivate-year':
        await cmdDeactivateYear(db, args.positional[0], args.flags);
        break;
      case 'reimport-xlsx':
        await cmdReimportXlsx(db, args.positional[0], args.flags);
        break;
      case 'resync':
        await cmdResync(db, args.positional[0], args.flags);
        break;
      default:
        console.error(`Unknown subcommand: ${args.subcommand}`);
        console.error(HELP);
        process.exit(2);
    }
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error('[fix-years] Failed:', err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
