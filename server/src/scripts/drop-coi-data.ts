/**
 * One-off cleanup: drop the coi_arrangements table directly.
 *
 * Normally migration 028 handles this automatically on the next deploy.
 * This standalone script exists as a manual fallback for situations
 * where deploys are slow / queued and the data needs to be wiped
 * immediately.
 *
 * Run via Render shell:
 *   npm run drop:coi --workspace=server
 */

import knex from 'knex';
import { env } from '../config/env.js';

async function main() {
  const db = knex({
    client: 'pg',
    connection: env.DATABASE_URL,
    pool: {
      min: 1,
      max: 1,
      afterCreate(conn: { query: (sql: string, cb: (err: Error | null) => void) => void }, done: (err: Error | null, conn: unknown) => void) {
        conn.query('SET statement_timeout = 0', (err) => done(err, conn));
      },
    },
  });

  try {
    console.log('[drop-coi] dropping trigger...');
    await db.raw('DROP TRIGGER IF EXISTS trg_updated_at ON coi_arrangements');
    console.log('[drop-coi] dropping table...');
    await db.schema.dropTableIfExists('coi_arrangements');
    console.log('[drop-coi] done. coi_arrangements is gone.');
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error('[drop-coi] failed:', err);
  process.exit(1);
});
