import type { Knex } from 'knex';

/**
 * Closed-beta access list for the public MCP server. Separate from admin_users
 * so we can issue MCP credentials without granting admin UI access. Linked back
 * to the admin who invited them for audit; tier + monthly_quota are placeholders
 * for the future billing model.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('api_users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('email').notNullable().unique();
    t.text('name');
    t.text('google_id').unique();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.uuid('invited_by').references('id').inTable('admin_users').onDelete('SET NULL');
    t.text('tier').notNullable().defaultTo('beta');
    t.integer('monthly_quota').nullable();
    t.timestamp('last_seen_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(
    `ALTER TABLE api_users ADD CONSTRAINT api_users_tier_check CHECK (tier IN ('beta', 'free', 'pro'))`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('api_users');
}
