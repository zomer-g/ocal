import type { Knex } from 'knex';

/**
 * Short-lived authorization codes for the OAuth 2.1 PKCE flow.
 * A row is inserted at the end of /mcp/oauth/authorize after the user signs
 * in with Google, and deleted at /mcp/oauth/token when the code is exchanged
 * (single-use). Expired rows (>10 min) are reaped by a background job.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('mcp_oauth_codes', (t) => {
    t.text('code').primary();
    t.uuid('client_id').notNullable().references('client_id').inTable('mcp_oauth_clients').onDelete('CASCADE');
    t.uuid('api_user_id').notNullable().references('id').inTable('api_users').onDelete('CASCADE');
    t.text('redirect_uri').notNullable();
    t.text('code_challenge').notNullable();
    t.text('code_challenge_method').notNullable().defaultTo('S256');
    t.text('scope').notNullable().defaultTo('mcp');
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_mcp_oauth_codes_expires ON mcp_oauth_codes(expires_at)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('mcp_oauth_codes');
}
