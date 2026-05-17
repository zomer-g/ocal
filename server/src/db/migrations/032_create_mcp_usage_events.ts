import type { Knex } from 'knex';

/**
 * Append-only log of every MCP tool invocation. One row per call, including
 * failures and rate-limited rejections. Aggregated nightly into mcp_usage_daily
 * for fast dashboard reads; raw rows kept for ~90 days for debugging and
 * billing reconciliation.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('mcp_usage_events', (t) => {
    t.bigIncrements('id').primary();
    t.uuid('api_user_id').notNullable().references('id').inTable('api_users').onDelete('CASCADE');
    t.uuid('client_id').references('client_id').inTable('mcp_oauth_clients').onDelete('SET NULL');
    t.text('mcp_session_id');
    t.text('tool_name').notNullable();
    t.jsonb('request_params');
    t.integer('result_count');
    t.integer('result_bytes');
    t.integer('latency_ms');
    t.text('status').notNullable().defaultTo('ok');
    t.text('error_message');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(
    `ALTER TABLE mcp_usage_events ADD CONSTRAINT mcp_usage_events_status_check CHECK (status IN ('ok', 'error', 'rate_limited'))`,
  );

  await knex.raw('CREATE INDEX idx_mcp_usage_events_user_time ON mcp_usage_events(api_user_id, created_at DESC)');
  await knex.raw('CREATE INDEX idx_mcp_usage_events_tool ON mcp_usage_events(tool_name)');
  await knex.raw('CREATE INDEX idx_mcp_usage_events_session ON mcp_usage_events(mcp_session_id)');
  await knex.raw('CREATE INDEX idx_mcp_usage_events_created ON mcp_usage_events(created_at)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('mcp_usage_events');
}
