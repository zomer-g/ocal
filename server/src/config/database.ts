import knex from 'knex';
// @ts-expect-error — pg has no bundled types, but we only need the type parser
import pg from 'pg';
import { env } from './env.js';

// Return DATE values as plain "YYYY-MM-DD" strings instead of JavaScript Date objects.
// Without this, pg converts DATE to a Date at midnight local time, which when serialized
// to JSON (UTC) shifts the date by one day for non-UTC timezones (e.g., Israel → UTC-2/3).
pg.types.setTypeParser(1082, (val: string) => val);

// Managed Postgres providers (Render, Supabase, etc.) require TLS even from
// trusted networks. Local docker-compose Postgres doesn't speak TLS at all,
// so forcing SSL there errors out the handshake. Toggle by hostname.
function needsTls(databaseUrl: string): boolean {
  try {
    const h = new URL(databaseUrl).hostname;
    return !(h === 'localhost' || h === '127.0.0.1' || h === '::1');
  } catch {
    return false;
  }
}

const tls = needsTls(env.DATABASE_URL)
  ? { rejectUnauthorized: false } // Render's cert isn't in Node's default CA bundle; matches their docs
  : false;

export const db = knex({
  client: 'pg',
  connection: { connectionString: env.DATABASE_URL, ssl: tls },
  pool: {
    min: 2,
    max: 20,
    acquireTimeoutMillis: 10_000,  // fail fast instead of waiting 60s
    afterCreate(conn: pg.Client, done: (err: Error | null, conn: pg.Client) => void) {
      conn.query('SET statement_timeout = 30000', (err: Error | null) => done(err, conn));
    },
  },
});
