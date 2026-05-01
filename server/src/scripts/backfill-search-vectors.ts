/**
 * One-time backfill: rebuild diary_events.search_vector for all existing rows
 * with the geresh-stripping logic introduced in migration 021.
 *
 * Why a script and not a migration: rebuilding ~322k tsvector rows can take
 * 10–20 minutes on Render's basic-256mb plan, exceeding Render's deploy
 * timeout. Running it as a migration blocks the deploy and gets killed
 * mid-loop, leaving the migration lock held. Decoupling backfill from
 * deploy fixes both.
 *
 * Usage (Render shell, run once after migration 021 deploys):
 *   npm run backfill:search-vectors --workspace=server
 *
 * Resumable: a temporary `_sv_geresh_v2` boolean column tracks rows that
 * have already been rebuilt, so killing/restarting the script picks up
 * where it stopped. The column + its partial index are dropped on
 * successful completion.
 */

import knex from 'knex';
import { env } from '../config/env.js';

const BATCH_SIZE = 2000;
const STRIP_GERESH = `'[״׳"'']'`;

async function main() {
  // Fresh connection — the app's pool sets statement_timeout=30s, which
  // is too tight for batch UPDATEs of tsvector. Use a bare client.
  const db = knex({
    client: 'pg',
    connection: env.DATABASE_URL,
    pool: {
      min: 1,
      max: 1,
      afterCreate(conn: { query: (sql: string, cb: (err: Error | null) => void) => void }, done: (err: Error | null, conn: unknown) => void) {
        conn.query('SET statement_timeout = 0', (err) => {
          if (err) return done(err, conn);
          conn.query('SET lock_timeout = 0', (err2) => done(err2, conn));
        });
      },
    },
  });

  try {
    console.log('[backfill] Adding marker column (idempotent)...');
    await db.raw(`
      ALTER TABLE diary_events
      ADD COLUMN IF NOT EXISTS _sv_geresh_v2 BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await db.raw(`
      CREATE INDEX IF NOT EXISTS idx_diary_events_sv_geresh_pending
      ON diary_events(id) WHERE NOT _sv_geresh_v2
    `);

    const totalRow = await db('diary_events').count<{ count: string }[]>('* as count').first();
    const total = Number(totalRow?.count ?? 0);
    console.log(`[backfill] Total events: ${total}`);

    let processed = 0;
    const startedAt = Date.now();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = await db.raw(`
        WITH batch AS (
          SELECT id FROM diary_events
          WHERE NOT _sv_geresh_v2
          LIMIT ${BATCH_SIZE}
        )
        UPDATE diary_events de
        SET
          search_vector =
            setweight(to_tsvector('hebrew', regexp_replace(COALESCE(de.title, ''), ${STRIP_GERESH}, '', 'g')), 'A') ||
            setweight(to_tsvector('hebrew', regexp_replace(COALESCE(de.location, ''), ${STRIP_GERESH}, '', 'g')), 'B') ||
            setweight(to_tsvector('hebrew', regexp_replace(COALESCE(de.participants, ''), ${STRIP_GERESH}, '', 'g')), 'B') ||
            setweight(to_tsvector('hebrew', regexp_replace(COALESCE(de.dataset_name, ''), ${STRIP_GERESH}, '', 'g')), 'C'),
          _sv_geresh_v2 = TRUE
        FROM batch
        WHERE de.id = batch.id
      `);
      const affected = (result as { rowCount?: number }).rowCount ?? 0;
      if (affected === 0) break;
      processed += affected;
      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = processed / elapsed;
      const remaining = Math.max(total - processed, 0);
      const etaSec = rate > 0 ? Math.round(remaining / rate) : 0;
      console.log(`[backfill] +${affected} rows (total ${processed}/${total}, ${rate.toFixed(0)} rows/s, ETA ${etaSec}s)`);
    }

    console.log('[backfill] Dropping marker column...');
    await db.raw('DROP INDEX IF EXISTS idx_diary_events_sv_geresh_pending');
    await db.raw('ALTER TABLE diary_events DROP COLUMN IF EXISTS _sv_geresh_v2');

    console.log(`[backfill] Done. Processed ${processed} rows in ${((Date.now() - startedAt) / 1000).toFixed(0)}s.`);
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error('[backfill] Failed:', err);
  process.exit(1);
});
