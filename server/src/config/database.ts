import knex from 'knex';
// @ts-expect-error — pg has no bundled types, but we only need the type parser
import pg from 'pg';
import { env } from './env.js';

// Return DATE values as plain "YYYY-MM-DD" strings instead of JavaScript Date objects.
// Without this, pg converts DATE to a Date at midnight local time, which when serialized
// to JSON (UTC) shifts the date by one day for non-UTC timezones (e.g., Israel → UTC-2/3).
pg.types.setTypeParser(1082, (val: string) => val);

export const db = knex({
  client: 'pg',
  connection: env.DATABASE_URL,
  pool: {
    min: 2,
    max: 20,
    acquireTimeoutMillis: 10_000,  // fail fast instead of waiting 60s
    afterCreate(conn: pg.Client, done: (err: Error | null, conn: pg.Client) => void) {
      conn.query('SET statement_timeout = 30000', (err: Error | null) => done(err, conn));
    },
  },
});
