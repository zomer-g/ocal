import type { Knex } from 'knex';

/**
 * OAuth 2.1 Dynamic Client Registration (RFC 7591) backing table.
 *
 * Every MCP client (Claude.ai connector, ChatGPT connector, MCP Inspector,
 * custom integrations) registers itself once and stores its allowed redirect
 * URIs here. Public clients (those without a secret, e.g. mobile/browser-based
 * MCP clients) leave client_secret_hash NULL and rely on PKCE.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('mcp_oauth_clients', (t) => {
    t.uuid('client_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.text('client_secret_hash');
    t.text('client_name').notNullable();
    t.jsonb('redirect_uris').notNullable();
    t.jsonb('grant_types').notNullable().defaultTo(knex.raw(`'["authorization_code", "refresh_token"]'::jsonb`));
    t.jsonb('response_types').notNullable().defaultTo(knex.raw(`'["code"]'::jsonb`));
    t.text('token_endpoint_auth_method').notNullable().defaultTo('none');
    t.text('scope').notNullable().defaultTo('mcp');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('mcp_oauth_clients');
}
