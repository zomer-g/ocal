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
    max: 10,
  },
});
